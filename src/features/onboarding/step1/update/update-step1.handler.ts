import * as Joi from 'joi';
import { Inject, BadRequestException } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { User, UserBiometric } from '../../../../domain/entities';
import { OnboardingStep, ProfileImagePrivacy } from '../../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IIdentityRepository } from '../../../../domain/repositories';
import {
  OnboardingStep1Model,
  OnboardingStatusModel,
} from '../../../../domain/contracts/onboarding.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { UserNotFoundException } from '../../../../core/exceptions';
import {
  uploadBase64ToCloudinaryAsync,
  deleteFromCloudinaryAsync,
} from '../../../../core/utils/cloudinary.util';
import { generateInitialImage } from '../../../../core/utils/canvas.util';
import { stringUtil } from '../../../../core/utils/string.util';
import logger from '../../../../core/utils/winston.util';
import { UploadedFile } from '../../../../domain/types/uploadedFile.type';

export class OnboardingStep1Command {
  file?: UploadedFile;
  model: OnboardingStep1Model;

  constructor(request: Partial<OnboardingStep1Command> = {}) {
    Object.assign(this, request);
  }
}

const step1Validations = Joi.object<OnboardingStep1Model>({
  username: Joi.string().min(3).max(30).allow(null, '').optional(),
  bio: Joi.string().max(500).allow(null, '').optional(),
});

@CommandHandler(OnboardingStep1Command)
export class OnboardingStep1CommandHandler implements ICommandHandler<
  OnboardingStep1Command,
  OnboardingStatusModel
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
  ) {}

  public async execute(
    command: OnboardingStep1Command,
  ): Promise<OnboardingStatusModel> {
    const { model, file } = command;
    await step1Validations.validateAsync(model);

    const userId = HttpContext.getCurrentUserId;
    const user = await this.userRepository.getUserByIdAsync(userId);

    if (!user) {
      throw new UserNotFoundException();
    }

    let biometrics =
      user.biometrics ||
      (await this.userRepository.getUserBiometricAsync(user.id));

    if (file) {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
      ];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Invalid file type. Only images are allowed.',
        );
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        throw new BadRequestException(
          'File size exceeds the maximum limit of 5MB.',
        );
      }

      const oldProfileImageUrl = biometrics?.profileImageUrl;

      const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const uploadResult = await uploadBase64ToCloudinaryAsync(
        base64Image,
        'users',
      );

      if (!biometrics) {
        const fullName =
          [user.firstName, user.lastName].filter(Boolean).join('') ||
          user.email.split('@')[0];
        const initials = stringUtil.extractInitialsFromName(fullName);
        const base64InitialsImage = generateInitialImage(initials);
        const initialsUploadResult = await uploadBase64ToCloudinaryAsync(
          base64InitialsImage,
          'users',
        );

        biometrics = new UserBiometric({
          userId: user.id,
          profileImageUrl: uploadResult.secure_url,
          defaultProfileImageUrl: initialsUploadResult.secure_url,
          privacy: ProfileImagePrivacy.Everyone,
        });
        await this.userRepository.upsertUserBiometricAsync(user.id, biometrics);
      } else {
        biometrics.profileImageUrl = uploadResult.secure_url;
        await this.userRepository.upsertUserBiometricAsync(user.id, biometrics);
      }

      if (oldProfileImageUrl) {
        await this.deleteOldProfileImage(oldProfileImageUrl);
      }
    }

    if (model.username !== undefined) {
      user.userName = model.username || null;
      user.normalizedUserName = model.username?.toUpperCase() || null;
    }
    if (model.bio !== undefined) {
      user.bio = model.bio || null;
    }

    if (
      user.onboardingStep === OnboardingStep.NotStarted ||
      user.onboardingStep === null
    ) {
      user.onboardingStep = OnboardingStep.ProfileData;
    }

    await this.userRepository.updateAsync(user);

    return new OnboardingStatusModel({
      currentStep: user.onboardingStep,
      isCompleted: user.onboardingStep === OnboardingStep.Completed,
    });
  }

  private async deleteOldProfileImage(imageUrl: string): Promise<void> {
    try {
      const publicId = this.extractPublicIdFromCloudinaryUrl(imageUrl);
      if (publicId) {
        await deleteFromCloudinaryAsync(publicId);
        logger.info(`Deleted old profile image from Cloudinary: ${publicId}`);
      }
    } catch (error) {
      logger.error(
        `Failed to delete old profile image from Cloudinary: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
    }
  }

  private extractPublicIdFromCloudinaryUrl(url: string): string | null {
    try {
      const cloudinaryPattern =
        /res\.cloudinary\.com\/[^\/]+\/image\/upload\/(?:v\d+\/)?([^.]+)/;
      const match = url.match(cloudinaryPattern);
      if (match && match[1]) {
        return match[1];
      }
      return null;
    } catch (error) {
      logger.error(
        `Failed to extract public ID from Cloudinary URL: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
      return null;
    }
  }
}
