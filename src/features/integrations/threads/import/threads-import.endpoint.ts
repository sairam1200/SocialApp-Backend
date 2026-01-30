import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { ThreadsImportCommand, ThreadsImportRequestModel } from "./threads-import.handler";
import { CancelThreadsImportCommand, CancelThreadsImportRequestModel } from "./cancel-threads-import.handler";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/threads`,
  version: '1',
})
export class ThreadsImportController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: ThreadsImportRequestModel, required: false })
  public async Import(
    @Body() model: ThreadsImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new ThreadsImportCommand({ model }));
    if (model.threadsAccessToken) {
      return res.status(HttpStatus.OK).json({ message: "Threads import has begun." });
    }

    return res.status(HttpStatus.OK).json({ message: "Threads import has begun.", ...result });
  }

  @Post('import/cancel')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: CancelThreadsImportRequestModel })
  public async Cancel(
    @Body() model: CancelThreadsImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {
    await this.commandBus.execute(new CancelThreadsImportCommand({ model }));
    return res.status(HttpStatus.OK).json({ message: "Threads import cancellation and rollback requested." });
  }
}
