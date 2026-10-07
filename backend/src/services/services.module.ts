import { Module } from '@nestjs/common';
import { ServicesController, ServicesVerwaltungController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  controllers: [ServicesController, ServicesVerwaltungController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
