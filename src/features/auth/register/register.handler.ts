import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import logger from '../../../core/utils/winston.util';
import { User, UserBiometric } from "../../../domain/entities";
import { UserType, ProfileImagePrivacy } from "../../../domain/enums";
import { stringUtil } from "../../../core/utils/string.util";
import { IUserRepository } from "../../../domain/repositories";
import { password } from "../../../core/utils/validation.util";
import { UserModel } from "../../../domain/contracts/user.model";
import { mapToUserModel } from "../../../domain/mappers/user.mapper";
import { SendVerificationEmailCommand } from "../../../features/user";
import { UserAlreadyExistsException } from "../../../core/exceptions";
import { generateInitialImage } from "../../../core/utils/canvas.util";
import { IEmailService } from "../../../domain/services/iemail.service";
import { IAnalyticsService } from "../../../domain/services/ianalytics.service";
import { CommandBus, CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { uploadBase64ToCloudinaryAsync } from "../../../core/utils/cloudinary.util";

export class RegisterModel {
  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty({ required: false })
  referralCode?: string;

  constructor(request: Partial<RegisterModel> = {}) {
    Object.assign(this, request);
  }
}

export class RegisterCommand {
  model: RegisterModel

  constructor(request: Partial<RegisterCommand> = {}) {
    Object.assign(this, request);
  }
}

const createUserValidations = Joi.object({
  email: Joi.string().required().email(),
  password: Joi.string().required().custom(password),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  userAgent: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  referralCode: Joi.string().optional().allow('', null),
});

@CommandHandler(RegisterCommand)
export class RegisterCommandHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly commandBus: CommandBus,
    @Inject(_const.IEMAIL_SERVICE)
    private readonly emailService: IEmailService,
    @Inject(_const.IANALYTICS_SERVICE)
    private readonly analyticsService: IAnalyticsService,
  ) { }

  public async execute(command: RegisterCommand): Promise<UserModel> {

    const { model } = command;

    await createUserValidations.validateAsync(model);

    const existUser = await this.userRepository.getUserByEmailAsync(model.email);
    if (existUser) {
      throw new UserAlreadyExistsException(model.email, "email");
    }

    const initials = stringUtil.extractInitialsFromName(`${model.firstName} ${model.lastName}`);
    const base64Image = generateInitialImage(initials);

    const avatar = await uploadBase64ToCloudinaryAsync(base64Image, "users");

    const user = await this.userRepository.createAsync(
      new User({
        firstName: model.firstName.trim(),
        lastName: model.lastName.trim(),
        email: model.email.toLowerCase(),
        phoneNumber: "",
        type: UserType.User,
        biometrics: new UserBiometric({
          profileImageUrl: null,
          defaultProfileImageUrl: avatar.secure_url,
          privacy: ProfileImagePrivacy.Everyone,
        })
      }), model.password);

    await this.commandBus.execute(new SendVerificationEmailCommand({
      model: {
        userAgent: model.userAgent,
        ipAddress: model.ipAddress,
        email: user.email,
      }
    }));

    // Apply referral code if provided
    if (model.referralCode) {
      try {
        const inviter = await this.userRepository.getUserByReferralCodeAsync(model.referralCode);
        if (inviter) {
          user.referredBy = inviter.id;
          await this.userRepository.updateAsync(user);
        }
      } catch (error) {
        logger.error(`Failed to apply referral code '${model.referralCode}' for user ${user.id}`, error);
      }
    }

    await this.analyticsService.trackEvent(
      _const.ANALYTICS_EVENTS.AUTH.REGISTER,
      {
        ipAddress: model.ipAddress,
        userAgent: model.userAgent,
      }
    );

    this.sendWelcomeEmail(user)
    return mapToUserModel(user, true, avatar.secure_url);
  }

  private async sendWelcomeEmail(user: User): Promise<void> {
    try {
      await this.emailService.sendTemplatedAsync({
        to: user.email,
        subject: "Welcome to Gaddr",
        templatePath: "templates/email/welcome-email-v1.html",
        context: {
          year: new Date().getFullYear(),
        },
      });
    } catch (error) {
      logger.error(`Failed to send welcome email for user ${user.id}`, error);
    }
  }
}