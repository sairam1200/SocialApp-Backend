---
name: gaddr-i18n
description: Language handling on the Gaddr Search and Me API. Covers the rule that the API returns codes rather than sentences, why no user-facing copy belongs in a response, script-safe text normalisation for Chinese, Japanese, Korean and Arabic, and locale-aware sorting and collation. Use when adding or changing an endpoint that returns text a user will read, when writing an error message, when touching search normalisation or tokenisation, or when asked about languages, translations or non-Latin scripts.
when_to_use: Trigger phrases include "error message", "return a message", "user-facing text", "translate", "locale", "language", "Arabic", "Chinese", "CJK", "non-Latin", "normalise a query", "tokenise", "collation", "sort order", "accent", and any edit to fuse.util.ts, search normalisation, or an endpoint's response shape.
---

# Languages on the API

**The rules shared with the front end and with Gaddr Jobs are in
[`docs/i18n/LANGUAGES.md`](../../../docs/i18n/LANGUAGES.md), identical in all
three repositories.** Read it first. This skill is the back end's part.

There is no message catalogue here, and there should not be one. The API has no
reader, so it cannot know a language.

## The rule: return a code, never a sentence

An endpoint that returns `"Someone you have worked with"` has decided the
language on the server, where there is no locale. Every such string is a string
the front end can never translate.

```ts
// Wrong. This is now English for every user, in every market, forever.
return { reason: 'Someone you have worked with' };

// Right. The client renders `matches.reason.contact` in the reader's language.
return { reason: 'contact' };
```

The same goes for errors. A thrown `BadRequestException('Email already in use')`
becomes the sentence a user reads unless the client happens to intercept it.
Throw a stable code, and let the client own the wording.

Applies equally to: validation messages, status labels, enum descriptions,
sort option names, notification bodies and anything else that reaches a screen.

**A string is only allowed to be English here when nothing else is possible.**
Cron-triggered email is the honest exception: there is no request, so there is
no locale. Where that happens, the mapping from code to sentence lives in one
named map, so it can move into the catalogues later.

## Non-Latin scripts are a back end problem, not a front end one

Translating the interface does not make a language work. The data path has to
handle the script.

**Current defect.** `src/core/utils/fuse.util.ts` normalises queries with
`.replace(/[^\w\s]/g, ' ')`. `\w` is ASCII-only, so a Chinese, Japanese, Korean
or Arabic query reduces to an empty string and cannot be normalised, tokenised
or cached by term. The behaviour is asserted in `fuse.util.spec.ts`.

The consequence is worth stating plainly: **a reader gets an Arabic interface
and zero search results.** This blocks the Middle East and Asia markets
regardless of how complete the catalogues are.

The fix is Unicode property escapes with the `u` flag:

```ts
.replace(/[^\p{L}\p{N}\s]/gu, ' ')
```

Changing it also changes cache keys and the existing spec, so treat it as a
deliberate migration rather than a one line edit.

## Things that break quietly on non-Latin data

- **Sorting.** `Array.sort()` on strings is code point order, which is wrong for
  every language with accents and meaningless for CJK. Use
  `Intl.Collator(locale)`.
- **Case.** `toLowerCase()` is locale-sensitive. Turkish dotless i is the
  classic failure. Prefer `toLocaleLowerCase(locale)` where a locale is known.
- **Length limits.** A column sized in characters holds far fewer glyphs than
  expected once emoji and CJK arrive, and truncating mid grapheme corrupts text.
  Count with `Intl.Segmenter`, not `.length`.
- **Slugs.** A slug generator that strips non-ASCII turns an Arabic title into
  an empty string. Fall back to an id rather than to nothing.

## Verify

Test with real data in the target scripts, not with accented Latin:

```
العربية        Arabic
简体中文        Chinese, Simplified
日本語          Japanese
한국어          Korean
हिन्दी           Hindi
```

A pipeline that passes on "Åre" and fails on "العربية" is the normal outcome,
so the accented Latin case is not evidence of anything.
