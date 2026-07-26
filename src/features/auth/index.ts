import {
  EnableTwoFactorEmailCommandHandler,
  SendTwoFactorEmailCodeCommandHandler,
} from './2fa/email/2fa-email.handler';
import { TwoFactorEmailController } from './2fa/email/2fa-email.endpoint';
import { Disbale2FACommandHandler } from './2fa/disable/2fa-disable.handler';
import { Enable2FACommandHandler } from './2fa/enable/2fa-enable.handler';
import { Setup2FACommandHandler } from './2fa/setup/2fa-setup.handler';
import {
  GoogleConnectQueryHandler,
  GoogleConnectCallbackQueryHandler,
} from './external/google-auth/google-auth.handler';
import { LoginCommandHandler } from './login/login.handler';
import { RefreshTokenCommandHandler } from './refresh-token/refresh-token.handler';
import { RegisterCommandHandler } from './register/register.handler';
import { ResetPasswordCommandHandler } from './reset-password/reset-password.handler';
import { Verify2FACommandHandler } from './2fa/verify/2fa-verify.handler';
import { LogoutCommandHandler } from './logout/logout.handler';
import { Disable2FAController } from './2fa/disable/2fa-disable.endpoint';
import { LogoutController } from './logout/logout.endpoint';
import { Enable2FAController } from './2fa/enable/2fa-enable.endpoint';
import { Setup2FAController } from './2fa/setup/2fa-setup.endpoint';
import { Verify2FAController } from './2fa/verify/2fa-verify.endpoint';
import { FacebookAuthenticationController } from './external/facebook-auth/facebook-auth.endpoint';
import { GoogleAuthenticationController } from './external/google-auth/google-auth.endpoint';
import { LoginController } from './login/login.endpoint';
import { RefreshTokenController } from './refresh-token/refresh-token.endpoint';
import { RegisterController } from './register/register.endpoint';
import { ResetPasswordController } from './reset-password/reset-password.endpoint';
import {
  FacebookConnectCallbackQueryHandler,
  FacebookConnectQueryHandler,
} from './external/facebook-auth/facebook-auth.handler';
import { VerifyCodeController } from './verify-code/verify-code.endpoint';
import { VerifyCodeCommandHandler } from './verify-code/verify-code.handler';
import { ForgotPasswordController } from './forgot-password/forgot-password.endpoint';
import { ForgotPasswordCommandHandler } from './forgot-password/forgot-password.handler';
import { CurrentUserController } from './current-user/current-user.endpoint';
import { CurrentUserQuery } from './current-user/current-user.handler';
export { LoginController } from './login/login.endpoint';
export { LoginCommandHandler } from './login/login.handler';

export { GoogleAuthenticationController } from './external/google-auth/google-auth.endpoint';
export {
  GoogleConnectCallbackQueryHandler,
  GoogleConnectQueryHandler,
} from './external/google-auth/google-auth.handler';
export { CurrentUserController } from './current-user/current-user.endpoint';

export { CurrentUserQuery } from './current-user/current-user.handler';
export { FacebookAuthenticationController } from './external/facebook-auth/facebook-auth.endpoint';
export {
  FacebookConnectCallbackQueryHandler,
  FacebookConnectQueryHandler,
} from './external/facebook-auth/facebook-auth.handler';

export { ForgotPasswordController } from './forgot-password/forgot-password.endpoint';
export { ForgotPasswordCommandHandler } from './forgot-password/forgot-password.handler';

export { RefreshTokenController } from './refresh-token/refresh-token.endpoint';
export { RefreshTokenCommandHandler } from './refresh-token/refresh-token.handler';

export { RegisterController } from './register/register.endpoint';
export { RegisterCommandHandler } from './register/register.handler';

export { ResetPasswordController } from './reset-password/reset-password.endpoint';
export { ResetPasswordCommandHandler } from './reset-password/reset-password.handler';

export { Setup2FAController } from './2fa/setup/2fa-setup.endpoint';
export { Setup2FACommandHandler } from './2fa/setup/2fa-setup.handler';

export { Disbale2FACommandHandler } from './2fa/disable/2fa-disable.handler';
export { Disable2FAController } from './2fa/disable/2fa-disable.endpoint';

export { Verify2FAController } from './2fa/verify/2fa-verify.endpoint';
export { Verify2FACommandHandler } from './2fa/verify/2fa-verify.handler';

export { Enable2FAController } from './2fa/enable/2fa-enable.endpoint';
export { TwoFactorEmailController } from './2fa/email/2fa-email.endpoint';
export {
  SendTwoFactorEmailCodeCommandHandler,
  EnableTwoFactorEmailCommandHandler,
} from './2fa/email/2fa-email.handler';
export { Enable2FACommandHandler } from './2fa/enable/2fa-enable.handler';

export { LogoutController } from './logout/logout.endpoint';
export { LogoutCommandHandler } from './logout/logout.handler';

const controllers = [
  LoginController,
  RegisterController,
  GoogleAuthenticationController,
  FacebookAuthenticationController,
  RefreshTokenController,
  ResetPasswordController,
  Setup2FAController,
  Enable2FAController,
  TwoFactorEmailController,
  Verify2FAController,
  Disable2FAController,
  LogoutController,
  VerifyCodeController,
  ForgotPasswordController,
  CurrentUserController,
];

const handlers = [
  LoginCommandHandler,
  Verify2FACommandHandler,
  Enable2FACommandHandler,
  SendTwoFactorEmailCodeCommandHandler,
  EnableTwoFactorEmailCommandHandler,
  Setup2FACommandHandler,
  Disbale2FACommandHandler,
  RegisterCommandHandler,
  RefreshTokenCommandHandler,
  ResetPasswordCommandHandler,
  GoogleConnectQueryHandler,
  GoogleConnectCallbackQueryHandler,
  FacebookConnectQueryHandler,
  FacebookConnectCallbackQueryHandler,
  LogoutCommandHandler,
  VerifyCodeCommandHandler,
  ForgotPasswordCommandHandler,
  CurrentUserQuery,
];

const authentication = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default authentication;
