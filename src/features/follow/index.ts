import { FollowController } from "./follow/follow.endpoint";
import { FollowUserCommandHandler } from "./follow/follow.handler";
import { UnfollowController } from "./unfollow/unfollow.endpoint";
import { UnfollowUserCommandHandler } from "./unfollow/unfollow.handler";
import { ApproveFollowRequestController } from "./approve-request/approve-request.endpoint";
import { ApproveFollowRequestCommandHandler } from "./approve-request/approve-request.handler";
import { FollowersController } from "./list-followers/list-followers.endpoint";
import { GetFollowersQueryHandler } from "./list-followers/list-followers.handler";
import { FollowingController } from "./list-following/list-following.endpoint";
import { GetFollowingQueryHandler } from "./list-following/list-following.handler";
import { FollowCountsController } from "./count/count.endpoint";
import { GetFollowCountsQueryHandler } from "./count/count.handler";
import { CommonFollowersController } from "./common-followers/common-followers.endpoint";
import { GetCommonFollowersQueryHandler } from "./common-followers/common-followers.handler";

const controllers = [
  FollowController,
  UnfollowController,
  ApproveFollowRequestController,
  FollowersController,
  FollowingController,
  FollowCountsController,
  CommonFollowersController,
];

const handlers = [
  FollowUserCommandHandler,
  UnfollowUserCommandHandler,
  ApproveFollowRequestCommandHandler,
  GetFollowersQueryHandler,
  GetFollowingQueryHandler,
  GetFollowCountsQueryHandler,
  GetCommonFollowersQueryHandler,
];

const follows = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default follows;
