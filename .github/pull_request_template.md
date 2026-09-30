<!-- Short is fine. The two headings below are the ones that get a PR read. -->

## What breaks without this

One concrete sentence about what goes wrong today. Not "improves the admin
page" — "an admin with more than 40 members cannot reach the invite button on a
phone".

## What changed

## What I could not check

<!-- Say it plainly: "not seen on Safari", "not tried on a real phone", "the
     signed-in live screen was not opened". Nothing should be left to assume. -->

## Checks

- [ ] `npm test` passes
- [ ] `npm run test:all` passes, if this touches anything somebody clicks
- [ ] A new test fails when the fix is reverted
- [ ] Screenshots at a phone, a pad and a desktop size are attached, if this changes anything somebody sees
- [ ] No real people's details anywhere in the diff
- [ ] If an AI tool wrote any of this: it worked on a branch, and "What I could not check" is filled in

## Licence

- [ ] I have read the [Contributor Licence Agreement](https://github.com/Klydo131/Open-Sentry-Beacon/blob/main/CONTRIBUTING.md#contributor-licence-agreement)
      and I agree to it for this contribution

<!--
You keep your copyright. The box says you also allow the maintainer to license
the project — your part included — under terms other than AGPL-3.0, so that a
church whose organisation bans AGPL can still be given a private licence. The
public repository stays AGPL either way. The reasoning is written out in full in
CONTRIBUTING.md; if you disagree with it, say so in the PR rather than ticking
the box.
-->

<!--
If a guardrail (tests/no-backend.js, tests/no-secrets.js,
tests/security-invariants.mjs, tests/brand-consistency.mjs) now fails and you
believe it should, say so here and explain why — that is a fair argument, and a
better one than deleting the file.
-->
