import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import ipUtil from "../../../core/utils/ip.util";
import logger from "../../../core/utils/winston.util";
import { password } from "../../../core/utils/validation.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../core/middlewares/httpContext.middleware";
import { UserNotFoundException } from "../../../core/exceptions/user.exception";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { IUserLoginRepository } from "../../../domain/repositories/irefreshtoken.repository";
import ApplicationException from "../../../core/exceptions/application.exception";

export class ChangePasswordRequestModel {
  @ApiProperty()
  currentPassword: string;

  @ApiProperty()
  newPassword: string;

  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty()
  deviceId: string;
}

export class ChangePasswordCommand {

  model: ChangePasswordRequestModel;

  constructor(request: Partial<ChangePasswordCommand> = {}) {
    Object.assign(this, request);
  }
}

const changePasswordValidations = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().required().custom(password),
  userAgent: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  deviceId: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordCommandHandler implements ICommandHandler<ChangePasswordCommand> {

  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY) private readonly userLoginRepository: IUserLoginRepository,
  ) { }

  public async execute(command: ChangePasswordCommand): Promise<void> {
    const { model } = command;

    await changePasswordValidations.validateAsync(model);

    const user = await this.userRepository.getUserByIdAsync(HttpContext.getCurrentUserId);
    if (!user) {
      throw new UserNotFoundException();
    }

    await this.checkDeviceAndIpSecurity(user.id, model.deviceId, model.userAgent, model.ipAddress);

    const result = await this.userRepository.changePasswordAsync(user, model.currentPassword, model.newPassword);
    if (!result) {
      throw new ApplicationException('Failed to update password. Please verify your current password and try again.');
    }

    await this.invalidateOtherSessions(user.id, model.deviceId);
    logger.info(`Password changed for user ${user.id} from IP: ${model.ipAddress}, Device: ${model.deviceId}`);

    // # TODO # send email
  }

  private async checkDeviceAndIpSecurity(userId: string, deviceId: string, userAgent: string, ipAddress: string): Promise<void> {
    const userLogins = await this.userLoginRepository.getByUserIdAsync(userId);

    if (userLogins.length === 0) {
      logger.warn(`Password change from new account - User: ${userId}, IP: ${ipAddress}, Device: ${deviceId}`);
      return;
    }

    const recognizedDevice = userLogins.some(login => login.deviceId === deviceId);
    const knownIps = userLogins.map(login => login.ipAddress).filter(ip => ip);
    const isKnownIp = knownIps.some(knownIp => {
      if (knownIp === ipAddress) return true;
      return !ipUtil.hasIpChanged(ipAddress, knownIp);
    });

    if (!recognizedDevice) {
      logger.warn(`Password change from unrecognized device - User: ${userId}, IP: ${ipAddress}, Device: ${deviceId}, UserAgent: ${userAgent}`);
    }

    if (!isKnownIp) {
      const geoInfo = ipUtil.getGeolocationDetails(ipAddress);
      logger.warn(`Password change from new location - User: ${userId}, IP: ${ipAddress}, Location: ${geoInfo?.city || 'Unknown'}, ${geoInfo?.country || 'Unknown'}`);
    }
  }

  private async invalidateOtherSessions(userId: string, currentDeviceId: string): Promise<void> {
    try {
      const userLogins = await this.userLoginRepository.getByUserIdAsync(userId);
      const currentDate = new Date();
      let invalidatedCount = 0;

      for (const login of userLogins) {
        if (login.deviceId !== currentDeviceId) {
          login.isValid = false;
          login.expiryDateUtc = currentDate;
          await this.userLoginRepository.updateAsync(login);
          invalidatedCount++;
        }
      }

      if (invalidatedCount > 0) {
        logger.info(`Invalidated ${invalidatedCount} session(s) for user ${userId} after password change (excluding current device: ${currentDeviceId})`);
      }
    } catch (error) {
      logger.error(`Failed to invalidate sessions for user ${userId} after password change: ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });
    }
  }
}