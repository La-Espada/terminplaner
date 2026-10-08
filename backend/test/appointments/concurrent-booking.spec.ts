import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { BookingService } from '../../src/appointments/booking.service';
import { at, createFixture, prisma, truncateAll, type Fixture } from '../helpers/db';

/**
 * Der wichtigste Test des ganzen Projekts.
 *
 * Wenn zwei Kundinnen im selben Moment auf denselben Slot tippen, darf genau eine
 * den Termin bekommen. Eine Prüfung in der Anwendung ("gibt es schon einen Termin?"
 * -> "nein" -> "einfügen") hat immer ein Zeitfenster dazwischen, durch das beide
 * hindurchrutschen. Nur die Datenbank kann das atomar entscheiden.
 *
 * Siehe docs/ENTSCHEIDUNGEN.md E-07 und docs/UMSETZUNG.md Schritt 6.
 */

const VERSUCHE = 50;

describe('Nebenläufige Buchung auf denselben Slot', () => {
  let fx: Fixture;

  beforeEach(async () => {
    await truncateAll();
    fx = await createFixture();
  });

  afterAll(async () => {
    await truncateAll();
    await prisma.$disconnect();
  });

  it(`lässt von ${VERSUCHE} gleichzeitigen Einfügungen genau eine durch (Datenbankebene)`, async () => {
    const versuche = Array.from({ length: VERSUCHE }, () =>
      prisma.appointment.create({
        data: {
          customerId: fx.customerId,
          staffId: fx.staffAId,
          serviceId: fx.serviceId,
          startsAt: at(9),
          endsAt: at(10),
          priceCentsSnapshot: 4590,
        },
      }),
    );

    const ergebnisse = await Promise.allSettled(versuche);
    const erfolge = ergebnisse.filter((r) => r.status === 'fulfilled');
    const fehler = ergebnisse.filter((r) => r.status === 'rejected');

    expect(erfolge).toHaveLength(1);
    expect(fehler).toHaveLength(VERSUCHE - 1);

    // Und die Datenbank enthält am Ende tatsächlich nur einen Termin.
    const gespeichert = await prisma.appointment.count({ where: { staffId: fx.staffAId } });
    expect(gespeichert).toBe(1);
  });

  it('erlaubt gleichzeitige Buchungen bei verschiedenen Kosmetiker:innen', async () => {
    const ergebnisse = await Promise.allSettled([
      prisma.appointment.create({
        data: {
          customerId: fx.customerId,
          staffId: fx.staffAId,
          serviceId: fx.serviceId,
          startsAt: at(9),
          endsAt: at(10),
          priceCentsSnapshot: 4590,
        },
      }),
      prisma.appointment.create({
        data: {
          customerId: fx.customerId,
          staffId: fx.staffBId,
          serviceId: fx.serviceId,
          startsAt: at(9),
          endsAt: at(10),
          priceCentsSnapshot: 4590,
        },
      }),
    ]);

    expect(ergebnisse.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });
});

/**
 * Derselbe Nachweis eine Ebene höher, über den Buchungsdienst.
 *
 * Bis Schritt 22 stand hier ein absichtlich roter Platzhalter, der bei jedem
 * Testlauf daran erinnerte, was noch fehlt. Jetzt stehen die Zusicherungen da,
 * die er verlangt hat: genau eine Buchung erfolgreich, der Rest als Konflikt
 * statt als Serverfehler, Ende und Preis vom Server berechnet.
 *
 * Der Unterschied zwischen 409 und 500 ist nicht kosmetisch. Bei 409 lädt die
 * App die Slots neu und bietet eine Alternative an; bei 500 zeigt sie „Es ist
 * ein Fehler aufgetreten" und die Kundin ruft an.
 */
describe('Nebenläufige Buchung über den Buchungsdienst', () => {
  let app: INestApplication;
  let buchung: BookingService;
  let fx: Fixture;
  let serviceDauer = 60;

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
    await app.init();
    buchung = modul.get(BookingService);
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
  });

  /**
   * `at()` aus der Fixture liefert Zeiten am Donnerstag, 1. Oktober 2026.
   * `JETZT` liegt knapp davor, damit Vorlaufzeit und Horizont nicht greifen.
   */
  const JETZT = new Date('2026-09-25T06:00:00Z');

  beforeEach(async () => {
    await truncateAll();
    fx = await createFixture();

    // Die Fixture legt keine Arbeitszeiten an — ohne sie gäbe es keinen
    // einzigen angebotenen Slot und der Test prüfte nichts.
    for (const staffId of [fx.staffAId, fx.staffBId]) {
      await prisma.workingHours.createMany({
        data: [1, 2, 3, 4, 5].map((weekday) => ({
          staffId,
          weekday,
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T18:00:00Z'),
        })),
      });
    }

    // Die Personen der Fixture brauchen einen eingelösten Zugang, sonst gelten
    // sie als nicht buchbar.
    await prisma.user.updateMany({
      where: { role: 'STAFF' },
      data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
    });

    serviceDauer = (await prisma.service.findUniqueOrThrow({ where: { id: fx.serviceId } }))
      .durationMinutes;
  });

  const wunsch = (staffId: string, stunde = 9) => ({
    serviceId: fx.serviceId,
    staffId,
    startsAt: at(stunde).toISOString(),
  });

  it(`lässt von ${VERSUCHE} gleichzeitigen Buchungen genau eine durch`, async () => {
    const versuche = Array.from({ length: VERSUCHE }, () =>
      buchung.buchen(fx.customerId, wunsch(fx.staffAId), JETZT),
    );

    const ergebnisse = await Promise.allSettled(versuche);
    const erfolge = ergebnisse.filter((r) => r.status === 'fulfilled');
    const fehler = ergebnisse.filter((r) => r.status === 'rejected');

    expect(erfolge).toHaveLength(1);
    expect(fehler).toHaveLength(VERSUCHE - 1);

    // Jeder Fehlschlag ist ein Konflikt, kein Serverfehler.
    for (const f of fehler) {
      const grund: unknown = (f as PromiseRejectedResult).reason;
      expect(grund).toBeInstanceOf(ConflictException);
      expect((grund as ConflictException).getStatus()).toBe(409);
    }

    expect(await prisma.appointment.count({ where: { staffId: fx.staffAId } })).toBe(1);
  });

  it('berechnet Ende und Preis selbst', async () => {
    const termin = await buchung.buchen(fx.customerId, wunsch(fx.staffAId), JETZT);

    const erwartetesEnde = new Date(at(9).getTime() + serviceDauer * 60_000);
    expect(termin.endsAt).toBe(erwartetesEnde.toISOString());

    const leistung = await prisma.service.findUniqueOrThrow({ where: { id: fx.serviceId } });
    expect(termin.priceCents).toBe(leistung.priceCents);

    // Und beides steht auch so in der Datenbank — nicht nur in der Antwort.
    const gespeichert = await prisma.appointment.findUniqueOrThrow({ where: { id: termin.id } });
    expect(gespeichert.endsAt.toISOString()).toBe(erwartetesEnde.toISOString());
    expect(gespeichert.priceCentsSnapshot).toBe(leistung.priceCents);
  });

  it('erlaubt dieselbe Zeit bei verschiedenen Kosmetiker:innen', async () => {
    const ergebnisse = await Promise.allSettled([
      buchung.buchen(fx.customerId, wunsch(fx.staffAId), JETZT),
      buchung.buchen(fx.customerId, wunsch(fx.staffBId), JETZT),
    ]);

    expect(ergebnisse.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });

  it('lehnt eine Zeit ab, die gar nicht angeboten wird', async () => {
    // 09:07 liegt nicht im Raster. Technisch buchbar, aber es bliebe ein Loch,
    // das nie wieder jemand fuellt.
    await expect(
      buchung.buchen(
        fx.customerId,
        { serviceId: fx.serviceId, staffId: fx.staffAId, startsAt: at(9, 7).toISOString() },
        JETZT,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lehnt eine Zeit ausserhalb der Arbeitszeit ab', async () => {
    await expect(
      buchung.buchen(fx.customerId, wunsch(fx.staffAId, 5), JETZT),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lehnt eine Buchung innerhalb der Vorlaufzeit ab', async () => {
    // Jetzt ist 08:30 am Buchungstag, der Slot um 09:00 liegt 30 Minuten
    // entfernt — die Vorlaufzeit betraegt 120.
    const knapp = new Date(at(8).getTime() + 30 * 60_000);
    await expect(buchung.buchen(fx.customerId, wunsch(fx.staffAId), knapp)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('gibt den Slot nach einer Stornierung wieder frei', async () => {
    const termin = await buchung.buchen(fx.customerId, wunsch(fx.staffAId), JETZT);

    await expect(buchung.buchen(fx.customerId, wunsch(fx.staffAId), JETZT)).rejects.toBeInstanceOf(
      ConflictException,
    );

    await prisma.appointment.update({
      where: { id: termin.id },
      data: { status: 'CANCELLED_BY_CUSTOMER', cancelledAt: new Date() },
    });

    // Dieselbe Zeit laesst sich jetzt erneut buchen. Das verbindet die
    // Slot-Berechnung mit dem Constraint: Beide muessen den stornierten Termin
    // als freigebend ansehen.
    const zweiter = await buchung.buchen(fx.customerId, wunsch(fx.staffAId), JETZT);
    expect(zweiter.id).not.toBe(termin.id);
  });
});
