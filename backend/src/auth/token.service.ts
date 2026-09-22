import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshRevokeReason, type UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenInhalt {
  /** Subject: die Benutzer-ID. */
  sub: string;
  role: UserRole;
}

export interface TokenPaar {
  accessToken: string;
  refreshToken: string;
  /** Sekunden bis zum Ablauf des Access-Tokens, für die Clients. */
  expiresIn: number;
}

/**
 * Ausgabe und Rotation von Sitzungs-Token.
 *
 * Der **Access-Token** ist ein kurzlebiges JWT (15 Minuten). Er wird nicht
 * gespeichert — seine Gültigkeit steht in ihm selbst.
 *
 * Der **Refresh-Token** lebt 30 Tage und liegt als Hash in der Datenbank. Jeder
 * Refresh gibt einen neuen aus und entwertet den alten (Rotation).
 *
 * Wird ein bereits verbrauchter Refresh-Token noch einmal vorgelegt, bedeutet
 * das fast immer, dass jemand ihn abgegriffen hat: Die legitime Sitzung hat
 * längst einen neuen. In dem Fall werden **alle** Sitzungen dieser Person
 * entwertet — lieber eine erneute Anmeldung als eine übernommene Sitzung.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Nachfrist für bereits rotierte Token.
   *
   * Ohne sie löst jede harmlose Doppelanfrage die Diebstahlerkennung aus: zwei
   * offene Tabs, ein Wiederholungsversuch nach Netzwerkabbruch, oder React im
   * Entwicklungsmodus, das Effekte doppelt ausführt. Die Sitzung wäre weg,
   * obwohl niemand etwas gestohlen hat.
   *
   * Innerhalb der Frist wird ein neues Paar ausgegeben, ohne die Familie zu
   * entwerten. Das Zeitfenster, in dem ein gestohlener Token noch wirkt, ist
   * damit auf wenige Sekunden begrenzt — ein vertretbarer Tausch gegen
   * Sitzungen, die grundlos abbrechen.
   */
  private static readonly NACHFRIST_MS = 15_000;

  private hash(klartext: string): string {
    return createHash('sha256').update(klartext).digest('hex');
  }

  private refreshGueltigkeitTage(): number {
    const roh = this.config.get<string>('JWT_REFRESH_TTL', '30d');
    const treffer = /^(\d+)d$/.exec(roh);
    return treffer ? Number(treffer[1]) : 30;
  }

  private accessGueltigkeitSekunden(): number {
    const roh = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const treffer = /^(\d+)([smhd])$/.exec(roh);
    if (!treffer) return 900;
    const faktor = { s: 1, m: 60, h: 3600, d: 86400 }[treffer[2]] ?? 60;
    return Number(treffer[1]) * faktor;
  }

  /**
   * Neues Token-Paar. `familie` verkettet alle Token einer Anmeldung —
   * beim Verdacht auf Diebstahl wird die ganze Familie entwertet.
   */
  async issuePair(userId: string, role: UserRole, familie?: string): Promise<TokenPaar> {
    const gueltigkeit = this.accessGueltigkeitSekunden();
    const inhalt: AccessTokenInhalt = { sub: userId, role };
    const accessToken = await this.jwt.signAsync(inhalt, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // Sekunden statt Zeichenkette: eine Quelle für die Gültigkeit, und der
      // Wert stimmt garantiert mit dem überein, den wir dem Client melden.
      expiresIn: gueltigkeit,
    });

    const refreshKlartext = randomBytes(32).toString('base64url');
    const familienId = familie ?? randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(refreshKlartext),
        // Die Familie steht im Gerätefeld, bis das Schema eine eigene Spalte hat.
        deviceLabel: familienId,
        expiresAt: new Date(Date.now() + this.refreshGueltigkeitTage() * 86_400_000),
      },
    });

    return { accessToken, refreshToken: refreshKlartext, expiresIn: gueltigkeit };
  }

  /**
   * Löst einen Refresh-Token ein und gibt ein neues Paar aus.
   * Liefert `null`, wenn der Token unbekannt, abgelaufen oder schon verbraucht ist.
   */
  async rotate(refreshKlartext: string): Promise<TokenPaar | null> {
    const tokenHash = this.hash(refreshKlartext);

    const vorhanden = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        deviceLabel: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
        user: { select: { role: true, status: true } },
      },
    });

    if (!vorhanden) return null;

    if (vorhanden.revokedAt !== null) {
      const alterMs = Date.now() - vorhanden.revokedAt.getTime();

      // Entscheidend: Die Nachfrist gilt NUR nach normaler Rotation. Nach einem
      // Diebstahlverdacht sind alle Token der Familie frisch entwertet und
      // fielen sonst ebenfalls in die Frist — die Entwertung waere wirkungslos.
      const nurRotiert = vorhanden.revokedReason === RefreshRevokeReason.ROTATED;

      if (
        nurRotiert &&
        alterMs <= TokenService.NACHFRIST_MS &&
        vorhanden.user.status === 'ACTIVE'
      ) {
        // Innerhalb der Nachfrist: vermutlich eine Doppelanfrage, kein Diebstahl.
        this.logger.debug('Refresh-Token innerhalb der Nachfrist erneut vorgelegt');
        return this.issuePair(
          vorhanden.userId,
          vorhanden.user.role,
          vorhanden.deviceLabel ?? undefined,
        );
      }

      // Danach: Verdacht auf Diebstahl. Die legitime Sitzung hat längst einen
      // neueren Token — wer diesen hier vorlegt, hat ihn abgegriffen.
      this.logger.warn('Verbrauchter Refresh-Token erneut vorgelegt — Familie wird entwertet');
      await this.revokeFamily(vorhanden.userId, vorhanden.deviceLabel);
      return null;
    }

    if (vorhanden.expiresAt.getTime() < Date.now()) return null;
    if (vorhanden.user.status !== 'ACTIVE') return null;

    // Atomar entwerten: Zwei gleichzeitige Anfragen mit demselben Token
    // dürfen nicht beide ein neues Paar bekommen.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: vorhanden.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: RefreshRevokeReason.ROTATED },
    });
    if (count !== 1) return null;

    return this.issuePair(
      vorhanden.userId,
      vorhanden.user.role,
      vorhanden.deviceLabel ?? undefined,
    );
  }

  /** Entwertet einen einzelnen Token (Abmeldung auf diesem Gerät). */
  async revoke(refreshKlartext: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(refreshKlartext), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: RefreshRevokeReason.LOGOUT },
    });
  }

  /** Entwertet alle Token einer Familie oder, ohne Familie, alle der Person. */
  async revokeFamily(userId: string, familie: string | null): Promise<void> {
    const jetzt = new Date();
    const auswahl = { userId, ...(familie !== null ? { deviceLabel: familie } : {}) };

    // Noch gueltige Token entwerten.
    await this.prisma.refreshToken.updateMany({
      where: { ...auswahl, revokedAt: null },
      data: { revokedAt: jetzt, revokedReason: RefreshRevokeReason.COMPROMISED },
    });

    // Und die bereits rotierten umschreiben: Sonst koennte einer von ihnen
    // ueber die Nachfrist ein neues Paar bekommen und die Sitzung wiederbeleben.
    await this.prisma.refreshToken.updateMany({
      where: { ...auswahl, revokedReason: RefreshRevokeReason.ROTATED },
      data: { revokedReason: RefreshRevokeReason.COMPROMISED },
    });
  }

  /** Entwertet jede Sitzung der Person. Nach Passwortänderung oder Sperrung. */
  async revokeAll(userId: string): Promise<void> {
    await this.revokeFamily(userId, null);
  }
}
