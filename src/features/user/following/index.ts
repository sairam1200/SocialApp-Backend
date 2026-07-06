import { FollowController } from './follow/follow.endpoint';
import { FollowUserCommandHandler } from './follow/follow.handler';
import { UnfollowController } from './unfollow/unfollow.endpoint';
import { UnfollowUserCommandHandler } from './unfollow/unfollow.handler';
import { ApproveFollowRequestController } from './approve-request/approve-request.endpoint';
import { ApproveFollowRequestCommandHandler } from './approve-request/approve-request.handler';
import { FollowersController } from './get-followers/get-followers.endpoint';
import { GetFollowersQueryHandler } from './get-followers/get-followers.handler';
import { FollowingController } from './get-following/get-following.endpoint';
import { GetFollowingQueryHandler } from './get-following/get-following.handler';
import { FollowCountsController } from './count/count.endpoint';
import { GetFollowCountsQueryHandler } from './count/count.handler';
import { CommonFollowersController } from './common-followers/common-followers.endpoint';
import { GetCommonFollowersQueryHandler } from './common-followers/common-followers.handler';
import { FollowStatusController } from './follow-status/follow-status.endpoint';
import { GetFollowStatusQueryHandler } from './follow-status/follow-status.handler';

const controllers = [
  FollowController,
  UnfollowController,
  ApproveFollowRequestController,
  FollowersController,
  FollowingController,
  FollowCountsController,
  CommonFollowersController,
  FollowStatusController,
];

const handlers = [
  FollowUserCommandHandler,
  UnfollowUserCommandHandler,
  ApproveFollowRequestCommandHandler,
  GetFollowersQueryHandler,
  GetFollowingQueryHandler,
  GetFollowCountsQueryHandler,
  GetCommonFollowersQueryHandler,
  GetFollowStatusQueryHandler,
];

const follows = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default follows;
