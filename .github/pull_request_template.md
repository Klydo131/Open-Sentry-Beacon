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
- [ ] A new table is granted to `authenticated` by name, or closed by name (`tests/every-table-says-who-may-reach-it.mjs`)
- [ ] A new or updated dependency: publisher and date checked, lockfile diff read, nothing added that was not asked for
- [ ] Anything a church running a copy has to do (a migration, a setting, a secret) is in `CHANGELOG.md`
- [ ] If it touches security: the questions in `docs/SECURITY-LAYERS.md`, "Adding something new", are answered
- [ ] If an AI tool wrote any of this: it worked on a branch, and "What I could not check" is filled in

## Licence

- [ ] This contribution is my own work, or I have the right to submit it, and
      I agree it is released under the project's MIT License

<!--
You keep your copyright. The box says the work is yours to give and that it
joins the rest of the project under the MIT License. See CONTRIBUTING.md; if
you disagree, say so in the PR rather than ticking the box.
-->

<!--
If a guardrail (tests/no-backend.js, tests/no-secrets.js,
tests/security-invariants.mjs, tests/brand-consistency.mjs) now fails and you
believe it should, say so here and explain why — that is a fair argument, and a
better one than deleting the file.
-->
