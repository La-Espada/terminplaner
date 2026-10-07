import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiFehler, api, type Leistung } from '../api/client';
import { LeistungsFormular } from './LeistungsFormular';

/** Cent in eine lesbare Preisangabe. Nie mit Kommazahlen rechnen (E-08). */
export function alsEuro(cent: number): string {
  return (cent / 100).toLocaleString('de-AT', {
    style: 'currency',
    currency: 'EUR',
  });
}

export function Leistungen() {
  const abfragen = useQueryClient();
  const [bearbeite, setBearbeite] = useState<Leistung | 'neu' | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const liste = useQuery({
    queryKey: ['leistungen'],
    queryFn: () => api.leistungen.liste(),
  });

  const umschalten = useMutation({
    mutationFn: ({ id, aktiv }: { id: string; aktiv: boolean }) =>
      api.leistungen.aendern(id, { isActive: aktiv }),
    onSuccess: () => abfragen.invalidateQueries({ queryKey: ['leistungen'] }),
    onError: (e) => setFehler(e instanceof ApiFehler ? e.message : 'Änderung fehlgeschlagen.'),
  });

  const loeschen = useMutation({
    mutationFn: (id: string) => api.leistungen.loeschen(id),
    onSuccess: () => {
      setFehler(null);
      void abfragen.invalidateQueries({ queryKey: ['leistungen'] });
    },
    onError: (e) => setFehler(e instanceof ApiFehler ? e.message : 'Löschen fehlgeschlagen.'),
  });

  if (bearbeite !== null) {
    return (
      <LeistungsFormular
        leistung={bearbeite === 'neu' ? null : bearbeite}
        onFertig={() => {
          setBearbeite(null);
          void abfragen.invalidateQueries({ queryKey: ['leistungen'] });
        }}
        onAbbrechen={() => setBearbeite(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-tinte text-3xl font-semibold">Leistungen</h1>
          <p className="text-grau-700 mt-1">
            Dauer, Puffer und Preis gelten studioweit — für alle Kosmetiker:innen gleich.
          </p>
        </div>
        <button type="button" className="knopf knopf-gold" onClick={() => setBearbeite('neu')}>
          Leistung anlegen
        </button>
      </div>

      {fehler !== null && (
        <div className="meldung meldung-fehler mb-4" role="alert">
          {fehler}
        </div>
      )}

      {liste.isPending && <p className="text-grau-700">Wird geladen …</p>}

      {liste.isError && (
        <div className="meldung meldung-fehler" role="alert">
          Die Leistungen konnten nicht geladen werden.
        </div>
      )}

      {liste.data?.length === 0 && (
        <div className="karte text-center">
          <h2 className="text-tinte text-lg font-semibold">Noch keine Leistungen</h2>
          <p className="text-grau-700 mt-2 text-sm">
            Legen Sie an, was Sie anbieten. Erst danach lassen sich Termine buchen.
          </p>
        </div>
      )}

      {liste.data !== undefined && liste.data.length > 0 && (
        <div className="border-creme-tief overflow-x-auto rounded-[16px] border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-creme-tief text-grau-700 border-b text-left">
                <th className="px-4 py-3 font-medium">Leistung</th>
                <th className="px-4 py-3 font-medium">Dauer</th>
                <th className="px-4 py-3 font-medium">Puffer</th>
                <th className="px-4 py-3 font-medium">Preis</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {liste.data.map((l) => (
                <tr key={l.id} className="border-creme-tief border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-tinte font-medium">{l.name}</div>
                    {l.description !== null && l.description !== '' && (
                      <div className="text-grau-700 mt-0.5 text-[13px]">{l.description}</div>
                    )}
                    {l.terminAnzahl > 0 && (
                      <div className="text-grau-700 mt-0.5 text-[12px]">
                        {l.terminAnzahl}× gebucht
                      </div>
                    )}
                  </td>
                  <td className="text-tinte-sanft px-4 py-3 whitespace-nowrap">
                    {l.durationMinutes} min
                  </td>
                  <td className="text-grau-700 px-4 py-3 whitespace-nowrap">
                    {l.bufferMinutes > 0 ? `${l.bufferMinutes} min` : '–'}
                  </td>
                  <td className="text-tinte-sanft px-4 py-3 whitespace-nowrap">
                    {alsEuro(l.priceCents)}
                  </td>
                  <td className="px-4 py-3">
                    {l.isActive ? (
                      <span className="bg-creme-tief text-tinte-sanft rounded px-2 py-0.5 text-[12px]">
                        buchbar
                      </span>
                    ) : (
                      <span className="bg-grau-100 text-grau-700 rounded px-2 py-0.5 text-[12px]">
                        deaktiviert
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="knopf knopf-still min-h-10 px-3 text-sm"
                        onClick={() => setBearbeite(l)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className="knopf knopf-still min-h-10 px-3 text-sm"
                        onClick={() => umschalten.mutate({ id: l.id, aktiv: !l.isActive })}
                      >
                        {l.isActive ? 'Deaktivieren' : 'Aktivieren'}
                      </button>
                      {/* Löschen nur anbieten, solange es gefahrlos ist. Bei
                          gebuchten Leistungen wäre der Knopf eine Falle — das
                          Backend lehnt ab, und zwar aus gutem Grund. */}
                      {l.terminAnzahl === 0 && (
                        <button
                          type="button"
                          className="knopf knopf-still text-fehler min-h-10 px-3 text-sm"
                          onClick={() => {
                            if (window.confirm(`„${l.name}" wirklich löschen?`)) {
                              loeschen.mutate(l.id);
                            }
                          }}
                        >
                          Löschen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-grau-700 mt-4 text-[13px]">
        <strong className="text-tinte-sanft">Puffer</strong> ist die Aufräumzeit nach der
        Behandlung. Sie blockiert den Kalender, wird aber nicht mitgebucht und erscheint nicht in
        der App.
      </p>
    </div>
  );
}
