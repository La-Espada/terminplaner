import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiFehler, api, type Kosmetikerin } from '../api/client';
import { TeamFormular } from './TeamFormular';

/**
 * Zustand des Zugangs in einem Satz.
 *
 * Die Studioleitung muss auf einen Blick sehen, ob jemand schon arbeiten kann.
 * „Eingeladen" und „kann sich anmelden" sind zwei verschiedene Dinge, und die
 * Rückfrage „warum kommt Anna nicht rein?" beantwortet sich hier von selbst.
 */
function zugang(k: Kosmetikerin): { text: string; still: boolean } {
  if (!k.isActive) return { text: 'deaktiviert', still: true };
  if (k.zugangAktiv) return { text: 'kann sich anmelden', still: false };
  if (k.einladungOffen) return { text: 'eingeladen, wartet', still: true };
  return { text: 'Einladung abgelaufen', still: true };
}

export function Team() {
  const abfragen = useQueryClient();
  const [bearbeite, setBearbeite] = useState<Kosmetikerin | 'neu' | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  const liste = useQuery({
    queryKey: ['team'],
    queryFn: () => api.team.liste(),
  });

  function neuLaden() {
    void abfragen.invalidateQueries({ queryKey: ['team'] });
  }

  function melde(e: unknown, ersatz: string) {
    setHinweis(null);
    setFehler(e instanceof ApiFehler ? e.message : ersatz);
  }

  const umschalten = useMutation({
    mutationFn: ({ id, aktiv }: { id: string; aktiv: boolean }) => api.team.aktivSetzen(id, aktiv),
    onSuccess: () => {
      setFehler(null);
      neuLaden();
    },
    onError: (e) => melde(e, 'Änderung fehlgeschlagen.'),
  });

  const einladen = useMutation({
    mutationFn: (id: string) => api.team.einladungErneut(id),
    onSuccess: (antwort) => {
      setFehler(null);
      setHinweis(antwort.message);
      neuLaden();
    },
    onError: (e) => melde(e, 'Die Einladung konnte nicht verschickt werden.'),
  });

  const loeschen = useMutation({
    mutationFn: (id: string) => api.team.loeschen(id),
    onSuccess: () => {
      setFehler(null);
      neuLaden();
    },
    onError: (e) => melde(e, 'Löschen fehlgeschlagen.'),
  });

  if (bearbeite !== null) {
    return (
      <TeamFormular
        person={bearbeite === 'neu' ? null : bearbeite}
        onFertig={() => {
          setBearbeite(null);
          setFehler(null);
          setHinweis(
            bearbeite === 'neu' ? 'Angelegt. Die Einladung ist unterwegs.' : 'Gespeichert.',
          );
          neuLaden();
        }}
        onAbbrechen={() => setBearbeite(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-tinte text-3xl font-semibold">Kosmetiker:innen</h1>
          <p className="text-grau-700 mt-1">
            Wer hier aktiv ist, kann sich anmelden und ist für Termine buchbar.
          </p>
        </div>
        <button type="button" className="knopf knopf-gold" onClick={() => setBearbeite('neu')}>
          Kosmetiker:in anlegen
        </button>
      </div>

      {fehler !== null && (
        <div className="meldung meldung-fehler mb-4" role="alert">
          {fehler}
        </div>
      )}

      {hinweis !== null && (
        <div className="meldung mb-4" role="status">
          {hinweis}
        </div>
      )}

      {liste.isPending && <p className="text-grau-700">Wird geladen …</p>}

      {liste.isError && (
        <div className="meldung meldung-fehler" role="alert">
          Das Team konnte nicht geladen werden.
        </div>
      )}

      {liste.data?.length === 0 && (
        <div className="karte text-center">
          <h2 className="text-tinte text-lg font-semibold">Noch niemand im Team</h2>
          <p className="text-grau-700 mt-2 text-sm">
            Legen Sie an, wer behandelt. Jede Person bekommt eine Einladung per Mail und vergibt ihr
            Passwort selbst.
          </p>
        </div>
      )}

      {liste.data !== undefined && liste.data.length > 0 && (
        <div className="border-creme-tief overflow-x-auto rounded-[16px] border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-creme-tief text-grau-700 border-b text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Kontakt</th>
                <th className="px-4 py-3 font-medium">Leistungen</th>
                <th className="px-4 py-3 font-medium">Zugang</th>
                <th className="px-4 py-3 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {liste.data.map((k) => {
                const z = zugang(k);
                return (
                  <tr key={k.id} className="border-creme-tief border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {k.colorHex !== null && (
                          <span
                            aria-hidden="true"
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: k.colorHex }}
                          />
                        )}
                        <div>
                          <div className="text-tinte font-medium">{k.displayName}</div>
                          <div className="text-grau-700 text-[13px]">
                            {k.firstName} {k.lastName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-tinte-sanft px-4 py-3">
                      <div className="break-all">{k.email}</div>
                      {k.phone !== null && k.phone !== '' && (
                        <div className="text-grau-700 text-[13px]">{k.phone}</div>
                      )}
                    </td>
                    <td className="text-tinte-sanft px-4 py-3 whitespace-nowrap">
                      {k.leistungAnzahl === 0 ? (
                        <span className="text-grau-700">noch keine</span>
                      ) : (
                        `${k.leistungAnzahl}`
                      )}
                      {k.terminAnzahl > 0 && (
                        <div className="text-grau-700 text-[12px]">{k.terminAnzahl}× gebucht</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[12px] whitespace-nowrap ${
                          z.still ? 'bg-grau-100 text-grau-700' : 'bg-creme-tief text-tinte-sanft'
                        }`}
                      >
                        {z.text}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="knopf knopf-still min-h-10 px-3 text-sm"
                          onClick={() => setBearbeite(k)}
                        >
                          Bearbeiten
                        </button>

                        {/* Nur anbieten, solange sie gebraucht wird. Wer sein
                            Passwort hat, braucht keine Einladung mehr. */}
                        {k.isActive && !k.zugangAktiv && (
                          <button
                            type="button"
                            className="knopf knopf-still min-h-10 px-3 text-sm"
                            onClick={() => einladen.mutate(k.id)}
                            disabled={einladen.isPending}
                          >
                            Einladung erneut
                          </button>
                        )}

                        <button
                          type="button"
                          className="knopf knopf-still min-h-10 px-3 text-sm"
                          onClick={() => {
                            if (
                              k.isActive &&
                              !window.confirm(
                                `${k.displayName} deaktivieren? Die Anmeldung wird sofort gesperrt ` +
                                  'und laufende Sitzungen werden beendet.',
                              )
                            ) {
                              return;
                            }
                            umschalten.mutate({ id: k.id, aktiv: !k.isActive });
                          }}
                        >
                          {k.isActive ? 'Deaktivieren' : 'Aktivieren'}
                        </button>

                        {/* Löschen nur, solange noch kein Termin daranhängt —
                            sonst wäre nicht mehr nachvollziehbar, wer behandelt
                            hat. Das Backend lehnt es ohnehin ab. */}
                        {k.terminAnzahl === 0 && (
                          <button
                            type="button"
                            className="knopf knopf-still text-fehler min-h-10 px-3 text-sm"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Konto von ${k.displayName} endgültig löschen? ` +
                                    'Das lässt sich nicht rückgängig machen.',
                                )
                              ) {
                                loeschen.mutate(k.id);
                              }
                            }}
                          >
                            Löschen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-grau-700 mt-4 text-[13px]">
        <strong className="text-tinte-sanft">Passwörter</strong> vergeben die Kosmetiker:innen
        selbst über den Link in der Einladung. Sie als Studioleitung sehen sie nicht und können sie
        nicht setzen — das ist Absicht.
      </p>
    </div>
  );
}
