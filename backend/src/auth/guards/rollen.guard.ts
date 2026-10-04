import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { ERLAUBTE_ROLLEN } from '../decorators/rollen.decorator';
import type { AngemeldetePerson } from '../types';

/**
 * Prüft die Rolle. Läuft nach dem JwtAuthGuard, verlässt sich also darauf, dass
 * die Person schon an der Anfrage hängt.
 *
 * Wichtig: Das ist nur die **grobe** Stufe. Sie beantwortet „darf diese Rolle
 * überhaupt hierher", nicht „darf diese Person auf *dieses* Objekt zugreifen".
 * Die zweite Frage klärt der ZugriffService.
 */
@Injectable()
export class RollenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const erlaubt = this.reflector.getAllAndOverride<UserRole[] | undefined>(ERLAUBTE_ROLLEN, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Ohne @Rollen() gilt: angemeldet genügt.
    if (erlaubt === undefined || erlaubt.length === 0) return true;

    const anfrage = context.switchToHttp().getRequest<Request & { person?: AngemeldetePerson }>();
    const person = anfrage.person;

    if (person === undefined) return false;

    if (!erlaubt.includes(person.role)) {
      // Bewusst 403 und nicht 404: Wer angemeldet ist, darf erfahren, dass es
      // den Endpunkt gibt — nur nicht für ihn.
      throw new ForbiddenException('Für diese Aktion fehlen Ihnen die Rechte.');
    }

    return true;
  }
}
