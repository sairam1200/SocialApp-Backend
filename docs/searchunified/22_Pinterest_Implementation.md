# 22 — Pinterest Implementation

Status: ⚪ Planned
Phase: Phase 2
Owner: Backend
Last Updated: 2026-07-28
Depends On: [21_Instagram_Implementation](./21_Instagram_Implementation.md)
Next Document: [23_Future_AI_Search](./23_Future_AI_Search.md)

---

## 1. Executive Summary

This document defines the Pinterest Platform Normalizer, mapping Pinterest API responses to Canonical Search Documents. Implementation follows the YouTube normalizer pattern established in Phase 1.

**Status:** ⚪ Planned — Phase 2

---

## 2. Pinterest API Fields

### 2.1 Pins

| API Field | Canonical Field |
|---|---|
| `id` | `externalId` |
| `title` | `title` |
| `description` | `description` |
| `board.name` | `creatorName` |
| `board.owner` | `creatorId` |
| `images.orig.url` | `thumbnailUrl`, `mediaUrl` |
| `created_at` | `publishedAt` |
| `link` | `mediaUrl` |

### 2.2 Boards

| API Field | Canonical Field |
|---|---|
| `id` | `externalId` |
| `name` | `title` |
| `description` | `description` |
| `owner.first_name` | `creatorName` |
| `pin_count` | `engagement.pinCount` |

---

## 3. Normalizer Implementation

```typescript
@Injectable()
export class PinterestNormalizer implements IPinterestNormalizer {
  normalizePin(pin: PinterestPin): CanonicalSearchDocument {
    return {
      platform: 'pinterest',
      externalId: pin.id,
      type: StreamEntityType.Content,
      subType: 'pin',
      title: pin.title || '',
      description: pin.description || '',
      tags: [],
      creatorId: pin.board?.owner || '',
      creatorName: pin.board?.name || '',
      creatorAvatar: '',
      thumbnailUrl: pin.images?.orig?.url || '',
      mediaUrl: pin.link || pin.images?.orig?.url || '',
      mediaType: 'image',
      publishedAt: new Date(pin.created_at),
      importedAt: new Date(),
      engagement: {},
      platformMetadata: {
        link: pin.link,
        board: pin.board,
      },
    };
  }
}
```

---

## 4. Integration Points

### 4.1 Existing Pinterest Import Service

**File:** `src/infrastructure/services/pinterest/pinterest-import.service.ts`

Hook into existing import service to trigger indexing.

### 4.2 BullMQ Processor

**File:** `src/infrastructure/background/processors/pinterest-import.processor.ts`

Add indexing steps to existing processor.

---

## 5. Quota Considerations

- Pinterest API: 1000 calls/user/hour
- Rate limiting: Respect `X-RateLimit-Remaining` headers
- Search: 100 calls/user/hour

---

## 6. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [21_Instagram_Implementation](./21_Instagram_Implementation.md) — Instagram implementation
- [23_Future_AI_Search](./23_Future_AI_Search.md) — Future AI search features
