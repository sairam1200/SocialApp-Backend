import axios from "axios";
import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { mapToLinkedInProfileModel } from "../../../../domain/mappers/linkedin.mapper";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { LinkedInProfileModel, LinkedInUserDataModel } from "../../../../domain/contracts/linkedin.model";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";

const PLATFORM = 'linkedin';
const API_BASE = 'https://api.linkedin.com/v2';

export class LinkedInConnectQuery {
  model: {
    state: string;
  }

  constructor(request: Partial<LinkedInConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class LinkedInConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<LinkedInConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const linkedInConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(LinkedInConnectQuery)
export class LinkedInConnectQueryHandler implements ICommandHandler<LinkedInConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: LinkedInConnectQuery): Promise<void> {
    const { model } = command;

    // expires in 15 minutes
    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      "",
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn
    );
  }
}

@CommandHandler(LinkedInConnectCallbackQuery)
export class LinkedInConnectCallbackQueryHandler implements ICommandHandler<LinkedInConnectCallbackQuery> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) { }

  public async execute(query: LinkedInConnectCallbackQuery): Promise<{ accessToken: string; expiresIn: number; profile: LinkedInProfileModel; }> {

    const { model } = query;
    const { error } = linkedInConnectCallbackValidations.validate(model);

    if (error) {
      throw new ApplicationException(error.details[0].message);
    }

    await this.validateState(model.state);

    const accessToken = await this.fetchAccessToken(model.code);
    const userData = await this.fetchUserData(accessToken);
    const userEmail = await this.fetchUserEmail(accessToken);

    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const existingAccount = await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(PLATFORM, userData.id);
    if (existingAccount && existingAccount.userId !== userId) {
      throw new ApplicationException('This LinkedIn account is already connected to another user.');
    }

    let linkedAccount = existingAccount;
    if (!linkedAccount) {
      linkedAccount = new LinkedAccount();
      linkedAccount.userId = userId;
      linkedAccount.platform = PLATFORM;
      linkedAccount.externalId = userData.id;
    }

    linkedAccount.userName = userData.vanityName || `${userData.localizedFirstName}.${userData.localizedLastName}`.toLowerCase();
    linkedAccount.email = userEmail;
    linkedAccount.profileImage = userData.profilePicture.displayImage;
    linkedAccount.allowImport = true;
    linkedAccount.metaData = {
      firstName: userData.localizedFirstName,
      lastName: userData.localizedLastName,
      headline: userData.headline || '',
      industry: userData.industry || '',
      location: userData.location ? `${userData.location.region || ''}, ${userData.location.country || ''}`.trim().replace(/^,\s*/, '') : '',
    };

    if (!existingAccount) {
      linkedAccount = await this.linkedAccountRepository.createAsync(linkedAccount);
    } else {
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    }

    const profile = mapToLinkedInProfileModel(linkedAccount, true);

    return {
      accessToken,
      expiresIn: 5184000,
      profile,
    };
  }

  private async fetchAccessToken(code: string): Promise<string> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: configs.linkedin.clientId,
        client_secret: configs.linkedin.clientSecret,
        redirect_uri: configs.linkedin.redirectUri,
      });

      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return response.data.access_token;
    } catch (error) {
      logger.error('LinkedIn access token fetch failed', error);
      throw new ApplicationException('Failed to authenticate with LinkedIn');
    }
  }

  private async fetchUserData(accessToken: string): Promise<LinkedInUserDataModel> {
    try {
      const response = await axios.get(`${API_BASE}/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const userData = response.data;
      
      // Extract the profile picture URL from LinkedIn v2 API response
      let profilePictureUrl = '';
      if (userData.profilePicture && userData.profilePicture['displayImage~']) {
        const displayImages = userData.profilePicture['displayImage~'].elements;
        if (displayImages && displayImages.length > 0) {
          // Get the largest available image (last element is usually the largest)
          const largestImage = displayImages[displayImages.length - 1];
          if (largestImage.identifiers && largestImage.identifiers.length > 0) {
            profilePictureUrl = largestImage.identifiers[0].identifier;
          }
        }
      }

      return {
        ...userData,
        profilePicture: {
          displayImage: profilePictureUrl
        }
      };
    } catch (error) {
      logger.error('LinkedIn user data fetch failed', error);
      throw new ApplicationException('Failed to fetch LinkedIn profile data');
    }
  }

  private async fetchUserEmail(accessToken: string): Promise<string> {
    try {
      const response = await axios.get(`${API_BASE}/emailAddress?q=members&projection=(elements*(handle~))`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const emailData = response.data.elements?.[0]?.['handle~'];
      return emailData?.emailAddress || '';
    } catch (error) {
      logger.error('LinkedIn email fetch failed', error);
      return '';
    }
  }

  private async validateState(state: string): Promise<void> {
    if (!state || state.length < 16) {
      throw new ApplicationException('Invalid state parameter');
    }
  }
}
