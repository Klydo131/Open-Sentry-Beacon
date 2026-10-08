# CLAUDE.md — Open Sentry Beacon

Claude and Codex work from one map. The brief is [`AGENTS.md`](./AGENTS.md):
the two halves of the app, the product rules that outrank a request, how
authorisation works, migrations, the verify gate, the phone rules and the
protocol for two agents sharing one branch. **Read that first.**

This file adds only what is specific to a Claude session.

## Before you finish

- `npm run verify` must pass. It is typecheck, build and every guardrail, and CI
  runs the same thing on Ubuntu, macOS and Windows.
- Break each new check on purpose and watch it go red before you trust it.
- **Tell the owner before you push.** Say which commits would reach `main`,
  what they change, what passed and what was not verified, and wait for their
  go (AGENTS.md section 0.2).
- Work on a branch and open a pull request. Only the owner merges to `main`;
  agents never push to it (AGENTS.md section 0.2).
- Report **"pushed, build not observed"**. This sandbox cannot reach the
  deployed site, so nothing here can honestly be called live.

## What this session cannot do, and must say so

- No browser session for the signed-in app, so live screens have not been seen
  rendered. Say which screens those were.
- No WebKit, so Safari and iOS behaviour is unverified whatever Chromium showed.
- No reach to the deploy platform, so "it is deployed" is never a claim this
  session is entitled to make.

Say plainly which happened: done, or blocked. Hitting a constraint is not the
same as making a design decision, and the reasoning behind a fallback belongs in
a different sentence from the reason you had to fall back at all.

## The repository is public

Nothing that identifies a real member belongs in a tracked file, including
commit messages. When a live check informs a decision, record what you learned,
not the row you read.
