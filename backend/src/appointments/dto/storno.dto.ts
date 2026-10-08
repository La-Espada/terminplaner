import { CancellationReason } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

/**
 * Absage.
 *
 * `grund` ist eine **Kategorie, kein Freitext** (E-35). In ein Freitextfeld
 * schreibt das Personal erfahrungsgemaess "Patientin hat Ausschlag" — und damit
 * entstuende ein Gesundheitsdatum in einer Spalte, die weder verschluesselt
 * noch zugriffsprotokolliert ist. Derselbe Grund wie bei TimeOffType (E-12).
 */
export class StornoDto {
  @IsOptional()
  @IsEnum(CancellationReason)
  grund?: CancellationReason;
}

/** Verschieben. Nur die neue Zeit — Leistung und Person bleiben, wie sie sind. */
export class VerschiebenDto {
  @IsISO8601({ strict: true }, { message: 'Die neue Zeit wird als ISO-8601-Zeitpunkt gebraucht.' })
  startsAt!: string;
}
