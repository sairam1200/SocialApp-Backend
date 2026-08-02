import { AddBookmarkContentController } from './add-content/add-bookmark-content.endpoint';
import { CheckBookmarkController } from './check-bookmark/check-bookmark.endpoint';
import { GetBookmarkController } from './get-bookmark/get-bookmark.endpoint';
import { ListBookmarksController } from './list-bookmarks/list-bookmarks.endpoint';
import { ListBookmarksQueryHandler } from './list-bookmarks/list-bookmarks.handler';
import { GetBookmarkContentsQueryHandler } from './get-bookmark/get-bookmark-by-content-stream.handler';
import { BookmarkCountController } from './bookmark-count/bookmark-count.endpoint';
import { BookmarkCountQueryHandler } from './bookmark-count/bookmark-count.handler';
import { RemoveBookmarkContentController } from './remove-content/remove-bookmark-content.endpoint';

const controllers = [
  AddBookmarkContentController,
  CheckBookmarkController,
  GetBookmarkController,
  ListBookmarksController,
  BookmarkCountController,
  RemoveBookmarkContentController,
];

const handlers = [
  ListBookmarksQueryHandler,
  BookmarkCountQueryHandler,
  GetBookmarkContentsQueryHandler,
];

const bookmark = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default bookmark;
