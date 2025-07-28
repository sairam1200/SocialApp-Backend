export { LoginController } from "./login/login.endpoint";
export { LoginCommandHandler } from "./login/login.handler";

export { GoogleAuthenticationController } from "./external/google-auth/google-auth.endpoint";
export { GoogleConnectCallbackQueryHandler, GoogleConnectQueryHandler } from "./external/google-auth/google-auth.handler";

export { FacebookAuthenticationController } from "./external/facebook-auth/facebook-auth.endpoint";
export { FacebookConnectCallbackQueryHandler, FacebookConnectQueryHandler } from "./external/facebook-auth/facebook-auth.handler";

export { ForgotPasswordController } from "./forgot-password/forgot-password.endpoint";
export { ForgotPasswordCommandHandler } from "./forgot-password/forgot-password.handler";

export { RefreshTokenController } from "./refresh-token/refresh-token.endpoint";
export { RefreshTokenCommandHandler } from "./refresh-token/refresh-token.handler";

export { RegisterController } from "./register/register.endpoint";
export { RegisterCommandHandler } from "./register/register.handler";

export { ResetPasswordController } from "./reset-password/reset-password.endpoint";
export { ResetPasswordCommandHandler } from "./reset-password/reset-password.handler";

export { Setup2FAController } from "./2fa/setup/2fa-setup.endpoint";
export { Setup2FACommandHandler } from "./2fa/setup/2fa-setup.handler";

export { Disbale2FACommandHandler } from "./2fa/disable/2fa-disable.handler";
export { Disable2FAController } from "./2fa/disable/2fa-disable.endpoint";

export { Verify2FAController } from "./2fa/verify/2fa-verify.endpoint"
export { Verify2FACommandHandler as Verfiy2FACommandHandler } from "./2fa/verify/2fa-verify.handler"

export { Enable2FAController } from "./2fa/enable/2fa-enable.endpoint"
export { Enable2FACommandHandler } from "./2fa/enable/2fa-enable.handler"

const controllers = [

];

const handlers = [
  
];

const authentication = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default authentication;