import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard, OnboardingGuard } from "../../../../core/passport";
import { OnboardingStep3Command } from "./update-step3.handler";
import { OnboardingStatusModel } from "../../../../domain/contracts/onboarding.model";
import { Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";

@ApiTags('Onboarding')
@UseGuards(UserAccoutGuard, OnboardingGuard)
@Controller({
  path: `/onboarding`,
  version: '1',
})
export class UpdateOnboardingStep3Controller {

  constructor(private readonly commandBus: CommandBus) { }

  @Post('step3')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 200, description: 'OK', type: OnboardingStatusModel })
  public async UpdateStep3(
    @Res() res: Response
  ): Promise<Response> {

    const result = await this.commandBus.execute(new OnboardingStep3Command({}));

    return res.status(HttpStatus.OK).send(result);
  }
}
