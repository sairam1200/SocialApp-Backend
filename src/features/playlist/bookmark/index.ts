import { AddBookmarkContentController } from "./add-content/add-bookmark-content.endpoint";
import { GetBookmarkController } from "./get-bookmark/get-bookmark.endpoint";
import { RemoveBookmarkContentController } from "./remove-content/remove-bookmark-content.endpoint";

const controllers = [
  AddBookmarkContentController,
  GetBookmarkController,
  RemoveBookmarkContentController
];

const handlers = [
];

const bookmark = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default bookmark;