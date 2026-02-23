# Playlist Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Implements playlist and bookmark collection workflows.

## Scope

- Playlist create/get/list/delete
- Add/remove content
- Add/remove members
- Bookmark add/remove/get

## Structure

- Playlist composition: `src/features/playlist/index.ts`
- Bookmark composition: `src/features/playlist/bookmark/index.ts`

## Dependencies

Wired in `src/modules/playlist.module.ts`.

## Notes

Playlist and bookmark flows are kept separate but composed into one module.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
