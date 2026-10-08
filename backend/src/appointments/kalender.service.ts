import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus } from '@prisma/client';
import type { AngemeldetePerson } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { tagesbeginn, tagesende } from '../zeit/zeitzone';

/** Ein Termin, wie ihn der Kalender braucht. */
export interface KalenderTermin {
  id: string;
  startsAt: string;
  endsAt: string;
  /** Ende einschliesslich Aufräumzeit. Der Kalender muss sie zeigen, die App nicht. */
  blockiertBis: string;
  status: AppointmentStatus;
  priceCents: number;
  service: { id: string; name: string; durationMinutes: number; bufferMinutes: number };
  staff: { id: string; displayName: string; colorHex: string | null };
  customer: { id: string; vorname: string; nachname: string; telefon: string | null };
}

/** Eine Abwesenheit im Kalender — sie erklärt, warum dort nichts gebucht werden kann. */
export interface KalenderAbwesenheit {
  id: string;
  startsAt: string;
  endsAt: string;
  /** `null` bedeutet studioweit. */
  staffId: string | null;
  type: string;
}

export interface Kalenderblatt {
  termine: KalenderTermin[];
  abwesenheiten: KalenderAbwesenheit[];
  /** Die Spalten des Rasters. */
  staff: Array<{ id: string; displayName: string; colorHex: string | null; isActive: boolean }>;
  /**
   * Die Regelarbeitszeiten der sichtbaren Personen, in Ortszeit.
   *
   * Ohne sie sieht ein leerer Kalender an einem Feiertag genauso aus wie an
   * einem vollen Arbeitstag, an dem nur nichts gebucht ist. Erst mit hinterlegter
   * Arbeitszeit wird aus dem Raster ein Dienstplan.
   */
  arbeitszeiten: Array<{ staffId: string; weekday: number; von: string; bis: string }>;
}

@Injectable()
export class KalenderService {
  private readonly zone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.zone = config.get<string>('STUDIO_TIMEZONE', 'Europe/Vienna');
  }

  /**
   * Das Kalenderblatt für einen Zeitraum.
   *
   * Termine, Abwesenheiten und die Spaltenköpfe in einem Aufruf. Drei getrennte
   * Abfragen aus der Oberfläche heraus zeigten einen Zustand, den es nie gab:
   * Zwischen „lade Termine" und „lade Abwesenheiten" kann jemand etwas ändern.
   *
   * **`STAFF` sieht nur sich selbst.** Nicht nur gefiltert in der Anzeige —
   * schon die Abfrage gibt nichts anderes her. Wer wann bei wem ist, geht eine
   * Kollegin nichts an; in einer Arztpraxis ist das keine Feinheit.
   */
  async blatt(
    person: AngemeldetePerson,
    von: string,
    bis: string,
    staffId?: string,
  ): Promise<Kalenderblatt> {
    if (von > bis) {
      throw new BadRequestException('Das Ende des Zeitraums darf nicht vor dem Anfang liegen.');
    }

    const beginn = tagesbeginn(von, this.zone);
    const ende = tagesende(bis, this.zone);

    if (ende.getTime() - beginn.getTime() > 45 * 86_400_000) {
      throw new BadRequestException('Es lassen sich höchstens 45 Tage auf einmal abfragen.');
    }

    // Wer die Anfrage stellt, entscheidet, was überhaupt sichtbar ist. Der
    // Filterwunsch des Clients kann das nur weiter einschränken, nie erweitern.
    const eigenes = person.role === 'STAFF' ? (person.staffProfileId ?? '') : undefined;
    const gewuenscht = eigenes ?? staffId;

    const [termine, abwesenheiten, staff, arbeitszeiten] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          startsAt: { lt: ende },
          endsAt: { gt: beginn },
          ...(gewuenscht !== undefined ? { staffId: gewuenscht } : {}),
        },
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          priceCentsSnapshot: true,
          service: { select: { id: true, name: true, durationMinutes: true, bufferMinutes: true } },
          staff: { select: { id: true, displayName: true, colorHex: true } },
          customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      }),

      this.prisma.timeOff.findMany({
        where: {
          startsAt: { lt: ende },
          endsAt: { gt: beginn },
          // Studioweite Einträge gehören immer dazu — sie erklären, warum an
          // einem Tag bei niemandem etwas geht.
          ...(gewuenscht !== undefined ? { OR: [{ staffId: gewuenscht }, { staffId: null }] } : {}),
        },
        orderBy: { startsAt: 'asc' },
        select: { id: true, startsAt: true, endsAt: true, staffId: true, type: true },
      }),

      this.prisma.staffProfile.findMany({
        where: gewuenscht !== undefined ? { id: gewuenscht } : {},
        orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
        select: { id: true, displayName: true, colorHex: true, isActive: true },
      }),

      this.prisma.workingHours.findMany({
        where: gewuenscht !== undefined ? { staffId: gewuenscht } : {},
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        select: { staffId: true, weekday: true, startTime: true, endTime: true },
      }),
    ]);

    return {
      termine: termine.map((t) => ({
        id: t.id,
        startsAt: t.startsAt.toISOString(),
        endsAt: t.endsAt.toISOString(),
        blockiertBis: new Date(t.endsAt.getTime() + t.service.bufferMinutes * 60_000).toISOString(),
        status: t.status,
        priceCents: t.priceCentsSnapshot,
        service: t.service,
        staff: t.staff,
        customer: {
          id: t.customer.id,
          vorname: t.customer.firstName,
          nachname: t.customer.lastName,
          telefon: t.customer.phone,
        },
      })),

      abwesenheiten: abwesenheiten.map((a) => ({
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt.toISOString(),
        staffId: a.staffId,
        type: a.type,
      })),

      staff,

      arbeitszeiten: arbeitszeiten.map((a) => ({
        staffId: a.staffId,
        weekday: a.weekday,
        // `@db.Time` kommt als Date mit Platzhalterdatum, die Uhrzeit in UTC.
        von: a.startTime.toISOString().slice(11, 16),
        bis: a.endTime.toISOString().slice(11, 16),
      })),
    };
  }
}
