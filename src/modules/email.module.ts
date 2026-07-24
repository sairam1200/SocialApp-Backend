import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dependency } from '../infrastructure/dependency';
import { DataProtectionKey } from '../domain/entities';
import { EmailListener } from '../infrastructure/background/listeners/email.listener';
import { VerificationEmailService } from '../infrastructure/services/verification-email.service';

@Module({
  imports: [TypeOrmModule.forFeature([DataProtectionKey])],
  providers: [
    dependency.EmailService,
    dependency.DataProtectionKeyRepository,
    EmailListener,
    VerificationEmailService,
  ],
  exports: [dependency.EmailService, VerificationEmailService],
})
export class EmailModule {}
