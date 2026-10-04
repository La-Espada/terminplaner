import { IsString, Length } from 'class-validator';

export class PasswortZuruecksetzenDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  /**
   * Dieselben Regeln wie bei der Registrierung: mindestens 12 Zeichen, keine
   * Vorschrift zu Sonderzeichen. Eine abweichende Regel hier wäre eine
   * Einladung, beim Zurücksetzen ein schwächeres Passwort zu vergeben.
   */
  @IsString()
  @Length(12, 128, { message: 'Das Passwort muss mindestens 12 Zeichen lang sein.' })
  password!: string;
}
