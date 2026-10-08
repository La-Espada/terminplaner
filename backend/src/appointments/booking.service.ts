import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus } from '@prisma/client';
import { AuditAktion, AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { VerfuegbarkeitService } from '../verfuegbarkeit/verfuegbarkeit.service';
import { alsOrtszeit } from '../zeit/zeitzone';
import { istUeberschneidung } from './ueberschneidung';

export interface BuchungsWunsch {
  serviceId: string;
  staffId: string;
  /** Beginn als ISO-8601 mit Offset oder `Z`. */
  startsAt: string;
}

export interface Buchung {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  priceCents: number;
  service: { id: string; name: string; durationMinutes: number };
  staff: { id: string; displayName: string };
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly zone: string;
  private readonly autoBestaetigen: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly verfuegbarkeit: VerfuegbarkeitService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.zone = config.get<string>('STUDIO_TIMEZONE', 'Europe/Vienna');
    this.autoBestaetigen = String(config.get('AUTO_CONFIRM_BOOKINGS', 'true')) === 'true';
  }

  /**
   * Einen Termin buchen.
   *
   * **Der Server rechnet, der Client schlägt vor.** Vom Client kommen nur
   * Leistung, Person und Beginn. Dauer, Ende und Preis bestimmt ausschließlich
   * der Server — ein Client, der `endsAt` mitschicken dürfte, könnte eine
   * einstündige Behandlung als fünfminütige buchen und damit den Kalender
   * zerlegen; einer, der den Preis mitschickt, bucht zum Wunschpreis.
   *
   * Geprüft wird in zwei Stufen, und beide werden gebraucht:
   *
   * 1. **Ist das überhaupt ein angebotener Slot?** Das beantwortet derselbe
   *    Dienst, der auch die Liste liefert — nicht eine zweite Prüfung, die mit
   *    der Zeit davon abweicht. Arbeitszeiten, Abwesenheiten, Puffer, Vorlauf
   *    und Horizont stecken dort und in keinem Constraint.
   * 2. **Ist er in diesem Augenblick noch frei?** Das beantwortet allein die
   *    Datenbank. Zwischen Stufe 1 und dem Einfügen liegt ein Zeitfenster, durch
   *    das zwei gleichzeitige Buchungen hindurchrutschen (E-07).
   */
  async buchen(
    kundinId: string,
    wunsch: BuchungsWunsch,
    jetzt: Date = new Date(),
  ): Promise<Buchung> {
    const start = new Date(wunsch.startsAt);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Der Beginn ist kein gültiger Zeitpunkt.');
    }

    const leistung = await this.prisma.service.findUnique({
      where: { id: wunsch.serviceId },
      select: { id: true, name: true, durationMinutes: true, priceCents: true, isActive: true },
    });

    if (leistung === null || !leistung.isActive) {
      throw new NotFoundException('Leistung nicht gefunden.');
    }

    const person = await this.prisma.staffProfile.findFirst({
      where: {
        id: wunsch.staffId,
        isActive: true,
        user: { status: 'ACTIVE', emailVerifiedAt: { not: null } },
        services: { some: { serviceId: wunsch.serviceId } },
      },
      select: { id: true, displayName: true },
    });

    if (person === null) {
      throw new NotFoundException('Diese Leistung wird von dieser Person nicht angeboten.');
    }

    await this.mussAngebotenSein(wunsch, start, jetzt);

    const ende = new Date(start.getTime() + leistung.durationMinutes * 60_000);

    try {
      const angelegt = await this.prisma.appointment.create({
        data: {
          customerId: kundinId,
          staffId: person.id,
          serviceId: leistung.id,
          startsAt: start,
          endsAt: ende,
          // Preis zum Zeitpunkt der Buchung, unveränderlich (E-09). Eine
          // spätere Preisänderung lässt diesen Termin unberührt.
          priceCentsSnapshot: leistung.priceCents,
          status: this.autoBestaetigen ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING,
        },
        select: { id: true, startsAt: true, endsAt: true, status: true, priceCentsSnapshot: true },
      });

      await this.audit.protokolliere({
        actorUserId: kundinId,
        action: AuditAktion.TERMIN_GEBUCHT,
        entityType: 'appointment',
        entityId: angelegt.id,
        metadata: {
          serviceId: leistung.id,
          staffId: person.id,
          startsAt: angelegt.startsAt.toISOString(),
          status: angelegt.status,
        },
      });

      this.logger.log(`Termin gebucht, Status ${angelegt.status}`);

      return {
        id: angelegt.id,
        startsAt: angelegt.startsAt.toISOString(),
        endsAt: angelegt.endsAt.toISOString(),
        status: angelegt.status,
        priceCents: angelegt.priceCentsSnapshot,
        service: {
          id: leistung.id,
          name: leistung.name,
          durationMinutes: leistung.durationMinutes,
        },
        staff: person,
      };
    } catch (fehler) {
      if (istUeberschneidung(fehler)) {
        // Der eine Fall, für den der Constraint gebaut wurde: Zwei Kundinnen
        // tippen im selben Moment auf denselben Slot. Genau eine gewinnt, die
        // andere bekommt 409 — nicht 500. Der Unterschied zählt: Bei 409 lädt
        // die App die Slots neu und bietet eine Alternative an, bei 500 zeigt
        // sie "Es ist ein Fehler aufgetreten".
        this.logger.log('Buchung abgelehnt: Slot war bereits vergeben');
        throw new ConflictException(
          'Dieser Termin wurde soeben vergeben. Bitte wählen Sie eine andere Zeit.',
        );
      }
      throw fehler;
    }
  }

  /**
   * Prüft, ob der gewünschte Beginn in der Slot-Liste steht.
   *
   * Abgefragt wird genau der eine Ortstag. Dass der Beginn exakt getroffen
   * werden muss, ist Absicht: Eine Buchung um 09:07 wäre technisch möglich,
   * würde aber ein Loch hinterlassen, das nie wieder jemand füllt.
   */
  private async mussAngebotenSein(wunsch: BuchungsWunsch, start: Date, jetzt: Date): Promise<void> {
    const tag = alsOrtszeit(start, this.zone).datum;

    const slots = await this.verfuegbarkeit.slots(
      { serviceId: wunsch.serviceId, staffId: wunsch.staffId, von: tag, bis: tag },
      jetzt,
    );

    const treffer = slots.some((s) => new Date(s.startsAt).getTime() === start.getTime());

    if (!treffer) {
      // Bewusst dieselbe Meldung für alle Gründe — belegt, ausserhalb der
      // Arbeitszeit, im Urlaub, zu kurzfristig. Welcher davon zutrifft, wäre
      // eine Auskunft über den Kalender einer Beschäftigten.
      throw new ConflictException(
        'Dieser Termin ist nicht buchbar. Bitte wählen Sie eine der angebotenen Zeiten.',
      );
    }
  }
}
