import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { TokenService } from '../../src/auth/token.service';
import { ConsentsService } from '../../src/consents/consents.service';
import { prisma, truncateAll } from '../helpers/db';

/**
 * Einwilligungen (Schritt 11).
 *
 * Kern: Die Tabelle ist ein **Protokoll**, kein Zustand. Ein Widerruf löscht
 * nichts, er hängt eine neue Zeile an — der Nachweis, dass eingewilligt *war*,
 * muss den Widerruf überleben (Art. 7 Abs. 1).
 */
describe('Einwilligungen', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let passwoerter: PasswordService;
  let sitzungen: TokenService;
  let consents: ConsentsService;

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
    consents = modul.get(ConsentsService);
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  /** Legt eine Kundin über die echte Registrierung an, inklusive Einwilligungen. */
  async function registrierteKundin(marketing = false) {
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: 'kundin@test.invalid',
        password: 'ein-langes-passwort',
        firstName: 'Kira',
        lastName: 'Test',
        acceptedTerms: true,
        acceptedPrivacy: true,
        acceptedMarketing: marketing,
      })
      .expect(202);

    const user = await prisma.user.findFirstOrThrow();
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    const paar = await sitzungen.issuePair(user.id, 'CUSTOMER');
    return { user, token: paar.accessToken };
  }

  it('verlangt eine Anmeldung', async () => {
    await request(server).get('/api/v1/me/consents').expect(401);
  });

  it('listet alle Typen, auch die nie entschiedenen', async () => {
    const { token } = await registrierteKundin();

    const antwort = await request(server)
      .get('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const typen = (antwort.body as Array<{ typ: string }>).map((e) => e.typ).sort();
    expect(typen).toEqual(['HEALTH_DATA', 'MARKETING', 'PRIVACY', 'PUSH', 'TOS']);

    const gesundheit = (antwort.body as Array<{ typ: string; erteilt: boolean }>).find(
      (e) => e.typ === 'HEALTH_DATA',
    );
    // Bei der Registrierung nicht abgefragt, also weder erteilt noch widerrufen.
    expect(gesundheit?.erteilt).toBe(false);
  });

  it('gibt den Stand aus der Registrierung wieder', async () => {
    const { token } = await registrierteKundin(false);

    const antwort = await request(server)
      .get('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const stand = Object.fromEntries(
      (antwort.body as Array<{ typ: string; erteilt: boolean }>).map((e) => [e.typ, e.erteilt]),
    );
    expect(stand.TOS).toBe(true);
    expect(stand.PRIVACY).toBe(true);
    expect(stand.MARKETING).toBe(false);
  });

  it('erteilt und widerruft Marketing', async () => {
    const { token } = await registrierteKundin(false);

    const erteilt = await request(server)
      .patch('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({ typ: 'MARKETING', erteilen: true })
      .expect(200);

    expect(
      (erteilt.body as Array<{ typ: string; erteilt: boolean }>).find((e) => e.typ === 'MARKETING')
        ?.erteilt,
    ).toBe(true);

    const widerrufen = await request(server)
      .patch('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({ typ: 'MARKETING', erteilen: false })
      .expect(200);

    expect(
      (widerrufen.body as Array<{ typ: string; erteilt: boolean }>).find(
        (e) => e.typ === 'MARKETING',
      )?.erteilt,
    ).toBe(false);
  });

  /**
   * Der wichtigste Test dieser Datei. Ein Widerruf darf nichts löschen — sonst
   * lässt sich später nicht mehr belegen, dass überhaupt eingewilligt war.
   */
  it('löscht beim Widerruf nichts, sondern protokolliert', async () => {
    const { user, token } = await registrierteKundin(true);

    const vorher = await prisma.consent.count({ where: { userId: user.id, type: 'MARKETING' } });
    expect(vorher).toBe(1);

    await request(server)
      .patch('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({ typ: 'MARKETING', erteilen: false })
      .expect(200);

    const zeilen = await prisma.consent.findMany({
      where: { userId: user.id, type: 'MARKETING' },
      orderBy: { grantedAt: 'asc' },
    });

    // Zwei Zeilen: die ursprüngliche Zustimmung und der Widerruf.
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0].granted).toBe(true);
    // Die erste trägt jetzt ein Ende — sie bleibt aber als Nachweis stehen.
    expect(zeilen[0].revokedAt).not.toBeNull();
    expect(zeilen[1].granted).toBe(false);
  });

  it('schreibt die Version mit', async () => {
    const { user, token } = await registrierteKundin();

    await request(server)
      .patch('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({ typ: 'PUSH', erteilen: true })
      .expect(200);

    const zeile = await prisma.consent.findFirstOrThrow({
      where: { userId: user.id, type: 'PUSH' },
    });
    expect(zeile.version).toBe('1.0');
  });

  /**
   * AGB und Datenschutzerklärung sind Voraussetzung für die Nutzung. Ein
   * Widerruf bedeutet Kontolöschung — die Meldung muss das sagen, statt den
   * Versuch stillschweigend abzulehnen.
   */
  it('lässt Pflicht-Einwilligungen nicht einzeln widerrufen', async () => {
    const { token } = await registrierteKundin();

    for (const typ of ['TOS', 'PRIVACY']) {
      const antwort = await request(server)
        .patch('/api/v1/me/consents')
        .set('Authorization', `Bearer ${token}`)
        .send({ typ, erteilen: false })
        .expect(400);

      expect(antwort.body.message).toContain('Konto');
    }
  });

  it('weist unbekannte Typen ab', async () => {
    const { token } = await registrierteKundin();

    await request(server)
      .patch('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({ typ: 'ERFUNDEN', erteilen: true })
      .expect(400);
  });

  it('zeigt nur die eigenen Einwilligungen', async () => {
    const { token } = await registrierteKundin();

    const fremde = await prisma.user.create({
      data: {
        email: 'fremde@test.invalid',
        passwordHash: await passwoerter.hashPassword('ein-langes-passwort'),
        role: 'CUSTOMER',
        firstName: 'F',
        lastName: 'F',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.consent.create({
      data: { userId: fremde.id, type: 'MARKETING', version: '1.0', granted: true },
    });

    const antwort = await request(server)
      .get('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Die fremde Marketing-Zustimmung darf hier nicht durchschlagen.
    expect(
      (antwort.body as Array<{ typ: string; erteilt: boolean }>).find((e) => e.typ === 'MARKETING')
        ?.erteilt,
    ).toBe(false);
  });

  describe('Veraltete Fassungen', () => {
    /**
     * Ändert sich der Text, zählt die alte Zustimmung nicht mehr. Sonst liefe
     * eine geänderte Datenschutzerklärung stillschweigend mit der alten
     * Einwilligung weiter.
     */
    it('meldet Erneuerungsbedarf und gilt nicht mehr als erteilt', async () => {
      const { user, token } = await registrierteKundin();

      await request(server)
        .patch('/api/v1/me/consents')
        .set('Authorization', `Bearer ${token}`)
        .send({ typ: 'HEALTH_DATA', erteilen: true })
        .expect(200);

      expect(await consents.gilt(user.id, 'HEALTH_DATA')).toBe(true);

      // Textfassung von außen „altern" lassen.
      await prisma.consent.updateMany({
        where: { userId: user.id, type: 'HEALTH_DATA' },
        data: { version: '0.9' },
      });

      const antwort = await request(server)
        .get('/api/v1/me/consents')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const eintrag = (
        antwort.body as Array<{ typ: string; erteilt: boolean; erneuerungNoetig: boolean }>
      ).find((e) => e.typ === 'HEALTH_DATA');

      expect(eintrag?.erneuerungNoetig).toBe(true);
      // Für die Verarbeitung zählt sie nicht mehr.
      expect(await consents.gilt(user.id, 'HEALTH_DATA')).toBe(false);
    });
  });
});
