import { Inject } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../../domain/repositories";

export class EmailInuseCommand {
  email: string;

  constructor(request: Partial<EmailInuseCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EmailInuseCommand)
export class EmailInUseCommandHandler implements ICommandHandler<EmailInuseCommand, Boolean> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository) {
  }

  async execute(command: EmailInuseCommand): Promise<Boolean> {
    return await this.userRepository.isEmailInuseAsync(command.email);
  }
} 