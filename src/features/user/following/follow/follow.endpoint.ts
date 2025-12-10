import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiTags, ApiResponse, ApiParam } from "@nestjs/swagger";
import { Controller, HttpStatus, Param, Post, Res, UseGuards } from "@nestjs/common";
import { FollowModel } from "../../../../domain/contracts/follow.model";
import { FollowUserCommand } from "./follow.handler";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { UserAccoutGuard } from "../../../../core/passport";

@ApiTags('Social')
@Controller({
  path: `/user`,
  version: '1',
})
export class FollowController {

  constructor(private readonly commandBus: CommandBus) { }

  @UseGuards(UserAccoutGuard)
  @Post(':userId/follow')
  @ApiParam({ name: 'userId', description: 'User to follow' })
  @ApiResponse({ status: 201, description: 'Created', type: FollowModel })
  public async follow(@Param('userId') userId: string, @Res() res: Response): Promise<Response> {
    const followerId = HttpContext.getCurrentUserId;
    const result = await this.commandBus.execute(new FollowUserCommand(followerId, userId));
    return res.status(HttpStatus.CREATED).send(result);
  }
}
