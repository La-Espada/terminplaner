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
  Put,
  Query,
} from '@nestjs/common';
import { Rollen } from '../auth/decorators/rollen.decorator';
import { AbwesenheitDto, WochenplanDto } from './dto/arbeitszeit.dto';
import {
  ArbeitszeitenService,
  type Abwesenheit,
  type Arbeitsspanne,
} from './arbeitszeiten.service';

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Regelarbeitszeiten je Kosmetiker:in.
 *
 * Nur die Studioleitung. Wann jemand arbeitet, ist eine Dienstplanfrage — sie
 * zu beantworten gehört dem Betrieb, nicht der einzelnen Behandlerin. Dass eine
 * Kosmetiker:in ihre eigenen Zeiten wenigstens **sehen** können sollte, ist
 * richtig und kommt mit dem Kalender in Schritt 25; bis dahin gibt es dafür
 * keine Oberfläche, und ein Endpunkt ohne Oberfläche ist nur Angriffsfläche.
 */
@Rollen('ADMIN')
@Controller('admin/arbeitszeiten')
export class ArbeitszeitenController {
  constructor(private readonly zeiten: ArbeitszeitenService) {}

  @Get(':staffId')
  async wochenplan(@Param('staffId', ParseUUIDPipe) staffId: string): Promise<Arbeitsspanne[]> {
    return this.zeiten.wochenplan(staffId);
  }

  @Put(':staffId')
  async setzen(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: WochenplanDto,
  ): Promise<Arbeitsspanne[]> {
    return this.zeiten.wochenplanSetzen(staffId, dto);
  }
}

/** Abwesenheiten: einmalig, mit konkretem Datum. Studioweit bei `staffId = null`. */
@Rollen('ADMIN')
@Controller('admin/abwesenheiten')
export class AbwesenheitenController {
  constructor(private readonly zeiten: ArbeitszeitenService) {}

  @Get()
  async liste(
    @Query('von') von: string,
    @Query('bis') bis: string,
    @Query('staffId') staffId?: string,
  ): Promise<Abwesenheit[]> {
    // Der Zeitraum ist Pflicht. Ohne Grenzen lieferte die Abfrage mit den
    // Jahren immer mehr und würde irgendwann still langsam — ein Fehler, der
    // sich erst im Betrieb zeigt und dann schwer zuzuordnen ist.
    if (!DATUM.test(von ?? '') || !DATUM.test(bis ?? '')) {
      throw new BadRequestException('von und bis werden als JJJJ-MM-TT gebraucht.');
    }
    if (von > bis) {
      throw new BadRequestException('bis darf nicht vor von liegen.');
    }

    return this.zeiten.abwesenheiten(von, bis, staffId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async anlegen(@Body() dto: AbwesenheitDto): Promise<Abwesenheit> {
    return this.zeiten.abwesenheitAnlegen(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async loeschen(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.zeiten.abwesenheitLoeschen(id);
  }
}
