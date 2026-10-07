import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiFehler, api } from '../api/client';
import { alsEuro } from './Leistungen';
import { LeistungsReiter } from './LeistungsReiter';

/**
 * Wer bietet was an.
 *
 * Als Matrix, nicht als zwei getrennte Listen. Ein Studio hat eine Handvoll
 * Leistungen und eine Handvoll Kosmetiker:innen; in dieser Größenordnung ist
 * das Raster die einzige Darstellung, in der man **Lücken** sieht — eine
 * Leistung, die niemand anbietet, oder eine Person, die nichts anbietet. Genau
 * danach sucht man hier, und in zwei Detailansichten würde man es nie finden.
 */
export function Zuordnung() {
  const abfragen = useQueryClient();
  const [fehler, setFehler] = useState<string | null>(null);
  /** Welches Kästchen wartet gerade auf den Server? Schlüssel: staffId|serviceId */
  const [laufend, setLaufend] = useState<string | null>(null);

  const matrix = useQuery({
    queryKey: ['zuordnung'],
    queryFn: () => api.zuordnung.matrix(),
  });

  const umschalten = useMutation({
    mutationFn: async (p: {
      staffId: string;
      serviceId: string;
      an: boolean;
      erzwingen: boolean;
    }) =>
      p.an
        ? api.zuordnung.zuordnen(p.staffId, p.serviceId)
        : api.zuordnung.entziehen(p.staffId, p.serviceId, p.erzwingen),

    onMutate: (p) => setLaufend(`${p.staffId}|${p.serviceId}`),

    onSuccess: () => {
      setFehler(null);
      void abfragen.invalidateQueries({ queryKey: ['zuordnung'] });
      // Die Leistungsliste zeigt an, ob eine Leistung buchbar ist. Das hängt
      // genau hiervon ab und wäre sonst veraltet.
      void abfragen.invalidateQueries({ queryKey: ['leistungen'] });
    },

    onError: (e, p) => {
      // 409 heißt nicht "ging nicht", sondern "da hängen noch Termine dran".
      // Das Backend nennt die Zahl; die Entscheidung trifft die Studioleitung.
      if (e instanceof ApiFehler && e.status === 409 && !p.erzwingen) {
        if (window.confirm(`${e.message}\n\nZuordnung trotzdem entziehen?`)) {
          umschalten.mutate({ ...p, erzwingen: true });
          return;
        }
        setFehler(null);
        return;
      }
      setFehler(e instanceof ApiFehler ? e.message : 'Änderung fehlgeschlagen.');
    },

    onSettled: () => setLaufend(null),
  });

  const rahmen = (inhalt: React.ReactNode) => (
    <div className="mx-auto max-w-5xl">
      <LeistungsReiter />
      <h1 className="text-tinte mb-1 text-3xl font-semibold">Wer bietet was an</h1>
      <p className="text-grau-700 mb-6">
        Ein Haken bedeutet: Diese Leistung ist bei dieser Person buchbar.
      </p>
      {inhalt}
    </div>
  );

  if (matrix.isPending) return rahmen(<p className="text-grau-700">Wird geladen …</p>);

  if (matrix.isError || matrix.data === undefined) {
    return rahmen(
      <div className="meldung meldung-fehler" role="alert">
        Die Zuordnung konnte nicht geladen werden.
      </div>,
    );
  }

  const { staff, zeilen } = matrix.data;

  if (staff.length === 0 || zeilen.length === 0) {
    return rahmen(
      <div className="karte text-center">
        <h2 className="text-tinte text-lg font-semibold">Dafür fehlt noch etwas</h2>
        <p className="text-grau-700 mt-2 text-sm">
          {zeilen.length === 0 && staff.length === 0
            ? 'Legen Sie zuerst Leistungen und Kosmetiker:innen an.'
            : zeilen.length === 0
              ? 'Legen Sie zuerst Leistungen an.'
              : 'Legen Sie zuerst Kosmetiker:innen an.'}
        </p>
      </div>,
    );
  }

  return rahmen(
    <>
      {fehler !== null && (
        <div className="meldung meldung-fehler mb-4" role="alert">
          {fehler}
        </div>
      )}

      <div className="border-creme-tief overflow-x-auto rounded-[16px] border bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Welche Kosmetiker:in bietet welche Leistung an. Jedes Kästchen schaltet eine Zuordnung.
          </caption>
          <thead>
            <tr className="border-creme-tief border-b">
              <th scope="col" className="text-grau-700 px-4 py-3 text-left font-medium">
                Leistung
              </th>
              {staff.map((s) => (
                <th
                  key={s.id}
                  scope="col"
                  className="text-grau-700 px-3 py-3 text-center font-medium whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {s.colorHex !== null && (
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: s.colorHex }}
                      />
                    )}
                    <span className={s.isActive ? 'text-tinte' : 'text-grau-500'}>
                      {s.displayName}
                    </span>
                  </span>
                  {!s.isActive ? (
                    <span className="text-grau-500 block text-[11px] font-normal">deaktiviert</span>
                  ) : (
                    !s.zugangAktiv && (
                      <span className="text-grau-500 block text-[11px] font-normal">
                        noch nicht angemeldet
                      </span>
                    )
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => {
              // Buchbar macht eine Leistung nur, wer aktiv ist **und** seinen
              // Zugang eingerichtet hat. Ohne die zweite Bedingung zeigte die
              // Matrix einen Haken, waehrend die App die Leistung verschweigt —
              // genau die Falle, die E-31 ausschliessen wollte.
              const anbieter = z.staffIds.filter((id) => {
                const person = staff.find((s) => s.id === id);
                return person?.isActive === true && person.zugangAktiv;
              });
              const verwaist = z.isActive && anbieter.length === 0;

              return (
                <tr key={z.serviceId} className="border-creme-tief border-b last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <div className={z.isActive ? 'text-tinte font-medium' : 'text-grau-500'}>
                      {z.name}
                    </div>
                    <div className="text-grau-700 text-[12px]">
                      {z.durationMinutes} min · {alsEuro(z.priceCents)}
                      {!z.isActive && ' · deaktiviert'}
                    </div>
                    {verwaist && (
                      <div className="text-fehler mt-0.5 text-[12px]">
                        Niemand bietet sie an — in der App nicht sichtbar
                      </div>
                    )}
                  </th>

                  {staff.map((s) => {
                    const an = z.staffIds.includes(s.id);
                    const schluessel = `${s.id}|${z.serviceId}`;
                    return (
                      <td key={s.id} className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          /* accent-tinte statt accent-gold: Der Browser zeichnet den
                             Haken immer weiss. Auf Gold (#c2a05a) kaeme er auf
                             etwa 2,3:1 und waere damit unter der Grenze von
                             3:1 fuer grafische Elemente. Auf Tinte sind es 18:1. */
                          className="accent-tinte h-5 w-5 cursor-pointer align-middle"
                          checked={an}
                          disabled={laufend !== null}
                          aria-label={`${z.name} bei ${s.displayName}`}
                          aria-busy={laufend === schluessel}
                          onChange={() =>
                            umschalten.mutate({
                              staffId: s.id,
                              serviceId: z.serviceId,
                              an: !an,
                              erzwingen: false,
                            })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-grau-700 mt-4 text-[13px]">
        Dauer und Preis gelten studioweit und stehen bei der Leistung — nicht hier. Diese Tabelle
        beantwortet nur die Frage <strong className="text-tinte-sanft">wer was anbietet</strong>.
        Eine Leistung, die niemand anbietet, erscheint in der App nicht; sie wäre dort eine
        Sackgasse.
      </p>
    </>,
  );
}
