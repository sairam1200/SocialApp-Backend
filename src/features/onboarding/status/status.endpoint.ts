import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard, OnboardingGuard } from '../../../core/passport';
import { GetOnboardingStatusQuery } from './status.handler';
import { OnboardingStatusModel } from '../../../domain/contracts/onboarding.model';
import {
  Controller,
  Get,
  HttpStatus,
  Res,
  UseGuards,
} from '@nestjs/common';

@ApiTags('Onboarding')
@Controller({
  path: `/onboarding`,
  version: '1',
})
export class GetOnboardingStatusController {
  constructor(private readonly queryBus: QueryBus) {}

  @UseGuards(UserAccoutGuard, OnboardingGuard)
  @Get('status')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 200, description: 'OK', type: OnboardingStatusModel })
  public async GetStatus(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetOnboardingStatusQuery({}));

    return res.status(HttpStatus.OK).send(result);
  }
}