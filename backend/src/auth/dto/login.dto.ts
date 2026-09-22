import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Bitte eine gültige E-Mail-Adresse angeben.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
