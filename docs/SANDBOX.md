# Complete read authoring walkthrough

This is a synthetic local application with three known records, not an external account. Setup is source-checkout only. Human authorization and review must be done by a person in a real terminal.

## 1. Start the sandbox

Build first, then choose a new workspace directory whose parent already exists:

```sh
npm run build
npm run sandbox -- my-sandbox
```

Keep this terminal open. It prints its loopback origin and creates scope/command files in `my-sandbox`. The server supports synthetic login and GET search only; task mutations are refused. Existing directories are never overwritten. A new sandbox run uses a new origin/port; saved contracts for an earlier origin do not automatically apply.

## 2. Authorize the human host

In another real terminal:

```sh
node dist/src/cli.js host my-sandbox/scope.json
```

Read the scope and type `authorize` yourself. Chrome opens in a dedicated profile. Click **Log in to synthetic tenant A** before capture. Press Enter in the host terminal when ready. Keep both terminals open.

## 3. Record alpha, then beta

In an agent/third terminal:

```sh
node dist/src/cli.js call-file my-sandbox/start-alpha.json
```

In Chrome, search for `alpha` once. Wait for its result, then:

```sh
node dist/src/cli.js call-file my-sandbox/stop.json
```

Keep `data.recordingId`; require `data.complete: true`. Repeat with `start-beta.json`, search `beta`, then `stop.json`. If capture is incomplete, narrow/repeat it rather than pretending it is complete.

## 4. Compile and review

Replace the two placeholders in `my-sandbox/compile.json` with the alpha/beta recording UUIDs. The request IDs default to `request:0`; inspect each recording using the `recording` command if other requests were captured.

```sh
node dist/src/cli.js call-file my-sandbox/compile.json > my-sandbox/candidate.json
```

On Windows PowerShell 5.1 use `| Out-File -Encoding utf8 my-sandbox/candidate.json` instead of `>` to avoid UTF-16 output. Require `ok: true` and `meta.complete: true`.

In the human host console:

```text
review my-sandbox/candidate.json
```

Inspect the contract and type `review find_tasks` yourself. No agent should do this for you.

## 5. Verify known independent truth

The sandbox seed has gamma record `a3`, tenant `A`, exactly one result. Its provided verification case was written from that seed, not copied from a replay response:

```sh
node dist/src/cli.js call-file my-sandbox/verify.json
```

Require `ok: true`, `data.status: passed` and all assertion booleans true. Evidence is saved by the host with a manifest digest. This checks one named case, not arbitrary workflows.

## 6. Named MCP and restart

With the tool reviewed, connect `node /absolute/path/dist/src/cli.js serve --stdio --reviewed` from an MCP client. It lists `workflow_find_tasks` with required `search` input.

To test host restart, keep the sandbox server running, quit the host, start the host again with the same scope, and manually finish readiness. In its console use `saved` then `load find_tasks` (or select a digest if multiple versions exist). Review again, then rerun verification. Restarting loses permission and recordings, not the saved definition.

## Evidence boundary

Automated browser/broker tests and workspace generation tests are not evidence a human completed this walkthrough. Record environment and actual outcomes when exercising it. No live-human run is claimed by these instructions.
