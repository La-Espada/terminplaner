import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config({ path: ['../.env', '.env'], quiet: true });

/**
 * Legt das erste Admin-Konto an.
 *
 * Das erste Konto lässt sich nicht über die Registrierung erzeugen — dort wird
 * jeder zur Kundin, und das ist Absicht (siehe docs/ENTSCHEIDUNGEN.md, Schritt 8).
 * Ohne dieses Skript käme man also nie ins Admin-Web hinein.
 *
 * Aufruf:
 *   npm run seed:admin --workspace @terminplaner/backend
 *
 * Passwort über ADMIN_PASSWORD setzen. Fehlt es, wird in der Entwicklung eines
 * erzeugt und ausgegeben; in Produktion bricht das Skript ab, damit kein
 * geratenes Standardpasswort entsteht.
 */

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function main(): Promise<void> {
  const produktion = process.env.NODE_ENV === 'production';
  const email = process.env.ADMIN_EMAIL ?? 'admin@derma-siebenhirten.at';
  const vorname = process.env.ADMIN_FIRST_NAME ?? 'Aynur';
  const nachname = process.env.ADMIN_LAST_NAME ?? 'Aslan';

  let passwort = process.env.ADMIN_PASSWORD ?? '';
  let erzeugt = false;

  if (passwort === '') {
    if (produktion) {
      throw new Error(
        'ADMIN_PASSWORD ist nicht gesetzt. In Produktion wird kein Passwort erzeugt — ' +
          'sonst steht es im Terminalprotokoll.',
      );
    }
    // 24 Byte base64url ergeben 32 Zeichen, deutlich über der Mindestlänge.
    passwort = randomBytes(24).toString('base64url');
    erzeugt = true;
  }

  if (passwort.length < 12) {
    throw new Error('ADMIN_PASSWORD muss mindestens 12 Zeichen haben.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const vorhanden = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (vorhanden) {
      // Bestehendes Konto nicht überschreiben — sonst setzt ein versehentlicher
      // zweiter Aufruf das Passwort der Studioleitung zurück.
      console.log(`Konto ${email} existiert bereits (Rolle ${vorhanden.role}). Nichts geändert.`);
      return;
    }

    const passwordHash = await hash(passwort, ARGON);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'ADMIN',
          firstName: vorname,
          lastName: nachname,
          // Das Admin-Konto wird nicht per Mail bestätigt: Es entsteht hier,
          // nicht über die Registrierung.
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      });

      // Auch für das Admin-Konto werden Einwilligungen protokolliert, damit die
      // Nachweiskette lückenlos ist.
      await tx.consent.createMany({
        data: (['TOS', 'PRIVACY'] as const).map((type) => ({
          userId: user.id,
          type,
          version: '1.0',
          granted: true,
          grantedAt: new Date(),
        })),
      });
    });

    console.log('');
    console.log('Admin-Konto angelegt:');
    console.log(`  E-Mail:   ${email}`);
    if (erzeugt) {
      console.log(`  Passwort: ${passwort}`);
      console.log('');
      console.log('  Dieses Passwort wird nur jetzt angezeigt. Notieren und danach ändern.');
    } else {
      console.log('  Passwort: wie in ADMIN_PASSWORD gesetzt');
    }
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((fehler: unknown) => {
  console.error(fehler instanceof Error ? fehler.message : fehler);
  process.exit(1);
});
