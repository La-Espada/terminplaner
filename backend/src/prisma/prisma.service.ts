import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Zugriff auf PostgreSQL.
 *
 * Seit Prisma 7 bekommt der Client einen Treiber-Adapter übergeben, statt die
 * Verbindungs-URL aus dem Schema zu lesen. Die URL kommt aus der Konfiguration,
 * die beim Start validiert wurde (siehe config/env.validation.ts).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Datenbankverbindung hergestellt');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Einfacher Erreichbarkeitstest für den Health-Endpoint. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Datenbank nicht erreichbar', error);
      return false;
    }
  }
}
