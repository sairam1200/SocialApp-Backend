import { SubscribeController } from './subscribe/subscribe.endpoint';
import { SubscribeCommandHandler } from './subscribe/subscribe.handler';

const controllers = [SubscribeController];
const handlers = [SubscribeCommandHandler];

const newsletter = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default newsletter;
