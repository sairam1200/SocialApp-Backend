import * as Joi from 'joi';
import * as speakeasy from 'speakeasy';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import ipUtil from '../../../../core/utils/ip.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TokenResponseModel } from '../../../../domain/contracts/tokenResponse.model';
import { ITokenService } from '../../../../domain/services/itoken.service';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  IUserLoginRepository,
  IIdentityRepository,
} from '../../../../domain/repositories';
import { TwoFactorMethod } from '../../../../domain/enums';
import { TwoFactorEmailService } from '../../../../infrastructure/services/social/two-factor-email.service';
import {
  ApplicationException,
  UserNotFoundException,
} from '../../../../core/exceptions';

export class Verify2FARequestModel {
  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty()
  deviceId: string;

  @ApiProperty()
  userOTP: string;
}

export class Verify2FACommand {
  model: Verify2FARequestModel;

  constructor(request: Partial<Verify2FACommand> = {}) {
    Object.assign(this, request);
  }
}

const verify2FAValidations = Joi.object({
  userOTP: Joi.string().required(),
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

@CommandHandler(Verify2FACommand)
export class Verify2FACommandHandler implements ICommandHandler<
  Verify2FACommand,
  TokenResponseModel
> {
  constructor(
    @Inject(_const.ITOKEN_SERVICE) private readonly tokenService: ITokenService,
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly twoFactorEmail: TwoFactorEmailService,
  ) {}

  public async execute(command: Verify2FACommand): Promise<TokenResponseModel> {
    const { model } = command;
    await verify2FAValidations.validateAsync(model);

    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UserNotFoundException();
    }

    // The guard here used to be `if (user.twoFactorEnabled) throw`, which is
    // backwards: it rejected exactly the users who *need* to verify, so
    // two-factor login could never complete. Verification requires 2FA to be
    // on, not off.
    if (!user.twoFactorEnabled) {
      throw new ApplicationException(
        'Two-factor sign-in is not enabled for this account.',
      );
    }

    const valid =
      user.twoFactorMethod === TwoFactorMethod.Email
        ? (await this.twoFactorEmail.verifyAsync(user.id, model.userOTP)).valid
        : this.verifyTwoFAOTP(model.userOTP, user.twoFactorSecret);
    if (!valid) {
      throw new ApplicationException(
        'That code is not valid, or it has expired. Request a new one.',
      );
    }

    this.checkForUnrecognizedDeviceOrIp(
      model.deviceId,
      model.userAgent,
      model.ipAddress,
    );

    const access_token = await this.tokenService.generateJwtAsync(user);
    const userToken = await this.userLoginRepository.createAysnc(
      'Gaddr',
      user.id,
      model.deviceId,
      model.userAgent,
      model.ipAddress,
    );

    // Cache user account data in Redis with TTL for account guard validation
    await this.userRepository.cacheUserAccountAsync(
      user,
      _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC,
    );

    // TODO: Send email notification of login with new ipAddress and deviceInfo

    return new TokenResponseModel({
      access_token,
      refresh_token: userToken.tokenValue,
      succeeded: true,
      refreshTokenExpiryTime: Math.floor(
        userToken.expiryDateUtc.getTime() / 1000,
      ),
    });
  }

  private verifyTwoFAOTP(userOTP: string, secret: string): boolean {
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: userOTP,
      window: 1,
    });

    return verified;
  }

  private checkForUnrecognizedDeviceOrIp(
    deviceId: string,
    userAgent: string,
    ipAddress: string,
  ) {
    let hasChanged = deviceId !== HttpContext.user['device-id'];
    if (hasChanged) {
      throw new ApplicationException(
        'Login attempt detected from an unrecognized device.',
      );
    }

    hasChanged = deviceId !== HttpContext.user['user-agent'];
    if (hasChanged) {
      throw new ApplicationException(
        'Login attempt detected from an unrecognized device.',
      );
    }

    hasChanged = ipAddress !== HttpContext.user['ip-address'];
    if (hasChanged) {
      const isNewRegion = ipUtil.hasIpChanged(
        ipAddress,
        HttpContext.user['ip-address'],
      );
      if (isNewRegion) {
        // send email of location change
      }
    }
  }
}
