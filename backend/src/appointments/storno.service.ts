import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus, CancellationReason } from '@prisma/client';
import { AuditAktion, AuditService } from '../audit/audit.service';
import type { AngemeldetePerson } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { VerfuegbarkeitService } from '../verfuegbarkeit/verfuegbarkeit.service';
import { alsOrtszeit } from '../zeit/zeitzone';
import { istUeberschneidung } from './ueberschneidung';

/** Status, aus denen heraus sich noch etwas ändern lässt. */
const AENDERBAR: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

export interface StornoWunsch {
  /** Pflicht, wenn das Studio absagt. Bei einer Absage durch die Kundin leer. */
  grund?: CancellationReason;
}

@Injectable()
export class StornoService {
  private readonly logger = new Logger(StornoService.name);
  private readonly zone: string;
  private readonly fristStunden: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly verfuegbarkeit: VerfuegbarkeitService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.zone = config.get<string>('STUDIO_TIMEZONE', 'Europe/Vienna');
    this.fristStunden = Number(config.get('CANCELLATION_DEADLINE_HOURS', 24));
  }

  /**
   * Termin absagen.
   *
   * Zwei verschiedene Vorgänge unter einem Namen, und der Unterschied ist
   * fachlich wichtig:
   *
   * - **Die Kundin sagt ab.** Nur bis zur Frist, danach nicht mehr. Kein Grund
   *   nötig — ihn zu verlangen, hielte niemanden ab und erzeugte nur
   *   erfundene Angaben. Status `CANCELLED_BY_CUSTOMER`.
   * - **Das Studio sagt ab.** Jederzeit, auch kurzfristig, denn ein Ausfall
   *   kündigt sich nicht an. Dafür ist der Grund Pflicht: Eine Absage durch den
   *   Betrieb ist eine Entscheidung, die begründet gehört — und die
   *   No-Show-Statistik in Schritt 48 wäre sonst nicht lesbar. Status
   *   `CANCELLED_BY_STAFF`.
   *
   * Der Grund ist eine **Kategorie, kein Freitext** (E-35).
   */
  async stornieren(
    person: AngemeldetePerson,
    terminId: string,
    wunsch: StornoWunsch,
    jetzt: Date = new Date(),
  ): Promise<void> {
    const termin = await this.ladenUndPruefen(person, terminId);
    const vomStudio = person.role !== 'CUSTOMER';

    if (vomStudio) {
      if (wunsch.grund === undefined) {
        throw new BadRequestException('Für eine Absage durch das Studio wird ein Grund gebraucht.');
      }
    } else {
      if (wunsch.grund !== undefined) {
        // Ein von der Kundin gewählter "Grund" wäre eine Behauptung über den
        // Betrieb, die niemand prüft. Lieber gar nicht erst entgegennehmen.
        throw new BadRequestException('Für Ihre Absage wird kein Grund gebraucht.');
      }
      this.fristPruefen(termin.startsAt, jetzt);
    }

    await this.prisma.appointment.update({
      where: { id: terminId },
      data: {
        status: vomStudio
          ? AppointmentStatus.CANCELLED_BY_STAFF
          : AppointmentStatus.CANCELLED_BY_CUSTOMER,
        cancelledAt: jetzt,
        cancellationReason: wunsch.grund ?? null,
      },
    });

    await this.audit.protokolliere({
      actorUserId: person.id,
      action: AuditAktion.TERMIN_STORNIERT,
      entityType: 'appointment',
      entityId: terminId,
      metadata: {
        vorher: termin.status,
        nachher: vomStudio ? 'CANCELLED_BY_STAFF' : 'CANCELLED_BY_CUSTOMER',
        // Die Kategorie darf ins Protokoll, ein Freitext dürfte es nicht.
        grund: wunsch.grund ?? null,
        startsAt: termin.startsAt.toISOString(),
      },
    });

    this.logger.log(`Termin storniert, durch ${vomStudio ? 'Studio' : 'Kundin'}`);
  }

  /**
   * Termin verschieben.
   *
   * **In derselben Zeile, nicht als Absage plus Neubuchung.** Es ist derselbe
   * Termin zu einer anderen Zeit; eine Stornozeile daneben wäre für die Kundin
   * verwirrend ("ich habe doch nicht abgesagt") und setzte den Preis neu, womit
   * der Schnappschuss aus E-09 seinen Zweck verlöre.
   *
   * Dieselben zwei Stufen wie beim Buchen: Ist die neue Zeit angeboten, und ist
   * sie im Augenblick des Schreibens noch frei. Der Termin selbst wird bei der
   * ersten Prüfung ausgeklammert — sonst blockierte er sich beim Verschieben um
   * eine Viertelstunde selbst.
   */
  async verschieben(
    person: AngemeldetePerson,
    terminId: string,
    neuerStart: string,
    jetzt: Date = new Date(),
  ): Promise<{ startsAt: string; endsAt: string }> {
    const start = new Date(neuerStart);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Der neue Beginn ist kein gültiger Zeitpunkt.');
    }

    const termin = await this.ladenUndPruefen(person, terminId);

    if (person.role === 'CUSTOMER') this.fristPruefen(termin.startsAt, jetzt);

    if (start.getTime() === termin.startsAt.getTime()) {
      throw new BadRequestException('Das ist die bisherige Zeit.');
    }

    const tag = alsOrtszeit(start, this.zone).datum;
    const slots = await this.verfuegbarkeit.slots(
      {
        serviceId: termin.serviceId,
        staffId: termin.staffId,
        von: tag,
        bis: tag,
        ohneTerminId: terminId,
      },
      jetzt,
    );

    if (!slots.some((s) => new Date(s.startsAt).getTime() === start.getTime())) {
      throw new ConflictException(
        'Diese Zeit ist nicht buchbar. Bitte wählen Sie eine der angebotenen Zeiten.',
      );
    }

    const ende = new Date(start.getTime() + termin.service.durationMinutes * 60_000);

    try {
      await this.prisma.appointment.update({
        where: { id: terminId },
        data: { startsAt: start, endsAt: ende },
      });
    } catch (fehler) {
      if (istUeberschneidung(fehler)) {
        throw new ConflictException(
          'Diese Zeit wurde soeben vergeben. Bitte wählen Sie eine andere.',
        );
      }
      throw fehler;
    }

    await this.audit.protokolliere({
      actorUserId: person.id,
      action: AuditAktion.TERMIN_VERSCHOBEN,
      entityType: 'appointment',
      entityId: terminId,
      metadata: {
        vonStartsAt: termin.startsAt.toISOString(),
        nachStartsAt: start.toISOString(),
      },
    });

    this.logger.log('Termin verschoben');
    return { startsAt: start.toISOString(), endsAt: ende.toISOString() };
  }

  /**
   * Lädt den Termin und prüft Zugriff und Zustand.
   *
   * Ein fremder Termin liefert `404`, nicht `403`. Ein `403` verriete, dass es
   * ihn gibt — über durchprobierte Kennungen liesse sich ermitteln, wann die
   * Praxis ausgelastet ist.
   */
  private async ladenUndPruefen(person: AngemeldetePerson, terminId: string) {
    const termin = await this.prisma.appointment.findFirst({
      where: {
        id: terminId,
        ...(person.role === 'ADMIN'
          ? {}
          : person.role === 'STAFF'
            ? { staffId: person.staffProfileId ?? '' }
            : { customerId: person.id }),
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        staffId: true,
        serviceId: true,
        service: { select: { durationMinutes: true } },
      },
    });

    if (termin === null) throw new NotFoundException('Termin nicht gefunden.');

    if (!AENDERBAR.includes(termin.status)) {
      // Abgesagt, abgeschlossen oder als nicht erschienen vermerkt. Daran lässt
      // sich nichts mehr ändern — und ein stiller Erfolg wäre schlimmer als
      // eine Ablehnung, weil die Kundin dann glaubt, sie habe abgesagt.
      throw new ConflictException(
        termin.status.startsWith('CANCELLED')
          ? 'Dieser Termin ist bereits abgesagt.'
          : 'Dieser Termin ist bereits abgeschlossen und lässt sich nicht mehr ändern.',
      );
    }

    return termin;
  }

  /**
   * Stornofrist für Kundinnen.
   *
   * Gerechnet vom Beginn des Termins rückwärts. Die Frist gilt **nicht** für
   * das Studio: Wenn die Behandlerin krank wird, hilft es niemandem, dass die
   * Absage zu spät kommt.
   */
  private fristPruefen(start: Date, jetzt: Date): void {
    const grenze = start.getTime() - this.fristStunden * 3_600_000;

    if (jetzt.getTime() > grenze) {
      throw new ForbiddenException(
        `Eine Absage ist bis ${this.fristStunden} Stunden vor dem Termin möglich. ` +
          'Bitte rufen Sie uns an, wenn es kurzfristig nicht geht.',
      );
    }
  }
}
