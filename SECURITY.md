# Security policy

## Status and scope

Show2Tool is experimental local-first browser automation, not a production security boundary. The development tree is the current maintenance target; there is no promised security-support window or backport policy for earlier snapshots. Passing tests are not a security audit or a guarantee of safe operation on real accounts.

Use synthetic local fixtures for development and vulnerability reproductions. Do not use sensitive or production accounts to test this project. Local-first does not mean offline: a configured browser and reviewed runtime requests can contact the selected destination and exercise that account's authority.

## Trust boundaries and data

- The browser host uses a dedicated persistent profile under the state directory, not your everyday browser profile. The default state directory is `~/.show2tool`; `SHOW2TOOL_STATE_DIR` overrides it. The profile can retain cookies and login state. Keep it out of source control, shared folders, logs, and issue attachments.
- The local broker uses a Windows named pipe or a Unix-domain socket. Local IPC, interactive reviews, destination checks, and approval records are accident-prevention controls, not isolation from arbitrary code running as the same OS user. Do not expose the broker or Chrome debugging interfaces to other machines. Use a trusted OS account and restrictive filesystem permissions; POSIX mode bits do not establish Windows ACL protection.
- Captures use scoped paths and shape summaries, but approved input fields can retain scalar values. Key filtering is not a complete secret or personal-data detector. Treat recordings, manifests, journals, browser profiles, and diagnostic output as potentially sensitive.
- CDP and Chrome may receive or buffer data before application retention checks. Capture limits do not bound all browser memory or network ingestion. Closing the host is not a promise of secure erasure of its profile or local artifacts.
- Review the actual origin, paths, inputs, projection, and effect before authorization. A read label does not prove that an arbitrary remote endpoint has no side effects. Narrow scopes and dedicated low-privilege test accounts remain necessary.
- Write intents and read-back checks do not provide exactly-once delivery, automatic rollback, or a general safe-write guarantee. An interrupted or uncertain dispatch must not be blindly retried. Payments, deletion, permission changes, bulk operations, and external sending/publication are not supported safe-use scenarios.

## Reporting a suspected vulnerability

Do not put credentials, cookies, authorization headers, raw account traffic, personal data, or live exploit targets in a public issue or pull request.

If this repository's Security tab offers private vulnerability reporting, use that channel. This document does not imply that private reporting is enabled. If it is unavailable, open a public issue containing only a sanitized request for a private reporting channel; withhold sensitive details until a maintainer provides one. There is no published security mailbox or guaranteed response/remediation deadline.

A useful report includes:

- The affected commit and Node.js, npm, OS, and Chrome versions.
- The boundary involved (capture, local state/IPC, scope review, destination enforcement, approvals, or runtime execution).
- Minimal synthetic reproduction steps and the expected versus observed result.
- Whether a request was dispatched or a local fixture effect occurred, and any uncertainty in that observation.

Stop the host and browser when investigating a suspected compromise. If real credentials may have been exposed, revoke or rotate them at the issuing service; deleting a local file alone does not revoke a session.
