import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokenPurpose, Prisma } from '@prisma/client';
import { AuthTokenService } from '../auth/auth-token.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { KosmetikerinAendernDto, KosmetikerinAnlegenDto } from './dto/kosmetikerin.dto';

/** Gültigkeit der Einladung. Großzügiger als ein Passwort-Reset — wer neu
 *  anfängt, schaut nicht unbedingt am selben Tag in sein Postfach. */
const EINLADUNG_GUELTIG_TAGE = 7;
const EINLADUNG_GUELTIG_MINUTEN = EINLADUNG_GUELTIG_TAGE * 24 * 60;

export interface Kosmetikerin {
  id: string;
  userId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  bio: string | null;
  colorHex: string | null;
  isActive: boolean;
  /** Hat die Person ihr Passwort schon vergeben? */
  zugangAktiv: boolean;
  /** Läuft noch eine offene Einladung? */
  einladungOffen: boolean;
  leistungAnzahl: number;
  terminAnzahl: number;
}

/** Was die Kundschaft sieht. Deutlich weniger als die Verwaltungssicht. */
export interface OeffentlicheKosmetikerin {
  id: string;
  displayName: string;
  bio: string | null;
  photoUrl: string | null;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwoerter: PasswordService,
    private readonly einmalToken: AuthTokenService,
    private readonly sitzungen: TokenService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Das Team, wie es die Kundschaft sieht.
   *
   * Bewusst kurz gehalten: Anzeigename, Vorstellungstext, Farbe. Nachname,
   * E-Mail-Adresse und Telefonnummer sind Beschaeftigtendaten und gehen die
   * Kundschaft nichts an (Grundsatz der Datenminimierung, Art. 5 Abs. 1 lit. c).
   *
   * Wer die Einladung noch nicht eingeloest hat, erscheint hier nicht. Sonst
   * koennte die Kundschaft bei jemandem buchen, der seinen eigenen Kalender
   * noch gar nicht oeffnen kann.
   */
  async oeffentlicheListe(): Promise<OeffentlicheKosmetikerin[]> {
    const zeilen = await this.prisma.staffProfile.findMany({
      where: {
        isActive: true,
        user: { status: 'ACTIVE', emailVerifiedAt: { not: null } },
      },
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true, bio: true, photoUrl: true },
    });

    return zeilen.map((z) => ({
      id: z.id,
      displayName: z.displayName,
      bio: z.bio,
      photoUrl: z.photoUrl,
    }));
  }

  async liste(): Promise<Kosmetikerin[]> {
    const zeilen = await this.prisma.staffProfile.findMany({
      orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
            emailVerifiedAt: true,
            authTokens: {
              where: { purpose: AuthTokenPurpose.INVITATION, usedAt: null },
              select: { expiresAt: true },
            },
          },
        },
        _count: { select: { services: true, appointments: true } },
      },
    });

    return zeilen.map((z) => ({
      id: z.id,
      userId: z.user.id,
      displayName: z.displayName,
      firstName: z.user.firstName,
      lastName: z.user.lastName,
      email: z.user.email,
      phone: z.user.phone,
      bio: z.bio,
      colorHex: z.colorHex,
      isActive: z.isActive,
      zugangAktiv: z.user.status === 'ACTIVE' && z.user.emailVerifiedAt !== null,
      einladungOffen: z.user.authTokens.some((t) => t.expiresAt.getTime() > Date.now()),
      leistungAnzahl: z._count.services,
      terminAnzahl: z._count.appointments,
    }));
  }

  /**
   * Legt ein Konto an und lädt per Mail ein.
   *
   * **Die Studioleitung vergibt kein Passwort.** Das Konto bekommt einen
   * zufälligen Hash, mit dem sich niemand anmelden kann, und die eingeladene
   * Person setzt über den Link ihr eigenes. So kennt es niemand sonst — das ist
   * nicht nur sauberer, sondern vermeidet auch die Situation, dass ein Passwort
   * mündlich oder per Chat weitergereicht wird.
   */
  async anlegen(dto: KosmetikerinAnlegenDto): Promise<Kosmetikerin> {
    const vorhanden = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, role: true },
    });

    if (vorhanden !== null) {
      // Hier ist eine klare Meldung richtig: Die Studioleitung verwaltet ihr
      // eigenes Team und darf wissen, dass die Adresse schon vergeben ist.
      throw new ConflictException(
        'Diese E-Mail-Adresse wird bereits verwendet. Jede Person braucht eine eigene Adresse.',
      );
    }

    // Unbrauchbares Passwort: lang, zufällig, niemandem bekannt.
    const platzhalter = await this.passwoerter.hashPassword(randomBytes(32).toString('base64url'));

    const profil = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash: platzhalter,
          role: 'STAFF',
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone ?? null,
          // Noch nicht bestätigt — das geschieht beim Einlösen der Einladung.
          emailVerifiedAt: null,
        },
        select: { id: true },
      });

      return tx.staffProfile.create({
        data: {
          userId: user.id,
          displayName: dto.displayName ?? dto.firstName,
          bio: dto.bio ?? null,
          colorHex: dto.colorHex ?? null,
          isActive: true,
        },
        select: { id: true },
      });
    });

    await this.einladungVersenden(profil.id);
    this.logger.log('Kosmetiker:in angelegt und eingeladen');
    return this.einzeln(profil.id);
  }

  /** Verschickt die Einladung erneut. Entwertet dabei die vorige. */
  async einladungVersenden(profilId: string): Promise<void> {
    const profil = await this.prisma.staffProfile.findUnique({
      where: { id: profilId },
      select: { user: { select: { id: true, email: true, firstName: true } } },
    });

    if (profil === null) throw new NotFoundException('Kosmetiker:in nicht gefunden.');

    const klartext = await this.einmalToken.issue(
      profil.user.id,
      AuthTokenPurpose.INVITATION,
      EINLADUNG_GUELTIG_MINUTEN,
    );

    // ADMIN_BASE_URL, nicht APP_BASE_URL: Die Einladung fuehrt ins Admin-Web,
    // wo das Passwort vergeben wird. APP_BASE_URL zeigt auf das Backend.
    const basis = this.config.get<string>('ADMIN_BASE_URL', 'http://localhost:5173');
    const link = `${basis}/einladung?token=${encodeURIComponent(klartext)}`;

    await this.mail.sendInvitationMail(
      profil.user.email,
      profil.user.firstName,
      'Dermazentrum Siebenhirten',
      link,
      EINLADUNG_GUELTIG_TAGE,
    );
  }

  async aendern(profilId: string, dto: KosmetikerinAendernDto): Promise<Kosmetikerin> {
    const profil = await this.prisma.staffProfile.findUnique({
      where: { id: profilId },
      select: { userId: true },
    });
    if (profil === null) throw new NotFoundException('Kosmetiker:in nicht gefunden.');

    await this.prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { id: profilId },
        data: {
          ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
          ...(dto.bio !== undefined ? { bio: dto.bio || null } : {}),
          ...(dto.colorHex !== undefined ? { colorHex: dto.colorHex || null } : {}),
        },
      });

      const nutzerFelder = {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
      };
      if (Object.keys(nutzerFelder).length > 0) {
        await tx.user.update({ where: { id: profil.userId }, data: nutzerFelder });
      }
    });

    return this.einzeln(profilId);
  }

  /**
   * Aktiv oder nicht.
   *
   * Beides zusammen, bewusst: Wer nicht mehr im Studio arbeitet, soll weder
   * buchbar sein noch sich anmelden können. Zwei getrennte Schalter wären
   * genauer, würden aber die häufigste Absicht in zwei Schritte zerlegen — und
   * die Gefahr bergen, dass einer vergessen wird.
   *
   * Beim Deaktivieren fliegen alle Sitzungen raus. Sonst arbeitet jemand mit
   * einem offenen Browserfenster noch bis zu 15 Minuten weiter.
   */
  async aktivSetzen(profilId: string, aktiv: boolean): Promise<Kosmetikerin> {
    const profil = await this.prisma.staffProfile.findUnique({
      where: { id: profilId },
      select: { userId: true },
    });
    if (profil === null) throw new NotFoundException('Kosmetiker:in nicht gefunden.');

    await this.prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({ where: { id: profilId }, data: { isActive: aktiv } });
      await tx.user.update({
        where: { id: profil.userId },
        data: { status: aktiv ? 'ACTIVE' : 'BLOCKED' },
      });
    });

    if (!aktiv) {
      await this.sitzungen.revokeAll(profil.userId);
      this.logger.log('Kosmetiker:in deaktiviert, alle Sitzungen entwertet');
    }

    return this.einzeln(profilId);
  }

  /**
   * Löschen — nur solange niemand bei dieser Person einen Termin hatte.
   *
   * Wie bei den Leistungen: Ein vergangener Termin sagt aus, wer behandelt hat.
   * Das gehört zur Dokumentation und darf nicht verschwinden.
   */
  async loeschen(profilId: string): Promise<void> {
    const profil = await this.prisma.staffProfile.findUnique({
      where: { id: profilId },
      include: { _count: { select: { appointments: true } }, user: { select: { id: true } } },
    });

    if (profil === null) throw new NotFoundException('Kosmetiker:in nicht gefunden.');

    if (profil._count.appointments > 0) {
      throw new ConflictException(
        `Bei dieser Person wurden bereits ${profil._count.appointments} Termine gebucht. ` +
          'Ein Löschen würde unkenntlich machen, wer behandelt hat. ' +
          'Deaktivieren Sie sie stattdessen — dann ist sie nicht mehr buchbar und kann sich ' +
          'nicht mehr anmelden, die Termingeschichte bleibt aber nachvollziehbar.',
      );
    }

    try {
      // Das Profil hängt per Cascade am Konto, also reicht es, das Konto zu löschen.
      await this.prisma.user.delete({ where: { id: profil.user.id } });
      this.logger.log('Kosmetiker:in gelöscht');
    } catch (fehler) {
      if (fehler instanceof Prisma.PrismaClientKnownRequestError && fehler.code === 'P2003') {
        throw new ConflictException(
          'Diese Person ist inzwischen mit Daten verknüpft und kann nicht gelöscht werden.',
        );
      }
      throw fehler;
    }
  }

  async einzeln(profilId: string): Promise<Kosmetikerin> {
    const alle = await this.liste();
    const treffer = alle.find((k) => k.id === profilId);
    if (treffer === undefined) throw new NotFoundException('Kosmetiker:in nicht gefunden.');
    return treffer;
  }
}
