# 20 — Facebook Implementation

Status: ⚪ Planned
Phase: Phase 2
Owner: Backend
Last Updated: 2026-07-28
Depends On: [11_YouTube_Normalizer](./11_YouTube_Normalizer.md)
Next Document: [21_Instagram_Implementation](./21_Instagram_Implementation.md)

---

## 1. Executive Summary

This document defines the Facebook Platform Normalizer, mapping Facebook Graph API responses to Canonical Search Documents. Implementation follows the YouTube normalizer pattern established in Phase 1.

**Status:** ⚪ Planned — Phase 2

---

## 2. Facebook Graph API Fields

### 2.1 Posts

| Graph API Field | Canonical Field |
|---|---|
| `id` | `externalId` |
| `message` | `title`, `description` |
| `from.name` | `creatorName` |
| `from.id` | `creatorId` |
| `picture.url` | `thumbnailUrl` |
| `created_time` | `publishedAt` |
| `likes.summary.total_count` | `engagement.likeCount` |
| `comments.summary.total_count` | `engagement.commentCount` |

### 2.2 Pages

| Graph API Field | Canonical Field |
|---|---|
| `id` | `externalId` |
| `name` | `title` |
| `about` | `description` |
| `picture.url` | `thumbnailUrl` |
| `fan_count` | `engagement.followerCount` |

---

## 3. Normalizer Implementation

```typescript
@Injectable()
export class FacebookNormalizer implements IFacebookNormalizer {
  normalizePost(post: FacebookPost): CanonicalSearchDocument {
    return {
      platform: 'facebook',
      externalId: post.id,
      type: StreamEntityType.Content,
      subType: 'post',
      title: post.message || '',
      description: post.message || '',
      tags: [],
      creatorId: post.from?.id || '',
      creatorName: post.from?.name || '',
      creatorAvatar: '',
      thumbnailUrl: post.picture?.url || '',
      mediaUrl: post.link || '',
      mediaType: 'post',
      publishedAt: new Date(post.created_time),
      importedAt: new Date(),
      engagement: {
        likeCount: post.likes?.summary?.total_count || 0,
        commentCount: post.comments?.summary?.total_count || 0,
      },
      platformMetadata: {
        message: post.message,
        link: post.link,
      },
    };
  }
}
```

---

## 4. Integration Points

### 4.1 Existing Facebook Import Service

**File:** `src/infrastructure/services/facebook/facebook-imports.service.ts`

Hook into existing import service to trigger indexing.

### 4.2 BullMQ Processor

**File:** `src/infrastructure/background/processors/facebook-import.processor.ts`

Add indexing steps to existing processor.

---

## 5. Quota Considerations

- Facebook Graph API: 200 calls/user/hour
- Batch requests: Up to 50 requests per batch
- Rate limiting: Respect `x-business-use-case-usage` headers

---

## 6. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [11_YouTube_Normalizer](./11_YouTube_Normalizer.md) — YouTube normalizer (pattern)
- [21_Instagram_Implementation](./21_Instagram_Implementation.md) — Instagram implementation
