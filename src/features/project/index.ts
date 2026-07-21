import { ProjectSearchController } from './search-projects.endpoint';
import { SearchProjectsQueryHandler } from './search-projects.handler';

const controllers = [ProjectSearchController];
const handlers = [SearchProjectsQueryHandler];

const project = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default project;
