import { ConsentType } from '@prisma/client';

/**
 * Welche Einwilligungen es gibt, in welcher Fassung, und was für sie gilt.
 *
 * **Einzige Quelle** für Versionsnummern. Ändert sich ein Text, wird die Nummer
 * hier erhöht — danach meldet `GET /me/consents` für alle Betroffenen, dass eine
 * Erneuerung nötig ist.
 *
 * Wichtig: Ohne ein Archiv der Textfassungen ist die Nummer wertlos. Niemand
 * kann später belegen, wozu „Version 1.0" eigentlich eingewilligt hat. Das
 * Archiv anzulegen steht in `docs/CHECKLISTE.md` und ist noch offen.
 */
export interface ConsentDefinition {
  typ: ConsentType;
  /** Fassung des Textes, der aktuell gilt. */
  version: string;
  /** Kurzbeschreibung für die Oberfläche. */
  bezeichnung: string;
  /**
   * Pflicht für die Nutzung. Pflicht-Einwilligungen lassen sich nicht über
   * diesen Weg widerrufen — ein Widerruf bedeutet, den Dienst nicht mehr nutzen
   * zu wollen, und das ist eine Kontolöschung.
   */
  pflicht: boolean;
  /** Rechtsgrundlage, zur Nachvollziehbarkeit im Verarbeitungsverzeichnis. */
  grundlage: string;
}

export const CONSENT_KATALOG: readonly ConsentDefinition[] = [
  {
    typ: ConsentType.TOS,
    version: '1.0',
    bezeichnung: 'Allgemeine Geschäftsbedingungen',
    pflicht: true,
    grundlage: 'Art. 6 Abs. 1 lit. b – Vertragserfüllung',
  },
  {
    typ: ConsentType.PRIVACY,
    version: '1.0',
    bezeichnung: 'Datenschutzerklärung',
    pflicht: true,
    grundlage: 'Art. 6 Abs. 1 lit. b – Vertragserfüllung',
  },
  {
    typ: ConsentType.HEALTH_DATA,
    version: '1.0',
    bezeichnung: 'Verarbeitung von Gesundheitsdaten (Behandlungsnotizen)',
    pflicht: false,
    grundlage: 'Art. 9 Abs. 2 lit. a – ausdrückliche Einwilligung',
  },
  {
    typ: ConsentType.MARKETING,
    version: '1.0',
    bezeichnung: 'Angebote und Neuigkeiten per E-Mail',
    pflicht: false,
    grundlage: 'Art. 6 Abs. 1 lit. a – Einwilligung',
  },
  {
    typ: ConsentType.PUSH,
    version: '1.0',
    bezeichnung: 'Terminerinnerungen auf das Mobilgerät',
    pflicht: false,
    grundlage: 'Art. 6 Abs. 1 lit. a – Einwilligung',
  },
] as const;

export function definition(typ: ConsentType): ConsentDefinition {
  const treffer = CONSENT_KATALOG.find((d) => d.typ === typ);
  if (treffer === undefined) {
    throw new Error(`Unbekannter Einwilligungstyp: ${typ}`);
  }
  return treffer;
}

/** Fassung, die bei der Registrierung protokolliert wird. */
export function aktuelleVersion(typ: ConsentType): string {
  return definition(typ).version;
}
