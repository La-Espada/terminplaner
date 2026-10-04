import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { TokenService } from '../../src/auth/token.service';
import { prisma, truncateAll } from '../helpers/db';
import { mailAnzahl, mailsLeeren, neuesteMail, tokenAusNeuesterMail } from '../helpers/mailpit';

/**
 * Passwort zurücksetzen (Schritt 12).
 *
 * Der ganze Ablauf läuft über echten Mailversand und Mailpit — denselben Weg
 * nimmt auch eine Kundin.
 */
describe('Passwort zurücksetzen', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let passwoerter: PasswordService;
  let sitzungen: TokenService;

  const ALT = 'mein-altes-passwort';
  const NEU = 'mein-neues-passwort';

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
    await mailsLeeren();
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  async function kundin(optionen: { gesperrt?: boolean; bestaetigt?: boolean } = {}) {
    return prisma.user.create({
      data: {
        email: 'kundin@test.invalid',
        passwordHash: await passwoerter.hashPassword(ALT),
        role: 'CUSTOMER',
        firstName: 'Kira',
        lastName: 'Test',
        emailVerifiedAt: optionen.bestaetigt === false ? null : new Date(),
        status: optionen.gesperrt === true ? 'BLOCKED' : 'ACTIVE',
      },
    });
  }

  it('führt den ganzen Ablauf durch: anfordern, Mail, neues Passwort, anmelden', async () => {
    await kundin();

    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);

    const token = await tokenAusNeuesterMail();
    await mailsLeeren();

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: NEU })
      .expect(200);

    // Mit dem alten Passwort geht nichts mehr.
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'kundin@test.invalid', password: ALT })
      .expect(401);

    // Mit dem neuen schon.
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'kundin@test.invalid', password: NEU })
      .expect(200);
  });

  /**
   * Dieser Endpunkt braucht keine Anmeldedaten. Verriete er, ob eine Adresse
   * bekannt ist, wäre er das bequemste Patientenverzeichnis, das die Praxis
   * haben kann.
   */
  it('verrät nicht, ob die Adresse bekannt ist', async () => {
    await kundin();

    const bekannt = await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);

    await mailsLeeren();

    const unbekannt = await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'gibtsnicht@test.invalid' })
      .expect(202);

    expect(unbekannt.body).toEqual(bekannt.body);
    // Und für die unbekannte Adresse geht auch keine Mail raus.
    expect(await mailAnzahl()).toBe(0);
  });

  it('schickt gesperrten Konten keinen Link', async () => {
    await kundin({ gesperrt: true });

    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);

    expect(await mailAnzahl()).toBe(0);
  });

  it('lässt den Token genau einmal wirken', async () => {
    await kundin();
    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);

    const token = await tokenAusNeuesterMail();

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: NEU })
      .expect(200);

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: 'noch-ein-anderes-passwort' })
      .expect(400);
  });

  it('entwertet einen alten Link, sobald ein neuer angefordert wird', async () => {
    await kundin();

    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);
    const ersterToken = await tokenAusNeuesterMail();

    await mailsLeeren();
    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);
    const zweiterToken = await tokenAusNeuesterMail();

    expect(zweiterToken).not.toBe(ersterToken);

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token: ersterToken, password: NEU })
      .expect(400);
  });

  it('weist abgelaufene Links ab', async () => {
    const user = await kundin();
    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);
    const token = await tokenAusNeuesterMail();

    await prisma.authToken.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: NEU })
      .expect(400);
  });

  it('verlangt auch beim Zurücksetzen mindestens 12 Zeichen', async () => {
    await kundin();
    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);
    const token = await tokenAusNeuesterMail();

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: 'kurz' })
      .expect(400);
  });

  /**
   * Wer sein Passwort zurücksetzt, tut das oft, weil er einen fremden Zugriff
   * befürchtet. Dann muss auch eine bereits gestohlene Sitzung sterben.
   */
  it('entwertet alle bestehenden Sitzungen', async () => {
    const user = await kundin();

    const sitzungA = await sitzungen.issuePair(user.id, 'CUSTOMER');
    const sitzungB = await sitzungen.issuePair(user.id, 'CUSTOMER');

    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);
    const token = await tokenAusNeuesterMail();

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: NEU })
      .expect(200);

    expect(await sitzungen.rotate(sitzungA.refreshToken)).toBeNull();
    expect(await sitzungen.rotate(sitzungB.refreshToken)).toBeNull();
  });

  /**
   * Der Link aus dem Postfach beweist, dass die Adresse der Person gehört.
   * Sonst säße jemand fest, der die Bestätigungsmail verpasst und danach sein
   * Passwort vergessen hat.
   */
  it('bestätigt dabei eine noch offene E-Mail-Adresse', async () => {
    const user = await kundin({ bestaetigt: false });
    expect(user.emailVerifiedAt).toBeNull();

    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);
    const token = await tokenAusNeuesterMail();

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: NEU })
      .expect(200);

    const nachher = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(nachher.emailVerifiedAt).not.toBeNull();
  });

  /**
   * Eine Benachrichtigung an die bekannte Adresse. War der Reset nicht gewollt,
   * erfährt die rechtmäßige Inhaberin davon.
   */
  it('benachrichtigt über die Änderung', async () => {
    await kundin();
    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(202);
    const token = await tokenAusNeuesterMail();
    await mailsLeeren();

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: NEU })
      .expect(200);

    const mail = await neuesteMail();
    expect(mail.Subject).toContain('Passwort');
    expect(mail.To[0].Address).toBe('kundin@test.invalid');
    // Die Benachrichtigung darf keinen Link enthalten — der wäre selbst wieder
    // ein Angriffsweg.
    expect(mail.Text).not.toMatch(/https?:\/\//);
  });

  it('kann einen Verifizierungs-Token nicht als Reset-Token verwenden', async () => {
    await mailsLeeren();
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: 'neu@test.invalid',
        password: 'ein-langes-passwort',
        firstName: 'Nina',
        lastName: 'Test',
        acceptedTerms: true,
        acceptedPrivacy: true,
      })
      .expect(202);

    const verifizierungsToken = await tokenAusNeuesterMail();

    await request(server)
      .post('/api/v1/auth/password/reset')
      .send({ token: verifizierungsToken, password: NEU })
      .expect(400);
  });
});
