import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiFehler, api, type AbwesenheitsGrund } from '../api/client';
import { ArbeitszeitReiter, PersonenWahl, useTeam } from './Arbeitszeiten';

const GRUENDE: Array<{ wert: AbwesenheitsGrund; name: string; studioweit: boolean }> = [
  { wert: 'VACATION', name: 'Urlaub', studioweit: false },
  { wert: 'SICK', name: 'Krankenstand', studioweit: false },
  { wert: 'TRAINING', name: 'Fortbildung', studioweit: false },
  { wert: 'PUBLIC_HOLIDAY', name: 'Feiertag', studioweit: true },
  { wert: 'CLOSURE', name: 'Betriebsurlaub', studioweit: true },
  { wert: 'OTHER', name: 'Sonstiges', studioweit: false },
];

function grundName(wert: string): string {
  return GRUENDE.find((g) => g.wert === wert)?.name ?? wert;
}

/** Heute und in einem Jahr, als `YYYY-MM-DD`. Der sinnvolle Standardzeitraum. */
function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

function inMonaten(anzahl: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + anzahl);
  return d.toISOString().slice(0, 10);
}

export function Abwesenheiten() {
  const abfragen = useQueryClient();
  const team = useTeam();

  const [person, setPerson] = useState('');
  const [von, setVon] = useState(heute());
  const [bis, setBis] = useState(inMonaten(12));
  const [formularOffen, setFormularOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const liste = useQuery({
    queryKey: ['abwesenheiten', von, bis, person],
    queryFn: () => api.abwesenheiten.liste(von, bis, person === '' ? undefined : person),
  });

  const loeschen = useMutation({
    mutationFn: (id: string) => api.abwesenheiten.loeschen(id),
    onSuccess: () => {
      setFehler(null);
      void abfragen.invalidateQueries({ queryKey: ['abwesenheiten'] });
    },
    onError: (e) => setFehler(e instanceof ApiFehler ? e.message : 'Löschen fehlgeschlagen.'),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <ArbeitszeitReiter />
      <h1 className="text-tinte mb-1 text-3xl font-semibold">Abwesenheiten</h1>
      <p className="text-grau-700 mb-6">
        Einmaliges mit Datum: Urlaub, Krankenstand, Feiertage. Wiederkehrendes gehört in die
        Regelwoche.
      </p>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="feld-beschriftung" htmlFor="von">
            Zeitraum von
          </label>
          <input
            id="von"
            type="date"
            className="feld-eingabe"
            value={von}
            onChange={(e) => setVon(e.target.value)}
          />
        </div>
        <div>
          <label className="feld-beschriftung" htmlFor="bis">
            bis
          </label>
          <input
            id="bis"
            type="date"
            className="feld-eingabe"
            value={bis}
            onChange={(e) => setBis(e.target.value)}
          />
        </div>
        <PersonenWahl team={team} wert={person} setzen={setPerson} mitAlle />
      </div>

      {fehler !== null && (
        <div className="meldung meldung-fehler mb-4" role="alert">
          {fehler}
        </div>
      )}

      {formularOffen ? (
        <AbwesenheitsFormular
          team={team.data ?? []}
          onFertig={() => {
            setFormularOffen(false);
            setFehler(null);
            void abfragen.invalidateQueries({ queryKey: ['abwesenheiten'] });
          }}
          onAbbrechen={() => setFormularOffen(false)}
        />
      ) : (
        <button
          type="button"
          className="knopf knopf-gold mb-6"
          onClick={() => setFormularOffen(true)}
        >
          Abwesenheit eintragen
        </button>
      )}

      {liste.isPending && <p className="text-grau-700">Wird geladen …</p>}

      {liste.isError && (
        <div className="meldung meldung-fehler" role="alert">
          Die Abwesenheiten konnten nicht geladen werden.
        </div>
      )}

      {liste.data?.length === 0 && (
        <p className="text-grau-700">In diesem Zeitraum ist nichts eingetragen.</p>
      )}

      {liste.data !== undefined && liste.data.length > 0 && (
        <div className="border-creme-tief overflow-x-auto rounded-[16px] border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-creme-tief text-grau-700 border-b text-left">
                <th className="px-4 py-3 font-medium">Zeitraum</th>
                <th className="px-4 py-3 font-medium">Grund</th>
                <th className="px-4 py-3 font-medium">Betrifft</th>
                <th className="px-4 py-3 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {liste.data.map((a) => (
                <tr key={a.id} className="border-creme-tief border-b last:border-0">
                  <td className="text-tinte px-4 py-3 whitespace-nowrap">
                    {a.vonDatum === a.bisDatum ? (
                      <>
                        {a.vonDatum}
                        {!a.ganztags && (
                          <span className="text-grau-700">
                            {' '}
                            {a.vonZeit}–{a.bisZeit}
                          </span>
                        )}
                      </>
                    ) : (
                      `${a.vonDatum} – ${a.bisDatum}`
                    )}
                    {a.ganztags && <span className="text-grau-700 text-[12px]"> ganztägig</span>}
                  </td>
                  <td className="text-tinte-sanft px-4 py-3">{grundName(a.type)}</td>
                  <td className="px-4 py-3">
                    {a.staffId === null ? (
                      <span className="bg-creme-tief text-tinte-sanft rounded px-2 py-0.5 text-[12px]">
                        das ganze Studio
                      </span>
                    ) : (
                      <span className="text-tinte-sanft">{a.staffName}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="knopf knopf-still text-fehler min-h-10 px-3 text-sm"
                      onClick={() => {
                        if (window.confirm('Diesen Eintrag löschen?')) loeschen.mutate(a.id);
                      }}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-grau-700 mt-4 text-[13px]">
        Ein Eintrag <strong className="text-tinte-sanft">für das ganze Studio</strong> gilt für alle
        gleichzeitig — ein Feiertag muss nicht einzeln eingetragen werden. Die Abfrage für eine
        einzelne Person zeigt diese Einträge deshalb mit an.
      </p>
    </div>
  );
}

interface FormularProps {
  team: Array<{ id: string; displayName: string }>;
  onFertig: () => void;
  onAbbrechen: () => void;
}

function AbwesenheitsFormular({ team, onFertig, onAbbrechen }: FormularProps) {
  const [grund, setGrund] = useState<AbwesenheitsGrund>('VACATION');
  const [person, setPerson] = useState('');
  const [ganztags, setGanztags] = useState(true);
  const [vonDatum, setVonDatum] = useState(heute());
  const [bisDatum, setBisDatum] = useState(heute());
  const [vonZeit, setVonZeit] = useState('09:00');
  const [bisZeit, setBisZeit] = useState('13:00');
  const [fehler, setFehler] = useState<string | null>(null);

  // Feiertag und Betriebsurlaub betreffen immer alle. Die Auswahl der Person
  // auszublenden ist ehrlicher, als sie anzubieten und dann zu ignorieren.
  const immerStudioweit = GRUENDE.find((g) => g.wert === grund)?.studioweit === true;

  const speichern = useMutation({
    mutationFn: () =>
      api.abwesenheiten.anlegen({
        staffId: immerStudioweit || person === '' ? null : person,
        type: grund,
        ganztags,
        vonDatum,
        bisDatum,
        ...(ganztags ? {} : { vonZeit, bisZeit }),
      }),
    onSuccess: onFertig,
    onError: (e) => setFehler(e instanceof ApiFehler ? e.message : 'Speichern fehlgeschlagen.'),
  });

  function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    speichern.mutate();
  }

  return (
    <form className="karte mb-6" onSubmit={absenden} noValidate>
      <h2 className="text-tinte mb-4 text-lg font-semibold">Abwesenheit eintragen</h2>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="feld-beschriftung" htmlFor="grund">
            Grund
          </label>
          <select
            id="grund"
            className="feld-eingabe"
            value={grund}
            onChange={(e) => setGrund(e.target.value as AbwesenheitsGrund)}
          >
            {GRUENDE.map((g) => (
              <option key={g.wert} value={g.wert}>
                {g.name}
              </option>
            ))}
          </select>
          <p className="text-grau-700 mt-1 text-[12px]">
            Es gibt bewusst kein Feld für Erläuterungen — eine Diagnose hat in einem Dienstplan
            nichts verloren.
          </p>
        </div>

        <div>
          <label className="feld-beschriftung" htmlFor="betrifft">
            Betrifft
          </label>
          <select
            id="betrifft"
            className="feld-eingabe"
            value={immerStudioweit ? '' : person}
            disabled={immerStudioweit}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="">das ganze Studio</option>
            {team.map((k) => (
              <option key={k.id} value={k.id}>
                {k.displayName}
              </option>
            ))}
          </select>
          {immerStudioweit && (
            <p className="text-grau-700 mt-1 text-[12px]">
              {grundName(grund)} gilt immer für alle.
            </p>
          )}
        </div>
      </div>

      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-tinte h-5 w-5"
            checked={ganztags}
            onChange={(e) => setGanztags(e.target.checked)}
          />
          Ganztägig
        </label>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="feld-beschriftung" htmlFor="avon">
            Von
          </label>
          <div className="flex gap-2">
            <input
              id="avon"
              type="date"
              className="feld-eingabe"
              value={vonDatum}
              onChange={(e) => {
                setVonDatum(e.target.value);
                // Das Ende mitziehen, solange es davor läge. Spart den
                // häufigsten Fehler beim Eintragen eines einzelnen Tages.
                if (e.target.value > bisDatum) setBisDatum(e.target.value);
              }}
              required
            />
            {!ganztags && (
              <input
                type="time"
                className="feld-eingabe w-32"
                value={vonZeit}
                aria-label="Beginn"
                onChange={(e) => setVonZeit(e.target.value)}
              />
            )}
          </div>
        </div>

        <div>
          <label className="feld-beschriftung" htmlFor="abis">
            Bis einschließlich
          </label>
          <div className="flex gap-2">
            <input
              id="abis"
              type="date"
              className="feld-eingabe"
              value={bisDatum}
              min={vonDatum}
              onChange={(e) => setBisDatum(e.target.value)}
              required
            />
            {!ganztags && (
              <input
                type="time"
                className="feld-eingabe w-32"
                value={bisZeit}
                aria-label="Ende"
                onChange={(e) => setBisZeit(e.target.value)}
              />
            )}
          </div>
        </div>
      </div>

      {fehler !== null && (
        <div className="meldung meldung-fehler mb-4" role="alert">
          {fehler}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="knopf" type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Eintragen'}
        </button>
        <button type="button" className="knopf knopf-still" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
