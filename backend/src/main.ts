import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());

  // Browser-Clients brauchen eine ausdrückliche Freigabe: das Admin-Web und die
  // Expo-App, wenn sie im Browser läuft. Native Builds der App sind davon nicht
  // betroffen, dort gibt es keine Herkunftsprüfung.
  //
  // Bewusst eine Positivliste statt `origin: true`. Mit Anmeldedaten im Spiel
  // (httpOnly-Cookie im Admin-Web) wäre eine offene Freigabe eine Einladung:
  // Jede fremde Seite könnte im Namen angemeldeter Nutzender Anfragen stellen.
  const erlaubteHerkuenfte = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  app.enableCors({
    origin: erlaubteHerkuenfte.length > 0 ? erlaubteHerkuenfte : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  });

  const apiPrefix = config.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // Eingaben werden serverseitig validiert. whitelist entfernt unbekannte Felder,
  // forbidNonWhitelisted weist Anfragen mit solchen Feldern ab — so kann kein Client
  // Werte unterschieben, die er nicht setzen darf (etwa einen eigenen Preis).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);

  logger.log(`API läuft auf http://localhost:${port}/${apiPrefix}`);
  logger.log(`Studio-Zeitzone: ${config.get<string>('STUDIO_TIMEZONE')}`);
}

void bootstrap();
