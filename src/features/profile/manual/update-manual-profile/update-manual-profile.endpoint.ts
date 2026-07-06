import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport';
import { UpdateManualProfileCommand } from './update-manual-profile.handler';
import {
  Body,
  Controller,
  HttpStatus,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UpdateManualProfileModel } from '../../../../domain/contracts/manualProfile.model';

@ApiTags('User Profiles')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/user/profile`,
  version: '1',
})
export class UpdateManualProfileController {
  constructor(private readonly commandBus: CommandBus) {}

  @Put('manual-profile')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  public async Update(
    @Body() request: UpdateManualProfileModel,
    @Res() res: Response,
  ): Promise<Response> {
    await this.commandBus.execute(
      new UpdateManualProfileCommand({
        model: request,
      }),
    );

    return res.status(HttpStatus.NO_CONTENT).send();
  }
}
