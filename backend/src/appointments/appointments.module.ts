import { Module } from '@nestjs/common';
import { VerfuegbarkeitModule } from '../verfuegbarkeit/verfuegbarkeit.module';
import { AppointmentsController } from './appointments.controller';
import { BookingService } from './booking.service';
import { NachbereitungService } from './nachbereitung.service';
import { StornoService } from './storno.service';

@Module({
  // Die Buchung prueft ueber denselben Dienst, der auch die Slot-Liste liefert.
  // Eine zweite Pruefung waere eine zweite Wahrheit, und die beiden liefen mit
  // der Zeit auseinander.
  imports: [VerfuegbarkeitModule],
  controllers: [AppointmentsController],
  providers: [BookingService, StornoService, NachbereitungService],
  exports: [BookingService, StornoService, NachbereitungService],
})
export class AppointmentsModule {}
