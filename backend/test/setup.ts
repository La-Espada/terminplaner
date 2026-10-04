import { config } from 'dotenv';

// Die .env liegt im Wurzelverzeichnis des Monorepos.
config({ path: ['../.env', '.env'], quiet: true });

// Die Anfragebegrenzung wird in Tests hochgesetzt: Viele Testfaelle melden sich
// hintereinander an und stolperten sonst uebereinander. Ihr Verhalten prueft eine
// eigene Datei, die die Werte selbst vorgibt, bevor die Anwendung startet.
// Die Anfragebegrenzung wird in Tests praktisch abgeschaltet: Viele Testfaelle
// melden sich hintereinander an und liefen sonst in die Sperre. Das Verhalten
// der Begrenzung prueft eine eigene Datei, die die Grenzen im Testmodul
// ueberschreibt statt ueber Umgebungsvariablen — das ist unabhaengig davon, in
// welcher Reihenfolge Setup- und Testdatei ausgefuehrt werden.
process.env.RATE_LIMIT_STANDARD = '100000';
process.env.RATE_LIMIT_ANMELDUNG = '100000';
process.env.RATE_LIMIT_MAIL = '100000';

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
