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
import { mapToSpotifyProfileModel } from "../../../../domain/mappers/spotify.mapper";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { DataProtectionKey } from "../../../../domain/entities/dataProtectionKey.entity";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { SpotifyProfileModel, SpotifyUserDataModel } from "../../../../domain/contracts/spotify.model";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";
import { UserNotFoundException } from "core/exceptions";

const BASE_URL = 'https://api.spotify.com/v1';

export class SpotifyConnectQuery {
  model: {
    state: string;
  }

  constructor(request: Partial<SpotifyConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class SpotifyConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<SpotifyConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const spotifyConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(SpotifyConnectQuery)
export class SpotifyConnectQueryHandler implements ICommandHandler<SpotifyConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: SpotifyConnectQuery): Promise<void> {

    const { model } = command;

    // expires in 15 minutes
    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      "", // value is not used
      HttpContext.getCurrentUserId,
      expiresIn
    );
  }
}

@CommandHandler(SpotifyConnectCallbackQuery)
export class SpotifyConnectCallbackQueryHandler implements ICommandHandler<SpotifyConnectCallbackQuery> {

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

  public async execute(query: SpotifyConnectCallbackQuery)
    : Promise<{ accessToken: string; expiresIn: number; profile: SpotifyProfileModel }> {
    const { model } = query;
    await spotifyConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey=await this.validateStateAsync(model.state);

    const { access_token, refresh_token, expires_in } = await this.fetchToken(model.code);

    const userData = await this.fetchUserData(access_token);

    console.log(userData.data);
    const user = configs.env !== "production" ? await this.userRepository.getUserByIdAsync(dataProtectionKey.userId) : await this.userRepository.getUserByEmailAsync(userData.data.email);

    if (!user || user.id !== dataProtectionKey.userId) {
      throw new UserNotFoundException(userData.data.email, 'email');
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndEmailAsync(
      _const.PLATFORMS.SPOTIFY,
      user.email
    );

    if (linkedAccount) {
      linkedAccount.userName = userData.data.display_name;
      linkedAccount.profileImage = userData.data.images[0]?.url;
      linkedAccount.followersCount = userData.data.followers.total;
      linkedAccount.followingCount = userData.userfollowing;
      linkedAccount.externalUrl = userData.data.external_urls.spotify,
      linkedAccount.email = userData.data.email,
      linkedAccount.metaData = {
        name: userData.data.display_name,
        country: userData.data.country,
        product: userData.data.product,
        accountType: userData.data.type,
        uri: userData.data.uri,
        explicitContentLocked: userData.data.explicit_content.filter_enabled,
        explicitContentEnabled: userData.data.explicit_content.filter_locked,
      };
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      linkedAccount = await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: _const.PLATFORMS.SPOTIFY,
        userId: user.id,
        email: userData.data.email,
        externalId: userData.data.id,
        userName: userData.data.display_name,
        profileImage: userData.data.images[0]?.url,
        followersCount: userData.data.followers.total,
        followingCount: userData.userfollowing,
        externalUrl: userData.data.external_urls.spotify,
        metaData: {
          name: userData.data.display_name,
          country: userData.data.country,
          product: userData.data.product,
          accountType: userData.data.type,
          uri: userData.data.uri,
          explicitContentLocked: userData.data.explicit_content.filter_enabled,
          explicitContentEnabled: userData.data.explicit_content.filter_locked,
        }
      }));
    }

    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      user.id,
      _const.PLATFORMS.SPOTIFY
    );

    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = refresh_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.SPOTIFY,
        user.id,
        "",
        "",
        "",
        refresh_token,
        new Date(Date.now() + 100 * 24 * 60 * 60 * 1000)
      );
    }

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: mapToSpotifyProfileModel(linkedAccount, true),
    }
  }

  private async fetchToken(code: string)
    : Promise<{ access_token: string; token_type: string; expires_in: number; refresh_token: string; }> {
    const basicAuth = Buffer.from(`${configs.spotify.clientId}:${configs.spotify.clientSecret}`).toString('base64');
    try {
      const response = await axios.post(
        `https://accounts.spotify.com/api/token`,
          `redirect_uri=${encodeURIComponent(configs.spotify.redirectUri)}` +
          `&grant_type=authorization_code`+
          `&code=${encodeURIComponent(code)}`,
          {
    
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + basicAuth
          },
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching token from Spotify', error);
      throw new Error('Unexpected error during authentication with Spotify');
    }
  }

  private async fetchUserData(accessToken: string): Promise<{ data: SpotifyUserDataModel, userfollowing: number }> {
    try {
      const response = await axios.get<SpotifyUserDataModel>(`${BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const userfollowing = await axios.get(`${BASE_URL}/me/following?type=artist`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return {
        data: response.data,
        userfollowing: userfollowing.data.artists.items?.length,
      };
    } catch (error) {
      logger.error('Error fetching user data from Spotify', error);
      throw new Error('Unexpected error during authentication with Spotify');
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
}