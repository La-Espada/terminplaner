import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { AppointmentsModule } from './appointments/appointments.module';
import { ArbeitszeitenModule } from './arbeitszeiten/arbeitszeiten.module';
import { AuthModule } from './auth/auth.module';
import { ConsentsModule } from './consents/consents.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { StaffModule } from './staff/staff.module';
import { ThrottlingModule } from './throttling/throttling.module';
import { UsersModule } from './users/users.module';
import { VerfuegbarkeitModule } from './verfuegbarkeit/verfuegbarkeit.module';
import { ZuordnungModule } from './zuordnung/zuordnung.module';

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
    ThrottlingModule,
    MailModule,
    AuthModule,
    UsersModule,
    ConsentsModule,
    ServicesModule,
    StaffModule,
    ZuordnungModule,
    ArbeitszeitenModule,
    VerfuegbarkeitModule,
    AppointmentsModule,
    HealthModule,
  ],
})
export class AppModule {}
