import { CommunityFeedController } from './feed.endpoint';
import { CommunityComposerController } from './composer.endpoint';
import { CommunityProfileController } from './profile.endpoint';
import { CommunityCommerceController } from './commerce.endpoint';
import { CommunityStreamController } from './stream.endpoint';
import { CommunityGrowthController } from './growth.endpoint';
import { CommunityLearningController } from './learning.endpoint';
import { CommunityMessagingController } from './messaging.endpoint';

/**
 * Route order matters here.
 *
 * Nest matches controllers in registration order, and several of these share
 * the `/community` prefix. `CommunityFeedController` owns `posts/:postId`
 * while `CommunityComposerController` owns `posts/:postId/publish` — different
 * methods, so they do not collide, but a future literal segment that could be
 * read as a `:param` must be registered before the parameterised route.
 */
const controllers = [
  CommunityProfileController,
  CommunityFeedController,
  CommunityComposerController,
  CommunityGrowthController,
  CommunityCommerceController,
  CommunityStreamController,
  CommunityLearningController,
  CommunityMessagingController,
];

const community = {
  addControllers: () => controllers,
  /** No CQRS handlers — see `README.md` for why this feature is service-based. */
  addHandlers: () => [],
};

export default community;

export { CommunityFeedController } from './feed.endpoint';
export { CommunityComposerController } from './composer.endpoint';
export { CommunityProfileController } from './profile.endpoint';
export { CommunityCommerceController } from './commerce.endpoint';
export { CommunityStreamController } from './stream.endpoint';
export { CommunityGrowthController } from './growth.endpoint';
export { CommunityLearningController } from './learning.endpoint';
export { CommunityMessagingController } from './messaging.endpoint';
export { splitList, clampInt } from './feed.endpoint';
export { maskEmail } from './growth.endpoint';
