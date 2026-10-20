# Show2Tool

Show a browser workflow. Build a reusable tool. Check it on unseen inputs.

**Status: early Phase 0 feasibility prototype, not a released MCP generator.**

The current runnable demonstration uses synthetic tasks and an isolated temporary Chrome profile. It records two searches through CDP, infers the query binding, freezes a small contract, and replays an unseen query using the scoped browser session cookie. Separate tests exercise create/update approval and uncertain write outcomes. No real accounts or production services are used.

## Run locally

Requirements: Node.js 24 and Google Chrome installed. Dependencies are pinned in `package-lock.json`. No Playwright browser download is required for these Windows probes.

```sh
npm ci --ignore-scripts
npm run demo
npm run demo -- --out my-new-evidence
npm run cli -- inspect my-new-evidence/recording.json
npm run cli -- infer my-new-evidence/demonstrations.json
npm test
npm run typecheck
```

The optional output directory must not exist; the demo refuses to overwrite prior evidence. Saved artifacts contain synthetic fields only; they are not portable executable tool exports.

The demo returns JSON including `status`, training/held-out inputs, result IDs, independent write count and serialized inspection size. Byte count is **not** a token-savings measurement.

## Human-confirmation probe

From an actual interactive terminal:

```sh
npm run probe:manual
```

This starts a temporary loopback fixture, shows the exact synthetic create action, asks for `approve <intent-id>`, sends it once, checks read-back and prints the independent effects count. Enter anything else to deny. It refuses piped/noninteractive input before starting a server. The fixture and temporary journal are removed afterward; no real data is modified.

This helper has not yet been exercised by a human in this session. Automated tests use an injected terminal adapter, which is not equivalent to a live approval run.

## What is implemented

- Selected-main-frame CDP capture; unrelated tabs/child frames excluded.
- Schema-only default evidence, explicit approved query-value capture for parameter inference.
- Bounded retention and explicit incomplete/body-budget records; bounded shutdown.
- Unseen-input and sequential search/detail replay against an independent fixture oracle.
- Separate cookie/bearer authentication tests; no automatic login or refresh.
- One-use expiring intents bound to destination and tenant, exact local preview, versioned update and read-back.
- Captured create-body mapping from two browser demonstrations followed by an unseen synthetic approved create.
- Compact recording inspection and annotated-input inference CLI.
- Capture auto-expiration, idempotent stop, compressed-body and JSON-depth limits.
- Journal-before-dispatch, real child-process death before/after server commit recovering to unknown, no mutation retry after lost acknowledgment.
- Regression coverage for the fresh review's seven findings.

## Not implemented / not proven

- General website manifest compiler, production CLI commands, MCP adapter or portable executable export.
- Hardened cross-process human-approval broker or OS-level agent isolation.
- General production network policy, automatic auth refresh, arbitrary CSRF or browser-signed requests.
- Hard network ingress/memory bounds: CDP buffering and body retrieval remain browser-controlled; current budgets bound retained evidence/replay data, not all browser allocations.
- Reliable real-world compatibility, competitive advantage, token savings or universal privacy filtering.
- Full competitor execution comparison, live human approval and exhaustive process-kill-at-every-boundary testing.
- Pinned competitor source inspection is recorded separately; no runtime superiority was established.

**Do not use spike modules against real accounts.** Replay is restricted to fixture origins registered within the same process. No npm release is available. The name is provisional.

## Current limitations

Phase 0 remains open pending live human-confirmation testing, competitor execution comparison and further hardening. An intermittent concurrency-test failure has been observed; its cause is not yet established. Passing tests are not a production-readiness claim.

Internal planning notes and local captures are intentionally excluded from this repository.

## License

No open-source license has been selected yet.
