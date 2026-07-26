import {
  Body,
  Controller,
  Get,
  Param,
  Post as HttpPost,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ConversationModel,
  MessageModel,
} from '../../domain/contracts/social.model';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { UserAccoutGuard } from '../../core/passport';
import { MessagingService } from '../../infrastructure/services/social/messaging.service';
import { clampInt } from './feed.endpoint';

@ApiTags('Community')
@Controller({ path: '/community', version: '1' })
export class CommunityMessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('conversations')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, type: [ConversationModel] })
  public async list(
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<ConversationModel[]> {
    return this.messaging.listAsync(HttpContext.getCurrentUserId, {
      limit: clampInt(limit, 30, 1, 100),
      before: before ?? null,
    });
  }

  @HttpPost('conversations')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Open a direct conversation',
    description:
      'Idempotent. The pair key is unique, so asking twice returns the same thread rather than creating a second one.',
  })
  public async open(
    @Body() body: { profileId: string },
  ): Promise<{ id: string }> {
    const conversation = await this.messaging.openDirectAsync({
      userId: HttpContext.getCurrentUserId,
      targetProfileId: body?.profileId,
    });
    return { id: conversation.id };
  }

  @Get('conversations/:conversationId/messages')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Read a conversation',
    description:
      'Reading clears the unread badge — a separate "mark read" call is one a client can forget, and then the badge sticks.',
  })
  @ApiResponse({ status: 200, type: [MessageModel] })
  public async messages(
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<MessageModel[]> {
    return this.messaging.listMessagesAsync({
      userId: HttpContext.getCurrentUserId,
      conversationId,
      cursor: {
        limit: clampInt(limit, 40, 1, 100),
        before: before ?? null,
      },
    });
  }

  @HttpPost('conversations/:conversationId/messages')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 201, type: MessageModel })
  public async send(
    @Param('conversationId') conversationId: string,
    @Body()
    body: {
      body?: string;
      sharedPostId?: string;
      media?: Array<{ url: string; kind: string; thumbnailUrl?: string }>;
    },
  ): Promise<MessageModel> {
    return this.messaging.sendAsync({
      userId: HttpContext.getCurrentUserId,
      conversationId,
      body: body?.body,
      sharedPostId: body?.sharedPostId,
      media: body?.media,
    });
  }

  @Get('conversations/unread-count')
  @UseGuards(UserAccoutGuard)
  public async unread(): Promise<{ count: number }> {
    return {
      count: await this.messaging.countUnreadAsync(
        HttpContext.getCurrentUserId,
      ),
    };
  }
}
