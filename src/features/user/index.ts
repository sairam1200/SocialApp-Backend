import { GetUserLinkedAccountsController } from "../profile/get-linked-accounts/get-linked-accounts.endpoint";
import { SuggestUserNameCommandHandler } from "./username/suggest/suggest-username.handler";
import { SuggestUserNameController } from "./username/suggest/suggest-username.endpoint";
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
import { UpdateEmailController } from "./email/update/update-email.endpoint";
import { UpdateEmailCommandHandler } from "./email/update/update-email.handler";
import { UpdateUserNameCommandHandler } from "./username/update/update-username.handler";
import { UpdateUserNameController } from "./username/update/update-username.endpoint";

// EXPORTS
export { ChangePasswordController } from "./change-password/change-password.endpoint";
export { ChangePasswordCommand } from "./change-password/change-password.handler";

export { CreateUserController } from "./create-user/create-user.endpoint";
export { CreateUserCommand } from "./create-user/create-user.handler";

export { GetUsersController } from "./get-users/get-users.endpoint"
export { GetUsersQuery } from "./get-users/get-users.handler"

export { GetUserController } from "./get-user/get-user.endpoint"
export { GetUserQuery } from "./get-user/get-user.handler"

export { UpdateUserController } from "./update-user/update-user.endpoint"
export { UpdateUserCommand } from "./update-user/update-user.handler"

export { SuggestUserNameController } from "./username/suggest/suggest-username.endpoint";
export { SuggestUserNameCommand } from "./username/suggest/suggest-username.handler";

export { UpdateUserNameCommand } from "./username/update/update-username.handler";
export { UpdateUserNameController } from "./username/update/update-username.endpoint";

export { UpdateEmailController } from "./email/update/update-email.endpoint";
export { UpdateEmailCommand } from "./email/update/update-email.handler";

const controllers = [
  GetUsersController,
  GetUserController,
  UpdateUserController,
  EmailInuseController,
  CreateUserController,
  UpdateEmailController,
  ChangePasswordController,
  UpdateUserNameController,
  SuggestUserNameController,
  GetUserLinkedAccountsController,
];

const handlers = [
  GetUsersQueryHandler,
  GetUserQueryHandler,
  CreateUserCommandHandler,
  UpdateUserCommandHandler,
  EmailInUseCommandHandler,
  UpdateEmailCommandHandler,
  ChangePasswordCommandHandler,
  UpdateUserNameCommandHandler,
  SuggestUserNameCommandHandler,
];

const users = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default users;