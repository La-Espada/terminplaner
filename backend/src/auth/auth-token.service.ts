import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuthTokenPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Einmal-Token für E-Mail-Verifizierung und Passwort-Reset.
 *
 * Grundregel: In der Datenbank liegt **nur der Hash**. Der Klartext existiert
 * genau einmal — im Link in der E-Mail. Ein Datenbankabzug erlaubt damit weder
 * Kontoübernahme noch Passwort-Reset.
 *
 * SHA-256 genügt hier, anders als beim Passwort. Der Token hat 256 Bit Entropie
 * aus einem kryptografischen Zufallsgenerator; ein Wörterbuchangriff ist
 * sinnlos, und langsames Hashing würde nur den Server bremsen.
 */
@Injectable()
export class AuthTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(klartext: string): string {
    return createHash('sha256').update(klartext).digest('hex');
  }

  /**
   * Erzeugt einen Token, speichert dessen Hash und gibt den Klartext zurück.
   * Der Klartext darf ausschließlich in die E-Mail und niemals ins Log.
   */
  async issue(
    userId: string,
    purpose: AuthTokenPurpose,
    gueltigkeitMinuten: number,
  ): Promise<string> {
    const klartext = randomBytes(32).toString('base64url');

    // Ältere, noch offene Token desselben Zwecks entwerten. Wer zweimal
    // "Passwort vergessen" klickt, soll nicht zwei gültige Links haben.
    await this.prisma.authToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: this.hashToken(klartext),
        expiresAt: new Date(Date.now() + gueltigkeitMinuten * 60_000),
      },
    });

    return klartext;
  }

  /**
   * Löst einen Token ein. Gibt die `userId` zurück oder `null`, wenn der Token
   * unbekannt, abgelaufen oder bereits verbraucht ist.
   *
   * Das Einlösen ist atomar: `updateMany` mit `usedAt: null` in der Bedingung
   * sorgt dafür, dass zwei gleichzeitige Anfragen mit demselben Token nur einmal
   * durchkommen.
   */
  async redeem(klartext: string, purpose: AuthTokenPurpose): Promise<string | null> {
    const tokenHash = this.hashToken(klartext);

    const treffer = await this.prisma.authToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
    });

    if (!treffer) return null;
    if (treffer.purpose !== purpose) return null;
    if (treffer.usedAt !== null) return null;
    if (treffer.expiresAt.getTime() < Date.now()) return null;

    const { count } = await this.prisma.authToken.updateMany({
      where: { id: treffer.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    return count === 1 ? treffer.userId : null;
  }

  /** Räumt abgelaufene Token ab. Wird später vom Aufbewahrungsjob aufgerufen. */
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.authToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }
}
