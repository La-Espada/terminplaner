import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { SitzungsAnbieter } from './auth/SitzungsKontext';
import { Rahmen } from './layout/Rahmen';
import { MENUE } from './layout/Navigation';
import { NichtGefunden } from './routen/NichtGefunden';
import { Platzhalter } from './routen/Platzhalter';
import { NurAbgemeldet, NurAngemeldet, NurRollen } from './routen/Schutz';
import { Anmeldung } from './seiten/Anmeldung';
import { Einladung } from './seiten/Einladung';
import { Leistungen } from './seiten/Leistungen';
import { Team } from './seiten/Team';
import { Zuordnung } from './seiten/Zuordnung';
import { Uebersicht } from './seiten/Uebersicht';

const abfragen = new QueryClient({
  defaultOptions: {
    queries: {
      // Ein Kalender, der sich beim Fensterwechsel neu lädt, springt unter den
      // Händen. Lieber gezielt aktualisieren, wenn sich etwas geändert hat.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={abfragen}>
      <BrowserRouter>
        <SitzungsAnbieter>
          <Routes>
            <Route element={<NurAbgemeldet />}>
              <Route path="/anmelden" element={<Anmeldung />} />
            </Route>

            {/* Weder angemeldet noch abgemeldet: Hier zaehlt der Token aus der
                E-Mail. Haengt dieser Pfad unter NurAbgemeldet, faengt eine
                fremde Sitzung im selben Browser die Einladung ab. */}
            <Route path="/einladung" element={<Einladung />} />

            <Route element={<NurAngemeldet />}>
              <Route element={<Rahmen />}>
                <Route index element={<Uebersicht />} />

                <Route element={<NurRollen rollen={['ADMIN']} />}>
                  <Route path="/leistungen" element={<Leistungen />} />
                  <Route path="/leistungen/zuordnung" element={<Zuordnung />} />
                  <Route path="/team" element={<Team />} />
                </Route>

                {/* Platzhalter für alles, was noch entsteht. Die Rollen hier
                    spiegeln nur die Navigation — durchgesetzt wird im Backend. */}
                {MENUE.filter((p) => p.kommtNoch === true).map((p) =>
                  p.rollen === undefined ? (
                    <Route key={p.pfad} path={p.pfad} element={<Platzhalter />} />
                  ) : (
                    <Route key={p.pfad} element={<NurRollen rollen={p.rollen} />}>
                      <Route path={p.pfad} element={<Platzhalter />} />
                    </Route>
                  ),
                )}

                <Route path="*" element={<NichtGefunden />} />
              </Route>
            </Route>
          </Routes>
        </SitzungsAnbieter>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
