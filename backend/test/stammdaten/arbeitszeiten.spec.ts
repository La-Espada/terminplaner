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
 * Arbeitszeiten und Abwesenheiten (Schritt 20).
 *
 * Zwei Dinge werden hier besonders genau geprüft. Erstens die Mittagspause —
 * sie ist der Grund, warum `working_hours` mehrere Zeilen je Wochentag erlaubt
 * (E-11). Zweitens die Umrechnung von Ortszeit in UTC: Ein ganztägiger Eintrag
 * am 25. Oktober dauert 25 Stunden, am 29. März 23. Wer dort mit „plus 24
 * Stunden" rechnet, baut einen Fehler ein, der erst im Betrieb auffällt.
 */
describe('Arbeitszeiten und Abwesenheiten', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let sitzungen: TokenService;

  let adminToken: string;
  let staffToken: string;
  let annaId: string;
  let lisaId: string;

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
    const passwoerter = modul.get(PasswordService);

    // Einmalig, weil Argon2 absichtlich langsam ist.
    hash = await passwoerter.hashPassword('ein-langes-passwort');
  });

  let hash: string;

  beforeEach(async () => {
    await truncateAll();

    const mach = (email: string, rolle: 'ADMIN' | 'STAFF') =>
      prisma.user.create({
        data: {
          email,
          passwordHash: hash,
          role: rolle,
          firstName: 'T',
          lastName: 'P',
          emailVerifiedAt: new Date(),
        },
      });

    const admin = await mach('admin@test.invalid', 'ADMIN');
    const annaUser = await mach('anna@test.invalid', 'STAFF');
    const lisaUser = await mach('lisa@test.invalid', 'STAFF');

    annaId = (
      await prisma.staffProfile.create({ data: { userId: annaUser.id, displayName: 'Anna' } })
    ).id;
    lisaId = (
      await prisma.staffProfile.create({ data: { userId: lisaUser.id, displayName: 'Lisa' } })
    ).id;

    adminToken = (await sitzungen.issuePair(admin.id, 'ADMIN')).accessToken;
    staffToken = (await sitzungen.issuePair(annaUser.id, 'STAFF')).accessToken;
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  const alsAdmin = (methode: 'get' | 'put' | 'post' | 'delete', pfad: string) =>
    request(server)[methode](pfad).set('Authorization', `Bearer ${adminToken}`);

  const setzen = (staffId: string, spannen: unknown[]) =>
    alsAdmin('put', `/api/v1/admin/arbeitszeiten/${staffId}`).send({ spannen });

  describe('Rechte', () => {
    it('weist Kosmetiker:innen ab', async () => {
      // Wann jemand arbeitet, ist eine Dienstplanfrage des Betriebs.
      await request(server)
        .get(`/api/v1/admin/arbeitszeiten/${annaId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);

      await request(server)
        .get('/api/v1/admin/abwesenheiten?von=2026-10-01&bis=2026-10-31')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('weist ohne Anmeldung ab', async () => {
      await request(server).get(`/api/v1/admin/arbeitszeiten/${annaId}`).expect(401);
    });
  });

  describe('Wochenplan', () => {
    it('ist am Anfang leer', async () => {
      const antwort = await alsAdmin('get', `/api/v1/admin/arbeitszeiten/${annaId}`).expect(200);
      expect(antwort.body).toEqual([]);
    });

    it('bildet eine Mittagspause als zwei Zeilen ab', async () => {
      // Der Fall, für den `working_hours` mehrere Zeilen je Tag erlaubt (E-11).
      await setzen(annaId, [
        { weekday: 1, von: '09:00', bis: '12:00' },
        { weekday: 1, von: '13:00', bis: '17:00' },
      ]).expect(200);

      const antwort = await alsAdmin('get', `/api/v1/admin/arbeitszeiten/${annaId}`).expect(200);
      expect(antwort.body).toEqual([
        { weekday: 1, von: '09:00', bis: '12:00' },
        { weekday: 1, von: '13:00', bis: '17:00' },
      ]);
    });

    it('ersetzt den bisherigen Plan vollstaendig', async () => {
      await setzen(annaId, [{ weekday: 1, von: '09:00', bis: '17:00' }]).expect(200);
      await setzen(annaId, [{ weekday: 2, von: '10:00', bis: '14:00' }]).expect(200);

      const antwort = await alsAdmin('get', `/api/v1/admin/arbeitszeiten/${annaId}`).expect(200);
      expect(antwort.body).toEqual([{ weekday: 2, von: '10:00', bis: '14:00' }]);
    });

    it('nimmt eine leere Woche an', async () => {
      // Arbeitet nicht ist kein Sonderfall, sondern der Zustand jeder neu
      // angelegten Person.
      await setzen(annaId, [{ weekday: 1, von: '09:00', bis: '17:00' }]).expect(200);
      await setzen(annaId, []).expect(200);

      expect((await alsAdmin('get', `/api/v1/admin/arbeitszeiten/${annaId}`)).body).toEqual([]);
    });

    it('sortiert nach Wochentag und Beginn', async () => {
      await setzen(annaId, [
        { weekday: 3, von: '09:00', bis: '12:00' },
        { weekday: 1, von: '13:00', bis: '17:00' },
        { weekday: 1, von: '09:00', bis: '12:00' },
      ]).expect(200);

      const antwort = await alsAdmin('get', `/api/v1/admin/arbeitszeiten/${annaId}`).expect(200);
      expect(
        antwort.body.map((s: { weekday: number; von: string }) => `${s.weekday}-${s.von}`),
      ).toEqual(['1-09:00', '1-13:00', '3-09:00']);
    });

    it('haelt die Plaene zweier Personen auseinander', async () => {
      await setzen(annaId, [{ weekday: 1, von: '09:00', bis: '17:00' }]).expect(200);
      await setzen(lisaId, [{ weekday: 2, von: '08:00', bis: '12:00' }]).expect(200);

      expect((await alsAdmin('get', `/api/v1/admin/arbeitszeiten/${annaId}`)).body).toHaveLength(1);
      expect(
        (await alsAdmin('get', `/api/v1/admin/arbeitszeiten/${lisaId}`)).body[0],
      ).toMatchObject({ weekday: 2, von: '08:00' });
    });

    describe('abgelehnt wird', () => {
      it('eine Ueberschneidung am selben Tag', async () => {
        // Zwei Spannen, die sich überlappen, böten dieselbe Zeit zweimal an —
        // und ein doppelter Slot ist eine Doppelbuchung in spe.
        const antwort = await setzen(annaId, [
          { weekday: 1, von: '09:00', bis: '13:00' },
          { weekday: 1, von: '12:00', bis: '17:00' },
        ]).expect(400);

        expect(antwort.body.message).toContain('Montag');
      });

      it('aber nicht zwei Spannen, die aneinandergrenzen', async () => {
        await setzen(annaId, [
          { weekday: 1, von: '09:00', bis: '12:00' },
          { weekday: 1, von: '12:00', bis: '17:00' },
        ]).expect(200);
      });

      it('ein Ende vor dem Beginn', async () => {
        await setzen(annaId, [{ weekday: 1, von: '17:00', bis: '09:00' }]).expect(400);
      });

      it('eine Spanne ohne Dauer', async () => {
        await setzen(annaId, [{ weekday: 1, von: '09:00', bis: '09:00' }]).expect(400);
      });

      it('ein unmoeglicher Wochentag', async () => {
        await setzen(annaId, [{ weekday: 7, von: '09:00', bis: '17:00' }]).expect(400);
      });

      it('eine Uhrzeit im falschen Format', async () => {
        await setzen(annaId, [{ weekday: 1, von: '9:00', bis: '17:00' }]).expect(400);
        await setzen(annaId, [{ weekday: 1, von: '25:00', bis: '26:00' }]).expect(400);
      });

      it('ein unbekanntes Profil', async () => {
        await setzen('00000000-0000-4000-8000-000000000000', []).expect(404);
      });
    });
  });

  describe('Abwesenheiten', () => {
    const anlegen = (daten: Record<string, unknown>) =>
      alsAdmin('post', '/api/v1/admin/abwesenheiten').send(daten);

    const liste = async (von: string, bis: string, staffId?: string) => {
      const pfad =
        `/api/v1/admin/abwesenheiten?von=${von}&bis=${bis}` +
        (staffId !== undefined ? `&staffId=${staffId}` : '');
      return (await alsAdmin('get', pfad).expect(200)).body as Array<{
        id: string;
        staffId: string | null;
        type: string;
        vonDatum: string;
        bisDatum: string;
      }>;
    };

    it('setzt einen studioweiten Feiertag mit einem Eintrag', async () => {
      // Das zweite Abnahmekriterium des Schritts: ein Eintrag für alle.
      const antwort = await anlegen({
        type: 'PUBLIC_HOLIDAY',
        ganztags: true,
        vonDatum: '2026-12-25',
        bisDatum: '2026-12-25',
      }).expect(201);

      expect(antwort.body.staffId).toBeNull();
      expect(antwort.body.vonDatum).toBe('2026-12-25');
      expect(antwort.body.bisDatum).toBe('2026-12-25');

      // Er erscheint bei jeder Person, nicht nur bei einer.
      expect(await liste('2026-12-01', '2026-12-31', annaId)).toHaveLength(1);
      expect(await liste('2026-12-01', '2026-12-31', lisaId)).toHaveLength(1);
    });

    it('legt eine Abwesenheit einer einzelnen Person an', async () => {
      await anlegen({
        staffId: annaId,
        type: 'VACATION',
        ganztags: true,
        vonDatum: '2026-07-06',
        bisDatum: '2026-07-17',
      }).expect(201);

      expect(await liste('2026-07-01', '2026-07-31', annaId)).toHaveLength(1);
      // Lisas Abfrage sieht sie nicht — wohl aber einen Feiertag, siehe oben.
      expect(await liste('2026-07-01', '2026-07-31', lisaId)).toHaveLength(0);
    });

    it('legt einen halben Urlaubstag mit Uhrzeiten an', async () => {
      const antwort = await anlegen({
        staffId: annaId,
        type: 'VACATION',
        ganztags: false,
        vonDatum: '2026-07-15',
        vonZeit: '13:00',
        bisDatum: '2026-07-15',
        bisZeit: '17:00',
      }).expect(201);

      expect(antwort.body).toMatchObject({
        vonDatum: '2026-07-15',
        vonZeit: '13:00',
        bisDatum: '2026-07-15',
        bisZeit: '17:00',
      });

      // In der Datenbank steht UTC: 13:00 Wien im Sommer sind 11:00 UTC.
      const zeile = await prisma.timeOff.findFirstOrThrow();
      expect(zeile.startsAt.toISOString()).toBe('2026-07-15T11:00:00.000Z');
      expect(zeile.endsAt.toISOString()).toBe('2026-07-15T15:00:00.000Z');
    });

    it('findet eine Abwesenheit, die vor dem Zeitraum begonnen hat', async () => {
      // Der häufigste Fehler bei solchen Abfragen: nur suchen, was im Zeitraum
      // *beginnt*. Ein Urlaub vom 1. bis 20. gehört in die Abfrage für den 10.
      await anlegen({
        staffId: annaId,
        type: 'VACATION',
        ganztags: true,
        vonDatum: '2026-07-01',
        bisDatum: '2026-07-20',
      }).expect(201);

      expect(await liste('2026-07-10', '2026-07-10')).toHaveLength(1);
    });

    it('findet nichts ausserhalb des Zeitraums', async () => {
      await anlegen({
        staffId: annaId,
        type: 'VACATION',
        ganztags: true,
        vonDatum: '2026-07-01',
        bisDatum: '2026-07-03',
      }).expect(201);

      expect(await liste('2026-07-04', '2026-07-10')).toHaveLength(0);
      expect(await liste('2026-06-01', '2026-06-30')).toHaveLength(0);
      // Der letzte Tag gehört noch dazu.
      expect(await liste('2026-07-03', '2026-07-03')).toHaveLength(1);
    });

    it('loescht eine Abwesenheit', async () => {
      const angelegt = await anlegen({
        type: 'CLOSURE',
        ganztags: true,
        vonDatum: '2026-08-01',
        bisDatum: '2026-08-14',
      }).expect(201);

      await alsAdmin('delete', `/api/v1/admin/abwesenheiten/${angelegt.body.id}`).expect(204);
      expect(await liste('2026-08-01', '2026-08-31')).toHaveLength(0);
    });

    describe('Zeitzone', () => {
      it('legt einen ganztaegigen Eintrag auf die Ortsmitternacht, nicht auf die UTC-Mitternacht', async () => {
        await anlegen({
          type: 'PUBLIC_HOLIDAY',
          ganztags: true,
          vonDatum: '2026-07-15',
          bisDatum: '2026-07-15',
        }).expect(201);

        const zeile = await prisma.timeOff.findFirstOrThrow();
        // Im Sommer beginnt der Wiener Tag um 22:00 UTC des Vortags.
        expect(zeile.startsAt.toISOString()).toBe('2026-07-14T22:00:00.000Z');
        expect(zeile.endsAt.toISOString()).toBe('2026-07-15T22:00:00.000Z');
      });

      it('gibt dem 25. Oktober 25 Stunden', async () => {
        // Hier scheitert jede Rechnung mit `+ 24 Stunden`.
        await anlegen({
          type: 'CLOSURE',
          ganztags: true,
          vonDatum: '2026-10-25',
          bisDatum: '2026-10-25',
        }).expect(201);

        const zeile = await prisma.timeOff.findFirstOrThrow();
        const stunden = (zeile.endsAt.getTime() - zeile.startsAt.getTime()) / 3_600_000;
        expect(stunden).toBe(25);
      });

      it('gibt dem 29. Maerz 23 Stunden', async () => {
        await anlegen({
          type: 'CLOSURE',
          ganztags: true,
          vonDatum: '2026-03-29',
          bisDatum: '2026-03-29',
        }).expect(201);

        const zeile = await prisma.timeOff.findFirstOrThrow();
        const stunden = (zeile.endsAt.getTime() - zeile.startsAt.getTime()) / 3_600_000;
        expect(stunden).toBe(23);
      });

      it('zeigt den letzten betroffenen Tag an, nicht die Mitternacht danach', async () => {
        // Sonst sähe ein eintägiger Urlaub nach zwei Tagen aus.
        const antwort = await anlegen({
          staffId: annaId,
          type: 'SICK',
          ganztags: true,
          vonDatum: '2026-02-10',
          bisDatum: '2026-02-12',
        }).expect(201);

        expect(antwort.body.vonDatum).toBe('2026-02-10');
        expect(antwort.body.bisDatum).toBe('2026-02-12');
      });
    });

    describe('abgelehnt wird', () => {
      it('ein Ende vor dem Beginn', async () => {
        await anlegen({
          type: 'CLOSURE',
          ganztags: true,
          vonDatum: '2026-08-10',
          bisDatum: '2026-08-01',
        }).expect(400);
      });

      it('eine Spanne ohne Uhrzeiten, wenn sie nicht ganztaegig ist', async () => {
        await anlegen({
          type: 'VACATION',
          ganztags: false,
          vonDatum: '2026-08-10',
          bisDatum: '2026-08-10',
        }).expect(400);
      });

      it('ein unbekannter Grund', async () => {
        await anlegen({
          type: 'REHA_BAD_ISCHL',
          ganztags: true,
          vonDatum: '2026-08-10',
          bisDatum: '2026-08-10',
        }).expect(400);
      });

      it('ein Freitextfeld', async () => {
        // E-12: Der Grund steckt in `type`. "Reha Bad Ischl" wäre ein
        // Gesundheitsdatum über eine Beschäftigte.
        await anlegen({
          type: 'SICK',
          ganztags: true,
          vonDatum: '2026-08-10',
          bisDatum: '2026-08-10',
          grund: 'Bandscheibenvorfall',
        }).expect(400);
      });

      it('ein unbekanntes Profil', async () => {
        await anlegen({
          staffId: '00000000-0000-4000-8000-000000000000',
          type: 'VACATION',
          ganztags: true,
          vonDatum: '2026-08-10',
          bisDatum: '2026-08-10',
        }).expect(404);
      });

      it('eine Abfrage ohne Zeitraum', async () => {
        await alsAdmin('get', '/api/v1/admin/abwesenheiten').expect(400);
        await alsAdmin('get', '/api/v1/admin/abwesenheiten?von=2026-08-01').expect(400);
        await alsAdmin('get', '/api/v1/admin/abwesenheiten?von=heute&bis=morgen').expect(400);
      });

      it('eine Abfrage mit vertauschtem Zeitraum', async () => {
        await alsAdmin('get', '/api/v1/admin/abwesenheiten?von=2026-08-31&bis=2026-08-01').expect(
          400,
        );
      });
    });
  });
});
