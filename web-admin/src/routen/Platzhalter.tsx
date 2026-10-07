import { useLocation } from 'react-router';
import { MENUE } from '../layout/Navigation';

/**
 * Seite für Bereiche, die es noch nicht gibt.
 *
 * Besser als ein 404: Wer ein Lesezeichen setzt oder eine Adresse errät,
 * bekommt eine Erklärung statt eines Fehlers.
 */
export function Platzhalter() {
  const ort = useLocation();
  const punkt = MENUE.find((p) => p.pfad === ort.pathname);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="karte text-center">
        <h1 className="text-tinte text-2xl font-semibold">{punkt?.titel ?? 'Dieser Bereich'}</h1>
        <p className="text-grau-700 mt-2">
          Dieser Bereich entsteht noch. Die Navigation zeigt ihn bereits, damit ersichtlich ist, was
          geplant ist.
        </p>
      </div>
    </div>
  );
}
