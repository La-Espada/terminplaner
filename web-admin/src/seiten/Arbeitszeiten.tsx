import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { NavLink } from 'react-router';
import { api, type Kosmetikerin } from '../api/client';

/**
 * Gemeinsame Teile der beiden Arbeitszeit-Sichten.
 *
 * Regelwoche und Abwesenheiten beantworten dieselbe Frage aus zwei Richtungen:
 * wann jemand da ist. Deshalb dieselbe Seite mit zwei Reitern statt zweier
 * Menüpunkte.
 */
export function ArbeitszeitReiter() {
  return (
    <div className="border-creme-tief mb-6 flex gap-1 border-b" role="tablist">
      <Reiter zu="/arbeitszeiten" titel="Regelwoche" />
      <Reiter zu="/arbeitszeiten/abwesenheiten" titel="Abwesenheiten" />
    </div>
  );
}

function Reiter({ zu, titel }: { zu: string; titel: string }) {
  return (
    <NavLink
      to={zu}
      end
      role="tab"
      className={({ isActive }) =>
        `-mb-px border-b-2 px-4 py-3 text-sm ${
          isActive
            ? 'border-gold text-tinte font-semibold'
            : 'text-grau-700 hover:text-tinte border-transparent'
        }`
      }
    >
      {titel}
    </NavLink>
  );
}

/** Das Team, einmal geladen und von beiden Reitern geteilt. */
export function useTeam(): UseQueryResult<Kosmetikerin[]> {
  return useQuery({
    queryKey: ['team'],
    queryFn: () => api.team.liste(),
  });
}

interface WahlProps {
  team: UseQueryResult<Kosmetikerin[]>;
  wert: string;
  setzen: (id: string) => void;
  /** Soll „alle" zur Auswahl stehen? Für Abwesenheiten ja, für die Regelwoche nicht. */
  mitAlle?: boolean;
}

/**
 * Auswahl der Kosmetiker:in.
 *
 * Deaktivierte Personen stehen weiterhin zur Wahl, aber gekennzeichnet. Ihre
 * Zeiten zu pflegen ergibt zwar gerade keinen Sinn, aber sie nachzusehen schon —
 * etwa wenn jemand aus der Elternzeit zurückkommt.
 */
export function PersonenWahl({ team, wert, setzen, mitAlle = false }: WahlProps) {
  if (team.isPending) return <p className="text-grau-700 mb-4">Team wird geladen …</p>;

  if (team.isError) {
    return (
      <div className="meldung meldung-fehler mb-4" role="alert">
        Das Team konnte nicht geladen werden.
      </div>
    );
  }

  if ((team.data ?? []).length === 0) {
    return (
      <div className="karte mb-4 text-center">
        <h2 className="text-tinte text-lg font-semibold">Noch niemand im Team</h2>
        <p className="text-grau-700 mt-2 text-sm">
          Arbeitszeiten gehören zu einer Person. Legen Sie zuerst unter „Kosmetiker:innen" jemanden
          an.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="feld-beschriftung" htmlFor="person">
        Kosmetiker:in
      </label>
      <select
        id="person"
        className="feld-eingabe max-w-sm"
        value={wert}
        onChange={(e) => setzen(e.target.value)}
      >
        {mitAlle && <option value="">alle, einschließlich studioweiter Einträge</option>}
        {(team.data ?? []).map((k) => (
          <option key={k.id} value={k.id}>
            {k.displayName}
            {k.isActive ? '' : ' (deaktiviert)'}
          </option>
        ))}
      </select>
    </div>
  );
}
