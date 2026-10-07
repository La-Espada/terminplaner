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
 * Leistungszuordnung (Schritt 19).
 *
 * Das zweite Abnahmekriterium ist das interessantere: „Eine Leistung, die
 * niemand anbietet, taucht in der Buchung nicht auf." Dafür reicht es nicht,
 * irgendeine Zuordnung zu zählen — die Person dahinter muss auch arbeiten
 * können. Genau das prüfen die Fälle unter „Öffentliche Sicht".
 */
describe('Leistungszuordnung', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let passwoerter: PasswordService;
  let sitzungen: TokenService;

  let adminToken: string;
  let staffToken: string;
  let annaId: string;
  let lisaId: string;
  let lisaUserId: string;
  let gesichtId: string;
  let massageId: string;
  let kundinId: string;

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

    const hash = await passwoerter.hashPassword('ein-langes-passwort');
    const mach = (email: string, rolle: 'ADMIN' | 'STAFF' | 'CUSTOMER') =>
      prisma.user.create({
        data: {
          email,
          passwordHash: hash,
          role: rolle,
          firstName: 'T',
          lastName: 'P',
          // Zugang eingerichtet — sonst zählt die Person nirgends als buchbar.
          emailVerifiedAt: new Date(),
        },
      });

    const admin = await mach('admin@test.invalid', 'ADMIN');
    const annaUser = await mach('anna@test.invalid', 'STAFF');
    const lisaUser = await mach('lisa@test.invalid', 'STAFF');
    const kundin = await mach('kundin@test.invalid', 'CUSTOMER');

    const anna = await prisma.staffProfile.create({
      data: { userId: annaUser.id, displayName: 'Anna' },
    });
    const lisa = await prisma.staffProfile.create({
      data: { userId: lisaUser.id, displayName: 'Lisa' },
    });

    const gesicht = await prisma.service.create({
      data: { name: 'Gesichtsbehandlung', durationMinutes: 60, priceCents: 8900, sortOrder: 1 },
    });
    const massage = await prisma.service.create({
      data: { name: 'Massage', durationMinutes: 30, priceCents: 4500, sortOrder: 2 },
    });

    annaId = anna.id;
    lisaId = lisa.id;
    lisaUserId = lisaUser.id;
    gesichtId = gesicht.id;
    massageId = massage.id;
    kundinId = kundin.id;

    adminToken = (await sitzungen.issuePair(admin.id, 'ADMIN')).accessToken;
    staffToken = (await sitzungen.issuePair(annaUser.id, 'STAFF')).accessToken;
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  const alsAdmin = (methode: 'put' | 'delete', pfad: string) =>
    request(server)[methode](pfad).set('Authorization', `Bearer ${adminToken}`);

  const zuordnen = (staffId: string, serviceId: string) =>
    alsAdmin('put', `/api/v1/admin/zuordnung/${staffId}/${serviceId}`).expect(204);

  const matrix = async () => {
    const antwort = await request(server)
      .get('/api/v1/admin/zuordnung')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return antwort.body as {
      staff: Array<{ id: string; displayName: string; isActive: boolean }>;
      zeilen: Array<{ serviceId: string; name: string; staffIds: string[] }>;
    };
  };

  const zeile = async (serviceId: string) => {
    const m = await matrix();
    return m.zeilen.find((z) => z.serviceId === serviceId)!;
  };

  describe('Rechte', () => {
    it('weist Kosmetiker:innen ab', async () => {
      // Wer welche Behandlung anbietet, ist eine Frage von Ausbildung und
      // Betriebsorganisation — keine, die die Behandlerin für sich beantwortet.
      await request(server)
        .get('/api/v1/admin/zuordnung')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);

      await request(server)
        .put(`/api/v1/admin/zuordnung/${annaId}/${gesichtId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('weist ohne Anmeldung ab', async () => {
      await request(server).get('/api/v1/admin/zuordnung').expect(401);
    });
  });

  describe('Zuordnen und entziehen', () => {
    it('ordnet eine Leistung mehreren Personen zu', async () => {
      await zuordnen(annaId, gesichtId);
      await zuordnen(lisaId, gesichtId);

      const z = await zeile(gesichtId);
      expect(z.staffIds.sort()).toEqual([annaId, lisaId].sort());
    });

    it('entzieht sie wieder', async () => {
      await zuordnen(annaId, gesichtId);
      await alsAdmin('delete', `/api/v1/admin/zuordnung/${annaId}/${gesichtId}`).expect(204);

      expect((await zeile(gesichtId)).staffIds).toEqual([]);
    });

    it('ist beim Zuordnen idempotent', async () => {
      // Ein doppelt abgeschickter Klick darf nicht als Fehler zurückkommen —
      // das Kästchen ist angehakt, genau wie gewollt.
      await zuordnen(annaId, gesichtId);
      await zuordnen(annaId, gesichtId);

      expect((await zeile(gesichtId)).staffIds).toEqual([annaId]);
    });

    it('ist beim Entziehen idempotent', async () => {
      await alsAdmin('delete', `/api/v1/admin/zuordnung/${annaId}/${gesichtId}`).expect(204);
      await alsAdmin('delete', `/api/v1/admin/zuordnung/${annaId}/${gesichtId}`).expect(204);
    });

    it('lehnt unbekannte Kennungen ab', async () => {
      const erfunden = '00000000-0000-4000-8000-000000000000';
      await alsAdmin('put', `/api/v1/admin/zuordnung/${erfunden}/${gesichtId}`).expect(404);
      await alsAdmin('put', `/api/v1/admin/zuordnung/${annaId}/${erfunden}`).expect(404);
    });

    it('zeigt alle Personen und Leistungen als Raster, auch ohne Zuordnung', async () => {
      const m = await matrix();
      expect(m.staff.map((s) => s.displayName).sort()).toEqual(['Anna', 'Lisa']);
      expect(m.zeilen.map((z) => z.name)).toEqual(['Gesichtsbehandlung', 'Massage']);
      expect(m.zeilen.every((z) => z.staffIds.length === 0)).toBe(true);
    });
  });

  describe('Entziehen mit offenen Terminen', () => {
    async function terminAnlegen(wannStunden: number) {
      const start = new Date(Date.now() + wannStunden * 60 * 60 * 1000);
      return prisma.appointment.create({
        data: {
          customerId: kundinId,
          staffId: annaId,
          serviceId: gesichtId,
          startsAt: start,
          endsAt: new Date(start.getTime() + 60 * 60 * 1000),
          priceCentsSnapshot: 8900,
        },
      });
    }

    it('lehnt ab und nennt die Anzahl', async () => {
      await zuordnen(annaId, gesichtId);
      await terminAnlegen(48);

      const antwort = await alsAdmin(
        'delete',
        `/api/v1/admin/zuordnung/${annaId}/${gesichtId}`,
      ).expect(409);

      expect(antwort.body.message).toContain('1 Termine');
      // Nichts passiert, solange nicht bestätigt wurde.
      expect((await zeile(gesichtId)).staffIds).toEqual([annaId]);
    });

    it('lässt es nach ausdrücklicher Bestätigung zu', async () => {
      await zuordnen(annaId, gesichtId);
      const termin = await terminAnlegen(48);

      await alsAdmin(
        'delete',
        `/api/v1/admin/zuordnung/${annaId}/${gesichtId}?bestaetigt=true`,
      ).expect(204);

      expect((await zeile(gesichtId)).staffIds).toEqual([]);

      // Der Termin bleibt. Ob er stattfindet, entscheidet das Studio — nicht
      // diese Funktion.
      expect(await prisma.appointment.findUnique({ where: { id: termin.id } })).not.toBeNull();
    });

    it('stört sich nicht an vergangenen Terminen', async () => {
      await zuordnen(annaId, gesichtId);
      await terminAnlegen(-48);

      // Dass Anna im März eine Behandlung gemacht hat, bleibt wahr, auch wenn
      // sie die Leistung heute nicht mehr anbietet.
      await alsAdmin('delete', `/api/v1/admin/zuordnung/${annaId}/${gesichtId}`).expect(204);
    });

    it('stört sich nicht an abgesagten Terminen', async () => {
      await zuordnen(annaId, gesichtId);
      const termin = await terminAnlegen(48);
      await prisma.appointment.update({
        where: { id: termin.id },
        data: { status: 'CANCELLED_BY_CUSTOMER', cancelledAt: new Date() },
      });

      await alsAdmin('delete', `/api/v1/admin/zuordnung/${annaId}/${gesichtId}`).expect(204);
    });

    it('wertet einen Tippfehler als fehlende Bestätigung', async () => {
      // Die sichere Richtung: Was nicht ausdruecklich "true" ist, bestaetigt
      // nichts. Ein vertipptes `?bestaetigt=ja` darf einen Entzug mit offenen
      // Terminen nicht durchwinken.
      await zuordnen(annaId, gesichtId);
      await terminAnlegen(48);

      await alsAdmin(
        'delete',
        `/api/v1/admin/zuordnung/${annaId}/${gesichtId}?bestaetigt=ja`,
      ).expect(409);

      expect((await zeile(gesichtId)).staffIds).toEqual([annaId]);
    });
  });

  describe('Öffentliche Sicht', () => {
    const oeffentlicheLeistungen = async () =>
      (await request(server).get('/api/v1/services').expect(200)).body as Array<{ id: string }>;

    it('zeigt keine Leistung, die niemand anbietet', async () => {
      expect(await oeffentlicheLeistungen()).toEqual([]);

      await zuordnen(annaId, gesichtId);

      expect((await oeffentlicheLeistungen()).map((l) => l.id)).toEqual([gesichtId]);
    });

    it('zählt eine deaktivierte Kosmetiker:in nicht als Anbieterin', async () => {
      await zuordnen(lisaId, massageId);
      expect((await oeffentlicheLeistungen()).map((l) => l.id)).toContain(massageId);

      await prisma.staffProfile.update({ where: { id: lisaId }, data: { isActive: false } });

      expect((await oeffentlicheLeistungen()).map((l) => l.id)).not.toContain(massageId);
    });

    it('zählt eine Person ohne eingelösten Zugang nicht als Anbieterin', async () => {
      await zuordnen(lisaId, massageId);
      await prisma.user.update({ where: { id: lisaUserId }, data: { emailVerifiedAt: null } });

      // Wer seinen eigenen Kalender nicht öffnen kann, soll nicht buchbar sein.
      expect((await oeffentlicheLeistungen()).map((l) => l.id)).not.toContain(massageId);
    });

    it('liefert die Anbieterinnen einer Leistung', async () => {
      await zuordnen(annaId, gesichtId);
      await zuordnen(lisaId, gesichtId);
      await zuordnen(lisaId, massageId);

      const antwort = await request(server).get(`/api/v1/services/${gesichtId}/staff`).expect(200);
      expect(antwort.body.map((s: { displayName: string }) => s.displayName).sort()).toEqual([
        'Anna',
        'Lisa',
      ]);

      // Und nur die der jeweiligen Leistung.
      const nurLisa = await request(server).get(`/api/v1/services/${massageId}/staff`).expect(200);
      expect(nurLisa.body.map((s: { displayName: string }) => s.displayName)).toEqual(['Lisa']);
    });

    it('gibt bei den Anbieterinnen keine Beschäftigtendaten preis', async () => {
      await zuordnen(annaId, gesichtId);
      const antwort = await request(server).get(`/api/v1/services/${gesichtId}/staff`).expect(200);

      expect(Object.keys(antwort.body[0]).sort()).toEqual(['bio', 'displayName', 'id', 'photoUrl']);
      expect(JSON.stringify(antwort.body)).not.toContain('anna@test.invalid');
    });

    it('verschweigt eine deaktivierte Leistung', async () => {
      await zuordnen(annaId, gesichtId);
      await prisma.service.update({ where: { id: gesichtId }, data: { isActive: false } });

      await request(server).get(`/api/v1/services/${gesichtId}/staff`).expect(404);
    });
  });

  describe('Rückmeldung an die Verwaltung', () => {
    it('meldet eine aktive Leistung ohne Anbieterin als nicht buchbar', async () => {
      const liste = async () =>
        (
          await request(server)
            .get('/api/v1/admin/services')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)
        ).body as Array<{ id: string; buchbar: boolean; anbieterAnzahl: number }>;

      // Ohne diesen Hinweis sucht die Studioleitung den Fehler in der App.
      expect((await liste()).find((l) => l.id === gesichtId)!.buchbar).toBe(false);

      await zuordnen(annaId, gesichtId);

      const nachher = (await liste()).find((l) => l.id === gesichtId)!;
      expect(nachher.buchbar).toBe(true);
      expect(nachher.anbieterAnzahl).toBe(1);
    });

    it('unterscheidet zugeordnet von buchbar', async () => {
      await zuordnen(lisaId, massageId);
      await prisma.staffProfile.update({ where: { id: lisaId }, data: { isActive: false } });

      const antwort = await request(server)
        .get('/api/v1/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const eintrag = antwort.body.find((l: { id: string }) => l.id === massageId);
      // Genau diese Differenz macht den Fall erklärbar: zugeordnet schon,
      // buchbar nicht.
      expect(eintrag.anbieterAnzahl).toBe(1);
      expect(eintrag.buchbar).toBe(false);
    });
  });
});
