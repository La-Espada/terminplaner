import { Module } from '@nestjs/common';
import { AbwesenheitenController, ArbeitszeitenController } from './arbeitszeiten.controller';
import { ArbeitszeitenService } from './arbeitszeiten.service';

@Module({
  controllers: [ArbeitszeitenController, AbwesenheitenController],
  providers: [ArbeitszeitenService],
  exports: [ArbeitszeitenService],
})
export class ArbeitszeitenModule {}
