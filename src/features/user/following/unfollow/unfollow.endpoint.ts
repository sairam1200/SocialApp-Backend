import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import {
  Controller,
  Delete,
  HttpStatus,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { UnfollowUserCommand } from './unfollow.handler';
import { UserAccoutGuard } from '../../../../core/passport';

@ApiTags('Social')
@Controller({
  path: `/user`,
  version: '1',
})
export class UnfollowController {
  constructor(private readonly commandBus: CommandBus) {}

  @UseGuards(UserAccoutGuard)
  @Delete(':userId/unfollow')
  @ApiParam({ name: 'userId', description: 'User to unfollow' })
  @ApiResponse({ status: 204, description: 'No Content' })
  public async unfollow(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<Response> {
    const followerId = HttpContext.getCurrentUserId;
    await this.commandBus.execute(new UnfollowUserCommand(followerId, userId));
    return res.status(HttpStatus.NO_CONTENT).send();
  }
}
