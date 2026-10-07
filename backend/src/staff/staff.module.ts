import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffOeffentlichController, StaffVerwaltungController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  // AuthModule wegen PasswordService, AuthTokenService und TokenService: Beim
  // Anlegen entsteht ein Konto, beim Deaktivieren fliegen Sitzungen raus.
  imports: [AuthModule],
  controllers: [StaffOeffentlichController, StaffVerwaltungController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
