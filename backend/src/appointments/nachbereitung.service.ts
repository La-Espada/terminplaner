import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nachbereitung vergangener Termine (Schritt 24).
 *
 * Ein bestätigter Termin, dessen Ende vorbei ist, hat stattgefunden — solange
 * niemand etwas anderes sagt. Dieser Job schreibt das fest, damit die
 * Terminliste einer Kundin nicht auf ewig „bestätigt" anzeigt und die
 * Auslastungsstatistik in Schritt 48 etwas zu zählen hat.
 *
 * **Was er bewusst nicht tut:**
 *
 * - `NO_SHOW` setzen. Dass jemand nicht erschienen ist, weiss nur ein Mensch.
 *   Ein Job, der das aus der Zeit ableitet, erzeugt Vorwürfe gegen Kundinnen,
 *   die vielleicht angerufen haben.
 * - `PENDING` anfassen. Ein Termin, den niemand bestätigt hat, hat auch nicht
 *   stattgefunden. Ihn auf `COMPLETED` zu setzen wäre eine Behauptung; ihn
 *   abzusagen wäre eine Entscheidung. Beides gehört dem Studio, nicht einem
 *   nächtlichen Job. Dass solche Termine liegen bleiben, ist mit
 *   `AUTO_CONFIRM_BOOKINGS=true` kein praktisches Problem — wird das umgestellt,
 *   braucht es dafür eine Oberfläche, nicht hier eine Regel.
 */
@Injectable()
export class NachbereitungService {
  private readonly logger = new Logger(NachbereitungService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nachts um drei, in der Zeitzone des Studios.
   *
   * Die Uhrzeit ist nicht beliebig: Um 03:00 ist das Studio sicher zu, und der
   * Job kollidiert nicht mit einer Behandlung, die bis 20:00 ging. Dass der
   * Zeitpunkt zweimal im Jahr nicht existiert beziehungsweise doppelt
   * vorkommt, ist hier folgenlos — der Job ist mehrfach ausführbar, ohne
   * Schaden anzurichten.
   *
   * Die Zone steht als Zeichenkette im Decorator und nicht aus der
   * Konfiguration: Decorators werden beim Laden der Klasse ausgewertet, lange
   * bevor es einen ConfigService gibt. Weicht `STUDIO_TIMEZONE` je davon ab,
   * läuft der Job zur falschen Stunde — was hier niemandem wehtut, aber beim
   * Erinnerungsjob in Schritt 35 sehr wohl. Dort ist der Zeitplan deshalb zur
   * Laufzeit zu setzen.
   */
  @Cron('0 3 * * *', { name: 'nachbereitung', timeZone: 'Europe/Vienna' })
  async naechtlich(): Promise<void> {
    const anzahl = await this.nachbereiten();
    this.logger.log(`Nachbereitung: ${anzahl} Termine auf COMPLETED gesetzt`);
  }

  /**
   * Setzt vergangene bestätigte Termine auf abgeschlossen.
   *
   * `jetzt` ist ein Parameter, damit sich der Job prüfen lässt, ohne auf drei
   * Uhr nachts zu warten. Gibt zurück, wie viele Zeilen betroffen waren.
   *
   * Mehrfaches Ausführen ändert nichts: Beim zweiten Lauf ist keiner der
   * Termine mehr `CONFIRMED`, die Bedingung trifft also auf keinen zu.
   */
  async nachbereiten(jetzt: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.appointment.updateMany({
      where: {
        status: AppointmentStatus.CONFIRMED,
        // Das **Ende** muss vorbei sein, nicht der Beginn. Sonst gälte eine
        // Behandlung als abgeschlossen, während die Kundin noch auf dem Stuhl
        // sitzt — und ein Storno wäre mitten in der Behandlung nicht mehr
        // möglich.
        endsAt: { lt: jetzt },
      },
      data: { status: AppointmentStatus.COMPLETED },
    });

    return count;
  }
}
