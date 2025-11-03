import { GetUserLinkedAccountsController } from "../profile/get-linked-accounts/get-linked-accounts.endpoint";
import { SuggestUserNameCommandHandler } from "./suggest-username/suggest-username.handler";
import { SuggestUserNameController } from "./suggest-username/suggest-username.endpoint";
import { ChangePasswordCommandHandler } from "./change-password/change-password.handler";
import { ChangePasswordController } from "./change-password/change-password.endpoint";
import { CreateUserCommandHandler } from "./create-user/create-user.handler";
import { UpdateUserCommandHandler } from "./update-user/update-user.handler";
import { EmailInUseCommandHandler } from "./email/inuse/email-inuse.handler";
import { UpdateUserController } from "./update-user/update-user.endpoint";
import { CreateUserController } from "./create-user/create-user.endpoint";
import { EmailInuseController } from "./email/inuse/email-inuse.endpoint";
import { GetUsersQueryHandler } from "./get-users/get-users.handler";
import { GetUsersController } from "./get-users/get-users.endpoint";
import { GetUserQueryHandler } from "./get-user/get-user.handler";
import { GetUserController } from "./get-user/get-user.endpoint";

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
  UpdateUserController,
  EmailInuseController,
  CreateUserController,
  ChangePasswordController,
  GetUserLinkedAccountsController,
  SuggestUserNameController,
];

const handlers = [

  GetUsersQueryHandler,
  GetUserQueryHandler,
  CreateUserCommandHandler,
  UpdateUserCommandHandler,
  EmailInUseCommandHandler,
  ChangePasswordCommandHandler,
  SuggestUserNameCommandHandler,
];

const users = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default users;