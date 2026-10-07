/**
 * Umrechnung zwischen Ortszeit des Studios und UTC.
 *
 * Gespeichert wird alles in UTC (E-06). Gepflegt und angezeigt wird alles in
 * Ortszeit — eine Kosmetikerin trägt „Montag 9 bis 17" ein und meint die Uhr an
 * der Wand, nicht einen Zeitpunkt auf dem Nullmeridian. Dazwischen liegt eine
 * Umrechnung, die zweimal im Jahr nicht trivial ist.
 *
 * **Warum nicht einfach `startUtc + (ende − start)`:** An 363 von 365 Tagen
 * stimmt das, und jeder Test von Hand bestätigt es. Am 29. März 2026 hat der Tag
 * 23 Stunden und am 25. Oktober 25 — dort liegt der Fehler dann im Produktivgang
 * und nicht in der Entwicklung. Deshalb wird der Versatz **pro Zeitpunkt**
 * bestimmt, nie einmal für einen ganzen Zeitraum.
 *
 * Absichtlich ohne Bibliothek: Gebraucht werden genau zwei Richtungen, und die
 * IANA-Datenbank steckt über `Intl` ohnehin schon in Node. Eine Abhängigkeit
 * hier wäre eine weitere Stelle, die veralten kann.
 */

/** Ortszeit in ihre Bestandteile zerlegt. `weekday`: 0 = Sonntag bis 6 = Samstag. */
export interface Ortszeit {
  jahr: number;
  monat: number;
  tag: number;
  stunde: number;
  minute: number;
  weekday: number;
  /** `YYYY-MM-DD`, wie es in der Oberfläche steht. */
  datum: string;
  /** `HH:mm`. */
  zeit: string;
}

const TEILE_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatierer(zone: string): Intl.DateTimeFormat {
  let f = TEILE_CACHE.get(zone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hour12: false,
      era: 'short',
    });
    TEILE_CACHE.set(zone, f);
  }
  return f;
}

const WOCHENTAGE: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Zerlegt einen Zeitpunkt in die Ortszeit der angegebenen Zone. */
export function alsOrtszeit(zeitpunkt: Date, zone: string): Ortszeit {
  const teile = formatierer(zone).formatToParts(zeitpunkt);
  const hole = (art: Intl.DateTimeFormatPartTypes): string =>
    teile.find((t) => t.type === art)?.value ?? '';

  // `hour` liefert bei hour12: false je nach Umgebung "24" statt "00" für
  // Mitternacht. Das ist kein Fehler der Zone, sondern eine Eigenart der
  // Formatierung, und würde unbemerkt einen Tag verschieben.
  const stunde = Number(hole('hour')) % 24;
  const jahr = Number(hole('year'));

  return {
    jahr,
    monat: Number(hole('month')),
    tag: Number(hole('day')),
    stunde,
    minute: Number(hole('minute')),
    weekday: WOCHENTAGE[hole('weekday')] ?? 0,
    datum: `${String(jahr).padStart(4, '0')}-${hole('month')}-${hole('day')}`,
    zeit: `${String(stunde).padStart(2, '0')}:${hole('minute')}`,
  };
}

/**
 * Versatz der Zone zu UTC an diesem Zeitpunkt, in Minuten.
 *
 * Positiv östlich von Greenwich: Für Wien im Sommer 120, im Winter 60.
 */
export function versatzMinuten(zeitpunkt: Date, zone: string): number {
  const teile = formatierer(zone).formatToParts(zeitpunkt);
  const hole = (art: Intl.DateTimeFormatPartTypes): number =>
    Number(teile.find((t) => t.type === art)?.value ?? '0');

  const alsWaereEsUtc = Date.UTC(
    hole('year'),
    hole('month') - 1,
    hole('day'),
    hole('hour') % 24,
    hole('minute'),
    hole('second'),
  );

  // Auf ganze Minuten runden: Sekunden hat kein heute gültiger Versatz, aber
  // historische Zonen vor 1900 schon. Ohne das Runden entstünden Krümel.
  return Math.round((alsWaereEsUtc - zeitpunkt.getTime()) / 60_000);
}

/**
 * Ortszeit zu UTC.
 *
 * Zweistufig, weil die Frage sich selbst in den Schwanz beißt: Um den Versatz zu
 * kennen, braucht man den Zeitpunkt, und um den Zeitpunkt zu kennen, den
 * Versatz. Der erste Durchgang rät, der zweite korrigiert anhand des Versatzes,
 * der dort tatsächlich gilt.
 *
 * **Zweimal im Jahr ist die Eingabe nicht eindeutig:**
 *
 * - *Umstellung vorwärts* (29. März 2026, 02:00 wird zu 03:00): `02:30` gibt es
 *   nicht. Das Ergebnis ist dann `03:30` Ortszeit — die Uhr wird mitgenommen.
 *   Eine Ausnahme zu werfen wäre strenger, aber in der Praxis schädlich: Es
 *   würde bedeuten, dass eine Arbeitszeit „02:00 bis 06:00" an genau einem Tag
 *   im Jahr einen Fehler auslöst, statt eine Stunde kürzer zu sein.
 * - *Umstellung rückwärts* (25. Oktober 2026, 03:00 wird zu 02:00): `02:30` gibt
 *   es zweimal. Geliefert wird das **erste** Vorkommen, also noch in der
 *   Sommerzeit. Das ist die Lesart, die auch Menschen anwenden: Wer „halb drei"
 *   sagt, meint beim ersten Mal.
 *
 * Beide Fälle betreffen nachts; eine Praxis hat dann zu. Sie treten trotzdem auf
 * — über die Tagesgrenzen eines Abfragezeitraums.
 */
export function ortszeitZuUtc(
  jahr: number,
  monat: number,
  tag: number,
  stunde: number,
  minute: number,
  zone: string,
): Date {
  const gewuenscht = Date.UTC(jahr, monat - 1, tag, stunde, minute, 0, 0);

  // Die beiden Versaetze, die rund um diesen Zeitpunkt gelten koennen. Ein Tag
  // Abstand in jede Richtung umschliesst jede Umstellung sicher; ein Versatz
  // ist nie 24 Stunden gross, also kann keine dazwischenliegende Umstellung
  // uebersehen werden. An normalen Tagen sind beide gleich.
  const davor = versatzMinuten(new Date(gewuenscht - 86_400_000), zone);
  const danach = versatzMinuten(new Date(gewuenscht + 86_400_000), zone);

  const kandidaten = [...new Set([davor, danach])]
    .map((v) => new Date(gewuenscht - v * 60_000))
    .sort((a, b) => a.getTime() - b.getTime());

  // Welcher Kandidat ergibt vor Ort wirklich die gewuenschte Uhrzeit?
  const treffer = kandidaten.filter((k) => {
    const o = alsOrtszeit(k, zone);
    return o.stunde === stunde && o.minute === minute && o.tag === tag && o.monat === monat;
  });

  // Zweideutig (Uhr zurueckgestellt, die Ortszeit gibt es zweimal): das erste
  // Vorkommen. Das ist die Lesart, die auch Menschen anwenden, und die
  // Vorgabe von Temporal und java.time.
  if (treffer.length > 0) return treffer[0];

  // Gar kein Treffer heisst: Die Ortszeit gibt es nicht, sie faellt in die
  // uebersprungene Stunde. Dann die Uhr mitnehmen und hinter den Sprung
  // ruecken — der spaetere Kandidat.
  return kandidaten[kandidaten.length - 1];
}

/** Wie `ortszeitZuUtc`, aber mit `YYYY-MM-DD` und `HH:mm`. */
export function ortsangabeZuUtc(datum: string, zeit: string, zone: string): Date {
  const [jahr, monat, tag] = datum.split('-').map(Number);
  const [stunde, minute] = zeit.split(':').map(Number);
  return ortszeitZuUtc(jahr, monat, tag, stunde, minute, zone);
}

/**
 * Beginn eines Ortstages in UTC, also Mitternacht vor Ort.
 *
 * Wichtiger als es aussieht: In der Sommerzeit beginnt der Wiener Tag um 22:00
 * UTC des Vortags. Wer stattdessen die UTC-Mitternacht nimmt, verliert die
 * ersten zwei Stunden des Tages und nimmt zwei vom nächsten dazu.
 */
export function tagesbeginn(datum: string, zone: string): Date {
  return ortsangabeZuUtc(datum, '00:00', zone);
}

/**
 * Ende eines Ortstages in UTC, also Mitternacht des Folgetags.
 *
 * Gerechnet über das Kalenderdatum, **nicht** über `+ 24 Stunden`. Der
 * 25. Oktober 2026 hat in Wien 25 Stunden, der 29. März 23.
 */
export function tagesende(datum: string, zone: string): Date {
  const [jahr, monat, tag] = datum.split('-').map(Number);
  // Über Date.UTC, damit der Monats- und Jahreswechsel mitgerechnet wird.
  const naechster = new Date(Date.UTC(jahr, monat - 1, tag + 1));
  return ortszeitZuUtc(
    naechster.getUTCFullYear(),
    naechster.getUTCMonth() + 1,
    naechster.getUTCDate(),
    0,
    0,
    zone,
  );
}

/** Zählt die Ortstage von `von` bis `bis`, beide einschließlich, als `YYYY-MM-DD`. */
export function tageZwischen(von: string, bis: string): string[] {
  const [vj, vm, vt] = von.split('-').map(Number);
  const ende = bis;
  const tage: string[] = [];

  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(vj, vm - 1, vt + i));
    const datum = d.toISOString().slice(0, 10);
    if (datum > ende) break;
    tage.push(datum);
  }

  return tage;
}
