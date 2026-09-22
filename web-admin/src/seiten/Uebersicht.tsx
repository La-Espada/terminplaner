import { api, setzeAccessToken } from '../api/client';

interface Props {
  onAbgemeldet: () => void;
}

/** Platzhalter. Das Dashboard entsteht in Schritt 16, der Kalender in Schritt 25. */
export function Uebersicht({ onAbgemeldet }: Props) {
  async function abmelden() {
    try {
      await api.abmelden();
    } finally {
      setzeAccessToken(null);
      onAbgemeldet();
    }
  }

  return (
    <div className="mitte">
      <div className="karte">
        <h1>Angemeldet</h1>
        <p className="untertitel">
          Die Anmeldung funktioniert. Navigation und Kalender entstehen in Schritt 16 und 25.
        </p>
        <div className="meldung">
          Der Access-Token liegt nur im Speicher. Beim Neuladen wird er über das httpOnly-Cookie
          automatisch erneuert — probieren Sie es aus.
        </div>
        <button className="knopf knopf--gold" type="button" onClick={abmelden}>
          Abmelden
        </button>
      </div>
    </div>
  );
}
