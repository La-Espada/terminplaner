import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { TokenService } from '../../src/auth/token.service';
import { prisma, truncateAll } from '../helpers/db';

/**
 * Die Buchung über HTTP (Schritt 22).
 *
 * Die Nebenläufigkeit prüft `appointments/concurrent-booking.spec.ts` auf der
 * Ebene darunter. Hier geht es um die Oberfläche der API: Wer darf buchen, was
 * nimmt sie entgegen — und vor allem, was sie **nicht** entgegennimmt.
 */
describe('Buchen über die API', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let sitzungen: TokenService;

  let kundinToken = '';
  let zweiteKundinToken = '';
  let staffToken = '';
  let adminToken = '';
  let serviceId = '';
  let staffId = '';
  let kundinId = '';

  /**
   * Der Tag, an dem gebucht wird, und ein Slot darauf.
   *
   * Beides wird zur Laufzeit bestimmt, nicht fest eingetragen. Dieser Test
   * laeuft ueber HTTP und hat damit keine Moeglichkeit, die Uhr anzuhalten; ein
   * festes Datum waere irgendwann Vergangenheit und die Slot-Liste dauerhaft
   * leer. Der Slot kommt aus der Liste selbst — so haengt der Test nicht an
   * einer eigenen Annahme darueber, wie Ortszeit in UTC umgerechnet wird.
   */
  let TAG = '';
  let START = '';

  /** Ein Werktag in drei Wochen, als Ortsdatum. */
  function werktagInDreiWochen(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 21);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  async function slotsAmTag(): Promise<string[]> {
    const antwort = await request(server)
      .get(`/api/v1/availability?serviceId=${serviceId}&staffId=${staffId}&from=${TAG}&to=${TAG}`)
      .expect(200);
    return (antwort.body as Array<{ startsAt: string }>).map((x) => x.startsAt);
  }

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
    sitzungen = modul.get(TokenService);
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

    const kundin = await nutzer('kundin@test.invalid', 'CUSTOMER');
    const zweite = await nutzer('zweite@test.invalid', 'CUSTOMER');
    const staffUser = await nutzer('anna@test.invalid', 'STAFF');
    const admin = await nutzer('admin@test.invalid', 'ADMIN');

    const profil = await prisma.staffProfile.create({
      data: { userId: staffUser.id, displayName: 'Anna' },
    });

    const leistung = await prisma.service.create({
      data: {
        name: 'Gesichtsbehandlung',
        durationMinutes: 60,
        bufferMinutes: 15,
        priceCents: 8900,
      },
    });

    await prisma.staffService.create({ data: { staffId: profil.id, serviceId: leistung.id } });
    await prisma.workingHours.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        staffId: profil.id,
        weekday,
        startTime: new Date('1970-01-01T08:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      })),
    });

    kundinId = kundin.id;
    staffId = profil.id;
    serviceId = leistung.id;

    kundinToken = (await sitzungen.issuePair(kundin.id, 'CUSTOMER')).accessToken;
    zweiteKundinToken = (await sitzungen.issuePair(zweite.id, 'CUSTOMER')).accessToken;
    staffToken = (await sitzungen.issuePair(staffUser.id, 'STAFF')).accessToken;
    adminToken = (await sitzungen.issuePair(admin.id, 'ADMIN')).accessToken;

    TAG = werktagInDreiWochen();
    const slots = await slotsAmTag();
    // Aus der Mitte, damit Nachbarslots fuer die Konfliktfaelle bleiben.
    START = slots[Math.floor(slots.length / 2)];
  });

  const buchen = (token: string, rumpf: Record<string, unknown>) =>
    request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send(rumpf);

  const gueltig = () => ({ serviceId, staffId, startsAt: START });

  describe('Rechte', () => {
    it('weist ohne Anmeldung ab', async () => {
      await request(server).post('/api/v1/appointments').send(gueltig()).expect(401);
    });

    it('weist Kosmetiker:innen ab', async () => {
      // Im Namen einer Kundin zu buchen kommt mit dem Kalender in Schritt 26.
      // Bis dahin waere ein Endpunkt ohne Oberflaeche nur Angriffsflaeche.
      await buchen(staffToken, gueltig()).expect(403);
    });

    it('weist die Studioleitung ab', async () => {
      await buchen(adminToken, gueltig()).expect(403);
    });
  });

  describe('Was die API nicht entgegennimmt', () => {
    it('kein Ende', async () => {
      // Ein Client, der endsAt mitschicken duerfte, koennte eine einstuendige
      // Behandlung als fuenfminuetige buchen.
      await buchen(kundinToken, { ...gueltig(), endsAt: '2026-10-01T09:05:00Z' }).expect(400);
    });

    it('keinen Preis', async () => {
      await buchen(kundinToken, { ...gueltig(), priceCents: 1 }).expect(400);
    });

    it('keine fremde Kundin', async () => {
      await buchen(kundinToken, { ...gueltig(), customerId: kundinId }).expect(400);
    });

    it('keinen Freitext', async () => {
      // Das Feld existiert im Schema, aber Verschluesselung (Schritt 40) und
      // Einwilligung (Schritt 42) fehlen noch. Ein Feld, in das Kundinnen
      // erfahrungsgemaess Allergien schreiben, darf nicht vorher offen stehen.
      await buchen(kundinToken, { ...gueltig(), customerNote: 'Allergie gegen Nickel' }).expect(
        400,
      );
    });

    it('keinen unsinnigen Zeitpunkt', async () => {
      await buchen(kundinToken, { ...gueltig(), startsAt: 'morgen frueh' }).expect(400);
    });
  });

  describe('Buchen', () => {
    it('legt einen Termin an und rechnet selbst', async () => {
      const antwort = await buchen(kundinToken, gueltig()).expect(201);

      expect(antwort.body.startsAt).toBe(START);
      expect(antwort.body.endsAt).toBe(
        new Date(new Date(START).getTime() + 60 * 60_000).toISOString(),
      );
      expect(antwort.body.priceCents).toBe(8900);
      expect(antwort.body.status).toBe('CONFIRMED');

      const gespeichert = await prisma.appointment.findUniqueOrThrow({
        where: { id: antwort.body.id },
      });
      expect(gespeichert.customerId).toBe(kundinId);
      expect(gespeichert.priceCentsSnapshot).toBe(8900);
    });

    it('schreibt den Termin der angemeldeten Person zu, nicht einer mitgeschickten', async () => {
      const antwort = await buchen(zweiteKundinToken, gueltig()).expect(201);
      const gespeichert = await prisma.appointment.findUniqueOrThrow({
        where: { id: antwort.body.id },
      });

      expect(gespeichert.customerId).not.toBe(kundinId);
    });

    it('meldet einen bereits vergebenen Slot als Konflikt, nicht als Serverfehler', async () => {
      await buchen(kundinToken, gueltig()).expect(201);
      await buchen(zweiteKundinToken, gueltig()).expect(409);
    });

    it('haelt den Preis fest, auch wenn die Leistung spaeter teurer wird', async () => {
      const antwort = await buchen(kundinToken, gueltig()).expect(201);

      await prisma.service.update({ where: { id: serviceId }, data: { priceCents: 12900 } });

      const gespeichert = await prisma.appointment.findUniqueOrThrow({
        where: { id: antwort.body.id },
      });
      expect(gespeichert.priceCentsSnapshot).toBe(8900);
    });

    it('verschweigt den Grund, wenn eine Zeit nicht buchbar ist', async () => {
      // Belegt, im Urlaub oder ausserhalb der Arbeitszeit — welcher Grund
      // zutrifft, waere eine Auskunft ueber den Kalender einer Beschaeftigten.
      // 04:00 UTC ist je nach Jahreszeit 05:00 oder 06:00 Ortszeit und damit
      // in jedem Fall vor Arbeitsbeginn um 08:00.
      const ausserhalb = await buchen(kundinToken, {
        ...gueltig(),
        startsAt: `${TAG}T04:00:00.000Z`,
      }).expect(409);

      await buchen(kundinToken, gueltig()).expect(201);
      const belegt = await buchen(zweiteKundinToken, gueltig()).expect(409);

      expect(belegt.body.message).toBe(ausserhalb.body.message);
    });

    it('lehnt eine unbekannte Leistung ab', async () => {
      await buchen(kundinToken, {
        ...gueltig(),
        serviceId: '00000000-0000-4000-8000-000000000000',
      }).expect(404);
    });

    it('lehnt eine Person ab, die die Leistung nicht anbietet', async () => {
      await prisma.staffService.deleteMany({ where: { staffId } });
      await buchen(kundinToken, gueltig()).expect(404);
    });

    it('lehnt eine deaktivierte Person ab', async () => {
      await prisma.staffProfile.update({ where: { id: staffId }, data: { isActive: false } });
      await buchen(kundinToken, gueltig()).expect(404);
    });
  });

  describe('Zusammenspiel mit der Slot-Liste', () => {
    it('bietet nach der Buchung dieselbe Zeit nicht mehr an', async () => {
      expect(await slotsAmTag()).toContain(START);

      await buchen(kundinToken, gueltig()).expect(201);

      expect(await slotsAmTag()).not.toContain(START);
    });

    it('laesst sich jeder angebotene Slot auch wirklich buchen', async () => {
      // Der Test gegen die Schleife: Bietet die Slot-Liste etwas an, das der
      // Constraint ablehnt, endet jede Buchung darauf in 409, der Client laedt
      // neu und sieht denselben Slot wieder.
      const slots = await slotsAmTag();
      expect(slots.length).toBeGreaterThan(5);

      // Jeder zweite Slot — die dazwischen fallen durch Dauer und Puffer weg,
      // sobald die Nachbarn gebucht sind.
      for (const startsAt of slots.filter((_, i) => i % 6 === 0)) {
        const antwort = await buchen(kundinToken, { serviceId, staffId, startsAt });
        expect(antwort.status, `Slot ${startsAt}`).toBe(201);
      }
    });
  });
});
