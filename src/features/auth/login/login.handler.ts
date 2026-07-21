import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../core/utils/const';
import { stringUtil } from '../../../core/utils/string.util';
import logger from '../../../core/utils/winston.util';
import { User } from '../../../domain/entities';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ITokenService } from '../../../domain/services/itoken.service';
import { IEmailService } from '../../../domain/services/iemail.service';
import { IIdentityRepository } from '../../../domain/repositories/iidentity.repository';
import { IAnalyticsService } from '../../../domain/services/ianalytics.service';
import { TokenResponseModel } from '../../../domain/contracts/tokenResponse.model';
import { IUserLoginRepository } from '../../../domain/repositories/iuserLogin.repository';

export class TokenRequestModel {
  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty()
  deviceId: string;

  constructor(request: Partial<TokenRequestModel> = {}) {
    Object.assign(this, request);
  }
}

const loginValidations = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
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

export class LoginCommand {
  model: TokenRequestModel;

  constructor(request: Partial<LoginCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(LoginCommand)
export class LoginCommandHandler implements ICommandHandler<LoginCommand> {
  constructor(
    @Inject(_const.ITOKEN_SERVICE) private readonly tokenService: ITokenService,
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IEMAIL_SERVICE)
    private readonly emailService: IEmailService,
    @Inject(_const.IANALYTICS_SERVICE)
    private readonly analyticsService: IAnalyticsService,
  ) {}

  public async execute(command: LoginCommand): Promise<TokenResponseModel> {
    await loginValidations.validateAsync(command.model);
    command.model.email = stringUtil.normalizeEmail(command.model.email);

    const user = await this.userRepository.getUserByEmailAsync(
      command.model.email,
    );
    if (
      !user ||
      !(await this.userRepository.checkPasswordAsync(
        user,
        command.model.password,
      ))
    ) {
      await this.handleFailedLoginAttempt(user);
      return this.createErrorResponse('Invalid login attempt.');
    }

    if (!user.emailConfirmed) {
      return this.createErrorResponse('Invalid login attempt.');
    }

    if (this.isAccountLockedOrInactive(user)) {
      return this.handleLockedOrInactiveAccount(user);
    }

    return this.handleSuccessfulLogin(user, command.model);
  }

  private async handleSuccessfulLogin(
    user: User,
    model: TokenRequestModel,
  ): Promise<TokenResponseModel> {
    user.accessFailedCount = 0;
    await this.userRepository.updateAsync(user);

    if (user.twoFactorEnabled) {
      const access_token = this.tokenService.generate2FAJwt(
        user,
        model.ipAddress,
        model.userAgent,
        model.deviceId,
      );

      return new TokenResponseModel({
        access_token,
        isTwoFARequired: true,
        succeeded: false,
      });
    } else {
      const access_token = await this.tokenService.generateJwtAsync(user);
      const userToken = await this.userLoginRepository.createAysnc(
        'Gaddr',
        user.id,
        model.deviceId,
        model.userAgent,
        model.ipAddress,
      );

      await this.userRepository.cacheUserAccountAsync(
        user,
        _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC,
      );
      // TODO: Send email notification of login with new ipAddress and deviceInfo

      /*  if (String(user.onboardingStep) !== 'Completed') {
        this.sendWelcomeEmail(user);
      } */

      await this.analyticsService.trackEvent(
        _const.ANALYTICS_EVENTS.AUTH.LOGIN,
        {
          ipAddress: model.ipAddress,
          userAgent: model.userAgent,
          deviceId: model.deviceId,
        },
      );

      return new TokenResponseModel({
        access_token,
        refresh_token: userToken.tokenValue,
        succeeded: true,
        refreshTokenExpiryTime: Math.floor(
          userToken.expiryDateUtc.getTime() / 1000,
        ),
        onboardingCompleted: String(user.onboardingStep) === 'Completed',
      });
    }
  }

  private async handleFailedLoginAttempt(user: User | null): Promise<void> {
    if (user) {
      user.accessFailedCount += 1;
      await this.userRepository.updateAsync(user);
    }
  }

  private isAccountLockedOrInactive(user: User): boolean {
    return user.isLockedOut || !user.isActive;
  }

  private handleLockedOrInactiveAccount(user: User): TokenResponseModel {
    const message = this.getAccountLockMessage(user);
    return this.createErrorResponse(message);
  }

  private getAccountLockMessage(user: User): string {
    if (!user.isActive) {
      return 'Your account has been deactivated.';
    }

    return user.accessFailedCount >= 5
      ? 'Your account is locked due to too many unsuccessful login attempts.'
      : 'Your account has been locked due to suspicious activity.';
  }

  private createErrorResponse(message: string): TokenResponseModel {
    return new TokenResponseModel({ message, succeeded: false });
  }

  private async sendWelcomeEmail(user: User): Promise<void> {
    try {
      await this.emailService.sendTemplatedAsync({
        to: user.email,
        subject: 'Welcome to Gaddr',
        templatePath: 'templates/email/welcome-email-v1.html',
        context: {
          year: new Date().getFullYear(),
        },
      });
    } catch (error) {
      logger.error(`Failed to send welcome email for user ${user.id}`, error);
    }
  }
}
