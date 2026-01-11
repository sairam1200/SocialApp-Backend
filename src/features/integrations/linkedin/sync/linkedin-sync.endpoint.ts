import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { EnableLinkedInSyncCommand } from "./enable-linkedin-sync.handler";
import { DisableLinkedInSyncCommand } from "./disable-linkedin-sync.handler";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/linkedin`,
  version: '1',
})
export class LinkedInSyncController {
  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('sync/enable')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Enable(
    @Res() res: Response
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new EnableLinkedInSyncCommand());
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('sync/disable')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Disable(
    @Res() res: Response
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new DisableLinkedInSyncCommand());
    return res.status(HttpStatus.OK).json(result);
  }
}

