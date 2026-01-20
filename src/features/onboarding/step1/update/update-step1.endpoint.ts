import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiResponse, ApiTags, ApiBody } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport";
import { OnboardingStep1Command } from "./update-step1.handler";
import { OnboardingStep1Model, OnboardingStatusModel } from "../../../../domain/contracts/onboarding.model";
import { Body, Controller, HttpStatus, Post, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";

@ApiTags('Onboarding')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/onboarding`,
  version: '1',
})
export class UpdateOnboardingStep1Controller {

  constructor(private readonly commandBus: CommandBus) { }

  @Post('step1')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          nullable: true,
          description: 'Profile image file. Optional.',
        },
        username: {
          type: 'string',
          nullable: true,
          description: 'Username (3-30 characters)',
        },
        bio: {
          type: 'string',
          nullable: true,
          description: 'Bio (max 500 characters)',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 200, description: 'OK', type: OnboardingStatusModel })
  public async UpdateStep1(
    @UploadedFile() file: any,
    @Body() request: OnboardingStep1Model,
    @Res() res: Response
  ): Promise<Response> {

    const result = await this.commandBus.execute(new OnboardingStep1Command({
      file,
      model: request
    }));

    return res.status(HttpStatus.OK).send(result);
  }
}