import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { EventEmitter2 } from '@nestjs/event-emitter';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SocialAccountLinkedEvent } from '../../../../domain/events';
import { DataProtectionKey } from '../../../../domain/entities';
import { PlatformConnectCleanupEvent } from '../../../../domain/events';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { mapToLinkedInProfileModel } from '../../../../domain/mappers/linkedin.mapper';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import {
  LinkedInProfileModel,
  LinkedInUserDataType,
} from '../../../../domain/contracts/linkedin.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { serializeObject } from 'core/utils/serialization.util';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';

const PLATFORM = 'linkedin';
const API_BASE = 'https://api.linkedin.com/v2';

export class LinkedInConnectQuery {
  model: {
    state: string;
  };

  constructor(request: Partial<LinkedInConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class LinkedInConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<LinkedInConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const linkedInConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(LinkedInConnectQuery)
export class LinkedInConnectQueryHandler
  implements ICommandHandler<LinkedInConnectQuery>
{
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(command: LinkedInConnectQuery): Promise<void> {
    const { model } = command;

    // expires in 15 minutes
    const expiresIn =
      Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      '',
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn,
    );
  }
}

@CommandHandler(LinkedInConnectCallbackQuery)
export class LinkedInConnectCallbackQueryHandler
  implements ICommandHandler<LinkedInConnectCallbackQuery>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async execute(query: LinkedInConnectCallbackQuery): Promise<{
    accessToken: string;
    expiresIn: number;
    profile: LinkedInProfileModel;
  }> {
    const { model } = query;
    await linkedInConnectCallbackValidations.validateAsync(model);

    const dataProtectionKey = await this.validateStateAsync(model.state);

    const { accessToken, refreshToken, expiresIn } =
      await this.fetchAccessTokenAsync(model.code);
    const userData = await this.fetchUserDataAsync(accessToken);
    const userEmail = userData.email ?? '';
    const organizations = await this.fetchOrganizationsAsync(accessToken);

    if (!organizations.length) {
      throw new ApplicationException(
        'No LinkedIn organization admin permissions found.',
      );
    }

    const organizationUrn = organizations[0].organizationalTarget;
    const organizationId = organizationUrn.split(':').pop();
    const organization = await this.fetchOrganizationDetailsAsync(
      accessToken,
      organizationId,
    );
    const user = await this.userRepository.getUserByIdAsync(
      dataProtectionKey.userId,
    );
    if (!user) {
      throw new ApplicationException(
        'Prevented: Alduterated Request Received!',
      );
    }

    const existingAccount =
      await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(
        PLATFORM,
        userData.id,
      );
    if (existingAccount && existingAccount.userId !== user.id) {
      throw new ApplicationException(
        'This LinkedIn account is already connected to another user.',
      );
    }

    let linkedAccount = existingAccount;
    const newExternalId = userData.id;
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(
          `[LinkedInConnect] User ${user.id} changed LinkedIn account from ${oldExternalId} to ${newExternalId}`,
        );
        this.eventEmitter.emit(
          'platform.connect.cleanup',
          new PlatformConnectCleanupEvent({ account: linkedAccount }),
        );
      }
      console.log('updating LINKEDIN STATE:', model.state);
      linkedAccount = await this.updateLinkedAccount(
        linkedAccount,
        userData,
        userEmail,
        organization,
      );
    } else {
      console.log('CREATING LINKEDIN STATE:', model.state);
      linkedAccount = await this.createLinkedAccount(
        user.id,
        userData,
        userEmail,
        organization,
      );
    }

    const existingAccountLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        user.id,
        _const.PLATFORMS.LINKEDIN,
      );
    // Standardize: Use serializeObject with consistent keys (access_token instead of accessToken)
    const tokenValue = serializeObject({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
    });
    if (existingAccountLogin) {
      await this.updateUserLogin(existingAccountLogin, tokenValue, expiresIn);
    } else {
      await this.createUserLogin(user.id, tokenValue, expiresIn);
    }

    this.eventEmitter.emit(
      'social.account.linked',
      new SocialAccountLinkedEvent({ userId: user.id }),
    );

    return {
      accessToken,
      expiresIn,
      profile: mapToLinkedInProfileModel(linkedAccount, true),
    };
  }

  private async fetchAccessTokenAsync(
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: configs.linkedin.clientId,
        client_secret: configs.linkedin.clientSecret,
        redirect_uri: configs.linkedin.redirectUri,
      });

      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      logger.error('LinkedIn access token fetch failed', error);
      throw new ApplicationException('Failed to authenticate with LinkedIn');
    }
  }
  private async fetchOrganizationDetailsAsync(
    accessToken: string,
    organizationId: string,
  ): Promise<any> {
    const response = await axios.get(
      `https://api.linkedin.com/rest/organizations/${organizationId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'LinkedIn-Version': '202401',
        },
      },
    );

    return response.data;
  }
  private async fetchOrganizationsAsync(accessToken: string): Promise<any[]> {
    try {
      const response = await axios.get(
        'https://api.linkedin.com/rest/organizationalEntityAcls',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': '202506',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          params: {
            q: 'roleAssignee',
            role: 'ADMINISTRATOR',
          },
        },
      );

      return response.data?.elements ?? [];
    } catch (error: any) {
      console.log('LINKEDIN ORG ERROR STATUS:', error.response?.status);

      console.log(
        'LINKEDIN ORG ERROR DATA:',
        JSON.stringify(error.response?.data, null, 2),
      );

      throw error;
    }
  }
  private async fetchUserDataAsync(
    accessToken: string,
  ): Promise<LinkedInUserDataType> {
    try {
      const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const userData = response.data;

      console.log('LINKEDIN USER INFO:', JSON.stringify(userData, null, 2));

      return {
        id: userData.sub,
        localizedFirstName: userData.given_name ?? '',
        localizedLastName: userData.family_name ?? '',
        vanityName: userData.name ?? '',
        profilePicture: {
          displayImage: userData.picture ?? '',
        },
        email: userData.email ?? '',
      } as LinkedInUserDataType;
    } catch (error: any) {
      console.error('LINKEDIN USERINFO ERROR:', error?.response?.status);

      console.error('LINKEDIN USERINFO DATA:', error?.response?.data);

      logger.error('LinkedIn user data fetch failed', error);

      throw new ApplicationException('Failed to fetch LinkedIn profile data');
    }
  }

  private async fetchUserEmailAsync(accessToken: string): Promise<string> {
    try {
      const response = await axios.get(
        `${API_BASE}/emailAddress?q=members&projection=(elements*(handle~))`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const emailData = response.data.elements?.[0]?.['handle~'];
      return emailData?.emailAddress || '';
    } catch (error) {
      logger.error('LinkedIn email fetch failed', error);
      return '';
    }
  }

  private async validateStateAsync(state: string): Promise<DataProtectionKey> {
    console.log('VALIDATING STATE:', state);

    const dataProtectionKey =
      await this.dataProtectionKeyRepository.getByKeyAsync(state);

    console.log('FOUND DATA PROTECTION KEY:', dataProtectionKey);
    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid state parameter');
    }

    if (dataProtectionKey.expiresIn < Math.floor(Date.now() / 1000)) {
      throw new ApplicationException('State parameter has expired');
    }

    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
    return dataProtectionKey;
  }

  private async updateLinkedAccount(
    linkedAccount: LinkedAccount,
    userData: LinkedInUserDataType,
    userEmail: string,
    organization: any,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      PLATFORM,
      userData.id,
    );
    linkedAccount.externalId = userData.id;
    linkedAccount.userName =
      userData.vanityName ||
      `${userData.localizedFirstName}.${userData.localizedLastName}`.toLowerCase();
    linkedAccount.email = userEmail;
    linkedAccount.profileImage = userData.profilePicture.displayImage;
    linkedAccount.allowImport = true;
    linkedAccount.metaData = {
      firstName: userData.localizedFirstName,
      lastName: userData.localizedLastName,
      headline: userData.headline || '',
      industry: userData.industry || '',
      location: userData.location
        ? `${userData.location.region || ''}, ${userData.location.country || ''}`
            .trim()
            .replace(/^,\s*/, '')
        : '',

      organizationId: organization?.id,

      organizationName: organization?.localizedName,

      organizationVanityName: organization?.vanityName,

      organizationType: organization?.organizationType,

      organizationDescription: organization?.localizedDescription,

      organizationWebsite: organization?.website,

      organizationStaffCount: organization?.staffCount,

      organizationIndustries: organization?.industries,

      organizationUrn: `urn:li:organization:${organization?.id}`,
    };
    await this.linkedAccountRepository.updateAsync(linkedAccount);
    return linkedAccount;
  }

  private async createLinkedAccount(
    userId: string,
    userData: LinkedInUserDataType,
    userEmail: string,
    organization: any,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      PLATFORM,
      userData.id,
    );
    const newEntry = new LinkedAccount();
    newEntry.userId = userId;
    newEntry.platform = PLATFORM;
    newEntry.externalId = userData.id;
    newEntry.userName =
      userData.vanityName ||
      `${userData.localizedFirstName}.${userData.localizedLastName}`.toLowerCase();
    newEntry.email = userEmail;
    newEntry.profileImage = userData.profilePicture.displayImage;
    newEntry.allowImport = true;
    newEntry.metaData = {
      firstName: userData.localizedFirstName,
      lastName: userData.localizedLastName,
      headline: userData.headline || '',
      industry: userData.industry || '',
      location: userData.location
        ? `${userData.location.region || ''}, ${userData.location.country || ''}`
            .trim()
            .replace(/^,\s*/, '')
        : '',

      organizationId: organization?.id,

      organizationName: organization?.localizedName,

      organizationVanityName: organization?.vanityName,

      organizationType: organization?.organizationType,

      organizationDescription: organization?.localizedDescription,

      organizationWebsite: organization?.website,

      organizationStaffCount: organization?.staffCount,

      organizationIndustries: organization?.industries,

      organizationUrn: `urn:li:organization:${organization?.id}`,
    };
    return await this.linkedAccountRepository.createAsync(newEntry);
  }

  private async updateUserLogin(
    userLogin: any,
    tokenValue: string,
    expiresIn: number,
  ): Promise<void> {
    userLogin.tokenValue = tokenValue;
    userLogin.addedDateUtc = new Date();
    userLogin.expiryDateUtc = new Date(Date.now() + expiresIn * 1000);
    await this.userLoginRepository.updateAsync(userLogin);
  }

  private async createUserLogin(
    userId: string,
    tokenValue: string,
    expiresIn: number,
  ): Promise<void> {
    await this.userLoginRepository.createAysnc(
      _const.PLATFORMS.LINKEDIN,
      userId,
      '', // deviceId
      '', // userAgent
      '', // ipAddress
      tokenValue,
      new Date(Date.now() + expiresIn * 1000),
    );
  }
}
