import { Module } from "@nestjs/common";
import { dependency } from "../infrastructure/dependency";
import { EmailListener } from "../infrastructure/background/listeners/email.listener";

@Module({
  imports: [],
  providers: [
    dependency.EmailService,
    EmailListener,
  ],
  exports: [
    dependency.EmailService,
  ],
})
export class EmailModule { }