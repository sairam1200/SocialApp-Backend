import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { stringUtil } from '../../../../core/utils/string.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IIdentityRepository } from '../../../../domain/repositories';

export class EmailInuseCommand {
  email: string;

  constructor(request: Partial<EmailInuseCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EmailInuseCommand)
export class EmailInUseCommandHandler
  implements ICommandHandler<EmailInuseCommand, boolean>
{
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
  ) {}

  async execute(command: EmailInuseCommand): Promise<boolean> {
    command.email = stringUtil.normalizeEmail(command.email);
    return await this.userRepository.isEmailInuseAsync(command.email);
  }
}
