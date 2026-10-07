import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { Oeffentlich } from '../auth/decorators/oeffentlich.decorator';
import { Rollen } from '../auth/decorators/rollen.decorator';
import { ZuordnungService, type AnbieterIn, type ZuordnungsMatrix } from './zuordnung.service';

/**
 * Wer bietet was an — für die Kundschaft.
 *
 * Öffentlich wie Leistungen und Team: Die Auswahl in der App muss sichtbar
 * sein, bevor sich jemand anmeldet.
 */
@Controller('services')
export class AnbieterController {
  constructor(private readonly zuordnung: ZuordnungService) {}

  @Oeffentlich()
  @Get(':serviceId/staff')
  async anbieter(@Param('serviceId', ParseUUIDPipe) serviceId: string): Promise<AnbieterIn[]> {
    return this.zuordnung.anbieterFuer(serviceId);
  }
}

/**
 * Leistungszuordnung. Nur die Studioleitung.
 *
 * Wer welche Behandlung anbietet, ist eine Frage von Ausbildung und
 * Betriebsorganisation — keine, die die Behandlerin für sich selbst beantwortet.
 */
@Rollen('ADMIN')
@Controller('admin/zuordnung')
export class ZuordnungVerwaltungController {
  constructor(private readonly zuordnung: ZuordnungService) {}

  @Get()
  async matrix(): Promise<ZuordnungsMatrix> {
    return this.zuordnung.matrix();
  }

  /**
   * PUT, nicht POST: Das Ergebnis ist derselbe Zustand, egal wie oft man es
   * schickt. Genau das sagt PUT zu.
   */
  @Put(':staffId/:serviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async zuordnen(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ): Promise<void> {
    await this.zuordnung.zuordnen(staffId, serviceId);
  }

  /**
   * Die Bestaetigung steckt im Query-Parameter `bestaetigt=true`.
   *
   * Alles andere gilt als "nein" — auch ein Tippfehler. Das ist nicht nur
   * bequem, sondern die sichere Richtung: Eine Bestaetigung, die niemand
   * gegeben hat, ist keine, und ohne sie wird abgelehnt, solange Termine daran
   * haengen.
   *
   * Ein eigener Pipe, der einen Tippfehler laut abweist, waere hier wirkungslos:
   * Die globale ValidationPipe wandelt einen Query-Parameter mit Zieltyp
   * `boolean` bereits um (`value === true || value === 'true'`), bevor ein
   * Parameter-Pipe ihn sieht. Aus `?bestaetigt=ja` wird also `false`, und zwar
   * eine Ebene zu frueh zum Eingreifen.
   */
  @Delete(':staffId/:serviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async entziehen(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Query('bestaetigt') bestaetigt?: boolean,
  ): Promise<void> {
    await this.zuordnung.entziehen(staffId, serviceId, bestaetigt === true);
  }
}
