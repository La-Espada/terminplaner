import { Prisma } from '@prisma/client';

/** Name des Exclusion-Constraints aus der Migration `appointment_overlap_constraint`. */
const UEBERSCHNEIDUNG = 'appointments_no_overlap';

/** SQLSTATE fuer `exclusion_violation`. */
const SQLSTATE_UEBERSCHNEIDUNG = '23P01';

/**
 * Erkennt die Verletzung des Ueberschneidungsschutzes.
 *
 * Prisma kennt keinen eigenen Fehlercode fuer Exclusion-Constraints — sie sind
 * ihm fremd, die Migration ist von Hand geschrieben. Geprueft wird deshalb auf
 * den SQLSTATE und, falls der nicht durchgereicht wird, auf den Namen des
 * Constraints. Beides zusammen, weil je nach Treiberversion eine der beiden
 * Quellen fehlen kann.
 *
 * Steht hier und nicht im Buchungsdienst, weil Buchen und Verschieben beide
 * darauf stossen koennen — und zwei Kopien dieser Erkennung wuerden
 * auseinanderlaufen.
 */
export function istUeberschneidung(fehler: unknown): boolean {
  if (fehler instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = JSON.stringify(fehler.meta ?? {});
    if (meta.includes(UEBERSCHNEIDUNG) || meta.includes(SQLSTATE_UEBERSCHNEIDUNG)) return true;
  }

  if (fehler instanceof Error) {
    return (
      fehler.message.includes(UEBERSCHNEIDUNG) || fehler.message.includes(SQLSTATE_UEBERSCHNEIDUNG)
    );
  }

  return false;
}
