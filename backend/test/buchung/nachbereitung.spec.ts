import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppointmentStatus } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { NachbereitungService } from '../../src/appointments/nachbereitung.service';
import { prisma, truncateAll } from '../helpers/db';

/**
 * Nachbereitungsjob (Schritt 24).
 *
 * Abnahmekriterium: „Der Job läuft und verändert nur, was er soll." Der zweite
 * Teil ist der interessante — ein Job, der zu viel anfasst, fällt erst auf,
 * wenn jemand eine Statistik liest oder eine Kundin sich beschwert.
 */
describe('Nachbereitung vergangener Termine', () => {
  let app: INestApplication;
  let nachbereitung: NachbereitungService;

  let serviceId = '';
  let staffId = '';
  let kundinId = '';

  /** Freitag, 2026-10-02, 03:00 Ortszeit. Der Job läuft nachts. */
  const JETZT = new Date('2026-10-02T01:00:00Z');

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
    await app.init();
    nachbereitung = modul.get(NachbereitungService);
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll();

    const kundin = await prisma.user.create({
      data: {
        email: 'kundin@test.invalid',
        passwordHash: 'x',
        role: 'CUSTOMER',
        firstName: 'Lea',
        lastName: 'Test',
      },
    });
    const staffUser = await prisma.user.create({
      data: {
        email: 'anna@test.invalid',
        passwordHash: 'x',
        role: 'STAFF',
        firstName: 'Anna',
        lastName: 'Test',
        emailVerifiedAt: new Date(),
      },
    });
    const profil = await prisma.staffProfile.create({
      data: { userId: staffUser.id, displayName: 'Anna' },
    });
    const leistung = await prisma.service.create({
      data: { name: 'Gesichtsbehandlung', durationMinutes: 60, priceCents: 8900 },
    });

    kundinId = kundin.id;
    staffId = profil.id;
    serviceId = leistung.id;
  });

  async function termin(startIso: string, endeIso: string, status: AppointmentStatus) {
    return prisma.appointment.create({
      data: {
        customerId: kundinId,
        staffId,
        serviceId,
        startsAt: new Date(startIso),
        endsAt: new Date(endeIso),
        priceCentsSnapshot: 8900,
        status,
      },
    });
  }

  const statusVon = async (id: string) =>
    (await prisma.appointment.findUniqueOrThrow({ where: { id } })).status;

  it('setzt einen vergangenen bestaetigten Termin auf abgeschlossen', async () => {
    const t = await termin('2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', 'CONFIRMED');

    expect(await nachbereitung.nachbereiten(JETZT)).toBe(1);
    expect(await statusVon(t.id)).toBe('COMPLETED');
  });

  it('laesst einen kuenftigen Termin in Ruhe', async () => {
    const t = await termin('2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z', 'CONFIRMED');

    expect(await nachbereitung.nachbereiten(JETZT)).toBe(0);
    expect(await statusVon(t.id)).toBe('CONFIRMED');
  });

  it('laesst einen laufenden Termin in Ruhe', async () => {
    // Das Ende muss vorbei sein, nicht der Beginn. Sonst gaelte eine
    // Behandlung als abgeschlossen, waehrend die Kundin noch auf dem Stuhl
    // sitzt — und ein Storno waere mitten in der Behandlung nicht mehr
    // moeglich.
    const jetzt = new Date('2026-10-01T09:30:00Z');
    const t = await termin('2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', 'CONFIRMED');

    expect(await nachbereitung.nachbereiten(jetzt)).toBe(0);
    expect(await statusVon(t.id)).toBe('CONFIRMED');
  });

  it('laesst einen Termin in Ruhe, der genau jetzt endet', async () => {
    const jetzt = new Date('2026-10-01T10:00:00Z');
    const t = await termin('2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', 'CONFIRMED');

    expect(await nachbereitung.nachbereiten(jetzt)).toBe(0);
    expect(await statusVon(t.id)).toBe('CONFIRMED');
  });

  describe('faesst nicht an', () => {
    it('stornierte Termine', async () => {
      const a = await termin(
        '2026-10-01T09:00:00Z',
        '2026-10-01T10:00:00Z',
        'CANCELLED_BY_CUSTOMER',
      );
      const b = await termin('2026-10-01T11:00:00Z', '2026-10-01T12:00:00Z', 'CANCELLED_BY_STAFF');

      expect(await nachbereitung.nachbereiten(JETZT)).toBe(0);
      expect(await statusVon(a.id)).toBe('CANCELLED_BY_CUSTOMER');
      expect(await statusVon(b.id)).toBe('CANCELLED_BY_STAFF');
    });

    it('als nicht erschienen vermerkte Termine', async () => {
      // Der Job darf NO_SHOW nicht ueberschreiben. Dass jemand nicht da war,
      // hat ein Mensch festgestellt.
      const t = await termin('2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', 'NO_SHOW');

      expect(await nachbereitung.nachbereiten(JETZT)).toBe(0);
      expect(await statusVon(t.id)).toBe('NO_SHOW');
    });

    it('unbestaetigte Termine', async () => {
      // Ein Termin, den niemand bestaetigt hat, hat auch nicht stattgefunden.
      // Ihn auf COMPLETED zu setzen waere eine Behauptung, ihn abzusagen eine
      // Entscheidung — beides gehoert dem Studio, nicht einem naechtlichen Job.
      const t = await termin('2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', 'PENDING');

      expect(await nachbereitung.nachbereiten(JETZT)).toBe(0);
      expect(await statusVon(t.id)).toBe('PENDING');
    });

    it('bereits abgeschlossene Termine', async () => {
      const t = await termin('2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', 'COMPLETED');
      expect(await nachbereitung.nachbereiten(JETZT)).toBe(0);
      expect(await statusVon(t.id)).toBe('COMPLETED');
    });
  });

  it('veraendert beim zweiten Lauf nichts mehr', async () => {
    await termin('2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', 'CONFIRMED');

    expect(await nachbereitung.nachbereiten(JETZT)).toBe(1);
    expect(await nachbereitung.nachbereiten(JETZT)).toBe(0);
  });

  it('greift auch bei vielen Terminen nur die richtigen heraus', async () => {
    const vergangenBestaetigt = await termin(
      '2026-09-30T09:00:00Z',
      '2026-09-30T10:00:00Z',
      'CONFIRMED',
    );
    const vergangenStorniert = await termin(
      '2026-09-30T11:00:00Z',
      '2026-09-30T12:00:00Z',
      'CANCELLED_BY_CUSTOMER',
    );
    const kuenftig = await termin('2026-10-09T09:00:00Z', '2026-10-09T10:00:00Z', 'CONFIRMED');

    expect(await nachbereitung.nachbereiten(JETZT)).toBe(1);

    expect(await statusVon(vergangenBestaetigt.id)).toBe('COMPLETED');
    expect(await statusVon(vergangenStorniert.id)).toBe('CANCELLED_BY_CUSTOMER');
    expect(await statusVon(kuenftig.id)).toBe('CONFIRMED');
  });

  it('ist als naechtlicher Lauf registriert', async () => {
    // Dass die Methode existiert und ohne Argument laeuft, ist das, was der
    // Scheduler spaeter aufruft. Mehr prueft dieser Test nicht — eine echte
    // Cron-Ausloesung abzuwarten hiesse, bis drei Uhr nachts zu warten.
    await expect(nachbereitung.naechtlich()).resolves.toBeUndefined();
  });
});
