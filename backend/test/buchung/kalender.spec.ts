import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { TokenService } from '../../src/auth/token.service';
import { prisma, truncateAll } from '../helpers/db';

/**
 * Der Admin-Kalender (Schritt 25).
 *
 * Der wichtigste Fall steht unter „Sichtbarkeit": Eine Kosmetiker:in darf die
 * Termine einer Kollegin nicht sehen. Nicht ausgeblendet in der Oberfläche —
 * die Abfrage gibt sie gar nicht erst her.
 */
describe('Admin-Kalender', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let sitzungen: TokenService;

  let adminToken = '';
  let annaToken = '';
  let beaToken = '';
  let kundinToken = '';
  let annaId = '';
  let beaId = '';
  let serviceId = '';
  let kundinId = '';

  const TAG = '2026-10-01';

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

  beforeEach(async () => {
    await truncateAll();

    const nutzer = (email: string, rolle: 'ADMIN' | 'STAFF' | 'CUSTOMER') =>
      prisma.user.create({
        data: {
          email,
          passwordHash: 'x',
          role: rolle,
          firstName: 'Lea',
          lastName: 'Muster',
          phone: '+43 1 2345678',
          emailVerifiedAt: new Date(),
        },
      });

    const admin = await nutzer('admin@test.invalid', 'ADMIN');
    const a = await nutzer('anna@test.invalid', 'STAFF');
    const b = await nutzer('bea@test.invalid', 'STAFF');
    const k = await nutzer('kundin@test.invalid', 'CUSTOMER');

    const profilA = await prisma.staffProfile.create({
      data: { userId: a.id, displayName: 'Anna', colorHex: '#7a8c6f' },
    });
    const profilB = await prisma.staffProfile.create({
      data: { userId: b.id, displayName: 'Bea', colorHex: '#9c7a53' },
    });

    const leistung = await prisma.service.create({
      data: {
        name: 'Gesichtsbehandlung',
        durationMinutes: 60,
        bufferMinutes: 15,
        priceCents: 8900,
      },
    });

    annaId = profilA.id;
    beaId = profilB.id;
    serviceId = leistung.id;
    kundinId = k.id;

    adminToken = (await sitzungen.issuePair(admin.id, 'ADMIN')).accessToken;
    annaToken = (await sitzungen.issuePair(a.id, 'STAFF')).accessToken;
    beaToken = (await sitzungen.issuePair(b.id, 'STAFF')).accessToken;
    kundinToken = (await sitzungen.issuePair(k.id, 'CUSTOMER')).accessToken;
  });

  async function termin(staffId: string, stunde: number) {
    return prisma.appointment.create({
      data: {
        customerId: kundinId,
        staffId,
        serviceId,
        startsAt: new Date(`2026-10-01T${String(stunde).padStart(2, '0')}:00:00Z`),
        endsAt: new Date(`2026-10-01T${String(stunde + 1).padStart(2, '0')}:00:00Z`),
        priceCentsSnapshot: 8900,
      },
    });
  }

  const blatt = (token: string, von = TAG, bis = TAG, staffId?: string) =>
    request(server)
      .get(
        `/api/v1/admin/kalender?von=${von}&bis=${bis}` +
          (staffId !== undefined ? `&staffId=${staffId}` : ''),
      )
      .set('Authorization', `Bearer ${token}`);

  describe('Sichtbarkeit', () => {
    it('zeigt der Studioleitung alle Termine', async () => {
      await termin(annaId, 9);
      await termin(beaId, 11);

      const antwort = await blatt(adminToken).expect(200);
      expect(antwort.body.termine).toHaveLength(2);
      expect(antwort.body.staff).toHaveLength(2);
    });

    it('zeigt einer Kosmetiker:in nur die eigenen Termine', async () => {
      await termin(annaId, 9);
      await termin(beaId, 11);

      const antwort = await blatt(annaToken).expect(200);

      expect(antwort.body.termine).toHaveLength(1);
      expect(antwort.body.termine[0].staff.id).toBe(annaId);
      // Auch die Spalten: Bea taucht nicht einmal als Kopfzeile auf.
      expect(antwort.body.staff).toHaveLength(1);
      expect(antwort.body.staff[0].displayName).toBe('Anna');
    });

    it('laesst eine Kosmetiker:in nicht nach den Terminen einer Kollegin fragen', async () => {
      await termin(beaId, 11);

      // Der Filterwunsch des Clients kann nur weiter einschraenken, nie
      // erweitern. Anna fragt nach Beas Spalte und bekommt ihre eigene.
      const antwort = await blatt(annaToken, TAG, TAG, beaId).expect(200);

      expect(antwort.body.termine).toHaveLength(0);
      expect(antwort.body.staff[0].displayName).toBe('Anna');
    });

    it('zeigt jeder Kosmetiker:in ihre eigene Spalte', async () => {
      await termin(annaId, 9);
      await termin(beaId, 11);

      const beas = await blatt(beaToken).expect(200);
      expect(beas.body.termine).toHaveLength(1);
      expect(beas.body.termine[0].staff.displayName).toBe('Bea');
    });

    it('laesst die Studioleitung auf eine Person filtern', async () => {
      await termin(annaId, 9);
      await termin(beaId, 11);

      const antwort = await blatt(adminToken, TAG, TAG, beaId).expect(200);
      expect(antwort.body.termine).toHaveLength(1);
      expect(antwort.body.termine[0].staff.displayName).toBe('Bea');
    });

    it('weist Kundinnen ab', async () => {
      await blatt(kundinToken).expect(403);
    });

    it('weist ohne Anmeldung ab', async () => {
      await request(server).get(`/api/v1/admin/kalender?von=${TAG}&bis=${TAG}`).expect(401);
    });
  });

  describe('Inhalt', () => {
    it('liefert alles, was das Raster braucht', async () => {
      const t = await termin(annaId, 9);
      const antwort = await blatt(adminToken).expect(200);
      const eintrag = antwort.body.termine[0];

      expect(eintrag.id).toBe(t.id);
      expect(eintrag.startsAt).toBe('2026-10-01T09:00:00.000Z');
      expect(eintrag.endsAt).toBe('2026-10-01T10:00:00.000Z');
      // Die Aufraeumzeit gehoert in den Kalender — sie blockiert ihn.
      expect(eintrag.blockiertBis).toBe('2026-10-01T10:15:00.000Z');
      expect(eintrag.staff.colorHex).toBe('#7a8c6f');
      expect(eintrag.customer.vorname).toBe('Lea');
      expect(eintrag.customer.telefon).toBe('+43 1 2345678');
    });

    it('liefert Abwesenheiten mit', async () => {
      // Sie erklaeren, warum an einer Stelle nichts gebucht werden kann.
      await prisma.timeOff.create({
        data: {
          staffId: annaId,
          type: 'VACATION',
          startsAt: new Date('2026-10-01T10:00:00Z'),
          endsAt: new Date('2026-10-01T14:00:00Z'),
        },
      });

      const antwort = await blatt(adminToken).expect(200);
      expect(antwort.body.abwesenheiten).toHaveLength(1);
      expect(antwort.body.abwesenheiten[0].type).toBe('VACATION');
    });

    it('zeigt einer Kosmetiker:in den studioweiten Feiertag', async () => {
      await prisma.timeOff.create({
        data: {
          staffId: null,
          type: 'PUBLIC_HOLIDAY',
          startsAt: new Date('2026-09-30T22:00:00Z'),
          endsAt: new Date('2026-10-01T22:00:00Z'),
        },
      });

      const antwort = await blatt(annaToken).expect(200);
      expect(antwort.body.abwesenheiten).toHaveLength(1);
      expect(antwort.body.abwesenheiten[0].staffId).toBeNull();
    });

    it('findet einen Termin, der in den Zeitraum hineinragt', async () => {
      // Der haeufigste Abfragefehler: nur suchen, was im Zeitraum beginnt.
      await prisma.appointment.create({
        data: {
          customerId: kundinId,
          staffId: annaId,
          serviceId,
          startsAt: new Date('2026-09-30T23:30:00Z'),
          endsAt: new Date('2026-10-01T00:30:00Z'),
          priceCentsSnapshot: 8900,
        },
      });

      expect((await blatt(adminToken).expect(200)).body.termine).toHaveLength(1);
    });

    it('liefert die Arbeitszeiten mit', async () => {
      // Ohne sie sieht ein leerer Kalender am Feiertag genauso aus wie an
      // einem Arbeitstag, an dem nur nichts gebucht ist.
      await prisma.workingHours.create({
        data: {
          staffId: annaId,
          weekday: 4,
          startTime: new Date('1970-01-01T09:00:00Z'),
          endTime: new Date('1970-01-01T17:00:00Z'),
        },
      });

      const antwort = await blatt(adminToken).expect(200);
      expect(antwort.body.arbeitszeiten).toEqual([
        { staffId: annaId, weekday: 4, von: '09:00', bis: '17:00' },
      ]);
    });

    it('zeigt auch stornierte Termine', async () => {
      // Der Kalender ist das Arbeitsmittel des Studios. Dass ein Termin
      // abgesagt wurde, ist dort eine Information und kein Grund, ihn
      // verschwinden zu lassen — die Oberflaeche stellt ihn anders dar.
      const t = await termin(annaId, 9);
      await prisma.appointment.update({
        where: { id: t.id },
        data: { status: 'CANCELLED_BY_CUSTOMER', cancelledAt: new Date() },
      });

      const antwort = await blatt(adminToken).expect(200);
      expect(antwort.body.termine).toHaveLength(1);
      expect(antwort.body.termine[0].status).toBe('CANCELLED_BY_CUSTOMER');
    });
  });

  describe('Zeitraum', () => {
    it('lehnt einen vertauschten Zeitraum ab', async () => {
      await blatt(adminToken, '2026-10-05', '2026-10-01').expect(400);
    });

    it('lehnt einen unsinnigen Zeitraum ab', async () => {
      await blatt(adminToken, 'heute', 'morgen').expect(400);
    });

    it('lehnt einen zu grossen Zeitraum ab', async () => {
      await blatt(adminToken, '2026-01-01', '2026-12-31').expect(400);
    });

    it('nimmt eine ganze Woche an', async () => {
      await termin(annaId, 9);
      const antwort = await blatt(adminToken, '2026-09-28', '2026-10-04').expect(200);
      expect(antwort.body.termine).toHaveLength(1);
    });
  });
});
