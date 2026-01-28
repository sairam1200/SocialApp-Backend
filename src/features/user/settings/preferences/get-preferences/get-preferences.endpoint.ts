import { CommandBus } from "@nestjs/cqrs";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthenticatedAccountGuard } from "../../../../../core/passport";
import { UserPreferenceModel } from "../../../../../domain/contracts/userPreference.model";
import { GetPreferencesQuery } from "./get-preferences.handler";

@ApiBearerAuth()
@ApiTags('Settings')
@UseGuards(AuthenticatedAccountGuard)
@Controller({
  path: `/user/setting`,
  version: '1',
})
export class GetPreferencesController {
  constructor(
    private readonly queryBus: CommandBus
  ) { }

  @Get('preference')
  @ApiResponse({ status: 200, description: 'OK', type: UserPreferenceModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Get(): Promise<UserPreferenceModel> {
    const result = await this.queryBus.execute(new GetPreferencesQuery());
    return result;
  }
}
