import { GetUserLinkedAccountsController } from "./get-linked-accounts/get-linked-accounts.endpoint";
import { GetUserLinkedAccountsQueryHandler } from "./get-linked-accounts/get-linked-accounts.handler";
import { GetProfileController } from "./get/get-profile.endpoint";
import { GetProfileQueryHandler } from "./get/get-profile.handler";
import { CreateManualProfileController } from "./manual/create-manual-profile/create-manual-profile.endpoint";
import { CreateManualProfileCommandHandler } from "./manual/create-manual-profile/create-manual-profile.handler";
import { DeleteManualProfileController } from "./manual/delete-manual-profile/delete-manual-profile.endpoint";
import { DeleteManualProfileCommandHandler } from "./manual/delete-manual-profile/delete-manual-profile.handler";
import { GetUserManualProfilesController } from "./manual/get-manual-profiles/get-manual-profiles.endpoint";
import { GetUserManualProfilesQueryHandler } from "./manual/get-manual-profiles/get-manual-profiles.handler";
import { ReorderManualProfileController } from "./manual/reorder-manual-profile/reorder-manual-profile.endpoint";
import { ReorderManualProfileCommandHandler } from "./manual/reorder-manual-profile/reorder-manual-profile.handler";
import { SearchManualProfileController } from "./manual/search-manual-profile/search-manual-profile.endpoint";
import { SearchManualProfileQueryHandler } from "./manual/search-manual-profile/search-manual-profile.handler";
import { UpdateManualProfileController } from "./manual/update-manual-profile/update-manual-profile.endpoint";
import { UpdateManualProfileCommandHandler } from "./manual/update-manual-profile/update-manual-profile.handler";

export { GetUserLinkedAccountsController } from "./get-linked-accounts/get-linked-accounts.endpoint";
export { GetUserLinkedAccountsQueryHandler } from "./get-linked-accounts/get-linked-accounts.handler";
export { CreateManualProfileController } from "./manual/create-manual-profile/create-manual-profile.endpoint";
export { CreateManualProfileCommandHandler } from "./manual/create-manual-profile/create-manual-profile.handler";
export { UpdateManualProfileController } from "./manual/update-manual-profile/update-manual-profile.endpoint";
export { UpdateManualProfileCommandHandler } from "./manual/update-manual-profile/update-manual-profile.handler";
export { DeleteManualProfileController } from "./manual/delete-manual-profile/delete-manual-profile.endpoint";
export { DeleteManualProfileCommandHandler } from "./manual/delete-manual-profile/delete-manual-profile.handler";
export { GetUserManualProfilesController } from "./manual/get-manual-profiles/get-manual-profiles.endpoint";
export { GetUserManualProfilesQueryHandler } from "./manual/get-manual-profiles/get-manual-profiles.handler";
export { SearchManualProfileController } from "./manual/search-manual-profile/search-manual-profile.endpoint";
export { SearchManualProfileQuery, SearchManualProfileQueryHandler } from "./manual/search-manual-profile/search-manual-profile.handler";
export { GetProfileController } from "./get/get-profile.endpoint";
export { GetProfileQuery, GetProfileQueryHandler } from "./get/get-profile.handler";

const controllers = [
  GetUserLinkedAccountsController,
  GetUserManualProfilesController,
  DeleteManualProfileController,
  UpdateManualProfileController,
  CreateManualProfileController,
  ReorderManualProfileController,
  SearchManualProfileController,
  GetProfileController,
];

const handlers = [
  GetUserLinkedAccountsQueryHandler,
  GetUserManualProfilesQueryHandler,
  DeleteManualProfileCommandHandler,
  UpdateManualProfileCommandHandler,
  CreateManualProfileCommandHandler,
  ReorderManualProfileCommandHandler,
  SearchManualProfileQueryHandler,
  GetProfileQueryHandler,
];

const profile = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default profile;
