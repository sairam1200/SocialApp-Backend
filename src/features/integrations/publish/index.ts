import { PublishContentController } from './publish-content/publish-content.endpoint';
import { PublishContentCommandHandler } from './publish-content/publish-content.handler';
import { PublishStatusController } from './publish-status/publish-status.endpoint';
import { PublishStatusQueryHandler } from './publish-status/publish-status.handler';
import { PublishCapabilitiesController } from './publish-capabilities/publish-capabilities.endpoint';
import { PublishCapabilitiesQueryHandler } from './publish-capabilities/publish-capabilities.handler';

export { PublishContentController } from './publish-content/publish-content.endpoint';
export { PublishContentCommandHandler } from './publish-content/publish-content.handler';
export { PublishStatusController } from './publish-status/publish-status.endpoint';
export { PublishStatusQueryHandler } from './publish-status/publish-status.handler';
export { PublishCapabilitiesController } from './publish-capabilities/publish-capabilities.endpoint';
export { PublishCapabilitiesQueryHandler } from './publish-capabilities/publish-capabilities.handler';

const publishControllers = [
  PublishContentController,
  PublishStatusController,
  PublishCapabilitiesController,
];

const publishHandlers = [
  PublishContentCommandHandler,
  PublishStatusQueryHandler,
  PublishCapabilitiesQueryHandler,
];

const publish = {
  addControllers: () => publishControllers,
  addHandlers: () => publishHandlers,
};

export default publish;
