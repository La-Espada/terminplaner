import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AngemeldetePerson } from './types';

/**
 * Objektbezogene Rechteprüfung.
 *
 * Der RollenGuard beantwortet „darf diese Rolle hierher". Das genügt nicht:
 * `STAFF` darf auf Termine zugreifen — aber nur auf die **eigenen**. Ein reiner
 * Rollen-Guard erlaubt jeder Kosmetikerin den Zugriff auf jeden fremden Termin,
 * und bei einer Arztpraxis ist das kein Schönheitsfehler.
 *
 * Diese Prüfungen gehören in die Dienste, nicht in Guards: Sie brauchen das
 * Objekt, und das ist erst nach dem Laden bekannt.
 */
@Injectable()
export class ZugriffService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Darf diese Person diesen Termin sehen?
   *
   * - `ADMIN` alles
   * - `STAFF` nur die eigenen Termine
   * - `CUSTOMER` nur die eigenen Buchungen
   *
   * Wirft `NotFoundException`, wenn der Termin nicht existiert **oder** nicht
   * zugänglich ist. Das ist Absicht: Ein 403 auf eine fremde Termin-ID würde
   * verraten, dass es sie gibt — und über durchprobierte IDs ließe sich
   * ermitteln, wann die Praxis ausgelastet ist.
   */
  async darfTerminSehen(person: AngemeldetePerson, terminId: string): Promise<void> {
    if (person.role === 'ADMIN') {
      const existiert = await this.prisma.appointment.count({ where: { id: terminId } });
      if (existiert === 0) throw new NotFoundException('Termin nicht gefunden.');
      return;
    }

    const treffer = await this.prisma.appointment.count({
      where: {
        id: terminId,
        ...(person.role === 'STAFF'
          ? { staffId: person.staffProfileId ?? '' }
          : { customerId: person.id }),
      },
    });

    if (treffer === 0) throw new NotFoundException('Termin nicht gefunden.');
  }

  /**
   * Darf diese Person die Behandlungshistorie dieser Kundin sehen?
   *
   * Hier gelten die strengsten Regeln des Systems — es geht um Art.-9-Daten.
   *
   * - `ADMIN` ja
   * - `STAFF` nur bei tatsächlichem Behandlungsbezug: Es muss mindestens einen
   *   Termin zwischen beiden geben. Ohne diese Prüfung könnte jede
   *   Kosmetikerin die Hautbefunde jeder Kundin lesen.
   * - `CUSTOMER` nur die eigene
   */
  async darfHistorieSehen(person: AngemeldetePerson, kundinId: string): Promise<void> {
    if (person.role === 'ADMIN') return;

    if (person.role === 'CUSTOMER') {
      if (person.id !== kundinId) {
        throw new NotFoundException('Nicht gefunden.');
      }
      return;
    }

    // STAFF: Behandlungsbezug nachweisen.
    const bezug = await this.prisma.appointment.count({
      where: {
        customerId: kundinId,
        staffId: person.staffProfileId ?? '',
        // Auch stornierte Termine begründen einen Bezug — die Behandlung kann
        // stattgefunden haben und später umgebucht worden sein.
      },
    });

    if (bezug === 0) {
      throw new ForbiddenException('Sie haben keinen Behandlungsbezug zu dieser Person.');
    }
  }

  /**
   * Darf diese Person diesen Kalender bearbeiten — Arbeitszeiten, Abwesenheiten?
   *
   * `STAFF` nur den eigenen. Sonst könnte eine Kollegin die Urlaubsplanung einer
   * anderen ändern.
   */
  darfKalenderBearbeiten(person: AngemeldetePerson, staffProfileId: string): void {
    if (person.role === 'ADMIN') return;

    if (person.role !== 'STAFF' || person.staffProfileId !== staffProfileId) {
      throw new ForbiddenException('Sie können nur Ihren eigenen Kalender bearbeiten.');
    }
  }

  /** Darf diese Person dieses Benutzerkonto einsehen oder ändern? */
  darfKontoBearbeiten(person: AngemeldetePerson, userId: string): void {
    if (person.role === 'ADMIN') return;

    if (person.id !== userId) {
      throw new ForbiddenException('Sie können nur Ihr eigenes Konto bearbeiten.');
    }
  }
}
