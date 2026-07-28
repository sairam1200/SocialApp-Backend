# Docs 2 — the complete Gaddr documentation bundle

Everything in this folder, what it is for, and whether it is current.

**This bundle is a copy. The repositories are authoritative.** Change a document in
`backend/` or `frontend/`, then run `./sync.sh --pull` here. Editing the copy and
expecting it to take effect is the mistake that made the first version of this folder
obsolete — it held OpenCode-format agent definitions for months after the repos had
moved on.

```bash
./sync.sh --check    # does this bundle still match the repos? (read-only, exit 1 on drift)
./sync.sh --pull     # update the bundle from the repos
```

---

## 1. What this is, and how it differs from Docs 1

| Folder | Contains | Use it for |
|---|---|---|
| **Docs 1** | The agent system only — both repos' `AGENTS.md`, sub-agents and skills | Installing or reviewing the agent configuration; onboarding a new repo |
| **Docs 2** (here) | The agent system **plus** the full documentation set: the security audit, the implementation plan, integration status, and the Search + Me consolidation corpus | Understanding *why* the system is shaped the way it is, and what is still outstanding |

Both track the repositories and both carry `sync.sh`. This one additionally mirrors
`backend/docs/`, `backend/audit/` and `frontend/docs/`.

[`AGENTS.md`](AGENTS.md) — the cross-repo system document — is identical in both
bundles, since it describes one system.

## 2. Layout

Mirrors the real repository layout, so the agent system can be installed with a copy:

```
AGENTS.md                         cross-repo system document — start here
index.md                          this file
sync.sh                           --check / --pull / --install
backend/
  AGENTS.md                       entry point
  .claude/agents/     4 agents    architect · backend · redis · reviewer
  .claude/skills/     7 skills
  docs/                           the full backend documentation set, incl. its own index.md
  audit/                          superseded first-pass architecture docs (01, 06)
frontend/
  AGENTS.md                       entry point
  .claude/agents/     4 agents    architect · frontend · reviewer · ui-tester
  .claude/skills/     3 skills
  docs/index.md                   frontend documentation index
legacy-opencode/                  superseded originals — history only, do not install
```

> **Links inside the copied repo documents will not all resolve here, and that is
> expected.** `backend/AGENTS.md` and `backend/docs/index.md` point at
> `src/**/README.md`, `scripts/ci.sh`, `cloudbuild.yaml` and similar — files that exist
> in a real checkout, not in this bundle. They resolve once installed. The links in
> *this* file and in [`AGENTS.md`](AGENTS.md) are bundle-relative and all resolve.

## 3. Start here

| Document | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **The cross-repo system document.** How skills and sub-agents divide the work, what the two repositories taught each other, and the rules for extending the system |
| [`backend/docs/audit/2026-07_Security_And_Correctness_Audit.md`](backend/docs/audit/2026-07_Security_And_Correctness_Audit.md) | **Read before touching auth, crypto or permissions.** Verified findings, remediation status, and a "Checked and cleared" list of plausible bugs that were not real |
| [`backend/docs/roadmap/IMPLEMENTATION_PLAN.md`](backend/docs/roadmap/IMPLEMENTATION_PLAN.md) | Where the platform is and what to build next; what is deliberately deferred, and the legal questions needing professional review |
| [`backend/docs/integrations/STATUS.md`](backend/docs/integrations/STATUS.md) | **Which platform credentials actually work**, verified by live API call. Check before debugging "search returns nothing" |
| [`backend/docs/integrations/END_TO_END_VERIFICATION.md`](backend/docs/integrations/END_TO_END_VERIFICATION.md) | A real run of the full search chain — live YouTube API → Postgres → user-facing endpoint — and the four defects it exposed |
| [`backend/docs/index.md`](backend/docs/index.md) · [`frontend/docs/index.md`](frontend/docs/index.md) | The per-repo documentation indexes, which stay current with the code |

## 4. The agent system

Same shape on both sides: **architect plans → an implementer writes → a reviewer
checks**, with one specialist alongside. The read-only roles are denied
`Edit`/`Write`/`NotebookEdit` in frontmatter, so "does not write code" is enforced
rather than requested.

| Backend | Frontend | Role |
|---|---|---|
| [`architect`](backend/.claude/agents/architect.md) | [`architect`](frontend/.claude/agents/architect.md) | Plans, root-causes, evaluates dependencies. No code |
| [`backend`](backend/.claude/agents/backend.md) | [`frontend`](frontend/.claude/agents/frontend.md) | Implements |
| [`redis`](backend/.claude/agents/redis.md) | [`ui-tester`](frontend/.claude/agents/ui-tester.md) | The specialist: cache and queues / a real browser |
| [`reviewer`](backend/.claude/agents/reviewer.md) | [`reviewer`](frontend/.claude/agents/reviewer.md) | Pre-merge review. No code |

Skills — knowledge that loads on demand, scoped to the repo they live in:

| Backend (7) | Frontend (3) |
|---|---|
| [`gaddr-security-review`](backend/.claude/skills/gaddr-security-review/SKILL.md) · [`gaddr-encryption`](backend/.claude/skills/gaddr-encryption/SKILL.md) · [`gaddr-database`](backend/.claude/skills/gaddr-database/SKILL.md) · [`gaddr-platform-integration`](backend/.claude/skills/gaddr-platform-integration/SKILL.md) · [`gaddr-testing`](backend/.claude/skills/gaddr-testing/SKILL.md) · [`gaddr-payments`](backend/.claude/skills/gaddr-payments/SKILL.md) · [`gaddr-fraud-identity`](backend/.claude/skills/gaddr-fraud-identity/SKILL.md) | [`gaddr-frontend-ui`](frontend/.claude/skills/gaddr-frontend-ui/SKILL.md) · [`gaddr-i18n`](frontend/.claude/skills/gaddr-i18n/SKILL.md) · [`gaddr-frontend-testing`](frontend/.claude/skills/gaddr-frontend-testing/SKILL.md) |

Full detail, including which skills each agent preloads, in [`AGENTS.md`](AGENTS.md).

## 5. Architecture and migration corpus

These document the **Search + Me consolidation**. They use generic `ProjectA` /
`ProjectB` naming, and `_v2` supersedes the unsuffixed version where both exist. They
are point-in-time analyses: useful for understanding decisions, **not** a description of
current code. When they disagree with the source, the source is right.

| Document | Subject |
|---|---|
| [`01_ProjectA_Architecture_v2`](backend/docs/01_ProjectA_Architecture_v2.md) · [`02_ProjectB_Architecture_v2`](backend/docs/02_ProjectB_Architecture_v2.md) | Per-project architecture |
| [`03_Schema_Comparison_v2`](backend/docs/03_Schema_Comparison_v2.md) · [`09_Table_Comparison`](backend/docs/09_Table_Comparison.md) | Schema and table differences |
| [`04_Shared_Identity_Architecture_v2`](backend/docs/04_Shared_Identity_Architecture_v2.md) | Shared identity model — relevant to the two-auth-systems problem (H2) |
| [`05_Migration_Strategy_v2`](backend/docs/05_Migration_Strategy_v2.md) · [`11_Rollback_Strategy`](backend/docs/11_Rollback_Strategy.md) | Migration approach and rollback plan |
| [`06_ProjectA_Changes_v2`](backend/docs/06_ProjectA_Changes_v2.md) · [`07_ProjectB_Changes_v2`](backend/docs/07_ProjectB_Changes_v2.md) | Required changes per project |
| [`08_Master_Architecture_Review`](backend/docs/08_Master_Architecture_Review.md) | Consolidated review (with two earlier passes, `08_Final` and `08_Summary`) |
| [`09_Build_Compatibility_Report`](backend/docs/09_Build_Compatibility_Report.md) | Build compatibility |
| [`10_Risk_Register`](backend/docs/10_Risk_Register.md) · [`12_Critical_Blocker_Decisions`](backend/docs/12_Critical_Blocker_Decisions.md) | Risks and blocker decisions |
| [`10_Rename_Strategy_Investigation`](backend/docs/10_Rename_Strategy_Investigation.md) · [`11_Domain_Rename_Analysis`](backend/docs/11_Domain_Rename_Analysis.md) · [`12_UserRepository_Rename_Analysis_Project_B`](backend/docs/12_UserRepository_Rename_Analysis_Project_B.md) | Rename analyses |
| [`analysis-youtube-analytics-import`](backend/docs/analysis-youtube-analytics-import.md) | YouTube analytics import design |
| [`backend/audit/`](backend/audit/) | Superseded first-pass architecture docs (`01`, `06`) — history |

**API contracts:** [`asyncapi.yaml`](backend/docs/asyncapi.yaml) is the WebSocket/event
contract; [`AsyncAPI/index.html`](backend/docs/AsyncAPI/index.html) is the rendered
reference. Swagger/Scalar is served at runtime, non-production only.

## 6. Legacy

[`legacy-opencode/`](legacy-opencode/) holds the original OpenCode-format definitions
(`mode: subagent`, a `permission:` block) that the current agents were ported from. They
are kept for history and are **not** installable in Claude Code — the frontmatter
contract is different. They also describe an older reality: findings C4 and C5 as open,
no frontend test runner, search unrate-limited. Read them to understand where the system
came from, never to learn how it works now.

## 7. Conventions for maintaining this bundle

- **Change the repository, then `--pull`.** Never the other way round.
- **Run `./sync.sh --check` before shipping the bundle anywhere.** Read-only, exits
  non-zero on drift, safe in a hook or pipeline.
- **Add every new tracked path to `PATHS` in `sync.sh`.** A path absent from that list
  is a path the check cannot protect.
- **`--pull` normalises line endings** by copying from the repos, which are LF. An
  earlier copy of this bundle had CRLF throughout, which made every file look changed
  and hid the real differences.
- **Prefer correcting a document over adding a `_v3`.** The `_v2` proliferation in §5 is
  what to avoid; git history is the version record.
- **Add every new document to this index.** An unlisted document is one an agent will
  not find.
