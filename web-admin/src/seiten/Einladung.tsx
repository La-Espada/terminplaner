import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiFehler, api } from '../api/client';

/** Dieselbe Untergrenze wie im Backend. Zwei Zahlen, die auseinanderlaufen, wären ein Fehler. */
const MINDESTLAENGE = 12;

/**
 * Einladung einlösen — erstes Passwort für ein vom Studio angelegtes Konto.
 *
 * Bewusst **außerhalb** von `NurAngemeldet` und `NurAbgemeldet`: Wer hier
 * ankommt, hat noch kein Passwort, und wenn zufällig jemand anderes in diesem
 * Browser angemeldet ist, darf das den Link nicht abfangen. Was zählt, ist der
 * Token, nicht die Sitzung.
 */
export function Einladung() {
  const [parameter] = useSearchParams();
  const token = parameter.get('token') ?? '';

  const [passwort, setPasswort] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fertig, setFertig] = useState(false);

  const zuKurz = passwort !== '' && passwort.length < MINDESTLAENGE;
  const ungleich = wiederholung !== '' && passwort !== wiederholung;
  const gueltig = passwort.length >= MINDESTLAENGE && passwort === wiederholung;

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setLaedt(true);
    setFehler(null);

    try {
      await api.einladungEinloesen(token, passwort);
      // Beide Felder leeren, bevor die Erfolgsansicht kommt. Das Passwort hat im
      // Zustand der Seite nichts mehr verloren.
      setPasswort('');
      setWiederholung('');
      setFertig(true);
    } catch (e) {
      setFehler(e instanceof ApiFehler ? e.message : 'Es ist ein unerwarteter Fehler aufgetreten.');
    } finally {
      setLaedt(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-tinte text-xl font-semibold tracking-[2px]">DERMAZENTRUM</div>
          <div className="text-gold-text text-[15px] font-light tracking-[4px]">Siebenhirten</div>
        </div>

        {token === '' ? (
          <div className="karte">
            <h1 className="text-tinte text-[28px] leading-tight font-semibold">
              Link unvollständig
            </h1>
            <p className="text-grau-700 mt-2">
              In dieser Adresse fehlt der Einladungscode. Öffnen Sie den Link bitte direkt aus der
              E-Mail — manche Programme kürzen ihn beim Weiterleiten ab.
            </p>
          </div>
        ) : fertig ? (
          <div className="karte">
            <h1 className="text-tinte text-[28px] leading-tight font-semibold">Passwort gesetzt</h1>
            <p className="text-grau-700 mt-2 mb-6">
              Ihr Zugang ist eingerichtet. Melden Sie sich mit Ihrer E-Mail-Adresse und dem eben
              gewählten Passwort an.
            </p>
            <Link className="knopf w-full justify-center" to="/anmelden">
              Zur Anmeldung
            </Link>
          </div>
        ) : (
          <form className="karte" onSubmit={absenden} noValidate>
            <h1 className="text-tinte text-[28px] leading-tight font-semibold">Willkommen</h1>
            <p className="text-grau-700 mt-1 mb-6">
              Vergeben Sie Ihr Passwort. Niemand sonst kennt es — auch die Studioleitung nicht.
            </p>

            <div className="mb-4">
              <label className="feld-beschriftung" htmlFor="passwort">
                Neues Passwort
              </label>
              <input
                id="passwort"
                type="password"
                className="feld-eingabe"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                autoComplete="new-password"
                aria-invalid={zuKurz}
                aria-describedby="passwort-hinweis"
                required
              />
              <p id="passwort-hinweis" className="text-grau-700 mt-1 text-[12px]">
                Mindestens {MINDESTLAENGE} Zeichen. Ein Satz, den nur Sie sich merken, ist besser
                als ein kurzes Wort mit Sonderzeichen.
              </p>
            </div>

            <div className="mb-4">
              <label className="feld-beschriftung" htmlFor="wiederholung">
                Passwort wiederholen
              </label>
              <input
                id="wiederholung"
                type="password"
                className="feld-eingabe"
                value={wiederholung}
                onChange={(e) => setWiederholung(e.target.value)}
                autoComplete="new-password"
                aria-invalid={ungleich}
                required
              />
              {ungleich && (
                <p className="text-fehler mt-1 text-[13px]" role="alert">
                  Die beiden Eingaben stimmen nicht überein.
                </p>
              )}
            </div>

            {fehler !== null && (
              <div className="meldung meldung-fehler mb-4" role="alert">
                {fehler}
              </div>
            )}

            <button className="knopf w-full" type="submit" disabled={!gueltig || laedt}>
              {laedt ? 'Wird gespeichert …' : 'Passwort vergeben'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
