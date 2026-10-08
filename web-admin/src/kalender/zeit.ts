/**
 * Zeitrechnung für den Kalender, in der Zeitzone des Studios.
 *
 * Der Browser steht vielleicht in einer anderen Zone als das Studio — jemand
 * ruft den Kalender aus dem Urlaub ab, oder das Betriebssystem steht falsch.
 * Der Kalender muss trotzdem die Wiener Wanduhr zeigen, sonst steht ein Termin
 * um 09:00 plötzlich um 08:00 im Raster.
 *
 * Deshalb läuft hier **nichts** über `getHours()` und Verwandte. `Intl` kennt
 * die Zonendatenbank und wird nicht müde.
 */

export const STUDIO_ZONE = 'Europe/Vienna';

const teileFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export interface Ortszeit {
  /** `YYYY-MM-DD`. */
  datum: string;
  /** `HH:mm`. */
  zeit: string;
  /** Minuten seit Ortsmitternacht. Die Koordinate im Raster. */
  minuten: number;
  /** 0 = Sonntag bis 6 = Samstag. */
  weekday: number;
}

export function ortszeit(zeitpunkt: Date | string): Ortszeit {
  const d = typeof zeitpunkt === 'string' ? new Date(zeitpunkt) : zeitpunkt;
  const teile = teileFormat.formatToParts(d);
  const hole = (art: string) => teile.find((t) => t.type === art)?.value ?? '';

  // `hour` kann bei hour12: false je nach Umgebung "24" statt "00" liefern.
  const stunde = Number(hole('hour')) % 24;
  const minute = Number(hole('minute'));
  const datum = `${hole('year')}-${hole('month')}-${hole('day')}`;

  return {
    datum,
    zeit: `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minuten: stunde * 60 + minute,
    weekday: new Date(`${datum}T12:00:00Z`).getUTCDay(),
  };
}

/** Heute, als Ortsdatum des Studios. */
export function heute(): string {
  return ortszeit(new Date()).datum;
}

/** Verschiebt ein `YYYY-MM-DD` um Tage. Rechnet über das Kalenderdatum, nicht über Millisekunden. */
export function plusTage(datum: string, tage: number): string {
  const [j, m, t] = datum.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t + tage)).toISOString().slice(0, 10);
}

/** Der Montag der Woche, in der dieses Datum liegt. */
export function wochenbeginn(datum: string): string {
  const wochentag = new Date(`${datum}T12:00:00Z`).getUTCDay();
  // Sonntag (0) gehört zur Woche davor.
  return plusTage(datum, wochentag === 0 ? -6 : 1 - wochentag);
}

/** Der Erste des Monats. */
export function monatsbeginn(datum: string): string {
  return `${datum.slice(0, 7)}-01`;
}

/** Der Letzte des Monats. */
export function monatsende(datum: string): string {
  const [j, m] = datum.split('-').map(Number);
  return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONATE = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** `Do, 1. Oktober 2026`. */
export function langesDatum(datum: string): string {
  const [j, m, t] = datum.split('-').map(Number);
  const wochentag = WOCHENTAGE[new Date(`${datum}T12:00:00Z`).getUTCDay()];
  return `${wochentag}, ${t}. ${MONATE[m - 1]} ${j}`;
}

/** `1. Okt.` */
export function kurzesDatum(datum: string): string {
  const [, m, t] = datum.split('-').map(Number);
  return `${t}. ${MONATE[m - 1].slice(0, 3)}.`;
}

export function monatsName(datum: string): string {
  const [j, m] = datum.split('-').map(Number);
  return `${MONATE[m - 1]} ${j}`;
}

export function wochentagKurz(datum: string): string {
  return WOCHENTAGE[new Date(`${datum}T12:00:00Z`).getUTCDay()];
}

/**
 * Macht aus Ortsdatum und Minuten seit Mitternacht einen Zeitpunkt.
 *
 * Nötig fürs Verschieben per Maus: Das Raster liefert eine Position, der Server
 * braucht einen Zeitpunkt. Zweistufig wie im Backend, weil die Umrechnung sich
 * selbst in den Schwanz beisst — um den Versatz zu kennen, braucht man den
 * Zeitpunkt.
 */
export function zuZeitpunkt(datum: string, minutenAbMitternacht: number): Date {
  const [j, m, t] = datum.split('-').map(Number);
  const stunde = Math.floor(minutenAbMitternacht / 60);
  const minute = minutenAbMitternacht % 60;
  const geraten = Date.UTC(j, m - 1, t, stunde, minute);

  const versatz = (zeitpunkt: number) => {
    const o = ortszeit(new Date(zeitpunkt));
    const [oj, om, ot] = o.datum.split('-').map(Number);
    return Date.UTC(oj, om - 1, ot, 0, 0) + o.minuten * 60_000 - zeitpunkt;
  };

  const ersterVersatz = versatz(geraten);
  const treffer = geraten - ersterVersatz;
  const zweiterVersatz = versatz(treffer);

  return new Date(zweiterVersatz === ersterVersatz ? treffer : geraten - zweiterVersatz);
}
