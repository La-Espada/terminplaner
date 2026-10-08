import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Was protokolliert wird. Als Konstanten, damit keine Tippfehler in die
 * Auswertung wandern — `APPOINTMENT_CANCELED` und `APPOINTMENT_CANCELLED`
 * wären zwei verschiedene Aktionen und beide sähen richtig aus.
 */
export const AuditAktion = {
  TERMIN_GEBUCHT: 'APPOINTMENT_CREATED',
  TERMIN_STORNIERT: 'APPOINTMENT_CANCELLED',
  TERMIN_VERSCHOBEN: 'APPOINTMENT_RESCHEDULED',
  TERMIN_NICHT_ERSCHIENEN: 'APPOINTMENT_NO_SHOW',
} as const;

export type AuditAktion = (typeof AuditAktion)[keyof typeof AuditAktion];

export interface AuditEintrag {
  /** Wer gehandelt hat. `null` nur bei Systemvorgängen. */
  actorUserId: string | null;
  action: AuditAktion;
  entityType: string;
  entityId: string;
  /**
   * **Nur Verweise.** IDs, Feldnamen, Statuswerte, Zeitpunkte — niemals
   * Inhalte. Ein Absagegrund im Klartext hätte hier nichts verloren, auch
   * wenn es verlockend wäre: Das Protokoll wird länger aufbewahrt als die
   * Daten, auf die es verweist, und es ist weder verschlüsselt noch an eine
   * Einwilligung gebunden.
   */
  metadata?: Record<string, string | number | boolean | null>;
  /** Markiert Lesezugriffe auf Gesundheitsdaten. Ab Stufe 9 relevant. */
  isArt9Access?: boolean;
  /** Rohe IP. Wird gehasht gespeichert, nie im Klartext.  */
  ip?: string | null;
}

/**
 * Das Zugriffsprotokoll.
 *
 * Zwei Dinge, die hier anders sind als bei gewöhnlichem Logging:
 *
 * **Es darf nie die eigentliche Handlung verhindern.** Lässt sich der Eintrag
 * nicht schreiben, wird das laut geloggt, aber die Stornierung geht trotzdem
 * durch. Die Gegenvariante — Protokoll scheitert, also Vorgang scheitert —
 * klingt strenger, führt aber dazu, dass eine volle Festplatte den Betrieb
 * anhält. Für die Rechenschaftspflicht nach Art. 5 Abs. 2 ist eine Lücke im
 * Protokoll der kleinere Schaden als ein Studio, das nicht mehr arbeiten kann.
 * Der Fehler wird deshalb als `error` geloggt und fällt dort auf.
 *
 * **Die IP wird gehasht.** Sie dient dazu, auffällige Muster zu erkennen, nicht
 * dazu, eine Person zu verorten. Für den Vergleich zweier Einträge reicht der
 * Hash; eine Rückrechnung ist nicht vorgesehen.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async protokolliere(eintrag: AuditEintrag): Promise<void> {
    try {
      await this.prisma.auditLogEntry.create({
        data: {
          actorUserId: eintrag.actorUserId,
          action: eintrag.action,
          entityType: eintrag.entityType,
          entityId: eintrag.entityId,
          metadata: eintrag.metadata ?? undefined,
          isArt9Access: eintrag.isArt9Access ?? false,
          ipHash: eintrag.ip != null && eintrag.ip !== '' ? hashIp(eintrag.ip) : null,
        },
      });
    } catch (fehler) {
      this.logger.error(
        `Protokolleintrag ${eintrag.action} konnte nicht geschrieben werden`,
        fehler instanceof Error ? fehler.stack : undefined,
      );
    }
  }
}

/**
 * SHA-256 über die IP.
 *
 * Ohne Salz, bewusst: Der Zweck ist, zwei Einträge als „von derselben Stelle"
 * erkennbar zu machen, und ein Salz je Eintrag machte genau das unmöglich. Der
 * IPv4-Raum ist klein genug, dass ein Hash allein keine starke Anonymisierung
 * ist — er ist eine Pseudonymisierung, und als solche ist er hier gemeint.
 */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}
