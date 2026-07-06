import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport';
import {
  Body,
  Controller,
  HttpStatus,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ReorderManualProfileCommand,
  ReorderManualProfileRequestModel,
} from './reorder-manual-profile.handler';

@ApiTags('User Profiles')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/user/profile`,
  version: '1',
})
export class ReorderManualProfileController {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch('manual-profile/re-order')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  public async Reorder(
    @Body() request: ReorderManualProfileRequestModel,
    @Res() res: Response,
  ): Promise<Response> {
    await this.commandBus.execute(
      new ReorderManualProfileCommand({
        model: request,
      }),
    );

    res.status(HttpStatus.NO_CONTENT).send();
    return res;
  }
}
