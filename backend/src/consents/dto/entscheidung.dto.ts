import { ConsentType } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';

export class EntscheidungDto {
  @IsEnum(ConsentType, { message: 'Unbekannter Einwilligungstyp.' })
  typ!: ConsentType;

  @IsBoolean()
  erteilen!: boolean;
}
