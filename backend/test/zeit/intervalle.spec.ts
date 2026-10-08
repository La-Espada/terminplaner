import { describe, expect, it } from 'vitest';
import { rasterStarts, subtrahiere, vereinige, type Spanne } from '../../src/zeit/intervalle';

/** Minuten seit einem gedachten Nullpunkt, in Millisekunden. Macht die Fälle lesbar. */
const m = (minuten: number) => minuten * 60_000;
const s = (vonMin: number, bisMin: number): Spanne => ({ von: m(vonMin), bis: m(bisMin) });

/** Zum Vergleichen: Spannen wieder in Minuten. */
const alsMinuten = (spannen: Spanne[]) => spannen.map((x) => [x.von / 60_000, x.bis / 60_000]);

describe('Intervallrechnung', () => {
  describe('vereinige', () => {
    it('laesst getrennte Spannen in Ruhe', () => {
      expect(alsMinuten(vereinige([s(0, 60), s(120, 180)]))).toEqual([
        [0, 60],
        [120, 180],
      ]);
    });

    it('zieht ueberlappende zusammen', () => {
      expect(alsMinuten(vereinige([s(0, 90), s(60, 180)]))).toEqual([[0, 180]]);
    });

    it('zieht aneinandergrenzende zusammen', () => {
      // Der Fall, den man leicht vergisst: 9-12 und 12-17 sind zwei Zeilen,
      // aber ein durchgehender Arbeitstag. Ohne Zusammenfassen entstuende an
      // der Naht eine kuenstliche Grenze.
      expect(alsMinuten(vereinige([s(0, 180), s(180, 480)]))).toEqual([[0, 480]]);
    });

    it('sortiert vorher', () => {
      expect(alsMinuten(vereinige([s(120, 180), s(0, 60)]))).toEqual([
        [0, 60],
        [120, 180],
      ]);
    });

    it('verschluckt eine vollstaendig enthaltene Spanne', () => {
      expect(alsMinuten(vereinige([s(0, 480), s(60, 120)]))).toEqual([[0, 480]]);
    });

    it('kommt mit nichts zurecht', () => {
      expect(vereinige([])).toEqual([]);
    });

    it('aendert die Eingabe nicht', () => {
      const eingabe = [s(0, 90), s(60, 180)];
      vereinige(eingabe);
      expect(alsMinuten(eingabe)).toEqual([
        [0, 90],
        [60, 180],
      ]);
    });
  });

  describe('subtrahiere', () => {
    it('zerschneidet eine Spanne in der Mitte', () => {
      expect(alsMinuten(subtrahiere([s(0, 480)], [s(180, 240)]))).toEqual([
        [0, 180],
        [240, 480],
      ]);
    });

    it('kuerzt am Anfang', () => {
      expect(alsMinuten(subtrahiere([s(0, 480)], [s(0, 120)]))).toEqual([[120, 480]]);
    });

    it('kuerzt am Ende', () => {
      expect(alsMinuten(subtrahiere([s(0, 480)], [s(400, 600)]))).toEqual([[0, 400]]);
    });

    it('loescht eine vollstaendig ueberdeckte Spanne', () => {
      expect(subtrahiere([s(60, 120)], [s(0, 480)])).toEqual([]);
    });

    it('ignoriert eine Blockade, die nur den Rand beruehrt', () => {
      // Halboffene Intervalle: [0,480) und [480,600) beruehren sich, ohne sich
      // zu ueberschneiden. Genau so sieht es auch der EXCLUDE-Constraint.
      expect(alsMinuten(subtrahiere([s(0, 480)], [s(480, 600)]))).toEqual([[0, 480]]);
      expect(alsMinuten(subtrahiere([s(480, 600)], [s(0, 480)]))).toEqual([[480, 600]]);
    });

    it('zieht mehrere Blockaden nacheinander ab', () => {
      expect(alsMinuten(subtrahiere([s(0, 480)], [s(60, 120), s(300, 360)]))).toEqual([
        [0, 60],
        [120, 300],
        [360, 480],
      ]);
    });

    it('kommt mit ueberlappenden Blockaden zurecht', () => {
      expect(alsMinuten(subtrahiere([s(0, 480)], [s(60, 180), s(120, 240)]))).toEqual([
        [0, 60],
        [240, 480],
      ]);
    });

    it('wirkt auf mehrere freie Spannen', () => {
      expect(alsMinuten(subtrahiere([s(0, 180), s(240, 480)], [s(120, 300)]))).toEqual([
        [0, 120],
        [300, 480],
      ]);
    });

    it('gibt ohne Blockade alles zurueck', () => {
      expect(alsMinuten(subtrahiere([s(0, 480)], []))).toEqual([[0, 480]]);
    });
  });

  describe('rasterStarts', () => {
    it('erzeugt Startzeiten im Raster', () => {
      // 09:00-17:00 bei 60 Minuten Dauer und 15-Minuten-Raster: letzte
      // Startzeit 16:00, also 29 Slots.
      const starts = rasterStarts(s(540, 1020), 0, m(15), m(60));
      expect(starts).toHaveLength(29);
      expect(starts[0]).toBe(m(540));
      expect(starts[starts.length - 1]).toBe(m(960));
    });

    it('laesst einen Slot genau zum Spannenende enden', () => {
      expect(rasterStarts(s(0, 60), 0, m(15), m(60))).toEqual([0]);
    });

    it('erzeugt nichts, wenn die Spanne kuerzer als die Dauer ist', () => {
      // Die 30 Minuten Rest am Tagesende muessen verschwinden, auch wenn sie
      // auf einem Rasterpunkt beginnen.
      expect(rasterStarts(s(0, 30), 0, m(15), m(60))).toEqual([]);
    });

    it('haengt das Raster am Anker, nicht am Spannenbeginn', () => {
      // Eine Abwesenheit endet um 11:20. Die erste Startzeit danach ist 11:30,
      // nicht 11:20 — sonst stuenden in der App krumme Zeiten, die sich von Tag
      // zu Tag unterscheiden.
      const starts = rasterStarts(s(680, 780), 0, m(15), m(30));
      expect(starts[0]).toBe(m(690));
    });

    it('nimmt einen Rasterpunkt, der genau auf dem Spannenbeginn liegt', () => {
      expect(rasterStarts(s(690, 780), 0, m(15), m(30))[0]).toBe(m(690));
    });

    it('kommt mit einem Anker nach dem Spannenbeginn zurecht', () => {
      // Kann vorkommen, wenn eine Spanne vor Ortsmitternacht beginnt — am
      // 25. Oktober faengt das Fenster in UTC am Vortag an.
      const starts = rasterStarts(s(-60, 60), 0, m(15), m(30));
      expect(starts[0]).toBe(m(-60));
      expect(starts).toContain(0);
    });

    it('liefert nichts bei unsinnigen Groessen', () => {
      expect(rasterStarts(s(0, 480), 0, 0, m(60))).toEqual([]);
      expect(rasterStarts(s(0, 480), 0, m(15), 0)).toEqual([]);
    });
  });
});
