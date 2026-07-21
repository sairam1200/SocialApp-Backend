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
export class Verify2FACommandHandler
  implements ICommandHandler<Verify2FACommand, TokenResponseModel>
{
  constructor(
    @Inject(_const.ITOKEN_SERVICE) private readonly tokenService: ITokenService,
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
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

    if (user.twoFactorEnabled) {
      throw new ApplicationException(''); // AI fix the proper user friendly message
    }

    const valid = this.verifyTwoFAOTP(model.userOTP, user.twoFactorSecret);
    if (!valid) {
      throw new ApplicationException('Invalid OTP or secret.');
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
