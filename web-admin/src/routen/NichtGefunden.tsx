import { Link } from 'react-router';

export function NichtGefunden() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="karte text-center">
        <h1 className="text-tinte text-2xl font-semibold">Seite nicht gefunden</h1>
        <p className="text-grau-700 mt-2">
          Diese Adresse gibt es nicht. Möglicherweise hat sich etwas verschoben.
        </p>
        <Link to="/" className="knopf knopf-gold mt-6 inline-flex">
          Zur Übersicht
        </Link>
      </div>
    </div>
  );
}
