import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../domain/repositories";

export class SuggestUserNameResponseModel {
  @ApiProperty({ type: [String] })
  usernames: string[];

  @ApiProperty()
  message?: string;

  @ApiProperty({ default: false })
  status: boolean;

  constructor(request: Partial<SuggestUserNameResponseModel> = {}) {
    Object.assign(this, request);
  }
}

export class SuggestUserNameCommand {
  hint?: string = null;
  userName?: string = null;

  constructor(request: Partial<SuggestUserNameCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(SuggestUserNameCommand)
export class SuggestUserNameCommandHandler implements ICommandHandler<SuggestUserNameCommand, SuggestUserNameResponseModel> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository) {
  }

  async execute(command: SuggestUserNameCommand): Promise<SuggestUserNameResponseModel> {
    const base = (command.userName || command.hint || '').toLowerCase().replace(/\s+/g, '');

    if (!base) {
      const suggestion = await this.generateUniqueUsername('user');
      return new SuggestUserNameResponseModel({
        status: false,
        usernames: [suggestion],
      });
    }

    const existingUser = await this.userRepository.getUserByNameAsync(base);
    if (!existingUser) {
      return new SuggestUserNameResponseModel({
        status: true,
        message: 'Username is available',
        usernames: [],
      });
    }

    const takenUsernames = await this.userRepository.getSimilarUserNamesAsync(base);
    const suggestions: string[] = [];
    let attempts = 0;

    while (suggestions.length < 5 && attempts < 100) {
      const suggestion = `${base}${Math.floor(100 + Math.random() * 8999)}`;
      const isUsed = takenUsernames.some(u => u.toLowerCase() === suggestion);
      if (!isUsed && !suggestions.includes(suggestion)) {
        suggestions.push(suggestion);
      }
      attempts++;
    }

    return new SuggestUserNameResponseModel({
      status: false,
      message: 'Username already exists. Here are some suggestions.',
      usernames: suggestions,
    });

  }

  private async generateUniqueUsername(prefix: string): Promise<string> {
    let suggestion: string;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 100) {
      suggestion = `${prefix}${Math.floor(100000 + Math.random() * 899999)}`;
      const check = await this.userRepository.getUserByNameAsync(suggestion);
      exists = !!check;
      attempts++;
    }

    return suggestion!;
  }
} 