import { ConflictException, ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { BookingService } from '../../src/appointments/booking.service';
import { StornoService } from '../../src/appointments/storno.service';
import type { AngemeldetePerson } from '../../src/auth/types';
import { VerfuegbarkeitService } from '../../src/verfuegbarkeit/verfuegbarkeit.service';
import { prisma, truncateAll } from '../helpers/db';

/**
 * Stornieren und Verschieben (Schritt 23).
 *
 * Abnahmekriterium: Ein Storno gibt den Slot wieder frei, und eine Stornierung
 * nach Fristablauf wird abgelehnt. Beides steht ganz unten.
 */
describe('Stornieren und Verschieben', () => {
  let app: INestApplication;
  let storno: StornoService;
  let buchung: BookingService;
  let verfuegbarkeit: VerfuegbarkeitService;

  let serviceId = '';
  let staffId = '';
  let kundin: AngemeldetePerson;
  let andereKundin: AngemeldetePerson;
  let anna: AngemeldetePerson;
  let bea: AngemeldetePerson;
  let admin: AngemeldetePerson;

  /** Donnerstag, 1. Oktober 2026. */
  const TAG = '2026-10-01';
  const START = '2026-10-01T09:00:00.000Z';
  /** Eine Woche vorher — weit vor der Stornofrist von 24 Stunden. */
  const FRUEH = new Date('2026-09-24T06:00:00Z');
  /** Zwei Stunden vor dem Termin — nach Fristablauf. */
  const SPAET = new Date('2026-10-01T07:00:00Z');

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
    await app.init();
    storno = modul.get(StornoService);
    buchung = modul.get(BookingService);
    verfuegbarkeit = modul.get(VerfuegbarkeitService);
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll();

    const nutzer = (email: string, rolle: 'ADMIN' | 'STAFF' | 'CUSTOMER') =>
      prisma.user.create({
        data: {
          email,
          passwordHash: 'x',
          role: rolle,
          firstName: 'T',
          lastName: 'P',
          emailVerifiedAt: new Date(),
        },
      });

    const k = await nutzer('kundin@test.invalid', 'CUSTOMER');
    const k2 = await nutzer('zweite@test.invalid', 'CUSTOMER');
    const a = await nutzer('anna@test.invalid', 'STAFF');
    const b = await nutzer('bea@test.invalid', 'STAFF');
    const ad = await nutzer('admin@test.invalid', 'ADMIN');

    const profilA = await prisma.staffProfile.create({
      data: { userId: a.id, displayName: 'Anna' },
    });
    const profilB = await prisma.staffProfile.create({
      data: { userId: b.id, displayName: 'Bea' },
    });

    const leistung = await prisma.service.create({
      data: {
        name: 'Gesichtsbehandlung',
        durationMinutes: 60,
        bufferMinutes: 15,
        priceCents: 8900,
      },
    });

    await prisma.staffService.createMany({
      data: [
        { staffId: profilA.id, serviceId: leistung.id },
        { staffId: profilB.id, serviceId: leistung.id },
      ],
    });

    for (const id of [profilA.id, profilB.id]) {
      await prisma.workingHours.createMany({
        data: [1, 2, 3, 4, 5].map((weekday) => ({
          staffId: id,
          weekday,
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T18:00:00Z'),
        })),
      });
    }

    serviceId = leistung.id;
    staffId = profilA.id;
    kundin = { id: k.id, role: 'CUSTOMER', staffProfileId: null };
    andereKundin = { id: k2.id, role: 'CUSTOMER', staffProfileId: null };
    anna = { id: a.id, role: 'STAFF', staffProfileId: profilA.id };
    bea = { id: b.id, role: 'STAFF', staffProfileId: profilB.id };
    admin = { id: ad.id, role: 'ADMIN', staffProfileId: null };
  });

  const buchen = (start = START) =>
    buchung.buchen(kundin.id, { serviceId, staffId, startsAt: start }, FRUEH);

  const slots = async () =>
    (await verfuegbarkeit.slots({ serviceId, staffId, von: TAG, bis: TAG }, FRUEH)).map(
      (s) => s.startsAt,
    );

  describe('Wer darf was', () => {
    it('laesst die Kundin ihren eigenen Termin absagen', async () => {
      const t = await buchen();
      await storno.stornieren(kundin, t.id, {}, FRUEH);

      const danach = await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } });
      expect(danach.status).toBe('CANCELLED_BY_CUSTOMER');
      expect(danach.cancelledAt).not.toBeNull();
    });

    it('verbirgt einen fremden Termin vor einer anderen Kundin', async () => {
      const t = await buchen();
      // 404 und nicht 403: Ein 403 verriete, dass es den Termin gibt, und ueber
      // durchprobierte Kennungen liesse sich ermitteln, wann die Praxis
      // ausgelastet ist.
      await expect(storno.stornieren(andereKundin, t.id, {}, FRUEH)).rejects.toThrow(
        'Termin nicht gefunden',
      );
    });

    it('verbirgt einen fremden Termin vor einer anderen Kosmetikerin', async () => {
      const t = await buchen();
      await expect(storno.stornieren(bea, t.id, { grund: 'OPERATIONAL' }, FRUEH)).rejects.toThrow(
        'Termin nicht gefunden',
      );
    });

    it('laesst die behandelnde Kosmetikerin absagen', async () => {
      const t = await buchen();
      await storno.stornieren(anna, t.id, { grund: 'STAFF_UNAVAILABLE' }, FRUEH);

      const danach = await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } });
      expect(danach.status).toBe('CANCELLED_BY_STAFF');
      expect(danach.cancellationReason).toBe('STAFF_UNAVAILABLE');
    });

    it('laesst die Studioleitung jeden Termin absagen', async () => {
      const t = await buchen();
      await storno.stornieren(admin, t.id, { grund: 'OPERATIONAL' }, FRUEH);

      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
        'CANCELLED_BY_STAFF',
      );
    });
  });

  describe('Der Grund', () => {
    it('ist Pflicht, wenn das Studio absagt', async () => {
      const t = await buchen();
      await expect(storno.stornieren(anna, t.id, {}, FRUEH)).rejects.toThrow('Grund');
    });

    it('wird von der Kundin nicht entgegengenommen', async () => {
      // Ein von der Kundin gewaehlter "Grund" waere eine Behauptung ueber den
      // Betrieb, die niemand prueft.
      const t = await buchen();
      await expect(
        storno.stornieren(kundin, t.id, { grund: 'STAFF_UNAVAILABLE' }, FRUEH),
      ).rejects.toThrow();
    });

    it('ist eine Kategorie und kein Freitext', async () => {
      // E-35: In ein Freitextfeld schreibt das Personal erfahrungsgemaess
      // "Patientin hat Ausschlag" — ein Gesundheitsdatum in einer Spalte, die
      // weder verschluesselt noch zugriffsprotokolliert ist.
      const spalte = await prisma.$queryRawUnsafe<Array<{ data_type: string; udt_name: string }>>(
        `SELECT data_type, udt_name FROM information_schema.columns
         WHERE table_name = 'appointments' AND column_name = 'cancellation_reason'`,
      );
      expect(spalte[0].data_type).toBe('USER-DEFINED');
      expect(spalte[0].udt_name).toBe('cancellation_reason');
    });
  });

  describe('Zustand', () => {
    it('lehnt eine zweite Absage ab', async () => {
      const t = await buchen();
      await storno.stornieren(kundin, t.id, {}, FRUEH);

      // Ein stiller Erfolg waere schlimmer als eine Ablehnung — die Kundin
      // glaubte dann, sie habe gerade abgesagt.
      await expect(storno.stornieren(kundin, t.id, {}, FRUEH)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('lehnt die Absage eines abgeschlossenen Termins ab', async () => {
      const t = await buchen();
      await prisma.appointment.update({ where: { id: t.id }, data: { status: 'COMPLETED' } });

      await expect(storno.stornieren(admin, t.id, { grund: 'SONSTIGES' }, FRUEH)).rejects.toThrow(
        'abgeschlossen',
      );
    });
  });

  describe('Verschieben', () => {
    it('aendert dieselbe Zeile statt eine neue anzulegen', async () => {
      const t = await buchen();
      const neu = await storno.verschieben(kundin, t.id, '2026-10-01T11:00:00.000Z', FRUEH);

      expect(neu.startsAt).toBe('2026-10-01T11:00:00.000Z');
      expect(neu.endsAt).toBe('2026-10-01T12:00:00.000Z');

      // Eine Stornozeile daneben waere fuer die Kundin verwirrend und setzte
      // den Preis neu, womit der Schnappschuss aus E-09 seinen Zweck verloere.
      expect(await prisma.appointment.count()).toBe(1);
      const danach = await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } });
      expect(danach.status).toBe('CONFIRMED');
      expect(danach.priceCentsSnapshot).toBe(8900);
    });

    it('laesst eine Verschiebung um eine Viertelstunde zu', async () => {
      // Der haeufigste Fall — und der, bei dem sich der Termin ohne Ausnahme
      // selbst blockieren wuerde, weil alte und neue Zeit sich ueberlappen.
      const t = await buchen();
      const neu = await storno.verschieben(kundin, t.id, '2026-10-01T09:15:00.000Z', FRUEH);
      expect(neu.startsAt).toBe('2026-10-01T09:15:00.000Z');
    });

    it('gibt die alte Zeit wieder frei', async () => {
      const t = await buchen();
      await storno.verschieben(kundin, t.id, '2026-10-01T11:00:00.000Z', FRUEH);

      expect(await slots()).toContain(START);
    });

    it('lehnt eine belegte Zeit ab', async () => {
      const t = await buchen();
      await buchung.buchen(
        andereKundin.id,
        { serviceId, staffId, startsAt: '2026-10-01T11:00:00.000Z' },
        FRUEH,
      );

      await expect(
        storno.verschieben(kundin, t.id, '2026-10-01T11:00:00.000Z', FRUEH),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lehnt eine Zeit ausserhalb der Arbeitszeit ab', async () => {
      const t = await buchen();
      await expect(
        storno.verschieben(kundin, t.id, '2026-10-01T04:00:00.000Z', FRUEH),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lehnt die bisherige Zeit ab', async () => {
      const t = await buchen();
      await expect(storno.verschieben(kundin, t.id, START, FRUEH)).rejects.toThrow('bisherige');
    });

    it('bindet die Kundin an die Frist, das Studio nicht', async () => {
      const t = await buchen();
      await expect(
        storno.verschieben(kundin, t.id, '2026-10-01T11:00:00.000Z', SPAET),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Dieselbe Verschiebung durch das Studio geht durch.
      const neu = await storno.verschieben(anna, t.id, '2026-10-01T11:00:00.000Z', SPAET);
      expect(neu.startsAt).toBe('2026-10-01T11:00:00.000Z');
    });
  });

  describe('Protokoll', () => {
    it('haelt jede Aenderung fest', async () => {
      const t = await buchen();
      await storno.verschieben(kundin, t.id, '2026-10-01T11:00:00.000Z', FRUEH);
      await storno.stornieren(kundin, t.id, {}, FRUEH);

      const eintraege = await prisma.auditLogEntry.findMany({
        where: { entityId: t.id },
        orderBy: { id: 'asc' },
      });

      expect(eintraege.map((e) => e.action)).toEqual([
        'APPOINTMENT_CREATED',
        'APPOINTMENT_RESCHEDULED',
        'APPOINTMENT_CANCELLED',
      ]);
      expect(eintraege.every((e) => e.actorUserId === kundin.id)).toBe(true);
    });

    it('haelt fest, wer storniert hat', async () => {
      const t = await buchen();
      await storno.stornieren(anna, t.id, { grund: 'STAFF_UNAVAILABLE' }, FRUEH);

      const eintrag = await prisma.auditLogEntry.findFirstOrThrow({
        where: { entityId: t.id, action: 'APPOINTMENT_CANCELLED' },
      });

      expect(eintrag.actorUserId).toBe(anna.id);
      expect(eintrag.metadata).toMatchObject({
        nachher: 'CANCELLED_BY_STAFF',
        grund: 'STAFF_UNAVAILABLE',
      });
    });

    it('haelt die alte und die neue Zeit fest', async () => {
      const t = await buchen();
      await storno.verschieben(kundin, t.id, '2026-10-01T11:00:00.000Z', FRUEH);

      const eintrag = await prisma.auditLogEntry.findFirstOrThrow({
        where: { entityId: t.id, action: 'APPOINTMENT_RESCHEDULED' },
      });

      expect(eintrag.metadata).toMatchObject({
        vonStartsAt: START,
        nachStartsAt: '2026-10-01T11:00:00.000Z',
      });
    });
  });

  // --------------------------------------------------- Das Abnahmekriterium

  describe('Abnahmekriterium von Schritt 23', () => {
    it('gibt den Slot nach einer Stornierung wieder frei', async () => {
      expect(await slots()).toContain(START);

      const t = await buchen();
      expect(await slots()).not.toContain(START);

      await storno.stornieren(kundin, t.id, {}, FRUEH);
      expect(await slots()).toContain(START);

      // Und die Zeit laesst sich wirklich wieder buchen, nicht nur anzeigen.
      const zweiter = await buchung.buchen(
        andereKundin.id,
        { serviceId, staffId, startsAt: START },
        FRUEH,
      );
      expect(zweiter.id).not.toBe(t.id);
    });

    it('lehnt eine Stornierung nach Fristablauf ab', async () => {
      const t = await buchen();

      await expect(storno.stornieren(kundin, t.id, {}, SPAET)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      // Der Termin steht noch.
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
        'CONFIRMED',
      );
    });

    it('laesst das Studio auch nach Fristablauf absagen', async () => {
      // Wenn die Behandlerin krank wird, hilft es niemandem, dass die Absage
      // zu spaet kommt.
      const t = await buchen();
      await storno.stornieren(anna, t.id, { grund: 'STAFF_UNAVAILABLE' }, SPAET);

      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
        'CANCELLED_BY_STAFF',
      );
    });

    it('laesst die Kundin genau auf der Fristgrenze noch absagen', async () => {
      const t = await buchen();
      // Genau 24 Stunden vorher.
      const grenze = new Date('2026-09-30T09:00:00.000Z');
      await storno.stornieren(kundin, t.id, {}, grenze);

      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
        'CANCELLED_BY_CUSTOMER',
      );
    });
  });
});
