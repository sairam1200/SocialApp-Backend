import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import _const from "../../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ProfileImagePrivacy } from "../../../../domain/enums";
import { PlaylistMember } from "../../../../domain/entities/collection/playlistMember.entity";
import { IManualProfileRepository } from "../../../../domain/repositories";
import { PagedResult } from "../../../../domain/contracts/pagination/pagedResult";
import { ManualProfileSearchResponseModel } from "../../../../domain/contracts/manualProfile.model";
import { mapToManualProfileSearchResponseModel } from "../../../../domain/mappers/manualProfile.mapper";
import { isProfileImageVisible } from "../../../../core/utils/profileImagePrivacy.util";

export class SearchManualProfileQuery {
  page = 1;
  pageSize = 10;
  orderBy = 'id';
  order: 'ASC' | 'DESC' = 'ASC';
  searchTerm?: string = null;

  constructor(request: Partial<SearchManualProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

const searchManualProfileValidations = Joi.object<SearchManualProfileQuery>({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(10),
  searchTerm: Joi.string().allow(null).optional()
});

@CommandHandler(SearchManualProfileQuery)
export class SearchManualProfileQueryHandler implements ICommandHandler<SearchManualProfileQuery> {
  constructor(
    @Inject(_const.IMANUALPROFILE_REPOSITORY)
    private readonly manualProfileRepository: IManualProfileRepository,
    @InjectRepository(PlaylistMember) private readonly playlistMemberRepository: Repository<PlaylistMember>,
  ) {
  }

  async execute(command: SearchManualProfileQuery): Promise<PagedResult<ManualProfileSearchResponseModel[]>> {
    await searchManualProfileValidations.validateAsync(command);

    const [manualProfileEntity, total] = await this.manualProfileRepository.searchAsync(
      command.page,
      command.pageSize,
      command.searchTerm
    );

    if (manualProfileEntity?.length == 0) return new PagedResult<ManualProfileSearchResponseModel[]>(null, total);

    const viewerUserId = HttpContext.getCurrentUserId;
    const manualProfiles = await Promise.all(
      manualProfileEntity.map(async (profile) => {
        let canViewProfileImage = true;
        if (profile.user) {
          canViewProfileImage = await isProfileImageVisible(
            profile.user.profileImagePrivacy || ProfileImagePrivacy.Everyone,
            profile.user.id,
            viewerUserId,
            this.playlistMemberRepository
          );
        }
        return mapToManualProfileSearchResponseModel(profile, canViewProfileImage);
      })
    );

    return new PagedResult<ManualProfileSearchResponseModel[]>(manualProfiles, total);
  }
} 