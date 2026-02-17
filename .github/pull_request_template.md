## Summary

- What changed:
- Why it changed:
- Scope:

## Architecture Checklist (Required)

- [ ] Business logic is not placed in `src/modules` or `src/infrastructure`
- [ ] Transport concerns (HTTP/websocket/request DTO handling) are not placed in `src/domain`
- [ ] New endpoint/use-case follows feature-slice structure in `src/features/<feature>/<use-case>/`
- [ ] New repositories/services are wired through approved provider tokens and module providers intentionally
- [ ] Module wiring only composes controllers/handlers/providers and does not implement use-case logic
- [ ] If architecture rules were intentionally broken, deviation is documented below with cleanup owner/date

## Temporary Deviations

- Deviation:
- Reason:
- Cleanup Owner:
- Target Cleanup Date:
- Tracking Link (issue/task):
