import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProfileModel } from '../../../domain/contracts/profile.model';
import { GetProfileQuery } from './get-profile.handler';
import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

@ApiBearerAuth()
@ApiTags('User Profiles')
@UseGuards()
@Controller({
  path: `/user/profile`,
  version: '1',
})
export class GetProfileController {
  constructor(private readonly queryBus: CommandBus) {}

  @Get()
  @ApiResponse({ status: 200, description: 'OK', type: ProfileModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async GetById(
    @Query('userName') userName: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(
      new GetProfileQuery({ userName }),
    );
    res.status(HttpStatus.OK).send(result);
    return res;
  }
}
