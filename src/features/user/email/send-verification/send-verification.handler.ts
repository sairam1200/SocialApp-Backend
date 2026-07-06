import * as Joi from 'joi';
import configs from '../../../../configs';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import ipUtil from '../../../../core/utils/ip.util';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { parseUserAgent } from '../../../../core/utils/userAgent.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { UserNotFoundException } from '../../../../core/exceptions/user.exception';
import { IEmailService } from '../../../../domain/services/iemail.service';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { stringUtil } from '../../../../core/utils/string.util';

export class SendVerificationEmailRequestModel {
  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty({ required: false })
  email: string;
}

export class SendVerificationEmailCommand {
  model: SendVerificationEmailRequestModel;

  constructor(request: Partial<SendVerificationEmailCommand> = {}) {
    Object.assign(this, request);
  }
}

const sendVerificationEmailValidations = Joi.object({
  userAgent: Joi.string()
    .required()
    .messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string()
    .required()
    .messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  email: Joi.string().email(),
});

@CommandHandler(SendVerificationEmailCommand)
export class SendVerificationEmailCommandHandler
  implements ICommandHandler<SendVerificationEmailCommand>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.IEMAIL_SERVICE) private readonly emailService: IEmailService,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(command: SendVerificationEmailCommand): Promise<void> {
    const { model } = command;

    await sendVerificationEmailValidations.validateAsync(model);

    const user = await this.userRepository.getUserByEmailAsync(
      model.email,
      true,
    );
    if (!user) {
      logger.info(`User not found: ${model.email}`);
      return;
    }

    if (user.emailConfirmed) {
      logger.info(
        `Verification email requested for already verified user ${user.id}`,
      );
      return;
    }

    await this.sendVerificationEmail(user, model);
  }

  private async sendVerificationEmail(
    user: any,
    model: SendVerificationEmailRequestModel,
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
      const expirationTimeSeconds = Math.floor(
        configs.Token.expirationTime / 1000,
      );
      const expiresIn = Math.floor(Date.now() / 1000) + expirationTimeSeconds;
      const verificationCode = stringUtil.generateRandomNumberString(6);
      const confirmEmailLink = `${frontendUrl}/verify-email?email=${user.email}&code=${verificationCode}`;

      await this.dataProtectionKeyRepository.createAsync(
        _const.TOKEN.PURPOSE.CONFIRM_EMAIL,
        verificationCode,
        user.id,
        expiresIn,
      );

      await this.emailService.sendTemplatedAsync({
        to: user.email,
        subject: 'Action Required: Verify Your Gaddr Email Address',
        templatePath: 'templates/email/comfirm-email-v1.html',
        context: {
          confirmationMessage:
            'We’ve received a request to associate this email address with your gaddr account.',
          verificationCode: verificationCode,
          confirmEmailLink: confirmEmailLink,
          userEmail: user.email,
          requestTimestamp: new Date().toLocaleString('en-US', {
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
          expirationTime: '24 hours',
          securityWarning:
            "If you didn't create an account with Gaddr, please ignore this email.",
          year: new Date().getFullYear(),
        },
      });

      logger.info(
        `Verification email sent to user ${user.id} from IP: ${model.ipAddress}, Location: ${location}, Device: ${deviceInfo}`,
      );
    } catch (error) {
      logger.error(
        `Failed to send verification email for user ${user.id}: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );
      throw error;
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
