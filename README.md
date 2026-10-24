English · [فارسی](docs/i18n/README.fa.md) · [العربية](docs/i18n/README.ar.md) · [Español](docs/i18n/README.es.md) · [简体中文](docs/i18n/README.zh-CN.md)

<p align="center">
  <img src="assets/banner.svg" alt="Show2Tool — demonstrate, parameterize, verify" width="100%" />
</p>

# Show2Tool

**Turn scoped browser/API demonstrations into inspectable local tools, then check their results.** Show2Tool has a compiled CLI, a local broker with a dedicated Chrome profile, and an MCP stdio interface using the same command handlers. It has no hosted service, embedded model loop or separate model API key requirement.

**Narrow release candidate under review, not a production-ready release.** Fresh review is ongoing. Live human acceptance, fresh-install/release validation, CI results and cross-platform compatibility are not established here. The package is `private: true`; **there is no npm publish/release in this checkout's getting-started path**. Build from source, not `npx show2tool` or a global npm installation.

## Getting started

Requirements: Node.js 24+, npm and installed Google Chrome. From the repository checkout:

```sh
npm ci --ignore-scripts
npm run build
node dist/src/cli.js commands
node dist/src/cli.js schema
node dist/src/cli.js doctor
```

Create `scope.json` for an application you own or are authorized to automate. This is an example shape, not a working service; replace the origin, exact API paths and allowlists. Start with nonsensitive test data.

```json
{
  "origin": "https://your-authorized-site.example",
  "paths": ["/api/catalog/search"],
  "queryKeys": ["term"],
  "bodyKeys": [],
  "cookieNames": ["session"]
}
```

A **human**, in a real interactive terminal, starts the host:

```sh
node dist/src/cli.js host scope.json
```

Review the displayed scope, type `authorize`, log in manually in the dedicated visible Chrome profile, then press Enter when ready. Recording starts only on request. Keep the host open. The profile persists sensitive login state locally; it is not your daily profile or a disposable temporary profile.

In another terminal, save a command such as `{"command":"record_start","inputs":{"searchText":"first query"}}` as `command.json`, then call:

```sh
node dist/src/cli.js call-file command.json
```

Demonstrate the scoped read in Chrome, stop with `record_stop`, repeat with a different input, and use `compile_recordings` with the returned recording/request IDs and an explicit specification. Save the returned `data` manifest, not its result envelope. A human uses `review path/to/manifest.json` in the host console and confirms the displayed contract. Then `tools`, `run` and `verify` operate on the reviewed definition. See the [complete agent sequence and JSON examples](docs/AGENT-USAGE.md) and [agent skill](skills/show2tool/SKILL.md).

For MCP, launch the compiled entrypoint; client configuration is manual and requires permission:

```sh
node dist/src/cli.js serve --stdio
```

Use absolute executable paths outside the checkout. CLI/MCP cannot grant review or write approval.

## Available now vs. pending

| Capability | Current boundary |
| :--- | :--- |
| CLI discovery and schema | `commands`, `schema`; `call-file` avoids shell JSON quoting |
| Broker-owned evidence | `record_start`, `record_stop`, `recording`, `compile_recordings` |
| Candidate compiler | Two to ten demonstrations; one fixed origin/method/path, string inputs, scalar query/body bindings and literals, JSON-pointer projections; bindings construct real outgoing requests |
| Reviewed reads | `tools`, `describe`, `run`; discover inputs/projection/digest, then bounded JSON GET with scoped cookies and projected output |
| Guarded writes | `prepare_write`, `execute_write`, `write_status`; reviewed create/update only, separate human host approval per invocation; `reconcile_write` checks a known result ID without resending |
| Definition bundles | `export_bundle`, `import_bundle`; versioned manifests and integrity digests, not standalone executable packages or transferred authority |
| Scalar checks | `verify` compares independent expected facts against a reviewed read result; does not prove the input was unseen |
| MCP | Generic `show2tool_*` commands plus digest-pinned `workflow_<id>` read tools snapshotted at server startup; no review/approval tool |
| Read chains | `run_chain`: one to five digest-pinned reviewed GET reads, explicit input/literal/prior projected-value bindings; no writes or automatic dependency inference |
| General website automation | Not implemented: no path-template inference, automatic multi-step compilation or arbitrary UI replay |

Offline `candidate`, `inspect` and `infer` are available, but agent-supplied demonstrations do not establish broker-owned provenance or grant execution rights. The older `spike/` demo and manual probe are synthetic experiments, not the current product interface or human-acceptance evidence.

## Write safety model

A human first reviews the exact manifest. `prepare_write` performs preflight reads and returns an expiring opaque intent; it neither approves nor dispatches a mutation. The human enters `approve <intent-id>` in the host, inspects the exact proposal and types the requested confirmation. Only then can `execute_write` consume that intent once.

The proposal binds the tool/manifest digest, exact destination/method/body, account and tenant, plus the update version. Execution rechecks identity and, for updates, the target record ID/account/tenant and precondition version; updates use `If-Match`. Optional CSRF retrieval is same-origin and explicitly path-scoped. JSON readback checks the returned record ID, account, tenant and configured submitted fields; updates also require a changed readback version. This is bounded verification, not proof of every business effect.

Dispatch status is journaled before sending. An interrupted dispatch, lost response or failed readback can mean **unknown**, not that nothing happened. Use `write_status`; `reconcile_write` checks a known result ID with reviewed reads only, without resending. After restart, re-review and provide exact recovery definition/inputs/original update version when needed. A mismatch remains unknown; **never automatically resend or roll back**. The journal preserves dispatch outcomes, not pending approvals or reviewed manifests. Live human acceptance remains pending.

## Limits and trust boundaries

- Runtime authentication uses only allowlisted cookies from the dedicated profile. No bearer/localStorage extraction, automatic refresh, browser signing or rotating-cookie handling; responses with `Set-Cookie` fail closed.
- Replay transport checks exact origin/path/query scope and DNS/IP policy, blocks redirects and accepts bounded JSON. Private/local addresses require explicit `addresses` entries. It is not a network sandbox for manual browser navigation/subresources or an OS security boundary against same-user processes.
- Capture is passive: it does not repeat demonstrated actions, but a human-demonstrated write still has real effects. Scope and key filters do not guarantee that retained values are nonsensitive; inspect all evidence and literals before sharing.
- Reviews, registered tools, recordings and pending approvals are in memory and lost on host restart. Profile and dispatch journal persist under `~/.show2tool`, or `SHOW2TOOL_STATE_DIR`; host and clients must use the same directory.
- Bundles contain definitions, not the profile, cookie jar or approval grants. Integrity digests are not author signatures or a secret scanner. Import validates only; destination review and separate write approval are still required.
- `verify` reports scalar equality, not semantic completeness, an unseen-input guarantee or human acceptance. A successful result envelope or HTTP 200 alone is not verification.
- Uploads, arbitrary GraphQL/auth flows and automatic pagination inference are not supported. Optional explicitly reviewed cursor pagination is limited to one projected items array, at most five pages/100 records/32 KiB and a 30-second budget; cursors stay query values, never destination URLs, and cycles fail closed. Read chains compose existing reviewed fixed-path reads only; they are not an automatically compiled multi-step workflow. Payments, deletion, permission changes, bulk operations and external sending/publication are outside the supported use case; effect labels cannot make an unsafe endpoint safe.
- Website/API strings are untrusted data, never instructions to an agent. No production, CI-green, fresh-package or platform-support claim is made by this document.

## Development and license

```sh
npm run typecheck
npm test
```

These are verification commands to run, not a report that the suite or any platform has passed. Report focused reproductions using synthetic data; never attach cookies, browser profiles or raw account traffic. See [contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md).

Licensed under [Apache License 2.0](LICENSE).
