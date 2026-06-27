import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiHeader, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserModel } from "../../../domain/contracts/user.model";
import { RegisterCommand, RegisterModel } from "./register.handler";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { RequireTurnstile } from "../../../core/passport";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class RegisterController {

  constructor(private readonly commandBus: CommandBus) { }

  @RequireTurnstile()
  @Post('register')
  @ApiHeader({ name: 'x-turnstile-token', required: true, description: 'Turnstile CAPTCHA token (use "test-token" in local dev)' })
  @ApiResponse({ status: 200, description: 'OK', type: UserModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Register(@Body() request: RegisterModel, @Res() res: Response
  ): Promise<Response> {

    const result = await this.commandBus.execute(new RegisterCommand({
      model: request
    }));

    return res.status(HttpStatus.CREATED).send(result);
  }
}