import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LeistungAendernDto, LeistungAnlegenDto } from './dto/leistung.dto';

/** Was die Kundschaft sehen darf. */
export interface OeffentlicheLeistung {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
}

/** Was die Verwaltung sieht — zusätzlich Puffer, Status, Reihenfolge. */
export interface VerwalteteLeistung extends OeffentlicheLeistung {
  bufferMinutes: number;
  isActive: boolean;
  sortOrder: number;
  /** Wie oft wurde sie schon gebucht? Entscheidet, ob sie löschbar ist. */
  terminAnzahl: number;
  /** Wie viele Kosmetiker:innen bieten sie an? */
  anbieterAnzahl: number;
}

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liste für die Kundschaft.
   *
   * Nur aktive Leistungen, und nur die Felder, die sie etwas angehen. Der
   * Puffer etwa ist eine interne Planungsgröße — er verlängert den Kalender,
   * nicht die Behandlung, und würde in der App nur verwirren.
   */
  async oeffentlicheListe(): Promise<OeffentlicheLeistung[]> {
    return this.prisma.service.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        durationMinutes: true,
        priceCents: true,
      },
    });
  }

  /** Liste für die Verwaltung, inklusive deaktivierter Leistungen. */
  async verwaltungsListe(): Promise<VerwalteteLeistung[]> {
    const zeilen = await this.prisma.service.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { appointments: true, staff: true } } },
    });

    return zeilen.map((z) => ({
      id: z.id,
      name: z.name,
      description: z.description,
      durationMinutes: z.durationMinutes,
      bufferMinutes: z.bufferMinutes,
      priceCents: z.priceCents,
      isActive: z.isActive,
      sortOrder: z.sortOrder,
      terminAnzahl: z._count.appointments,
      anbieterAnzahl: z._count.staff,
    }));
  }

  async anlegen(dto: LeistungAnlegenDto): Promise<VerwalteteLeistung> {
    const angelegt = await this.prisma.service.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        durationMinutes: dto.durationMinutes,
        bufferMinutes: dto.bufferMinutes ?? 0,
        priceCents: dto.priceCents,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      select: { id: true },
    });

    this.logger.log(`Leistung angelegt: ${dto.name}`);
    return this.einzeln(angelegt.id);
  }

  async aendern(id: string, dto: LeistungAendernDto): Promise<VerwalteteLeistung> {
    await this.mussExistieren(id);

    await this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
        ...(dto.bufferMinutes !== undefined ? { bufferMinutes: dto.bufferMinutes } : {}),
        ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    // Eine Preisänderung wirkt nur auf künftige Buchungen. Bereits gebuchte
    // Termine tragen ihren eigenen Preis (E-09) und bleiben unberührt.
    this.logger.log(`Leistung geändert: ${id}`);
    return this.einzeln(id);
  }

  /**
   * Löschen — aber nur, wenn die Leistung nie gebucht wurde.
   *
   * Eine gebuchte Leistung zu löschen würde die Termingeschichte zerreißen: Auf
   * jedem vergangenen Termin steht, welche Behandlung stattgefunden hat, und das
   * ist Teil der Dokumentation. Deshalb hält auch der Fremdschlüssel dagegen.
   *
   * Der richtige Weg ist **deaktivieren**: Die Leistung verschwindet aus der
   * Buchung, die Historie bleibt lesbar.
   */
  async loeschen(id: string): Promise<void> {
    const vorhanden = await this.prisma.service.findUnique({
      where: { id },
      include: { _count: { select: { appointments: true } } },
    });

    if (vorhanden === null) throw new NotFoundException('Leistung nicht gefunden.');

    if (vorhanden._count.appointments > 0) {
      throw new ConflictException(
        `Diese Leistung wurde bereits ${vorhanden._count.appointments}-mal gebucht und kann ` +
          'nicht gelöscht werden, ohne die Termingeschichte zu zerreißen. ' +
          'Deaktivieren Sie sie stattdessen — dann ist sie nicht mehr buchbar, ' +
          'vergangene Termine bleiben aber nachvollziehbar.',
      );
    }

    try {
      await this.prisma.service.delete({ where: { id } });
      this.logger.log(`Leistung gelöscht: ${id}`);
    } catch (fehler) {
      // Fängt das Rennen ab, falls zwischen Prüfung und Löschen gebucht wurde.
      if (fehler instanceof Prisma.PrismaClientKnownRequestError && fehler.code === 'P2003') {
        throw new ConflictException(
          'Diese Leistung wird inzwischen verwendet und kann nicht gelöscht werden.',
        );
      }
      throw fehler;
    }
  }

  async einzeln(id: string): Promise<VerwalteteLeistung> {
    const alle = await this.verwaltungsListe();
    const treffer = alle.find((l) => l.id === id);
    if (treffer === undefined) throw new NotFoundException('Leistung nicht gefunden.');
    return treffer;
  }

  private async mussExistieren(id: string): Promise<void> {
    const anzahl = await this.prisma.service.count({ where: { id } });
    if (anzahl === 0) throw new NotFoundException('Leistung nicht gefunden.');
  }
}
