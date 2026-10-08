import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { TokenService } from '../../src/auth/token.service';
import { prisma, truncateAll } from '../helpers/db';

/**
 * Termine verwalten (Schritt 26).
 *
 * Buchen im Namen einer Kundin, „nicht erschienen" vermerken, Kundensuche.
 * Das Verschieben prüft `storno.spec.ts`; hier geht es um die Wege, die es
 * nur für das Studio gibt.
 */
describe('Terminverwaltung durch das Studio', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let sitzungen: TokenService;

  let adminToken = '';
  let annaToken = '';
  let kundinToken = '';
  let annaId = '';
  let serviceId = '';
  let kundinId = '';

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
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

  /** Ein Werktag in drei Wochen — der Test kann die Uhr nicht anhalten. */
  function werktagInDreiWochen(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 21);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  let TAG = '';

  beforeEach(async () => {
    await truncateAll();
    TAG = werktagInDreiWochen();

    const nutzer = (
      email: string,
      rolle: 'ADMIN' | 'STAFF' | 'CUSTOMER',
      vorname: string,
      nachname: string,
    ) =>
      prisma.user.create({
        data: {
          email,
          passwordHash: 'x',
          role: rolle,
          firstName: vorname,
          lastName: nachname,
          phone: '+43 660 1234567',
          emailVerifiedAt: new Date(),
        },
      });

    const admin = await nutzer('admin@test.invalid', 'ADMIN', 'Aynur', 'Aslan');
    const a = await nutzer('anna@test.invalid', 'STAFF', 'Anna', 'Berger');
    const k = await nutzer('lea.huber@test.invalid', 'CUSTOMER', 'Lea', 'Huber');
    await nutzer('zweite@test.invalid', 'CUSTOMER', 'Nina', 'Wagner');

    const profil = await prisma.staffProfile.create({
      data: { userId: a.id, displayName: 'Anna' },
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

    annaId = profil.id;
    serviceId = leistung.id;
    kundinId = k.id;

    adminToken = (await sitzungen.issuePair(admin.id, 'ADMIN')).accessToken;
    annaToken = (await sitzungen.issuePair(a.id, 'STAFF')).accessToken;
    kundinToken = (await sitzungen.issuePair(k.id, 'CUSTOMER')).accessToken;
  });

  const alsToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function freierSlot(): Promise<string> {
    const antwort = await request(server)
      .get(`/api/v1/availability?serviceId=${serviceId}&staffId=${annaId}&from=${TAG}&to=${TAG}`)
      .expect(200);
    return (antwort.body as Array<{ startsAt: string }>)[2].startsAt;
  }

  describe('Kundensuche', () => {
    const suchen = (token: string, q: string) =>
      request(server).get(`/api/v1/admin/kalender/kundensuche?q=${q}`).set(alsToken(token));

    it('findet nach Nachname', async () => {
      const antwort = await suchen(adminToken, 'Huber').expect(200);
      expect(antwort.body).toHaveLength(1);
      expect(antwort.body[0].vorname).toBe('Lea');
    });

    it('findet nach E-Mail-Adresse', async () => {
      const antwort = await suchen(adminToken, 'lea.huber').expect(200);
      expect(antwort.body).toHaveLength(1);
    });

    it('sucht ohne Rücksicht auf Gross- und Kleinschreibung', async () => {
      expect((await suchen(adminToken, 'huber').expect(200)).body).toHaveLength(1);
    });

    it('liefert bei weniger als drei Zeichen nichts', async () => {
      // Sonst waere `q=a` eine Liste aller Patientinnen der Praxis.
      expect((await suchen(adminToken, 'hu').expect(200)).body).toEqual([]);
      expect((await suchen(adminToken, '').expect(200)).body).toEqual([]);
    });

    it('findet kein Personal und keine Studioleitung', async () => {
      // Die Suche ist fuer die Buchung am Telefon da, nicht als Adressbuch.
      expect((await suchen(adminToken, 'Berger').expect(200)).body).toEqual([]);
      expect((await suchen(adminToken, 'Aslan').expect(200)).body).toEqual([]);
    });

    it('weist Kundinnen ab', async () => {
      await suchen(kundinToken, 'Huber').expect(403);
    });
  });

  describe('Buchen im Namen einer Kundin', () => {
    const buchen = (token: string, rumpf: Record<string, unknown>) =>
      request(server).post('/api/v1/admin/kalender/termine').set(alsToken(token)).send(rumpf);

    it('legt einen Termin an und schreibt ihn der Kundin zu', async () => {
      const startsAt = await freierSlot();
      const antwort = await buchen(adminToken, {
        customerId: kundinId,
        serviceId,
        staffId: annaId,
        startsAt,
      }).expect(201);

      const gespeichert = await prisma.appointment.findUniqueOrThrow({
        where: { id: antwort.body.id },
      });
      expect(gespeichert.customerId).toBe(kundinId);
    });

    it('protokolliert, wer gehandelt hat — nicht fuer wen', async () => {
      // Sonst stuende im Protokoll, die Kundin habe selbst gebucht.
      const startsAt = await freierSlot();
      const antwort = await buchen(adminToken, {
        customerId: kundinId,
        serviceId,
        staffId: annaId,
        startsAt,
      }).expect(201);

      const eintrag = await prisma.auditLogEntry.findFirstOrThrow({
        where: { entityId: antwort.body.id, action: 'APPOINTMENT_CREATED' },
      });

      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@test.invalid' },
      });
      expect(eintrag.actorUserId).toBe(admin.id);
      expect(eintrag.metadata).toMatchObject({ customerId: kundinId });
    });

    it('weist Kosmetiker:innen ab', async () => {
      // Wer am Telefon bucht, entscheidet ueber die Auslastung des ganzen
      // Hauses, nicht nur ueber den eigenen Kalender.
      const startsAt = await freierSlot();
      await buchen(annaToken, {
        customerId: kundinId,
        serviceId,
        staffId: annaId,
        startsAt,
      }).expect(403);
    });

    it('weist Kundinnen ab', async () => {
      const startsAt = await freierSlot();
      await buchen(kundinToken, {
        customerId: kundinId,
        serviceId,
        staffId: annaId,
        startsAt,
      }).expect(403);
    });

    it('lehnt eine unbekannte Kundin ab', async () => {
      const startsAt = await freierSlot();
      await buchen(adminToken, {
        customerId: '00000000-0000-4000-8000-000000000000',
        serviceId,
        staffId: annaId,
        startsAt,
      }).expect(404);
    });

    it('laesst sich kein Personal als Kundin unterschieben', async () => {
      const anna = await prisma.user.findUniqueOrThrow({ where: { email: 'anna@test.invalid' } });
      const startsAt = await freierSlot();

      await buchen(adminToken, {
        customerId: anna.id,
        serviceId,
        staffId: annaId,
        startsAt,
      }).expect(404);
    });

    it('meldet einen belegten Slot als Konflikt', async () => {
      const startsAt = await freierSlot();
      await buchen(adminToken, {
        customerId: kundinId,
        serviceId,
        staffId: annaId,
        startsAt,
      }).expect(201);
      await buchen(adminToken, {
        customerId: kundinId,
        serviceId,
        staffId: annaId,
        startsAt,
      }).expect(409);
    });
  });

  describe('Nicht erschienen', () => {
    async function vergangenerTermin(status: 'CONFIRMED' | 'CANCELLED_BY_CUSTOMER' = 'CONFIRMED') {
      const gestern = new Date();
      gestern.setUTCDate(gestern.getUTCDate() - 1);
      const start = new Date(gestern.toISOString().slice(0, 10) + 'T09:00:00.000Z');

      return prisma.appointment.create({
        data: {
          customerId: kundinId,
          staffId: annaId,
          serviceId,
          startsAt: start,
          endsAt: new Date(start.getTime() + 3_600_000),
          priceCentsSnapshot: 8900,
          status,
          ...(status === 'CANCELLED_BY_CUSTOMER' ? { cancelledAt: new Date() } : {}),
        },
      });
    }

    const vermerken = (token: string, id: string) =>
      request(server)
        .post(`/api/v1/admin/kalender/termine/${id}/nicht-erschienen`)
        .set(alsToken(token))
        .send({});

    it('vermerkt einen vergangenen Termin', async () => {
      const t = await vergangenerTermin();
      await vermerken(adminToken, t.id).expect(204);

      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
        'NO_SHOW',
      );
    });

    it('laesst die behandelnde Kosmetiker:in vermerken', async () => {
      const t = await vergangenerTermin();
      await vermerken(annaToken, t.id).expect(204);
    });

    it('lehnt einen kuenftigen Termin ab', async () => {
      // Vorher waere es eine Behauptung ueber die Zukunft.
      const startsAt = await freierSlot();
      const antwort = await request(server)
        .post('/api/v1/admin/kalender/termine')
        .set(alsToken(adminToken))
        .send({ customerId: kundinId, serviceId, staffId: annaId, startsAt })
        .expect(201);

      await vermerken(adminToken, antwort.body.id).expect(409);
    });

    it('lehnt einen abgesagten Termin ab', async () => {
      // Wer absagt, erscheint nicht unentschuldigt.
      const t = await vergangenerTermin('CANCELLED_BY_CUSTOMER');
      await vermerken(adminToken, t.id).expect(409);
    });

    it('weist Kundinnen ab', async () => {
      const t = await vergangenerTermin();
      await vermerken(kundinToken, t.id).expect(403);
    });

    it('laesst den Vermerk zuruecknehmen', async () => {
      const t = await vergangenerTermin();
      await vermerken(adminToken, t.id).expect(204);

      await request(server)
        .delete(`/api/v1/admin/kalender/termine/${t.id}/nicht-erschienen`)
        .set(alsToken(adminToken))
        .expect(204);

      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
        'COMPLETED',
      );
    });

    it('protokolliert beides', async () => {
      const t = await vergangenerTermin();
      await vermerken(adminToken, t.id).expect(204);

      const eintraege = await prisma.auditLogEntry.findMany({
        where: { entityId: t.id, action: 'APPOINTMENT_NO_SHOW' },
      });
      expect(eintraege).toHaveLength(1);
      expect(eintraege[0].metadata).toMatchObject({ nachher: 'NO_SHOW' });
    });
  });
});
