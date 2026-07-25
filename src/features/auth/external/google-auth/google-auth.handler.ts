import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { User } from '../../../../domain/entities';
import logger from '../../../../core/utils/winston.util';
import { getRedirectUrl } from '../../../../core/utils/redirectUrl.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ITokenService } from '../../../../domain/services/itoken.service';
import { IEmailService } from '../../../../domain/services/iemail.service';
import { IIdentityRepository } from '../../../../domain/repositories/iidentity.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { GoogleUserDataType } from '../../../../domain/contracts/youtube.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { UserBiometric } from '../../../../domain/entities/identity/userBiometric.entity';
import { ProfileImagePrivacy } from '../../../../domain/enums';
import { stringUtil } from 'core/utils/string.util';
import { generateInitialImage } from 'core/utils/canvas.util';
import { uploadBase64ToCloudinaryAsync } from 'core/utils/cloudinary.util';
import { UserType } from 'domain/enums';
import { TokenResponseModel } from 'domain/contracts/tokenResponse.model';

const BASE_URL = 'https://www.googleapis.com/oauth2/v2';

export class GoogleCallbaclTokenResponseModel extends TokenResponseModel {
  @ApiProperty()
  googleAccessToken: string;

  @ApiProperty()
  googleAccessTokenExpiresIn: number;

  constructor(request: Partial<GoogleCallbaclTokenResponseModel> = {}) {
    super();
    Object.assign(this, request);
  }
}

export class GoogleConnectQuery {
  model: {
    state: string;
    deviceId: string;
    userAgent: string;
    ipAddress: string;
  };

  constructor(request: Partial<GoogleConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GoogleConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<GoogleConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const googleConnectValidations = Joi.object({
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
  userAgent: Joi.string()
    .required()
    .messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string()
    .required()
    .messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  deviceId: Joi.string()
    .required()
    .messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

const googleConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(GoogleConnectQuery)
export class GoogleConnectQueryHandler implements ICommandHandler<GoogleConnectQuery> {
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(command: GoogleConnectQuery): Promise<void> {
    const { model } = command;
    await googleConnectValidations.validateAsync(model);

    const value = JSON.stringify({
      deviceId: model.deviceId,
      userAgent: model.userAgent,
      ipAddress: model.ipAddress,
    });

    // expires in 15 minutes
    const expiresIn =
      Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    console.log('[OAuth-Debug-Store] storedState:', model.state);
    console.log('[OAuth-Debug-Store] storedValue:', value);
    console.log('[OAuth-Debug-Store] expiresIn (epoch seconds):', expiresIn);
    console.log(
      '[OAuth-Debug-Store] expiresIn (date):',
      new Date(expiresIn * 1000).toISOString(),
    );
    console.log(
      '[OAuth-Debug-Store] tokenExpirationTime used:',
      configs.Token.expirationTime,
    );
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      value,
      null,
      expiresIn,
    );
  }
}

@CommandHandler(GoogleConnectCallbackQuery)
export class GoogleConnectCallbackQueryHandler implements ICommandHandler<GoogleConnectCallbackQuery> {
  constructor(
    @Inject(_const.ITOKEN_SERVICE)
    private readonly tokenService: ITokenService,
    @Inject(_const.IEMAIL_SERVICE)
    private readonly emailService: IEmailService,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
  ) {}

  public async execute(
    query: GoogleConnectCallbackQuery,
  ): Promise<GoogleCallbaclTokenResponseModel> {
    const { model } = query;
    await googleConnectCallbackValidations.validateAsync(model);
    console.log('[OAuth-Debug-Validate] receivedState:', model.state);
    const dataProtectionKey = await this.validateState(model.state);
    const parsedDataProtectionKeyValue = JSON.parse(dataProtectionKey.value);

    const { access_token, expires_in } = await this.fetchToken(model.code);

    const profile = await this.fetchUserData(access_token);
    profile.email = stringUtil.normalizeEmail(profile.email);

    // 1. Find by Google ID
    let user = await this.userRepository.getUserByGoogleIdAsync(profile.id);

    // 2. Find by email if not found by Google ID
    if (!user) {
      user = await this.userRepository.getUserByEmailAsync(profile.email);
      if (user && !user.googleId) {
        user.googleId = profile.id;
        await this.userRepository.updateAsync(user);
      }
    }

    // 3. Create user only if neither lookup matched
    if (!user) {
      const initials = stringUtil.extractInitialsFromName(
        `${profile.given_name} ${profile.family_name}`,
      );
      const base64Image = generateInitialImage(initials);
      const avatar = await uploadBase64ToCloudinaryAsync(base64Image, 'users');
      const defaultProfileImageUrl = avatar.secure_url;

      const entry = new User({
        phoneNumber: '',
        type: UserType.User,
        email: profile.email,
        firstName: profile.given_name,
        lastName: profile.family_name,
        googleId: profile.id,
        emailConfirmed: true,
      });

      user = await this.userRepository.createAsync(entry, crypto.randomUUID());
      await this.userRepository.upsertUserBiometricAsync(
        user.id,
        new UserBiometric({
          profileImageUrl: profile?.picture || null,
          defaultProfileImageUrl: defaultProfileImageUrl,
          privacy: ProfileImagePrivacy.Everyone,
        }),
      );

      await this.sendWelcomeEmail(user);
    }

    if (this.isAccountLockedOrInactive(user)) {
      return this.handleLockedOrInactiveAccount(user);
    }

    const result = await this.handleSuccessfulLogin(
      user,
      parsedDataProtectionKeyValue,
    );
    result.googleAccessToken = access_token;
    result.googleAccessTokenExpiresIn = expires_in;

    return result;
  }

  private async fetchToken(code: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
  }> {
    try {
      const response = await axios.post(`https://oauth2.googleapis.com/token`, {
        client_secret: configs.youtube.clientSecret,
        redirect_uri: getRedirectUrl(configs.google.callbackUrl),
        client_id: configs.youtube.clientId,
        grant_type: 'authorization_code',
        code: code,
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching token from Google', error);
      throw new ApplicationException(
        'Unexpected error during authentication with Google',
      );
    }
  }

  private async fetchUserData(
    accessToken: string,
  ): Promise<GoogleUserDataType> {
    try {
      const response = await axios.get<GoogleUserDataType>(
        `${BASE_URL}/userinfo`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      return response.data;
    } catch (error) {
      logger.error('Error fetching user data from Google', error);
      throw new ApplicationException(
        'Unexpected error during authentication with Google',
      );
    }
  }

  private async validateState(state: string): Promise<DataProtectionKey> {
    console.log('[OAuth-Debug-Validate] querying state:', state);
    const dataProtectionKey =
      await this.dataProtectionKeyRepository.getByKeyAsync(state);
    console.log(
      '[OAuth-Debug-Validate] dataProtectionKey found:',
      !!dataProtectionKey,
    );
    if (dataProtectionKey) {
      console.log('[OAuth-Debug-Validate] stored key:', dataProtectionKey.key);
      console.log(
        '[OAuth-Debug-Validate] stored expiresIn:',
        dataProtectionKey.expiresIn,
      );
      console.log(
        '[OAuth-Debug-Validate] current epoch:',
        Math.floor(Date.now() / 1000),
      );
      console.log(
        '[OAuth-Debug-Validate] expired?:',
        dataProtectionKey.expiresIn < Math.floor(Date.now() / 1000),
      );
    }
    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid state parameter');
    }

    if (dataProtectionKey.expiresIn < Math.floor(Date.now() / 1000)) {
      throw new ApplicationException('State parameter has expired');
    }

    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
    return dataProtectionKey;
  }

  private async handleSuccessfulLogin(
    user: User,
    model: {
      deviceId: string;
      userAgent: string;
      ipAddress: string;
    },
  ): Promise<GoogleCallbaclTokenResponseModel> {
    user.accessFailedCount = 0;

    await this.userRepository.updateAsync(user);

    const access_token = await this.tokenService.generateJwtAsync(user);
    const userToken = await this.userLoginRepository.createAysnc(
      'Gaddr-Google',
      user.id,
      model.deviceId,
      model.userAgent,
      model.ipAddress,
    );

    await this.userRepository.cacheUserAccountAsync(
      user,
      _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC,
    );

    // TODO: Send email notification of login with new ipAddress and deviceInfo

    if (String(user.onboardingStep) !== 'Completed') {
      this.sendWelcomeEmail(user);
    }

    return new GoogleCallbaclTokenResponseModel({
      access_token: access_token,
      refresh_token: userToken.tokenValue,
      message: 'Login successful',
      succeeded: true,
      isLockedOut: false,
      refreshTokenExpiryTime: Math.floor(
        userToken.expiryDateUtc.getTime() / 1000,
      ),
      onboardingCompleted: String(user.onboardingStep) === 'Completed',
    });
  }

  private isAccountLockedOrInactive(user: User): boolean {
    return user.isLockedOut || !user.isActive;
  }

  private handleLockedOrInactiveAccount(
    user: User,
  ): GoogleCallbaclTokenResponseModel {
    const message = this.getAccountLockMessage(user);
    return this.createErrorResponse(message);
  }

  private getAccountLockMessage(user: User): string {
    if (!user.isActive) {
      return 'Your account has been disabled by an administrator.';
    }

    return user.accessFailedCount >= 5
      ? 'Your account is locked due to too many unsuccessful login attempts.'
      : 'Your account has been locked due to suspicious activity.';
  }

  private createErrorResponse(
    message: string,
  ): GoogleCallbaclTokenResponseModel {
    return new GoogleCallbaclTokenResponseModel({ message, succeeded: false });
  }

  private async sendWelcomeEmail(user: User): Promise<void> {
    try {
      await this.emailService.sendTemplatedAsync({
        to: user.email,
        subject: 'Welcome to Gaddr',
        templatePath: 'templates/email/welcome-email-v1.html',
        context: {
          year: new Date().getFullYear(),
        },
      });
    } catch (error) {
      logger.error(`Failed to send welcome email for user ${user.id}`, error);
    }
  }
}
