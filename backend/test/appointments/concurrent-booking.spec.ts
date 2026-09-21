import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
 * Dieser Test ist ABSICHTLICH ROT, bis Schritt 22 der Umsetzungsreihenfolge die
 * Buchungslogik gebaut hat. Er steht schon jetzt hier, weil er die Anforderung
 * festhält, die dabei erfüllt werden muss: Der Dienst muss den Konflikt der
 * Datenbank abfangen und als sauberen 409-Fehler weiterreichen, statt ihn als
 * Serverfehler durchschlagen zu lassen.
 *
 * Solange er rot ist, erinnert er bei jedem Testlauf daran, was noch fehlt.
 */
describe('Nebenläufige Buchung über den Buchungsdienst (Schritt 22)', () => {
  const dienstPfad = resolve(__dirname, '../../src/appointments/booking.service.ts');

  it.fails('meldet 49 von 50 Versuchen als Konflikt statt als Serverfehler', () => {
    expect(
      existsSync(dienstPfad),
      'Der Buchungsdienst existiert noch nicht. Sobald er da ist, schlägt dieser Test ' +
        'unerwartet ins Grüne um — dann hier die echten Zusicherungen schreiben: ' +
        'genau eine Buchung erfolgreich, 49 mit 409 Conflict statt 500, ' +
        'ends_at und Preis vom Server berechnet. Danach it.fails entfernen.',
    ).toBe(true);
  });
});
