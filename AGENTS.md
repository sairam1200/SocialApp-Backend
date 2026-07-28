# AGENTS.md — the Gaddr agent system, across both repositories

This is the **cross-repo** document: what the agent system is, how the two halves fit
together, and the rules for extending it. It does not restate either repository's own
`AGENTS.md` — those are the per-repo entry points, and they are the ones an agent
working in a checkout actually reads.

| If you are | Read |
|---|---|
| Working in the backend checkout | [`backend/AGENTS.md`](backend/AGENTS.md) |
| Working in the frontend checkout | [`frontend/AGENTS.md`](frontend/AGENTS.md) |
| Extending or maintaining the agent system itself | this file, then [`index.md`](index.md) |

---

## What the system is

Two products — **Gaddr Search** (cross-platform social search) and **Gaddr Me**
(universal profile) — built as two repositories that deploy independently. Each carries
its own agent configuration under `.claude/`:

```
backend/                            frontend/
  AGENTS.md         entry point       AGENTS.md         entry point
  docs/index.md     doc index         docs/index.md     doc index
  .claude/
    agents/   4 sub-agents              agents/   4 sub-agents
    skills/   7 skills                  skills/   3 skills
```

**Skills and sub-agents are scoped to the directory tree they live in.** Backend skills
do not load while you are working in the frontend, and vice versa. This is a feature —
it keeps ten skill descriptions out of context when only three are relevant — but it
means a task spanning both repos is two pieces of work, not one. Do not expect a single
session to carry both sets of domain knowledge.

## The two layers, and when each applies

**Skills** are knowledge. Only a skill's `description` and `when_to_use` sit in context;
the body loads when one matches the task or you type `/skill-name`. That is why the
descriptions carry literal trigger phrases — a skill that never fires is worse than no
skill, because the knowledge exists and is not applied.

**Sub-agents** are workers with their own context window, tool set and system prompt.
Delegate when a side task would flood the main conversation, or when a constraint should
be enforced rather than requested.

| Repo | Agents | Skills |
|---|---|---|
| backend | `architect`, `backend`, `redis`, `reviewer` | `gaddr-security-review`, `gaddr-encryption`, `gaddr-database`, `gaddr-platform-integration`, `gaddr-testing`, `gaddr-payments`, `gaddr-fraud-identity` |
| frontend | `architect`, `frontend`, `reviewer`, `ui-tester` | `gaddr-frontend-ui`, `gaddr-i18n`, `gaddr-frontend-testing` |

Both repos use the same shape: **architect plans → an implementer writes → a reviewer
checks**, with a specialist alongside (backend `redis`, frontend `ui-tester`).

### Enforced, not requested

Every agent that "does not write code" says so in its prompt *and* is denied the tools:

```yaml
tools: Read, Grep, Glob, Bash, Skill
disallowedTools: Edit, Write, NotebookEdit
```

An agent told not to edit but able to edit eventually will. `disallowedTools` is applied
before `tools` resolves, so an entry in both is removed.

### Every agent can reach the skills

Each agent lists `Skill` in `tools`, and the ones with a near-universal dependency
preload it via `skills:`, which injects the full body at startup:

| Agent | Preloads | Why |
|---|---|---|
| backend `backend` | `gaddr-testing` | Every change ends at the CI gate, and the env bootstrap blocks everyone once |
| backend `reviewer` | `gaddr-security-review` | Every review checks the diff against the known findings |
| frontend `frontend` | `gaddr-frontend-ui` | Every UI change touches tokens, SEO or copy |
| frontend `reviewer` | `gaddr-frontend-ui` | Same checklist, from the other side |
| frontend `ui-tester` | `gaddr-frontend-testing` | It needs the suite's constraints before it runs anything |

The rest are loaded on demand, routed by a table in each agent's prompt. This was a real
defect worth remembering: the agents used to instruct themselves to "load the
`gaddr-database` skill" while `Skill` was absent from their `tools` list, so the
instruction could not be followed. If a prompt names a capability, check the frontmatter
actually grants it.

## What the two repositories teach each other

Kept here because each lesson was paid for once and applies on both sides.

**Unit tests certify units, not products.** Four defects reached production with every
unit test green: aggregated results persisted and never read back, a migration chain
that could not build from empty, connection variables silently discarded, and a `fuse.js`
import that compiled to `undefined`. Each was a gap *between* correct units. The frontend
acted on this by adding Playwright; the backend still verifies boundary-crossing changes
by hand, which is its largest remaining gap.

**The gate has to be the real gate.** Vercel does not typecheck, so `next build` passed
green while `type-check` reported 130 errors. Cloud Build does more, but not everything.
Both repos now carry `scripts/ci.sh` that mirrors the real pipeline locally, and both are
the thing to run before pushing — not the framework's own build.

**A cache miss must not be more permissive than a cache hit — and must not be an outage.**
Session revocation used to skip its check entirely when Redis was cold. The fix was not
to invert it: failing closed without a database fallback logs out every user with a cold
cache. Read, repopulate, then decide. The same shape governs rate limiting, which
degrades to a bounded local counter rather than to "unlimited".

**Contracts break in the gap between two deployments.** The repos deploy independently,
so for a window an old backend serves a new client. Additive changes only, and a new
field must be safe to be absent on the other side.

**Document the defect you left open.** Where a fix has to wait, the current behaviour is
asserted in a test with a `DOCUMENTS finding <id>` comment naming the expectation to
invert. That paid off twice: C4 and C5 both closed, and the assertions to flip were
already written down. The corollary is a maintenance duty — a `DOCUMENTS` comment
pointing at a closed finding is a test certifying a bug that no longer exists.

## Extending the system

1. **New skill?** One domain per skill. Write the `description` as *what it does* plus
   *when to use it*, in the third person, and put literal trigger phrases in
   `when_to_use`. Combined they are truncated at 1,536 characters. Keep the body under
   500 lines; split into sibling files referenced **one level deep** from `SKILL.md`
   rather than nesting.
2. **New sub-agent?** Only when you keep spawning the same worker with the same
   instructions. Give it the narrowest `tools` that lets it finish, and deny the rest.
3. **New rule?** Put it where it is enforced. A rule about migrations belongs in
   `gaddr-database`, not in `AGENTS.md` — the entry point routes, the skill instructs.
4. **Changed reality?** Fix the document in the same change. Everything measurable in
   these files — test counts, warning budgets, table counts — should be a number someone
   ran, and should carry the date if it will move.
5. **Then run `./sync.sh --check`** from this bundle, so the distributable copy does not
   quietly fall behind. See [`index.md`](index.md).

## Infrastructure constraints that shape both sides

| Resource | Limit | Consequence |
|---|---|---|
| Cloud Run RAM | 512 MB, 0.1 vCPU | Stream, never buffer. No unbounded in-process cache. |
| Redis | 30 MB, 30 connections | Every key gets a TTL. Reuse the shared client. |
| Cloudflare R2 | 10 GB | Media goes to R2, never the container filesystem. |
| YouTube API | ~100 searches/day | `search.list` costs 100 of 10,000 daily units. Any wider fan-out needs a quota answer. |
