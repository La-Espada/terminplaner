import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Oeffentlich } from '../auth/decorators/oeffentlich.decorator';
import { VerfuegbarkeitService, type Slot } from './verfuegbarkeit.service';

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Freie Termine.
 *
 * Oeffentlich wie Leistungen und Team: Die Kundschaft soll sehen koennen, ob
 * ueberhaupt etwas frei ist, bevor sie ein Konto anlegt. Preisgegeben wird
 * dabei nur, wann jemand **nicht** arbeitet — und das steht ohnehin an der Tuer.
 * Wer wann einen Termin hat, geht aus der Antwort nicht hervor: Eine belegte
 * Zeit ist von einer Abwesenheit nicht zu unterscheiden.
 */
@Controller('availability')
export class VerfuegbarkeitController {
  constructor(private readonly verfuegbarkeit: VerfuegbarkeitService) {}

  @Oeffentlich()
  @Get()
  async slots(
    @Query('serviceId') serviceId: string,
    @Query('from') von: string,
    @Query('to') bis: string,
    @Query('staffId') staffId?: string,
  ): Promise<Slot[]> {
    if (!UUID.test(serviceId ?? '')) {
      throw new BadRequestException('serviceId wird gebraucht.');
    }
    if (staffId !== undefined && staffId !== '' && !UUID.test(staffId)) {
      throw new BadRequestException('staffId ist keine gueltige Kennung.');
    }
    if (!DATUM.test(von ?? '') || !DATUM.test(bis ?? '')) {
      throw new BadRequestException('from und to werden als JJJJ-MM-TT gebraucht.');
    }

    return this.verfuegbarkeit.slots({
      serviceId,
      staffId: staffId === '' ? undefined : staffId,
      von,
      bis,
    });
  }
}
