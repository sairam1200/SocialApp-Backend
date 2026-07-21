import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../core/utils/const';
import { IProjectRepository } from '../../domain/repositories/iproject.repository';
import { PagedResult } from '../../domain/contracts/pagination/pagedResult';
import { Project } from '../../domain/entities';

export class SearchProjectsQuery {
  q?: string;
  status?: string;
  projectType?: string;
  page = 1;
  limit = 20;

  constructor(request: Partial<SearchProjectsQuery> = {}) {
    Object.assign(this, request);
  }
}

const searchProjectsSchema = Joi.object({
  q: Joi.string().trim().min(1).max(200).optional().allow('', null),
  status: Joi.string()
    .valid('open', 'in_progress', 'completed', 'cancelled', 'paused', 'draft', 'funded')
    .optional(),
  projectType: Joi.string()
    .valid('open', 'invitationOnly', 'directOffer', 'packagedService', 'retainer', 'bounty', 'paidWorkTrial', 'projectToHire', 'confidentialEnterprise', 'communityFunded')
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

@CommandHandler(SearchProjectsQuery)
export class SearchProjectsQueryHandler
  implements ICommandHandler<SearchProjectsQuery, PagedResult<Project[]>>
{
  constructor(
    @Inject(_const.IPROJECT_REPOSITORY)
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(query: SearchProjectsQuery): Promise<PagedResult<Project[]>> {
    const validated = await searchProjectsSchema.validateAsync(query, {
      stripUnknown: true,
    });

    return this.projectRepository.searchAsync(
      {
        keyword: validated.q || undefined,
        status: validated.status,
        projectType: validated.projectType,
      },
      validated.page,
      validated.limit,
    );
  }
}
