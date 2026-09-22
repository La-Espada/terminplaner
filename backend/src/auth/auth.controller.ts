import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { TokenService } from './token.service';

interface Quittung {
  message: string;
}

interface AnmeldeAntwort {
  accessToken: string;
  expiresIn: number;
  /**
   * Nur für Clients ohne Cookie-Verwaltung, also die Mobile-App. Das Admin-Web
   * ignoriert dieses Feld und nutzt das httpOnly-Cookie.
   */
  refreshToken: string;
}

/** Name des Cookies mit dem Refresh-Token. */
const REFRESH_COOKIE = 'terminplaner_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sitzungen: TokenService,
    private readonly config: ConfigService,
  ) {}

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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) antwort: Response,
  ): Promise<AnmeldeAntwort> {
    const paar = await this.auth.login(dto.email, dto.password);
    this.setzeRefreshCookie(antwort, paar.refreshToken);
    return {
      accessToken: paar.accessToken,
      expiresIn: paar.expiresIn,
      refreshToken: paar.refreshToken,
    };
  }

  /**
   * Neues Token-Paar. Der Refresh-Token kommt aus dem Cookie (Admin-Web) oder
   * aus dem Rumpf (Mobile-App).
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() anfrage: Request,
    @Res({ passthrough: true }) antwort: Response,
    @Body() rumpf: { refreshToken?: string },
  ): Promise<AnmeldeAntwort> {
    const vorgelegt = this.holeRefreshToken(anfrage, rumpf);
    const paar = vorgelegt === null ? null : await this.sitzungen.rotate(vorgelegt);

    if (paar === null) {
      // Cookie löschen, damit der Client nicht in einer Schleife weiterversucht.
      antwort.clearCookie(REFRESH_COOKIE, this.cookieOptionen());
      // UnauthorizedException statt Error: Der Client muss 401 sehen, um zur
      // Anmeldung zu leiten. Ein Error würde als 500 ankommen und wie ein
      // Serverausfall aussehen.
      throw new UnauthorizedException('Sitzung abgelaufen. Bitte erneut anmelden.');
    }

    this.setzeRefreshCookie(antwort, paar.refreshToken);
    return {
      accessToken: paar.accessToken,
      expiresIn: paar.expiresIn,
      refreshToken: paar.refreshToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() anfrage: Request,
    @Res({ passthrough: true }) antwort: Response,
    @Body() rumpf: { refreshToken?: string },
  ): Promise<Quittung> {
    const vorgelegt = this.holeRefreshToken(anfrage, rumpf);
    if (vorgelegt !== null) await this.sitzungen.revoke(vorgelegt);
    antwort.clearCookie(REFRESH_COOKIE, this.cookieOptionen());
    return { message: 'Abgemeldet.' };
  }

  private holeRefreshToken(anfrage: Request, rumpf: { refreshToken?: string }): string | null {
    const ausCookie = (anfrage.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    return ausCookie ?? rumpf.refreshToken ?? null;
  }

  private cookieOptionen() {
    const produktion = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      // In Produktion nur über HTTPS. Lokal läuft die Entwicklung über http.
      secure: produktion,
      // 'lax' reicht: Der Token wird nie über einen fremden Seitenaufruf gebraucht.
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  private setzeRefreshCookie(antwort: Response, token: string): void {
    antwort.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptionen(),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
