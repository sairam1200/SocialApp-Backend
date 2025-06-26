import { Response } from "express"
import { CommandBus } from "@nestjs/cqrs";
import { TokenResponseModel } from "../tokenResponse.model";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { RefreshTokenCommand, RefreshTokenRequestModel } from "./refresh-token.handler";

@ApiBearerAuth()
@ApiTags('Authentication')
@Controller({
  path: `/auth`,
  version: '1',
})
export class RefreshTokenController {

  constructor(private readonly commandBus: CommandBus) {
  }

  @Post('refresh-access-token')
  @ApiResponse({ status: 200, description: 'OK', type: TokenResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async RefreshAccessToken(@Body() request: RefreshTokenRequestModel, @Res() res: Response): Promise<Response> {

    const result = await this.commandBus.execute(new RefreshTokenCommand({
      model: request
    }));

    return res.status(HttpStatus.OK).send(result);
  }
} 