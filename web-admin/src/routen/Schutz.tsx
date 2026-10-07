import { Navigate, Outlet, useLocation } from 'react-router';
import { useSitzung, type Rolle } from '../auth/SitzungsKontext';

/**
 * Lässt nur angemeldete Personen durch.
 *
 * Wer nicht angemeldet ist, wird zur Anmeldung geleitet — **mit dem Ziel im
 * Gepäck**. Nach der Anmeldung geht es dort weiter, wo man hinwollte, statt auf
 * einer Startseite zu landen. Das ist der Unterschied zwischen „funktioniert"
 * und „ist benutzbar": Wer ein Lesezeichen auf den Kalender hat, möchte nach dem
 * Anmelden im Kalender sein.
 */
export function NurAngemeldet() {
  const { person } = useSitzung();
  const ort = useLocation();

  if (person === undefined) return <Ladeanzeige />;

  if (person === null) {
    return <Navigate to="/anmelden" replace state={{ von: ort.pathname + ort.search }} />;
  }

  return <Outlet />;
}

/**
 * Schränkt auf bestimmte Rollen ein.
 *
 * **Das ist nur die Oberfläche.** Die eigentliche Absicherung steht im Backend
 * (Schritt 10). Wer die Adresse kennt, kommt hier zwar nicht hin, könnte die API
 * aber direkt ansprechen — und genau dort wird er abgewiesen. Diese Prüfung
 * verhindert bloß, dass jemand Menüpunkte sieht, die für ihn nicht funktionieren.
 */
export function NurRollen({ rollen }: { rollen: Rolle[] }) {
  const { person, hatRolle } = useSitzung();

  if (person === undefined) return <Ladeanzeige />;
  if (person === null) return <Navigate to="/anmelden" replace />;
  if (!hatRolle(...rollen)) return <Navigate to="/" replace />;

  return <Outlet />;
}

/**
 * Lässt angemeldete Personen nicht auf die Anmeldeseite zurück.
 *
 * **Hier wird auch zum ursprünglichen Ziel weitergeleitet**, nicht in der
 * Anmeldemaske. Beides zusammen führte zu einem Wettlauf: Die Maske leitete nach
 * erfolgreicher Anmeldung zum gemerkten Ziel, und im selben Durchlauf sah diese
 * Weiche die angemeldete Person und schickte sie zur Startseite. Das Ziel ging
 * dabei verloren. Eine Zuständigkeit, eine Stelle.
 */
export function NurAbgemeldet() {
  const { person } = useSitzung();
  const ort = useLocation();
  const ziel = (ort.state as { von?: string } | null)?.von ?? '/';

  if (person === undefined) return <Ladeanzeige />;
  if (person !== null) return <Navigate to={ziel} replace />;

  return <Outlet />;
}

function Ladeanzeige() {
  return (
    <div className="text-grau-700 grid min-h-screen place-items-center" aria-live="polite">
      Sitzung wird geprüft …
    </div>
  );
}
