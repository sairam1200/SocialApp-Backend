import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";
import { Controller, Delete, HttpStatus, Param, Res, UseGuards } from "@nestjs/common";
import { FollowActionResultModel } from "../../../../domain/contracts/follow.model";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { UnfollowUserCommand } from "./unfollow.handler";
import { UserAccoutGuard } from "../../../../core/passport";

@ApiTags('Social')
@Controller({
  path: `/user`,
  version: '1',
})
export class UnfollowController {

  constructor(private readonly commandBus: CommandBus) { }

  @UseGuards(UserAccoutGuard)
  @Delete(':userId/unfollow')
  @ApiParam({ name: 'userId', description: 'User to unfollow' })
  @ApiResponse({ status: 200, description: 'OK', type: FollowActionResultModel })
  public async unfollow(@Param('userId') userId: string, @Res() res: Response): Promise<Response> {
    const followerId = HttpContext.getCurrentUserId;
    const result = await this.commandBus.execute(new UnfollowUserCommand(followerId, userId));
    return res.status(HttpStatus.OK).send(result);
  }
}
