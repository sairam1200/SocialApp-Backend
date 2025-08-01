import { Response } from "express"
import { CommandBus } from "@nestjs/cqrs";
import { TokenResponseModel } from "../../../domain/contracts/tokenResponse.model";
import { RefreshTokenGuard } from "../../../core/passport";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
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
  @UseGuards(RefreshTokenGuard)
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 200, description: 'OK', type: TokenResponseModel })
  public async RefreshAccessToken(@Body() request: RefreshTokenRequestModel, @Res() res: Response): Promise<Response> {

    const result = await this.commandBus.execute(new RefreshTokenCommand({
      model: request
    }));

    return res.status(HttpStatus.OK).send(result);
  }
} 