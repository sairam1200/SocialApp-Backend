# Documentation index — Gaddr Search & Me, Backend

Every document in this repository, with what it is for and whether it is current.
Start from [`../AGENTS.md`](../AGENTS.md) if you are an AI agent.

**Frontend counterpart:** [`TeamGaddr/Gaddr-Search-Me-Frontend`](https://github.com/TeamGaddr/Gaddr-Search-Me-Frontend) → `docs/index.md`

---

## 1. Start here

| Document | Purpose |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Agent entry point — architecture, request lifecycle, conventions, working rules |
| [`../README.md`](../README.md) | Human onboarding — setup, environment, running locally |
| [`audit/2026-07_Security_And_Correctness_Audit.md`](audit/2026-07_Security_And_Correctness_Audit.md) | **Read before touching auth, crypto or permissions.** Verified findings, remediation status, and settled non-issues |
| [`roadmap/IMPLEMENTATION_PLAN.md`](roadmap/IMPLEMENTATION_PLAN.md) | **Where the platform is and what to build next.** Sequenced phases, what is deliberately deferred and why, plus the legal questions needing professional review |
| [`integrations/STATUS.md`](integrations/STATUS.md) | **Which platform credentials actually work**, verified by live API call. Check this before debugging "search returns nothing" |
| [`integrations/END_TO_END_VERIFICATION.md`](integrations/END_TO_END_VERIFICATION.md) | A real run of the full search chain — live YouTube API → Postgres → user-facing endpoint — with the four defects it exposed and how to reproduce it |

## 1b. Skills and sub-agents

Loadable capability documents, kept beside the code so they stay accurate.

| Skill | Covers |
|---|---|
[`.claude/skills/gaddr-security-review`](../.claude/skills/gaddr-security-review/SKILL.md) | Auth, guards, tokens, CORS, webhooks, rate limiting |
[`.claude/skills/gaddr-encryption`](../.claude/skills/gaddr-encryption/SKILL.md) | Data at rest, key management, the CBC→GCM migration |
[`.claude/skills/gaddr-payments`](../.claude/skills/gaddr-payments/SKILL.md) | Stripe, Gaddr Pay, marketplace payouts, SCA/VAT, on-chain |
[`.claude/skills/gaddr-fraud-identity`](../.claude/skills/gaddr-fraud-identity/SKILL.md) | Mobile BankID, KYC tiers, fraud signals, abuse defence |
[`.claude/skills/gaddr-platform-integration`](../.claude/skills/gaddr-platform-integration/SKILL.md) | Adding or repairing a platform; API and MCP exposure |
[`.claude/skills/gaddr-testing`](../.claude/skills/gaddr-testing/SKILL.md) | Writing and running tests; the env bootstrap |

Sub-agents in [`../.claude/agents/`](../.claude/agents/): `architect` (plans, writes
no code), `backend` (implements), `redis` (cache and BullMQ), `reviewer` (pre-merge).
Ported from the original OpenCode-format definitions and updated against current
reality.

## 1c. Build and CI

| File | Purpose |
|---|---|
| [`../cloudbuild.yaml`](../cloudbuild.yaml) | Cloud Build pipeline → Cloud Run. GitHub Actions deliberately unused (cost) |
| [`../scripts/ci.sh`](../scripts/ci.sh) | Same gate, locally. Typecheck, lint, tests, secret scan, build |
| [`../.gitleaks.toml`](../.gitleaks.toml) | Secret-scan config. Allowlists verified false positives; adds a rule catching committed DB dumps by content |
| [`../test/jest-setup-env.ts`](../test/jest-setup-env.ts) | Env bootstrap that makes importing real modules in tests possible |

## 2. Source-tree documentation

Layer READMEs live beside the code they describe, so they stay honest.

| Layer | Document |
|---|---|
| Overview | [`../src/README.md`](../src/README.md) |
| Features (vertical slices, CQRS) | [`../src/features/README.md`](../src/features/README.md) |
| Domain (models, interfaces) | [`../src/domain/README.md`](../src/domain/README.md) |
| Infrastructure (implementations) | [`../src/infrastructure/README.md`](../src/infrastructure/README.md) |
| Core (cross-cutting) | [`../src/core/README.md`](../src/core/README.md) |
| Modules (DI wiring) | [`../src/modules/README.md`](../src/modules/README.md) |

**Infrastructure detail:**
[persistence](../src/infrastructure/persistence/README.md) ·
[repositories](../src/infrastructure/repositories/README.md) ·
[services](../src/infrastructure/services/README.md) ·
[migrations](../src/infrastructure/migrations/README.md) ·
[background jobs](../src/infrastructure/background/README.md) ·
[websocket](../src/infrastructure/websocket/README.md)

**Feature detail:**
[auth](../src/features/auth/README.md) ·
[search](../src/features/search/README.md) ·
[integrations](../src/features/integrations/README.md) ·
[profile](../src/features/profile/README.md) ·
[user](../src/features/user/README.md) ·
[onboarding](../src/features/onboarding/README.md) ·
[notification](../src/features/notification/README.md) ·
[playlist](../src/features/playlist/README.md) ·
[role](../src/features/role/README.md)

> **Known drift:** [`../src/modules/README.md`](../src/modules/README.md) states that
> `DataSeeder.initializeAsync()` runs on bootstrap. It does not — the call is
> commented out at `app.module.ts:76`, so roles are never seeded on a fresh
> environment. See finding M2 in the audit before re-enabling it.

## 3. API contracts

| Document | Purpose |
|---|---|
| [`asyncapi.yaml`](asyncapi.yaml) | WebSocket/event contract (AsyncAPI) |
| [`AsyncAPI/index.html`](AsyncAPI/index.html) | Rendered AsyncAPI reference |
| Swagger / Scalar | Served at runtime, **non-production only** (`main.ts` gates on `configs.env`) |

## 4. Architecture and migration history

These document the Search + Me consolidation. They use generic `ProjectA` /
`ProjectB` naming; `_v2` supersedes the unsuffixed version where both exist.

| Document | Purpose |
|---|---|
| [`01_ProjectA_Architecture_v2.md`](01_ProjectA_Architecture_v2.md) | Project A architecture (current) |
| [`02_ProjectB_Architecture_v2.md`](02_ProjectB_Architecture_v2.md) | Project B architecture (current) |
| [`03_Schema_Comparison_v2.md`](03_Schema_Comparison_v2.md) | Schema differences |
| [`04_Shared_Identity_Architecture_v2.md`](04_Shared_Identity_Architecture_v2.md) | Shared identity model — relevant to the two-auth-systems problem (H2) |
| [`05_Migration_Strategy_v2.md`](05_Migration_Strategy_v2.md) | Migration approach |
| [`06_ProjectA_Changes_v2.md`](06_ProjectA_Changes_v2.md) · [`07_ProjectB_Changes_v2.md`](07_ProjectB_Changes_v2.md) | Required changes per project |
| [`08_Master_Architecture_Review.md`](08_Master_Architecture_Review.md) | Consolidated review |
| [`08_Final_Architecture_Review.md`](08_Final_Architecture_Review.md) · [`08_Architecture_Review_Summary.md`](08_Architecture_Review_Summary.md) | Earlier review passes |
| [`09_Build_Compatibility_Report.md`](09_Build_Compatibility_Report.md) | Build compatibility |
| [`09_Table_Comparison.md`](09_Table_Comparison.md) | Table-level comparison |
| [`10_Risk_Register.md`](10_Risk_Register.md) | Migration risks |
| [`10_Rename_Strategy_Investigation.md`](10_Rename_Strategy_Investigation.md) · [`11_Domain_Rename_Analysis.md`](11_Domain_Rename_Analysis.md) · [`12_UserRepository_Rename_Analysis_Project_B.md`](12_UserRepository_Rename_Analysis_Project_B.md) | Rename analyses |
| [`11_Rollback_Strategy.md`](11_Rollback_Strategy.md) | Rollback plan |
| [`12_Critical_Blocker_Decisions.md`](12_Critical_Blocker_Decisions.md) | Blocker decisions |
| [`analysis-youtube-analytics-import.md`](analysis-youtube-analytics-import.md) | YouTube analytics import design |
| [`../audit/`](../audit/) | Superseded first-pass architecture docs (`01`, `06`) — kept for history |
| [`../RESTORE_REPORT.md`](../RESTORE_REPORT.md) | Restore operation record |

## 5. Conventions for adding documentation

- **Layer and feature docs live beside the code** (`src/**/README.md`) so they are
  reviewed in the same diff. Cross-cutting documents live here in `docs/`.
- **Add every new document to this index.** An unlisted document is one an agent
  will not find.
- **Date and scope point-in-time analyses** (audits, reviews) and record the commit
  they were verified against.
- **Prefer correcting a document over adding a `_v3`.** The `_v2` proliferation
  above is what to avoid; git history is the version record.
- **When code contradicts a document, fix the document in the same change** — or
  flag the drift explicitly, as done for `DataSeeder` in §2.

## 6. Known gaps

Tracked so they are not rediscovered. Detail in the audit, §6 "Gaps against the
stated product mandate".

| Gap | State |
|---|---|
| Test coverage | **87 tests, 5 suites** (was 0). Concentrated on auth and search — the areas with critical findings. Everything else is uncovered. |
| Request validation | No global `ValidationPipe`; `class-validator` not installed. Joi is used per-handler and for env config. |
| Rate limiting | 4 auth routes only; **search and integrations unlimited** despite fanning out to metered third-party APIs. `trust proxy` is now set, so `req.ip` is finally correct. |
| Security headers | No `helmet`; no CSP, HSTS, or frame options. |
| Session revocation | Fails open on Redis cache miss (finding C5, open). Needs a DB fallback before it can fail closed. |
| Token encryption | Static IV, unauthenticated CBC (finding C4, open). Needs the AES-GCM dual-read migration. |
| Payments / KYC | Nothing built. Both land on the auth layer — settle the open C-series findings first. |
| Platform credentials | Only YouTube verified working, and it allows ~100 searches/day. See [`integrations/STATUS.md`](integrations/STATUS.md). |

Full sequencing in [`roadmap/IMPLEMENTATION_PLAN.md`](roadmap/IMPLEMENTATION_PLAN.md).
