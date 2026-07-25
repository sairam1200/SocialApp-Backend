import configs from '../../configs';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import _const from '../../core/utils/const';
import ipUtil from '../../core/utils/ip.util';
import logger from '../../core/utils/winston.util';
import { stringUtil } from '../../core/utils/string.util';
import { parseUserAgent } from '../../core/utils/userAgent.util';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { User, DataProtectionKey } from '../../domain/entities';
import { IEmailService } from '../../domain/services/iemail.service';
import { IDataProtectionKeyRepository } from '../../domain/repositories/idataProtectionKey.repository';

export interface SendVerificationEmailOptions {
  user: User;
  targetEmail: string;
  userAgent: string;
  ipAddress: string;
  isEmailChange: boolean;
  updateUser?: boolean;
  deliveryMode: 'sync' | 'async';
}

@Injectable()
export class VerificationEmailService {
  constructor(
    @Inject(_const.IEMAIL_SERVICE)
    private readonly emailService: IEmailService,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    private readonly dataSource: DataSource,
  ) {}

  async sendVerificationEmail(
    options: SendVerificationEmailOptions,
  ): Promise<void> {
    const { user, targetEmail, isEmailChange, updateUser, deliveryMode } =
      options;

    logger.info(
      `[VerificationEmail] CHECKPOINT 2: Service received targetEmail=${targetEmail} for userId=${user.id} (isEmailChange=${isEmailChange}, updateUser=${updateUser}, deliveryMode=${deliveryMode})`,
    );

    const verificationCode = stringUtil.generateRandomNumberString(6);
    const confirmEmailLink = this.buildConfirmationUrl(
      targetEmail,
      verificationCode,
    );
    const tokenKey = isEmailChange
      ? `${_const.TOKEN.PURPOSE.CONFIRM_EMAIL}:${targetEmail}`
      : _const.TOKEN.PURPOSE.CONFIRM_EMAIL;

    const expirationTimeSeconds = Math.floor(
      configs.Token.expirationTime / 1000,
    );
    const expiresIn = Math.floor(Date.now() / 1000) + expirationTimeSeconds;

    await this.dataSource.transaction(async (em) => {
      if (updateUser) {
        if (isEmailChange) {
          await em.getRepository(User).update(user.id, {
            newEmail: targetEmail,
            lastEmailModifiedAt: new Date(),
          });
        } else {
          await em.getRepository(User).update(user.id, {
            email: targetEmail,
            normalizedEmail: targetEmail.toUpperCase(),
            newEmail: null,
          });
        }
      }

      await this.rotateTokens(user.id, em);

      await em.getRepository(DataProtectionKey).save(
        new DataProtectionKey({
          key: tokenKey,
          value: verificationCode,
          userId: user.id,
          expiresIn,
        }),
      );
    });

    await this.queueEmail(options, verificationCode, confirmEmailLink);
  }

  private async rotateTokens(userId: string, em: any): Promise<void> {
    await this.dataProtectionKeyRepository.deleteByUserIdAsync(userId, em);
  }

  private buildConfirmationUrl(
    targetEmail: string,
    verificationCode: string,
  ): string {
    const frontendUrl = this.getFrontendUrl();
    return `${frontendUrl}/confirm-email/${encodeURIComponent(targetEmail)}?code=${verificationCode}`;
  }

  private async queueEmail(
    options: SendVerificationEmailOptions,
    verificationCode: string,
    confirmEmailLink: string,
  ): Promise<void> {
    const {
      user,
      targetEmail,
      userAgent,
      ipAddress,
      isEmailChange,
      deliveryMode,
    } = options;

    const geoInfo = ipUtil.getGeolocationDetails(ipAddress);
    const location = geoInfo
      ? `${geoInfo.city || 'Unknown'}, ${geoInfo.region || ''} ${geoInfo.country || 'Unknown'}`.trim()
      : 'Unknown Location';

    const parsedAgent = parseUserAgent(userAgent);
    const deviceType = parsedAgent.isMobile
      ? 'Mobile'
      : parsedAgent.isDesktop
        ? 'Desktop'
        : 'Unknown';
    const deviceInfo = `${parsedAgent.browser} on ${parsedAgent.os} (${deviceType})`;

    const emailOptions = {
      to: targetEmail,
      subject: 'Action Required: Verify Your Gaddr Email Address',
      templatePath: 'templates/email/comfirm-email-v1.html',
      context: {
        confirmationMessage: isEmailChange
          ? 'We\u2019ve received a request to change the email address on your gaddr account.'
          : 'We\u2019ve received a request to associate this email address with your gaddr account.',
        verificationCode: verificationCode,
        confirmEmailLink: confirmEmailLink,
        userEmail: targetEmail,
        requestTimestamp: new Date().toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        }),
        requestIpAddress: ipAddress,
        requestLocation: location,
        requestDevice: deviceInfo,
        expirationTime: '24 hours',
        securityWarning: isEmailChange
          ? "If you didn't request this change, please ignore this email."
          : "If you didn't create an account with Gaddr, please ignore this email.",
        year: new Date().getFullYear(),
      },
    };

    logger.info(
      `[VerificationEmail] CHECKPOINT 3: Queue payload to=${emailOptions.to} subject="${emailOptions.subject}" deliveryMode=${deliveryMode}`,
    );

    if (deliveryMode === 'sync') {
      await this.emailService.sendTemplatedSync(emailOptions);
    } else {
      await this.emailService.sendTemplatedAsync(emailOptions);
    }

    logger.info(
      `Verification email sent to ${targetEmail} for user ${user.id}${isEmailChange ? ' (email change)' : ''} from IP: ${ipAddress}, Location: ${location}, Device: ${deviceInfo}`,
    );
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
