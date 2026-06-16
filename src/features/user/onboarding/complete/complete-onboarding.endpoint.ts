import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";

import {
  CompleteOnboardingCommand,
  CompleteOnboardingModel,
} from "./complete-onboarding.handler";
import { AuthenticatedAccountGuard } from "core/passport/account.guard";

@ApiTags("Account")
@Controller({
  path: `/account`,
  version: "1",
  
})
export class CompleteOnboardingController {

  constructor(
    private readonly commandBus: CommandBus
  ) {}
@ApiBearerAuth()
@UseGuards(AuthenticatedAccountGuard)
  @Post("onboarding/complete")
  @ApiResponse({
    status: 200,
    description: "OK",
  })
  @ApiBody({
    type: CompleteOnboardingModel,
    required: true,
  })
  public async CompleteOnboarding(
    @Body() model: CompleteOnboardingModel,
    @Res() res: Response,
  ): Promise<Response> {

    const result =
      await this.commandBus.execute(
        new CompleteOnboardingCommand({
          model,
        })
      );

    return res.status(
      HttpStatus.OK
    ).json(result);
  }
}