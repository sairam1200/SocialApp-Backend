import { ChangePasswordController } from "./change-password/change-password.endpoint";
import { ChangePasswordCommandHandler } from "./change-password/change-password.handler";
import { CreateUserController } from "./create-user/create-user.endpoint";
import { CreateUserCommandHandler } from "./create-user/create-user.handler";
import { GetUserLinkedAccountsController } from "../profile/get-linked-accounts/get-linked-accounts.endpoint";
import { GetUserController } from "./get-user/get-user.endpoint";
import { GetUserQueryHandler } from "./get-user/get-user.handler";
import { GetUsersController } from "./get-users/get-users.endpoint";
import { GetUsersQueryHandler } from "./get-users/get-users.handler";
import { SuggestUserNameController } from "./suggest-username/suggest-username.endpoint";
import { SuggestUserNameCommandHandler } from "./suggest-username/suggest-username.handler";
import { UpdateUserController } from "./update-user/update-user.endpoint";
import { UpdateUserCommandHandler } from "./update-user/update-user.handler";

// EXPORTS
export { ChangePasswordController } from "./change-password/change-password.endpoint";
export { ChangePasswordCommandHandler } from "./change-password/change-password.handler";

export { CreateUserController } from "./create-user/create-user.endpoint";
export { CreateUserCommandHandler } from "./create-user/create-user.handler";

export { GetUsersController } from "./get-users/get-users.endpoint"
export { GetUsersQueryHandler } from "./get-users/get-users.handler"

export { GetUserController } from "./get-user/get-user.endpoint"
export { GetUserQueryHandler } from "./get-user/get-user.handler"

export { UpdateUserController } from "./update-user/update-user.endpoint"
export { UpdateUserCommandHandler } from "./update-user/update-user.handler"


export { SuggestUserNameController } from "./suggest-username/suggest-username.endpoint";
export { SuggestUserNameCommandHandler } from "./suggest-username/suggest-username.handler";

const controllers = [

  GetUsersController,
  GetUserController,
  CreateUserController,
  UpdateUserController,
  ChangePasswordController,
  GetUserLinkedAccountsController,
  SuggestUserNameController
];

const handlers = [

  GetUsersQueryHandler,
  GetUserQueryHandler,
  CreateUserCommandHandler,
  UpdateUserCommandHandler,
  ChangePasswordCommandHandler,
  SuggestUserNameCommandHandler,
];

const users = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default users;