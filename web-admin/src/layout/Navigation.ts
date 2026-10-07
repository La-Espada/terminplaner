import type { Rolle } from '../auth/SitzungsKontext';

export interface MenuPunkt {
  pfad: string;
  titel: string;
  /** Wer darf das sehen? Leer bedeutet: jede angemeldete Person. */
  rollen?: Rolle[];
  /** Noch nicht gebaut — wird ausgegraut statt versteckt. */
  kommtNoch?: boolean;
}

/**
 * Die Navigation des Admin-Webs.
 *
 * **Punkte, die es noch nicht gibt, werden ausgegraut gezeigt statt versteckt.**
 * So sieht die Studioleitung von Anfang an, wohin die Reise geht, und fragt
 * nicht, ob etwas vergessen wurde. Sobald ein Schritt fertig ist, fällt hier
 * ein `kommtNoch` weg.
 *
 * Die Rollen hier steuern nur, was sichtbar ist. Durchgesetzt werden sie im
 * Backend — siehe docs/ENTSCHEIDUNGEN.md E-27.
 */
export const MENUE: readonly MenuPunkt[] = [
  { pfad: '/', titel: 'Übersicht' },
  { pfad: '/kalender', titel: 'Kalender', kommtNoch: true },
  { pfad: '/termine', titel: 'Termine', kommtNoch: true },
  { pfad: '/leistungen', titel: 'Leistungen', rollen: ['ADMIN'], kommtNoch: true },
  { pfad: '/team', titel: 'Kosmetiker:innen', rollen: ['ADMIN'], kommtNoch: true },
  { pfad: '/arbeitszeiten', titel: 'Arbeitszeiten', kommtNoch: true },
  { pfad: '/kundinnen', titel: 'Kundinnen', kommtNoch: true },
  { pfad: '/auswertung', titel: 'Auswertung', rollen: ['ADMIN'], kommtNoch: true },
  { pfad: '/protokoll', titel: 'Zugriffsprotokoll', rollen: ['ADMIN'], kommtNoch: true },
] as const;

export function sichtbareMenuePunkte(rolle: Rolle | undefined): MenuPunkt[] {
  if (rolle === undefined) return [];
  return MENUE.filter((p) => p.rollen === undefined || p.rollen.includes(rolle));
}
