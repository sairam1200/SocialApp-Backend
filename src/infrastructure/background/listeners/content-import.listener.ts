import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ImportGateway } from '../../websocket/gateways/import.gateway';
import logger from '../../../core/utils/winston.util';

@Injectable()
export class ContentImportListener {
  constructor(private readonly gateway: ImportGateway) {}

  @OnEvent('content.imported', { async: true })
  handleContentImported(payload: {
    userId: string;
    platform: string;
    data: any;
  }): void {
    try {
      this.gateway.emitNewImportContent(
        payload.userId,
        payload.platform,
        payload.data,
      );
    } catch (err: any) {
      logger.error(
        `[ContentImportListener] Failed to emit new-content event: ${err.message}`,
      );
    }
  }
}
