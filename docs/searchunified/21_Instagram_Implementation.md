# 21 — Instagram Implementation

Status: ⚪ Planned
Phase: Phase 2
Owner: Backend
Last Updated: 2026-07-28
Depends On: [20_Facebook_Implementation](./20_Facebook_Implementation.md)
Next Document: [22_Pinterest_Implementation](./22_Pinterest_Implementation.md)

---

## 1. Executive Summary

This document defines the Instagram Platform Normalizer, mapping Instagram Graph API responses to Canonical Search Documents. Implementation follows the YouTube normalizer pattern established in Phase 1.

**Status:** ⚪ Planned — Phase 2

---

## 2. Instagram Graph API Fields

### 2.1 Media

| Graph API Field | Canonical Field |
|---|---|
| `id` | `externalId` |
| `caption` | `title`, `description` |
| `media_type` | `subType` |
| `media_url` | `mediaUrl` |
| `thumbnail_url` | `thumbnailUrl` |
| `timestamp` | `publishedAt` |
| `like_count` | `engagement.likeCount` |
| `comments_count` | `engagement.commentCount` |
| `username` | `creatorName` |

### 2.2 Hashtags

| Graph API Field | Canonical Field |
|---|---|
| `id` | `externalId` |
| `name` | `title` |
| `media_count` | `engagement.mediaCount` |

---

## 3. Normalizer Implementation

```typescript
@Injectable()
export class InstagramNormalizer implements IInstagramNormalizer {
  normalizeMedia(media: InstagramMedia): CanonicalSearchDocument {
    return {
      platform: 'instagram',
      externalId: media.id,
      type: StreamEntityType.Content,
      subType: media.media_type?.toLowerCase() || 'image',
      title: media.caption || '',
      description: media.caption || '',
      tags: this.extractHashtags(media.caption || ''),
      creatorId: media.username || '',
      creatorName: media.username || '',
      creatorAvatar: '',
      thumbnailUrl: media.thumbnail_url || media.media_url || '',
      mediaUrl: media.media_url || '',
      mediaType: media.media_type?.toLowerCase() || 'image',
      publishedAt: new Date(media.timestamp),
      importedAt: new Date(),
      engagement: {
        likeCount: media.like_count || 0,
        commentCount: media.comments_count || 0,
      },
      platformMetadata: {
        caption: media.caption,
        media_type: media.media_type,
        permalink: media.permalink,
      },
    };
  }

  private extractHashtags(caption: string): string[] {
    const hashtagRegex = /#(\w+)/g;
    const hashtags: string[] = [];
    let match;
    while ((match = hashtagRegex.exec(caption)) !== null) {
      hashtags.push(match[1]);
    }
    return hashtags;
  }
}
```

---

## 4. Integration Points

### 4.1 Existing Instagram Import Service

**File:** `src/infrastructure/services/instagram/instagram-import.service.ts`

Hook into existing import service to trigger indexing.

### 4.2 BullMQ Processor

**File:** `src/infrastructure/background/processors/instagram-import.processor.ts`

Add indexing steps to existing processor.

---

## 5. Quota Considerations

- Instagram Graph API: 200 calls/user/hour
- Rate limiting: Respect `x-business-use-case-usage` headers
- Hashtag search: 30 requests/user/day

---

## 6. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [20_Facebook_Implementation](./20_Facebook_Implementation.md) — Facebook implementation
- [22_Pinterest_Implementation](./22_Pinterest_Implementation.md) — Pinterest implementation
