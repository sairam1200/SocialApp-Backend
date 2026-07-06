import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard, OnboardingGuard } from '../../../../core/passport';
import { GetOnboardingStep3Query } from './get-step3.handler';
import { OnboardingStatusModel } from '../../../../domain/contracts/onboarding.model';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';

@ApiTags('Onboarding')
@UseGuards(UserAccoutGuard, OnboardingGuard)
@Controller({
  path: `/onboarding`,
  version: '1',
})
export class GetOnboardingStep3Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('step3')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 200, description: 'OK', type: OnboardingStatusModel })
  public async GetStep3(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetOnboardingStep3Query({}));

    return res.status(HttpStatus.OK).send(result);
  }
}
