import { config } from 'dotenv';

// Die .env liegt im Wurzelverzeichnis des Monorepos.
config({ path: ['../.env', '.env'], quiet: true });

const url = process.env.DATABASE_URL ?? '';

// Schutzschalter: Die Tests legen Daten an und räumen sie wieder weg. Liefe das
// versehentlich gegen eine Produktionsdatenbank, wäre der Schaden nicht reparabel.
const istLokal = /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)[:/]/.test(url);

if (!url) {
  throw new Error('DATABASE_URL ist nicht gesetzt. Tests brechen ab.');
}

if (!istLokal) {
  throw new Error(
    'DATABASE_URL zeigt nicht auf eine lokale Datenbank. Tests werden abgebrochen, ' +
      'weil sie Daten anlegen und löschen. Gefunden: ' +
      url.replace(/:[^:@/]+@/, ':***@'),
  );
}
