import { IsISO8601, IsUUID } from 'class-validator';

/** Buchung durch das Studio im Namen einer Kundin. */
export class AdminBuchungDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  serviceId!: string;

  @IsUUID()
  staffId!: string;

  @IsISO8601({ strict: true }, { message: 'Der Beginn wird als ISO-8601-Zeitpunkt gebraucht.' })
  startsAt!: string;
}
