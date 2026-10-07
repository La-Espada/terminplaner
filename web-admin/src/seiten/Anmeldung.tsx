import { useState, type FormEvent } from 'react';
import { ApiFehler } from '../api/client';
import { useSitzung } from '../auth/SitzungsKontext';

export function Anmeldung() {
  const { anmelden } = useSitzung();

  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setLaedt(true);
    setFehler(null);

    try {
      await anmelden(email.trim(), passwort);
      setPasswort('');
      // Keine eigene Weiterleitung: Sobald die Sitzung steht, uebernimmt
      // NurAbgemeldet und schickt zum gemerkten Ziel.
    } catch (e) {
      setFehler(e instanceof ApiFehler ? e.message : 'Es ist ein unerwarteter Fehler aufgetreten.');
    } finally {
      setLaedt(false);
    }
  }

  const vollstaendig = email.trim() !== '' && passwort !== '';

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-tinte text-xl font-semibold tracking-[2px]">DERMAZENTRUM</div>
          <div className="text-gold-text text-[15px] font-light tracking-[4px]">Siebenhirten</div>
        </div>

        <form className="karte" onSubmit={absenden} noValidate>
          <h1 className="text-tinte text-[28px] leading-tight font-semibold">Verwaltung</h1>
          <p className="text-grau-700 mt-1 mb-6">
            Anmeldung für Studioleitung und Kosmetiker:innen.
          </p>

          <div className="mb-4">
            <label className="feld-beschriftung" htmlFor="email">
              E-Mail-Adresse
            </label>
            <input
              id="email"
              type="email"
              className="feld-eingabe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ihre@adresse.at"
              autoComplete="username"
              aria-invalid={fehler !== null}
              required
            />
          </div>

          <div className="mb-4">
            <label className="feld-beschriftung" htmlFor="passwort">
              Passwort
            </label>
            <input
              id="passwort"
              type="password"
              className="feld-eingabe"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              placeholder="Ihr Passwort"
              autoComplete="current-password"
              aria-invalid={fehler !== null}
              required
            />
          </div>

          {fehler !== null && (
            <div className="meldung meldung-fehler mb-4" role="alert">
              {fehler}
            </div>
          )}

          <button className="knopf w-full" type="submit" disabled={!vollstaendig || laedt}>
            {laedt ? 'Anmeldung läuft …' : 'Anmelden'}
          </button>
        </form>

        <p className="text-grau-700 mt-6 text-center text-[13px]">
          Kein Konto? Zugänge legt die Studioleitung an —
          <br />
          hier gibt es bewusst keine Registrierung.
        </p>
      </div>
    </div>
  );
}
