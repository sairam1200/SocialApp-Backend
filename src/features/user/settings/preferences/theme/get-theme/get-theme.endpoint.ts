import { CommandBus } from "@nestjs/cqrs";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthenticatedAccountGuard } from "../../../../../../core/passport";
import { ThemePreferenceModel } from "../../../../../../domain/contracts/userPreference.model";
import { GetThemeQuery } from "./get-theme.handler";

@ApiBearerAuth()
@ApiTags('Settings')
@UseGuards(AuthenticatedAccountGuard)
@Controller({
  path: `/user/setting`,
  version: '1',
})
export class GetThemeController {
  constructor(
    private readonly queryBus: CommandBus
  ) { }

  @Get('preference/theme')
  @ApiResponse({ status: 200, description: 'OK', type: ThemePreferenceModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Get(): Promise<ThemePreferenceModel> {
    const result = await this.queryBus.execute(new GetThemeQuery());
    return result;
  }
}
