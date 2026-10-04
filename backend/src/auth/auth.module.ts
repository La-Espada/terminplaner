import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RollenGuard } from './guards/rollen.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { ZugriffService } from './zugriff.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    PasswordService,
    TokenService,
    ZugriffService,
    // Beide Guards gelten global. Ein neuer Endpunkt ist damit standardmaessig
    // geschuetzt — wer ihn oeffnen will, muss das ausdruecklich tun. Die
    // Reihenfolge zaehlt: Erst Anmeldung pruefen, dann Rolle.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RollenGuard },
  ],
  exports: [PasswordService, AuthTokenService, TokenService, ZugriffService],
})
export class AuthModule {}
