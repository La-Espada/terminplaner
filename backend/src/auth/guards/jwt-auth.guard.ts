import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IST_OEFFENTLICH } from '../decorators/oeffentlich.decorator';
import type { AccessTokenInhalt } from '../token.service';
import type { AngemeldetePerson } from '../types';

/**
 * Prüft den Access-Token. Greift **global**, nicht je Endpunkt.
 *
 * Diese Richtung ist Absicht: Wer einen neuen Endpunkt baut und nichts tut,
 * bekommt einen geschützten. Bei der umgekehrten Voreinstellung — alles offen,
 * Schutz muss angefordert werden — ist ein vergessener Guard ein Datenleck, und
 * man sieht es dem Code nicht an.
 *
 * Öffentliche Endpunkte werden mit `@Oeffentlich()` ausdrücklich markiert.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const oeffentlich = this.reflector.getAllAndOverride<boolean>(IST_OEFFENTLICH, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (oeffentlich === true) return true;

    const anfrage = context.switchToHttp().getRequest<Request>();
    const token = this.holeToken(anfrage);

    if (token === null) {
      throw new UnauthorizedException('Nicht angemeldet.');
    }

    let inhalt: AccessTokenInhalt;
    try {
      inhalt = await this.jwt.verifyAsync<AccessTokenInhalt>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Sitzung abgelaufen oder ungültig.');
    }

    // Der Token allein genügt nicht: Zwischen Ausgabe und Verwendung können bis
    // zu 15 Minuten liegen. In der Zeit kann ein Konto gesperrt oder anonymisiert
    // worden sein, oder die Rolle hat sich geändert. Deshalb bei jeder Anfrage
    // der Blick in die Datenbank.
    const user = await this.prisma.user.findUnique({
      where: { id: inhalt.sub },
      select: {
        id: true,
        role: true,
        status: true,
        staffProfile: { select: { id: true } },
      },
    });

    if (user === null || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Sitzung abgelaufen oder ungültig.');
    }

    const person: AngemeldetePerson = {
      id: user.id,
      role: user.role,
      staffProfileId: user.staffProfile?.id ?? null,
    };

    (anfrage as Request & { person?: AngemeldetePerson }).person = person;
    return true;
  }

  private holeToken(anfrage: Request): string | null {
    const kopf = anfrage.headers.authorization;
    if (typeof kopf !== 'string') return null;
    const [schema, wert] = kopf.split(' ');
    return schema === 'Bearer' && typeof wert === 'string' && wert.length > 0 ? wert : null;
  }
}
