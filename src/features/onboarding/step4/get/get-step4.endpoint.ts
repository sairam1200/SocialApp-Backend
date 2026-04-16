import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard, OnboardingGuard } from "../../../../core/passport";
import { GetOnboardingStep4Query } from "./get-step4.handler";
import { OnboardingStep4Model } from "../../../../domain/contracts/onboarding.model";
import { Controller, Get, HttpStatus, Res, UseGuards } from "@nestjs/common";

@ApiTags('Onboarding')
@UseGuards(UserAccoutGuard, OnboardingGuard)
@Controller({
  path: `/onboarding`,
  version: '1',
})
export class GetOnboardingStep4Controller {

  constructor(private readonly queryBus: QueryBus) { }

  @Get('step4')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 200, description: 'OK', type: OnboardingStep4Model })
  public async GetStep4(
    @Res() res: Response
  ): Promise<Response> {

    const result = await this.queryBus.execute(new GetOnboardingStep4Query({}));

    return res.status(HttpStatus.OK).send(result);
  }
}
