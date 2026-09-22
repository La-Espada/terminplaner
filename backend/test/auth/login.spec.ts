import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { TokenService } from '../../src/auth/token.service';
import { prisma, truncateAll } from '../helpers/db';

/**
 * Anmeldung, Rotation und Diebstahlerkennung (Schritt 9).
 */
describe('Anmeldung', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let passwoerter: PasswordService;

  const PASSWORT = 'ein-langes-passwort';

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
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  async function legeAn(
    email: string,
    rolle: 'ADMIN' | 'CUSTOMER' = 'CUSTOMER',
    optionen: { bestaetigt?: boolean; gesperrt?: boolean } = {},
  ) {
    return prisma.user.create({
      data: {
        email,
        passwordHash: await passwoerter.hashPassword(PASSWORT),
        role: rolle,
        firstName: 'Test',
        lastName: 'Person',
        emailVerifiedAt: optionen.bestaetigt === false ? null : new Date(),
        status: optionen.gesperrt === true ? 'BLOCKED' : 'ACTIVE',
      },
    });
  }

  it('meldet mit richtigem Passwort an und liefert ein Token-Paar', async () => {
    await legeAn('admin@test.invalid', 'ADMIN');

    const antwort = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.invalid', password: PASSWORT })
      .expect(200);

    expect(antwort.body.accessToken).toMatch(/^eyJ/);
    expect(antwort.body.expiresIn).toBe(900);
    expect(antwort.body.refreshToken).toBeTruthy();

    // Der Refresh-Token geht zusätzlich als httpOnly-Cookie raus.
    const cookies = antwort.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.includes('terminplaner_refresh') && c.includes('HttpOnly'))).toBe(
      true,
    );
  });

  /**
   * Der Login darf nicht verraten, wer hier Patientin ist — sonst ist die
   * Zurückhaltung bei der Registrierung umsonst.
   */
  it('antwortet bei falschem Passwort und unbekannter Adresse gleich', async () => {
    await legeAn('bekannt@test.invalid');

    const falsch = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'bekannt@test.invalid', password: 'ganz-falsches-passwort' })
      .expect(401);

    const unbekannt = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'niemand@test.invalid', password: 'ganz-falsches-passwort' })
      .expect(401);

    expect(falsch.body.message).toBe(unbekannt.body.message);
  });

  it('lässt gesperrte Konten nicht herein, ohne das zu verraten', async () => {
    await legeAn('gesperrt@test.invalid', 'CUSTOMER', { gesperrt: true });

    const antwort = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'gesperrt@test.invalid', password: PASSWORT })
      .expect(401);

    expect(antwort.body.message).toBe('E-Mail-Adresse oder Passwort ist falsch.');
  });

  it('verlangt eine bestätigte E-Mail-Adresse', async () => {
    await legeAn('unbestaetigt@test.invalid', 'CUSTOMER', { bestaetigt: false });

    const antwort = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'unbestaetigt@test.invalid', password: PASSWORT })
      .expect(401);

    // Hier ist eine eigene Meldung richtig: Wer das Passwort kennt, dem ist
    // nichts mehr zu verbergen, und er braucht die Anleitung.
    expect(antwort.body.message).toContain('bestätigen');
  });
});

describe('Token-Rotation', () => {
  let app: INestApplication;
  let sitzungen: TokenService;
  let passwoerter: PasswordService;

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
    await app.init();
    sitzungen = modul.get(TokenService);
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

  async function neueSitzung() {
    const user = await prisma.user.create({
      data: {
        email: `rot-${Date.now()}@test.invalid`,
        passwordHash: await passwoerter.hashPassword('ein-langes-passwort'),
        role: 'CUSTOMER',
        firstName: 'Rota',
        lastName: 'Tion',
        emailVerifiedAt: new Date(),
      },
    });
    return { user, paar: await sitzungen.issuePair(user.id, 'CUSTOMER') };
  }

  it('gibt bei jedem Refresh einen neuen Token aus', async () => {
    const { paar } = await neueSitzung();
    const neu = await sitzungen.rotate(paar.refreshToken);

    expect(neu).not.toBeNull();
    expect(neu?.refreshToken).not.toBe(paar.refreshToken);
  });

  /**
   * Eine harmlose Doppelanfrage — zwei Tabs, ein Wiederholungsversuch, React im
   * Entwicklungsmodus — darf die Sitzung nicht abwürgen.
   */
  it('lässt eine sofortige Wiederholung innerhalb der Nachfrist durch', async () => {
    const { paar } = await neueSitzung();
    await sitzungen.rotate(paar.refreshToken);

    const nochmal = await sitzungen.rotate(paar.refreshToken);
    expect(nochmal).not.toBeNull();
  });

  /**
   * Der eigentliche Schutz: Nach Ablauf der Nachfrist gilt die Wiederverwendung
   * als Diebstahl, und die ganze Familie fliegt raus.
   */
  it('entwertet nach der Nachfrist die ganze Familie', async () => {
    const { user, paar } = await neueSitzung();
    const zweiter = await sitzungen.rotate(paar.refreshToken);
    expect(zweiter).not.toBeNull();

    // Nachfrist künstlich verstreichen lassen, statt 15 Sekunden zu warten.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const diebstahl = await sitzungen.rotate(paar.refreshToken);
    expect(diebstahl).toBeNull();

    // Und der rechtmäßige Nachfolger ist jetzt ebenfalls entwertet.
    const nachfolger = await sitzungen.rotate(zweiter!.refreshToken);
    expect(nachfolger).toBeNull();
  });

  it('macht einen abgemeldeten Token unbrauchbar', async () => {
    const { paar } = await neueSitzung();
    await sitzungen.revoke(paar.refreshToken);

    // Abmeldung ist kein Diebstahl, aber der Token ist trotzdem tot.
    const nachher = await prisma.refreshToken.findFirstOrThrow();
    expect(nachher.revokedReason).toBe('LOGOUT');
  });
});
