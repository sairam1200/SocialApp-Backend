import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { Inject, BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { stringUtil } from '../../../../core/utils/string.util';
import { UserNotFoundException } from '../../../../core/exceptions';
import { generateInitialImage } from '../../../../core/utils/canvas.util';
import { ProfileImagePrivacy } from '../../../../domain/enums';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { UserBiometric } from '../../../../domain/entities/identity/userBiometric.entity';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import {
  uploadBase64ToCloudinaryAsync,
  deleteFromCloudinaryAsync,
} from '../../../../core/utils/cloudinary.util';
import { UploadedFile } from '../../../../domain/types/uploadedFile.type';

export class UpdateProfileImageCommand {
  file?: UploadedFile;
  privacy?: ProfileImagePrivacy;

  constructor(request: Partial<UpdateProfileImageCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(UpdateProfileImageCommand)
export class UpdateProfileImageCommandHandler
  implements ICommandHandler<UpdateProfileImageCommand>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  public async execute(command: UpdateProfileImageCommand): Promise<void> {
    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    console.log('COMMAND FILE', command.file);
    if (!user) {
      throw new UserNotFoundException();
    }

    let biometrics =
      user.biometrics ||
      (await this.userRepository.getUserBiometricAsync(user.id));

    if (command.file) {
      // Validate file
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
      ];
      if (!allowedMimeTypes.includes(command.file.mimetype)) {
        throw new BadRequestException(
          'Invalid file type. Only images are allowed.',
        );
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (command.file.size > maxSize) {
        throw new BadRequestException(
          'File size exceeds the maximum limit of 5MB.',
        );
      }

      // Store the old profile image URL before uploading new one
      const oldProfileImageUrl = biometrics?.profileImageUrl;

      // Upload new custom image first
      const base64Image = `data:${command.file.mimetype};base64,${command.file.buffer.toString('base64')}`;
      const uploadResult = await uploadBase64ToCloudinaryAsync(
        base64Image,
        'users',
      );
      console.log('UPLOAD RESULT', uploadResult);
      // Create or update UserBiometrics
      if (!biometrics) {
        // Generate initials image if UserBiometrics doesn't exist
        const fullName =
          [user.firstName, user.lastName].filter(Boolean).join(' ') ||
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
          privacy: command.privacy || ProfileImagePrivacy.Everyone,
        });
        await this.userRepository.upsertUserBiometricAsync(user.id, biometrics);
      } else {
        biometrics.profileImageUrl = uploadResult.secure_url;
        if (command.privacy !== undefined) {
          biometrics.privacy = command.privacy;
        }
        await this.userRepository.upsertUserBiometricAsync(user.id, biometrics);
      }

      // Delete old profile image after successful upload and save
      if (
        oldProfileImageUrl &&
        oldProfileImageUrl !== uploadResult.secure_url
      ) {
        await this.deleteOldProfileImage(oldProfileImageUrl);
      }
    } else {
      const fullName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.email.split('@')[0];
      const initials = stringUtil.extractInitialsFromName(fullName);
      const base64Image = generateInitialImage(initials);
      const avatar = await uploadBase64ToCloudinaryAsync(base64Image, 'users');

      if (biometrics?.defaultProfileImageUrl) {
        await this.deleteOldProfileImage(biometrics.defaultProfileImageUrl);
      }
      if (biometrics?.profileImageUrl) {
        await this.deleteOldProfileImage(biometrics.profileImageUrl);
      }

      if (!biometrics) {
        biometrics = new UserBiometric({
          userId: user.id,
          profileImageUrl: null,
          defaultProfileImageUrl: avatar.secure_url,
          privacy: command.privacy || ProfileImagePrivacy.Everyone,
        });
        await this.userRepository.upsertUserBiometricAsync(user.id, biometrics);
      } else {
        biometrics.profileImageUrl = null;
        biometrics.defaultProfileImageUrl = avatar.secure_url;
        if (command.privacy !== undefined) {
          biometrics.privacy = command.privacy;
        }
        await this.userRepository.upsertUserBiometricAsync(user.id, biometrics);
      }
    }
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
      // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{folder}/{public_id}.{format}
      // Or with version: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{folder}/{public_id}.{format}
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
