import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { VerifyCodeCommand, VerifyCodeRequestModel, VerifyCodeResponseModel } from "./verify-code.handler";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class VerifyCodeController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('verify-code')
  @ApiResponse({ status: 200, description: 'OK', type: VerifyCodeResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: VerifyCodeRequestModel, required: true })
  public async verifyCode(
    @Body() model: VerifyCodeRequestModel,
    @Res() res: Response,
  ): Promise<Response> {

    const result = await this.commandBus.execute(new VerifyCodeCommand({ model }));
    return res.status(HttpStatus.OK).json(result);
  }
}

