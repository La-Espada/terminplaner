import { describe, expect, it } from 'vitest';
import {
  alsOrtszeit,
  ortsangabeZuUtc,
  tageZwischen,
  tagesbeginn,
  tagesende,
  versatzMinuten,
} from '../../src/zeit/zeitzone';

const WIEN = 'Europe/Vienna';

/**
 * Zeitzonenrechnung.
 *
 * Reine Funktionen, keine Datenbank — deshalb schnell und ohne Aufräumen. Diese
 * Datei ist das Fundament für die Slot-Berechnung in Schritt 21; geht hier etwas
 * schief, wird es dort in drei Oberflächen gleichzeitig sichtbar.
 *
 * Die Umstellungstermine 2026 sind der letzte Sonntag im März (29. März) und der
 * letzte Sonntag im Oktober (25. Oktober).
 */
describe('Zeitzone', () => {
  describe('Versatz', () => {
    it('kennt Winterzeit und Sommerzeit', () => {
      expect(versatzMinuten(new Date('2026-01-15T12:00:00Z'), WIEN)).toBe(60);
      expect(versatzMinuten(new Date('2026-07-15T12:00:00Z'), WIEN)).toBe(120);
    });

    it('wechselt genau an der Umstellung im Fruehjahr', () => {
      // 01:00 UTC ist 02:00 MEZ — die letzte Minute vor dem Sprung.
      expect(versatzMinuten(new Date('2026-03-29T00:59:00Z'), WIEN)).toBe(60);
      expect(versatzMinuten(new Date('2026-03-29T01:00:00Z'), WIEN)).toBe(120);
    });

    it('wechselt genau an der Umstellung im Herbst', () => {
      expect(versatzMinuten(new Date('2026-10-25T00:59:00Z'), WIEN)).toBe(120);
      expect(versatzMinuten(new Date('2026-10-25T01:00:00Z'), WIEN)).toBe(60);
    });
  });

  describe('Ortszeit zu UTC', () => {
    it('rechnet im Winter', () => {
      expect(ortsangabeZuUtc('2026-01-15', '09:00', WIEN).toISOString()).toBe(
        '2026-01-15T08:00:00.000Z',
      );
    });

    it('rechnet im Sommer', () => {
      expect(ortsangabeZuUtc('2026-07-15', '09:00', WIEN).toISOString()).toBe(
        '2026-07-15T07:00:00.000Z',
      );
    });

    it('rechnet am Umstellungstag im Fruehjahr vor und nach dem Sprung', () => {
      // Vor dem Sprung gilt noch MEZ (+1).
      expect(ortsangabeZuUtc('2026-03-29', '01:30', WIEN).toISOString()).toBe(
        '2026-03-29T00:30:00.000Z',
      );
      // Danach MESZ (+2).
      expect(ortsangabeZuUtc('2026-03-29', '09:00', WIEN).toISOString()).toBe(
        '2026-03-29T07:00:00.000Z',
      );
    });

    it('rechnet am Umstellungstag im Herbst vor und nach dem Sprung', () => {
      expect(ortsangabeZuUtc('2026-10-25', '01:30', WIEN).toISOString()).toBe(
        '2026-10-24T23:30:00.000Z',
      );
      expect(ortsangabeZuUtc('2026-10-25', '09:00', WIEN).toISOString()).toBe(
        '2026-10-25T08:00:00.000Z',
      );
    });

    it('nimmt die Uhr mit, wenn es die Ortszeit nicht gibt', () => {
      // 02:30 existiert am 29. Maerz nicht — die Uhr springt von 02:00 auf
      // 03:00. Statt zu werfen liefert die Umrechnung 03:30 Ortszeit. Sonst
      // loeste eine Arbeitszeit "02:00 bis 06:00" an genau einem Tag im Jahr
      // einen Fehler aus, statt eine Stunde kuerzer zu sein.
      const ergebnis = ortsangabeZuUtc('2026-03-29', '02:30', WIEN);
      expect(ergebnis.toISOString()).toBe('2026-03-29T01:30:00.000Z');
      expect(alsOrtszeit(ergebnis, WIEN).zeit).toBe('03:30');
    });

    it('nimmt das erste Vorkommen, wenn es die Ortszeit zweimal gibt', () => {
      // 02:30 existiert am 25. Oktober zweimal: einmal in MESZ (00:30Z) und
      // einmal in MEZ (01:30Z). Geliefert wird das erste — wer "halb drei"
      // sagt, meint beim ersten Mal.
      const ergebnis = ortsangabeZuUtc('2026-10-25', '02:30', WIEN);
      expect(ergebnis.toISOString()).toBe('2026-10-25T00:30:00.000Z');
      expect(alsOrtszeit(ergebnis, WIEN).zeit).toBe('02:30');
    });
  });

  describe('Ortszeit lesen', () => {
    it('zerlegt einen Zeitpunkt', () => {
      const o = alsOrtszeit(new Date('2026-07-15T07:00:00Z'), WIEN);
      expect(o).toMatchObject({
        jahr: 2026,
        monat: 7,
        tag: 15,
        stunde: 9,
        minute: 0,
        datum: '2026-07-15',
        zeit: '09:00',
        // 15. Juli 2026 ist ein Mittwoch.
        weekday: 3,
      });
    });

    it('zeigt Mitternacht als 00:00, nicht als 24:00', () => {
      // Je nach Umgebung liefert Intl bei hour12: false die Stunde 24. Ohne
      // Korrektur verschoebe sich dadurch stillschweigend der Tag.
      const o = alsOrtszeit(new Date('2026-07-14T22:00:00Z'), WIEN);
      expect(o.zeit).toBe('00:00');
      expect(o.datum).toBe('2026-07-15');
      expect(o.stunde).toBe(0);
    });
  });

  describe('Tagesgrenzen', () => {
    it('beginnt den Sommertag um 22 Uhr UTC des Vortags', () => {
      // Der haeufigste Denkfehler: UTC-Mitternacht statt Ortsmitternacht. Damit
      // verliert man die ersten zwei Stunden des Tages.
      expect(tagesbeginn('2026-07-15', WIEN).toISOString()).toBe('2026-07-14T22:00:00.000Z');
      expect(tagesende('2026-07-15', WIEN).toISOString()).toBe('2026-07-15T22:00:00.000Z');
    });

    it('beginnt den Wintertag um 23 Uhr UTC des Vortags', () => {
      expect(tagesbeginn('2026-01-15', WIEN).toISOString()).toBe('2026-01-14T23:00:00.000Z');
    });

    it('gibt dem Umstellungstag im Fruehjahr 23 Stunden', () => {
      const von = tagesbeginn('2026-03-29', WIEN);
      const bis = tagesende('2026-03-29', WIEN);
      expect((bis.getTime() - von.getTime()) / 3_600_000).toBe(23);
    });

    it('gibt dem Umstellungstag im Herbst 25 Stunden', () => {
      // Hier scheitert jede Rechnung mit `+ 24 Stunden`.
      const von = tagesbeginn('2026-10-25', WIEN);
      const bis = tagesende('2026-10-25', WIEN);
      expect((bis.getTime() - von.getTime()) / 3_600_000).toBe(25);
    });

    it('rechnet ueber Monats- und Jahreswechsel', () => {
      expect(tagesende('2026-01-31', WIEN).toISOString()).toBe('2026-01-31T23:00:00.000Z');
      expect(tagesbeginn('2027-01-01', WIEN).toISOString()).toBe('2026-12-31T23:00:00.000Z');
    });

    it('rechnet ueber den Schalttag', () => {
      expect(tagesende('2028-02-28', WIEN).toISOString()).toBe('2028-02-28T23:00:00.000Z');
      expect(tagesbeginn('2028-02-29', WIEN).toISOString()).toBe('2028-02-28T23:00:00.000Z');
    });
  });

  describe('Tage zaehlen', () => {
    it('zaehlt einschliesslich beider Enden', () => {
      expect(tageZwischen('2026-03-28', '2026-03-31')).toEqual([
        '2026-03-28',
        '2026-03-29',
        '2026-03-30',
        '2026-03-31',
      ]);
    });

    it('zaehlt einen einzelnen Tag', () => {
      expect(tageZwischen('2026-03-29', '2026-03-29')).toEqual(['2026-03-29']);
    });

    it('zaehlt ueber den Monatswechsel', () => {
      expect(tageZwischen('2026-10-30', '2026-11-02')).toEqual([
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
        '2026-11-02',
      ]);
    });

    it('liefert nichts, wenn das Ende vor dem Anfang liegt', () => {
      expect(tageZwischen('2026-03-29', '2026-03-28')).toEqual([]);
    });
  });
});
