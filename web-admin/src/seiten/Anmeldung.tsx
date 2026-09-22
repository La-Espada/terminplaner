import { useState, type FormEvent } from 'react';
import { ApiFehler, api, setzeAccessToken } from '../api/client';

interface Props {
  onAngemeldet: () => void;
}

export function Anmeldung({ onAngemeldet }: Props) {
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setLaedt(true);
    setFehler(null);

    try {
      const antwort = await api.anmelden(email.trim(), passwort);
      setzeAccessToken(antwort.accessToken);
      // Passwort nicht im Zustand liegen lassen.
      setPasswort('');
      onAngemeldet();
    } catch (e) {
      setFehler(e instanceof ApiFehler ? e.message : 'Es ist ein unerwarteter Fehler aufgetreten.');
    } finally {
      setLaedt(false);
    }
  }

  const vollstaendig = email.trim() !== '' && passwort !== '';

  return (
    <div className="mitte">
      <div>
        <div className="marke">
          <div className="marke__name">DERMAZENTRUM</div>
          <div className="marke__zusatz">Siebenhirten</div>
        </div>

        <form className="karte" onSubmit={absenden} noValidate>
          <h1>Verwaltung</h1>
          <p className="untertitel">Anmeldung für Studioleitung und Kosmetiker:innen.</p>

          <div className="feld">
            <label htmlFor="email">E-Mail-Adresse</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ihre@adresse.at"
              autoComplete="username"
              aria-invalid={fehler !== null}
              required
            />
          </div>

          <div className="feld">
            <label htmlFor="passwort">Passwort</label>
            <input
              id="passwort"
              type="password"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              placeholder="Ihr Passwort"
              autoComplete="current-password"
              aria-invalid={fehler !== null}
              required
            />
          </div>

          {fehler !== null && (
            <div className="meldung meldung--fehler" role="alert">
              {fehler}
            </div>
          )}

          <button className="knopf" type="submit" disabled={!vollstaendig || laedt}>
            {laedt ? 'Anmeldung läuft …' : 'Anmelden'}
          </button>
        </form>

        <p className="hinweis">
          Kein Konto? Zugänge legt die Studioleitung an —<br />
          hier gibt es bewusst keine Registrierung.
        </p>
      </div>
    </div>
  );
}
