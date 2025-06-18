import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { ResetPasswordCommand, ResetPasswordRequestModel } from "./reset-password.handler";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class ResetPasswordController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('reset-password')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: ResetPasswordRequestModel, required: false })
  public async ResetPassword(
    @Body() model: ResetPasswordRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {

    await this.commandBus.execute(new ResetPasswordCommand({ model }));
    return res.status(HttpStatus.OK).json({ message: "" });
  }
}