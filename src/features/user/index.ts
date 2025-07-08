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

export { GetUserLinkedAccountsController } from "./get-linked-accounts/get-linked-accounts.endpoint"
export { GetUserLinkedAccountsQueryHandler } from "./get-linked-accounts/get-linked-accounts.handler"

const controllers = [

];

const handlers = [

];

const users = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default users;