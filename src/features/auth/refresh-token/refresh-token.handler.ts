import * as Joi from "joi";
import configs from "../../../configs";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import { Globals } from "../../../core/globals";
import ipUtil from "../../../core/utils/ip.util";
import { TokenResponseModel } from "../../../domain/contracts/tokenResponse.model";
import { Inject, UnauthorizedException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { cryptoUtils } from "../../../core/utils/crypto.util";
import { addDurationToNow } from "../../../core/utils/time.util";
import { ITokenService } from "../../../domain/services/itoken.service";
import { HttpContext } from "../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { IUserLoginRepository } from "../../../domain/repositories/irefreshtoken.repository";

export class RefreshTokenRequestModel {

  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty()
  deviceId: string;

  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  constructor(request: Partial<RefreshTokenRequestModel> = {}) {
    Object.assign(this, request);
  }
}

export class RefreshTokenCommand {
  model: RefreshTokenRequestModel;

  constructor(request: Partial<RefreshTokenCommand> = {}) {
    Object.assign(this, request);
  }
}

const refreshTokenValidations = Joi.object({
  userAgent: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  deviceId: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  accessToken: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  refreshToken: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenCommandHandler implements ICommandHandler<RefreshTokenCommand> {
  constructor(
    @Inject(_const.ITOKEN_SERVICE) private readonly tokenService: ITokenService,
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY) private readonly userLoginRepository: IUserLoginRepository
  ) { }

  public async execute(command: RefreshTokenCommand): Promise<TokenResponseModel> {

    const { model } = command;
    await refreshTokenValidations.validateAsync(command.model);

    const user = await this.userRepository.getUserByIdAsync(HttpContext.getCurrentUserId);
    if (!user) {
      throw new Error("User associated with the token does not exist.");
    }

    const userLogin = await this.userLoginRepository.getByTokenValueAndDeviceIdAsync(
      model.refreshToken,
      model.deviceId
    );

    if (!userLogin) {
      throw new Error("Invalid refresh token or device mismatch.");
    }

    const currentUtcDate = new Date();
    if (userLogin.expiryDateUtc < currentUtcDate) {
      throw new Error("Refresh token has expired. Please log in again.");
    }

    if (user.securityStamp !== HttpContext.user[Globals.ClaimTypes.SecurityStamp]) {
      userLogin.isValid = false;
      userLogin.expiryDateUtc = currentUtcDate;
      await this.userLoginRepository.updateAsync(userLogin);
      throw new UnauthorizedException("Invalid security stamp. Please log in again.");
    }

    let accessToken: string;
    if (user.concurrencyStamp === HttpContext.user[Globals.ClaimTypes.ConcurrencyStamp]) {
      accessToken = this.tokenService.generateEncryptedToken(HttpContext.user);
    } else {
      accessToken = await this.tokenService.generateJwtAsync(user);
    }

    userLogin.tokenValue = cryptoUtils.generateEncryptionKey(32);
    userLogin.expiryDateUtc = addDurationToNow(configs.jwt.refreshTokenExpiration);

    const hasChanged = ipUtil.hasIpChanged(model.ipAddress, userLogin.ipAddress);

    if (hasChanged) {
      // TODO: Send email notification of account access with new ipAddress  
    }

    await this.userLoginRepository.updateAsync(userLogin);

    return new TokenResponseModel({
      access_token: accessToken,
      refresh_token: userLogin.tokenValue,
      succeeded: true,
      refreshTokenExpiryTime: Math.floor(userLogin.expiryDateUtc.getTime() / 1000),
    });
  }
} 