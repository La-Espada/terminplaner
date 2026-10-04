import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AngemeldetePerson } from '../types';

/**
 * Gibt die angemeldete Person aus der Anfrage.
 *
 * Nur in Endpunkten verwenden, die der JwtAuthGuard schützt — bei einem mit
 * `@Oeffentlich()` markierten ist sie nicht gesetzt.
 */
export const Person = createParamDecorator((_daten: unknown, context: ExecutionContext) => {
  const anfrage = context.switchToHttp().getRequest<Request & { person?: AngemeldetePerson }>();
  return anfrage.person;
});
