import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Person } from '../auth/decorators/person.decorator';
import { Rollen } from '../auth/decorators/rollen.decorator';
import type { AngemeldetePerson } from '../auth/types';
import { BookingService, type Buchung } from './booking.service';
import { AdminBuchungDto } from './dto/admin-buchung.dto';
import { KalenderService, type Kalenderblatt } from './kalender.service';
import { KundensucheService, type Kundentreffer } from './kundensuche.service';
import { StornoService } from './storno.service';

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Der Kalender des Studios.
 *
 * Fuer Studioleitung und Kosmetiker:innen \u2014 Kundinnen haben hier nichts
 * verloren, sie sehen ihre eigenen Termine ueber einen eigenen Weg. Welche
 * Termine eine Kosmetiker:in bekommt, entscheidet der Dienst anhand der Rolle,
 * nicht der Aufrufer.
 */
@Rollen('ADMIN', 'STAFF')
@Controller('admin/kalender')
export class KalenderController {
  constructor(
    private readonly kalender: KalenderService,
    private readonly buchung: BookingService,
    private readonly storno: StornoService,
    private readonly kundensuche: KundensucheService,
  ) {}

  @Get()
  async blatt(
    @Person() person: AngemeldetePerson,
    @Query('von') von: string,
    @Query('bis') bis: string,
    @Query('staffId') staffId?: string,
  ): Promise<Kalenderblatt> {
    if (!DATUM.test(von ?? '') || !DATUM.test(bis ?? '')) {
      throw new BadRequestException('von und bis werden als JJJJ-MM-TT gebraucht.');
    }
    if (staffId !== undefined && staffId !== '' && !UUID.test(staffId)) {
      throw new BadRequestException('staffId ist keine gueltige Kennung.');
    }

    return this.kalender.blatt(person, von, bis, staffId === '' ? undefined : staffId);
  }

  /**
   * Kundensuche fuer die Buchung am Telefon.
   *
   * Nur Suche, keine Liste — eine durchblaetterbare Kundenliste waere ein
   * Verzeichnis aller Patientinnen der Praxis.
   */
  @Get('kundensuche')
  async kundinnenSuchen(@Query('q') suchtext: string): Promise<Kundentreffer[]> {
    return this.kundensuche.suchen(suchtext ?? '');
  }

  /**
   * Termin im Namen einer Kundin anlegen.
   *
   * Nur die Studioleitung: Wer am Telefon bucht, entscheidet ueber die
   * Auslastung des ganzen Hauses, nicht nur ueber den eigenen Kalender.
   */
  @Rollen('ADMIN')
  @Post('termine')
  @HttpCode(HttpStatus.CREATED)
  async buchenFuer(
    @Person() person: AngemeldetePerson,
    @Body() dto: AdminBuchungDto,
  ): Promise<Buchung> {
    return this.buchung.buchenFuer(person.id, dto.customerId, {
      serviceId: dto.serviceId,
      staffId: dto.staffId,
      startsAt: dto.startsAt,
    });
  }

  @Post('termine/:id/nicht-erschienen')
  @HttpCode(HttpStatus.NO_CONTENT)
  async nichtErschienen(
    @Person() person: AngemeldetePerson,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.storno.nichtErschienen(person, id);
  }

  @Delete('termine/:id/nicht-erschienen')
  @HttpCode(HttpStatus.NO_CONTENT)
  async vermerkZurueck(
    @Person() person: AngemeldetePerson,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.storno.zurueckNehmen(person, id);
  }
}
