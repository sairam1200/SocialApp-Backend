import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SearchCacheService } from '../../services/searchCache.service';
import logger from '../../../core/utils/winston.util';

const CLEAR_DEBOUNCE_MS = 1000;

/**
 * Coalesces contentStreams mutations (index/delete) into a single unified
 * search cache clear. The unified cache key does not reference individual
 * documents, so a mutation can only be reflected by clearing the whole
 * namespace. The debounce turns a bulk import/reindex (one event per
 * document) into one Redis SCAN+DEL instead of hundreds.
 */
@Injectable()
export class ContentIndexCacheListener {
  private clearTimer: NodeJS.Timeout | null = null;
  private pendingMutations = 0;

  constructor(private readonly searchCache: SearchCacheService) {}

  @OnEvent('content.indexed')
  @OnEvent('content.deleted')
  handleContentMutation(): void {
    this.pendingMutations++;
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
    }
    this.clearTimer = setTimeout(() => {
      this.clearTimer = null;
      const pending = this.pendingMutations;
      this.pendingMutations = 0;
      void this.searchCache.clearAllUnifiedCache().then(() => {
        if (pending > 0) {
          logger.info(
            `[ContentIndexCache] Cleared unified search cache after ${pending} content mutation(s)`,
          );
        }
      });
    }, CLEAR_DEBOUNCE_MS);
  }
}
