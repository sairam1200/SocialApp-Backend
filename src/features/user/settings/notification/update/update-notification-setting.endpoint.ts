import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { AuthenticatedAccountGuard } from "../../../../../core/passport";
import { Body, Controller, HttpStatus, Put, Res, UseGuards } from "@nestjs/common";
import { UpdateNotificationSettingCommand, UpdateNotificationSettingRequestModel } from "./update-notification-setting.handler";

@ApiBearerAuth()
@ApiTags('Settings')
@UseGuards(AuthenticatedAccountGuard)
@Controller({
  path: `/user/setting`,
  version: '1',
})
export class UpdateNotificationSettingController {
  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Put('notification')
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: UpdateNotificationSettingRequestModel, required: true })
  public async Update(
    @Body() request: UpdateNotificationSettingRequestModel,
    @Res() res: Response
  ): Promise<Response> {
    await this.commandBus.execute(new UpdateNotificationSettingCommand({ model: request }));
    res.status(HttpStatus.NO_CONTENT).send(null);
    return res;
  }
}
