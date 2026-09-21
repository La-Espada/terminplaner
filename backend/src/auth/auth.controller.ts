import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

interface Quittung {
  message: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Registrierung.
   *
   * Antwortet immer mit 202 und derselben Nachricht — auch wenn die Adresse
   * bereits vergeben ist. Der Endpunkt darf nicht verraten, wer hier Kundin ist.
   */
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() dto: RegisterDto): Promise<Quittung> {
    await this.auth.register(dto);
    return {
      message:
        'Wenn die Adresse verwendet werden kann, haben wir eine E-Mail zur Bestätigung geschickt.',
    };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<Quittung> {
    await this.auth.verifyEmail(dto.token);
    return { message: 'E-Mail-Adresse bestätigt.' };
  }
}
