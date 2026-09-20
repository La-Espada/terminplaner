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
