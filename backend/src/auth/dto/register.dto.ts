import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * Registrierung einer Kundin oder eines Kunden.
 *
 * Datenminimierung nach Art. 5 Abs. 1 lit. c: Pflicht sind nur E-Mail, Passwort,
 * Vorname und Nachname. Telefonnummer optional. Kein Geburtsdatum, keine Adresse,
 * kein Geschlecht — solange dafür kein konkreter Zweck besteht.
 *
 * Die Rolle wird **nicht** entgegengenommen. Wer sich registriert, wird CUSTOMER.
 * Personal legt der Admin an. Sonst könnte sich jemand per manipulierter Anfrage
 * selbst zum Administrator machen.
 */
export class RegisterDto {
  @IsEmail({}, { message: 'Bitte eine gültige E-Mail-Adresse angeben.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(5, 254)
  email!: string;

  /**
   * Mindestens 12 Zeichen. Bewusst keine Vorschrift zu Sonderzeichen oder
   * Ziffern — solche Regeln führen erfahrungsgemäß zu „Sommer2024!" und sind
   * schwächer als eine lange Passphrase. Das entspricht der aktuellen
   * Empfehlung von BSI und NIST.
   */
  @IsString()
  @Length(12, 128, { message: 'Das Passwort muss mindestens 12 Zeichen lang sein.' })
  password!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100)
  firstName!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100)
  lastName!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^[+0-9 ()/-]{6,32}$/, { message: 'Die Telefonnummer enthält ungültige Zeichen.' })
  phone?: string;

  /**
   * Einwilligungen. Beide sind Pflicht und dürfen im UI nicht vorangekreuzt sein
   * (Art. 7 Abs. 2). Sie werden mit Version und Zeitstempel protokolliert.
   */
  @IsBoolean()
  acceptedTerms!: boolean;

  @IsBoolean()
  acceptedPrivacy!: boolean;

  /** Freiwillig, jederzeit widerrufbar. */
  @IsOptional()
  @IsBoolean()
  acceptedMarketing?: boolean;
}
