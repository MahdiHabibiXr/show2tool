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
- Added named reviewed MCP workflow mode with actual input schemas and manifest-digest binding. Reconnect to discover new contracts; changed stale calls fail closed.
- Added runnable read-only synthetic sandbox and command-file walkthrough; agent-driven UI login/search smoke returned the seeded gamma record. A complete live-human authorization walkthrough is still pending.
- Added explicitly reviewed bounded cursor pagination (up to five pages); cursor scope, repeated-cursor detection and partial-result failure are tested.
- Added ID-safe reviewed whole-segment path parameters with labelled-demo checks and shared capture/transport scope matching.
- Removed the hard-coded Windows Chrome attachment path and configured a Windows/Linux CI matrix. Linux success is not claimed before an actual hosted run.
- Added bounded sequential composition of 1–5 digest-bound reviewed nonpaginated reads with backward-only projected-result dependencies. Automatic multi-step compilation remains open; saved chains and verification were added in subsequent increments below.
- Added shared read-chain deadlines spanning credentials/DNS/HTTP, active-request cancellation and no-late-dispatch checks.
- Added `verify_chain` reports bound to ordered step definitions and final manifest digests, with scalar independent expected-result assertions.
- Added reusable versioned chain definitions with typed inputs and explicit digest selection; saving grants no permissions and restart still requires fresh constituent-tool reviews.
- Added typed named MCP entrypoints for unambiguous saved chains with current constituent reviews; explicit digest calls remain available for multiple versions.
- Added definition-only read bundle export/import; transferred manifests remain inactive until recipient scope authorization and review. No credentials or grants are portable.
- Recorded a separate fresh-agent source-checkout exercise on the same Windows host; hosted CI and live-human authoring remain unproven.
- Added an internal, disconnected pending-mutation intent foundation: expiring memory-only payloads, exact terminal phrase, denial/expiry cleanup and synchronous one-use consumption. Public mutation execution is still disabled; see WRITE-RUNTIME.md for remaining gates.
- Added internal claim-owner journal foundation and real process-kill recovery test; interrupted/corrupt dispatch state stays unknown and cannot be reclaimed. POSIX directory sync is included; Windows power-loss durability remains unresolved and blocks nonfixture write enablement.
- Added strict internal mutation proposal contracts and a synthetic-only coordinator combining principal/version rechecks, one-use approval, dispatch journaling and read-back. Tests count exact fixture effects and block principal switches; this is not public write support.
- Added actual coordinator process-death coverage after an independently counted synthetic effect: recovery remains unknown, journal reclaim is denied, and the effect counter stays at one.
- Added `npm run probe:guarded` for a real-terminal human exercise of the new synthetic coordinator; unattended input is refused before fixture startup. A live-human completion is not yet recorded.
- Next: broker/human write integration and unresolved Windows power-loss/live-human/hosted compatibility gates. Public runtime writes remain disabled. General-purpose release acceptance is not yet complete.
