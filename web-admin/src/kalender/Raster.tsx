import type { KalenderAbwesenheit, KalenderTermin } from '../api/client';
import { ortszeit } from './zeit';

/** Höhe einer Stunde im Raster, in Pixeln. */
export const STUNDE_PX = 56;
/** Erste und letzte angezeigte Stunde. */
export const VON_STUNDE = 6;
export const BIS_STUNDE = 22;

const MINUTE_PX = STUNDE_PX / 60;

export function obenPx(minutenAbMitternacht: number): number {
  return (minutenAbMitternacht - VON_STUNDE * 60) * MINUTE_PX;
}

export function hoehePx(dauerMinuten: number): number {
  return dauerMinuten * MINUTE_PX;
}

/** Wie ein Termin je nach Status aussieht. */
export function terminStil(t: KalenderTermin): { klasse: string; durchgestrichen: boolean } {
  switch (t.status) {
    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_STAFF':
      // Abgesagte Termine bleiben sichtbar, aber zurückgenommen. Sie aus dem
      // Kalender zu nehmen wäre bequemer und falsch: Das Studio muss sehen,
      // dass hier etwas war — sonst wirkt die Lücke wie ein Planungsfehler.
      return { klasse: 'border-grau-300 bg-grau-100 text-grau-700', durchgestrichen: true };
    case 'NO_SHOW':
      return { klasse: 'border-fehler bg-fehler-flaeche text-tinte', durchgestrichen: false };
    case 'COMPLETED':
      return { klasse: 'border-creme-tief bg-creme text-tinte-sanft', durchgestrichen: false };
    case 'PENDING':
      return { klasse: 'border-gold bg-white text-tinte', durchgestrichen: false };
    default:
      return { klasse: 'border-creme-tief bg-white text-tinte', durchgestrichen: false };
  }
}

export const STATUS_TEXT: Record<KalenderTermin['status'], string> = {
  PENDING: 'wartet auf Bestätigung',
  CONFIRMED: 'bestätigt',
  CANCELLED_BY_CUSTOMER: 'von der Kundin abgesagt',
  CANCELLED_BY_STAFF: 'vom Studio abgesagt',
  COMPLETED: 'abgeschlossen',
  NO_SHOW: 'nicht erschienen',
};

/** Blockiert ein Termin den Kalender noch, oder ist er erledigt? */
export function belegtNoch(t: KalenderTermin): boolean {
  return t.status === 'PENDING' || t.status === 'CONFIRMED';
}

/** Die Stundenlinien als Hintergrund. */
export function Stundenraster() {
  const stunden = [];
  for (let s = VON_STUNDE; s <= BIS_STUNDE; s++) stunden.push(s);

  return (
    <>
      {stunden.map((s) => (
        <div
          key={s}
          aria-hidden="true"
          className="border-creme-tief absolute right-0 left-0 border-t"
          style={{ top: obenPx(s * 60) }}
        />
      ))}
    </>
  );
}

/** Die Uhrzeiten am linken Rand. */
export function Zeitspalte() {
  const stunden = [];
  for (let s = VON_STUNDE; s <= BIS_STUNDE; s++) stunden.push(s);

  return (
    <div
      className="relative w-14 shrink-0"
      style={{ height: hoehePx((BIS_STUNDE - VON_STUNDE) * 60) }}
    >
      {stunden.map((s) => (
        <div
          key={s}
          className="text-grau-700 absolute right-2 -translate-y-1/2 text-[12px]"
          style={{ top: obenPx(s * 60) }}
        >
          {String(s).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  );
}

interface FlaechenProps {
  datum: string;
  staffId: string;
  abwesenheiten: KalenderAbwesenheit[];
  arbeitszeiten: Array<{ staffId: string; weekday: number; von: string; bis: string }>;
}

/**
 * Arbeitszeit und Abwesenheit als Hintergrund.
 *
 * Ohne das sieht ein leerer Kalender am Feiertag genauso aus wie an einem
 * vollen Arbeitstag, an dem nur nichts gebucht ist. Die Arbeitszeit ist hell,
 * alles andere bleibt grau — so ist auf einen Blick zu sehen, wo überhaupt
 * jemand da ist.
 */
export function Hintergrundflaechen({
  datum,
  staffId,
  abwesenheiten,
  arbeitszeiten,
}: FlaechenProps) {
  const weekday = new Date(`${datum}T12:00:00Z`).getUTCDay();
  const spannen = arbeitszeiten.filter((a) => a.staffId === staffId && a.weekday === weekday);

  const relevant = abwesenheiten.filter((a) => a.staffId === null || a.staffId === staffId);

  return (
    <>
      {spannen.map((a, i) => {
        const [vh, vm] = a.von.split(':').map(Number);
        const [bh, bm] = a.bis.split(':').map(Number);
        return (
          <div
            key={`arbeit-${i}`}
            aria-hidden="true"
            className="absolute right-0 left-0 bg-white"
            style={{ top: obenPx(vh * 60 + vm), height: hoehePx(bh * 60 + bm - (vh * 60 + vm)) }}
          />
        );
      })}

      {relevant.map((a) => {
        const von = ortszeit(a.startsAt);
        const bis = ortszeit(a.endsAt);
        // Eine mehrtägige Abwesenheit auf diesen Tag zuschneiden.
        const vonMin = von.datum < datum ? 0 : von.minuten;
        const bisMin = bis.datum > datum ? 24 * 60 : bis.minuten;
        if (bisMin <= vonMin) return null;

        return (
          <div
            key={a.id}
            aria-hidden="true"
            className="bg-creme-tief absolute right-0 left-0 opacity-80"
            style={{ top: obenPx(vonMin), height: hoehePx(bisMin - vonMin) }}
          />
        );
      })}
    </>
  );
}
