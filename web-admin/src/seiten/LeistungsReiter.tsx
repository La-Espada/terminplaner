import { NavLink } from 'react-router';

/**
 * Umschalter zwischen der Leistungsliste und der Zuordnungsmatrix.
 *
 * Bewusst kein eigener Menüpunkt: Beides sind Sichten auf dieselben Daten, und
 * die Frage „wer bietet was an" stellt sich immer beim Pflegen der Leistungen.
 * Ein zehnter Eintrag in der Seitenleiste für etwas, das man selten anfasst,
 * macht die Navigation unübersichtlicher, nicht klarer.
 */
export function LeistungsReiter() {
  return (
    <div className="border-creme-tief mb-6 flex gap-1 border-b" role="tablist">
      <Reiter zu="/leistungen" titel="Leistungen" />
      <Reiter zu="/leistungen/zuordnung" titel="Wer bietet was an" />
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
