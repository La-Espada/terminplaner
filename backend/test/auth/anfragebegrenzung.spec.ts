import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { seconds } from '@nestjs/throttler';
import { getOptionsToken } from '@nestjs/throttler/dist/throttler.providers';
import cookieParser from 'cookie-parser';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { RedisThrottlerStorage } from '../../src/throttling/redis-throttler.storage';
import { prisma, truncateAll } from '../helpers/db';
import { mailsLeeren } from '../helpers/mailpit';

/**
 * Anfragebegrenzung (Schritt 13).
 *
 * Die Grenzen werden hier im Testmodul ueberschrieben, nicht ueber
 * Umgebungsvariablen. `test/setup.ts` setzt sie fuer alle anderen Tests hoch,
 * und welche Zuweisung am Ende gewinnt, haengt von der Ausfuehrungsreihenfolge
 * ab — die ist nicht verlaesslich. Ein ueberschriebener Provider dagegen schon.
 */
const GRENZE_ANMELDUNG = 3;
const GRENZE_MAIL = 2;

describe('Anfragebegrenzung', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let passwoerter: PasswordService;
  let redis: Redis;

  const PASSWORT = 'ein-langes-passwort';

  beforeAll(async () => {
    const modul = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getOptionsToken())
      .useFactory({
        inject: [RedisThrottlerStorage],
        factory: (storage: RedisThrottlerStorage) => ({
          storage,
          throttlers: [
            { name: 'standard', ttl: seconds(60), limit: 100_000 },
            {
              name: 'streng',
              ttl: seconds(900),
              limit: GRENZE_ANMELDUNG,
              blockDuration: seconds(900),
            },
            {
              name: 'mail',
              ttl: seconds(3600),
              limit: GRENZE_MAIL,
              blockDuration: seconds(3600),
            },
          ],
        }),
      })
      .compile();
    app = modul.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
    passwoerter = modul.get(PasswordService);
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  });

  beforeEach(async () => {
    await truncateAll();
    await mailsLeeren();
    // Zähler zurücksetzen, sonst wirkt die Sperre des vorigen Tests weiter.
    const schluessel = await redis.keys('thr:*');
    if (schluessel.length > 0) await redis.del(...schluessel);
  });

  afterAll(async () => {
    // Defensiv: Scheitert beforeAll, sind diese Felder nicht gesetzt — ohne die
    // Pruefung verdeckt ein Folgefehler hier die eigentliche Ursache.
    if (redis !== undefined) {
      const schluessel = await redis.keys('thr:*');
      if (schluessel.length > 0) await redis.del(...schluessel);
      await redis.quit();
    }
    await truncateAll();
    if (app !== undefined) await app.close();
    await prisma.$disconnect();
  });

  async function kundin(email = 'kundin@test.invalid') {
    return prisma.user.create({
      data: {
        email,
        passwordHash: await passwoerter.hashPassword(PASSWORT),
        role: 'CUSTOMER',
        firstName: 'Kira',
        lastName: 'Test',
        emailVerifiedAt: new Date(),
      },
    });
  }

  it('weist den vierten Anmeldeversuch mit 429 ab', async () => {
    await kundin();

    for (let i = 0; i < 3; i++) {
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'kundin@test.invalid', password: 'falsches-passwort' })
        .expect(401);
    }

    const gesperrt = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'kundin@test.invalid', password: 'falsches-passwort' })
      .expect(429);

    expect(gesperrt.body.message).toContain('Zu viele Versuche');
  });

  /**
   * Nach der Sperre nützt auch das richtige Passwort nichts mehr. Sonst wäre
   * die Begrenzung wirkungslos: Ein Angreifer bekäme beim Treffer trotzdem
   * Zugang.
   */
  it('lässt auch mit richtigem Passwort nicht durch, solange gesperrt', async () => {
    await kundin();

    for (let i = 0; i < 3; i++) {
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'kundin@test.invalid', password: 'falsches-passwort' })
        .expect(401);
    }

    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'kundin@test.invalid', password: PASSWORT })
      .expect(429);
  });

  /**
   * Der Kern der Entscheidung, nach IP **und** Konto zu zählen: Fehlversuche
   * auf ein Konto dürfen ein anderes nicht aussperren. Sonst könnte man eine
   * fremde Adresse absichtlich blockieren.
   */
  it('sperrt nur das betroffene Konto, nicht alle vom selben Anschluss', async () => {
    await kundin('erste@test.invalid');
    await kundin('zweite@test.invalid');

    for (let i = 0; i < 4; i++) {
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'erste@test.invalid', password: 'falsches-passwort' });
    }

    // Die erste ist gesperrt …
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'erste@test.invalid', password: PASSWORT })
      .expect(429);

    // … die zweite kommt von derselben Adresse aus ungehindert herein.
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'zweite@test.invalid', password: PASSWORT })
      .expect(200);
  });

  /**
   * Hier geht es nicht ums Raten, sondern darum, dass niemand ein fremdes
   * Postfach mit Nachrichten überschüttet.
   */
  it('begrenzt mailauslösende Endpunkte strenger', async () => {
    await kundin();

    for (let i = 0; i < 2; i++) {
      await request(server)
        .post('/api/v1/auth/password/forgot')
        .send({ email: 'kundin@test.invalid' })
        .expect(202);
    }

    await request(server)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'kundin@test.invalid' })
      .expect(429);
  });

  /**
   * Die Begrenzung darf keine neue Auskunftsquelle sein. Bekannte und
   * unbekannte Adressen müssen sich auch im gesperrten Zustand gleich verhalten.
   */
  it('verrät auch im gesperrten Zustand nicht, ob ein Konto existiert', async () => {
    await kundin('existiert@test.invalid');

    const sperren = async (email: string) => {
      for (let i = 0; i < 4; i++) {
        await request(server).post('/api/v1/auth/login').send({ email, password: 'falsch-falsch' });
      }
      return request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: 'falsch-falsch' })
        .expect(429);
    };

    const bekannt = await sperren('existiert@test.invalid');
    const unbekannt = await sperren('gibtsnicht@test.invalid');

    expect(bekannt.body.message).toBe(unbekannt.body.message);
    expect(bekannt.status).toBe(unbekannt.status);
  });

  it('lässt geschützte Endpunkte unbehelligt', async () => {
    // Die Begrenzung hängt am Auth-Controller. /health muss weiter antworten,
    // auch wenn jemand die Anmeldung zugemüllt hat.
    await kundin();
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'kundin@test.invalid', password: 'falsch-falsch' });
    }

    await request(server).get('/api/v1/health').expect(200);
  });

  it('speichert keine Adressen im Zählerspeicher', async () => {
    await kundin('geheim@test.invalid');

    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'geheim@test.invalid', password: 'falsch-falsch' });

    const schluessel = await redis.keys('thr:*');
    expect(schluessel.length).toBeGreaterThan(0);
    // Redis-Schlüssel tauchen in Protokollen und Werkzeugen auf — dort gehört
    // keine Patientin hin.
    expect(schluessel.join(' ')).not.toContain('geheim');
    expect(schluessel.join(' ')).not.toContain('@');
  });
});
