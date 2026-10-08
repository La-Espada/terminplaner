import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiFehler, api, type KalenderTermin } from '../api/client';
import { useSitzung } from '../auth/SitzungsKontext';
import {
  BIS_STUNDE,
  Hintergrundflaechen,
  STATUS_TEXT,
  Stundenraster,
  VON_STUNDE,
  Zeitspalte,
  belegtNoch,
  hoehePx,
  obenPx,
  terminStil,
} from '../kalender/Raster';
import {
  heute,
  kurzesDatum,
  langesDatum,
  monatsName,
  monatsbeginn,
  monatsende,
  ortszeit,
  plusTage,
  wochenbeginn,
  wochentagKurz,
  zuZeitpunkt,
} from '../kalender/zeit';
import { TelefonBuchung } from './TelefonBuchung';
import { TerminTafel } from './TerminTafel';

type Ansicht = 'tag' | 'woche' | 'monat';

export function Kalender() {
  const { person } = useSitzung();
  const abfragen = useQueryClient();
  const istAdmin = person?.role === 'ADMIN';

  const [ansicht, setAnsicht] = useState<Ansicht>('tag');
  const [datum, setDatum] = useState(heute());
  const [gewaehlt, setGewaehlt] = useState<KalenderTermin | null>(null);
  const [buchungOffen, setBuchungOffen] = useState(false);

  const von =
    ansicht === 'tag' ? datum : ansicht === 'woche' ? wochenbeginn(datum) : monatsbeginn(datum);
  const bis =
    ansicht === 'tag'
      ? datum
      : ansicht === 'woche'
        ? plusTage(wochenbeginn(datum), 6)
        : monatsende(datum);

  const blatt = useQuery({
    queryKey: ['kalender', von, bis],
    queryFn: () => api.kalender.blatt(von, bis),
  });

  function neuLaden() {
    void abfragen.invalidateQueries({ queryKey: ['kalender'] });
  }

  const [fehler, setFehler] = useState<string | null>(null);

  const verschieben = useMutation({
    mutationFn: ({ id, startsAt }: { id: string; startsAt: string }) =>
      api.termine.verschieben(id, startsAt),
    onSuccess: () => {
      setFehler(null);
      neuLaden();
    },
    onError: (e) =>
      setFehler(e instanceof ApiFehler ? e.message : 'Das Verschieben ist fehlgeschlagen.'),
  });

  /**
   * Nach dem Ziehen: nachfragen, dann verschieben.
   *
   * Die Rueckfrage ist nicht Zeremonie. Ein Griff daneben verschiebt den
   * Termin einer Kundin, die darauf wartet — und beim Ziehen passiert das
   * leichter als bei jedem Klick.
   */
  function aufZeitZiehen(termin: KalenderTermin, tag: string, minuten: number) {
    const ziel = zuZeitpunkt(tag, minuten);
    const alt = ortszeit(termin.startsAt);
    const neu = ortszeit(ziel);

    if (ziel.getTime() === new Date(termin.startsAt).getTime()) return;

    const frage =
      `Termin von ${termin.customer.vorname} ${termin.customer.nachname}
` +
      `von ${langesDatum(alt.datum)}, ${alt.zeit}
` +
      `auf ${langesDatum(neu.datum)}, ${neu.zeit} verschieben?`;

    if (window.confirm(frage)) {
      verschieben.mutate({ id: termin.id, startsAt: ziel.toISOString() });
    }
  }

  const schritt = ansicht === 'tag' ? 1 : ansicht === 'woche' ? 7 : 0;

  function blaettern(richtung: 1 | -1) {
    if (ansicht === 'monat') {
      const [j, m] = datum.split('-').map(Number);
      setDatum(new Date(Date.UTC(j, m - 1 + richtung, 1)).toISOString().slice(0, 10));
    } else {
      setDatum(plusTage(datum, schritt * richtung));
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-tinte text-3xl font-semibold">Kalender</h1>
          <p className="text-grau-700 mt-1">
            {istAdmin ? 'Alle Kosmetiker:innen nebeneinander.' : 'Ihre Termine.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="border-creme-tief flex overflow-hidden rounded-[10px] border">
            {(['tag', 'woche', 'monat'] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={ansicht === a}
                onClick={() => setAnsicht(a)}
                className={`min-h-10 px-3 text-sm ${
                  ansicht === a ? 'bg-creme-tief text-tinte font-semibold' : 'text-grau-700'
                }`}
              >
                {a === 'tag' ? 'Tag' : a === 'woche' ? 'Woche' : 'Monat'}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="knopf knopf-still min-h-10 px-3"
            onClick={() => blaettern(-1)}
            aria-label="Zurück"
          >
            ‹
          </button>
          <button
            type="button"
            className="knopf knopf-still min-h-10 px-3"
            onClick={() => setDatum(heute())}
          >
            Heute
          </button>
          <button
            type="button"
            className="knopf knopf-still min-h-10 px-3"
            onClick={() => blaettern(1)}
            aria-label="Weiter"
          >
            ›
          </button>

          {istAdmin && !buchungOffen && (
            <button
              type="button"
              className="knopf knopf-gold min-h-10"
              onClick={() => setBuchungOffen(true)}
            >
              Termin anlegen
            </button>
          )}
        </div>
      </div>

      {buchungOffen && (
        <TelefonBuchung
          datum={datum}
          onFertig={() => {
            setBuchungOffen(false);
            neuLaden();
          }}
          onAbbrechen={() => setBuchungOffen(false)}
        />
      )}

      <h2 className="text-tinte-sanft mb-4 text-lg font-medium" aria-live="polite">
        {ansicht === 'tag'
          ? langesDatum(datum)
          : ansicht === 'woche'
            ? `${kurzesDatum(von)} – ${kurzesDatum(bis)}`
            : monatsName(datum)}
      </h2>

      {fehler !== null && (
        <div className="meldung meldung-fehler mb-4" role="alert">
          {fehler}
        </div>
      )}

      {blatt.isPending && <p className="text-grau-700">Wird geladen …</p>}

      {blatt.isError && (
        <div className="meldung meldung-fehler" role="alert">
          Der Kalender konnte nicht geladen werden.
        </div>
      )}

      {blatt.data !== undefined && (
        <>
          {ansicht === 'tag' && (
            <TagesRaster
              blatt={blatt.data}
              datum={datum}
              onWaehlen={setGewaehlt}
              onZiehen={aufZeitZiehen}
            />
          )}
          {ansicht === 'woche' && (
            <WochenRaster
              blatt={blatt.data}
              von={von}
              onWaehlen={setGewaehlt}
              onZiehen={aufZeitZiehen}
            />
          )}
          {ansicht === 'monat' && (
            <MonatsUebersicht
              blatt={blatt.data}
              von={von}
              bis={bis}
              onTagWaehlen={(t) => {
                setDatum(t);
                setAnsicht('tag');
              }}
            />
          )}
        </>
      )}

      {gewaehlt !== null && (
        <TerminTafel
          termin={gewaehlt}
          onSchliessen={() => setGewaehlt(null)}
          onGeaendert={() => {
            setGewaehlt(null);
            neuLaden();
          }}
        />
      )}
    </div>
  );
}

type Blatt = NonNullable<Awaited<ReturnType<typeof api.kalender.blatt>>>;

interface RasterProps {
  blatt: Blatt;
  onWaehlen: (t: KalenderTermin) => void;
  onZiehen: (t: KalenderTermin, tag: string, minuten: number) => void;
}

/** Raster, auf das beim Ziehen eingerastet wird — dasselbe wie im Backend. */
const RASTER_MINUTEN = 15;

/**
 * Macht aus der Mausposition in einer Spalte eine Uhrzeit.
 *
 * Gegriffen wird der Termin irgendwo, nicht an seiner Oberkante. Ohne den
 * Griffversatz spraenge er beim Loslassen um genau die Strecke, die zwischen
 * Oberkante und Mauszeiger lag.
 */
function minutenAusPosition(
  ereignis: React.DragEvent<HTMLDivElement>,
  griffVersatzPx: number,
): number {
  const kasten = ereignis.currentTarget.getBoundingClientRect();
  const yImRaster = ereignis.clientY - kasten.top - griffVersatzPx;
  const minuten = VON_STUNDE * 60 + (yImRaster / hoehePx(60)) * 60;
  return Math.round(minuten / RASTER_MINUTEN) * RASTER_MINUTEN;
}

/**
 * Tagesansicht: eine Spalte je Kosmetiker:in.
 *
 * Die Ressourcenansicht ist für ein Studio die eigentliche Arbeitsansicht —
 * sie beantwortet „wer ist wann frei", und das ist die Frage am Telefon.
 */
function TagesRaster({ blatt, datum, onWaehlen, onZiehen }: RasterProps & { datum: string }) {
  const griffVersatz = useRef(0);

  const spalten = blatt.staff.filter(
    (s) => s.isActive || blatt.termine.some((t) => t.staff.id === s.id),
  );

  if (spalten.length === 0) {
    return <p className="text-grau-700">Für diesen Tag gibt es niemanden anzuzeigen.</p>;
  }

  return (
    <div className="border-creme-tief overflow-x-auto rounded-[16px] border bg-white">
      <div className="flex min-w-max">
        <div className="shrink-0">
          <div className="border-creme-tief h-10 border-b" />
          <Zeitspalte />
        </div>

        {spalten.map((s) => (
          <div key={s.id} className="border-creme-tief min-w-48 flex-1 border-l">
            <div className="border-creme-tief flex h-10 items-center gap-2 border-b px-3">
              {s.colorHex !== null && (
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.colorHex }}
                />
              )}
              <span
                className={`text-sm font-medium ${s.isActive ? 'text-tinte' : 'text-grau-500'}`}
              >
                {s.displayName}
              </span>
            </div>

            <div
              className="bg-creme relative"
              style={{ height: hoehePx((BIS_STUNDE - VON_STUNDE) * 60) }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                const termin = blatt.termine.find((t) => t.id === id);
                // Nur in die eigene Spalte: Die Person zu wechseln ist eine
                // andere Entscheidung als die Zeit zu wechseln, und sie kann
                // an der Leistungszuordnung scheitern.
                if (termin !== undefined && termin.staff.id === s.id) {
                  onZiehen(termin, datum, minutenAusPosition(e, griffVersatz.current));
                }
              }}
            >
              <Hintergrundflaechen
                datum={datum}
                staffId={s.id}
                abwesenheiten={blatt.abwesenheiten}
                arbeitszeiten={blatt.arbeitszeiten}
              />
              <Stundenraster />

              {blatt.termine
                .filter((t) => t.staff.id === s.id && ortszeit(t.startsAt).datum === datum)
                .map((t) => (
                  <TerminKachel
                    key={t.id}
                    termin={t}
                    onWaehlen={onWaehlen}
                    onGriff={(versatz) => (griffVersatz.current = versatz)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Wochenansicht: eine Spalte je Tag, alle Personen übereinander. */
function WochenRaster({ blatt, von, onWaehlen, onZiehen }: RasterProps & { von: string }) {
  const tage = Array.from({ length: 7 }, (_, i) => plusTage(von, i));
  const griffVersatz = useRef(0);

  return (
    <div className="border-creme-tief overflow-x-auto rounded-[16px] border bg-white">
      <div className="flex min-w-max">
        <div className="shrink-0">
          <div className="border-creme-tief h-10 border-b" />
          <Zeitspalte />
        </div>

        {tage.map((tag) => (
          <div key={tag} className="border-creme-tief min-w-40 flex-1 border-l">
            <div className="border-creme-tief flex h-10 items-center gap-1 border-b px-3">
              <span className="text-tinte text-sm font-medium">{wochentagKurz(tag)}</span>
              <span className="text-grau-700 text-[12px]">{kurzesDatum(tag)}</span>
            </div>

            <div
              className="bg-creme relative"
              style={{ height: hoehePx((BIS_STUNDE - VON_STUNDE) * 60) }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                const termin = blatt.termine.find((t) => t.id === id);
                if (termin !== undefined) {
                  onZiehen(termin, tag, minutenAusPosition(e, griffVersatz.current));
                }
              }}
            >
              <Stundenraster />
              {blatt.termine
                .filter((t) => ortszeit(t.startsAt).datum === tag)
                .map((t) => (
                  <TerminKachel
                    key={t.id}
                    termin={t}
                    onWaehlen={onWaehlen}
                    onGriff={(versatz) => (griffVersatz.current = versatz)}
                    kompakt
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Monatsübersicht.
 *
 * Bewusst kein Raster mit Uhrzeiten — bei einem Monat wäre jede Kachel zu
 * klein, um etwas zu lesen. Die Frage, die man im Monat stellt, ist „wie voll
 * ist es", nicht „wann genau". Deshalb Zahlen, und ein Klick führt in den Tag.
 */
function MonatsUebersicht({
  blatt,
  von,
  bis,
  onTagWaehlen,
}: {
  blatt: Blatt;
  von: string;
  bis: string;
  onTagWaehlen: (tag: string) => void;
}) {
  const tage: string[] = [];
  for (let t = von; t <= bis; t = plusTage(t, 1)) tage.push(t);

  // Führende Leerfelder, damit der Monat am richtigen Wochentag beginnt.
  const ersterWochentag = new Date(`${von}T12:00:00Z`).getUTCDay();
  const vorlauf = ersterWochentag === 0 ? 6 : ersterWochentag - 1;

  return (
    <div className="border-creme-tief overflow-hidden rounded-[16px] border bg-white">
      <div className="grid grid-cols-7">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
          <div key={w} className="border-creme-tief text-grau-700 border-b px-2 py-2 text-sm">
            {w}
          </div>
        ))}

        {Array.from({ length: vorlauf }, (_, i) => (
          <div key={`leer-${i}`} className="border-creme-tief min-h-20 border-r border-b" />
        ))}

        {tage.map((tag) => {
          const amTag = blatt.termine.filter((t) => ortszeit(t.startsAt).datum === tag);
          const aktiv = amTag.filter(belegtNoch);
          const geschlossen = blatt.abwesenheiten.some(
            (a) =>
              a.staffId === null &&
              ortszeit(a.startsAt).datum <= tag &&
              ortszeit(a.endsAt).datum > tag,
          );

          return (
            <button
              key={tag}
              type="button"
              onClick={() => onTagWaehlen(tag)}
              className={`border-creme-tief hover:bg-creme min-h-20 border-r border-b p-2 text-left ${
                geschlossen ? 'bg-creme-tief' : ''
              }`}
            >
              <div
                className={`text-sm ${tag === heute() ? 'text-tinte font-bold' : 'text-tinte-sanft'}`}
              >
                {Number(tag.slice(8))}
              </div>
              {geschlossen ? (
                <div className="text-grau-700 mt-1 text-[12px]">geschlossen</div>
              ) : aktiv.length > 0 ? (
                <div className="text-tinte-sanft mt-1 text-[12px]">
                  {aktiv.length} {aktiv.length === 1 ? 'Termin' : 'Termine'}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TerminKachel({
  termin,
  onWaehlen,
  onGriff,
  kompakt = false,
}: {
  termin: KalenderTermin;
  onWaehlen: (t: KalenderTermin) => void;
  onGriff: (versatzPx: number) => void;
  kompakt?: boolean;
}) {
  const von = ortszeit(termin.startsAt);
  const bis = ortszeit(termin.endsAt);
  const blockiert = ortszeit(termin.blockiertBis);
  const stil = terminStil(termin);

  const dauer = bis.minuten - von.minuten;
  const pufferDauer = blockiert.minuten - bis.minuten;

  return (
    <>
      {/* Die Aufräumzeit als eigener, schwächerer Streifen. Sie gehört zum
          Kalender, aber nicht zum Termin — die Kundin hat sie nicht gebucht. */}
      {pufferDauer > 0 && belegtNoch(termin) && (
        <div
          aria-hidden="true"
          className="bg-creme-tief absolute right-1 left-1 rounded-b-[6px] opacity-70"
          style={{ top: obenPx(bis.minuten), height: hoehePx(pufferDauer) }}
        />
      )}

      <button
        type="button"
        onClick={() => onWaehlen(termin)}
        /* Nur offene Termine lassen sich ziehen. Einen abgesagten zu
           verschieben ergaebe keinen Sinn, und das Backend lehnte es ab. */
        draggable={belegtNoch(termin)}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', termin.id);
          e.dataTransfer.effectAllowed = 'move';
          onGriff(e.clientY - e.currentTarget.getBoundingClientRect().top);
        }}
        className={`absolute right-1 left-1 overflow-hidden rounded-[6px] border px-2 py-1 text-left text-[12px] leading-tight ${stil.klasse} ${
          belegtNoch(termin) ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{ top: obenPx(von.minuten), height: Math.max(hoehePx(dauer), 22) }}
      >
        <div className={`font-medium ${stil.durchgestrichen ? 'line-through' : ''}`}>
          {von.zeit} {termin.customer.vorname} {termin.customer.nachname.slice(0, 1)}.
        </div>
        {!kompakt && dauer >= 45 && <div className="truncate">{termin.service.name}</div>}
        {!kompakt && dauer >= 60 && termin.status !== 'CONFIRMED' && (
          <div className="truncate italic">{STATUS_TEXT[termin.status]}</div>
        )}
      </button>
    </>
  );
}
