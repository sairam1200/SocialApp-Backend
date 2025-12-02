import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Controller, HttpStatus, Param, Post, Res, UseGuards } from "@nestjs/common";
import { HttpContext } from "../../../core/middlewares/httpContext.middleware";
import { FollowActionResultModel } from "../../../domain/contracts/follow.model";
import { ApproveFollowRequestCommand } from "./approve-request.handler";
import { UserAccoutGuard } from "../../../core/passport";

@ApiTags('Social')
@Controller({
  path: `/user`,
  version: '1',
})
export class ApproveFollowRequestController {

  constructor(private readonly commandBus: CommandBus) { }

  @UseGuards(UserAccoutGuard)
  @Post('follow-requests/:followerId/approve')
  @ApiParam({ name: 'followerId', description: 'Follower to approve' })
  @ApiResponse({ status: 200, description: 'OK', type: FollowActionResultModel })
  public async approve(@Param('followerId') followerId: string, @Res() res: Response): Promise<Response> {
    const followedUserId = HttpContext.getCurrentUserId;
    const result = await this.commandBus.execute(new ApproveFollowRequestCommand(followedUserId, followerId));
    return res.status(HttpStatus.OK).send(result);
  }
}
