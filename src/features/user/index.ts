import { GetUserLinkedAccountsController } from "../profile/get-linked-accounts/get-linked-accounts.endpoint";
import { SuggestUserNameCommandHandler } from "./username/suggest/suggest-username.handler";
import { SuggestUserNameController } from "./username/suggest/suggest-username.endpoint";
import { ChangePasswordCommandHandler } from "./change-password/change-password.handler";
import { ChangePasswordController } from "./change-password/change-password.endpoint";
import { CreateUserCommandHandler } from "./create-user/create-user.handler";
import { EmailInUseCommandHandler } from "./email/inuse/email-inuse.handler";
import { SendVerificationEmailCommandHandler } from "./email/send-verification/send-verification.handler";
import { VerifyEmailCommandHandler } from "./email/verify/verify-email.handler";
import { CreateUserController } from "./create-user/create-user.endpoint";
import { EmailInuseController } from "./email/inuse/email-inuse.endpoint";
import { SendVerificationEmailController } from "./email/send-verification/send-verification.endpoint";
import { VerifyEmailController } from "./email/verify/verify-email.endpoint";
import { GetUsersQueryHandler } from "./get-users/get-users.handler";
import { GetUsersController } from "./get-users/get-users.endpoint";
import { GetUserQueryHandler } from "./get-user/get-user.handler";
import { GetUserController } from "./get-user/get-user.endpoint";
import { UpdateEmailController } from "./email/update/update-email.endpoint";
import { UpdateEmailCommandHandler } from "./email/update/update-email.handler";
import { UpdateUserNameCommandHandler } from "./username/update/update-username.handler";
import { UpdateUserNameController } from "./username/update/update-username.endpoint";
import { UpdateBasicInfoController } from "./update/basic-info/update-basic-info.endpoint";
import { UpdateBasicInfoCommandHandler } from "./update/basic-info/update-basic-info.handler";
import { UpdateTypeController } from "./update/type/update-type.endpoint";
import { UpdateTypeCommandHandler } from "./update/type/update-type.handler";
import { UpdateProfileImageController } from "./update/profile-image/update-profile-image.endpoint";
import { UpdateProfileImageCommandHandler } from "./update/profile-image/update-profile-image.handler";
import { UpdateProfileImagePrivacyController } from "./update/profile-image-privacy/update-profile-image-privacy.endpoint";
import { UpdateProfileImagePrivacyCommandHandler } from "./update/profile-image-privacy/update-profile-image-privacy.handler";
import { UpdatePrivacySettingsController } from "./update/privacy-settings/update-privacy-settings.endpoint";
import { UpdatePrivacySettingsCommandHandler } from "./update/privacy-settings/update-privacy-settings.handler";
import { UpdatePhoneNumberController } from "./phone-number/update/update-phone-number.endpoint";
import { UpdatePhoneNumberCommandHandler } from "./phone-number/update/update-phone-number.handler";
import { ConfirmPhoneNumberController } from "./phone-number/confirm/confirm-phone-number.endpoint";
import { ConfirmPhoneNumberCommandHandler } from "./phone-number/confirm/confirm-phone-number.handler";
import { ActivateUserController } from "./activate-user/activate-user.endpoint";
import { ActivateUserCommandHandler } from "./activate-user/activate-user.handler";
import { ActivateUserRoleController } from "./activate-user-role/activate-user-role.endpoint";
import { ActivateUserRoleCommandHandler } from "./activate-user-role/activate-user-role.handler";
import { DeactivateUserController } from "./deactivate-user/deactivate-user.endpoint";
import { DeactivateUserCommandHandler } from "./deactivate-user/deactivate-user.handler";
import { DeactivateUserRoleController } from "./deactivate-user-role/deactivate-user-role.endpoint";
import { DeactivateUserRoleCommandHandler } from "./deactivate-user-role/deactivate-user-role.handler";
import { GetPreferencesController } from "./settings/preferences/get-preferences/get-preferences.endpoint";
import { GetPreferencesQueryHandler } from "./settings/preferences/get-preferences/get-preferences.handler";
import { UpdateThemeController } from "./settings/preferences/theme/update-theme/update-theme.endpoint";
import { UpdateThemeCommandHandler } from "./settings/preferences/theme/update-theme/update-theme.handler";
import { GetThemeController } from "./settings/preferences/theme/get-theme/get-theme.endpoint";
import { GetThemeQueryHandler } from "./settings/preferences/theme/get-theme/get-theme.handler";
import { GetNotificationSettingController } from "./settings/notification/get/get-notification-setting.endpoint";
import { GetNotificationSettingQueryHandler } from "./settings/notification/get/get-notification-setting.handler";
import { UpdateNotificationSettingController } from "./settings/notification/update/update-notification-setting.endpoint";
import { UpdateNotificationSettingCommandHandler } from "./settings/notification/update/update-notification-setting.handler";
import { CompleteOnboardingController }
from "./onboarding/complete/complete-onboarding.endpoint";

import { CompleteOnboardingCommandHandler }
from "./onboarding/complete/complete-onboarding.handler";

// EXPORTS
export { ChangePasswordController } from "./change-password/change-password.endpoint";
export { ChangePasswordCommand } from "./change-password/change-password.handler";

export { CreateUserController } from "./create-user/create-user.endpoint";
export { CreateUserCommand } from "./create-user/create-user.handler";

export { GetUsersController } from "./get-users/get-users.endpoint"
export { GetUsersQuery } from "./get-users/get-users.handler"

export { GetUserController } from "./get-user/get-user.endpoint"
export { GetUserQuery } from "./get-user/get-user.handler"

export { SuggestUserNameController } from "./username/suggest/suggest-username.endpoint";
export { SuggestUserNameCommand } from "./username/suggest/suggest-username.handler";

export { UpdateUserNameCommand } from "./username/update/update-username.handler";
export { UpdateUserNameController } from "./username/update/update-username.endpoint";

export { UpdateEmailController } from "./email/update/update-email.endpoint";
export { UpdateEmailCommand } from "./email/update/update-email.handler";
export { SendVerificationEmailController } from "./email/send-verification/send-verification.endpoint";
export { SendVerificationEmailCommand } from "./email/send-verification/send-verification.handler";
export { VerifyEmailController } from "./email/verify/verify-email.endpoint";
export { VerifyEmailCommand } from "./email/verify/verify-email.handler";
export { UpdateBasicInfoController } from "./update/basic-info/update-basic-info.endpoint";
export { UpdateBasicInfoCommand } from "./update/basic-info/update-basic-info.handler";
export { UpdateTypeController } from "./update/type/update-type.endpoint";
export { UpdateTypeCommand } from "./update/type/update-type.handler";
export { UpdateProfileImageController } from "./update/profile-image/update-profile-image.endpoint";
export { UpdateProfileImageCommand } from "./update/profile-image/update-profile-image.handler";
export { UpdateProfileImagePrivacyController } from "./update/profile-image-privacy/update-profile-image-privacy.endpoint";
export { UpdateProfileImagePrivacyCommand } from "./update/profile-image-privacy/update-profile-image-privacy.handler";
export { UpdatePrivacySettingsController } from "./update/privacy-settings/update-privacy-settings.endpoint";
export { UpdatePrivacySettingsCommand } from "./update/privacy-settings/update-privacy-settings.handler";
export { UpdatePhoneNumberController } from "./phone-number/update/update-phone-number.endpoint";
export { UpdatePhoneNumberCommand } from "./phone-number/update/update-phone-number.handler";
export { ConfirmPhoneNumberController } from "./phone-number/confirm/confirm-phone-number.endpoint";
export { ConfirmPhoneNumberCommand } from "./phone-number/confirm/confirm-phone-number.handler";
export { ActivateUserController } from "./activate-user/activate-user.endpoint";
export { ActivateUserCommand } from "./activate-user/activate-user.handler";
export { ActivateUserRoleController } from "./activate-user-role/activate-user-role.endpoint";
export { ActivateUserRoleCommand } from "./activate-user-role/activate-user-role.handler";
export { DeactivateUserController } from "./deactivate-user/deactivate-user.endpoint";
export { DeactivateUserCommand } from "./deactivate-user/deactivate-user.handler";
export { DeactivateUserRoleController } from "./deactivate-user-role/deactivate-user-role.endpoint";
export { DeactivateUserRoleCommand } from "./deactivate-user-role/deactivate-user-role.handler";
export { GetPreferencesController } from "./settings/preferences/get-preferences/get-preferences.endpoint";
export { GetPreferencesQuery } from "./settings/preferences/get-preferences/get-preferences.handler";
export { UpdateThemeController } from "./settings/preferences/theme/update-theme/update-theme.endpoint";
export { UpdateThemeCommand } from "./settings/preferences/theme/update-theme/update-theme.handler";
export { GetThemeController } from "./settings/preferences/theme/get-theme/get-theme.endpoint";
export { GetThemeQuery } from "./settings/preferences/theme/get-theme/get-theme.handler";
export { GetNotificationSettingController } from "./settings/notification/get/get-notification-setting.endpoint";
export { GetNotificationSettingQuery } from "./settings/notification/get/get-notification-setting.handler";
export { UpdateNotificationSettingController } from "./settings/notification/update/update-notification-setting.endpoint";
export { UpdateNotificationSettingCommand } from "./settings/notification/update/update-notification-setting.handler";

const controllers = [
  GetUsersController,
  GetUserController,
  EmailInuseController,
  CreateUserController,
  UpdateEmailController,
  SendVerificationEmailController,
  VerifyEmailController,
  ChangePasswordController,
  UpdateUserNameController,
  SuggestUserNameController,
  GetUserLinkedAccountsController,
  UpdateBasicInfoController,
  UpdateTypeController,
  UpdateProfileImageController,
  UpdateProfileImagePrivacyController,
  UpdatePrivacySettingsController,
  UpdatePhoneNumberController,
  ConfirmPhoneNumberController,
  ActivateUserController,
  ActivateUserRoleController,
  DeactivateUserController,
  DeactivateUserRoleController,
  GetPreferencesController,
  GetThemeController,
  UpdateThemeController,
  GetNotificationSettingController,
  UpdateNotificationSettingController,
  CompleteOnboardingController,
];

const handlers = [
  GetUsersQueryHandler,
  GetUserQueryHandler,
  CreateUserCommandHandler,
  EmailInUseCommandHandler,
  UpdateEmailCommandHandler,
  SendVerificationEmailCommandHandler,
  VerifyEmailCommandHandler,
  ChangePasswordCommandHandler,
  UpdateUserNameCommandHandler,
  SuggestUserNameCommandHandler,
  UpdateBasicInfoCommandHandler,
  UpdateTypeCommandHandler,
  UpdateProfileImageCommandHandler,
  UpdateProfileImagePrivacyCommandHandler,
  UpdatePrivacySettingsCommandHandler,
  UpdatePhoneNumberCommandHandler,
  ConfirmPhoneNumberCommandHandler,
  ActivateUserCommandHandler,
  ActivateUserRoleCommandHandler,
  DeactivateUserCommandHandler,
  DeactivateUserRoleCommandHandler,
  GetPreferencesQueryHandler,
  GetThemeQueryHandler,
  UpdateThemeCommandHandler,
  GetNotificationSettingQueryHandler,
  UpdateNotificationSettingCommandHandler,
  CompleteOnboardingCommandHandler,
];

const users = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default users;
