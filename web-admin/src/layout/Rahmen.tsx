import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useSitzung, type Rolle } from '../auth/SitzungsKontext';
import { sichtbareMenuePunkte } from './Navigation';

/**
 * Grundgerüst der Verwaltung: Seitenleiste, Kopfzeile, Inhaltsbereich.
 *
 * Auf schmalen Geräten klappt die Seitenleiste ein. An der Rezeption steht
 * häufig ein Tablet — das ist kein Randfall, sondern der zweithäufigste
 * Arbeitsplatz.
 */
export function Rahmen() {
  const { person, abmelden } = useSitzung();
  const navigate = useNavigate();
  const [menueOffen, setMenueOffen] = useState(false);

  const punkte = sichtbareMenuePunkte(person?.role as Rolle | undefined);

  async function abmeldenUndWeiter() {
    await abmelden();
    void navigate('/anmelden', { replace: true });
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Kopfzeile nur auf schmalen Geräten */}
      <header className="border-creme-tief flex items-center justify-between border-b bg-white px-4 py-3 lg:hidden">
        <Marke />
        <button
          type="button"
          className="knopf knopf-still min-h-12 px-4"
          onClick={() => setMenueOffen((o) => !o)}
          aria-expanded={menueOffen}
          aria-controls="hauptmenue"
        >
          {menueOffen ? 'Schließen' : 'Menü'}
        </button>
      </header>

      <aside
        id="hauptmenue"
        className={`border-creme-tief w-full shrink-0 border-r bg-white lg:block lg:w-64 ${
          menueOffen ? 'block' : 'hidden'
        }`}
      >
        <div className="hidden px-6 py-6 lg:block">
          <Marke />
        </div>

        <nav className="px-3 pb-4 lg:px-3" aria-label="Hauptnavigation">
          <ul className="space-y-1">
            {punkte.map((punkt) => (
              <li key={punkt.pfad}>
                {punkt.kommtNoch === true ? (
                  <span
                    className="text-grau-500 block cursor-not-allowed rounded-[8px] px-3 py-3 text-sm"
                    title="Dieser Bereich entsteht noch"
                  >
                    {punkt.titel}
                    <span className="bg-creme-tief text-grau-700 ml-2 rounded px-1.5 py-0.5 text-[11px]">
                      bald
                    </span>
                  </span>
                ) : (
                  <NavLink
                    to={punkt.pfad}
                    end={punkt.pfad === '/'}
                    onClick={() => setMenueOffen(false)}
                    className={({ isActive }) =>
                      `block rounded-[8px] px-3 py-3 text-sm ${
                        isActive
                          ? 'bg-creme-tief text-tinte font-semibold'
                          : 'text-tinte-sanft hover:bg-creme'
                      }`
                    }
                  >
                    {punkt.titel}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-creme-tief hidden items-center justify-between border-b bg-white px-8 py-4 lg:flex">
          <div className="text-grau-700 text-sm">
            Angemeldet als{' '}
            <span className="text-tinte font-medium">
              {person?.firstName} {person?.lastName}
            </span>
            <RollenSchild rolle={person?.role} />
          </div>
          <button type="button" className="knopf knopf-still" onClick={abmeldenUndWeiter}>
            Abmelden
          </button>
        </div>

        <main className="min-w-0 flex-1 p-4 lg:p-8">
          <Outlet />
        </main>

        {/* Abmelden auf schmalen Geräten, wo die Kopfzeile oben fehlt */}
        <div className="border-creme-tief border-t bg-white p-4 lg:hidden">
          <button type="button" className="knopf knopf-still w-full" onClick={abmeldenUndWeiter}>
            Abmelden ({person?.firstName})
          </button>
        </div>
      </div>
    </div>
  );
}

function Marke() {
  return (
    <div>
      <div className="text-tinte text-base font-semibold tracking-[2px]">DERMAZENTRUM</div>
      <div className="text-gold-text text-xs font-light tracking-[4px]">Siebenhirten</div>
    </div>
  );
}

function RollenSchild({ rolle }: { rolle: string | undefined }) {
  if (rolle === undefined) return null;
  const beschriftung =
    rolle === 'ADMIN' ? 'Studioleitung' : rolle === 'STAFF' ? 'Kosmetiker:in' : rolle;
  return (
    <span className="bg-creme-tief text-tinte-sanft ml-2 rounded px-2 py-0.5 text-[11px]">
      {beschriftung}
    </span>
  );
}
