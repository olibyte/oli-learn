# Security evidence must be verifiable from the public repository alone

The reviewer of this project has two things: the repository and the deployed URL. No Vercel dashboard, no Supabase dashboard, and read — not write — access to this repo. So a security or performance claim is only worth making here if the person grading it can check it without being given an account. That decides tooling on **where its output lands**, not on how good the output is.

The distinction is sharper than it looks, because GitHub's own security features fall on both sides of it. Measured against `api.github.com` with no credentials, and cross-checked against the docs:

| Artifact | Who can reach it |
| --- | --- |
| Files in the repo | Anyone — `raw.githubusercontent.com` answers `200` |
| Workflow run, its conclusion and the commit it ran on | Anyone — `/actions/runs/{id}` answers `200` |
| Workflow run **logs** | [Read access](https://docs.github.com/en/actions/how-tos/monitor-workflows/view-workflow-run-history), which on a public repo is everyone. The REST *download* endpoint is admin-only — `403 "Must have admin rights to Repository"`, on this repo and on `vercel/next.js` alike — so the web UI is the route, not the API |
| Dependabot's pull requests | Anyone |
| A check run's **conclusion** on a commit, third-party apps included | Anyone — `/commits/{sha}/check-runs` answers `200` |
| Code scanning annotations **on a pull request** | [Read access](https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/assessing-code-scanning-alerts-for-your-repository) |
| Code scanning **alerts** (Security tab) | **Write** access — `401 Requires authentication` unauthenticated |
| Dependabot **alerts** | **Write** access — `401 Requires authentication` unauthenticated |
| Vercel and Supabase dashboards | An account the reviewer does not have |

The Security tab is on the wrong side of that line. This effort's map chose GitHub-native tooling on the belief that its findings "render in the public repo's Security tab", which is true only for someone who could already merge to `main`.

## Considered Options

- **Snyk's free tier.** Richer dependency output than CodeQL, and it would have found more. Rejected because its findings live behind a Snyk login — and the distinction has to be drawn precisely, because a third-party app's **verdict** is public even when its findings are not: check-run conclusions are anonymously readable, so a Snyk badge would go green in public with nothing behind it a reader could open. That is the worked example for the whole principle. A green check whose reasoning cannot be inspected is a claim wearing evidence's clothes, and a weaker scanner whose output can be read is worth more *here* than a stronger one whose cannot. The judgement is about the audience, not the tool. (This repository already carries one such app, GitGuardian: its passing check is readable by anyone, its findings by no one without an account.)
- **CodeQL's default setup.** Same engine, same queries, no file to write. Rejected because its configuration is a repository setting: a reader cannot tell that it is on, what it scans, or which query suite it runs. The advanced setup costs one committed workflow file and makes all three readable. Both scan identically — this is a decision about legibility only.
- **Screenshots of the Supabase and Vercel dashboards in the readiness doc.** Rejected as unfalsifiable. A screenshot is an assertion with a picture attached, and it is the format that most resembles evidence while being the least checkable.
- **Prose alone** — "RLS is enabled, the dependencies are current." Rejected by consistency: this repo's answer to an unverifiable security claim is [a suite verified by mutation](../../README.md#testing), and a scanning claim does not get a lower bar than a policy claim.

## Consequences

- **Dependabot's public artifact is its pull requests, not its alerts.** Alerts and security updates were both off — publishing the repo did not turn them on — and are now enabled, but that is plumbing for the maintainer. What a reviewer sees is the PR a security update opens.
- **A clean scan cannot be shown, only a completed one.** Alert visibility cuts both ways: it hides findings *and* hides their absence. So the verifiable statement is that the run happened, on this commit, under this workflow. The first run was CodeQL `2.26.3`, `security-extended`, **103 rules, 0 results**.
- **Findings do reach a reader, on pull requests.** Annotations need only read access. CodeQL's output is therefore public exactly when it is attached to a change and private when it is a standing list — which is an argument for reviewing this project through PRs, as it has been.
- **The weekly schedule is part of the decision.** Queries change when the repo does not. Without the cron a finished project silently stops being analysed, and its last green run ages into a claim about a query suite that no longer exists.
- **Actions are pinned to commit SHAs, not tags**, because a tag can be moved onto a different commit. That is only maintainable because the `github-actions` Dependabot ecosystem keeps the pins current; the two halves hold each other up, and dropping either leaves pins that rot or tags that drift.
- **The scan is not itself a supply-chain event.** `build-mode: none` is correct for JavaScript/TypeScript: CodeQL reads source directly, so no dependency is installed and no project code runs on the runner.
- **The principle is broader than scanning**, which is what makes it an ADR rather than a config comment. It is why tenant isolation is proved by a suite you can run rather than a description of the policies; why the performance evidence is `splinter.sql` output and buffer counts rather than a dashboard graph ([ADR-0002](0002-apis-for-writes-rsc-for-reads.md) reads on the same instinct); and why anything true only inside a Supabase project has to be restated as something reproducible from `supabase/`.
- **The gap this ADR opened against itself is now closed.** It used to read: the README asserts its passing test counts, `eslint` clean and `next build` green, and no workflow verifies any of it — checkable by cloning, which is more than reading. [`ci.yml`](../../.github/workflows/ci.yml) now runs lint, `tsc --noEmit`, `next build` and all 239 tests on every push and pull request to `main`. **The decision that cost something was the 50 integration tests**, which need Docker and a Supabase stack on the runner. They are in, because they are the isolation proof — the strongest security claim in the repository — and a CI job that ran only the cheap 189 would have left precisely that claim unverified while making this bullet look answered. By this ADR's standard the expensive half is the half worth buying: the cheap half proves the code compiles, and only the expensive half proves a student cannot read another student's row.
- **`tsc --noEmit` is a first-class CI step, not an assumed side effect.** `vitest` does not typecheck and `next build`'s TypeScript pass does not reach `tests/`. Measured during the TypeScript 7 evaluation: all 159 unit tests that then existed passed green on a toolchain where `eslint` could not load its own configuration. A green suite is evidence about behaviour, not about the type surface, and conflating the two would make a run log say more than it knows.
