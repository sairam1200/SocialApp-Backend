import * as Joi from 'joi';
import configs from '../../../configs';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../core/utils/const';
import ipUtil from '../../../core/utils/ip.util';
import logger from '../../../core/utils/winston.util';
import { password } from '../../../core/utils/validation.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { parseUserAgent } from '../../../core/utils/userAgent.util';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { UserNotFoundException } from '../../../core/exceptions/user.exception';
import { IEmailService } from '../../../domain/services/iemail.service';
import { IIdentityRepository } from '../../../domain/repositories/iidentity.repository';
import { IUserLoginRepository } from '../../../domain/repositories/iuserLogin.repository';
import ApplicationException from '../../../core/exceptions/application.exception';

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

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordCommandHandler
  implements ICommandHandler<ChangePasswordCommand>
{
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IEMAIL_SERVICE) private readonly emailService: IEmailService,
  ) {}

  public async execute(command: ChangePasswordCommand): Promise<void> {
    const { model } = command;

    await changePasswordValidations.validateAsync(model);

    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UserNotFoundException();
    }

    await this.checkDeviceAndIpSecurity(
      user.id,
      model.deviceId,
      model.userAgent,
      model.ipAddress,
    );

    const result = await this.userRepository.changePasswordAsync(
      user,
      model.currentPassword,
      model.newPassword,
    );
    if (!result) {
      throw new ApplicationException(
        'Failed to update password. Please verify your current password and try again.',
      );
    }

    await this.invalidateOtherSessions(user.id, model.deviceId);
    logger.info(
      `Password changed for user ${user.id} from IP: ${model.ipAddress}, Device: ${model.deviceId}`,
    );

    await this.sendPasswordChangedEmail(user, model);
  }

  private async sendPasswordChangedEmail(
    user: any,
    model: ChangePasswordRequestModel,
  ): Promise<void> {
    try {
      const geoInfo = ipUtil.getGeolocationDetails(model.ipAddress);
      const location = geoInfo
        ? `${geoInfo.city || 'Unknown'}, ${geoInfo.region || ''} ${geoInfo.country || 'Unknown'}`.trim()
        : 'Unknown Location';

      const parsedAgent = parseUserAgent(model.userAgent);
      const deviceType = parsedAgent.isMobile
        ? 'Mobile'
        : parsedAgent.isDesktop
          ? 'Desktop'
          : 'Unknown';
      const deviceInfo = `${parsedAgent.browser} on ${parsedAgent.os} (${deviceType})`;

      const frontendUrl = this.getFrontendUrl();
      const manageAccountLink = `${frontendUrl}/account/security`;

      await this.emailService.sendTemplatedAsync({
        to: user.email,
        subject: 'Your Gaddr Password Was Changed',
        templatePath: 'templates/email/password-changed-v1.html',
        context: {
          userName: user.userName || user.email.split('@')[0],
          userEmail: user.email,
          changeTimestamp: new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
          }),
          requestLocation: location,
          requestIpAddress: model.ipAddress,
          requestDevice: deviceInfo,
          manageAccountLink: manageAccountLink,
          year: new Date().getFullYear(),
        },
      });
    } catch (error) {
      logger.error(
        `Failed to send password changed email for user ${user.id}`,
        error,
      );
    }
  }

  private getFrontendUrl(): string {
    let frontendUrl = configs.frontend.url;
    if (configs.env !== 'production') {
      const headers = HttpContext.headers;
      if (headers) {
        const clientOrigin = headers['x-client-origin'];
        if (clientOrigin) {
          const originValue = Array.isArray(clientOrigin)
            ? clientOrigin[0]
            : clientOrigin;
          if (originValue && typeof originValue === 'string') {
            frontendUrl = originValue.replace(/\/$/, '');
          }
        }
      }
    }
    return frontendUrl;
  }

  private async checkDeviceAndIpSecurity(
    userId: string,
    deviceId: string,
    userAgent: string,
    ipAddress: string,
  ): Promise<void> {
    const userLogins = await this.userLoginRepository.getByUserIdAsync(userId);

    if (userLogins.length === 0) {
      logger.warn(
        `Password change from new account - User: ${userId}, IP: ${ipAddress}, Device: ${deviceId}`,
      );
      return;
    }

    const recognizedDevice = userLogins.some(
      (login) => login.deviceId === deviceId,
    );
    const knownIps = userLogins
      .map((login) => login.ipAddress)
      .filter((ip) => ip);
    const isKnownIp = knownIps.some((knownIp) => {
      if (knownIp === ipAddress) return true;
      return !ipUtil.hasIpChanged(ipAddress, knownIp);
    });

    if (!recognizedDevice) {
      logger.warn(
        `Password change from unrecognized device - User: ${userId}, IP: ${ipAddress}, Device: ${deviceId}, UserAgent: ${userAgent}`,
      );
    }

    if (!isKnownIp) {
      const geoInfo = ipUtil.getGeolocationDetails(ipAddress);
      logger.warn(
        `Password change from new location - User: ${userId}, IP: ${ipAddress}, Location: ${geoInfo?.city || 'Unknown'}, ${geoInfo?.country || 'Unknown'}`,
      );
    }
  }

  private async invalidateOtherSessions(
    userId: string,
    currentDeviceId: string,
  ): Promise<void> {
    try {
      const userLogins =
        await this.userLoginRepository.getByUserIdAsync(userId);
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
        logger.info(
          `Invalidated ${invalidatedCount} session(s) for user ${userId} after password change (excluding current device: ${currentDeviceId})`,
        );
      }
    } catch (error) {
      logger.error(
        `Failed to invalidate sessions for user ${userId} after password change: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );
    }
  }
}
