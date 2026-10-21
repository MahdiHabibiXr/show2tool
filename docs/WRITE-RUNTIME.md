# Guarded mutation runtime acceptance contract

The general-purpose alpha goal includes bounded create/update support. This document describes the remaining gate; it does not enable writes.

## Required before enabling mutation execution

- Human scope explicitly lists mutation capabilities; GET/read review cannot authorize a mutation.
- A reviewed contract has one terminal create/update, stable principal evidence from a scoped read, required CSRF/auth behavior and an independently specified read-back.
- Update contracts require a server-enforced precondition (ETag/version), not just a racy read before write.
- Preparation resolves the exact method, destination, body, principal, preconditions and contract digest without issuing a mutation.
- Sensitive payload exists only in host memory, expires promptly and cannot survive a restart as a dispatchable approval.
- Human terminal presents exact material effects and consumes a per-intent confirmation phrase. No approval command, interactive flag or unattended token exists over CLI JSON/MCP.
- One-use claim is synchronous before asynchronous journal/network work; concurrent dispatch cannot reuse an intent.
- Durable dispatch marker is synced before sending; interrupted dispatch is unknown, never retried automatically.
- Lost acknowledgment, post-dispatch timeout, mismatch or failed read-back is unknown, not success or assumed rollback.
- Denial, expiry, principal changes, stale preconditions and changed input produce zero mutation requests.
- Tests use a synthetic application with an independent effects counter, actual process death around dispatch, and real broker CLI/MCP parity.

## Deliberately not authorized

Deletion, payments, permission changes, bulk mutations, external sending/publication, production target use, copied browser credentials and automatic compensation. Real-account writes require separate target-specific authorization.

## Delivery sequence

1. Strict in-memory pending-intent lifecycle and terminal-only approval adapter; no mutation transport exposure.
2. Reviewed principal/precondition/read-back schemas with source-bound validation.
3. Durable dispatch journal and bounded fixed-destination mutation transport.
4. Synthetic broker integration, concurrent calls, denial/expiry and crash probes.
5. Live human synthetic confirmation exercise before enabling any nonfixture target.

## Current foundation limits

The internal journal has exclusive file claims, synced file contents, claim-owner-only one-use completion, and interrupted/corrupt state classified unknown. POSIX paths additionally sync directory entries. Windows does not expose the same directory-sync guarantee through this implementation; tests establish process-termination recovery, not power-loss durability. This gap must be resolved or explicitly constrained before enabling a nonfixture mutation transport. The journal is not a tamper-proof audit log against same-user filesystem access.

The public authoring runtime remains read-only until all relevant gates are met. Existing spike write tests are useful references, not an authorization shortcut.
