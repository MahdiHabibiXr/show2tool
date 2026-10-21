# General-purpose authoring alpha

## Goal

Make Show2Tool a reproducibly installable local browser-to-tool authoring system for a documented range of authorized JSON API workflows. Ship tested increments to Git. General-purpose does not mean arbitrary websites, unrestricted requests, or bypassing authorization.

## Acceptance milestones

1. **Reproducible installation:** fresh checkout and packed production-dependency install run outside the original workspace; automated CI; useful prerequisite diagnostics.
2. **Complete authoring example:** one runnable synthetic sandbox demonstrates capture → compile → human review → verification → restart/reload, with clear instructions and no automatic human approval.
3. **Discoverable reusable tools:** reviewed workflows appear as named MCP tools with their actual input schemas; definitions remain separate from execution grants.
4. **Broader read contracts:** reviewed path inputs, bounded sequential dependencies and pagination, all with scope enforcement and independent verification tests. Unsupported auth fails explicitly.
5. **Bounded writes:** one terminal create/update with exact human approval, identity/precondition binding, no retries and unknown-outcome recovery. No deletion, payments, permission changes, bulk operations or external sending.
6. **Release evidence:** fresh agent setup exercise, compatibility matrix, package audit, accurate translated documentation, explicit remaining limitations. Public npm release and licensing decisions require separate approval.

## Working rules

- Existing TypeScript, Node.js 24+, Playwright, Zod and official MCP SDK remain the stack.
- Work milestone by milestone; tests and review precede pushes. Record actual evidence, not readiness inferred from test counts.
- Synthetic/local sandbox testing is authorized. External accounts and live mutations require target-specific human consent.
- No persisted approval grants, exported credentials, unattended human confirmations, force pushes or npm publication.
- Completed checks prove the cases run, not universal website compatibility.

## Starting checkpoint — October 21, 2026

Read authoring, saved definitions and scalar verification are implemented. The latest pre-milestone validation ran 140 tests in 37 files on Windows. Clean production-dependency installation and Windows CI were the first follow-up milestone. Full live human walkthrough and external compatibility evidence remain open.

## Progress

- Added isolated tarball production-dependency installation smoke, including consumer-local executable shim, CLI discovery, candidate compilation and MCP initialization/tools/call. No workspace dependency links.
- Added `doctor` prerequisite diagnostics without browser launch or local path output.
- Added Windows Node 24 CI configuration. Hosted run status is not yet established; do not infer it from local success.
- Next: runnable synthetic sandbox authoring walkthrough, then named reviewed MCP workflow tools.
