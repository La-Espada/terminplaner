import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Person } from '../auth/decorators/person.decorator';
import { Rollen } from '../auth/decorators/rollen.decorator';
import type { AngemeldetePerson } from '../auth/types';
import { BookingService, type Buchung } from './booking.service';
import { BuchungDto } from './dto/buchung.dto';
import { StornoDto, VerschiebenDto } from './dto/storno.dto';
import { StornoService } from './storno.service';

/**
 * Termine buchen.
 *
 * Vorerst nur fuer Kundinnen und nur fuer sich selbst. Dass die Studioleitung
 * im Namen einer Kundin bucht \u2014 der haeufigste Fall am Telefon \u2014 kommt in
 * Schritt 26 mit dem Kalender. Bis dahin waere ein Endpunkt dafuer ohne
 * Oberflaeche nur Angriffsflaeche.
 */
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly buchung: BookingService,
    private readonly storno: StornoService,
  ) {}

  @Rollen('CUSTOMER')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async buchen(@Person() person: AngemeldetePerson, @Body() dto: BuchungDto): Promise<Buchung> {
    // Die Kundin kommt aus der Sitzung, nicht aus dem Rumpf. Sonst koennte
    // jede angemeldete Person Termine auf fremde Namen buchen.
    return this.buchung.buchen(person.id, dto);
  }

  /**
   * Absagen.
   *
   * Offen fuer alle drei Rollen, aber mit verschiedenen Regeln: Die Kundin nur
   * bis zur Frist und ohne Grund, das Studio jederzeit und mit Pflichtgrund.
   * Welche Regel gilt, entscheidet der Dienst anhand der Rolle — nicht der
   * Aufrufer.
   *
   * POST und nicht DELETE: Eine Absage loescht nichts. Der Termin bleibt
   * stehen, er bekommt einen anderen Status (E-15).
   */
  @Post(':id/storno')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stornieren(
    @Person() person: AngemeldetePerson,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StornoDto,
  ): Promise<void> {
    await this.storno.stornieren(person, id, dto);
  }

  @Post(':id/verschieben')
  async verschieben(
    @Person() person: AngemeldetePerson,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerschiebenDto,
  ): Promise<{ startsAt: string; endsAt: string }> {
    return this.storno.verschieben(person, id, dto.startsAt);
  }
}
