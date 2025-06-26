import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../core/passport/account.guard";
import { PlaylistModel } from "../../../domain/contracts/playlist.model";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { CreatePlaylistCommand, CreatePlaylistModel } from "./create-playlist.handler";

@ApiTags('Playlists')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/playlist`,
  version: '1',
})
export class CreatePlaylistController {

  constructor(private readonly commandBus: CommandBus) { }

  @Post()
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'CONFLICT' })
  @ApiResponse({ status: 201, description: 'CREATED', type: PlaylistModel })
  public async Create(@Body() request: CreatePlaylistModel, @Res() res: Response
  ): Promise<Response> {

    const result = await this.commandBus.execute(new CreatePlaylistCommand({
      model: request
    }));

    res.status(HttpStatus.CREATED).send(result);
    return res;
  }
}