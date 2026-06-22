import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, HttpStatus, Post, Res, UseGuards, Body } from "@nestjs/common";
import { EnableYoutubeSyncCommand } from "./enable-youtube-sync.handler";
import { DisableYoutubeSyncCommand } from "./disable-youtube-sync.handler";
import { YoutubeDataSyncCommand } from "./youtube-data-sync.handler";

class SyncRequestDto {
  @ApiProperty()
  accountId: string;
}

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeSyncController {
  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('sync/enable')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async EnableSync(
    @Res() res: Response
  ): Promise<Response | void> {
    console.log("EnableYoutubeSyncCommand result:");
    
    const result = await this.commandBus.execute(new EnableYoutubeSyncCommand());
    
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('sync/disable')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async DisableSync(
    @Res() res: Response
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new DisableYoutubeSyncCommand());
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('sync')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Sync(
    @Body() body: SyncRequestDto,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new YoutubeDataSyncCommand({ model: { accountId: body.accountId } }));
    return res.status(HttpStatus.OK).json(result);
  }
}

