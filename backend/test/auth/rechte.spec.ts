import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { TokenService } from '../../src/auth/token.service';
import type { AngemeldetePerson } from '../../src/auth/types';
import { ZugriffService } from '../../src/auth/zugriff.service';
import { at, prisma, truncateAll } from '../helpers/db';

/**
 * Rollen und Rechte (Schritt 10).
 *
 * Zwei Ebenen, die nicht verwechselt werden duerfen:
 *   1. Der Guard: Ist die Person angemeldet, und darf ihre Rolle hierher?
 *   2. Der ZugriffService: Darf sie auf *dieses konkrete Objekt* zugreifen?
 *
 * Die zweite Ebene wird gern vergessen — und genau sie entscheidet, ob eine
 * Kosmetikerin die Hautbefunde fremder Patientinnen lesen kann.
 */
describe('Anmeldepflicht', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let passwoerter: PasswordService;
  let sitzungen: TokenService;

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
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  async function kundin(email = 'k@test.invalid') {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await passwoerter.hashPassword('ein-langes-passwort'),
        role: 'CUSTOMER',
        firstName: 'Kira',
        lastName: 'Test',
        emailVerifiedAt: new Date(),
      },
    });
    const paar = await sitzungen.issuePair(user.id, 'CUSTOMER');
    return { user, token: paar.accessToken };
  }

  it('weist eine Anfrage ohne Token ab', async () => {
    await request(server).get('/api/v1/me').expect(401);
  });

  it('weist einen erfundenen Token ab', async () => {
    await request(server)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.erfunden.unsinn')
      .expect(401);
  });

  it('lässt eine angemeldete Person das eigene Profil sehen', async () => {
    const { user, token } = await kundin();

    const antwort = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(antwort.body.id).toBe(user.id);
    expect(antwort.body.role).toBe('CUSTOMER');
    // Der Hash darf unter keinen Umständen nach außen.
    expect(JSON.stringify(antwort.body)).not.toContain('argon2');
  });

  /**
   * Der Token lebt 15 Minuten. Wird ein Konto in der Zwischenzeit gesperrt,
   * muss der nächste Zugriff scheitern — ein gültiges JWT allein genügt nicht.
   */
  it('sperrt den Zugang, sobald das Konto gesperrt wird', async () => {
    const { user, token } = await kundin();

    await request(server).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);

    await prisma.user.update({ where: { id: user.id }, data: { status: 'BLOCKED' } });

    await request(server).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('lässt öffentliche Endpunkte ohne Anmeldung zu', async () => {
    await request(server).get('/api/v1/health').expect(200);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'niemand@test.invalid', password: 'falsches-passwort' })
      .expect(401); // 401 wegen der Anmeldedaten, nicht wegen fehlender Anmeldung
  });

  /**
   * Abmelden muss auch mit abgelaufenem Access-Token gehen. Sonst bliebe der
   * Refresh-Token bis zu 30 Tage gültig, obwohl die Person sich abmelden wollte.
   */
  it('erlaubt Abmelden ohne gültigen Access-Token', async () => {
    const { user } = await kundin();
    const paar = await sitzungen.issuePair(user.id, 'CUSTOMER');

    await request(server)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: paar.refreshToken })
      .expect(200);

    const nachher = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(nachher.revokedAt).not.toBeNull();
  });
});

describe('Objektbezogene Rechte', () => {
  let app: INestApplication;
  let zugriff: ZugriffService;
  let passwoerter: PasswordService;

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
    await app.init();
    zugriff = modul.get(ZugriffService);
    passwoerter = modul.get(PasswordService);
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  /** Zwei Kosmetikerinnen, zwei Kundinnen, ein Termin bei Anna. */
  async function szenario() {
    const service = await prisma.service.create({
      data: { name: 'Behandlung', durationMinutes: 60, priceCents: 4590 },
    });

    const mach = async (email: string, rolle: 'STAFF' | 'CUSTOMER' | 'ADMIN') =>
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

    const annaUser = await mach('anna@test.invalid', 'STAFF');
    const lisaUser = await mach('lisa@test.invalid', 'STAFF');
    const anna = await prisma.staffProfile.create({
      data: { userId: annaUser.id, displayName: 'Anna' },
    });
    const lisa = await prisma.staffProfile.create({
      data: { userId: lisaUser.id, displayName: 'Lisa' },
    });

    const kundinA = await mach('kundin-a@test.invalid', 'CUSTOMER');
    const kundinB = await mach('kundin-b@test.invalid', 'CUSTOMER');
    const adminUser = await mach('admin@test.invalid', 'ADMIN');

    const termin = await prisma.appointment.create({
      data: {
        customerId: kundinA.id,
        staffId: anna.id,
        serviceId: service.id,
        startsAt: at(9),
        endsAt: at(10),
        priceCentsSnapshot: 4590,
      },
    });

    const p = (id: string, role: 'STAFF' | 'CUSTOMER' | 'ADMIN', staffId: string | null = null) =>
      ({ id, role, staffProfileId: staffId }) satisfies AngemeldetePerson;

    return {
      termin,
      kundinA,
      kundinB,
      alsAnna: p(annaUser.id, 'STAFF', anna.id),
      alsLisa: p(lisaUser.id, 'STAFF', lisa.id),
      alsKundinA: p(kundinA.id, 'CUSTOMER'),
      alsKundinB: p(kundinB.id, 'CUSTOMER'),
      alsAdmin: p(adminUser.id, 'ADMIN'),
    };
  }

  it('lässt die behandelnde Kosmetikerin, die Kundin und den Admin an den Termin', async () => {
    const s = await szenario();

    await expect(zugriff.darfTerminSehen(s.alsAnna, s.termin.id)).resolves.toBeUndefined();
    await expect(zugriff.darfTerminSehen(s.alsKundinA, s.termin.id)).resolves.toBeUndefined();
    await expect(zugriff.darfTerminSehen(s.alsAdmin, s.termin.id)).resolves.toBeUndefined();
  });

  /**
   * Der Kern von Schritt 10: Lisa hat dieselbe Rolle wie Anna und käme durch
   * jeden Rollen-Guard — an diesen Termin darf sie trotzdem nicht.
   */
  it('hält eine fremde Kosmetikerin vom Termin fern', async () => {
    const s = await szenario();
    await expect(zugriff.darfTerminSehen(s.alsLisa, s.termin.id)).rejects.toThrow();
  });

  it('hält eine fremde Kundin vom Termin fern', async () => {
    const s = await szenario();
    await expect(zugriff.darfTerminSehen(s.alsKundinB, s.termin.id)).rejects.toThrow();
  });

  /**
   * Bei fremden Terminen melden wir „nicht gefunden" statt „verboten". Ein 403
   * würde bestätigen, dass die ID existiert — über durchprobierte IDs ließe sich
   * so ermitteln, wie ausgelastet die Praxis ist.
   */
  it('meldet bei fremden Terminen „nicht gefunden“, nicht „verboten“', async () => {
    const s = await szenario();
    await expect(zugriff.darfTerminSehen(s.alsLisa, s.termin.id)).rejects.toThrow(
      /nicht gefunden/i,
    );
  });

  describe('Behandlungshistorie (Art.-9-Daten)', () => {
    it('lässt die behandelnde Kosmetikerin herein', async () => {
      const s = await szenario();
      await expect(zugriff.darfHistorieSehen(s.alsAnna, s.kundinA.id)).resolves.toBeUndefined();
    });

    /**
     * Ohne diese Prüfung könnte jede Kosmetikerin die Hautbefunde jeder Kundin
     * lesen — bei einer Arztpraxis der gravierendste denkbare Fehler.
     */
    it('verlangt einen Behandlungsbezug', async () => {
      const s = await szenario();
      await expect(zugriff.darfHistorieSehen(s.alsLisa, s.kundinA.id)).rejects.toThrow();
      // Auch Anna nicht bei einer Kundin, die sie nie behandelt hat.
      await expect(zugriff.darfHistorieSehen(s.alsAnna, s.kundinB.id)).rejects.toThrow();
    });

    it('lässt die Kundin nur an die eigene Historie', async () => {
      const s = await szenario();
      await expect(zugriff.darfHistorieSehen(s.alsKundinA, s.kundinA.id)).resolves.toBeUndefined();
      await expect(zugriff.darfHistorieSehen(s.alsKundinA, s.kundinB.id)).rejects.toThrow();
    });
  });

  describe('Kalender', () => {
    it('lässt nur den eigenen Kalender bearbeiten', async () => {
      const s = await szenario();
      const annaProfil = s.alsAnna.staffProfileId!;

      expect(() => zugriff.darfKalenderBearbeiten(s.alsAnna, annaProfil)).not.toThrow();
      expect(() => zugriff.darfKalenderBearbeiten(s.alsLisa, annaProfil)).toThrow();
      expect(() => zugriff.darfKalenderBearbeiten(s.alsAdmin, annaProfil)).not.toThrow();
      expect(() => zugriff.darfKalenderBearbeiten(s.alsKundinA, annaProfil)).toThrow();
    });
  });
});
