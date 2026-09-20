import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Die .env liegt im Wurzelverzeichnis des Monorepos, nicht in backend/.
      envFilePath: ['../.env', '.env'],
      // @nestjs/config 12 erwartet ein Standard-Schema. Joi 18 erfüllt das.
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
