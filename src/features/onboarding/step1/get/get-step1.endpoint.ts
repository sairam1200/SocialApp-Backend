import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard, OnboardingGuard } from "../../../../core/passport";
import { GetOnboardingStep1Query } from "./get-step1.handler";
import { OnboardingStep1Model } from "../../../../domain/contracts/onboarding.model";
import { Controller, Get, HttpStatus, Res, UseGuards } from "@nestjs/common";

@ApiTags('Onboarding')
@UseGuards(UserAccoutGuard, OnboardingGuard)
@Controller({
  path: `/onboarding`,
  version: '1',
})
export class GetOnboardingStep1Controller {

  constructor(private readonly queryBus: QueryBus) { }

  @Get('step1')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 200, description: 'OK', type: OnboardingStep1Model })
  public async GetStep1(
    @Res() res: Response
  ): Promise<Response> {

    const result = await this.queryBus.execute(new GetOnboardingStep1Query({}));

    return res.status(HttpStatus.OK).send(result);
  }
}