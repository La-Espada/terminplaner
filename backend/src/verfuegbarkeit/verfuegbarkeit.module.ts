import { Module } from '@nestjs/common';
import { VerfuegbarkeitController } from './verfuegbarkeit.controller';
import { VerfuegbarkeitService } from './verfuegbarkeit.service';

@Module({
  controllers: [VerfuegbarkeitController],
  providers: [VerfuegbarkeitService],
  exports: [VerfuegbarkeitService],
})
export class VerfuegbarkeitModule {}
