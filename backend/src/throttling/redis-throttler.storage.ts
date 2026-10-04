import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { Redis } from 'ioredis';

/**
 * Zählerspeicher für die Anfragebegrenzung, in Redis.
 *
 * **Warum nicht im Arbeitsspeicher:** Die Zähler würden bei jedem Neustart
 * zurückgesetzt. Ein Angreifer müsste nur auf die nächste Auslieferung warten,
 * und bei mehreren Instanzen zählte jede für sich.
 *
 * Selbst geschrieben statt ein fertiges Paket zu nehmen: Die verfügbaren
 * unterstützen NestJS nur bis Version 11, wir sind auf 12. Die Schnittstelle
 * besteht ohnehin aus einer Methode.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;
  private ausfallGemeldet = false;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      // Nicht endlos neu verbinden und dabei Anfragen aufhalten.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    this.redis.on('error', (fehler: Error) => {
      // Nur einmal melden, sonst füllt ein Ausfall das Protokoll.
      if (!this.ausfallGemeldet) {
        this.ausfallGemeldet = true;
        this.logger.error(`Redis nicht erreichbar: ${fehler.message}`);
      }
    });

    this.redis.on('ready', () => {
      if (this.ausfallGemeldet) {
        this.ausfallGemeldet = false;
        this.logger.log('Redis wieder erreichbar');
      }
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const zaehlerSchluessel = `thr:${throttlerName}:${key}`;
    const sperrSchluessel = `thr:${throttlerName}:${key}:blocked`;

    try {
      // Erst prüfen, ob schon gesperrt ist — dann gar nicht weiterzählen.
      const restSperre = await this.redis.pttl(sperrSchluessel);
      if (restSperre > 0) {
        return {
          totalHits: limit + 1,
          timeToExpire: Math.ceil(restSperre / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(restSperre / 1000),
        };
      }

      const [treffer, restMs] = (await this.redis
        .multi()
        .incr(zaehlerSchluessel)
        .pttl(zaehlerSchluessel)
        .exec()
        .then((e) => (e ?? []).map((r) => r[1] as number))) as [number, number];

      // Beim ersten Treffer die Lebensdauer setzen. `ttl` kommt in Millisekunden.
      if (treffer === 1 || restMs < 0) {
        await this.redis.pexpire(zaehlerSchluessel, ttl);
      }

      const uebersprungen = treffer > limit;
      if (uebersprungen && blockDuration > 0) {
        await this.redis.set(sperrSchluessel, '1', 'PX', blockDuration);
      }

      const rest = restMs > 0 ? restMs : ttl;
      return {
        totalHits: treffer,
        timeToExpire: Math.ceil(rest / 1000),
        isBlocked: uebersprungen,
        timeToBlockExpire: uebersprungen ? Math.ceil(blockDuration / 1000) : 0,
      };
    } catch (fehler) {
      // **Bewusst durchlassen, nicht abweisen.**
      //
      // Ist Redis weg, stünde sonst die gesamte Anmeldung still — das Studio
      // käme nicht mehr an seinen Kalender. Ein Ausfall der Begrenzung ist das
      // kleinere Übel als ein Ausfall des Systems, muss aber laut sichtbar sein.
      this.logger.error(
        `Anfragebegrenzung nicht verfügbar, Anfrage wird durchgelassen: ${
          fehler instanceof Error ? fehler.message : String(fehler)
        }`,
      );
      return { totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
