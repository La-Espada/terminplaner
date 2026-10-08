import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiFehler, api, type Arbeitsspanne } from '../api/client';
import { ArbeitszeitReiter, PersonenWahl, useTeam } from './Arbeitszeiten';

/**
 * Anzeigereihenfolge der Woche.
 *
 * `weekday` zählt wie in der Datenbank ab Sonntag (0), angezeigt wird aber ab
 * Montag — alles andere wäre für ein Studio in Wien verkehrt.
 */
const WOCHE = [
  { weekday: 1, name: 'Montag' },
  { weekday: 2, name: 'Dienstag' },
  { weekday: 3, name: 'Mittwoch' },
  { weekday: 4, name: 'Donnerstag' },
  { weekday: 5, name: 'Freitag' },
  { weekday: 6, name: 'Samstag' },
  { weekday: 0, name: 'Sonntag' },
];

const VORLAGE: Arbeitsspanne = { weekday: 0, von: '09:00', bis: '17:00' };

export function Wochenplan() {
  const abfragen = useQueryClient();
  const team = useTeam();
  const [person, setPerson] = useState('');
  const [entwurf, setEntwurf] = useState<Arbeitsspanne[]>([]);
  /**
   * Der zuletzt vom Server bestaetigte Stand.
   *
   * Eigener Zustand und nicht einfach `plan.data`: Nach dem Speichern ist die
   * Abfrage noch im Nachladen, und solange waere der frisch gespeicherte
   * Entwurf faelschlich "geaendert" — die Bestaetigung erschiene nie.
   */
  const [basis, setBasis] = useState<Arbeitsspanne[]>([]);
  /** Fuer wen wurde `basis` geladen? Verhindert, dass ein Nachladen Eingaben ueberschreibt. */
  const [geladenFuer, setGeladenFuer] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  // Erste Person vorauswählen, sobald das Team geladen ist.
  useEffect(() => {
    if (person === '' && team.data !== undefined && team.data.length > 0) {
      setPerson(team.data[0].id);
    }
  }, [team.data, person]);

  const plan = useQuery({
    queryKey: ['wochenplan', person],
    queryFn: () => api.arbeitszeiten.wochenplan(person),
    enabled: person !== '',
  });

  // Der Entwurf ist eine eigene Kopie: Man bearbeitet eine Woche als Ganzes und
  // drückt dann einmal auf Speichern. Würde jede Änderung sofort gesendet,
  // wären die Zwischenstände gültig zu halten — und „Mittwoch gelöscht, neue
  // Hälften noch nicht angelegt" ist kein Zustand, den jemand gewollt hat.
  //
  // Übernommen wird nur beim Wechsel der Person. Ein Nachladen im Hintergrund
  // darf eine halb eingetragene Woche nicht unter den Händen ersetzen.
  useEffect(() => {
    if (plan.data !== undefined && geladenFuer !== person) {
      setEntwurf(plan.data);
      setBasis(plan.data);
      setGeladenFuer(person);
      setGespeichert(false);
    }
  }, [plan.data, person, geladenFuer]);

  const speichern = useMutation({
    mutationFn: () => api.arbeitszeiten.setzen(person, entwurf),
    onSuccess: (neu) => {
      setFehler(null);
      // Der Server liefert den gespeicherten Stand zurueck — sortiert und
      // normalisiert. Den uebernehmen, statt den Entwurf stehen zu lassen.
      setEntwurf(neu);
      setBasis(neu);
      setGespeichert(true);
      void abfragen.invalidateQueries({ queryKey: ['wochenplan', person] });
    },
    onError: (e) => {
      setGespeichert(false);
      setFehler(e instanceof ApiFehler ? e.message : 'Speichern fehlgeschlagen.');
    },
  });

  function aendern(naechster: Arbeitsspanne[]) {
    setEntwurf(naechster);
    setGespeichert(false);
    setFehler(null);
  }

  function hinzufuegen(weekday: number) {
    const vorhandene = entwurf.filter((s) => s.weekday === weekday);
    // An den zuletzt eingetragenen Abschnitt anschließen: Wer eine Mittagspause
    // einträgt, will danach meistens direkt weitermachen.
    const letzte = vorhandene[vorhandene.length - 1];
    aendern([
      ...entwurf,
      letzte === undefined
        ? { ...VORLAGE, weekday }
        : { weekday, von: letzte.bis, bis: spaeter(letzte.bis) },
    ]);
  }

  function uebernehmenVon(quelleId: string) {
    if (quelleId === '') return;
    void api.arbeitszeiten
      .wochenplan(quelleId)
      .then((fremd) => aendern(fremd.map((s) => ({ ...s }))))
      .catch(() => setFehler('Der Plan konnte nicht übernommen werden.'));
  }

  const geaendert = JSON.stringify(entwurf) !== JSON.stringify(basis);
  const andere = (team.data ?? []).filter((k) => k.id !== person);

  return (
    <div className="mx-auto max-w-4xl">
      <ArbeitszeitReiter />
      <h1 className="text-tinte mb-1 text-3xl font-semibold">Arbeitszeiten</h1>
      <p className="text-grau-700 mb-6">
        Die Regelwoche. Eine Mittagspause wird als zwei Zeiten eingetragen, etwa 9–12 und 13–17.
      </p>

      <PersonenWahl team={team} wert={person} setzen={setPerson} />

      {person !== '' && (
        <>
          {andere.length > 0 && (
            <div className="mb-4">
              <label className="feld-beschriftung" htmlFor="uebernehmen">
                Zeiten übernehmen von
              </label>
              <select
                id="uebernehmen"
                className="feld-eingabe max-w-sm"
                value=""
                onChange={(e) => uebernehmenVon(e.target.value)}
              >
                <option value="">auswählen …</option>
                {andere.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.displayName}
                  </option>
                ))}
              </select>
              <p className="text-grau-700 mt-1 text-[12px]">
                Übernimmt den Plan in den Entwurf. Gespeichert wird erst unten — bis dahin lässt
                sich alles noch ändern.
              </p>
            </div>
          )}

          <div className="border-creme-tief divide-creme-tief divide-y rounded-[16px] border bg-white">
            {WOCHE.map(({ weekday, name }) => {
              const tagesspannen = entwurf
                .map((s, i) => ({ s, i }))
                .filter(({ s }) => s.weekday === weekday);

              return (
                <div key={weekday} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="text-tinte w-28 shrink-0 pt-2 font-medium">{name}</div>

                  <div className="min-w-0 flex-1">
                    {tagesspannen.length === 0 ? (
                      <p className="text-grau-500 py-2 text-sm">arbeitet nicht</p>
                    ) : (
                      tagesspannen.map(({ s, i }) => (
                        <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
                          <input
                            type="time"
                            className="feld-eingabe w-32"
                            value={s.von}
                            aria-label={`${name}, Beginn`}
                            onChange={(e) =>
                              aendern(
                                entwurf.map((alt, j) =>
                                  j === i ? { ...alt, von: e.target.value } : alt,
                                ),
                              )
                            }
                          />
                          <span className="text-grau-700" aria-hidden="true">
                            bis
                          </span>
                          <input
                            type="time"
                            className="feld-eingabe w-32"
                            value={s.bis}
                            aria-label={`${name}, Ende`}
                            onChange={(e) =>
                              aendern(
                                entwurf.map((alt, j) =>
                                  j === i ? { ...alt, bis: e.target.value } : alt,
                                ),
                              )
                            }
                          />
                          <button
                            type="button"
                            className="knopf knopf-still text-fehler min-h-10 px-3 text-sm"
                            onClick={() => aendern(entwurf.filter((_, j) => j !== i))}
                          >
                            Entfernen
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    type="button"
                    className="knopf knopf-still min-h-10 shrink-0 px-3 text-sm"
                    onClick={() => hinzufuegen(weekday)}
                  >
                    Zeit hinzufügen
                  </button>
                </div>
              );
            })}
          </div>

          {fehler !== null && (
            <div className="meldung meldung-fehler mt-4" role="alert">
              {fehler}
            </div>
          )}

          {gespeichert && (
            <div className="meldung mt-4" role="status">
              Gespeichert.
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="knopf"
              disabled={!geaendert || speichern.isPending}
              onClick={() => speichern.mutate()}
            >
              {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
            </button>
            {geaendert && (
              <button type="button" className="knopf knopf-still" onClick={() => aendern(basis)}>
                Verwerfen
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Eine Stunde später, auf 23:59 begrenzt. Nur ein Startwert fürs Formular. */
function spaeter(zeit: string): string {
  const [h, m] = zeit.split(':').map(Number);
  const stunde = Math.min(h + 1, 23);
  return `${String(stunde).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
