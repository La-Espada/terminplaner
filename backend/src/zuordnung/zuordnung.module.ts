import { Module } from '@nestjs/common';
import { AnbieterController, ZuordnungVerwaltungController } from './zuordnung.controller';
import { ZuordnungService } from './zuordnung.service';

@Module({
  controllers: [AnbieterController, ZuordnungVerwaltungController],
  providers: [ZuordnungService],
  exports: [ZuordnungService],
})
export class ZuordnungModule {}
