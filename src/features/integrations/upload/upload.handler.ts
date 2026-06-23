import { BadRequestException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { uploadBase64ToCloudinaryAsync } from "../../../core/utils/cloudinary.util";
import { UploadedFile } from "../../../domain/types/uploadedFile.type";

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
  'video/webm',
];

const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256MB

export class UploadMediaCommand {
  file?: UploadedFile;

  constructor(request: Partial<UploadMediaCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(UploadMediaCommand)
export class UploadMediaCommandHandler implements ICommandHandler<UploadMediaCommand> {
  public async execute(command: UploadMediaCommand): Promise<{ url: string }> {
    const file = command.file;

    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type: "${file.mimetype}". Allowed types: images (JPEG, PNG, GIF, WebP) and videos (MP4, MPEG, MOV, AVI, MKV, WebM)`);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds the maximum limit of 256MB');
    }

    const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const result = await uploadBase64ToCloudinaryAsync(base64, 'uploads');

    return { url: result.secure_url };
  }
}
