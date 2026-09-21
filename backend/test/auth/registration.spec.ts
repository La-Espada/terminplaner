import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { prisma, truncateAll } from '../helpers/db';
import { mailsLeeren, tokenAusNeuesterMail } from '../helpers/mailpit';

/**
 * Registrierung und E-Mail-Verifizierung (Schritt 8).
 *
 * Läuft gegen die echte Anwendung und die echte Datenbank. Mails landen in
 * Mailpit, es verlässt nichts den Rechner.
 */
describe('Registrierung', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const gueltig = {
    email: 'Lea.Test@Example.invalid',
    password: 'ein-langes-passwort',
    firstName: 'Lea',
    lastName: 'Muster',
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedMarketing: false,
  };

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  it('legt ein Konto mit Rolle CUSTOMER an und protokolliert die Einwilligungen', async () => {
    await request(server).post('/api/v1/auth/register').send(gueltig).expect(202);

    const user = await prisma.user.findFirstOrThrow({ include: { consents: true } });
    expect(user.role).toBe('CUSTOMER');
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(gueltig.password);

    const einwilligungen = Object.fromEntries(user.consents.map((c) => [c.type, c.granted]));
    expect(einwilligungen).toEqual({ TOS: true, PRIVACY: true, MARKETING: false });
    expect(user.consents.every((c) => c.version.length > 0)).toBe(true);
  });

  it('nimmt keine Rolle von außen entgegen', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ ...gueltig, role: 'ADMIN' })
      .expect(400); // forbidNonWhitelisted weist unbekannte Felder ab

    expect(await prisma.user.count()).toBe(0);
  });

  it('verlangt beide Pflicht-Einwilligungen', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ ...gueltig, acceptedPrivacy: false })
      .expect(400);

    expect(await prisma.user.count()).toBe(0);
  });

  it('weist zu kurze Passwörter ab', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ ...gueltig, password: 'kurz' })
      .expect(400);
  });

  /**
   * Der wichtigste Test dieser Datei. Der Endpunkt darf nicht verraten, wer hier
   * Kundin ist — bei einer Arztpraxis wäre schon diese Information heikel.
   */
  it('verrät nicht, ob eine Adresse bereits vergeben ist', async () => {
    const erste = await request(server).post('/api/v1/auth/register').send(gueltig).expect(202);

    const zweite = await request(server)
      .post('/api/v1/auth/register')
      .send({ ...gueltig, firstName: 'Angreifer', password: 'anderes-langes-passwort' })
      .expect(202);

    expect(zweite.body).toEqual(erste.body);
    // Und es entsteht kein zweites Konto.
    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.user.findFirstOrThrow()).firstName).toBe('Lea');
  });

  it('behandelt Groß- und Kleinschreibung der Adresse als dieselbe Person', async () => {
    await request(server).post('/api/v1/auth/register').send(gueltig).expect(202);
    await request(server)
      .post('/api/v1/auth/register')
      .send({ ...gueltig, email: 'LEA.TEST@EXAMPLE.INVALID' })
      .expect(202);

    expect(await prisma.user.count()).toBe(1);
  });
});

describe('E-Mail-Verifizierung', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modul.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  it('bestätigt die Adresse und wirkt genau einmal', async () => {
    await mailsLeeren();

    await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: 'verify@example.invalid',
        password: 'ein-langes-passwort',
        firstName: 'Vera',
        lastName: 'Test',
        acceptedTerms: true,
        acceptedPrivacy: true,
      })
      .expect(202);

    const token = await tokenAusNeuesterMail();

    await request(server).post('/api/v1/auth/verify-email').send({ token }).expect(200);
    expect((await prisma.user.findFirstOrThrow()).emailVerifiedAt).not.toBeNull();

    // Zweiter Versuch mit demselben Token
    await request(server).post('/api/v1/auth/verify-email').send({ token }).expect(400);
  });

  it('weist einen erfundenen Token ab', async () => {
    await request(server)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'a'.repeat(43) })
      .expect(400);
  });

  it('speichert den Token nur als Hash, nie im Klartext', async () => {
    await mailsLeeren();

    await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: 'hash@example.invalid',
        password: 'ein-langes-passwort',
        firstName: 'Hans',
        lastName: 'Test',
        acceptedTerms: true,
        acceptedPrivacy: true,
      })
      .expect(202);

    const token = await tokenAusNeuesterMail();
    const gespeichert = await prisma.authToken.findFirstOrThrow();

    expect(gespeichert.tokenHash).not.toBe(token);
    expect(gespeichert.tokenHash).toHaveLength(64); // SHA-256 als Hex
  });
});
