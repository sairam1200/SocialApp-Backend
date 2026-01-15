import { GlobalSearchController } from "./search.endpoint";
import { GlobalSearchQueryHandler } from "./search.handler";

export { GlobalSearchController } from "./search.endpoint";
export { GlobalSearchQueryHandler, GlobalSearchQuery, GlobalSearchRequestModel, GlobalSearchResponseModel } from "./search.handler";

const controllers = [
  GlobalSearchController,
];

const handlers = [
  GlobalSearchQueryHandler,
];

const search = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default search;

