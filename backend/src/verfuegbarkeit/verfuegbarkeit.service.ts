import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { rasterStarts, subtrahiere, vereinige, type Spanne } from '../zeit/intervalle';
import {
  alsOrtszeit,
  ortsangabeZuUtc,
  tagesbeginn,
  tagesende,
  tageZwischen,
} from '../zeit/zeitzone';

/**
 * Welche Termine blockieren eine Zeit?
 *
 * **Negativliste, nicht Positivliste.** Alles blockiert ausser den beiden
 * Storno-Status. Käme später ein Status dazu, fiele er bei einer Positivliste
 * stillschweigend aus der Blockade heraus; so ist er standardmässig blockierend
 * und damit sicher.
 *
 * Bewusst strenger als der `EXCLUDE`-Constraint (E-07), der nur `PENDING` und
 * `CONFIRMED` kennt. Die gefährliche Abweichung ist die andere Richtung: Bietet
 * die Slot-Berechnung mehr an als der Constraint zulässt, endet jede Buchung
 * darauf in `409`, der Client lädt neu, sieht denselben Slot wieder und läuft
 * in eine Schleife.
 */
const FREIGEBENDE_STATUS: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED_BY_CUSTOMER,
  AppointmentStatus.CANCELLED_BY_STAFF,
];

export interface Slot {
  /** ISO-8601 mit `Z`. Nur der Zeitpunkt ist eindeutig, die Ortszeit nicht. */
  startsAt: string;
  endsAt: string;
  /** Wer kann diesen Slot übernehmen. Bei Abfrage mit `staffId` genau eine Person. */
  staff: Array<{ id: string; displayName: string }>;
}

export interface SlotAnfrage {
  serviceId: string;
  staffId?: string;
  /** Kalendertage in Studio-Zeitzone, beide einschliesslich. */
  von: string;
  bis: string;
  /**
   * Diesen Termin beim Rechnen ignorieren.
   *
   * Gebraucht beim Verschieben: Soll ein Termin von 09:00 auf 09:15 ruecken,
   * ueberlappt die neue Zeit mit der alten — und der Termin blockierte sich
   * selbst. Ohne diese Ausnahme waere jede Verschiebung um weniger als eine
   * Behandlungsdauer unmoeglich, und das ist genau der haeufigste Fall.
   */
  ohneTerminId?: string;
}

/** Ein Arbeitsfenster einer Person an einem Tag, bereits in UTC. */
interface Fenster extends Spanne {
  staffId: string;
}

@Injectable()
export class VerfuegbarkeitService {
  private readonly zone: string;
  private readonly rasterMinuten: number;
  private readonly vorlaufMinuten: number;
  private readonly horizontTage: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.zone = config.get<string>('STUDIO_TIMEZONE', 'Europe/Vienna');
    this.rasterMinuten = Number(config.get('SLOT_GRANULARITY_MINUTES', 15));
    this.vorlaufMinuten = Number(config.get('BOOKING_LEAD_TIME_MINUTES', 120));
    this.horizontTage = Number(config.get('BOOKING_HORIZON_DAYS', 90));
  }

  /**
   * Freie Slots für eine Leistung in einem Zeitraum.
   *
   * Der Ablauf folgt PLAN.md 5.1: Arbeitszeiten laden, Blockaden abziehen, Rest
   * ins Raster schneiden, zu kurze und zu kurzfristige Slots verwerfen.
   *
   * `jetzt` ist ein Parameter und keine Abfrage der Systemuhr. Ohne das sind die
   * Fälle zur Vorlaufzeit und zum Buchungshorizont nicht reproduzierbar
   * prüfbar — und ein Verfügbarkeitsrechner, dessen Ergebnis man nicht
   * nachrechnen kann, ist in einer Arztpraxis wertlos.
   */
  async slots(anfrage: SlotAnfrage, jetzt: Date = new Date()): Promise<Slot[]> {
    const leistung = await this.prisma.service.findUnique({
      where: { id: anfrage.serviceId },
      select: { id: true, durationMinutes: true, isActive: true },
    });

    if (leistung === null || !leistung.isActive) {
      throw new NotFoundException('Leistung nicht gefunden.');
    }

    const personen = await this.buchbarePersonen(anfrage.serviceId, anfrage.staffId);
    if (personen.length === 0) return [];

    const tage = this.tageImHorizont(anfrage.von, anfrage.bis, jetzt);
    if (tage.length === 0) return [];

    const personIds = personen.map((p) => p.id);
    const fensterBeginn = tagesbeginn(tage[0], this.zone);
    const fensterEnde = tagesende(tage[tage.length - 1], this.zone);

    const [arbeitszeiten, abwesenheiten, termine] = await Promise.all([
      this.prisma.workingHours.findMany({
        where: { staffId: { in: personIds } },
        select: { staffId: true, weekday: true, startTime: true, endTime: true },
      }),

      // Studioweite Einträge (`staffId: null`) gelten für alle und müssen mit.
      // Wer nur `WHERE staff_id = :id` abfragt, übersieht jeden Feiertag —
      // `NULL = :id` ist nie wahr — und bietet Slots am 1. Mai an.
      this.prisma.timeOff.findMany({
        where: {
          OR: [{ staffId: { in: personIds } }, { staffId: null }],
          startsAt: { lt: fensterEnde },
          endsAt: { gt: fensterBeginn },
        },
        select: { staffId: true, startsAt: true, endsAt: true },
      }),

      // `endsAt > fensterBeginn` statt `startsAt >= fensterBeginn`: Ein Termin,
      // der vor dem Fenster begonnen hat und hineinragt, blockiert trotzdem.
      this.prisma.appointment.findMany({
        where: {
          staffId: { in: personIds },
          status: { notIn: FREIGEBENDE_STATUS },
          startsAt: { lt: fensterEnde },
          endsAt: { gt: fensterBeginn },
          ...(anfrage.ohneTerminId !== undefined ? { id: { not: anfrage.ohneTerminId } } : {}),
        },
        select: {
          staffId: true,
          startsAt: true,
          endsAt: true,
          service: { select: { bufferMinutes: true } },
        },
      }),
    ]);

    const dauerMs = leistung.durationMinutes * 60_000;
    const rasterMs = this.rasterMinuten * 60_000;
    const fruehestens = jetzt.getTime() + this.vorlaufMinuten * 60_000;

    /** Startzeitpunkt (ms) -> Personen, die dann können. */
    const gefunden = new Map<number, string[]>();

    for (const tag of tage) {
      const anker = tagesbeginn(tag, this.zone).getTime();
      const tagEnde = tagesende(tag, this.zone).getTime();
      const wochentag = alsOrtszeit(new Date(anker), this.zone).weekday;

      for (const person of personen) {
        const fenster = this.fensterFuerTag(arbeitszeiten, person.id, wochentag, tag);
        if (fenster.length === 0) continue;

        const blockaden = [
          ...abwesenheiten
            .filter((a) => a.staffId === null || a.staffId === person.id)
            .map((a) => ({ von: a.startsAt.getTime(), bis: a.endsAt.getTime() })),

          // Der Puffer blockiert **nach** dem Termin und ist nicht Teil davon.
          // Er steht nirgends gespeichert und wird hier aus der Leistung des
          // bestehenden Termins abgeleitet — auch der EXCLUDE-Constraint kennt
          // ihn nicht, die Einhaltung ist allein Sache der Anwendung.
          ...termine
            .filter((t) => t.staffId === person.id)
            .map((t) => ({
              von: t.startsAt.getTime(),
              bis: t.endsAt.getTime() + t.service.bufferMinutes * 60_000,
            })),
        ];

        for (const frei of subtrahiere(vereinige(fenster), blockaden)) {
          for (const start of rasterStarts(frei, anker, rasterMs, dauerMs)) {
            // Vorlaufzeit und Tagesgrenze. Letztere kann greifen, wenn ein
            // Arbeitsfenster über Mitternacht hinausreicht.
            if (start < fruehestens || start >= tagEnde) continue;

            const bisher = gefunden.get(start);
            if (bisher === undefined) gefunden.set(start, [person.id]);
            else if (!bisher.includes(person.id)) bisher.push(person.id);
          }
        }
      }
    }

    const namen = new Map(personen.map((p) => [p.id, p.displayName]));

    return [...gefunden.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([start, ids]) => ({
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + dauerMs).toISOString(),
        staff: ids
          .map((id) => ({ id, displayName: namen.get(id) ?? '' }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }));
  }

  /**
   * Arbeitsfenster einer Person an einem konkreten Tag, in UTC.
   *
   * Hier entsteht die Sommerzeitabhängigkeit: `working_hours` speichert
   * `TIME(0)` ohne Zeitzone — Angaben an der Wanduhr, die ihre Bedeutung erst
   * bekommen, wenn sie auf ein Datum gelegt werden. **Beide** Grenzen werden
   * deshalb einzeln umgerechnet. Die Abkürzung `ende = start + (endTime −
   * startTime)` stimmt an 363 von 365 Tagen; am 29. März und am 25. Oktober
   * nicht, und dann liegt der Fehler im Produktivbetrieb statt im Test.
   */
  private fensterFuerTag(
    arbeitszeiten: Array<{ staffId: string; weekday: number; startTime: Date; endTime: Date }>,
    staffId: string,
    wochentag: number,
    tag: string,
  ): Fenster[] {
    return arbeitszeiten
      .filter((a) => a.staffId === staffId && a.weekday === wochentag)
      .map((a) => ({
        staffId,
        von: ortsangabeZuUtc(tag, alsZeitText(a.startTime), this.zone).getTime(),
        bis: ortsangabeZuUtc(tag, alsZeitText(a.endTime), this.zone).getTime(),
      }))
      .filter((f) => f.bis > f.von);
  }

  /**
   * Wer kommt überhaupt in Frage.
   *
   * Dieselbe Bedingung wie in der öffentlichen Liste: Profil aktiv, Konto
   * aktiv, Einladung eingelöst, Leistung zugeordnet. Eine inaktive Person mit
   * vollständigen Arbeitszeiten darf in keinem Ergebnis auftauchen.
   */
  private async buchbarePersonen(
    serviceId: string,
    staffId?: string,
  ): Promise<Array<{ id: string; displayName: string }>> {
    const personen = await this.prisma.staffProfile.findMany({
      where: {
        ...(staffId !== undefined ? { id: staffId } : {}),
        isActive: true,
        user: { status: 'ACTIVE', emailVerifiedAt: { not: null } },
        services: { some: { serviceId } },
      },
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true },
    });

    // Ausdrücklich nach einer Person gefragt, die die Leistung nicht anbietet
    // oder nicht arbeiten kann: Das ist ein anderer Fall als "diese Woche
    // nichts frei", und die App soll ihn unterscheiden können.
    if (staffId !== undefined && personen.length === 0) {
      throw new NotFoundException('Diese Leistung wird von dieser Person nicht angeboten.');
    }

    return personen;
  }

  /**
   * Die abgefragten Tage, beschnitten auf Vergangenheit und Buchungshorizont.
   *
   * Der Horizont wird in **Kalendertagen** gerechnet, nicht in Millisekunden.
   * `jetzt + 90 × 86 400 000` schneidet den letzten Tag irgendwo in der Mitte ab
   * und verschiebt sich zweimal im Jahr um eine Stunde.
   */
  private tageImHorizont(von: string, bis: string, jetzt: Date): string[] {
    if (von > bis) {
      throw new BadRequestException('Das Ende des Zeitraums darf nicht vor dem Anfang liegen.');
    }

    const alle = tageZwischen(von, bis);
    if (alle.length === 0) return [];

    if (alle.length > 120) {
      // Grenze gegen versehentliche Jahresabfragen. Ein Kalender zeigt höchstens
      // einen Monat, die App eine Woche.
      throw new BadRequestException('Es lassen sich höchstens 120 Tage auf einmal abfragen.');
    }

    const heute = alsOrtszeit(jetzt, this.zone).datum;
    const letzter = this.horizontEnde(heute);

    return alle.filter((t) => t >= heute && t <= letzter);
  }

  /** Letzter buchbarer Tag, als Ortsdatum. */
  private horizontEnde(heute: string): string {
    const [j, m, t] = heute.split('-').map(Number);
    return new Date(Date.UTC(j, m - 1, t + this.horizontTage)).toISOString().slice(0, 10);
  }
}

/**
 * `@db.Time` kommt aus Prisma als Date mit dem Platzhalterdatum 1970-01-01 und
 * der Uhrzeit in UTC. Dieselbe Eigenart wie im Arbeitszeiten-Service.
 */
function alsZeitText(wert: Date): string {
  return wert.toISOString().slice(11, 16);
}
