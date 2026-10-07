import { IsString, Length } from 'class-validator';

/**
 * Einladung einlösen: Token aus der Mail, Passwort frei gewählt.
 *
 * Dieselben Passwortregeln wie überall sonst. Eine lockerere Regel fürs
 * Personal wäre genau verkehrt herum — diese Konten sehen Kundendaten.
 */
export class EinladungEinloesenDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  @IsString()
  @Length(12, 128, { message: 'Das Passwort muss mindestens 12 Zeichen lang sein.' })
  password!: string;
}
