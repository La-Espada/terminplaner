import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * Anlegen einer Dienstleistung.
 *
 * Preise kommen als **ganzzahlige Cent**, nicht als Kommazahl (E-08). Die
 * Oberfläche rechnet um; die API nimmt nichts entgegen, was gerundet werden
 * müsste.
 */
export class LeistungAnlegenDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(0, 2000)
  description?: string;

  /** Behandlungsdauer. Mehr als ein Arbeitstag ergibt keinen Sinn. */
  @IsInt()
  @Min(5)
  @Max(600)
  durationMinutes!: number;

  /**
   * Aufräumzeit **nach** der Behandlung. Blockiert den Kalender, ist aber kein
   * Termin — die Kundin bucht sie nicht mit.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferMinutes?: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

/** Ändern. Alle Felder optional, aber mindestens eines muss dabei sein. */
export class LeistungAendernDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
