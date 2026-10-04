import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Stellt den Redis-Zählerspeicher bereit, damit er in die Optionen des
 * Throttler-Moduls hineingereicht werden kann.
 *
 * Eigenes Modul, weil `ThrottlerModule.forRootAsync` seine Abhängigkeiten über
 * `imports` auflöst. Ein Provider in der Modulliste unten reicht nicht: Der
 * Guard wird im Kontext des Auth-Moduls erzeugt, und dort ist nur der vom
 * Throttler-Modul selbst bereitgestellte Speicher sichtbar — der eingebaute im
 * Arbeitsspeicher. Der Weg über die Optionen gilt dagegen überall.
 */
@Module({
  imports: [ConfigModule],
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class ThrottlerStorageModule {}

/**
 * Anfragebegrenzung (Schritt 13).
 *
 * Drei benannte Grenzen, die je Endpunkt ausgewählt werden:
 *
 * - `streng` für die Anmeldung: fünf Versuche in 15 Minuten. Reicht für
 *   Vertipper, lässt aber kein systematisches Durchprobieren zu.
 * - `mail` für alles, was eine E-Mail auslöst: drei in einer Stunde. Hier ist
 *   nicht das Raten das Problem, sondern dass jemand ein fremdes Postfach mit
 *   Nachrichten überschüttet.
 * - `standard` als weiche Grundgrenze für die übrige API, damit nicht jeder neue
 *   Endpunkt ungeschützt entsteht.
 *
 * Die Werte kommen aus der Konfiguration. Die Decorators an den Endpunkten
 * **wählen** nur aus, welche Grenze gilt, und setzen keine eigenen Zahlen —
 * sonst wäre die Konfiguration wirkungslos.
 */
@Global()
@Module({
  imports: [
    // Auch direkt importiert, nicht nur innerhalb von forRootAsync: Nest
    // erlaubt nur den Export von Modulen, die das exportierende Modul selbst
    // importiert hat.
    ThrottlerStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, ThrottlerStorageModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (config: ConfigService, storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: 'standard',
            ttl: seconds(60),
            limit: config.get<number>('RATE_LIMIT_STANDARD', 120),
          },
          {
            name: 'streng',
            ttl: seconds(15 * 60),
            limit: config.get<number>('RATE_LIMIT_ANMELDUNG', 5),
            // Nach Überschreitung bleibt es gesperrt, bis das Fenster abläuft.
            blockDuration: seconds(15 * 60),
          },
          {
            name: 'mail',
            ttl: seconds(60 * 60),
            limit: config.get<number>('RATE_LIMIT_MAIL', 3),
            blockDuration: seconds(60 * 60),
          },
        ],
      }),
    }),
  ],
  providers: [AuthThrottlerGuard],
  // ThrottlerStorageModule wird mit exportiert, damit Tests den Speicher
  // aufloesen koennen, wenn sie die Grenzen ueberschreiben.
  exports: [ThrottlerModule, ThrottlerStorageModule, AuthThrottlerGuard],
})
export class ThrottlingModule {}
