import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Oeffentlich } from '../auth/decorators/oeffentlich.decorator';
import { Rollen } from '../auth/decorators/rollen.decorator';
import {
  AktivSetzenDto,
  KosmetikerinAendernDto,
  KosmetikerinAnlegenDto,
} from './dto/kosmetikerin.dto';
import { StaffService, type Kosmetikerin, type OeffentlicheKosmetikerin } from './staff.service';

/**
 * Das Team für die Kundschaft.
 *
 * Öffentlich wie die Leistungen: Wer sehen will, bei wem er buchen kann, soll
 * dafür kein Konto brauchen. Geliefert wird nur, was ohnehin im Studio aushängt —
 * Anzeigename, Vorstellungstext, Farbe. Keine Adresse, keine Telefonnummer,
 * kein Nachname.
 */
@Controller('staff')
export class StaffOeffentlichController {
  constructor(private readonly team: StaffService) {}

  @Oeffentlich()
  @Get()
  async liste(): Promise<OeffentlicheKosmetikerin[]> {
    return this.team.oeffentlicheListe();
  }
}

/**
 * Teamverwaltung. Nur die Studioleitung.
 *
 * Kosmetiker:innen können hier nichts sehen und nichts ändern — wer im Team ist
 * und wer nicht, entscheidet der Betrieb.
 */
@Rollen('ADMIN')
@Controller('admin/staff')
export class StaffVerwaltungController {
  constructor(private readonly team: StaffService) {}

  @Get()
  async liste(): Promise<Kosmetikerin[]> {
    return this.team.liste();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async anlegen(@Body() dto: KosmetikerinAnlegenDto): Promise<Kosmetikerin> {
    return this.team.anlegen(dto);
  }

  @Patch(':id')
  async aendern(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KosmetikerinAendernDto,
  ): Promise<Kosmetikerin> {
    return this.team.aendern(id, dto);
  }

  @Patch(':id/aktiv')
  async aktivSetzen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AktivSetzenDto,
  ): Promise<Kosmetikerin> {
    return this.team.aktivSetzen(id, dto.isActive);
  }

  /**
   * Einladung erneut verschicken.
   *
   * Braucht es öfter, als man denkt: Die erste Mail landet im Spam, der Link
   * läuft über den Urlaub ab, die Adresse war von Anfang an vertippt. Die alte
   * Einladung wird dabei entwertet.
   */
  @Post(':id/einladung')
  @HttpCode(HttpStatus.ACCEPTED)
  async einladungErneut(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    await this.team.einladungVersenden(id);
    return { message: 'Die Einladung wurde erneut verschickt.' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async loeschen(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.team.loeschen(id);
  }
}
