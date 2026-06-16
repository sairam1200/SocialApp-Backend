import configs from '../../configs';
import { JwtService } from '@nestjs/jwt';
import _const from '../../core/utils/const';
import { Globals } from '../../core/globals';
import { User } from "../../domain/entities";
import logger from '../../core/utils/winston.util';
import { Inject, Injectable } from "@nestjs/common";
import { JwtPayload } from '../../core/passport/jwtPayload';
import { IRoleRepository } from "../../domain/repositories";
import { ITokenService } from "../../domain/services/itoken.service";
import { ApplicationException } from 'core/exceptions';

@Injectable()
export class TokenService implements ITokenService {

  constructor(
    @Inject(_const.IROLE_REPOSITORY) private readonly roleRepository: IRoleRepository,
    private readonly jwtService: JwtService,
  ) { }

  public generate2FAJwt(user: User, ipAddress: string, userAgent: string, deviceId: string): string {
    const claims = {
      ["device-id"]: deviceId,
      ["ip-address"]: ipAddress,
      ["user-agent"]: userAgent,
      [Globals.ClaimTypes.UserId]: user.id,
      [Globals.ClaimTypes.Email]: user.email,
      [Globals.ClaimTypes.TwoFARequired]: true,
      [Globals.ClaimTypes.UserType]: user.type,
      [Globals.ClaimTypes.UserName]: user.userName,
      [Globals.ClaimTypes.GivenName]: user.firstName,
      [Globals.ClaimTypes.FamilyName]: user.lastName,
      [Globals.ClaimTypes.ProfileImage]: user.biometrics?.profileImageUrl || user.biometrics?.defaultProfileImageUrl || null,
      [Globals.ClaimTypes.FullName]: `${user.lastName} ${user.firstName}`,
    };

    return this.generateEncryptedToken(claims, "5m");
  }

  public async generateJwtAsync(user: User): Promise<string> {
    const claims = await this.getClaimsAsync(user);
    return this.generateEncryptedToken(claims);
  }

  public async getPrincipalFromToken(token: string): Promise<JwtPayload> {
    try {
      const payload: JwtPayload = this.jwtService.decode(token);
      if (!payload) {
        throw new ApplicationException('Invalid token: Decoding failed');
      }
      return payload;
    } catch (error) {
      logger.error('Error decoding token:', error);
      throw new ApplicationException('Invalid token');
    }
  }

  public generateEncryptedToken(
  claims: any,
  tokenExpiration?: string
): string {

  const expiresIn =
    tokenExpiration ??
    configs.jwt.accessTokenExpiration;

  const { exp, iat, iss, aud, ...cleanClaims } =
    claims;

  return this.jwtService.sign(
    cleanClaims,
    {
      secret: configs.jwt.secret,
      expiresIn,
      issuer: configs.jwt.issuer,
      audience: configs.jwt.audience,
    }
  );
}

  private async getClaimsAsync(user: User): Promise<any> {
    const roles = await this.roleRepository.getByUserAsync(user);
    const roleClaims = roles.map((role) => role.name);

    const permissionClaims = roles.flatMap((role) =>
      role.roleClaims.map((claim) => claim.claimValue)
    );

    const claims = {
      [Globals.ClaimTypes.UserId]: user.id,
      [Globals.ClaimTypes.Email]: user.email,
      [Globals.ClaimTypes.UserName]: user.userName,
      [Globals.ClaimTypes.GivenName]: user.firstName,
      [Globals.ClaimTypes.FamilyName]: user.lastName,
      [Globals.ClaimTypes.SecurityStamp]: user.securityStamp,
      [Globals.ClaimTypes.ConcurrencyStamp]: user.concurrencyStamp,
      [Globals.ClaimTypes.ProfileImage]: user.biometrics?.profileImageUrl || user.biometrics?.defaultProfileImageUrl || null,
      [Globals.ClaimTypes.FullName]: `${user.lastName} ${user.firstName}`,
      [Globals.ClaimTypes.UserType]: user.type,
        onboardingStep: user.onboardingStep,
      [Globals.ClaimTypes.Roles]: roleClaims,
      [Globals.ClaimTypes.Permission]: permissionClaims,
    };
console.log(
  "ONBOARDING STEP IN JWT:",
  user.onboardingStep
);
    return claims;
  }
}