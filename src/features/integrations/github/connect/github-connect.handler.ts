import axios from "axios";
import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { EventEmitter2 } from "@nestjs/event-emitter";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserNotFoundException } from "../../../../core/exceptions";
import { PlatformConnectCleanupEvent } from "../../../../domain/events";
import { serializeObject } from "../../../../core/utils/serialization.util";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { mapToGithubProfileModel } from "../../../../domain/mappers/github.mapper";
import { DataProtectionKey } from "../../../../domain/entities/dataProtectionKey.entity";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { GithubProfileModel, GithubUserDataType } from "../../../../domain/contracts/github.model";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";
import { IContentStreamRepository } from "../../../../domain/repositories/icontentStream.repository";

const GITHUB_API_URL = 'https://api.github.com';

export class GithubConnectQuery {
  model: {
    state: string;
  }

  constructor(request: Partial<GithubConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GithubConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<GithubConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const githubConnectValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(GithubConnectQuery)
export class GithubConnectQueryHandler implements ICommandHandler<GithubConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(query: GithubConnectQuery): Promise<void> {

    const { model } = query;

    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      '', // No code verifier needed for GitHub OAuth
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn
    );
  }
}

@CommandHandler(GithubConnectCallbackQuery)
export class GithubConnectCallbackQueryHandler implements ICommandHandler<GithubConnectCallbackQuery> {

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
  ) { }

  public async execute(query: GithubConnectCallbackQuery): Promise<{
    accessToken: string,
    profile: GithubProfileModel
  }> {

    const { model } = query;
    await githubConnectValidations.validateAsync(model);
    const dataProtectionKey = await this.validateStateAsync(model.state);
    const { access_token } = await this.fetchToken(model.code);

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByIdAsync(dataProtectionKey.userId);
    if (!user) {
      throw new UserNotFoundException(String(userData.id));
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.GITHUB, user.id);
    const newExternalId = String(userData.id);
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(`[GithubConnect] User ${user.id} changed GitHub account from ${oldExternalId} to ${newExternalId}`);
        this.eventEmitter.emit('platform.connect.cleanup', new PlatformConnectCleanupEvent({ account: linkedAccount }));
      }

      linkedAccount = await this.updateLinkedAccount(linkedAccount, userData);
    } else {
      linkedAccount = await this.createLinkedAccount(user.id, userData);
    }

    const existingAccountLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(user.id, _const.PLATFORMS.GITHUB);
    const tokenValue = serializeObject({ access_token });
    if (existingAccountLogin) {
      await this.updateUserLogin(existingAccountLogin, tokenValue);
    } else {
      await this.createUserLogin(user.id, tokenValue);
    }

    return {
      accessToken: access_token,
      profile: mapToGithubProfileModel(linkedAccount, true)
    }
  }

  private async fetchToken(code: string)
    : Promise<{ access_token: string; }> {
    try {
      const response = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: configs.github.clientId,
          client_secret: configs.github.clientSecret,
          code: code,
          redirect_uri: configs.github.redirectUri,
        },
        {
          headers: {
            'Accept': 'application/json',
          }
        }
      );
      if (response.data.error) {
        logger.error('GitHub token error:', response.data);
        throw new ApplicationException(`GitHub OAuth error: ${response.data.error_description || response.data.error}`);
      }
      return response.data;
    } catch (error) {
      if (error instanceof ApplicationException) throw error;
      logger.error('Error fetching token from GitHub', error);
      throw new ApplicationException('Unexpected error during authentication with GitHub');
    }
  }

  private async fetchUserData(accessToken: string): Promise<GithubUserDataType> {
    try {
      const response = await axios.get<GithubUserDataType>(`${GITHUB_API_URL}/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching user data from GitHub', error);
      throw new ApplicationException('Unexpected error during authentication with GitHub');
    }
  }

  private async validateStateAsync(state: string): Promise<DataProtectionKey> {
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

  private async updateLinkedAccount(linkedAccount: LinkedAccount, userData: GithubUserDataType): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.GITHUB,
      String(userData.id),
    );
    linkedAccount.externalId = String(userData.id);
    linkedAccount.userName = userData.login;
    linkedAccount.profileImage = userData.avatar_url;
    linkedAccount.followersCount = userData.followers;
    linkedAccount.followingCount = userData.following;
    linkedAccount.verified = false;
    linkedAccount.externalUrl = userData.html_url;
    linkedAccount.metaData = {
      name: userData.name,
      bio: userData.bio,
      company: userData.company,
      blog: userData.blog,
      location: userData.location,
      hireable: userData.hireable,
      twitterUsername: userData.twitter_username,
      publicRepos: userData.public_repos,
      publicGists: userData.public_gists,
      createdAt: userData.created_at,
      email: userData.email,
    };
    await this.linkedAccountRepository.updateAsync(linkedAccount);
    return linkedAccount;
  }

  private async createLinkedAccount(userId: string, userData: GithubUserDataType): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.GITHUB,
      String(userData.id),
    );
    const newEntry = new LinkedAccount({
      platform: _const.PLATFORMS.GITHUB,
      userId,
      externalId: String(userData.id),
      userName: userData.login,
      profileImage: userData.avatar_url,
      followersCount: userData.followers,
      followingCount: userData.following,
      verified: false,
      externalUrl: userData.html_url,
      metaData: {
        name: userData.name,
        bio: userData.bio,
        company: userData.company,
        blog: userData.blog,
        location: userData.location,
        hireable: userData.hireable,
        twitterUsername: userData.twitter_username,
        publicRepos: userData.public_repos,
        publicGists: userData.public_gists,
        createdAt: userData.created_at,
        email: userData.email,
      }
    });
    return await this.linkedAccountRepository.createAsync(newEntry);
  }

  private async updateUserLogin(userLogin: any, tokenValue: string): Promise<void> {
    userLogin.tokenValue = tokenValue;
    userLogin.addedDateUtc = new Date();
    userLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    await this.userLoginRepository.updateAsync(userLogin);
  }

  private async createUserLogin(userId: string, tokenValue: string): Promise<void> {
    await this.userLoginRepository.createAysnc(
      _const.PLATFORMS.GITHUB,
      userId,
      "", // deviceId
      "", // userAgent
      "", // ipAddress
      tokenValue,
      new Date(Date.now() + 100 * 24 * 60 * 60 * 1000)
    );
  }
}
