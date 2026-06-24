import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { User } from '../../../../domain/entities';
import logger from '../../../../core/utils/winston.util';
import { getRedirectUrl } from '../../../../core/utils/redirectUrl.util';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ITokenService } from '../../../../domain/services/itoken.service';
import { IEmailService } from '../../../../domain/services/iemail.service';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import {
  GoogleUserDataType,
  YoutubeChannelDataType,
} from '../../../../domain/contracts/youtube.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { UserBiometric } from '../../../../domain/entities/identity/userBiometric.entity';
import { ProfileImagePrivacy } from '../../../../domain/enums';
import { SendVerificationEmailCommand } from '../../../user/email/send-verification/send-verification.handler';
import { stringUtil } from 'core/utils/string.util';
import { generateInitialImage } from 'core/utils/canvas.util';
import { uploadBase64ToCloudinaryAsync } from 'core/utils/cloudinary.util';
import { UserType } from 'domain/enums';
import { TokenResponseModel } from 'domain/contracts/tokenResponse.model';
import { serializeObject } from 'core/utils/serialization.util';

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
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  userAgent: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  deviceId: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

const googleConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(GoogleConnectQuery)
export class GoogleConnectQueryHandler
  implements ICommandHandler<GoogleConnectQuery> {
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

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
    console.log('[OAuth-Debug-Store] expiresIn (date):', new Date(expiresIn * 1000).toISOString());
    console.log('[OAuth-Debug-Store] tokenExpirationTime used:', configs.Token.expirationTime);
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      value,
      '',
      expiresIn,
    );
  }
}

@CommandHandler(GoogleConnectCallbackQuery)
export class GoogleConnectCallbackQueryHandler
  implements ICommandHandler<GoogleConnectCallbackQuery> {
  constructor(
    @Inject(_const.ITOKEN_SERVICE)
    private readonly tokenService: ITokenService,
    @Inject(_const.IEMAIL_SERVICE)
    private readonly emailService: IEmailService,
    private readonly commandBus: CommandBus,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) { }

  public async execute(query: GoogleConnectCallbackQuery): Promise<any> {
    const { model } = query;
    await googleConnectCallbackValidations.validateAsync(model);
    console.log('[OAuth-Debug-Validate] receivedState:', model.state);
    const dataProtectionKey = await this.validateState(model.state);
    const parsedDataProtectionKeyValue = JSON.parse(dataProtectionKey.value);

    const { access_token, refresh_token, expires_in } = await this.fetchToken(
      model.code,
    );
    const tokenValue = serializeObject({ access_token, refresh_token, expires_in });

    const userData = await this.fetchUserData(access_token);

    // 1. Search by provider account ID
    const linkedAccountByProvider = await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(
      _const.PLATFORMS.YOUTUBE,
      userData.profile.id,
    );

    let user: User | null = linkedAccountByProvider
      ? await this.userRepository.getUserByIdAsync(linkedAccountByProvider.userId)
      : null;

    // 2. Search by email if not found by provider ID
    if (!user) {
      user = await this.userRepository.getUserByEmailAsync(
        userData.profile.email,
      );
    }

    // 3. Create new user only if neither lookup matched
    if (!user) {
      const initials = stringUtil.extractInitialsFromName(`${userData.profile.given_name} ${userData.profile.family_name}`);
      const base64Image = generateInitialImage(initials);
      const avatar = await uploadBase64ToCloudinaryAsync(base64Image, "users");
      const defaultProfileImageUrl = avatar.secure_url;

      const entry = new User({
        phoneNumber: "",
        type: UserType.User,
        email: userData.profile.email,
        firstName: userData.profile.given_name,
        lastName: userData.profile.family_name
      });

      user = await this.userRepository.createAsync(entry, '');
      await this.userRepository.upsertUserBiometricAsync(user.id, new UserBiometric({
        profileImageUrl: userData?.profile?.picture || null,
        defaultProfileImageUrl: defaultProfileImageUrl,
        privacy: ProfileImagePrivacy.Everyone,
      }))

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

    // TODO: Send email notification of login with new ipAddress and deviceInfo

    // TODO: Save user login
    let linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndEmailAsync(
        _const.PLATFORMS.YOUTUBE,
        user.email,
      );
    if (linkedAccount) {
      linkedAccount.userName = '';
      linkedAccount.profileImage = userData.profile.picture;
      (linkedAccount.followersCount = Number.parseInt(
        userData.channel.items[0].statistics.subscriberCount,
      )),
        (linkedAccount.followingCount = 0); // TODO : retreive this
      linkedAccount.metaData = {
        hd: userData.profile.hd,
        locale: userData.profile.locale,
        name: userData.profile.name,
        channel: {
          id: userData.channel.items[0].id,
          title: userData.channel.items[0].snippet.title,
          desciption: userData.channel.items[0].snippet.description,
          viewCount: userData.channel.items[0].statistics.viewCount,
          videoCount: userData.channel.items[0].statistics.videoCount,
          thumbthumbnail:
            userData.channel.items[0].snippet.thumbnails.default.url,
        },
      };
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      linkedAccount = await this.linkedAccountRepository.createAsync(
        new LinkedAccount({
          platform: _const.PLATFORMS.YOUTUBE,
          userId: user.id,
          email: userData.profile.email,
          externalId: userData.profile.id,
          userName: '',
          profileImage: userData.profile.picture,
          followersCount: Number.parseInt(
            userData.channel.items[0].statistics.subscriberCount,
          ),
          followingCount: 0, // TODO : retreive this
          metaData: {
            hd: userData.profile.hd,
            locale: userData.profile.locale,
            name: userData.profile.name,
            channel: {
              id: userData.channel.items[0].id,
              title: userData.channel.items[0].snippet.title,
              desciption: userData.channel.items[0].snippet.description,
              viewCount: userData.channel.items[0].statistics.viewCount,
              videoCount: userData.channel.items[0].statistics.videoCount,
              thumbnail:
                userData.channel.items[0].snippet.thumbnails.default.url,
            },
          },
        }),
      );
    }

    let existingAccountLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        user.id,
        _const.PLATFORMS.YOUTUBE,
      );
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = tokenValue;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(
        Date.now() + 100 * 24 * 60 * 60 * 1000,
      );
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.YOUTUBE,
        user.id,
        '',
        '',
        '',
        tokenValue,
        new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
      );
    }

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
      throw new ApplicationException('Unexpected error during authentication with Google');
    }
  }

  private async fetchUserData(accessToken: string): Promise<{
    profile: GoogleUserDataType;
    channel: YoutubeChannelDataType;
  }> {
    try {
      const response = await axios.get<GoogleUserDataType>(
        `${BASE_URL}/userinfo`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const channelResponse = await axios.get<YoutubeChannelDataType>(
        'https://www.googleapis.com/youtube/v3/channels',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            part: 'snippet,contentDetails,statistics,brandingSettings',
            mine: 'true',
          },
        },
      );

      return {
        profile: response.data,
        channel: channelResponse.data,
      };
    } catch (error) {
      logger.error('Error fetching user data from Google', error);
      throw new ApplicationException('Unexpected error during authentication with Google');
    }
  }

  private async validateState(state: string): Promise<DataProtectionKey> {
    console.log('[OAuth-Debug-Validate] querying state:', state);
    const dataProtectionKey =
      await this.dataProtectionKeyRepository.getByKeyAsync(state);
    console.log('[OAuth-Debug-Validate] dataProtectionKey found:', !!dataProtectionKey);
    if (dataProtectionKey) {
      console.log('[OAuth-Debug-Validate] stored key:', dataProtectionKey.key);
      console.log('[OAuth-Debug-Validate] stored expiresIn:', dataProtectionKey.expiresIn);
      console.log('[OAuth-Debug-Validate] current epoch:', Math.floor(Date.now() / 1000));
      console.log('[OAuth-Debug-Validate] expired?:', dataProtectionKey.expiresIn < Math.floor(Date.now() / 1000));
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

    await this.userRepository.cacheUserAccountAsync(user, _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC);

    // TODO: Send email notification of login with new ipAddress and deviceInfo
    return new GoogleCallbaclTokenResponseModel({
      access_token: access_token,
      refresh_token: userToken.tokenValue,
      message: 'Login successful',
      succeeded: true,
      isLockedOut: false,
      refreshTokenExpiryTime: Math.floor(userToken.expiryDateUtc.getTime() / 1000),
    });
  }

  private isAccountLockedOrInactive(user: User): boolean {
    return user.isLockedOut || !user.isActive;
  }

  private handleLockedOrInactiveAccount(user: User): GoogleCallbaclTokenResponseModel {
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

  private createErrorResponse(message: string): GoogleCallbaclTokenResponseModel {
    return new GoogleCallbaclTokenResponseModel({ message, succeeded: false });
  }

  private async sendWelcomeEmail(user: User): Promise<void> {
    try {
      await this.emailService.sendTemplatedAsync({
        to: user.email,
        subject: "Welcome to Gaddr",
        templatePath: "templates/email/welcome-email-v1.html",
        context: {
          year: new Date().getFullYear(),
        },
      });
    } catch (error) {
      logger.error(`Failed to send welcome email for user ${user.id}`, error);
    }
  }
}
