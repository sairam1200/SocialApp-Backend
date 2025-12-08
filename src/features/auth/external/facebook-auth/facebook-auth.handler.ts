import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { User } from '../../../../domain/entities';
import { UserType } from '../../../../domain/enums';
import logger from '../../../../core/utils/winston.util';
import { ProfileImagePrivacy } from '../../../../domain/enums';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { stringUtil } from '../../../../core/utils/string.util';
import { generateInitialImage } from '../../../../core/utils/canvas.util';
import { ITokenService } from '../../../../domain/services/itoken.service';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import { FacebookUserDataModel } from '../../../../domain/contracts/facebook.model';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { uploadBase64ToCloudinaryAsync } from '../../../../core/utils/cloudinary.util';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { UserBiometric } from '../../../../domain/entities/identity/userBiometric.entity';
import { IUserLoginRepository } from '../../../../domain/repositories/irefreshtoken.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { TokenResponseModel } from 'domain/contracts/tokenResponse.model';
import { IEmailService } from 'domain/services/iemail.service';
import { SendVerificationEmailCommand } from 'features/user';

const GRAPH_BASE = 'https://graph.facebook.com/v23.0';

export class FacebookConnectQuery {
  model: {
    state: string;
    deviceId: string;
    userAgent: string;
    ipAddress: string;
  };

  constructor(request: Partial<FacebookConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class FacebookConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<FacebookConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

// Facebook-specific token response model
export class FacebookCallbackTokenResponseModel extends TokenResponseModel {

  @ApiProperty({ required: false })
  facebookAccessToken?: string;

  @ApiProperty({ required: false })
  facebookAccessTokenExpiresIn?: number;

  constructor(request: Partial<FacebookCallbackTokenResponseModel> = {}) {
    super();
    Object.assign(this, request);
  }
}

const facebookConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(FacebookConnectQuery)
export class FacebookConnectQueryHandler implements ICommandHandler<FacebookConnectQuery> {
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(query: FacebookConnectQuery): Promise<void> {
    const { model } = query;

    // expires in 15 minutes
    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      JSON.stringify({
        deviceId: model.deviceId,
        userAgent: model.userAgent,
        ipAddress: model.ipAddress,
      }),
      "", // No userId yet since this is login (not integration)
      expiresIn
    );
  }
}

@CommandHandler(FacebookConnectCallbackQuery)
export class FacebookConnectCallbackQueryHandler implements ICommandHandler<FacebookConnectCallbackQuery> {
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

  public async execute(query: FacebookConnectCallbackQuery): Promise<FacebookCallbackTokenResponseModel> {
    const { model } = query;
    await facebookConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateState(model.state);
    const parsedDataProtectionKeyValue = JSON.parse(dataProtectionKey.value);

    const shortLivedToken = await this.fetchShortLivedToken(model.code);
    const { access_token, expires_in } = await this.fetchLongLivedToken(shortLivedToken);

    const userData = await this.fetchUserData(access_token);
    let user = await this.userRepository.getUserByEmailAsync(userData.email);
    if (!user) {
      const firstName = userData.name?.split(' ')[0] || 'Facebook';
      const lastName = userData.name?.split(' ').slice(1).join(' ') || 'User';

      const initials = stringUtil.extractInitialsFromName(`${firstName} ${lastName}`);
      const base64Image = generateInitialImage(initials);
      const avatar = await uploadBase64ToCloudinaryAsync(base64Image, "users");
      const defaultProfileImageUrl = avatar.secure_url;

      const entry = new User({
        email: userData.email,
        firstName: firstName,
        lastName: lastName,
        emailConfirmed: true,
        type: UserType.User,
      });

      user = await this.userRepository.createAsync(entry, '');
      await this.userRepository.upsertUserBiometricAsync(user.id, new UserBiometric({
        profileImageUrl: userData.picture?.data?.url || null,
        defaultProfileImageUrl: defaultProfileImageUrl,
        privacy: ProfileImagePrivacy.Everyone,
      }))

      await this.sendWelcomeEmail(user);
      await this.commandBus.execute(new SendVerificationEmailCommand({
        model: {
          userAgent: parsedDataProtectionKeyValue.userAgent,
          ipAddress: parsedDataProtectionKeyValue.ipAddress,
          email: user.email,
        }
      }));
    }

    if (this.isAccountLockedOrInactive(user)) {
      return this.handleLockedOrInactiveAccount(user);
    }

    const result = await this.handleSuccessfulLogin(
      user,
      parsedDataProtectionKeyValue,
    );
    result.facebookAccessToken = access_token;
    result.facebookAccessTokenExpiresIn = expires_in;

    // Create or update LinkedAccount
    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndEmailAsync(
      _const.PLATFORMS.FACEBOOK,
      user.email,
    );

    if (linkedAccount) {
      linkedAccount.userName = userData.name;
      linkedAccount.profileImage = userData.picture?.data?.url;
      linkedAccount.followingCount = userData.friends?.summary?.total_count || 0;
      linkedAccount.metaData = {
        name: userData.name,
        birthday: userData.birthday,
        gender: userData.gender,
        hometown: userData.hometown?.name,
        location: userData.location?.name,
        link: userData.link,
      };
      console.log(linkedAccount, "linkedAccount")
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      linkedAccount = await this.linkedAccountRepository.createAsync(
        new LinkedAccount({
          platform: _const.PLATFORMS.FACEBOOK,
          userId: user.id,
          email: userData.email,
          externalId: userData.id,
          userName: userData.name,
          profileImage: userData.picture?.data?.url,
          followingCount: userData.friends?.summary?.total_count || 0,
          metaData: {
            name: userData.name,
            birthday: userData.birthday,
            gender: userData.gender,
            hometown: userData.hometown?.name,
            location: userData.location?.name,
            link: userData.link,
          },
        }),
      );
    }

    // Store Facebook tokens for future API access
    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      user.id,
      _const.PLATFORMS.FACEBOOK,
    );
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = access_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.FACEBOOK,
        user.id,
        '',
        '',
        '',
        access_token,
        new Date(Date.now() + expires_in * 1000),
      );
    }

    return result;
  }

  private async fetchShortLivedToken(code: string): Promise<string> {
    try {
      const response = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
        params: {
          client_id: configs.facebook.clientId,
          redirect_uri: configs.facebook.authCallbackUrl,
          client_secret: configs.facebook.clientSecret,
          code,
        },
      });

      const { access_token } = response.data;
      return access_token;
    } catch (error) {
      logger.error('Error fetching short-lived token from Facebook', error);
      throw new ApplicationException('Unexpected error during authentication with Facebook');
    }
  }

  private async fetchLongLivedToken(shortLivedAccessToken: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }> {
    try {
      const response = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
        params: {
          client_id: configs.facebook.clientId,
          client_secret: configs.facebook.clientSecret,
          grant_type: 'fb_exchange_token',
          fb_exchange_token: shortLivedAccessToken,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching long-lived token from Facebook', error);
      throw new ApplicationException('Unexpected error during authentication with Facebook');
    }
  }

  private async fetchUserData(accessToken: string): Promise<FacebookUserDataModel> {
    try {
      const response = await axios.get<FacebookUserDataModel>(`${GRAPH_BASE}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,email,picture,link,birthday,gender,hometown,location,friends'
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error('Error fetching user data from Facebook', error);
      const facebookError = error.response?.data || error.message;
      logger.error('Facebook API Error Details:', facebookError);
      throw new ApplicationException(`Facebook API Error: ${JSON.stringify(facebookError)}`);
    }
  }

  private async validateState(state: string): Promise<DataProtectionKey> {
    const dataProtectionKey = await this.dataProtectionKeyRepository.getByKeyAsync(state);
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
  ): Promise<FacebookCallbackTokenResponseModel> {
    user.accessFailedCount = 0;
    await this.userRepository.updateAsync(user);

    const access_token = await this.tokenService.generateJwtAsync(user);
    const userToken = await this.userLoginRepository.createAysnc(
      'Gaddr-Facebook',
      user.id,
      model.deviceId,
      model.userAgent,
      model.ipAddress,
    );

    await this.userRepository.cacheUserAccountAsync(user, _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC);

    return new FacebookCallbackTokenResponseModel({
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

  private handleLockedOrInactiveAccount(user: User): FacebookCallbackTokenResponseModel {
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

  private createErrorResponse(message: string): FacebookCallbackTokenResponseModel {
    return new FacebookCallbackTokenResponseModel({ message, succeeded: false });
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