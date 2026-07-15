export interface OAuthTokenResult {
  accessToken: string;
  expiresAt?: Date;
}

export interface IOAuthService {
  getValidAccessToken(
    userId: string,
    platform: string,
  ): Promise<OAuthTokenResult>;
  refreshToken(userId: string, platform: string): Promise<OAuthTokenResult>;
}
