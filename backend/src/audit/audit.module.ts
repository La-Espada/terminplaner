import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global, weil praktisch jeder spaetere Dienst protokollieren wird — Termine,
 * Behandlungsnotizen, DSGVO-Vorgaenge. Ihn ueberall einzeln zu importieren
 * waere Zeremonie ohne Gewinn.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
