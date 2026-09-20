import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  environment: string;
  checks: {
    database: 'up' | 'down';
  };
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Erreichbarkeitsprüfung.
   *
   * Bewusst ohne personenbezogene Daten und ohne Versionsangaben — der Endpunkt
   * ist öffentlich und soll einem Angreifer nichts über das System verraten.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthResponse> {
    const databaseUp = await this.prisma.ping();

    return {
      status: databaseUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: this.config.get<string>('NODE_ENV', 'development'),
      checks: {
        database: databaseUp ? 'up' : 'down',
      },
    };
  }
}
