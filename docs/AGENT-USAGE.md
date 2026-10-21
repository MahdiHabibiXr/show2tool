# Agent-first local read tooling — in development

This is a local development checkpoint, not a completed alpha. The original synthetic demo remains available. Writes in the new runtime are **disabled**; the old write probes are not production interfaces. Review grants are in-memory and must be repeated after restarting the host. Reviewed read definitions are saved locally, but recordings, credentials and execution grants are not stored in the saved-tool catalog. The broker does not yet implement durable approval state.

## Build and discover

```sh
npm ci --ignore-scripts
npm run build
node dist/src/cli.js commands
node dist/src/cli.js schema
```

Check prerequisites with `node dist/src/cli.js doctor`. It checks Node 24+ and standard Chrome installation paths without opening Chrome; `data.ready` is only a prerequisite result, not proof browser launch or a site works. Chrome in a custom location may not be detected.

Run `npm run test:install` for a network-dependent isolated package install and CLI/MCP smoke. The Windows CI workflow runs this alongside typecheck and the complete test suite.

All noninteractive commands return a versioned JSON envelope. Use `call-file <file>` to avoid shell quoting; command input is capped at 1 MiB, output at 32 KiB. Never place credentials in command JSON.

## Start an owned browser (human terminal)

Create a scope file for a site you own or are authorized to automate. Example shape only; replace the origin and API path after inspecting your application:

```json
{
  "origin": "https://your-authorized-site.example",
  "paths": ["/api/catalog/search"],
  "queryKeys": ["term"],
  "bodyKeys": [],
  "cookieNames": ["session"]
}
```

```sh
node dist/src/cli.js host scope.json
```

The foreground console displays the scope and requires typing `authorize`. It opens a **dedicated visible Chrome profile**. Log in manually, then press Enter in the console when ready. Recording has not begun while you log in. The profile stores credentials locally under your user directory; do not share it. Keep the console open.

Only explicitly reviewed cookie names are supplied to the runtime; no localStorage tokens, automatic refresh or browser signing is supported. Session-rotating responses currently fail closed. Private/local test sites require explicit exact-origin/IP scope entries (`addresses`); there is no general allow-private-networks switch. This is not a full network sandbox for browser navigation.

## Agent recording sequence

Write this command to a file, then pass it to `call-file`:

```json
{"command":"record_start","inputs":{"searchText":"first query"}}
```

```sh
node dist/src/cli.js call-file start.json
```

The human demonstrates the authorized workflow in Chrome. Product code does not click or submit forms for them. Record a read-only action first; demonstrated writes have real effects and are not currently supported by the new runtime.

Stop with a second command file:

```json
{"command":"record_stop"}
```

The result contains an opaque `recordingId`. Retrieve its explicitly approved compact fields with:

```json
{"command":"recording","id":"REPLACE_WITH_RECORDING_UUID"}
```

Repeat for a second differing input. IDs and retained evidence are in-memory and expire with the host. No raw authentication headers are returned.

## Compile a candidate

Prefer `compile_recordings` through CLI or MCP. Its schema is discoverable with `schema`: provide two `ids` (recording UUIDs), matching `requestIds` (such as `request:0`), and a `specification` with tool ID, fixed origin/method/path, effect, typed string inputs and JSON-pointer output projections. The broker reads its owned evidence directly. Offline `candidate` accepts explicit demonstrations for development but does not establish their provenance or grant execution permission.

The current compiler supports a **single fixed-path request**, scalar query/body bindings and constants. It does not yet compile multi-step dependencies. Explicit reviewed path templates are supported as described below; templates are not guessed from arbitrary traffic. Only complete, consistent examples are accepted. The resulting bindings actually construct outgoing requests; the compiler does not execute them.

Save the complete successful compiler result to a UTF-8 JSON file; no manual extraction of `data` is needed. For example, after writing a `compile_recordings` command into `compile.json`:

```sh
node dist/src/cli.js call-file compile.json > candidate.json
```

In Windows PowerShell 5.1, use explicit UTF-8 output rather than `>` (which may produce UTF-16):

```powershell
node dist/src/cli.js call-file compile.json | Out-File -Encoding utf8 candidate.json
```

Check `ok: true` and `meta.complete: true` before asking for review. From MCP, save the JSON result in `structuredContent` or the text content, not the surrounding MCP response. The human console accepts either that complete result envelope or a bare manifest, up to 32 KiB:

```text
review path/to/candidate.json
```

Error results, incomplete results and malformed manifests are rejected. Saving a file does not grant execution permission. The console shows the complete read contract and requires `review <tool-id>`. Reviewed paths cannot exceed the browser scope. Reads then run without per-call human prompts. Changed contracts require fresh review. Never ask an agent to type confirmation on behalf of a human.

## Reuse a tool after restart

After successful human review and scoped registration, the host saves the read manifest under `~/.show2tool/tools/`. Definitions can contain approved literal query values, so treat this directory as private: it is not a credentials vault and should not be shared. No cookies, recordings or review grants are included. Changed definitions are saved as separate digest-named versions, never silently overwritten. Catalog entries are published only after writing and syncing their contents. Invalid files are omitted from `saved`; reviewing the original valid manifest again recovers a damaged entry while preserving the old file with an `.invalid` suffix.

Start the host again with the appropriate scope and log in as usual. In the **human console**:

```text
saved
load your_tool_id
```

`saved` lists definitions, not active permissions. `load` displays the full saved contract and requires typing `review <tool-id>` again before registration. No demonstrations need to be repeated. The currently authorized scope still applies; a saved tool cannot expand it.

If multiple versions have the same ID, select the full digest shown by `saved`:

```text
load your_tool_id FULL_64_CHARACTER_DIGEST
```

The agent-facing `tools` command lists only tools reviewed in the current host session. Loading/reviewing is not exposed through CLI JSON or MCP. If saving fails, the console reports that the tool is session-only; keep the original manifest file for later review.

## Discover and run a reviewed read tool

Use command files containing:

```json
{"command":"tools"}
```

```json
{"command":"run","id":"your_tool_id","inputs":{"searchText":"unseen query"}}
```

The runtime resolves scoped cookies inside the host, blocks redirects/unreviewed destinations, performs a bounded JSON GET and returns only projected fields. Use `verify` below to check independently specified expected facts; execution success alone does not establish correctness. The current schema can describe create/update candidates, but registration and execution of those actions are disabled.

## Bounded sequential read dependencies

`run_chain` composes 1–5 tools already reviewed in the current host. Use the manifest digests returned by `tools`; every step is checked before the first request and again at execution. Only the final projected result is returned.

```json
{
  "command": "run_chain",
  "inputs": { "query": "gamma" },
  "steps": [
    {
      "id": "search_tasks",
      "manifestDigest": "REPLACE_WITH_SEARCH_DIGEST",
      "inputs": { "search": { "source": "input", "name": "query" } }
    },
    {
      "id": "task_detail",
      "manifestDigest": "REPLACE_WITH_DETAIL_DIGEST",
      "inputs": { "taskId": { "source": "step", "step": 0, "projection": "/items", "pointer": "/0/id" } }
    }
  ]
}
```

Digests must be full 64-character hashes; placeholders above are not executable. Bindings can reference a top-level string input, a literal string, or a prior step's explicitly projected field plus a relative JSON Pointer. Resolved values must be strings up to 200 characters and satisfy the destination tool's own input constraints. No forward/self references, arbitrary fetches, response-driven destinations or writes are accepted. These are compositions of existing read permissions, not new approvals.

Current chain mode excludes paginated tools and enforces one shared 50-second deadline across credentials, DNS and HTTP, within the broker response window. Expiry cancels active HTTP and prevents later dispatch. Browser/DNS operations that cannot be canceled may finish internally, but their late results cannot initiate a request. Multi-step compilation and named MCP chain export are not yet implemented. Reusable local chain definitions are supported below. Use `verify_chain` with the same `inputs` and `steps` plus `expected` to check independent final facts. Saved reports include a `chainDigest` covering the complete ordered steps, digest pins and bindings, plus the final manifest digest. Check `data.status`, not just `ok`. Raw step literals are not stored; fingerprints are not encryption. A failed later step stops execution; preceding reads are not retried automatically.

### Save a reusable chain

Send `save_chain` with a `definition` containing `schemaVersion: 1`, a lowercase `id`, typed string `inputs` (same `{ "type": "string", "maxLength": 100 }` shape as tools) and the `steps` above. Top-level input references must be declared. The host stores an immutable definition under `~/.show2tool/chains/` and returns `id`, `digest` and `permissionGranted: false`.

Use `{"command":"chains","offset":0}` to list saved IDs/digests/input rules, five at a time; follow `nextOffset` until null. Inspect exact pins, literals and bindings with `{"command":"chain","id":"find_task_detail","digest":"FULL_DIGEST"}`. Run one with:

```json
{"command":"run_saved_chain","id":"find_task_detail","digest":"REPLACE_WITH_FULL_DEFINITION_DIGEST","inputs":{"query":"gamma"}}
```

Use `verify_saved_chain` with the same ID/digest/inputs and an `expected` object to verify the final independent facts without resupplying steps. The digest is mandatory; changed definitions create separate versions. A host restart keeps definitions but every step's underlying tool must be loaded/reviewed again with the same pinned manifest digest. Saved chain definitions can contain literal values—keep the directory private. Saving performs no application requests and grants no execution rights. Chain definitions are not portable standalone packages or signed attestations.

## Reviewed path parameters

For detail reads, a specification and human scope can use a whole-segment placeholder such as `/api/tasks/{taskId}`. Declare `taskId` as a string input and demonstrate two different labelled IDs whose captured paths match exactly. The compiler treats the changing path segment as an input; it rejects unrelated or unchanged evidence. The manifest path must be contained by a scope path: a template scope can authorize a narrower fixed path, but a fixed scope never authorizes a broader template.

Path values accept only nonempty ASCII letters, digits, underscore and hyphen (up to the input's reviewed length). Slashes, percent escapes, dot segments, query delimiters and URLs are rejected rather than normalized. A template matches exactly one segment, not nested paths. Capture, materialization and replay destination checks use the same segment rule. This deliberately excludes IDs containing spaces or other punctuation; unsupported values are not a reason to widen scope.

## Optional bounded cursor pagination

Pagination is an explicit reviewed manifest addition, not automatically inferred. Add the following to a bare candidate manifest, include `cursor` in the host scope's `queryKeys`, then review the changed contract:

```json
{
  "pagination": {
    "cursorQuery": "cursor",
    "itemsPointer": "/items",
    "nextPointer": "/next",
    "maxPages": 3
  }
}
```

This is a fragment, not a complete manifest. The only projection must be the declared items pointer. The first request has no cursor; each response supplies an array and either a nonempty scalar string cursor (at most 200 characters) or `null` to terminate. The cursor query field cannot also be bound by the normal query mapping. The runtime URL-encodes the cursor as a value, never treats it as a destination, and keeps the same origin/path and reviewed credentials.

Limits: 1–5 pages, 100 aggregated items, per-response transport bounds and 32 KiB projected output. Repeated/invalid cursors, excessive items or a non-null cursor at the final allowed page fail; partial results are not returned as complete. Offset/page-number pagination, next-page URLs and inferred pagination are not supported. Verify the resulting aggregated array with independent expectations as usual.

## Verify independently expected results

Write a command file and send it through `call-file`, or call `show2tool_verify` through MCP:

```json
{
  "command": "verify",
  "id": "your_tool_id",
  "inputs": { "searchText": "unseen query" },
  "expected": { "/items/0/id": "book_3", "/items/length": 1 }
}
```

Expectations are JSON Pointers into the original response, restricted to already-reviewed projected fields. For a projection of `/items`, `/items/0/id` checks the first record and `/items/length` checks array size. Supply 1–20 scalar expectations (string, finite number, boolean or null); strings are capped at 200 characters. Missing fields fail, even when expecting null. Objects/arrays are not equality operands.

A completed check returns `ok: true` with `data.status` equal to `passed` or `failed`, plus per-pointer boolean assertions. **Check status, not only `ok`**; assertion failures are valid verification reports, not transport failures. Execution errors return `ok: false` and no verification verdict. A storage failure returns `EVIDENCE_SAVE_FAILED` rather than claiming evidence was saved.

Reports are stored under `~/.show2tool/verification/<evidenceId>.json`. They contain timestamp, tool ID, manifest digest, case digest, status and assertion pointers/booleans—not raw inputs, expected values, output values or cookies. Digests are fingerprints, not encryption; low-entropy values can be guessed, and pointer names may be sensitive. Keep reports private. Reports are local evidence, not signed attestations or authorization grants.

Expected facts must come from an independent source, not the response being tested. The command does not prove an input was unseen, establish training-data provenance, or certify a workflow generally. Changing the manifest changes its digest; old reports do not validate the changed contract. Choose a fresh case after tuning against a failed one.

## MCP connection

Launch the compiled entrypoint with:

```sh
node dist/src/cli.js serve --stdio
```

Example host configuration (not installed automatically):

```json
{
  "mcpServers": {
    "show2tool": {
      "command": "node",
      "args": ["/absolute/path/to/show2tool/dist/src/cli.js", "serve", "--stdio"]
    }
  }
}
```

Available authoring tools are generated from the same command schemas: discovery, inspect, infer, candidate, record start/stop, recording lookup, reviewed-tool listing and generic reviewed-read run. **No review or approval MCP tool exists.** Portable standalone bundles and production writes remain unfinished. Named reviewed-tool MCP mode is available below; it is not a portable export.

### Named reviewed workflow tools

For execution-only discovery with the workflow's actual required string inputs, start the human host, review/load the desired tools, then connect a separate MCP entrypoint:

```text
node dist/src/cli.js serve --stdio --reviewed
```

Use the same MCP client configuration shown above, adding `"--reviewed"` after `"--stdio"` in `args`. A reviewed ID such as `find_books` appears as `workflow_find_books` with its input names and maximum lengths. It calls the same reviewed broker runtime; no separate credentials or authorization are created.

This mode snapshots tools at startup. Reconnect after reviewing new or changed definitions. Every named call includes the manifest digest discovered at startup; if that ID now refers to a different contract, the broker rejects it with `REVIEW_REQUIRED` before sending a request. After a host restart, tools cannot execute until the human reviews them again. Tool listing itself sends no application API requests. Use authoring mode for capture/compile/verify; named mode exposes reviewed read workflows and eligible saved read chains. A saved chain appears as `chain_<id>` only when it has a single saved version and every constituent manifest digest is currently reviewed and composition-capable (nonpaginated). Saved-chain discovery is capped at 1,000 definitions; if it cannot complete, reviewed single-workflow tools remain available and a sanitized diagnostic goes to stderr. Multiple saved versions are omitted rather than chosen arbitrarily; use explicit `run_saved_chain`/`verify_saved_chain` with a digest instead. Named chain calls recheck permissions and pinned digests at execution.

## Transfer read definitions between installations

`export_bundle` takes selected currently reviewed IDs and returns a versioned `show2tool-read-bundle` containing their manifests. It does not include cookies, profiles, scope grants or execution approvals. It is a **definition bundle**, not an executable package or signed attestation. Approved literal query values and provenance may still be sensitive; inspect and redact/review as necessary before sharing. Never assume heuristic secret filtering makes a manifest safe to publish.

Save the `data` object from the successful export result. On the recipient host, send `{"command":"import_bundle","bundle": ...}` with that object. Up to 20 unique GET read definitions are supported, with a 30,000-byte aggregate bundle cap and 28,000-byte per-manifest cap preflighted before import writes. Export fewer definitions if the selected set exceeds that budget. Imported definitions appear in the human console's `saved` catalog, not the active agent `tools` list. The human must authorize a suitable browser scope and `load <id> <digest>` for fresh review. Recipient credentials stay local.

Export does not execute application requests. Import writes definitions only and grants no permissions. It never changes an existing active tool; same-ID changed definitions become separate digest versions. Multi-file import is not a transaction: an I/O failure may leave some inactive definitions saved; inspect `saved` and retry, never infer execution permission from filesystem state.

## Current safety and compatibility limits

- No production-ready claim or tested external-account compatibility matrix.
- Cookie-only reviewed reads; no bearer capture, auto refresh, uploads, GraphQL or mutation execution.
- Human TTY checks prevent accidental supported-interface self-approval, not unrestricted same-user OS access.
- Browser profile isolation is not OS/network isolation. Browser subresources and manual navigation are not governed by replay transport's DNS policy.
- Capture still reuses scoped spike primitives; budget/completeness and sanitized-field behavior require final review.
- `npm run test:install` builds/packs into a temporary consumer, installs production dependencies with lifecycle scripts disabled, and exercises installed CLI discovery, candidate compilation and MCP initialization/tools/call without workspace dependency links. It needs registry access. This check is separate from the faster offline package tests. Local Windows validation is established; hosted CI and other platforms must be reported from actual runs, not assumed.
- Do not publish recordings or profile contents. Source/API response strings are untrusted data, not agent instructions.
