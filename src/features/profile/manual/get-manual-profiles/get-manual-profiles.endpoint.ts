import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUserManualProfilesQuery } from './get-manual-profiles.handler';
import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ManualProfileModel } from '../../../../domain/contracts/manualProfile.model';
import { UserAccoutGuard } from 'core/passport';
import { HttpContext } from 'core/middlewares/httpContext.middleware';
import { Globals } from 'core/globals';

@ApiBearerAuth()
@ApiTags('User Profiles')
@UseGuards()
@Controller({
  path: `/user/profile`,
  version: '1',
})
export class GetUserManualProfilesController {
  constructor(private readonly queryBus: CommandBus) {}

  @Get('manual-profiles')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: [ManualProfileModel] })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async GetAll(
    @Query('userName') userName: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(
      new GetUserManualProfilesQuery({ userName }),
    );
    res.status(HttpStatus.OK).send(result);
    return res;
  }

  @Get('manual-profiles/me')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: [ManualProfileModel] })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Get(@Res() res: Response): Promise<Response> {
    const userName = HttpContext.user[Globals.ClaimTypes.UserName];
    const result = await this.queryBus.execute(
      new GetUserManualProfilesQuery({ userName }),
    );
    return res.status(HttpStatus.OK).send(result);
  }
}
