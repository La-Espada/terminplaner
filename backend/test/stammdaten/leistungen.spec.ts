import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { TokenService } from '../../src/auth/token.service';
import { at, prisma, truncateAll } from '../helpers/db';

/**
 * Leistungen verwalten (Schritt 17).
 */
describe('Leistungen', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let passwoerter: PasswordService;
  let sitzungen: TokenService;

  let adminToken: string;
  let staffToken: string;
  let staffProfilId: string;
  let kundinId: string;

  const beispiel = {
    name: 'Gesichtsbehandlung',
    description: 'Reinigung, Peeling, Maske',
    durationMinutes: 60,
    bufferMinutes: 15,
    priceCents: 8900,
  };

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
    passwoerter = modul.get(PasswordService);
    sitzungen = modul.get(TokenService);
  });

  beforeEach(async () => {
    await truncateAll();

    const mach = async (email: string, rolle: 'ADMIN' | 'STAFF' | 'CUSTOMER') =>
      prisma.user.create({
        data: {
          email,
          passwordHash: await passwoerter.hashPassword('ein-langes-passwort'),
          role: rolle,
          firstName: 'T',
          lastName: 'P',
          emailVerifiedAt: new Date(),
        },
      });

    const admin = await mach('admin@test.invalid', 'ADMIN');
    const staff = await mach('staff@test.invalid', 'STAFF');
    const kundin = await mach('kundin@test.invalid', 'CUSTOMER');
    const profil = await prisma.staffProfile.create({
      data: { userId: staff.id, displayName: 'Anna' },
    });

    staffProfilId = profil.id;
    kundinId = kundin.id;
    adminToken = (await sitzungen.issuePair(admin.id, 'ADMIN')).accessToken;
    staffToken = (await sitzungen.issuePair(staff.id, 'STAFF')).accessToken;
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  /** GET als Studioleitung. `.set()` kommt erst nach der Methode, nicht davor. */
  const holeAlsAdmin = (pfad: string) =>
    request(server).get(pfad).set('Authorization', `Bearer ${adminToken}`);

  async function anlegen(ueberschreiben: Partial<typeof beispiel> = {}) {
    const antwort = await request(server)
      .post('/api/v1/admin/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...beispiel, ...ueberschreiben })
      .expect(201);
    return antwort.body as { id: string; name: string; priceCents: number; isActive: boolean };
  }

  describe('Rechte', () => {
    it('lässt nur die Studioleitung verwalten', async () => {
      await request(server).get('/api/v1/admin/services').expect(401);

      await request(server)
        .get('/api/v1/admin/services')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);

      await request(server)
        .get('/api/v1/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('lässt Kosmetiker:innen keine Leistungen anlegen', async () => {
      await request(server)
        .post('/api/v1/admin/services')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(beispiel)
        .expect(403);

      expect(await prisma.service.count()).toBe(0);
    });
  });

  describe('Anlegen und Ändern', () => {
    it('legt eine Leistung an', async () => {
      const angelegt = await anlegen();

      expect(angelegt.name).toBe('Gesichtsbehandlung');
      expect(angelegt.priceCents).toBe(8900);
      expect(angelegt.isActive).toBe(true);
    });

    it('weist unsinnige Werte ab', async () => {
      // Dauer null
      await request(server)
        .post('/api/v1/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...beispiel, durationMinutes: 0 })
        .expect(400);

      // Negativer Preis
      await request(server)
        .post('/api/v1/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...beispiel, priceCents: -100 })
        .expect(400);

      // Preis als Kommazahl — die API nimmt nur ganze Cent (E-08)
      await request(server)
        .post('/api/v1/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...beispiel, priceCents: 89.5 })
        .expect(400);

      expect(await prisma.service.count()).toBe(0);
    });

    it('ändert einzelne Felder, ohne die anderen anzufassen', async () => {
      const angelegt = await anlegen();

      const geaendert = await request(server)
        .patch(`/api/v1/admin/services/${angelegt.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priceCents: 9500 })
        .expect(200);

      expect(geaendert.body.priceCents).toBe(9500);
      expect(geaendert.body.name).toBe('Gesichtsbehandlung');
      expect(geaendert.body.durationMinutes).toBe(60);
    });
  });

  describe('Sichtbarkeit für die Kundschaft', () => {
    /**
     * Seit Schritt 19 erscheint öffentlich nur, was auch jemand anbietet — eine
     * Leistung ohne Anbieterin wäre in der App eine Sackgasse. Die Fälle hier
     * prüfen aber die Sichtbarkeitsregeln der Leistung selbst, deshalb bekommt
     * jede eine Anbieterin, damit diese Bedingung nicht im Weg steht.
     */
    const mitAnbieterin = async (name: string, weiteres: Record<string, unknown> = {}) => {
      const leistung = await anlegen({ name, ...weiteres } as never);
      await prisma.staffService.create({
        data: { staffId: staffProfilId, serviceId: leistung.id },
      });
      return leistung;
    };

    it('zeigt nur aktive Leistungen und ohne interne Felder', async () => {
      await mitAnbieterin('Sichtbar');
      const versteckt = await mitAnbieterin('Versteckt');

      await request(server)
        .patch(`/api/v1/admin/services/${versteckt.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      // Öffentlich, ohne Anmeldung
      const oeffentlich = await request(server).get('/api/v1/services').expect(200);
      const namen = (oeffentlich.body as Array<{ name: string }>).map((l) => l.name);

      expect(namen).toEqual(['Sichtbar']);
      // Der Puffer ist eine interne Planungsgröße und geht Kundinnen nichts an.
      expect(oeffentlich.body[0]).not.toHaveProperty('bufferMinutes');
      expect(oeffentlich.body[0]).not.toHaveProperty('isActive');

      // Die Verwaltung sieht beide.
      const verwaltung = await holeAlsAdmin('/api/v1/admin/services').expect(200);
      expect(verwaltung.body).toHaveLength(2);
    });

    it('sortiert nach Reihenfolge, dann nach Name', async () => {
      await mitAnbieterin('Zuletzt', { sortOrder: 20 });
      await mitAnbieterin('Zuerst', { sortOrder: 10 });
      await mitAnbieterin('Auch zuerst', { sortOrder: 10 });

      const antwort = await request(server).get('/api/v1/services').expect(200);
      expect((antwort.body as Array<{ name: string }>).map((l) => l.name)).toEqual([
        'Auch zuerst',
        'Zuerst',
        'Zuletzt',
      ]);
    });

    it('verschweigt eine Leistung, die niemand anbietet', async () => {
      // Das zweite Abnahmekriterium von Schritt 19, hier noch einmal aus Sicht
      // der Leistungen: angelegt und aktiv genuegt nicht.
      await anlegen({ name: 'Ohne Anbieterin' });

      const antwort = await request(server).get('/api/v1/services').expect(200);
      expect(antwort.body).toEqual([]);
    });
  });

  describe('Löschen', () => {
    it('löscht eine nie gebuchte Leistung', async () => {
      const angelegt = await anlegen();

      await request(server)
        .delete(`/api/v1/admin/services/${angelegt.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(await prisma.service.count()).toBe(0);
    });

    /**
     * Der wichtigste Test dieser Datei. Auf jedem vergangenen Termin steht,
     * welche Behandlung stattgefunden hat — das ist Teil der Dokumentation.
     * Eine gebuchte Leistung zu löschen würde sie zerreißen.
     */
    it('verweigert das Löschen einer gebuchten Leistung und nennt den Ausweg', async () => {
      const angelegt = await anlegen();

      await prisma.appointment.create({
        data: {
          customerId: kundinId,
          staffId: staffProfilId,
          serviceId: angelegt.id,
          startsAt: at(9),
          endsAt: at(10),
          priceCentsSnapshot: 8900,
        },
      });

      const antwort = await request(server)
        .delete(`/api/v1/admin/services/${angelegt.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(antwort.body.message).toContain('Deaktivieren');
      expect(await prisma.service.count()).toBe(1);
    });

    it('lässt eine gebuchte Leistung stattdessen deaktivieren', async () => {
      const angelegt = await anlegen();
      await prisma.appointment.create({
        data: {
          customerId: kundinId,
          staffId: staffProfilId,
          serviceId: angelegt.id,
          startsAt: at(9),
          endsAt: at(10),
          priceCentsSnapshot: 8900,
        },
      });

      await request(server)
        .patch(`/api/v1/admin/services/${angelegt.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      // Nicht mehr buchbar …
      const oeffentlich = await request(server).get('/api/v1/services').expect(200);
      expect(oeffentlich.body).toHaveLength(0);

      // … aber der vergangene Termin bleibt vollständig lesbar.
      const termin = await prisma.appointment.findFirstOrThrow({ include: { service: true } });
      expect(termin.service.name).toBe('Gesichtsbehandlung');
    });
  });

  /**
   * Eine Preisänderung darf bereits gebuchte Termine nicht anfassen (E-09).
   * Sonst änderte sich rückwirkend, was eine Kundin bestätigt bekommen hat.
   */
  it('lässt gebuchte Termine von einer Preisänderung unberührt', async () => {
    const angelegt = await anlegen();
    await prisma.appointment.create({
      data: {
        customerId: kundinId,
        staffId: staffProfilId,
        serviceId: angelegt.id,
        startsAt: at(9),
        endsAt: at(10),
        priceCentsSnapshot: 8900,
      },
    });

    await request(server)
      .patch(`/api/v1/admin/services/${angelegt.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priceCents: 12000 })
      .expect(200);

    const termin = await prisma.appointment.findFirstOrThrow();
    expect(termin.priceCentsSnapshot).toBe(8900);
  });

  it('zeigt der Verwaltung, wie oft eine Leistung gebucht wurde', async () => {
    const angelegt = await anlegen();
    await prisma.appointment.create({
      data: {
        customerId: kundinId,
        staffId: staffProfilId,
        serviceId: angelegt.id,
        startsAt: at(9),
        endsAt: at(10),
        priceCentsSnapshot: 8900,
      },
    });

    const antwort = await holeAlsAdmin('/api/v1/admin/services').expect(200);
    expect(antwort.body[0].terminAnzahl).toBe(1);
  });
});
