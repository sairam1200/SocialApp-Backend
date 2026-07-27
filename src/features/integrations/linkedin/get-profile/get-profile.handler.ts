import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { Inject, NotFoundException } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { LinkedInProfileModel } from '../../../../domain/contracts/linkedin.model';
import { mapToLinkedInProfileModel } from '../../../../domain/mappers/linkedin.mapper';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

const PLATFORM = 'linkedin';
export class LinkedInProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    linkedInId?: string;
  };

  constructor(request: Partial<LinkedInProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(LinkedInProfileQuery)
export class LinkedInProfileQueryHandler implements IQueryHandler<LinkedInProfileQuery> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    command: LinkedInProfileQuery,
  ): Promise<LinkedInProfileModel> {
    const { model } = command;

    const account = model.userId
      ? await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
          PLATFORM,
          model.userId,
        )
      : model.userName
        ? await this.linkedAccountRepository.getByPlatformAndUserNameAsync(
            PLATFORM,
            model.userName,
          )
        : await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(
            PLATFORM,
            model.linkedInId,
          );

    if (!account) {
      throw new NotFoundException(
        'No matching LinkedIn profile was found based on the provided information.',
      );
    }

    const includeSensitiveFields = HttpContext.user
      ? account.userId === HttpContext.user[Globals.ClaimTypes.UserId] ||
        HttpContext.user.permission.some((a) => a === 'viewuser')
      : false;

    return mapToLinkedInProfileModel(account, includeSensitiveFields);
  }
}
