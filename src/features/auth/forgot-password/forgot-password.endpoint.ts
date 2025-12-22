import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { ForgotPasswordCommand, ForgotPasswordRequestModel } from "./forgot-password.handler";

class ForgotPasswordResponseModel {
  message: string;
}

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class ForgotPasswordController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('forgot-password')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 200, description: 'OK', type: ForgotPasswordResponseModel })
  public async ForgotPassword(
    @Body() model: ForgotPasswordRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {

    await this.commandBus.execute(new ForgotPasswordCommand({ model }));
    return res.status(HttpStatus.OK).json({ message: "If an account with that email exists, a password reset link has been sent." });
  }
}