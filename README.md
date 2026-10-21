English · [فارسی](docs/i18n/README.fa.md) · [العربية](docs/i18n/README.ar.md) · [Español](docs/i18n/README.es.md) · [简体中文](docs/i18n/README.zh-CN.md)

<p align="center">
  <img src="assets/banner.svg" alt="Show2Tool — demonstrate, parameterize, verify" width="100%" />
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#built-vs-planned">Built vs. planned</a> ·
  <a href="#safety-model">Safety model</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <img alt="Stage: feasibility prototype" src="https://img.shields.io/badge/stage-feasibility_prototype-277a99?style=flat-square" />
  <img alt="Node.js 24+" src="https://img.shields.io/badge/Node.js-24%2B-426c51?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square" />
  <img alt="Local-first" src="https://img.shields.io/badge/local--first-no_hosted_service-526576?style=flat-square" />
</p>

## Turn a demonstration into something you can check

**Show2Tool explores a simple idea: demonstrate a browser workflow, identify its inputs, and prove the result on an example it has not seen.**

The current prototype captures API traffic from an isolated Chrome session, infers simple input bindings, and replays them against a synthetic application. It also tests one-use approvals and read-back verification for bounded create/update actions.

The longer-term goal is a local skill and CLI that export reusable CLI/MCP tools. **That export pipeline is not built yet.**

> [!IMPORTANT]
> **Research prototype, not production automation.** Only synthetic local fixtures are supported. Do not use the spike against real accounts. No npm release or installable MCP server is available.

## Quick start

**Requirements:** Node.js 24+, npm, and Google Chrome. Windows is the currently exercised platform; one CDP integration test uses Chrome's standard Windows installation path.

```sh
git clone https://github.com/MahdiHabibiXr/show2tool.git
cd show2tool
npm ci --ignore-scripts
npm run demo
```

The demo opens an isolated temporary **headless** Chrome profile, demonstrates two searches, and checks a third. It does not access your normal Chrome profile or require a model API key.

### What a successful run shows

```json
{
  "status": "passed",
  "scope": "synthetic fixture only",
  "trainingInputs": ["alpha", "beta"],
  "heldOutInput": "gamma",
  "resultIds": ["a3"],
  "writes": 0,
  "captureRows": 2
}
```

*Selected fields from the demo output. Timing, byte counts and contract hashes are run-specific. This is not a performance benchmark.*

### Keep and inspect the evidence

```sh
# Choose a directory that does not exist yet.
npm run demo -- --out my-new-evidence

# Group captured endpoints without returning approved scalar values.
npm run cli -- inspect my-new-evidence/recording.json

# Inspect the parameter mapping learned from annotated demonstrations.
npm run cli -- infer my-new-evidence/demonstrations.json
```

Saved artifacts contain synthetic recordings, annotated demonstrations and a result report—not an executable tool export. Existing evidence is never overwritten.

## How it works

```text
  Two demonstrations           Local processing              Held-out check
 ┌───────────────────┐       ┌────────────────────┐       ┌──────────────────┐
 │ Search for alpha  │       │ Scope API traffic  │       │ Search for gamma │
 │ Search for beta   │ ────▶ │ Infer q → query    │ ────▶ │ Expect record a3 │
 └───────────────────┘       │ Freeze contract    │       │ Check effects    │
                             └────────────────────┘       └──────────────────┘
```

1. **Observe, don't replay.** Selected-main-frame CDP capture records the demonstrated requests without issuing extra writes.
2. **Keep evidence small.** Schema-first summaries are the default. Scalar query/body values require an explicit allowlist.
3. **Reject ambiguity.** Multiple matching inputs or unchanged examples do not count as a generalized binding.
4. **Test a new input.** The fixture's independently seeded data supplies the expected result.
5. **Treat writes separately.** A write needs an expiring one-use intent bound to the destination, tenant and exact proposed change.

HTTP 200 and a valid JSON shape are not enough: the tests also check the selected records, tenant, update version and actual effects.

## Built vs. planned

| Capability | Current status |
| :--- | :--- |
| Isolated Chrome + CDP capture | **Implemented and exercised locally** |
| Main-frame scope, duration and retention limits | **Implemented**, with explicit incomplete markers |
| Two-demo query and scalar create-field inference | **Implemented for synthetic fixtures** |
| Unseen-input replay and search → detail dependency | **Implemented for synthetic fixtures** |
| Destination-bound create/update intents and read-back | **Implemented and tested**, injected approval adapter |
| Post-commit process death → unknown outcome, no resend | **Tested with an independent effects counter** |
| Compact `inspect` and annotated-demo `infer` commands | **Implemented** |
| Human terminal confirmation | Helper available; **live human exercise pending** |
| General website workflow compiler | **Planned** |
| Portable executable CLI/MCP export | **Planned** |
| Cross-process confirmation broker and public skill | **Planned** |

## Safety model

### Local by default

- No hosted service, embedded model loop or separate AI API key.
- Temporary profiles; no copying browser cookie databases or your daily Chrome profile.
- Replay is restricted to synthetic origins registered in the same process.
- Credential canaries are fixture data—not credentials for a real service.

### Explicit effects

- Recording does not replay demonstrated writes.
- A write intent expires and is consumed once; destination and tenant must match.
- Versioned updates and read-back check what actually happened.
- A lost acknowledgment or interrupted dispatch becomes **unknown**, never an automatic retry.
- No automatic rollback: a compensating action would be a separate write.

### Honest boundaries

These are accident-prevention checks, **not OS isolation against an unrestricted same-user process**. CDP may buffer data before application checks; retention limits are not a hard cap on all Chrome memory or network ingestion. Key filtering cannot identify every secret or personal field.

Payments, deletion, permission changes, bulk operations, real-account automation and external sending/publication are outside the current prototype.

## Try the human-confirmation probe

Run in an actual interactive terminal:

```sh
npm run probe:manual
```

It shows the destination, tenant and exact synthetic create action. Type the requested `approve <intent-id>` phrase to create **one temporary test task**, or anything else to deny. Noninteractive input is refused before the fixture starts.

Automated approval-adapter tests do not substitute for a live human run. That feasibility check remains open.

## Development

```sh
npm run typecheck
npm test
```

Tests cover browser scope, ambiguous mappings, tenant/auth failures, semantic mismatches, bounded pagination, approval reuse, gzip expansion, JSON depth, stalled responses, and actual child-process termination around dispatch.

> [!NOTE]
> An intermittent concurrent-dispatch test failure has been observed and is not yet root-caused. Passing runs are evidence for those runs, not a production-readiness guarantee.

<details>
<summary><strong>Repository map</strong></summary>

```text
spike/
  capture.ts         Scoped CDP observations and retention limits
  infer.ts           Candidate bindings and ambiguity detection
  replay.ts          Fixture-only transport and read workflows
  intents.ts         Destination-bound mutation intents
  journal.ts         Durable dispatch state and recovery
  approve.ts         Local confirmation adapter
  inspect.ts         Compact recording summaries
  cli.ts             Inspect / infer command entry point
  demo.ts            Runnable synthetic read pipeline
  manual.ts          Interactive synthetic write probe
  fixture/           Local application and independent effects state
test/
  spike/             Unit, integration and browser probes
  helpers/           Real-process crash workers
assets/
  banner.svg         Repository banner
```

</details>

## How this differs from CLI-Anything

[CLI-Anything](https://github.com/HKUDS/CLI-Anything) builds agent-friendly command-line interfaces from software codebases or existing APIs. Show2Tool starts from **demonstrated browser/API traffic** and investigates parameter generalization, explicit write confirmation and independent result checks.

The projects overlap in making software usable by agents. They are not the same implementation, and Show2Tool does not bundle CLI-Anything. This distinction is a product hypothesis, not a claim that other projects lack verification.

## Roadmap

- [x] Synthetic browser capture → inference → unseen-input replay
- [x] Captured create demonstrations → approved synthetic write → read-back
- [x] Compact evidence inspection and crash-outcome probes
- [ ] Finish feasibility gates: live human confirmation and competitor execution
- [ ] Generalize the reviewed workflow contract and runtime
- [ ] Add the cross-process human approval broker
- [ ] Export inspectable CLI and MCP packages from the same runtime
- [ ] Package the authoring skill and test it in a fresh agent session
- [ ] Publish compatibility results and reproducible benchmarks

## Contributing

Focused reproductions are useful: an ambiguous input mapping, a missing omission marker, an incorrect outcome, or a privacy regression. Use synthetic data and report the command, environment, expected result and actual result. Never attach cookies, browser profiles or raw account traffic.

There is **no open-source license selected yet**. Source visibility is not a grant of redistribution rights. Licensing and public-release packaging remain open decisions.
