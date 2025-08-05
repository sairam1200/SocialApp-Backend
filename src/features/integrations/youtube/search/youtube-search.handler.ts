import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { QueryHandler, IQueryHandler } from "@nestjs/cqrs";
import { Inject, UnauthorizedException } from "@nestjs/common";
import { ISearchService } from "../../../../domain/services/isearch.service";

export class YoutubeSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty()
  youtubeAccessToken?: string;
}

export class YoutubeSearchQuery {
  model: YoutubeSearchRequestModel;

  constructor(request: Partial<YoutubeSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(YoutubeSearchQuery)
export class YoutubeSearchQueryHandler implements IQueryHandler<YoutubeSearchQuery> {

  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
  ) { }

  public async execute(command: YoutubeSearchQuery): Promise<any> {
    const { searchTerm, filter, youtubeAccessToken } = command.model;



    const data = await this.searchService.searchYoutubeAsync(searchTerm, filter, youtubeAccessToken);
    return data
  }
}