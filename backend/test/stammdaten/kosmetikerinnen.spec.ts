import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { TokenService } from '../../src/auth/token.service';
import { at, prisma, truncateAll } from '../helpers/db';
import { mailsLeeren, neuesteMail, tokenAusNeuesterMail } from '../helpers/mailpit';

/**
 * Kosmetiker:innen verwalten (Schritt 18).
 *
 * Der entscheidende Test steht ganz unten: anlegen, Einladung aus Mailpit holen,
 * Passwort vergeben, anmelden. Das ist das Abnahmekriterium des Schritts, und es
 * läuft über echte Mails statt über eine Attrappe — ein Link, der falsch
 * zusammengesetzt wird, fällt sonst erst im Betrieb auf.
 */
describe('Kosmetiker:innen', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let passwoerter: PasswordService;
  let sitzungen: TokenService;

  let adminToken: string;
  let staffToken: string;
  let kundinToken: string;

  const beispiel = {
    email: 'anna@test.invalid',
    firstName: 'Anna',
    lastName: 'Berger',
    phone: '+43 1 2345678',
    bio: 'Schwerpunkt Gesichtsbehandlungen.',
    colorHex: '#9c7a53',
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
    await mailsLeeren();

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
    await prisma.staffProfile.create({ data: { userId: staff.id, displayName: 'Lisa' } });

    adminToken = (await sitzungen.issuePair(admin.id, 'ADMIN')).accessToken;
    staffToken = (await sitzungen.issuePair(staff.id, 'STAFF')).accessToken;
    kundinToken = (await sitzungen.issuePair(kundin.id, 'CUSTOMER')).accessToken;
  });

  afterAll(async () => {
    await truncateAll();
    await app.close();
    await prisma.$disconnect();
  });

  async function anlegen(ueberschreiben: Record<string, unknown> = {}) {
    const antwort = await request(server)
      .post('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...beispiel, ...ueberschreiben })
      .expect(201);
    return antwort.body as {
      id: string;
      userId: string;
      displayName: string;
      bio: string | null;
      colorHex: string | null;
      isActive: boolean;
      zugangAktiv: boolean;
      einladungOffen: boolean;
      terminAnzahl: number;
    };
  }

  describe('Rechte', () => {
    it('weist Kosmetiker:innen an der Verwaltung ab', async () => {
      await request(server)
        .get('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('weist Kundinnen an der Verwaltung ab', async () => {
      await request(server)
        .get('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${kundinToken}`)
        .expect(403);
    });

    it('weist ohne Anmeldung ab', async () => {
      await request(server).get('/api/v1/admin/staff').expect(401);
    });
  });

  describe('Anlegen', () => {
    it('legt Konto und Profil an und verschickt eine Einladung', async () => {
      const angelegt = await anlegen();

      expect(angelegt.isActive).toBe(true);
      // Noch kein Passwort vergeben: eingeladen, aber nicht einsatzbereit.
      expect(angelegt.zugangAktiv).toBe(false);
      expect(angelegt.einladungOffen).toBe(true);

      const mail = await neuesteMail();
      expect(mail.To[0].Address).toBe(beispiel.email);
      expect(mail.Text).toContain('/einladung?token=');
    });

    it('übernimmt den Vornamen als Anzeigename, wenn keiner angegeben wird', async () => {
      const angelegt = await anlegen({ displayName: undefined });
      expect(angelegt.displayName).toBe('Anna');
    });

    it('setzt kein brauchbares Passwort — vorher ist keine Anmeldung möglich', async () => {
      await anlegen();

      // Der Hash in der Datenbank ist zufällig. Niemand kennt ihn, auch nicht
      // die Studioleitung, die das Konto gerade angelegt hat.
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: beispiel.email, password: 'ein-langes-passwort' })
        .expect(401);
    });

    it('speichert leere Felder als nicht gesetzt, nicht als Leerstring', async () => {
      // Das Formular schickt leere Felder als "". Landete das in color_hex
      // (Char(7)), fuellte Postgres auf sieben Leerzeichen auf, und die
      // Oberflaeche maelte einen Farbpunkt in der Farbe "       ".
      const angelegt = await anlegen({ bio: '', colorHex: '' });
      expect(angelegt.bio).toBeNull();
      expect(angelegt.colorHex).toBeNull();
    });

    it('lehnt eine bereits vergebene Adresse ab', async () => {
      await anlegen();
      await request(server)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(beispiel)
        .expect(409);
    });

    it('lehnt eine Farbe ab, die nicht #rrggbb ist', async () => {
      await request(server)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...beispiel, colorHex: 'gold' })
        .expect(400);
    });

    it('nimmt kein Passwort entgegen, auch wenn eines mitgeschickt wird', async () => {
      // whitelist + forbidNonWhitelisted: Ein Feld, das es nicht gibt, wird
      // nicht still verworfen, sondern abgelehnt. Sonst könnte eine spätere
      // Oberfläche heimlich Passwörter setzen.
      await request(server)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...beispiel, password: 'heimlich-gesetztes-passwort' })
        .expect(400);
    });
  });

  describe('Ändern', () => {
    it('ändert Anzeigename und Vorstellung', async () => {
      const angelegt = await anlegen();

      const antwort = await request(server)
        .patch(`/api/v1/admin/staff/${angelegt.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ displayName: 'Anna B.', bio: '' })
        .expect(200);

      expect(antwort.body.displayName).toBe('Anna B.');
      expect(antwort.body.bio).toBeNull();
    });

    it('lässt die E-Mail-Adresse nicht ändern', async () => {
      const angelegt = await anlegen();
      await request(server)
        .patch(`/api/v1/admin/staff/${angelegt.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'woanders@test.invalid' })
        .expect(400);
    });
  });

  describe('Deaktivieren', () => {
    it('sperrt die Anmeldung und beendet laufende Sitzungen', async () => {
      const angelegt = await anlegen();

      // Zugang einrichten, damit es etwas zu sperren gibt.
      const token = await tokenAusNeuesterMail();
      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token, password: 'anna-ihr-eigenes-passwort' })
        .expect(200);

      const anmeldung = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: beispiel.email, password: 'anna-ihr-eigenes-passwort' })
        .expect(200);

      // Vor dem Deaktivieren trägt die Sitzung.
      await request(server)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${anmeldung.body.accessToken}`)
        .expect(200);

      await request(server)
        .patch(`/api/v1/admin/staff/${angelegt.id}/aktiv`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      // Danach nicht mehr — weder mit dem offenen Access-Token …
      await request(server)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${anmeldung.body.accessToken}`)
        .expect(401);

      // … noch über eine neue Anmeldung. 401 mit der üblichen Meldung, nicht
      // 403: Dass ein Konto gesperrt wurde, geht einen Anrufer nichts an.
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: beispiel.email, password: 'anna-ihr-eigenes-passwort' })
        .expect(401);
    });

    it('macht eine offene Einladung unbrauchbar', async () => {
      // Der Fall, der ohne Pruefung ein Hintereingang waere: Anna wird
      // eingeladen, loest nicht ein, wird deaktiviert — und klickt den Link
      // zwei Tage spaeter trotzdem. Setzte das Einloesen den Status auf ACTIVE,
      // verschaffte sie sich damit selbst wieder Zugang zu Kundendaten.
      const angelegt = await anlegen();
      const token = await tokenAusNeuesterMail();

      await request(server)
        .patch(`/api/v1/admin/staff/${angelegt.id}/aktiv`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token, password: 'anna-ihr-eigenes-passwort' })
        .expect(400);

      // Und erst recht keine Anmeldung.
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: beispiel.email, password: 'anna-ihr-eigenes-passwort' })
        .expect(401);

      const konto = await prisma.user.findUniqueOrThrow({ where: { email: beispiel.email } });
      expect(konto.status).toBe('BLOCKED');
      expect(konto.emailVerifiedAt).toBeNull();
    });

    it('lässt auch keine neue Einladung für ein deaktiviertes Konto zu', async () => {
      const angelegt = await anlegen();

      await request(server)
        .patch(`/api/v1/admin/staff/${angelegt.id}/aktiv`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      await request(server)
        .post(`/api/v1/admin/staff/${angelegt.id}/einladung`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(409);
    });

    it('nimmt deaktivierte Personen aus der öffentlichen Liste', async () => {
      const angelegt = await anlegen();

      await request(server)
        .patch(`/api/v1/admin/staff/${angelegt.id}/aktiv`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      const oeffentlich = await request(server).get('/api/v1/staff').expect(200);
      expect(oeffentlich.body.map((k: { id: string }) => k.id)).not.toContain(angelegt.id);
    });
  });

  describe('Öffentliche Liste', () => {
    it('zeigt nur Personen, die ihren Zugang eingerichtet haben', async () => {
      const angelegt = await anlegen();

      // Noch eingeladen, noch kein Passwort: Diese Person ist nicht buchbar.
      let antwort = await request(server).get('/api/v1/staff').expect(200);
      expect(antwort.body.map((k: { id: string }) => k.id)).not.toContain(angelegt.id);

      const token = await tokenAusNeuesterMail();
      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token, password: 'anna-ihr-eigenes-passwort' })
        .expect(200);

      antwort = await request(server).get('/api/v1/staff').expect(200);
      expect(antwort.body.map((k: { id: string }) => k.id)).toContain(angelegt.id);
    });

    it('gibt keine Beschäftigtendaten preis', async () => {
      const angelegt = await anlegen();
      const token = await tokenAusNeuesterMail();
      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token, password: 'anna-ihr-eigenes-passwort' })
        .expect(200);

      const antwort = await request(server).get('/api/v1/staff').expect(200);
      const eintrag = antwort.body.find((k: { id: string }) => k.id === angelegt.id);

      expect(Object.keys(eintrag).sort()).toEqual(['bio', 'displayName', 'id', 'photoUrl']);
      expect(JSON.stringify(antwort.body)).not.toContain(beispiel.email);
      expect(JSON.stringify(antwort.body)).not.toContain(beispiel.lastName);
    });
  });

  describe('Einladung', () => {
    it('lehnt einen unbekannten Token ab', async () => {
      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token: 'x'.repeat(43), password: 'ein-langes-passwort' })
        .expect(400);
    });

    it('wirkt genau einmal', async () => {
      await anlegen();
      const token = await tokenAusNeuesterMail();

      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token, password: 'anna-ihr-eigenes-passwort' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token, password: 'ein-ganz-anderes-passwort' })
        .expect(400);
    });

    it('entwertet die vorige Einladung, wenn eine neue verschickt wird', async () => {
      const angelegt = await anlegen();
      const alterToken = await tokenAusNeuesterMail();

      await mailsLeeren();
      await request(server)
        .post(`/api/v1/admin/staff/${angelegt.id}/einladung`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(202);

      const neuerToken = await tokenAusNeuesterMail();
      expect(neuerToken).not.toBe(alterToken);

      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token: alterToken, password: 'ein-langes-passwort' })
        .expect(400);

      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token: neuerToken, password: 'ein-langes-passwort' })
        .expect(200);
    });

    it('wird abgelehnt, wenn das Konto schon ein Passwort hat', async () => {
      // Sonst waere "Einladung erneut" doch ein von der Studioleitung
      // ausgeloester Weg, das Passwort eines aktiven Kontos zu ersetzen —
      // sieben Tage gueltig und ohne die Benachrichtigung, die ein echter
      // Reset ausloest.
      const angelegt = await anlegen();
      const token = await tokenAusNeuesterMail();
      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token, password: 'anna-ihr-eigenes-passwort' })
        .expect(200);

      await request(server)
        .post(`/api/v1/admin/staff/${angelegt.id}/einladung`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(409);
    });

    it('lehnt ein zu kurzes Passwort ab', async () => {
      await anlegen();
      const token = await tokenAusNeuesterMail();
      await request(server)
        .post('/api/v1/auth/invitation/accept')
        .send({ token, password: 'kurz' })
        .expect(400);
    });

    it('taugt nicht als Passwort-Reset', async () => {
      // Ein Einladungstoken darf nicht am Reset-Endpunkt wirken und umgekehrt.
      // Sonst liesse sich der laengere Gueltigkeitszeitraum der Einladung
      // zweckentfremden.
      await anlegen();
      const token = await tokenAusNeuesterMail();
      await request(server)
        .post('/api/v1/auth/password/reset')
        .send({ token, password: 'ein-langes-passwort' })
        .expect(400);
    });
  });

  describe('Löschen', () => {
    it('löscht eine Person ohne Termine samt Konto', async () => {
      const angelegt = await anlegen();

      await request(server)
        .delete(`/api/v1/admin/staff/${angelegt.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(await prisma.user.findUnique({ where: { id: angelegt.userId } })).toBeNull();
    });

    it('verweigert das Löschen, sobald ein Termin daranhängt', async () => {
      const angelegt = await anlegen();

      const service = await prisma.service.create({
        data: { name: 'Gesichtsbehandlung', durationMinutes: 60, priceCents: 8900 },
      });
      const kundin = await prisma.user.findUniqueOrThrow({
        where: { email: 'kundin@test.invalid' },
      });

      await prisma.appointment.create({
        data: {
          customerId: kundin.id,
          staffId: angelegt.id,
          serviceId: service.id,
          startsAt: at(9),
          endsAt: at(10),
          priceCentsSnapshot: 8900,
        },
      });

      await request(server)
        .delete(`/api/v1/admin/staff/${angelegt.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });

  /**
   * Das Abnahmekriterium von Schritt 18, in einem Durchlauf.
   */
  it('Studioleitung legt an, Kosmetikerin meldet sich selbst an', async () => {
    const angelegt = await anlegen();

    const mail = await neuesteMail();
    expect(mail.Subject).toContain('Zugang');
    // Die Mail enthaelt einen Link, kein Passwort. Ein versendetes Passwort
    // waere der Fehler, den dieser ganze Weg vermeiden soll.
    expect(mail.Text).toContain('/einladung?token=');
    expect(mail.Text).not.toMatch(/Passwort lautet|Ihr Passwort ist/i);

    const token = await tokenAusNeuesterMail();
    await request(server)
      .post('/api/v1/auth/invitation/accept')
      .send({ token, password: 'anna-ihr-eigenes-passwort' })
      .expect(200);

    const anmeldung = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: beispiel.email, password: 'anna-ihr-eigenes-passwort' })
      .expect(200);

    const profil = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${anmeldung.body.accessToken}`)
      .expect(200);

    expect(profil.body.role).toBe('STAFF');
    expect(profil.body.email).toBe(beispiel.email);

    // Und die Verwaltung zeigt den neuen Zustand an.
    const liste = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const eintrag = liste.body.find((k: { id: string }) => k.id === angelegt.id);
    expect(eintrag.zugangAktiv).toBe(true);
    expect(eintrag.einladungOffen).toBe(false);
  });
});
