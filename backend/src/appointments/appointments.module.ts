import { Module } from '@nestjs/common';
import { VerfuegbarkeitModule } from '../verfuegbarkeit/verfuegbarkeit.module';
import { AppointmentsController } from './appointments.controller';
import { KalenderController } from './kalender.controller';
import { KalenderService } from './kalender.service';
import { KundensucheService } from './kundensuche.service';
import { BookingService } from './booking.service';
import { NachbereitungService } from './nachbereitung.service';
import { StornoService } from './storno.service';

@Module({
  // Die Buchung prueft ueber denselben Dienst, der auch die Slot-Liste liefert.
  // Eine zweite Pruefung waere eine zweite Wahrheit, und die beiden liefen mit
  // der Zeit auseinander.
  imports: [VerfuegbarkeitModule],
  controllers: [AppointmentsController, KalenderController],
  providers: [
    BookingService,
    StornoService,
    NachbereitungService,
    KalenderService,
    KundensucheService,
  ],
  exports: [BookingService, StornoService, NachbereitungService, KalenderService],
})
export class AppointmentsModule {}
