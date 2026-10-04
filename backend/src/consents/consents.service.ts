import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConsentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CONSENT_KATALOG, definition } from './consent-katalog';

export interface ConsentZustand {
  typ: ConsentType;
  bezeichnung: string;
  grundlage: string;
  pflicht: boolean;
  /** Gilt die Einwilligung gerade? */
  erteilt: boolean;
  /** Fassung, der zugestimmt wurde. `null`, wenn nie entschieden. */
  version: string | null;
  /** Fassung, die aktuell gilt. */
  aktuelleVersion: string;
  /**
   * Der Text hat sich seit der Zustimmung geändert — es muss neu eingeholt
   * werden (Art. 7 Abs. 1).
   */
  erneuerungNoetig: boolean;
  entschiedenAm: Date | null;
  widerrufenAm: Date | null;
}

/**
 * Einwilligungen verwalten.
 *
 * **Die Tabelle ist ein Protokoll, kein Zustand.** Jede Entscheidung hängt eine
 * neue Zeile an, nichts wird überschrieben. Nur so lässt sich später belegen,
 * wer wann wozu eingewilligt und wann widerrufen hat — genau das verlangt die
 * Nachweispflicht aus Art. 7 Abs. 1.
 *
 * Der aktuelle Stand ist jeweils die jüngste Zeile je Typ.
 */
@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Aktueller Stand aller Einwilligungen dieser Person. */
  async zustand(userId: string): Promise<ConsentZustand[]> {
    const zeilen = await this.prisma.consent.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
    });

    return CONSENT_KATALOG.map((def) => {
      // Jüngste Zeile für diesen Typ — die Liste ist schon absteigend sortiert.
      const juengste = zeilen.find((z) => z.type === def.typ);

      const erteilt = juengste?.granted === true && juengste.revokedAt === null;

      return {
        typ: def.typ,
        bezeichnung: def.bezeichnung,
        grundlage: def.grundlage,
        pflicht: def.pflicht,
        erteilt,
        version: juengste?.version ?? null,
        aktuelleVersion: def.version,
        // Nur erteilte Einwilligungen können veralten. Wer nie zugestimmt hat,
        // braucht keine Erneuerung, sondern eine Erstentscheidung.
        erneuerungNoetig: erteilt && juengste.version !== def.version,
        entschiedenAm: juengste?.grantedAt ?? null,
        widerrufenAm: juengste?.revokedAt ?? null,
      };
    });
  }

  /**
   * Entscheidung ändern.
   *
   * Pflicht-Einwilligungen lassen sich hier nicht widerrufen. Ein Widerruf der
   * AGB oder Datenschutzerklärung bedeutet, den Dienst nicht mehr nutzen zu
   * wollen — das ist eine Kontolöschung und läuft über `DELETE /me`. Ein
   * stillschweigendes „geht nicht" wäre irreführend, deshalb eine klare Meldung.
   */
  async entscheiden(
    userId: string,
    typ: ConsentType,
    erteilen: boolean,
    ipHash?: string,
  ): Promise<ConsentZustand[]> {
    const def = definition(typ);

    if (def.pflicht && !erteilen) {
      throw new BadRequestException(
        `Die Einwilligung „${def.bezeichnung}“ ist für die Nutzung erforderlich und kann ` +
          'nicht einzeln widerrufen werden. Wenn Sie nicht mehr zustimmen möchten, löschen ' +
          'Sie bitte Ihr Konto.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const jetzt = new Date();

      // Die bisher gültige Zeile als beendet markieren. Sie bleibt stehen —
      // der Nachweis, dass eingewilligt *war*, muss den Widerruf überleben.
      await tx.consent.updateMany({
        where: { userId, type: typ, granted: true, revokedAt: null },
        data: { revokedAt: jetzt },
      });

      // Neue Entscheidung anhängen.
      await tx.consent.create({
        data: {
          userId,
          type: typ,
          version: def.version,
          granted: erteilen,
          grantedAt: jetzt,
          // Ein Widerruf ist von Anfang an nicht gültig — sonst sähe er in der
          // Auswertung wie eine erteilte Einwilligung aus.
          revokedAt: erteilen ? null : jetzt,
          ipHash: ipHash ?? null,
        },
      });
    });

    // Absichtlich ohne Benutzer-ID und ohne Adresse im Log.
    this.logger.log(`Einwilligung ${typ} ${erteilen ? 'erteilt' : 'widerrufen'}`);

    if (typ === ConsentType.HEALTH_DATA && !erteilen) {
      // Der Widerruf hat Folgen über das Protokoll hinaus: Die
      // Behandlungsnotizen dürfen danach nicht mehr verarbeitet werden.
      // Umgesetzt wird das mit Stufe 9, hier nur vermerkt.
      this.logger.warn(
        'Einwilligung für Gesundheitsdaten widerrufen — Behandlungsnotizen sind ab sofort ' +
          'zu sperren (Umsetzung in Stufe 9).',
      );
    }

    return this.zustand(userId);
  }

  /**
   * Gilt eine bestimmte Einwilligung gerade?
   *
   * Von anderen Diensten verwendet, etwa bevor Gesundheitsdaten erfasst werden.
   * Eine veraltete Fassung zählt **nicht** als erteilt — sonst würde eine
   * geänderte Datenschutzerklärung stillschweigend mit der alten Zustimmung
   * weiterlaufen.
   */
  async gilt(userId: string, typ: ConsentType): Promise<boolean> {
    const alle = await this.zustand(userId);
    const eintrag = alle.find((e) => e.typ === typ);
    return eintrag?.erteilt === true && !eintrag.erneuerungNoetig;
  }
}
