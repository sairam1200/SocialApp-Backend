import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { UserType } from '../../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IManualProfileRepository } from '../../../../domain/repositories';
import { IIdentityRepository } from '../../../../domain/repositories/iidentity.repository';
import { UserNotFoundException } from '../../../../core/exceptions/user.exception';
import { ManualProfileModel } from '../../../../domain/contracts/manualProfile.model';
import { mapToManualProfileModel } from '../../../../domain/mappers/manualProfile.mapper';

export class GetUserManualProfilesQuery {
  userName: string;

  constructor(request: Partial<GetUserManualProfilesQuery> = {}) {
    Object.assign(this, request);
  }
}

const getUserQueryValidations = {
  params: Joi.object().keys({
    userName: Joi.string().required(),
  }),
};

@CommandHandler(GetUserManualProfilesQuery)
export class GetUserManualProfilesQueryHandler implements ICommandHandler<
  GetUserManualProfilesQuery,
  ManualProfileModel[]
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IMANUALPROFILE_REPOSITORY)
    private readonly manualProfileRepository: IManualProfileRepository,
  ) {}

  public async execute(
    query: GetUserManualProfilesQuery,
  ): Promise<ManualProfileModel[]> {
    await getUserQueryValidations.params.validateAsync(query);

    const user = await this.userRepository.getUserByNameAsync(query.userName);
    if (!user || user.type !== UserType.User) {
      throw new UserNotFoundException();
    }

    const manualProfiles = await this.manualProfileRepository.getByUserIdAsync(
      user.id,
    );
    if (!manualProfiles) {
      return [];
    }

    return manualProfiles.map(mapToManualProfileModel);
  }
}
