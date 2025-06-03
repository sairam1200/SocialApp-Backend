import { Module } from "@nestjs/common";
import { QueuesModule } from "./queues.module";
import { dependency } from "../infrastructure/dependency";

@Module({
  imports: [QueuesModule.register()],
  providers: [
    dependency.EmailService,
  ],
  exports: [
    dependency.EmailService,
  ],
})
export class EmailModule { }