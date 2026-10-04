import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Hinter einem Reverse-Proxy steht in req.ip sonst die Adresse des Proxys —
  // dann zaehlt die Anfragebegrenzung alle Nutzenden als eine Person, und fuenf
  // Fehlversuche sperren das ganze Studio aus. Der Wert sagt, wie vielen
  // Proxys vor der Anwendung zu trauen ist.
  const proxyTiefe = config.get<number>('TRUST_PROXY_HOPS', 0);
  if (proxyTiefe > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', proxyTiefe);
    logger.log(`Vertraue ${proxyTiefe} Proxy-Schicht(en) fuer die Ermittlung der IP`);
  }

  app.use(helmet());
  app.use(cookieParser());

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
