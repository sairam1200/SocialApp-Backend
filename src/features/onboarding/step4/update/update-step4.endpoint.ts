import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard, OnboardingGuard } from '../../../../core/passport';
import { OnboardingStep4Command } from './update-step4.handler';
import {
  OnboardingStep4Model,
  OnboardingStatusModel,
} from '../../../../domain/contracts/onboarding.model';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';

@ApiTags('Onboarding')
@UseGuards(UserAccoutGuard, OnboardingGuard)
@Controller({
  path: `/onboarding`,
  version: '1',
})
export class UpdateOnboardingStep4Controller {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('step4')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 200, description: 'OK', type: OnboardingStatusModel })
  public async UpdateStep4(
    @Body() request: OnboardingStep4Model,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.commandBus.execute(
      new OnboardingStep4Command({
        model: request,
      }),
    );

    return res.status(HttpStatus.OK).send(result);
  }
}
