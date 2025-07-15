import { CommandBus } from "@nestjs/cqrs";
import { Controller, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SuggestUserNameCommand, SuggestUserNameResponseModel } from "./suggest-username.handler";

@ApiBearerAuth()
@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class SuggestUserNameController {

  constructor(private readonly queryBus: CommandBus) {
  }

  @Post('suggest-username')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'hint', required: false, type: '' })
  @ApiQuery({ name: 'userName', required: false, type: '' })
  public async Suggest(
    @Query('hint') hint?: string,
    @Query('userName') userName?: string
  ): Promise<SuggestUserNameResponseModel> {
    const result = await this.queryBus.execute(new SuggestUserNameCommand({ hint, userName }));
    return result;
  }
}