import _const from "../../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../../domain/repositories";
import { BadRequestException, Inject } from "@nestjs/common";

export class ConfirmPhoneNumberCommand {
  phoneNumber: string;
  token: string;

  constructor(request: Partial<ConfirmPhoneNumberCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(ConfirmPhoneNumberCommand)
export class ConfirmPhoneNumberCommandHandler implements ICommandHandler<ConfirmPhoneNumberCommand, void> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository) {
  }

  async execute(command: ConfirmPhoneNumberCommand): Promise<void> {
    const result = await this.userRepository.changePhoneNumberAsync(command.phoneNumber, command.token);
    if (!result) {
      throw new BadRequestException('Failed to update phone number. Please verify your token and try again.');
    }
  }
}

