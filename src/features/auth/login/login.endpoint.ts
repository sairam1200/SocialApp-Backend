import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { TokenResponseModel } from "../../../domain/contracts/tokenResponse.model";
import { LoginCommand, TokenRequestModel } from "./login.handler";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";

@ApiTags('Authentication')
@Controller({
    path: `/auth`,
    version: '1',
})
export class LoginController {

    constructor(private readonly commandBus: CommandBus) {
    }

    @Post('access-token')
    @ApiResponse({ status: 200, description: 'OK', type: TokenResponseModel })
    @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
    @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
    @ApiResponse({ status: 403, description: 'FORBIDDEN' })
    public async GetAccessToken(@Body() request: TokenRequestModel, @Res() res: Response): Promise<Response> {

        const result = await this.commandBus.execute(new LoginCommand({ model: request }));
        return res.status(HttpStatus.OK).send(result);
    }
}