import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Controller, HttpStatus, Post, Query, Res } from "@nestjs/common";
import { EmailInuseCommand } from "./email-inuse.handler";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class EmailInuseController {

  constructor(private readonly queryBus: CommandBus) {
  }

  @Post('email/in-use')
  @ApiResponse({ status: 200, description: 'OK', type: Boolean })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'email', required: true, type: String })
  public async Suggest(
    @Res() res: Response,
    @Query('email') email?: string
  ): Promise<Response> {
    const result = await this.queryBus.execute(new EmailInuseCommand({ email }));
    res.status(HttpStatus.OK).send(result)
    return res;
  }
}