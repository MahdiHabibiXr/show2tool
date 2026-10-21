# Compatibility and evidence

## Established locally

Environment: Windows 11, Node.js 24.13.1, npm 11.16.0, standard Google Chrome installation. Evidence from October 21, 2026.

- Synthetic dedicated-browser capture and query/path parameter compilation.
- Human review interface behavior tested with controlled adapters; noninteractive host self-approval refused.
- Reviewed GET replay, scoped cookies, bounded cursor pagination and ID-safe path segments.
- Projected read chains, shared deadline cancellation and independent verification reports.
- Saved definitions, restart permission denial, digest-pinned calls and tamper checks.
- Actual MCP initialization/list/call for authoring, named workflows and saved chains.
- Isolated production tarball installation in a temporary consumer, executable shim through offline npm exec, CLI and MCP calls without workspace dependency links.
- Agent-driven sandbox UI smoke: synthetic tenant login and gamma query returned record a3 in tenant A.

## Configured but not established

- Hosted CI: Windows and Ubuntu matrix configured. A green hosted run has not been observed in this development session; GitHub CLI authentication is unavailable.
- Linux/macOS compatibility: platform lookup rules tested; no local OS execution evidence on these platforms. macOS CI is not configured.
- Fresh source setup was exercised by a separate agent in a new temporary clone of remote main at `fe32d61a5e93637aa686f34de7158ed61e91e39b` on this same Windows machine: `npm ci --ignore-scripts`, typecheck, 160 tests, synthetic demo (gamma → a3, zero writes), doctor, commands and schema all passed. This is not independent OS evidence or a complete human authoring run.
- The updated bundled guide was behavior-tested with a restart/saved-chain/named-MCP/verification scenario; the agent correctly retained the human-review boundary and distinguished assertion status from transport success.
- Complete live-human walkthrough: instructions in SANDBOX.md; no completed human run is claimed.

## Unsupported or unfinished

- New runtime mutation execution; existing spike mutation probes are not a production write interface.
- Automatic multi-step workflow inference from browser traffic.
- Paginated tools inside chains; offset and response-URL pagination.
- Auth other than explicitly scoped browser cookies, session rotation, browser signing or automatic refresh.
- Portable standalone workflow bundles, public npm release, license selection.
- GraphQL, uploads, WebSockets, arbitrary browser automation and permission/payment/deletion/external sending actions.

Test counts are not compatibility claims. Report actual command, environment, expected outcome and observed outcome; use synthetic data and never attach profile/cookie contents. Refer to ROADMAP.md for remaining acceptance milestones.
