import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { RemovePlaylistMemberCommand } from "./remove-member.handler";
import { UserAccoutGuard } from "../../../core/passport/account.guard";
import { Controller, Delete, HttpStatus, Param, Res, UseGuards } from "@nestjs/common";

@ApiTags('Playlists')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/playlist`,
  version: '1',
})
export class RemovePlaylistMemberController {

  constructor(private readonly commandBus: CommandBus) { }

  @Delete(":id/member/remove/:memberId")
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'CONFLICT' })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  public async Remove(
    @Param('memberId') memberId: string,
    @Param('id') playlistReferenceId: string,
    @Res() res: Response
  ): Promise<Response> {

    await this.commandBus.execute(new RemovePlaylistMemberCommand({
      model: {
        playlistReferenceId,
        memberId
      }
    }));

    res.status(HttpStatus.NO_CONTENT).send();
    return res;
  }
}