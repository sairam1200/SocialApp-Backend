import { DiscoverFeedController } from './discover-feed.endpoint';
import { DiscoverFeedQueryHandler } from './discover-feed.handler';

export { DiscoverFeedController } from './discover-feed.endpoint';
export {
  DiscoverFeedQuery,
  DiscoverFeedQueryHandler,
} from './discover-feed.handler';

const controllers = [DiscoverFeedController];
const handlers = [DiscoverFeedQueryHandler];

const discover = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default discover;
