import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { User } from '../../../../domain/entities/user.entity';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { ITokenService } from '../../../../domain/services/itoken.service';
import { IUserLoginRepository } from '../../../../domain/repositories/irefreshtoken.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { FacebookUserDataModel } from '../../../../domain/contracts/facebook.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { ApiProperty } from '@nestjs/swagger';
import { generateInitialImage } from '../../../../core/utils/canvas.util';
import { uploadBase64ToCloudinaryAsync } from '../../../../core/utils/cloudinary.util';
import { stringUtil } from '../../../../core/utils/string.util';
import { UserType } from '../../../../domain/enums';

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
export class FacebookCallbackTokenResponseModel {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  message: string;

  @ApiProperty()
  userImage: string;

  @ApiProperty({ default: false })
  succeeded: boolean;

  @ApiProperty({ default: false })
  isLockedOut: boolean;

  @ApiProperty({ default: false })
  isTwoFARequired: boolean;

  @ApiProperty()
  refreshTokenExpiryTime: string;

  @ApiProperty({ required: false })
  facebookAccessToken?: string;

  @ApiProperty({ required: false })
  facebookAccessTokenExpiresIn?: number;

  constructor(request: Partial<FacebookCallbackTokenResponseModel> = {}) {
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

    const shortLivedToken = await this.fetchShortLivedToken(model.code);
    const { access_token, expires_in } = await this.fetchLongLivedToken(shortLivedToken);

    const userData = await this.fetchUserData(access_token);

    // Try to find existing user by email
    let user = await this.userRepository.getUserByEmailAsync(userData.email);
    
    if (!user) {
      // Create new user if doesn't exist
      const firstName = userData.name?.split(' ')[0] || 'Facebook';
      const lastName = userData.name?.split(' ').slice(1).join(' ') || 'User';
      
      // Generate profile image with initials if no picture available
      let profileImage = userData.picture?.data?.url;
      if (!profileImage) {
        const initials = stringUtil.extractInitialsFromName(`${firstName} ${lastName}`);
        const base64Image = generateInitialImage(initials);
        const avatar = await uploadBase64ToCloudinaryAsync(base64Image, "users");
        profileImage = avatar.secure_url;
      }

      const entry = new User({
        email: userData.email,
        firstName: firstName,
        lastName: lastName,
        profileImage: profileImage,
        emailConfirmed: true,
        type: UserType.User,
        userName: `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/\s/g, ''),
      });

      user = await this.userRepository.createAsync(entry, ''); // Empty password for OAuth users
    }

    if (this.isAccountLockedOrInactive(user)) {
      return this.handleLockedOrInactiveAccount(user);
    }

    const parsedDataProtectionKeyValue = JSON.parse(dataProtectionKey.value);
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

    // Generate JWT token for the user
    const access_token_jwt = await this.tokenService.generateJwtAsync(user);
    
    return new FacebookCallbackTokenResponseModel({
      accessToken: access_token_jwt,
      refreshToken: '', // No refresh token for external auth
      message: 'Facebook authentication successful',
      succeeded: true,
    });
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
      throw new Error('Unexpected error during authentication with Facebook');
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
      throw new Error('Unexpected error during authentication with Facebook');
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

    return new FacebookCallbackTokenResponseModel({
      accessToken: access_token,
      refreshToken: userToken.tokenValue,
      message: 'Login successful',
      succeeded: true,
      isLockedOut: false,
      userImage: user.profileImage,
      refreshTokenExpiryTime: userToken.expiryDateUtc.toISOString(),
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
}