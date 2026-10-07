import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Termine, die eine Zuordnung noch braucht: künftig und nicht abgesagt.
 *
 * Vergangene Termine zählen bewusst nicht. Dass Mara im März ein Microneedling
 * gemacht hat, bleibt wahr, auch wenn sie es heute nicht mehr anbietet.
 */
const OFFENE_STATUS: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

/** Eine Zeile der Matrix: eine Leistung und wer sie anbietet. */
export interface ZuordnungsZeile {
  serviceId: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  isActive: boolean;
  /** Profil-IDs der Kosmetiker:innen, die diese Leistung anbieten. */
  staffIds: string[];
}

export interface ZuordnungsMatrix {
  /** Spaltenköpfe: alle Kosmetiker:innen, auch deaktivierte. */
  staff: Array<{
    id: string;
    displayName: string;
    isActive: boolean;
    /**
     * Hat die Person ihren Zugang eingerichtet? Ohne das kann die Matrix die
     * Luecke nicht zeigen, um die es hier geht: Eine Leistung, die nur einer
     * frisch eingeladenen Person zugeordnet ist, traegt einen Haken und ist
     * trotzdem nicht buchbar.
     */
    zugangAktiv: boolean;
    colorHex: string | null;
  }>;
  zeilen: ZuordnungsZeile[];
}

/** Was die Kundschaft über eine Behandlerin wissen muss, um zu wählen. */
export interface AnbieterIn {
  id: string;
  displayName: string;
  bio: string | null;
  photoUrl: string | null;
}

@Injectable()
export class ZuordnungService {
  private readonly logger = new Logger(ZuordnungService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Die ganze Matrix in einem Aufruf.
   *
   * Drei getrennte Abfragen aus der Oberfläche heraus wären langsamer und
   * könnten sich widersprechen: Zwischen „lade Leistungen" und „lade
   * Zuordnungen" kann jemand etwas ändern, und das Ergebnis zeigt dann einen
   * Zustand, den es nie gab.
   */
  async matrix(): Promise<ZuordnungsMatrix> {
    const [personen, leistungen] = await Promise.all([
      this.prisma.staffProfile.findMany({
        orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
        select: {
          id: true,
          displayName: true,
          isActive: true,
          colorHex: true,
          user: { select: { status: true, emailVerifiedAt: true } },
        },
      }),
      this.prisma.service.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          priceCents: true,
          isActive: true,
          staff: { select: { staffId: true } },
        },
      }),
    ]);

    return {
      staff: personen.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        isActive: p.isActive,
        colorHex: p.colorHex,
        // Dieselbe Bedingung wie in der oeffentlichen Liste und in
        // services.service.ts. Drei Stellen, eine Regel — das ist eine zu
        // viel; zusammengefasst wird sie, sobald eine vierte dazukommt.
        zugangAktiv: p.user.status === 'ACTIVE' && p.user.emailVerifiedAt !== null,
      })),
      zeilen: leistungen.map((l) => ({
        serviceId: l.id,
        name: l.name,
        durationMinutes: l.durationMinutes,
        priceCents: l.priceCents,
        isActive: l.isActive,
        staffIds: l.staff.map((s) => s.staffId),
      })),
    };
  }

  /**
   * Zuordnen. Idempotent — zweimal zuordnen ist kein Fehler.
   *
   * Eine Matrix aus Kästchen schickt leicht denselben Klick doppelt los, etwa
   * weil die Verbindung hängt. Dass der zweite Aufruf dann mit einem Fehler
   * antwortet, wäre für die Bedienende nicht nachvollziehbar: Das Kästchen ist
   * doch angehakt, genau wie gewollt.
   */
  async zuordnen(staffId: string, serviceId: string): Promise<void> {
    await this.muessenExistieren(staffId, serviceId);

    await this.prisma.staffService.upsert({
      where: { staffId_serviceId: { staffId, serviceId } },
      create: { staffId, serviceId },
      update: {},
    });

    this.logger.log('Leistung zugeordnet');
  }

  /**
   * Zuordnung entziehen.
   *
   * Hängen künftige Termine daran, wird abgelehnt — es sei denn, die
   * Studioleitung bestätigt ausdrücklich. Der Grund fürs Entziehen ist oft
   * einer, der auch die bestehenden Termine betrifft: eine abgelaufene
   * Zertifizierung etwa. Die stillschweigend stehen zu lassen wäre falsch. Sie
   * aber zwangsweise zu stornieren wäre noch falscher — wer sie absagt und wie,
   * ist eine Entscheidung des Studios, nicht dieser Funktion.
   *
   * Deshalb: nachfragen, die Zahl nennen, und die Entscheidung dort lassen, wo
   * sie hingehört.
   */
  async entziehen(staffId: string, serviceId: string, bestaetigt: boolean): Promise<void> {
    const vorhanden = await this.prisma.staffService.findUnique({
      where: { staffId_serviceId: { staffId, serviceId } },
      select: { staffId: true },
    });

    // Schon entzogen: nichts zu tun. Dieselbe Überlegung wie beim Zuordnen.
    if (vorhanden === null) return;

    if (!bestaetigt) {
      const offene = await this.offeneTermine(staffId, serviceId);
      if (offene > 0) {
        throw new ConflictException(
          `Für diese Leistung stehen noch ${offene} Termine bei dieser Person an. ` +
            'Die Termine bleiben bestehen, neue sind danach aber nicht mehr buchbar. ' +
            'Entscheiden Sie zuerst, ob die vereinbarten Termine stattfinden sollen.',
        );
      }
    }

    // deleteMany statt delete: Zwei gleichzeitige Klicks auf dasselbe Kaestchen
    // kommen beide an der Pruefung oben vorbei, und `delete` wuerde beim
    // zweiten mit P2025 werfen — also 500 auf eine Aktion, die versprochen
    // idempotent ist. `deleteMany` liefert dann schlicht count: 0.
    await this.prisma.staffService.deleteMany({ where: { staffId, serviceId } });

    this.logger.log('Leistungszuordnung entzogen');
  }

  /** Wie viele künftige, nicht abgesagte Termine hängen an dieser Zuordnung? */
  async offeneTermine(staffId: string, serviceId: string): Promise<number> {
    return this.prisma.appointment.count({
      where: {
        staffId,
        serviceId,
        startsAt: { gt: new Date() },
        status: { in: OFFENE_STATUS },
      },
    });
  }

  /**
   * Wer bietet diese Leistung an? Für die Auswahl in der App.
   *
   * Dieselben Bedingungen wie in der öffentlichen Teamliste: aktiv, Zugang
   * eingerichtet. Wer nicht arbeiten kann, soll nicht buchbar sein.
   */
  async anbieterFuer(serviceId: string): Promise<AnbieterIn[]> {
    const leistung = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { isActive: true },
    });

    if (leistung === null || !leistung.isActive) {
      throw new NotFoundException('Leistung nicht gefunden.');
    }

    const zeilen = await this.prisma.staffProfile.findMany({
      where: {
        isActive: true,
        user: { status: 'ACTIVE', emailVerifiedAt: { not: null } },
        services: { some: { serviceId } },
      },
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true, bio: true, photoUrl: true },
    });

    return zeilen;
  }

  private async muessenExistieren(staffId: string, serviceId: string): Promise<void> {
    const [person, leistung] = await Promise.all([
      this.prisma.staffProfile.count({ where: { id: staffId } }),
      this.prisma.service.count({ where: { id: serviceId } }),
    ]);

    if (person === 0) throw new NotFoundException('Kosmetiker:in nicht gefunden.');
    if (leistung === 0) throw new NotFoundException('Leistung nicht gefunden.');
  }
}
