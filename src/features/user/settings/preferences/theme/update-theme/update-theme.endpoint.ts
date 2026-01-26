import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { AuthenticatedAccountGuard } from "../../../../../../core/passport";
import { Body, Controller, HttpStatus, Put, Res, UseGuards } from "@nestjs/common";
import { UpdateThemeCommand, UpdateThemeRequestModel } from "./update-theme.handler";

@ApiBearerAuth()
@ApiTags('Settings')
@UseGuards(AuthenticatedAccountGuard)
@Controller({
  path: `/setting`,
  version: '1',
})
export class UpdateThemeController {
  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Put('preference/theme')
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: UpdateThemeRequestModel, required: true })
  public async Update(
    @Body() request: UpdateThemeRequestModel,
    @Res() res: Response
  ): Promise<Response> {
    await this.commandBus.execute(new UpdateThemeCommand({ model: request }));
    res.status(HttpStatus.NO_CONTENT).send(null);
    return res;
  }
}
