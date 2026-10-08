/**
 * Rechnen mit Zeitspannen.
 *
 * Reine Funktionen auf Millisekunden seit 1970 — keine Zeitzone, keine
 * Datenbank, kein Zustand. Die Slot-Berechnung besteht im Kern aus genau zwei
 * Operationen: Arbeitszeiten zusammenfassen und Blockaden abziehen. Beide hier
 * isoliert, weil sich Fehler in dieser Arithmetik sonst hinter Zeitzonen und
 * Datenbankabfragen verstecken.
 *
 * **Alle Spannen sind halboffen: `[von, bis)`.** Dieselbe Semantik wie
 * `tstzrange` in E-07. Weicht die Anwendung davon ab, behauptet sie an jeder
 * Termingrenze einen Konflikt, den die Datenbank nicht sieht — oder schlimmer,
 * sie übersieht einen, den die Datenbank sehr wohl sieht, und jede Buchung auf
 * so einen Slot endet in `409`.
 */
export interface Spanne {
  /** Beginn in Millisekunden seit 1970, einschließlich. */
  von: number;
  /** Ende in Millisekunden seit 1970, **aus**schließlich. */
  bis: number;
}

/**
 * Fasst Spannen zusammen, die sich überschneiden **oder aneinandergrenzen**.
 *
 * Das Aneinandergrenzen ist der Teil, den man leicht vergisst. Trägt das Studio
 * eine Arbeitszeit als 9–12 und 12–17 ein, sind das zwei Zeilen, aber ein
 * durchgehender Arbeitstag. Ohne Zusammenfassen entstünde an der Naht eine
 * künstliche Grenze: Eine einstündige Behandlung um 11:30 wäre nicht buchbar,
 * obwohl die Kosmetikerin durcharbeitet.
 */
export function vereinige(spannen: readonly Spanne[]): Spanne[] {
  if (spannen.length === 0) return [];

  const sortiert = [...spannen].sort((a, b) => a.von - b.von);
  const ergebnis: Spanne[] = [{ ...sortiert[0] }];

  for (const s of sortiert.slice(1)) {
    const letzte = ergebnis[ergebnis.length - 1];
    if (s.von <= letzte.bis) {
      // Überschneidet oder grenzt an: zusammenziehen.
      letzte.bis = Math.max(letzte.bis, s.bis);
    } else {
      ergebnis.push({ ...s });
    }
  }

  return ergebnis;
}

/**
 * Zieht Blockaden von freien Spannen ab.
 *
 * Eine Blockade, die mitten in einer freien Spanne liegt, zerschneidet sie in
 * zwei. Eine Blockade, die nur den Rand berührt, ändert nichts — halboffene
 * Intervalle berühren sich, ohne sich zu überschneiden.
 */
export function subtrahiere(basis: readonly Spanne[], blockaden: readonly Spanne[]): Spanne[] {
  const zusammengefasst = vereinige(blockaden);
  let offen = basis.map((s) => ({ ...s }));

  for (const blocker of zusammengefasst) {
    const naechste: Spanne[] = [];

    for (const frei of offen) {
      // Kein Überlapp: Berührung an den Rändern zählt nicht.
      if (blocker.bis <= frei.von || blocker.von >= frei.bis) {
        naechste.push(frei);
        continue;
      }

      // Stück davor, falls eines bleibt.
      if (blocker.von > frei.von) naechste.push({ von: frei.von, bis: blocker.von });
      // Stück danach, falls eines bleibt.
      if (blocker.bis < frei.bis) naechste.push({ von: blocker.bis, bis: frei.bis });
    }

    offen = naechste;
  }

  return offen;
}

/**
 * Erzeugt Startzeitpunkte im Raster.
 *
 * Das Raster hängt am `anker` — in der Anwendung an der **Ortszeit-Mitternacht**
 * des jeweiligen Tages, nicht am Anfang der freien Spanne. Wäre es am
 * Spannenanfang ausgerichtet, führte eine Abwesenheit, die um 11:20 endet, zu
 * den Startzeiten 11:20, 11:35, 11:50 — für die Kundin unerklärlich und von Tag
 * zu Tag verschieden. Am Anker ausgerichtet ist die erste Startzeit nach 11:20
 * immer 11:30.
 *
 * Ein Slot muss vollständig in die Spanne passen; `start + dauer` darf mit dem
 * Ende zusammenfallen. Der Puffer einer **neuen** Behandlung wird hier bewusst
 * nicht verlangt: Aufräumen nach Feierabend ist zumutbar, eine strukturell
 * blockierte letzte Stunde des Tages nicht.
 */
export function rasterStarts(
  spanne: Spanne,
  anker: number,
  rasterMs: number,
  dauerMs: number,
): number[] {
  if (rasterMs <= 0 || dauerMs <= 0) return [];

  // Erster Rasterpunkt, der nicht vor dem Spannenbeginn liegt.
  const schritte = Math.ceil((spanne.von - anker) / rasterMs);
  const starts: number[] = [];

  for (let t = anker + schritte * rasterMs; t + dauerMs <= spanne.bis; t += rasterMs) {
    if (t >= spanne.von) starts.push(t);
  }

  return starts;
}
