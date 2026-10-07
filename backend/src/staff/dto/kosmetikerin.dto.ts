import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * Farbe im Admin-Kalender: `#rrggbb` oder leer.
 *
 * Leer ist ausdrücklich erlaubt — sonst gäbe es keinen Weg, eine einmal
 * vergebene Farbe wieder loszuwerden.
 */
const FARBE = /^(#[0-9a-fA-F]{6})?$/;

const trimmen = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Eine neue Kosmetiker:in anlegen.
 *
 * **Kein Passwortfeld.** Das Konto wird per Einladung übergeben, die eingeladene
 * Person vergibt ihr Passwort selbst. Siehe E-30.
 */
export class KosmetikerinAnlegenDto {
  @IsEmail({}, { message: 'Bitte eine gültige E-Mail-Adresse angeben.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @Transform(trimmen)
  @Length(1, 100)
  firstName!: string;

  @IsString()
  @Transform(trimmen)
  @Length(1, 100)
  lastName!: string;

  @IsOptional()
  @IsString()
  @Transform(trimmen)
  @Length(0, 40)
  phone?: string;

  /**
   * Name, den die Kundschaft bei der Buchung sieht. Leer gelassen wird der
   * Vorname genommen — im Studio stellt man sich mit dem Vornamen vor, und ein
   * Pflichtfeld mehr beim Anlegen hilft hier niemandem.
   */
  @IsOptional()
  @IsString()
  @Transform(trimmen)
  @Length(0, 100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimmen)
  @Length(0, 1000)
  bio?: string;

  @IsOptional()
  @IsString()
  @Matches(FARBE, { message: 'Die Farbe muss im Format #rrggbb angegeben werden.' })
  colorHex?: string;
}

/**
 * Ändern. Alles optional.
 *
 * **Die E-Mail-Adresse fehlt bewusst.** Sie ist die Anmeldung; sie still von
 * außen zu ändern wäre eine Kontoübernahme per Formular. Wer sie wechseln muss,
 * bekommt das später über einen eigenen, bestätigten Weg — bis dahin ist ein
 * neues Konto der ehrlichere Weg.
 */
export class KosmetikerinAendernDto {
  @IsOptional()
  @IsString()
  @Transform(trimmen)
  @Length(1, 100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimmen)
  @Length(1, 100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimmen)
  @Length(0, 40)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(trimmen)
  @Length(1, 100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimmen)
  @Length(0, 1000)
  bio?: string;

  @IsOptional()
  @IsString()
  @Matches(FARBE, { message: 'Die Farbe muss im Format #rrggbb angegeben werden.' })
  colorHex?: string;
}

/** Aktiv oder nicht — als eigener Endpunkt, damit ein Umschalten nie versehentlich passiert. */
export class AktivSetzenDto {
  @IsBoolean()
  isActive!: boolean;
}
