import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Req } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { Person } from '../auth/decorators/person.decorator';
import type { AngemeldetePerson } from '../auth/types';
import { ConsentsService, type ConsentZustand } from './consents.service';
import { EntscheidungDto } from './dto/entscheidung.dto';

@Controller('me/consents')
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  /**
   * Eigener Einwilligungsstand.
   *
   * Immer alle Typen, auch die noch nie entschiedenen — sonst müsste die
   * Oberfläche wissen, welche es gibt, und liefe bei einer Erweiterung aus dem
   * Takt.
   */
  @Get()
  async stand(@Person() person: AngemeldetePerson): Promise<ConsentZustand[]> {
    return this.consents.zustand(person.id);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async entscheiden(
    @Person() person: AngemeldetePerson,
    @Body() dto: EntscheidungDto,
    @Req() anfrage: Request,
  ): Promise<ConsentZustand[]> {
    return this.consents.entscheiden(person.id, dto.typ, dto.erteilen, this.ipHash(anfrage));
  }

  /**
   * IP-Adresse nur als Hash. Sie belegt die Herkunft der Entscheidung, muss
   * dafür aber nicht im Klartext aufbewahrt werden.
   */
  private ipHash(anfrage: Request): string | undefined {
    const ip = anfrage.ip;
    if (typeof ip !== 'string' || ip === '') return undefined;
    return createHash('sha256').update(ip).digest('hex');
  }
}
