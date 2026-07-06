import * as Joi from 'joi';
import { ApiProperty } from '@nestjs/swagger';
import { Inject, UnauthorizedException } from '@nestjs/common';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { IAnalyticsService } from '../../../domain/services/ianalytics.service';
import { IUserLoginRepository } from '../../../domain/repositories/iuserLogin.repository';

export class LogoutRequestModel {
  @ApiProperty()
  deviceId: string;
}

export class LogoutCommand {
  model: LogoutRequestModel;

  constructor(request: Partial<LogoutCommand> = {}) {
    Object.assign(this, request);
  }
}

const logoutValidations = Joi.object({
  deviceId: Joi.string()
    .required()
    .messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

@CommandHandler(LogoutCommand)
export class LogoutCommandHandler implements ICommandHandler<LogoutCommand> {
  constructor(
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IANALYTICS_SERVICE)
    private readonly analyticsService: IAnalyticsService,
  ) {}

  public async execute(command: LogoutCommand): Promise<void> {
    const { model } = command;
    await logoutValidations.validateAsync(model);

    const userId = HttpContext.getCurrentUserId;
    if (!userId) {
      throw new UnauthorizedException('User not logged In');
    }

    const userLogins = await this.userLoginRepository.getByUserIdAsync(userId);
    const userLogin = userLogins.find(
      (login) => login.deviceId === model.deviceId,
    );

    if (userLogin) {
      const currentDate = new Date();
      userLogin.isValid = false;
      userLogin.expiryDateUtc = currentDate;
      await this.userLoginRepository.updateAsync(userLogin);

      await this.analyticsService.trackEvent(
        _const.ANALYTICS_EVENTS.AUTH.LOGOUT,
        { deviceId: model.deviceId },
      );

      logger.info(`User ${userId} logged out from device: ${model.deviceId}`);
    }
  }
}
