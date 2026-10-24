# Contributing

Focused changes and minimal synthetic reproductions are welcome. Show2Tool is experimental local-first automation; do not use real account traffic or production credentials as contribution fixtures. Read [SECURITY.md](SECURITY.md) before reporting a security-sensitive problem.

## Local setup

Requirements:

- Node.js 24 or later and npm. CI targets Node.js 24.
- Google Chrome for browser-backed tests. The project uses Playwright's `chrome` channel, not a downloaded bundled Chromium.
- A normal user account and a disposable local workspace. Do not run development probes against your everyday browser profile.

From the repository root:

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
```

`npm ci --ignore-scripts` installs the locked dependency tree without dependency lifecycle scripts. The explicit build and test commands still execute project code. Review changes before running them. `npm test` currently has a `pretest` build hook, so it may rebuild after the explicit build above.

Browser tests start local synthetic servers and temporary Chrome profiles. Some tests spawn child processes or create package archives in temporary directories. They need permission to open loopback connections and write to the OS temporary directory. No model API key or real-service credentials are needed for the synthetic tests.

## Test commands and current portability limit

```sh
# Full suite (including browser and package checks).
npm test

# Focused suites; these are not substitutes for the full suite.
npm run test:spike
npm test -- test/alpha/policy.test.ts
```

The CI workflow runs dependency installation, build, typecheck, and the full tests on both Windows and Ubuntu with Node.js 24. This is a validation target, not a claim that both platforms currently pass.

In particular, the owned-CDP test in `test/spike/capture.test.ts` unconditionally launches `C:/Program Files/Google/Chrome/Application/chrome.exe`. It will not work as written on Ubuntu, or on Windows with Chrome elsewhere. A test-scoped portability or gating fix is still needed. The workflow intentionally does not suppress that failure or skip all browser coverage. Other browser tests also require an available Google Chrome installation.

When reporting a failure, include the exact command, commit, Node/npm/OS/Chrome versions, expected result, actual result, and whether it reproduces with only synthetic fixtures. Distinguish a missing browser or platform-path failure from an assertion failure. Report intermittent failures rather than retrying until green and claiming unconditional success.

## Change guidelines

- Keep pull requests small and explain the intended behavior and trust boundary affected.
- Add regression coverage for behavior changes. Prefer synthetic fixtures and explicit assertions about dispatched requests and actual effects.
- Preserve fail-closed scope checks, human review boundaries, bounded outputs, and uncertain-dispatch handling. Do not add automatic retries of uncertain writes.
- Do not commit browser profiles, cookies, raw network recordings, credentials, state journals, generated evidence, `node_modules`, or build output. Check the diff for sensitive data before sharing it.
- Record which checks you actually ran and any failures or platform limitations. Manual browser or human-approval exercises must be described separately from automated tests.
- Keep dependency changes intentional and include the corresponding lockfile update. Do not add install scripts that run unreviewed setup code.

## License and third-party material

The project uses the Apache License, Version 2.0; see [LICENSE](LICENSE). Intentionally submitted contributions are governed by that license unless explicitly stated otherwise under its contribution terms. Submit only material you are authorized to contribute, preserve applicable third-party license and attribution notices, and identify the source of any copied material. Dependencies retain their own licenses; the project license does not relicense them.
