import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthenticatedAccountGuard } from "../../../../core/passport";
import { Body, Controller, Patch, UseGuards } from "@nestjs/common";
import { UpdatePrivacySettingsCommand, UpdatePrivacySettingsRequestModel } from "./update-privacy-settings.handler";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class UpdatePrivacySettingsController {
  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Patch('privacy-settings')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: UpdatePrivacySettingsRequestModel, required: true })
  public async UpdatePrivacySettings(
    @Body() model: UpdatePrivacySettingsRequestModel,
  ): Promise<void> {
    await this.commandBus.execute(new UpdatePrivacySettingsCommand({ model }));
  }
}
