import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard, OnboardingGuard } from "../../../../core/passport";
import { GetOnboardingStep2Query } from "./get-step2.handler";
import { OnboardingStep2Model } from "../../../../domain/contracts/onboarding.model";
import { Controller, Get, HttpStatus, Res, UseGuards } from "@nestjs/common";

@ApiTags('Onboarding')
@UseGuards(UserAccoutGuard, OnboardingGuard)
@Controller({
  path: `/onboarding`,
  version: '1',
})
export class GetOnboardingStep2Controller {

  constructor(private readonly queryBus: QueryBus) { }

  @Get('step2')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 200, description: 'OK', type: OnboardingStep2Model })
  public async GetStep2(
    @Res() res: Response
  ): Promise<Response> {

    const result = await this.queryBus.execute(new GetOnboardingStep2Query({}));
    return res.status(HttpStatus.OK).send(result);
  }
}