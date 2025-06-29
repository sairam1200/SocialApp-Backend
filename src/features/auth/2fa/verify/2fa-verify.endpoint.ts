import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { TokenResponseModel } from "../../tokenResponse.model";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { Verify2FACommand, Verify2FARequestModel } from "./2fa-verify.handler";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class Verify2FAController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('2fa/verify')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 200, description: 'OK', type: TokenResponseModel })
  public async Setup(
    @Body() model: Verify2FARequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new Verify2FACommand({ model }));
    return res.status(HttpStatus.OK).json(result);
  }
}