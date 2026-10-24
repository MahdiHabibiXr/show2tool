# Human acceptance gate for 0.1.0

Automated tests cannot attest that a human actually read and approved the console prompts. This gate must be exercised by a person before calling the release fully accepted. It uses a temporary synthetic application, not a real account or production service.

## 1. Start the local application

From the source checkout:

```sh
npm run build
npm run acceptance:app
```

The application prints its random loopback origin and complete scope JSON. Save that JSON to `scope.json`. Keep this process running; restarting changes the in-memory data, sessions and usually the port.

## 2. Start the human host

In a separate interactive terminal, with the same `SHOW2TOOL_STATE_DIR` as your agent/MCP process:

```sh
node dist/src/cli.js host scope.json
```

Read the scope before typing `authorize`. In the dedicated Chrome window, click the synthetic login button. Return to the terminal and press Enter to confirm readiness. Login occurs before recording. Your daily Chrome profile is not used.

## 3. Agent records two searches

Use command files through `node dist/src/cli.js call-file command.json`, or the matching MCP tools.

- `record_start` with `inputs: {"search":"alpha"}`.
- In Chrome, search `alpha`; then `record_stop` and retain its recording ID.
- Repeat with `beta`.
- Retrieve each recording, select the observed `/api/items` GET request, and call `compile_recordings` with both recording IDs/request IDs.

Specification: fixed printed origin, path `/api/items`, method `GET`, effect `read`, string input `search`, projection `['/items']`. The observed query field is `term`; it must bind to `search`. Do not guess missing evidence.

Save the returned manifest. In the human host console, enter `review path/to/read-manifest.json`, read it, then type the requested `review <tool-id>` phrase. The agent may now run the reviewed read without repeated prompts.

## 4. Verify a new input

Run the tool with `search: 'Synthetic'` and independently check that both seeded records are present. Use `verify` with scalar expectations addressing the projected result if desired. This proves only the exercised facts; the software does not know that an input was truly held out.

## 5. Exercise guarded writes

For create, demonstrate two distinct synthetic titles while recording `/api/items` POST with the explicitly approved `title` body field. Each manual demonstration itself creates one synthetic record; capture must not duplicate it.

A create manifest additionally needs this reviewed mutation recipe:

```json
{
  "identity": {"path":"/api/me","account":"/account","tenant":"/tenant"},
  "csrf": {"path":"/api/csrf","value":"/token","header":"x-csrf-token"},
  "readback": {
    "path":"/api/items","idQuery":"id","resultId":"/id","recordId":"/id",
    "account":"/account","tenant":"/tenant","fields":{"title":"/title"}
  }
}
```

After human workflow review:

1. Agent calls `prepare_write` with a fresh title. Check no record was created yet.
2. Agent's `execute_write` before approval must return `APPROVAL_REQUIRED` and create nothing.
3. Human enters `approve <intent-id>` in the existing host console, reviews the exact account/destination/body, and types the full requested phrase.
4. Agent calls `execute_write` once. Expect `confirmed`; inspect the app to confirm one matching record.
5. A repeated execute must not create a second record. A denied/expired proposal must not write.

For an update, the target ID must be an input bound to query `id`; include a version precondition at `/api/items?id=...` using `/version`, and `/version` in readback. The runtime requires the preflight record ID/account/tenant and conditional write version to match. Never use payment, deletion, permission or external-send endpoints for this test.

## 6. Stop and record the verdict

Enter `quit` in the host and stop the application. Preserve only a sanitized checklist: environment, prompts reviewed, denial result, approved effect count and any unexpected behavior. Do not include profile/cookie/token contents.

**Current release status:** automation and clean-install tests are evidence for their runs; this document is a procedure, not a claim that a live human has completed it. Hosted Windows/Linux CI is also a separate unverified gate until the workflow actually runs.
