import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../core/utils/const';
import ipUtil from '../../../core/utils/ip.util';
import logger from '../../../core/utils/winston.util';
import { stringUtil } from '../../../core/utils/string.util';
import { password } from '../../../core/utils/validation.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { parseUserAgent } from '../../../core/utils/userAgent.util';
import { User } from '../../../domain/entities/identity/user.entity';
import { IEmailService } from '../../../domain/services/iemail.service';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { IIdentityRepository } from '../../../domain/repositories/iidentity.repository';
import { UserNotFoundException } from '../../../core/exceptions/user.exception';
import ApplicationException from '../../../core/exceptions/application.exception';
import { DataProtectionKey } from '../../../domain/entities/dataProtectionKey.entity';
import { IUserLoginRepository } from '../../../domain/repositories/iuserLogin.repository';
import { IDataProtectionKeyRepository } from '../../../domain/repositories/idataProtectionKey.repository';

export class ResetPasswordRequestModel {
  @ApiProperty()
  code: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty()
  deviceId: string;

  @ApiProperty()
  newPassword: string;
}

export class ResetPasswordCommand {
  model: ResetPasswordRequestModel;

  constructor(request: Partial<ResetPasswordCommand> = {}) {
    Object.assign(this, request);
  }
}

const resetPasswordValidations = Joi.object({
  code: Joi.string().required(),
  email: Joi.string().email().required(),
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

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordCommandHandler implements ICommandHandler<ResetPasswordCommand> {
  constructor(
    @Inject(_const.IEMAIL_SERVICE)
    private readonly emailService: IEmailService,
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(command: ResetPasswordCommand): Promise<void> {
    const { model } = command;
    await resetPasswordValidations.validateAsync(model);
    model.email = stringUtil.normalizeEmail(model.email);
    const user = await this.userRepository.getUserByEmailAsync(model.email);
    if (!user) {
      throw new UserNotFoundException();
    }

    await this.validateVerificationCodeAsync(user.id, model.code);

    // Security: Check device and IP, log suspicious activity
    await this.checkDeviceAndIpSecurity(
      user.id,
      model.deviceId,
      model.userAgent,
      model.ipAddress,
    );

    const result = await this.userRepository.updatePassword(
      user,
      model.newPassword,
    );
    if (!result) {
      throw new ApplicationException(
        'Failed to update password. Please try again later.',
      );
    }

    await this.invalidateAllUserSessions(user.id);
    logger.info(
      `Password reset completed for user ${user.id} from IP: ${model.ipAddress}, Device: ${model.deviceId}`,
    );

    await this.sendPasswordChangedEmail(user, model);
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
        `Password reset from new account - User: ${userId}, IP: ${ipAddress}, Device: ${deviceId}`,
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
      // send email unrocognized device changed password
      logger.warn(
        `Password reset from unrecognized device - User: ${userId}, IP: ${ipAddress}, Device: ${deviceId}, UserAgent: ${userAgent}`,
      );
    }

    if (!isKnownIp) {
      const geoInfo = ipUtil.getGeolocationDetails(ipAddress);
      // send email
      logger.warn(
        `Password reset from new location - User: ${userId}, IP: ${ipAddress}, Location: ${geoInfo?.city || 'Unknown'}, ${geoInfo?.country || 'Unknown'}`,
      );
    }
  }

  private async invalidateAllUserSessions(userId: string): Promise<void> {
    const userLogins = await this.userLoginRepository.getByUserIdAsync(userId);
    const currentDate = new Date();

    for (const login of userLogins) {
      login.isValid = false;
      login.expiryDateUtc = currentDate;
      await this.userLoginRepository.updateAsync(login);
    }

    if (userLogins.length > 0) {
      logger.info(
        `Invalidated ${userLogins.length} session(s) for user ${userId} after password reset`,
      );
    }
  }

  private async validateVerificationCodeAsync(
    userId: string,
    code: string,
  ): Promise<DataProtectionKey> {
    const verificationKeys =
      await this.dataProtectionKeyRepository.getByUserIdAsync(userId);
    const currentTime = Math.floor(Date.now() / 1000);

    const dataProtectionKey = verificationKeys.find(
      (key) =>
        key.key === _const.TOKEN.PURPOSE.RESET_PASSWORD &&
        key.value === code &&
        key.expiresIn &&
        key.expiresIn >= currentTime,
    );

    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid or expired reset code');
    }

    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
    return dataProtectionKey;
  }

  private async sendPasswordChangedEmail(
    user: User,
    model: ResetPasswordRequestModel,
  ): Promise<void> {
    if (!user?.email) {
      return;
    }

    try {
      const geoInfo = ipUtil.getGeolocationDetails(model.ipAddress);
      const locationSegments = [
        geoInfo?.city,
        geoInfo?.region,
        geoInfo?.country,
      ].filter((segment) => Boolean(segment && segment.toString().trim()));
      const location = locationSegments.length
        ? locationSegments.join(', ')
        : 'Unknown Location';

      const parsedAgent = parseUserAgent(model.userAgent);
      const deviceType = parsedAgent.isMobile
        ? 'Mobile'
        : parsedAgent.isDesktop
          ? 'Desktop'
          : 'Unknown';
      const deviceInfo = `${parsedAgent.browser} on ${parsedAgent.os} (${deviceType})`;

      const displayName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.userName ||
        user.email;
      const frontendUrl = this.getFrontendUrl();
      const manageAccountLink = `${frontendUrl}/settings/security`;

      await this.emailService.sendTemplatedAsync({
        to: user.email,
        subject: 'Your Gaddr password was changed',
        templatePath: 'templates/email/password-changed-v1.html',
        context: {
          userName: displayName,
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
          requestIpAddress: model.ipAddress,
          requestLocation: location,
          requestDevice: deviceInfo,
          manageAccountLink,
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
}
