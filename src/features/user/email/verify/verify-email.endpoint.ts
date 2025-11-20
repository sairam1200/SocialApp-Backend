import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { VerifyEmailCommand, VerifyEmailRequestModel, VerifyEmailResponseModel } from "./verify-email.handler";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class VerifyEmailController {
  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('email/verify')
  @ApiResponse({ status: 200, description: 'OK', type: VerifyEmailResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: VerifyEmailRequestModel, required: true })
  public async VerifyEmail(
    @Body() model: VerifyEmailRequestModel,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.commandBus.execute(new VerifyEmailCommand({ model }));
    return res.status(HttpStatus.OK).json(result);
  }
}

