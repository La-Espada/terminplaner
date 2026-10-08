import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { VerfuegbarkeitService } from '../../src/verfuegbarkeit/verfuegbarkeit.service';
import { prisma, truncateAll } from '../helpers/db';

/**
 * Slot-Berechnung (Schritt 21).
 *
 * Die Fälle folgen `docs/SLOT-TESTFAELLE.md`. `UMSETZUNG.md` nennt diesen
 * Schritt den aufwendigsten und fehleranfälligsten des Projekts und verlangt,
 * nicht weiterzuarbeiten, solange nicht alle Pflichtfälle grün sind — ein
 * halbfertiger Slot-Algorithmus, auf dem Kalender und App schon aufbauen, ist
 * der teuerste Zustand, den dieses Projekt erreichen kann.
 *
 * Zugesichert wird immer auf dem **UTC-Zeitpunkt**, nie auf der
 * Ortszeit-Beschriftung. Am 25. Oktober 2026 gibt es zwei verschiedene
 * Zeitpunkte mit der Beschriftung „02:30".
 */
describe('Slot-Berechnung', () => {
  let app: INestApplication;
  let verfuegbarkeit: VerfuegbarkeitService;

  let S60 = '';
  let S30 = '';
  let S45 = '';
  let ANNA = '';
  let BEA = '';
  let CHRIS = '';
  let KUNDIN = '';

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
    await app.init();
    verfuegbarkeit = modul.get(VerfuegbarkeitService);
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll();

    const leistung = (name: string, dauer: number, puffer: number, aktiv = true) =>
      prisma.service.create({
        data: {
          name,
          durationMinutes: dauer,
          bufferMinutes: puffer,
          priceCents: 6900,
          isActive: aktiv,
        },
      });

    // S30 hat bewusst keinen Puffer: Nur so lässt sich die Zeitzonenwirkung
    // isoliert prüfen, ohne dass Pufferlogik das Ergebnis mitbestimmt.
    S60 = (await leistung('Gesichtsbehandlung klassisch', 60, 15)).id;
    S30 = (await leistung('Augenbrauen korrigieren', 30, 0)).id;
    S45 = (await leistung('Wimpernlifting', 45, 15, false)).id;

    const person = async (name: string, email: string, aktiv: boolean) => {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: 'x',
          role: 'STAFF',
          firstName: name,
          lastName: 'Test',
          emailVerifiedAt: new Date(),
        },
      });
      const profil = await prisma.staffProfile.create({
        data: { userId: user.id, displayName: name, isActive: aktiv },
      });
      return profil.id;
    };

    ANNA = await person('Anna', 'anna@test.invalid', true);
    BEA = await person('Bea', 'bea@test.invalid', true);
    // CHRIS ist inaktiv, bekommt aber vollständige Arbeitszeiten. Eine inaktive
    // Person ohne Arbeitszeiten würde den Fall nicht prüfen — sie fiele schon
    // an der leeren Arbeitszeit heraus und nicht an `isActive`.
    CHRIS = await person('Chris', 'chris@test.invalid', false);

    await prisma.staffService.createMany({
      data: [
        { staffId: ANNA, serviceId: S60 },
        { staffId: ANNA, serviceId: S30 },
        { staffId: BEA, serviceId: S60 },
        { staffId: CHRIS, serviceId: S60 },
        { staffId: CHRIS, serviceId: S30 },
      ],
    });

    KUNDIN = (
      await prisma.user.create({
        data: {
          email: 'kundin@test.invalid',
          passwordHash: 'x',
          role: 'CUSTOMER',
          firstName: 'Lea',
          lastName: 'Test',
        },
      })
    ).id;

    await arbeitszeitMoBisFr(ANNA);
    await arbeitszeitMoBisFr(CHRIS);
  });

  // ------------------------------------------------------------------ Helfer

  async function arbeitszeitMoBisFr(staffId: string, von = '09:00', bis = '17:00') {
    await prisma.workingHours.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        staffId,
        weekday,
        startTime: new Date(`1970-01-01T${von}:00Z`),
        endTime: new Date(`1970-01-01T${bis}:00Z`),
      })),
    });
  }

  async function arbeitszeit(staffId: string, weekday: number, von: string, bis: string) {
    await prisma.workingHours.create({
      data: {
        staffId,
        weekday,
        startTime: new Date(`1970-01-01T${von}:00Z`),
        endTime: new Date(`1970-01-01T${bis}:00Z`),
      },
    });
  }

  async function termin(
    staffId: string,
    serviceId: string,
    startIso: string,
    endeIso: string,
    status:
      'CONFIRMED' | 'PENDING' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED_BY_CUSTOMER' = 'CONFIRMED',
  ) {
    return prisma.appointment.create({
      data: {
        customerId: KUNDIN,
        staffId,
        serviceId,
        startsAt: new Date(startIso),
        endsAt: new Date(endeIso),
        priceCentsSnapshot: 6900,
        status,
        ...(status === 'CANCELLED_BY_CUSTOMER' ? { cancelledAt: new Date() } : {}),
      },
    });
  }

  async function abwesenheit(staffId: string | null, startIso: string, endeIso: string) {
    return prisma.timeOff.create({
      data: {
        staffId,
        type: staffId === null ? 'PUBLIC_HOLIDAY' : 'VACATION',
        startsAt: new Date(startIso),
        endsAt: new Date(endeIso),
      },
    });
  }

  const hole = (
    serviceId: string,
    staffId: string | undefined,
    tag: string,
    jetzt: string,
    bis = tag,
  ) => verfuegbarkeit.slots({ serviceId, staffId, von: tag, bis }, new Date(jetzt));

  const starts = async (...args: Parameters<typeof hole>) =>
    (await hole(...args)).map((s) => s.startsAt);

  // --------------------------------------------------------- Die Pflichtfälle

  describe('F-01 — normaler Arbeitstag', () => {
    it('liefert 29 Slots von 09:00 bis 16:00', async () => {
      const liste = await starts(S60, ANNA, '2026-06-15', '2026-06-12T06:00:00Z');

      expect(liste).toHaveLength(29);
      // 09:00 Ortszeit im Sommer = 07:00Z, letzter Start 16:00 = 14:00Z.
      expect(liste[0]).toBe('2026-06-15T07:00:00.000Z');
      expect(liste[liste.length - 1]).toBe('2026-06-15T14:00:00.000Z');
    });

    it('liefert nichts an einem Tag ohne Arbeitszeit', async () => {
      // Samstag. Keine Zeile in working_hours ist in E-11 die Abbildung von
      // "frei" — nicht etwa eine Zeile mit Dauer null.
      expect(await starts(S60, ANNA, '2026-06-20', '2026-06-12T06:00:00Z')).toEqual([]);
    });
  });

  describe('F-02 — Mittagspause', () => {
    it('liefert 22 Slots bei einer Pause von 12 bis 13', async () => {
      await prisma.workingHours.deleteMany({ where: { staffId: ANNA, weekday: 1 } });
      await arbeitszeit(ANNA, 1, '09:00', '12:00');
      await arbeitszeit(ANNA, 1, '13:00', '17:00');

      const liste = await starts(S60, ANNA, '2026-06-15', '2026-06-12T06:00:00Z');

      // Vormittags 09:00 bis 11:00 sind 9, nachmittags 13:00 bis 16:00 sind 13.
      expect(liste).toHaveLength(22);
      expect(liste).toContain('2026-06-15T09:00:00.000Z'); // 11:00 Ortszeit
      expect(liste).not.toContain('2026-06-15T09:15:00.000Z'); // 11:15 ragt in die Pause
      expect(liste).toContain('2026-06-15T11:00:00.000Z'); // 13:00 Ortszeit
    });

    it('zieht zwei aneinandergrenzende Zeilen zu einem Tag zusammen', async () => {
      // 9-12 und 12-17 sind zwei Zeilen, aber ein durchgehender Arbeitstag.
      // Ohne Zusammenfassen entstuenden nur 26 Slots: An der Naht fiele jede
      // Behandlung weg, die ueber 12:00 hinausreicht.
      await prisma.workingHours.deleteMany({ where: { staffId: ANNA, weekday: 1 } });
      await arbeitszeit(ANNA, 1, '09:00', '12:00');
      await arbeitszeit(ANNA, 1, '12:00', '17:00');

      const liste = await starts(S60, ANNA, '2026-06-15', '2026-06-12T06:00:00Z');

      expect(liste).toHaveLength(29);
      expect(liste).toContain('2026-06-15T09:30:00.000Z'); // 11:30 Ortszeit
    });
  });

  describe('F-03 — halber Urlaubstag', () => {
    it('liefert 9 Slots bei Urlaub ab 12:00', async () => {
      await abwesenheit(ANNA, '2026-06-15T10:00:00Z', '2026-06-15T15:00:00Z');

      const liste = await starts(S60, ANNA, '2026-06-15', '2026-06-12T06:00:00Z');

      expect(liste).toHaveLength(9);
      expect(liste[liste.length - 1]).toBe('2026-06-15T09:00:00.000Z'); // 11:00 Ortszeit
    });

    it('liefert 7 Slots bei Urlaub ab 11:30', async () => {
      await abwesenheit(ANNA, '2026-06-15T09:30:00Z', '2026-06-15T15:00:00Z');

      const liste = await starts(S60, ANNA, '2026-06-15', '2026-06-12T06:00:00Z');
      expect(liste).toHaveLength(7);
      expect(liste[liste.length - 1]).toBe('2026-06-15T08:30:00.000Z'); // 10:30 Ortszeit
    });
  });

  describe('F-04 — studioweiter Feiertag', () => {
    it('liefert nichts', async () => {
      // staffId null gilt fuer alle. Wer nur WHERE staff_id = :id abfragt,
      // uebersieht das: NULL = :id ist nie wahr.
      await abwesenheit(null, '2026-06-14T22:00:00Z', '2026-06-15T22:00:00Z');

      expect(await starts(S60, ANNA, '2026-06-15', '2026-06-12T06:00:00Z')).toEqual([]);
    });

    it('wirkt auch ohne Angabe einer Person', async () => {
      await abwesenheit(null, '2026-06-14T22:00:00Z', '2026-06-15T22:00:00Z');
      expect(await starts(S60, undefined, '2026-06-15', '2026-06-12T06:00:00Z')).toEqual([]);
    });
  });

  describe('F-05 — ausgebuchter Tag', () => {
    /** Sechs Termine mit Puffer, die den Freitag lückenlos füllen. */
    async function vollerTag() {
      const belegung: Array<[string, string]> = [
        ['07:00', '08:00'],
        ['08:15', '09:15'],
        ['09:30', '10:30'],
        ['10:45', '11:45'],
        ['12:00', '13:00'],
        ['13:15', '14:15'],
      ];
      const ids: string[] = [];
      for (const [von, bis] of belegung) {
        ids.push((await termin(ANNA, S60, `2026-06-19T${von}:00Z`, `2026-06-19T${bis}:00Z`)).id);
      }
      return ids;
    }

    it('liefert nichts', async () => {
      await vollerTag();

      // Der Rest 16:30 bis 17:00 ist 30 Minuten und damit kuerzer als die
      // Behandlung — er darf keinen Slot erzeugen, obwohl er auf einem
      // Rasterpunkt beginnt.
      expect(await starts(S60, ANNA, '2026-06-19', '2026-06-15T06:00:00Z')).toEqual([]);
    });

    it('gibt nach einer Stornierung Zeit und Puffer wieder frei', async () => {
      const ids = await vollerTag();
      await prisma.appointment.update({
        where: { id: ids[2] },
        data: { status: 'CANCELLED_BY_CUSTOMER', cancelledAt: new Date() },
      });

      const liste = await starts(S60, ANNA, '2026-06-19', '2026-06-15T06:00:00Z');

      // Frei wird 11:30 (Pufferende von Termin 2) bis 12:45 (Beginn von
      // Termin 4) = 75 Minuten. Der Slot 11:45 endet exakt zum Beginn des
      // naechsten Termins — halboffene Intervalle beruehren sich.
      expect(liste).toEqual(['2026-06-19T09:30:00.000Z', '2026-06-19T09:45:00.000Z']);
    });

    it('laesst den Puffer blockieren, aber nicht mitbuchen', async () => {
      await termin(ANNA, S60, '2026-06-19T07:00:00Z', '2026-06-19T08:00:00Z');

      const liste = await starts(S60, ANNA, '2026-06-19', '2026-06-15T06:00:00Z');

      // 10:00 Ortszeit (08:00Z) faellt in den Puffer und darf nicht erscheinen.
      expect(liste).not.toContain('2026-06-19T08:00:00.000Z');
      // 10:15 (08:15Z) ist der erste freie Start danach.
      expect(liste[0]).toBe('2026-06-19T08:15:00.000Z');
    });

    it('blockiert auch bei PENDING, COMPLETED und NO_SHOW', async () => {
      // Negativliste: Alles blockiert ausser den beiden Storno-Status. Die
      // gefaehrliche Richtung waere, mehr anzubieten als der Constraint
      // zulaesst — dann endet jede Buchung darauf in 409.
      for (const status of ['PENDING', 'COMPLETED', 'NO_SHOW'] as const) {
        await truncateAll();
        await beforeEachErsatz();

        // Erst ohne Termin pruefen, damit ein `not.toContain` auf einer leeren
        // Liste nicht faelschlich als Erfolg durchgeht.
        const vorher = await starts(S60, ANNA, '2026-06-19', '2026-06-15T06:00:00Z');
        expect(vorher, status).toContain('2026-06-19T07:00:00.000Z');

        await termin(ANNA, S60, '2026-06-19T07:00:00Z', '2026-06-19T08:00:00Z', status);

        const nachher = await starts(S60, ANNA, '2026-06-19', '2026-06-15T06:00:00Z');
        expect(nachher, status).not.toContain('2026-06-19T07:00:00.000Z');
        expect(nachher.length, status).toBeGreaterThan(0);
      }
    });
  });

  describe('F-06 — Sommerzeitbeginn am 29. Maerz 2026', () => {
    it('liefert bei 09:00 bis 17:00 wieder 29 Slots, aber ab 07:00Z', async () => {
      // 29. Maerz 2026 ist ein Sonntag — ohne eigene Sonntagszeile liefe der
      // Fall gegen eine leere Erwartung ins Leere.
      await arbeitszeit(ANNA, 0, '09:00', '17:00');

      const liste = await starts(S60, ANNA, '2026-03-29', '2026-03-20T06:00:00Z');

      expect(liste).toHaveLength(29);
      // Nach der Umstellung gilt MESZ: 09:00 Ortszeit = 07:00Z.
      expect(liste[0]).toBe('2026-03-29T07:00:00.000Z');
    });

    it('verliert eine Stunde, wenn die Arbeitszeit ueber den Sprung reicht', async () => {
      // 01:00 Ortszeit ist noch MEZ (00:00Z), 05:00 schon MESZ (03:00Z). Das
      // Fenster ist 180 statt 240 Minuten lang.
      await arbeitszeit(ANNA, 0, '01:00', '05:00');

      const liste = await starts(S60, ANNA, '2026-03-29', '2026-03-20T06:00:00Z');

      expect(liste).toHaveLength(9);
      expect(liste[0]).toBe('2026-03-29T00:00:00.000Z');
      expect(liste[liste.length - 1]).toBe('2026-03-29T02:00:00.000Z');
    });
  });

  describe('F-07 — Sommerzeitende am 25. Oktober 2026', () => {
    it('liefert bei 09:00 bis 17:00 29 Slots ab 08:00Z', async () => {
      await arbeitszeit(ANNA, 0, '09:00', '17:00');

      const liste = await starts(S60, ANNA, '2026-10-25', '2026-10-15T06:00:00Z');

      expect(liste).toHaveLength(29);
      // Nach der Umstellung gilt MEZ: 09:00 Ortszeit = 08:00Z.
      expect(liste[0]).toBe('2026-10-25T08:00:00.000Z');
    });

    it('gewinnt eine Stunde, wenn die Arbeitszeit ueber den Sprung reicht', async () => {
      // 01:00 Ortszeit ist noch MESZ und liegt in UTC am Vortag (23:00Z),
      // 05:00 ist MEZ (04:00Z). Das Fenster ist 300 statt 240 Minuten lang.
      // Wer die Fensterlaenge aus der Wanduhr-Differenz ableitet, verliert
      // vier buchbare Slots.
      await arbeitszeit(ANNA, 0, '01:00', '05:00');

      const liste = await starts(S60, ANNA, '2026-10-25', '2026-10-15T06:00:00Z');

      expect(liste).toHaveLength(17);
      expect(liste[0]).toBe('2026-10-24T23:00:00.000Z');
      expect(liste[liste.length - 1]).toBe('2026-10-25T03:00:00.000Z');
    });

    it('unterscheidet die beiden Durchlaeufe der doppelten Stunde', async () => {
      // Der eigentliche Pruefstein fuer E-06. Ein Termin "um 02:00" darf den
      // Slot "02:00" nicht loeschen — es sind zwei verschiedene Zeitpunkte,
      // 60 Minuten auseinander.
      await arbeitszeit(ANNA, 0, '01:00', '05:00');
      await termin(ANNA, S30, '2026-10-25T00:00:00Z', '2026-10-25T00:30:00Z');

      const liste = await starts(S30, ANNA, '2026-10-25', '2026-10-15T06:00:00Z');

      expect(liste).toHaveLength(16);

      // Entfernt: die drei Startzeiten, die in den Termin hineinreichen.
      expect(liste).not.toContain('2026-10-24T23:45:00.000Z');
      expect(liste).not.toContain('2026-10-25T00:00:00.000Z'); // 02:00 MESZ
      expect(liste).not.toContain('2026-10-25T00:15:00.000Z');

      // Frei: 02:30 MESZ und — entscheidend — 02:00 MEZ eine Stunde spaeter.
      expect(liste).toContain('2026-10-25T00:30:00.000Z');
      expect(liste).toContain('2026-10-25T01:00:00.000Z'); // 02:00 MEZ
      expect(liste).toContain('2026-10-25T01:15:00.000Z');
    });

    it('liefert acht Slots mit doppelter Ortszeit-Beschriftung, aber keine UTC-Dubletten', async () => {
      await arbeitszeit(ANNA, 0, '01:00', '05:00');

      const liste = await starts(S60, ANNA, '2026-10-25', '2026-10-15T06:00:00Z');

      // Eine Deduplizierung ueber die formatierte Ortszeit — in Oberflaechen
      // beliebt, um "doppelte" Eintraege zu unterdruecken — loeschte hier vier
      // korrekte Slots.
      expect(new Set(liste).size).toBe(liste.length);
    });
  });

  // ------------------------------------------------------- Ergaenzende Faelle

  describe('Z-01 — Vorlaufzeit', () => {
    it('verwirft Slots, die zu bald beginnen', async () => {
      // Jetzt: Montag 08:10 Ortszeit = 06:10Z. Mit 120 Minuten Vorlauf ist der
      // fruehestmoegliche Start 10:10 Ortszeit; der erste Rasterpunkt danach
      // ist 10:15.
      const liste = await starts(S60, ANNA, '2026-06-15', '2026-06-15T06:10:00Z');

      expect(liste[0]).toBe('2026-06-15T08:15:00.000Z');
      expect(liste).toHaveLength(24);
    });

    it('laesst einen Slot genau auf der Vorlaufgrenze zu', async () => {
      // Jetzt 07:00Z, Vorlauf 120 Minuten: 09:00Z ist exakt erreichbar.
      const liste = await starts(S60, ANNA, '2026-06-15', '2026-06-15T07:00:00Z');
      expect(liste[0]).toBe('2026-06-15T09:00:00.000Z');
    });

    it('liefert fuer einen vergangenen Tag nichts', async () => {
      expect(await starts(S60, ANNA, '2026-06-15', '2026-06-20T06:00:00Z')).toEqual([]);
    });
  });

  describe('Z-02 — Buchungshorizont', () => {
    it('liefert am letzten zulaessigen Tag noch Slots', async () => {
      // Jetzt Montag 2026-06-15, Horizont 90 Tage: der 2026-09-13 ist der
      // letzte Tag. Das ist ein Sonntag — deshalb eine Sonntagszeile.
      await arbeitszeit(ANNA, 0, '09:00', '17:00');

      expect(await starts(S60, ANNA, '2026-09-13', '2026-06-15T06:00:00Z')).toHaveLength(29);
    });

    it('liefert einen Tag spaeter nichts mehr', async () => {
      // Gerechnet wird in Kalendertagen, nicht in Millisekunden. Der 14.09.
      // ist ein Montag und haette Arbeitszeit.
      expect(await starts(S60, ANNA, '2026-09-14', '2026-06-15T06:00:00Z')).toEqual([]);
    });
  });

  describe('Z-03 — Abwesenheit grenzt an einen Termin', () => {
    it('erzeugt im Nullfenster dazwischen keinen Slot', async () => {
      // Termin 09:00-10:00 Ortszeit, Puffer bis 10:15, Abwesenheit ab 10:15.
      // Zwischen Pufferende und Abwesenheitsbeginn liegt nichts.
      await termin(ANNA, S60, '2026-06-15T07:00:00Z', '2026-06-15T08:00:00Z');
      await abwesenheit(ANNA, '2026-06-15T08:15:00Z', '2026-06-15T11:00:00Z');

      const liste = await starts(S60, ANNA, '2026-06-15', '2026-06-12T06:00:00Z');

      // Frei bleibt 13:00 bis 17:00 Ortszeit = 11:00Z bis 15:00Z, letzter
      // Start 14:00Z: 13 Slots.
      expect(liste).toHaveLength(13);
      expect(liste[0]).toBe('2026-06-15T11:00:00.000Z');
      expect(liste).not.toContain('2026-06-15T08:15:00.000Z');
    });
  });

  describe('Z-04 — ohne Angabe einer Person', () => {
    it('fasst gleiche Startzeiten zusammen und nennt alle, die koennen', async () => {
      await arbeitszeitMoBisFr(BEA);

      const liste = await hole(S60, undefined, '2026-06-15', '2026-06-12T06:00:00Z');

      expect(liste).toHaveLength(29);
      expect(liste[0].staff.map((s) => s.displayName)).toEqual(['Anna', 'Bea']);
    });

    it('nennt nur die, die zu dieser Zeit koennen', async () => {
      await arbeitszeitMoBisFr(BEA);
      await termin(ANNA, S60, '2026-06-15T07:00:00Z', '2026-06-15T08:00:00Z');

      const liste = await hole(S60, undefined, '2026-06-15', '2026-06-12T06:00:00Z');
      const neunUhr = liste.find((s) => s.startsAt === '2026-06-15T07:00:00.000Z');

      expect(neunUhr?.staff.map((s) => s.displayName)).toEqual(['Bea']);
    });

    it('laesst eine deaktivierte Person nirgends auftauchen', async () => {
      // CHRIS hat vollstaendige Arbeitszeiten und die Leistung zugeordnet,
      // ist aber deaktiviert.
      const liste = await hole(S60, undefined, '2026-06-15', '2026-06-12T06:00:00Z');

      expect(liste.flatMap((s) => s.staff.map((p) => p.displayName))).not.toContain('Chris');
    });

    it('weist eine ausdrueckliche Anfrage nach einer deaktivierten Person ab', async () => {
      await expect(hole(S60, CHRIS, '2026-06-15', '2026-06-12T06:00:00Z')).rejects.toThrow();
    });
  });

  describe('Z-05 — Leistung nicht buchbar', () => {
    it('weist eine inaktive Leistung ab', async () => {
      await expect(hole(S45, undefined, '2026-06-15', '2026-06-12T06:00:00Z')).rejects.toThrow();
    });

    it('liefert nichts, wenn niemand die Leistung anbietet', async () => {
      await prisma.staffService.deleteMany({ where: { serviceId: S60 } });
      expect(await starts(S60, undefined, '2026-06-15', '2026-06-12T06:00:00Z')).toEqual([]);
    });

    it('weist eine Person ab, die die Leistung nicht anbietet', async () => {
      // BEA bietet S30 nicht an. Das ist ein anderer Fall als "nichts frei",
      // und die App soll ihn unterscheiden koennen.
      await expect(hole(S30, BEA, '2026-06-15', '2026-06-12T06:00:00Z')).rejects.toThrow();
    });
  });

  describe('Z-07 — mehrtaegige Abwesenheit', () => {
    it('blockiert auch die Mitte, nicht nur den Anfang', async () => {
      // Der haeufigste Abfragefehler: nur suchen, was im Zeitraum beginnt.
      await abwesenheit(ANNA, '2026-06-07T22:00:00Z', '2026-06-21T22:00:00Z');

      expect(await starts(S60, ANNA, '2026-06-15', '2026-06-01T06:00:00Z')).toEqual([]);
    });
  });

  describe('Zeitraum ueber mehrere Tage', () => {
    it('liefert die Tage hintereinander', async () => {
      const liste = await hole(S60, ANNA, '2026-06-15', '2026-06-12T06:00:00Z', '2026-06-17');

      // Montag, Dienstag, Mittwoch — je 29.
      expect(liste).toHaveLength(87);
      expect(liste[0].startsAt).toBe('2026-06-15T07:00:00.000Z');
      expect(liste[liste.length - 1].startsAt).toBe('2026-06-17T14:00:00.000Z');
    });

    it('ueberspringt das Wochenende', async () => {
      const liste = await hole(S60, ANNA, '2026-06-19', '2026-06-12T06:00:00Z', '2026-06-22');
      // Freitag und Montag, Samstag und Sonntag fallen weg.
      expect(liste).toHaveLength(58);
    });

    it('lehnt einen vertauschten Zeitraum ab', async () => {
      await expect(
        hole(S60, ANNA, '2026-06-20', '2026-06-12T06:00:00Z', '2026-06-15'),
      ).rejects.toThrow();
    });
  });

  /** Baut nach einem zwischenzeitlichen `truncateAll` die Grunddaten erneut auf. */
  async function beforeEachErsatz() {
    const leistung = await prisma.service.create({
      data: {
        name: 'Gesichtsbehandlung klassisch',
        durationMinutes: 60,
        bufferMinutes: 15,
        priceCents: 6900,
      },
    });
    S60 = leistung.id;

    const user = await prisma.user.create({
      data: {
        email: 'anna@test.invalid',
        passwordHash: 'x',
        role: 'STAFF',
        firstName: 'Anna',
        lastName: 'Test',
        emailVerifiedAt: new Date(),
      },
    });
    ANNA = (await prisma.staffProfile.create({ data: { userId: user.id, displayName: 'Anna' } }))
      .id;
    await prisma.staffService.create({ data: { staffId: ANNA, serviceId: S60 } });
    KUNDIN = (
      await prisma.user.create({
        data: {
          email: 'kundin@test.invalid',
          passwordHash: 'x',
          role: 'CUSTOMER',
          firstName: 'Lea',
          lastName: 'Test',
        },
      })
    ).id;
    await arbeitszeitMoBisFr(ANNA);
  }
});
