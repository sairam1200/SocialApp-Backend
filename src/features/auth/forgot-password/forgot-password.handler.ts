import * as Joi from "joi";
import configs from "../../../configs";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import ipUtil from "../../../core/utils/ip.util";
import logger from "../../../core/utils/winston.util";
import { stringUtil } from "../../../core/utils/string.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { parseUserAgent } from "../../../core/utils/userAgent.util";
import { IEmailService } from "../../../domain/services/iemail.service";
import { IDataProtectionKeyRepository } from "../../../domain/repositories";
import { HttpContext } from "../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";

export class ForgotPasswordRequestModel {
  @ApiProperty()
  email: string;

  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty()
  deviceId: string;
}

export class ForgotPasswordCommand {

  model: ForgotPasswordRequestModel;

  constructor(request: Partial<ForgotPasswordCommand> = {}) {
    Object.assign(this, request);
  }
}

const forgotPasswordValidations = Joi.object({
  email: Joi.string().email().required(),
  userAgent: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  deviceId: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

@CommandHandler(ForgotPasswordCommand)
export class ForgotPasswordCommandHandler implements ICommandHandler<ForgotPasswordCommand> {

  constructor(
    @Inject(_const.IEMAIL_SERVICE) private readonly emailService: IEmailService,
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY) private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: ForgotPasswordCommand): Promise<void> {

    const { model } = command;

    await forgotPasswordValidations.validateAsync(model)

    try {

      const user = await this.userRepository.getUserByEmailAsync(model.email);
      if (!user || !user.emailConfirmed) {
        return;
      }

      const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
      const code = stringUtil.generateRandomNumberString(6);

      const existingKeys = await this.dataProtectionKeyRepository.getByUserIdAsync(user.id);
      const existingResetKeys = existingKeys.filter(
        key => key.key === _const.TOKEN.PURPOSE.RESET_PASSWORD
      );

      for (const existingKey of existingResetKeys) {
        await this.dataProtectionKeyRepository.deleteAsync(existingKey);
      }

      await this.dataProtectionKeyRepository.createAsync(
        _const.TOKEN.PURPOSE.RESET_PASSWORD,
        code,
        user.id,
        expiresIn
      );

      const frontendUrl = this.getFrontendUrl();
      const passwordResetLink = `${frontendUrl}/reset-password?code=${code}`;

      const geoInfo = ipUtil.getGeolocationDetails(model.ipAddress);
      const location = geoInfo
        ? `${geoInfo.city || 'Unknown'}, ${geoInfo.region || ''} ${geoInfo.country || 'Unknown'}`.trim()
        : 'Unknown Location';

      const parsedAgent = parseUserAgent(model.userAgent);
      const deviceType = parsedAgent.isMobile ? 'Mobile' : parsedAgent.isDesktop ? 'Desktop' : 'Unknown';
      const deviceInfo = `${parsedAgent.browser} on ${parsedAgent.os} (${deviceType})`;

      logger.info(`Password reset requested for user ${user.id} from IP: ${model.ipAddress}, Location: ${location}, Device: ${deviceInfo}`);

      await this.emailService.sendTemplatedAsync({
        to: user.email,
        subject: "Reset Your Gaddr Password",
        templatePath: "templates/email/forgot-password-v1.html",
        context: {
          verificationCode: code,
          passwordResetLink: passwordResetLink,
          year: new Date().getFullYear(),
          requestIpAddress: model.ipAddress,
          requestLocation: location,
          requestDevice: deviceInfo,
          requestUserAgent: model.userAgent,
          requestTimestamp: new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          }),
        },
      });
    } catch (error) {
      logger.error("", error)
    }
  }

  private getFrontendUrl(): string {
    let frontendUrl = configs.frontend.url;
    if (configs.env !== 'production') {
      const headers = HttpContext.headers;
      if (headers) {
        const clientOrigin = headers['x-client-origin'];
        if (clientOrigin) {
          const originValue = Array.isArray(clientOrigin) ? clientOrigin[0] : clientOrigin;
          if (originValue && typeof originValue === 'string') {
            frontendUrl = originValue.replace(/\/$/, '');
          }
        }
      }
    }
    return frontendUrl;
  }
}