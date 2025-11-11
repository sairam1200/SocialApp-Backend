import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { UpdateEmailCommand } from "./update-email.handler";
import { ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthenticatedAccountGuard } from "../../../../core/passport";
import { Controller, HttpStatus, Patch, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class UpdateEmailController {

  constructor(private readonly queryBus: CommandBus) {
  }

  @Patch('email/update')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'email', required: true, type: String })
  public async Update(
    @Res() res: Response,
    @Query('email') email?: string
  ): Promise<Response> {
    await this.queryBus.execute(new UpdateEmailCommand({ email }));
    res.status(HttpStatus.NO_CONTENT).send({})
    return res;
  }
}