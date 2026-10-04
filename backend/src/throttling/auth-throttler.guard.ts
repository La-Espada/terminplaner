import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Zählt Versuche je **IP und Konto** zusammen, nicht nur je IP.
 *
 * Warum beides nötig ist:
 *
 * - **Nur nach IP**: Hinter einem gemeinsamen Anschluss — Praxis-WLAN,
 *   Mobilfunk-NAT — teilen sich viele Leute eine Adresse. Fünf Fehlversuche
 *   einer Person sperrten dann alle anderen mit aus.
 * - **Nur nach Konto**: Wer eine fremde Adresse kennt, könnte sie durch
 *   absichtliche Fehlversuche dauerhaft aussperren. Die Begrenzung würde zur
 *   Waffe gegen die rechtmäßige Inhaberin.
 *
 * Die Kombination trifft genau den Fall, um den es geht: wiederholte Versuche
 * auf *dieses eine Konto* von *dieser einen Stelle* aus.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(anfrage: Request): Promise<string> {
    const ip = anfrage.ip ?? 'unbekannt';

    // Die Kennung kommt aus dem Anfragerumpf. Welches Feld, hängt vom Endpunkt
    // ab — Anmeldung und Passwort-Reset nutzen die Adresse, der Token-Tausch hat
    // keine.
    const rumpf = anfrage.body as Record<string, unknown> | undefined;
    const roh = rumpf?.email;
    const kennung = typeof roh === 'string' && roh !== '' ? roh.trim().toLowerCase() : '-';

    // Gehasht, damit keine Adressen im Zählerspeicher landen. Redis-Schlüssel
    // tauchen in Protokollen und Werkzeugen auf; dort gehört keine Patientin hin.
    return createHash('sha256').update(`${ip}|${kennung}`).digest('hex').slice(0, 32);
  }

  /**
   * Antwort bei Überschreitung.
   *
   * Bewusst dieselbe Meldung für bekannte und unbekannte Konten: Eine
   * abweichende Formulierung wäre wieder ein Weg, Adressen durchzuprobieren —
   * genau das, was Registrierung, Login und Passwort-Reset verbergen.
   */
  protected async throwThrottlingException(): Promise<void> {
    const { ThrottlerException } = await import('@nestjs/throttler');
    throw new ThrottlerException(
      'Zu viele Versuche. Bitte warten Sie einige Minuten und versuchen Sie es erneut.',
    );
  }
}
