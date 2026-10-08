import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiFehler, api, type AbsageGrund, type KalenderTermin } from '../api/client';
import { useSitzung } from '../auth/SitzungsKontext';
import { STATUS_TEXT } from '../kalender/Raster';
import { langesDatum, ortszeit, zuZeitpunkt } from '../kalender/zeit';
import { alsEuro } from './Leistungen';

const GRUENDE: Array<{ wert: AbsageGrund; name: string }> = [
  { wert: 'STAFF_UNAVAILABLE', name: 'Behandlerin fällt aus' },
  { wert: 'CUSTOMER_REQUEST', name: 'Kundin hat abgesagt' },
  { wert: 'OPERATIONAL', name: 'Betrieblicher Grund' },
  { wert: 'SONSTIGES', name: 'Sonstiges' },
];

interface Props {
  termin: KalenderTermin;
  onSchliessen: () => void;
  onGeaendert: () => void;
}

/**
 * Was mit einem Termin geschehen kann.
 *
 * Als Tafel neben dem Kalender und nicht als Dialog: Wer am Telefon ist,
 * braucht den Kalender daneben weiter sichtbar — sonst muss man schließen,
 * nachsehen und wieder öffnen.
 */
export function TerminTafel({ termin, onSchliessen, onGeaendert }: Props) {
  const { person } = useSitzung();
  const istStudio = person?.role === 'ADMIN' || person?.role === 'STAFF';

  const [fehler, setFehler] = useState<string | null>(null);
  const [absageOffen, setAbsageOffen] = useState(false);
  const [grund, setGrund] = useState<AbsageGrund>('STAFF_UNAVAILABLE');
  const [neuesDatum, setNeuesDatum] = useState('');
  const [neueZeit, setNeueZeit] = useState('');

  const von = ortszeit(termin.startsAt);
  const bis = ortszeit(termin.endsAt);
  const vorbei = new Date(termin.endsAt).getTime() < Date.now();
  const abgesagt = termin.status.startsWith('CANCELLED');

  function melde(e: unknown, ersatz: string) {
    setFehler(e instanceof ApiFehler ? e.message : ersatz);
  }

  const absagen = useMutation({
    mutationFn: () => api.termine.stornieren(termin.id, grund),
    onSuccess: onGeaendert,
    onError: (e) => melde(e, 'Die Absage ist fehlgeschlagen.'),
  });

  const nichtErschienen = useMutation({
    mutationFn: () => api.termine.nichtErschienen(termin.id),
    onSuccess: onGeaendert,
    onError: (e) => melde(e, 'Der Vermerk ist fehlgeschlagen.'),
  });

  const verschieben = useMutation({
    mutationFn: () =>
      api.termine.verschieben(
        termin.id,
        zuZeitpunkt(neuesDatum, zeitInMinuten(neueZeit)).toISOString(),
      ),
    onSuccess: onGeaendert,
    onError: (e) => melde(e, 'Das Verschieben ist fehlgeschlagen.'),
  });

  const vermerkZurueck = useMutation({
    mutationFn: () => api.termine.vermerkZuruecknehmen(termin.id),
    onSuccess: onGeaendert,
    onError: (e) => melde(e, 'Das Zurücknehmen ist fehlgeschlagen.'),
  });

  return (
    <div
      className="border-creme-tief fixed inset-x-0 bottom-0 z-20 border-t bg-white p-4 shadow-lg lg:inset-y-0 lg:right-0 lg:left-auto lg:w-96 lg:overflow-y-auto lg:border-t-0 lg:border-l"
      role="dialog"
      aria-label="Termin"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-tinte text-xl font-semibold">
            {termin.customer.vorname} {termin.customer.nachname}
          </h2>
          <p className="text-grau-700 text-sm">{termin.service.name}</p>
        </div>
        <button
          type="button"
          className="knopf knopf-still min-h-10 px-3"
          onClick={onSchliessen}
          aria-label="Schließen"
        >
          ✕
        </button>
      </div>

      <dl className="mb-4 space-y-2 text-sm">
        <Zeile begriff="Wann">
          {langesDatum(von.datum)}, {von.zeit}–{bis.zeit}
        </Zeile>
        <Zeile begriff="Bei">{termin.staff.displayName}</Zeile>
        <Zeile begriff="Dauer">
          {termin.service.durationMinutes} min
          {termin.service.bufferMinutes > 0 && (
            <span className="text-grau-700"> + {termin.service.bufferMinutes} min Aufräumzeit</span>
          )}
        </Zeile>
        <Zeile begriff="Preis">{alsEuro(termin.priceCents)}</Zeile>
        <Zeile begriff="Status">{STATUS_TEXT[termin.status]}</Zeile>
        {termin.customer.telefon !== null && termin.customer.telefon !== '' && (
          <Zeile begriff="Telefon">
            <a className="text-gold-text underline" href={`tel:${termin.customer.telefon}`}>
              {termin.customer.telefon}
            </a>
          </Zeile>
        )}
      </dl>

      {fehler !== null && (
        <div className="meldung meldung-fehler mb-4" role="alert">
          {fehler}
        </div>
      )}

      {istStudio && !abgesagt && (
        <div className="space-y-2">
          {absageOffen ? (
            <div className="karte">
              <label className="feld-beschriftung" htmlFor="absagegrund">
                Grund der Absage
              </label>
              <select
                id="absagegrund"
                className="feld-eingabe mb-2"
                value={grund}
                onChange={(e) => setGrund(e.target.value as AbsageGrund)}
              >
                {GRUENDE.map((g) => (
                  <option key={g.wert} value={g.wert}>
                    {g.name}
                  </option>
                ))}
              </select>
              <p className="text-grau-700 mb-3 text-[12px]">
                Es gibt bewusst kein Textfeld — eine Diagnose hat neben einem Termin nichts
                verloren.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="knopf"
                  disabled={absagen.isPending}
                  onClick={() => absagen.mutate()}
                >
                  {absagen.isPending ? 'Wird abgesagt …' : 'Absagen'}
                </button>
                <button
                  type="button"
                  className="knopf knopf-still"
                  onClick={() => setAbsageOffen(false)}
                >
                  Zurück
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="knopf knopf-still text-fehler w-full"
              onClick={() => setAbsageOffen(true)}
            >
              Termin absagen
            </button>
          )}

          {/* Erst nach dem Termin. Vorher wäre es eine Behauptung über die
              Zukunft, und das Backend lehnt es ohnehin ab. */}
          {vorbei && termin.status !== 'NO_SHOW' && (
            <button
              type="button"
              className="knopf knopf-still w-full"
              disabled={nichtErschienen.isPending}
              onClick={() => {
                if (window.confirm('Als nicht erschienen vermerken?')) nichtErschienen.mutate();
              }}
            >
              Nicht erschienen
            </button>
          )}

          {termin.status === 'NO_SHOW' && (
            <button
              type="button"
              className="knopf knopf-still w-full"
              disabled={vermerkZurueck.isPending}
              onClick={() => vermerkZurueck.mutate()}
            >
              Vermerk zurücknehmen
            </button>
          )}
        </div>
      )}

      {!abgesagt && !vorbei && (
        <div className="border-creme-tief mt-4 border-t pt-4">
          <h3 className="text-tinte mb-2 text-sm font-semibold">Verschieben</h3>
          <p className="text-grau-700 mb-3 text-[13px]">
            Im Kalender geht es auch mit der Maus. Hier, wenn das nicht geht oder die neue Zeit
            weiter weg liegt.
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            <input
              type="date"
              className="feld-eingabe min-w-36 flex-1"
              value={neuesDatum === '' ? von.datum : neuesDatum}
              aria-label="Neues Datum"
              onChange={(e) => setNeuesDatum(e.target.value)}
            />
            <input
              type="time"
              step={900}
              className="feld-eingabe w-32"
              value={neueZeit === '' ? von.zeit : neueZeit}
              aria-label="Neue Uhrzeit"
              onChange={(e) => setNeueZeit(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="knopf w-full"
            disabled={
              verschieben.isPending ||
              ((neuesDatum === '' || neuesDatum === von.datum) &&
                (neueZeit === '' || neueZeit === von.zeit))
            }
            onClick={() => {
              if (neuesDatum === '') setNeuesDatum(von.datum);
              if (neueZeit === '') setNeueZeit(von.zeit);
              verschieben.mutate();
            }}
          >
            {verschieben.isPending ? 'Wird verschoben …' : 'Auf diese Zeit verschieben'}
          </button>
        </div>
      )}

      {abgesagt && (
        <p className="text-grau-700 mt-4 text-[13px]">
          Dieser Termin ist abgesagt. Die Zeit ist wieder buchbar; der Eintrag bleibt stehen, damit
          nachvollziehbar ist, was geplant war.
        </p>
      )}
    </div>
  );
}

/** `HH:mm` zu Minuten seit Mitternacht. */
function zeitInMinuten(zeit: string): number {
  const [h, m] = zeit.split(':').map(Number);
  return h * 60 + m;
}

function Zeile({ begriff, children }: { begriff: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-grau-700 w-20 shrink-0">{begriff}</dt>
      <dd className="text-tinte-sanft min-w-0">{children}</dd>
    </div>
  );
}
