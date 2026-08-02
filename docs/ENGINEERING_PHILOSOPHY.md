# Engineering philosophy

How we build here. This is a governing document: it outranks convenience, it
outranks personal preference, and it applies to every future change in both
repositories.

If a rule below conflicts with something you were about to do, the rule wins —
or you change the rule, in this file, with the reason written down.

---

## 1. Reuse before you build

**Search before you create.** `grep` and `glob` first. Say what you are reusing.

The default assumption is that the thing already exists. It usually does, under
a name you did not guess. Ten minutes of searching is cheaper than every future
hour spent keeping two implementations in step.

When you genuinely need something new, ask in order:

1. Can an existing thing be **extended**? (best)
2. Can an existing thing be **generalised** to cover both cases? (good)
3. Does this need a **new abstraction** that replaces both? (sometimes)
4. Does this need to be **new and separate**? (rare — justify it in a comment)

**Never fork logic.** Two parallel implementations of the same idea is not two
options, it is one bug that has to be fixed twice and will not be. This
codebase already carries two auth systems, `formik` *and* `react-hook-form`,
`yup` *and* `zod`, and two crop libraries. Each of those was one reasonable
local decision. Do not make the next one.

### Reuse a dependency before writing one — but read the licence

Prefer MIT or Apache-2.0 libraries that can be vendored or depended on freely.
Prefer them over hand-rolling, and prefer them over a heavier framework.

But size counts against them here: this container has **512 MB of RAM**. When a
dependency brings megabytes of corpora for sixty lines of behaviour, write the
sixty lines and say why in the file header. `core/utils/recommendation/text.ts`
does exactly that, and names the two libraries it rejected.

---

## 2. Abstract, generalise, deduplicate — consistently

**One concept, one implementation, one place.**

The test for whether an abstraction is right is not elegance. It is: *when this
concept changes, how many places have to change?* If the answer is more than
one, the abstraction is wrong or missing.

Worked examples in this codebase, each of which replaced a fork:

| One thing | Instead of | What it prevents |
|---|---|---|
| `social.posts` with a `kind` column | Separate tables for posts, comments, reposts, stories, polls, clips | Ten copies of visibility filtering, ranking, moderation, metrics and notification fan-out, drifting apart |
| `visibilityPredicate()` | An inline `WHERE visibility = 'public'` per read path | The author's choice being honoured in the feed and quietly lost in search, or in an Open Graph tag |
| `FeedService.mapPostsAsync()` | Bespoke hydration per endpoint | An N+1 sneaking into the fourth list endpoint someone adds |
| `RecommendationService` generic over kind | A separate ranker for creators, brands and products | Four notions of "good" that disagree, so the feed and Explore recommend different things |
| One `layout.html` for email | Ten HTML files | Eight emails that look right and two that look like 2009 |
| `courses` covering guides and articles | `Guide`, `Article` and `Course` entities | Three enrolment paths, three progress models, three search integrations |
| `identity.user_follows` used by Community | A second follow graph keyed by profile | Two graphs needing reconciliation forever |

### Generalise on the second case, not the first

One case is a function. Two cases are a parameter. Three cases are an
abstraction. Do not build the abstraction before you have seen the second case
— you will guess the axis wrong and the abstraction will be worse than the
duplication it replaced.

### But deduplicate the moment you see the duplicate

The counterpart of the rule above: when you are *about to* write the second
copy, stop and generalise then. That is the cheapest moment it will ever be.

---

## 3. Make the wrong thing impossible, not merely discouraged

Prefer a design where the mistake cannot be expressed over one where a comment
asks you not to make it.

- Money is `bigint` minor units end to end, so a float cannot appear.
- A balance is `SUM()` over a ledger, so it cannot disagree with its history.
- `MUTABLE_STREAM_SETTINGS` is an allow-list, so a credential added to the
  entity later cannot become writable by a settings `PATCH`.
- A direct conversation has a unique `directKey`, so "message this person"
  cannot create a second thread.
- Quiz answer keys are stripped server-side, so a client cannot leak them.

**Allow-lists over deny-lists.** A `...rest` spread silently starts accepting
whatever is added to the type next year. An explicit list of permitted fields
does not.

**Fail closed.** `authorisePublishAsync` returns `false` on any unexpected
condition, because the alternative is an open ingest port. `canView` denies an
unknown visibility value rather than defaulting to visible.

---

## 4. Push work to where it can be done once

**Filter in SQL, not in application code.** Filtering a fetched page after the
query silently shrinks it — ask for 20, get 6 — and makes keyset pagination
skip rows at page boundaries. Every read of `social.posts` goes through
`baseVisibleQuery`, which applies status, visibility and expiry in one place.

**Batch at the boundary.** Twenty impressions from one feed page is one insert,
not twenty. Six queries per page, not six per post.

**Compute derived values once, at write time.** `searchText` is built by the
application and written explicitly. A column default would be skipped by any
bulk insert that names its columns — which is exactly how
`contentStreams.searchText` ended up NULL on every row, silently disabling the
trigram index it existed for.

---

## 5. Degrade, don't fail

A partial answer beats an error, wherever a partial answer is honest.

- A failing candidate source drops out of the fusion; the feed still renders.
  `Promise.allSettled`, never `Promise.all`.
- A recommender that returns nothing falls through to chronological.
- Publishing to Gaddr always succeeds; external platforms are recorded and
  dispatched afterwards. A dead third-party token can never fail a publish.
- A missing media server yields `configured: false` and a UI that says so,
  rather than ingest URLs pointing nowhere.
- An email that fails to send does not undo the invite it was announcing.

**But never degrade a security decision.** Availability bends; authorisation
does not.

---

## 6. Write for the person who arrives after the bug

Comments explain **why**, never what. The code says what.

Every non-obvious decision carries the reason it was made — and, where one
exists, the failure that taught it. `AGENTS.md` and the skills exist for the
same reason: every rule in them was paid for once already, and reading them is
cheaper than rediscovering them.

When you fix something subtle, leave the trap description behind:

> The guard here used to be `if (user.twoFactorEnabled) throw`, which is
> backwards: it rejected exactly the users who *need* to verify.

That comment is worth more than the fix, because the fix is one line and the
misunderstanding is what recurs.

**Record what was checked and found fine**, not only what was broken. The audit
has a "Checked and cleared" section for this reason: it stops the next person
re-investigating settled ground.

---

## 7. Prove it end to end

A green gate is not evidence that the application runs.

`tsc` does not evaluate a DI graph. Unit tests inject stubs, which is what
makes them unit tests. Four defects here got through both: the C5 guard
dependency, the `fuse.js` interop 500 (types fine, `dist/` wrong), the
non-recursive entity glob, and `searchText` landing NULL on every row.

So, after any change to a provider, module, guard, entity or DI token:

```bash
npm run build && node dist/main.js   # watch for "Nest can't resolve dependencies"
```

And for anything crossing the layers, run the real thing:

```bash
node scripts/community-smoke.js      # 44 assertions over HTTP, real Postgres
```

Each layer sees something the others cannot. Use all of them.

---

## 8. The user is not the product's opponent

Where the product and the person using it could diverge, choose the person.

- The ranker's weights are named, published in
  `core/utils/recommendation/ranking-weights.ts`, and editable. Setting every
  source but `following` to zero produces a chronological timeline — a
  legitimate thing to want, and not something anyone should have to leave for.
- Sponsored posts are placed at a fixed cadence and **never scored up**. Paid
  reach is a fixed share of the feed rather than something buyable.
- Every ranked post explains itself.
- A sponsored post cannot be published without a disclosure. The composer
  refuses.
- The author's visibility choice is honoured everywhere, including metadata,
  because metadata is content.
- Reach means distinct people. Conflating it with impressions is the most
  common way a creator dashboard lies, and a creator who prices a brand deal
  off an inflated number finds out expensively.

---

## 9. Names carry weight

A name that is wrong costs more than a name that is ugly.

Known naming defects, safe to correct on sight: `UserAccoutGuard` /
`AdminAccoutGuard` / `GuestAccoutGuard` are misspelled; `core/passport/`
contains plain Nest guards, not Passport strategies; the `userBiometrics` table
holds profile image URLs.

When you cannot fix a name cheaply, document it where someone will hit it.

---

## 10. Small, honest, complete

- **Small:** the change should be reviewable. If it cannot be, split it.
- **Honest:** report what actually happened. Failing tests get named with their
  output. A skipped step gets said out loud. "Done" means verified.
- **Complete:** finish the whole task. A feature with no tests, no docs and no
  i18n is not done, it is started. If part of it is genuinely blocked, finish
  everything else and say exactly what was left and why.

---

## Applying this

**Before you write code:** search for what exists; decide extend / generalise /
new; say which.

**While you write it:** one concept, one place. Comment the *why*. Make the
wrong thing unrepresentable.

**Before you call it done:** `./scripts/ci.sh`, boot the process, run the
end-to-end script if you crossed layers, check both colour schemes and mobile
width, and update the docs and the skills you invalidated.

Cross-references: [`AGENTS.md`](../AGENTS.md) ·
[frontend `AGENTS.md`](https://github.com/TeamGaddr/Gaddr-Search-Me-Frontend/blob/main/AGENTS.md) ·
[`docs/social/`](social/)
