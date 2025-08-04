import _const from "../../../../core/utils/const";
import { Inject, UnauthorizedException } from "@nestjs/common";
import { CommandHandler, ICommandHandler} from "@nestjs/cqrs";
import { ApiProperty } from "@nestjs/swagger";
import { ISearchService } from "domain/services/isearch.service";

export class YoutubeSearchRequestModel{
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty()
  youtubeAccessToken: string;
}

export class YoutubeSearchQuery {
  model: YoutubeSearchRequestModel;
  constructor(request: Partial<YoutubeSearchQuery> = {}) {
    Object.assign(this, request);
  }
}
@CommandHandler(YoutubeSearchQuery)
export class YoutubeSearchQueryHandler implements ICommandHandler<YoutubeSearchQuery> {
 constructor(
  @Inject(_const.ISEARCH_SERVICE)
  private readonly searchService: ISearchService,
 ){}

  public async execute(command: YoutubeSearchQuery):Promise<any>{
    const { searchTerm, filter, youtubeAccessToken } = command.model;

        if (!youtubeAccessToken) {
            throw new UnauthorizedException('YouTube Access Token is required');
        }
    const data = await this.searchService.searchYoutubeAsync(searchTerm,filter,youtubeAccessToken);

    return data
  }


  
}