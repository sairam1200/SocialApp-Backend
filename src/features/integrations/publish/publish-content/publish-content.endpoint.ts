import { CommandBus } from '@nestjs/cqrs';
import { ApiTags, ApiResponse } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import {
  Controller,
  Post,
  UseGuards,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { PublishContentCommand } from './publish-content.command';
import _const from '../../../../core/utils/const';
import { PublishValidationError } from '../../../../core/exceptions/publishing.exception';
import { PostType } from '../../../../domain/enums';

class PublishContentDto {
  linkedAccountId: string;
  platform: string;
  uploadId: string;
  title: string;
  description?: string;
  tags?: string[];
  visibility?: 'public' | 'private' | 'unlisted';
  publishAt?: string;
  postType?: PostType;
}

class PublishContentResponseDto {
  publishJobId: string;
  platform: string;
  status: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/publish`,
  version: '1',
})
export class PublishContentController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('content')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({
    status: 200,
    description: 'Publish job queued',
    type: PublishContentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async publishContent(
    @Body() dto: PublishContentDto,
  ): Promise<PublishContentResponseDto> {
    if (!dto.linkedAccountId) {
      throw new PublishValidationError('linkedAccountId is required');
    }
    if (!dto.platform) {
      throw new PublishValidationError('platform is required');
    }
    if (!dto.uploadId) {
      throw new PublishValidationError('uploadId is required');
    }
    if (!dto.title || dto.title.trim().length === 0) {
      throw new PublishValidationError('title is required');
    }

    if (dto.postType && !Object.values(PostType).includes(dto.postType)) {
      throw new PublishValidationError(
        `Invalid postType: ${dto.postType}. Must be one of: ${Object.values(PostType).join(', ')}`,
      );
    }

    return this.commandBus.execute(
      new PublishContentCommand(
        undefined as any,
        dto.linkedAccountId,
        dto.platform,
        dto.uploadId,
        dto.title,
        dto.description,
        dto.tags,
        dto.visibility,
        dto.publishAt ? new Date(dto.publishAt) : undefined,
        { postType: dto.postType },
      ),
    );
  }
}
