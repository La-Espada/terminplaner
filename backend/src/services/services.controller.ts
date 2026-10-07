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
import { LeistungAendernDto, LeistungAnlegenDto } from './dto/leistung.dto';
import {
  ServicesService,
  type OeffentlicheLeistung,
  type VerwalteteLeistung,
} from './services.service';

/**
 * Leistungen für die Kundschaft.
 *
 * Öffentlich, weil die App die Auswahl zeigen muss, bevor sich jemand anmeldet —
 * wer wissen will, was angeboten wird, soll dafür kein Konto brauchen. Geliefert
 * werden nur aktive Leistungen und nur die Felder, die Kundinnen etwas angehen.
 */
@Controller('services')
export class ServicesController {
  constructor(private readonly leistungen: ServicesService) {}

  @Oeffentlich()
  @Get()
  async liste(): Promise<OeffentlicheLeistung[]> {
    return this.leistungen.oeffentlicheListe();
  }
}

/**
 * Leistungsverwaltung. Nur die Studioleitung.
 *
 * Kosmetiker:innen sehen hier bewusst nichts: Preise und Dauern festzulegen ist
 * eine Entscheidung des Betriebs, nicht der einzelnen Behandlerin.
 */
@Rollen('ADMIN')
@Controller('admin/services')
export class ServicesVerwaltungController {
  constructor(private readonly leistungen: ServicesService) {}

  @Get()
  async liste(): Promise<VerwalteteLeistung[]> {
    return this.leistungen.verwaltungsListe();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async anlegen(@Body() dto: LeistungAnlegenDto): Promise<VerwalteteLeistung> {
    return this.leistungen.anlegen(dto);
  }

  @Patch(':id')
  async aendern(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeistungAendernDto,
  ): Promise<VerwalteteLeistung> {
    return this.leistungen.aendern(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async loeschen(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.leistungen.loeschen(id);
  }
}
