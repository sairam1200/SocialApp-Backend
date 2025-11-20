import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { Inject, BadRequestException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { stringUtil } from "../../../../core/utils/string.util";
import { UserNotFoundException } from "../../../../core/exceptions";
import { generateInitialImage } from "../../../../core/utils/canvas.util";
import { ProfileImagePrivacy } from "../../../../domain/enums";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import { uploadBase64ToCloudinaryAsync, deleteFromCloudinaryAsync } from "../../../../core/utils/cloudinary.util";

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

export class UpdateProfileImageCommand {
  file?: UploadedFile;
  privacy?: ProfileImagePrivacy;

  constructor(request: Partial<UpdateProfileImageCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(UpdateProfileImageCommand)
export class UpdateProfileImageCommandHandler implements ICommandHandler<UpdateProfileImageCommand> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: UpdateProfileImageCommand): Promise<void> {
    const user = await this.userRepository.getUserByIdAsync(HttpContext.getCurrentUserId);
    if (!user) {
      throw new UserNotFoundException();
    }

    if (user.profileImage) {
      await this.deleteOldProfileImage(user.profileImage);
    }

    let profileImageUrl: string;

    if (command.file) {
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(command.file.mimetype)) {
        throw new BadRequestException('Invalid file type. Only images are allowed.');
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (command.file.size > maxSize) {
        throw new BadRequestException('File size exceeds the maximum limit of 5MB.');
      }

      const base64Image = `data:${command.file.mimetype};base64,${command.file.buffer.toString('base64')}`;
      const uploadResult = await uploadBase64ToCloudinaryAsync(base64Image, "users");
      profileImageUrl = uploadResult.secure_url;
    } else {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email.split('@')[0];
      const initials = stringUtil.extractInitialsFromName(fullName);
      const base64Image = generateInitialImage(initials);
      const avatar = await uploadBase64ToCloudinaryAsync(base64Image, "users");
      profileImageUrl = avatar.secure_url;
    }

    user.profileImage = profileImageUrl;

    // Update privacy setting if provided
    if (command.privacy !== undefined) {
      user.profileImagePrivacy = command.privacy;
    }

    await this.userRepository.updateAsync(user);
  }

  private async deleteOldProfileImage(imageUrl: string): Promise<void> {
    try {
      const publicId = this.extractPublicIdFromCloudinaryUrl(imageUrl);
      if (publicId) {
        await deleteFromCloudinaryAsync(publicId);
        logger.info(`Deleted old profile image from Cloudinary: ${publicId}`);
      }
    } catch (error) {
      logger.error(`Failed to delete old profile image from Cloudinary: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    }
  }

  private extractPublicIdFromCloudinaryUrl(url: string): string | null {
    try {
      // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{folder}/{public_id}.{format}
      // Or with version: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{folder}/{public_id}.{format}
      const cloudinaryPattern = /res\.cloudinary\.com\/[^\/]+\/image\/upload\/(?:v\d+\/)?([^.]+)/;
      const match = url.match(cloudinaryPattern);

      if (match && match[1]) {
        return match[1];
      }

      return null;
    } catch (error) {
      logger.error(`Failed to extract public ID from Cloudinary URL: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      return null;
    }
  }
}