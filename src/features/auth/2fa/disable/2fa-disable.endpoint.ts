import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { Disable2FACommand } from "./2fa-disable.handler";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { ApiBody, ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";

class Disable2FAResponseModel {
  @ApiProperty()
  message: "Two-factor authentication disabled successfully."
}

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class Disable2FAController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('2fa/disable')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 200, description: 'OK', type: Disable2FAResponseModel })
  public async Disable(@Res() res: Response): Promise<Response | void> {

    await this.commandBus.execute(new Disable2FACommand());

    return res.status(HttpStatus.OK).json({
      message: 'Two-factor authentication disabled successfully.'
    });
  }
}