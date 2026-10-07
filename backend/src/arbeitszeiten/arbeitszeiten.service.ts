import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TimeOffType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { alsOrtszeit, ortsangabeZuUtc, tagesbeginn, tagesende } from '../zeit/zeitzone';
import type { AbwesenheitDto, WochenplanDto } from './dto/arbeitszeit.dto';

/** Eine Arbeitszeitspanne, wie sie gepflegt und angezeigt wird: Ortszeit. */
export interface Arbeitsspanne {
  /** 0 = Sonntag bis 6 = Samstag. */
  weekday: number;
  /** `HH:mm` Ortszeit. */
  von: string;
  bis: string;
}

export interface Abwesenheit {
  id: string;
  /** `null` bedeutet: gilt für das ganze Studio. */
  staffId: string | null;
  staffName: string | null;
  type: TimeOffType;
  ganztags: boolean;
  /** Ortszeit, so wie es in der Oberfläche steht. */
  vonDatum: string;
  vonZeit: string;
  bisDatum: string;
  bisZeit: string;
}

@Injectable()
export class ArbeitszeitenService {
  private readonly logger = new Logger(ArbeitszeitenService.name);
  private readonly zone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.zone = config.get<string>('STUDIO_TIMEZONE', 'Europe/Vienna');
  }

  // ---------------------------------------------------------------- Arbeitszeit

  async wochenplan(staffId: string): Promise<Arbeitsspanne[]> {
    await this.mussExistieren(staffId);

    const zeilen = await this.prisma.workingHours.findMany({
      where: { staffId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      select: { weekday: true, startTime: true, endTime: true },
    });

    return zeilen.map((z) => ({
      weekday: z.weekday,
      von: alsZeitText(z.startTime),
      bis: alsZeitText(z.endTime),
    }));
  }

  /**
   * Die ganze Woche auf einmal setzen.
   *
   * Ersetzen statt einzeln ändern. Eine Woche bearbeitet man als Ganzes: Man
   * verschiebt den Dienstagnachmittag, teilt den Mittwoch in zwei Hälften und
   * streicht den Freitag — und drückt dann einmal auf Speichern. Einzelne
   * Endpunkte je Zeile würden daraus eine Folge von Aufrufen machen, bei der
   * jeder Zwischenstand gültig sein müsste. Der Zwischenstand „Mittwoch
   * gelöscht, neue Hälften noch nicht angelegt" ist aber keiner, den jemand
   * gewollt hat.
   */
  async wochenplanSetzen(staffId: string, dto: WochenplanDto): Promise<Arbeitsspanne[]> {
    await this.mussExistieren(staffId);
    const spannen = this.pruefen(dto.spannen);

    await this.prisma.$transaction(async (tx) => {
      await tx.workingHours.deleteMany({ where: { staffId } });
      if (spannen.length > 0) {
        await tx.workingHours.createMany({
          data: spannen.map((s) => ({
            staffId,
            weekday: s.weekday,
            startTime: alsZeitWert(s.von),
            endTime: alsZeitWert(s.bis),
          })),
        });
      }
    });

    this.logger.log(`Wochenplan gesetzt: ${spannen.length} Spannen`);
    return this.wochenplan(staffId);
  }

  /**
   * Prüft die Spannen und gibt sie sortiert zurück.
   *
   * Überschneidungen innerhalb eines Wochentags sind verboten. Sie wären nicht
   * falsch im Sinne der Datenbank, aber die Slot-Berechnung würde dieselbe Zeit
   * zweimal anbieten — und ein doppelter Slot ist eine Doppelbuchung in spe.
   */
  private pruefen(spannen: Arbeitsspanne[]): Arbeitsspanne[] {
    for (const s of spannen) {
      if (s.von >= s.bis) {
        throw new BadRequestException(
          `${wochentagName(s.weekday)}: ${s.von} bis ${s.bis} ergibt keine Arbeitszeit. ` +
            'Das Ende muss nach dem Beginn liegen. ' +
            'Eine Schicht über Mitternacht ist als zwei Einträge einzutragen.',
        );
      }
    }

    const sortiert = [...spannen].sort((a, b) =>
      a.weekday !== b.weekday ? a.weekday - b.weekday : a.von.localeCompare(b.von),
    );

    for (let i = 1; i < sortiert.length; i++) {
      const vorher = sortiert[i - 1];
      const jetzt = sortiert[i];
      if (vorher.weekday === jetzt.weekday && jetzt.von < vorher.bis) {
        throw new BadRequestException(
          `${wochentagName(jetzt.weekday)}: ${vorher.von}–${vorher.bis} und ` +
            `${jetzt.von}–${jetzt.bis} überschneiden sich. ` +
            'Eine Mittagspause wird als zwei getrennte Zeiten eingetragen, etwa 9–12 und 13–17.',
        );
      }
    }

    return sortiert;
  }

  // --------------------------------------------------------------- Abwesenheit

  /**
   * Abwesenheiten in einem Zeitraum.
   *
   * Geliefert wird, was den Zeitraum **berührt**, nicht was darin beginnt. Ein
   * Urlaub vom 1. bis 20. gehört in die Abfrage für den 10., obwohl er davor
   * begonnen hat — der häufigste Fehler bei solchen Abfragen.
   */
  async abwesenheiten(
    vonDatum: string,
    bisDatum: string,
    staffId?: string,
  ): Promise<Abwesenheit[]> {
    const von = tagesbeginn(vonDatum, this.zone);
    const bis = tagesende(bisDatum, this.zone);

    const zeilen = await this.prisma.timeOff.findMany({
      where: {
        startsAt: { lt: bis },
        endsAt: { gt: von },
        // Ohne Angabe alles, inklusive der studioweiten Einträge. Mit Angabe
        // die der Person **und** die studioweiten — ein Feiertag betrifft sie
        // genauso, und wer ihn hier übersähe, böte Slots am 1. Mai an.
        ...(staffId !== undefined ? { OR: [{ staffId }, { staffId: null }] } : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: { staff: { select: { displayName: true } } },
    });

    return zeilen.map((z) => {
      const anfang = alsOrtszeit(z.startsAt, this.zone);
      const ende = alsOrtszeit(z.endsAt, this.zone);
      return {
        id: z.id,
        staffId: z.staffId,
        staffName: z.staff?.displayName ?? null,
        type: z.type,
        ganztags: z.isAllDay,
        vonDatum: anfang.datum,
        vonZeit: anfang.zeit,
        // Ganztägig endet in der Datenbank an der Mitternacht **danach**. In
        // der Oberfläche soll aber der letzte betroffene Tag stehen, sonst
        // sieht ein eintägiger Urlaub nach zwei Tagen aus.
        bisDatum: z.isAllDay ? vortag(ende.datum) : ende.datum,
        bisZeit: ende.zeit,
      };
    });
  }

  /**
   * Abwesenheit anlegen.
   *
   * Die Umrechnung von Ortszeit in UTC passiert **hier**, nicht im Client. Ein
   * Browser kennt die Zeitzone seines Geräts, nicht die des Studios; wer im
   * Urlaub einen Feiertag einträgt, würde ihn sonst um Stunden verschoben
   * anlegen.
   */
  async abwesenheitAnlegen(dto: AbwesenheitDto): Promise<Abwesenheit> {
    if (dto.staffId !== undefined && dto.staffId !== null) {
      await this.mussExistieren(dto.staffId);
    }

    const { startsAt, endsAt } = this.zeitraum(dto);

    if (startsAt >= endsAt) {
      throw new BadRequestException('Das Ende muss nach dem Beginn liegen.');
    }

    const angelegt = await this.prisma.timeOff.create({
      data: {
        staffId: dto.staffId ?? null,
        type: dto.type,
        isAllDay: dto.ganztags,
        startsAt,
        endsAt,
      },
      select: { id: true },
    });

    this.logger.log(
      `Abwesenheit angelegt: ${dto.type}${dto.staffId == null ? ' (studioweit)' : ''}`,
    );

    const liste = await this.abwesenheiten(dto.vonDatum, dto.bisDatum);
    const treffer = liste.find((a) => a.id === angelegt.id);
    if (treffer === undefined) throw new NotFoundException('Abwesenheit nicht gefunden.');
    return treffer;
  }

  async abwesenheitLoeschen(id: string): Promise<void> {
    const vorhanden = await this.prisma.timeOff.count({ where: { id } });
    if (vorhanden === 0) throw new NotFoundException('Abwesenheit nicht gefunden.');

    // Kein Schutz vor dem Löschen: Eine Abwesenheit ist keine Dokumentation,
    // sondern eine Planungsangabe. Wurde sie falsch eingetragen, muss sie weg —
    // und ein Termin hängt nie daran.
    await this.prisma.timeOff.delete({ where: { id } });
    this.logger.log('Abwesenheit gelöscht');
  }

  /** Rechnet die Ortsangaben des Formulars in zwei Zeitpunkte um. */
  private zeitraum(dto: AbwesenheitDto): { startsAt: Date; endsAt: Date } {
    if (dto.ganztags) {
      // Ganztägig heißt: von Mitternacht des ersten bis Mitternacht **nach**
      // dem letzten Tag. Über `tagesende`, nicht über `+ 24 Stunden` — am
      // 25. Oktober wären das 25 Stunden.
      return {
        startsAt: tagesbeginn(dto.vonDatum, this.zone),
        endsAt: tagesende(dto.bisDatum, this.zone),
      };
    }

    if (dto.vonZeit === undefined || dto.bisZeit === undefined) {
      throw new BadRequestException(
        'Für eine Abwesenheit, die nicht ganztägig ist, werden Uhrzeiten gebraucht.',
      );
    }

    return {
      startsAt: ortsangabeZuUtc(dto.vonDatum, dto.vonZeit, this.zone),
      endsAt: ortsangabeZuUtc(dto.bisDatum, dto.bisZeit, this.zone),
    };
  }

  private async mussExistieren(staffId: string): Promise<void> {
    const anzahl = await this.prisma.staffProfile.count({ where: { id: staffId } });
    if (anzahl === 0) throw new NotFoundException('Kosmetiker:in nicht gefunden.');
  }
}

/**
 * `@db.Time` kommt aus Prisma als Date mit dem Platzhalterdatum 1970-01-01,
 * die Uhrzeit steht dabei in UTC. Die beiden Helfer halten diese Eigenart an
 * einer Stelle fest, statt sie durch den Code zu streuen.
 */
function alsZeitText(wert: Date): string {
  return wert.toISOString().slice(11, 16);
}

function alsZeitWert(zeit: string): Date {
  return new Date(`1970-01-01T${zeit}:00.000Z`);
}

const NAMEN = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function wochentagName(weekday: number): string {
  return NAMEN[weekday] ?? `Wochentag ${weekday}`;
}

/** Vortag eines `YYYY-MM-DD`. Nur für die Anzeige ganztägiger Abwesenheiten. */
function vortag(datum: string): string {
  const [j, m, t] = datum.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t - 1)).toISOString().slice(0, 10);
}
