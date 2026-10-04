import { Transform } from 'class-transformer';
import { IsEmail, Length } from 'class-validator';

export class PasswortVergessenDto {
  @IsEmail({}, { message: 'Bitte eine gültige E-Mail-Adresse angeben.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(5, 254)
  email!: string;
}
