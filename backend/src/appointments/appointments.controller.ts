import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Person } from '../auth/decorators/person.decorator';
import { Rollen } from '../auth/decorators/rollen.decorator';
import type { AngemeldetePerson } from '../auth/types';
import { BookingService, type Buchung } from './booking.service';
import { BuchungDto } from './dto/buchung.dto';

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
  constructor(private readonly buchung: BookingService) {}

  @Rollen('CUSTOMER')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async buchen(@Person() person: AngemeldetePerson, @Body() dto: BuchungDto): Promise<Buchung> {
    // Die Kundin kommt aus der Sitzung, nicht aus dem Rumpf. Sonst koennte
    // jede angemeldete Person Termine auf fremde Namen buchen.
    return this.buchung.buchen(person.id, dto);
  }
}
