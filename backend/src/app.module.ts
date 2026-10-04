import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { ConsentsModule } from './consents/consents.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

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
    MailModule,
    AuthModule,
    UsersModule,
    ConsentsModule,
    HealthModule,
  ],
})
export class AppModule {}
