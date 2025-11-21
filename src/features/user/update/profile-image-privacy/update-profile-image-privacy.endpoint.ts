import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthenticatedAccountGuard } from "../../../../core/passport";
import { Body, Controller, HttpStatus, Patch, Res, UseGuards } from "@nestjs/common";
import { UpdateProfileImagePrivacyCommand, UpdateProfileImagePrivacyRequestModel } from "./update-profile-image-privacy.handler";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class UpdateProfileImagePrivacyController {
  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Patch('profile-image/privacy')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: UpdateProfileImagePrivacyRequestModel, required: true })
  public async UpdateProfileImagePrivacy(
    @Body() model: UpdateProfileImagePrivacyRequestModel,
    @Res() res: Response,
  ): Promise<Response> {
    await this.commandBus.execute(new UpdateProfileImagePrivacyCommand({ model }));
    return res.status(HttpStatus.NO_CONTENT).send();
  }
}

