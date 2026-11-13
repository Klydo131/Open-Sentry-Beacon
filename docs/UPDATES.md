# Updates and the update floor

Beacon updates itself, and nobody is asked. There is no banner, no button and no
setting. Nobody has to uninstall anything, on any device, on any operating
system.

This document covers what happens on its own, the one guard that decides *when*
it happens, and the lever for a release where staying on an old build is not
acceptable.

## Why there is nothing to press

There used to be a banner offering **Restart** or **×**. It came out because it
asked people to make a decision about software, which is not their job. Most of
the people using Beacon are older, and the thing they ask for over and over is
fewer things to click.

A banner has a second cost that is easy to miss: the honest outcome of an
ignorable prompt is that a lot of phones sit on an old build for weeks. Two
people on two builds can see two different answers to the same question, and
neither of them knows why.

## What happens without anyone doing anything

Every installed copy asks the server which build it is running:

- a few seconds after launch,
- every time the app is brought back to the front — by `visibilitychange`,
  `pageshow` or `focus`, whichever the device happens to send,
- when the connection comes back,
- every 30 seconds for the first five minutes it is open, then every 5 minutes.

Never while the app is in the background, and never twice within 8 seconds. A
failed check backs off (1, 2, then 4 minutes) instead of hammering a server that
is already having a bad day.

The request is one small JSON document, `/version.json`, fetched with
`cache: 'no-store'`. The app compares the build id it gets back with the one
compiled into its own bundle. Different means stale.

This check deliberately does not go through the service worker. The worker has
its own update mechanism and it is the one that failed in practice: when the
browser decides the worker script has not changed, the app reports "no update"
forever while the server has moved on several releases, and the only way out was
to uninstall and reinstall. Comparing build ids needs no cooperation from
anything that might already be broken.

## When it applies — the one thing that has to be right

Applying an update means reloading the page. Do that while somebody is halfway
through a message to the person they are walking with and the message is gone.
They do not experience an update; they experience the app eating what they
wrote, and nobody reports that as an update bug.

So `components/AutoUpdate.tsx` waits for a moment when a reload cannot cost
anybody anything. It reconsiders every 5 seconds, and applies when either:

1. **the app is in the background** — another tab, another app, screen off.
   Nothing is being typed into a page nobody is looking at; or
2. **the page has been quiet for 20 seconds AND nothing on it holds unsaved
   text.** Both halves matter. A person can stop typing mid-sentence to think,
   and their half-written message is still theirs.

"Unsaved text" is read generously: any non-empty `input` or `textarea`, any
non-empty `contenteditable`, or a focused `contenteditable`. A search box with a
word in it blocks the update too. Waiting costs a few more minutes on an old
build; being wrong the other way costs somebody's words.

**There is no timeout that eventually overrides the guard.** A build being an
hour older is a smaller problem than a lost message, every time, and a guard
with an escape hatch fires on exactly the worst case.

After the reload the app shows *"Beacon updated itself"* for a few seconds. It
is not a prompt — there is nothing to decide and nothing to dismiss. It exists
so that "did something change?" has an answer when somebody rings to ask why a
screen looks different.

### The attempt budget, and why it is not optional

The app decides to reload by comparing the build id the server publishes with
the one compiled into the bundle it is running. Those two can disagree in a way
no reload will fix: an edge cache serving `/version.json` from one deployment
and the HTML from another, a half-rolled-out release, a worker that will not
install. This project has already shipped a build where the two ids disagreed
permanently.

Under the old banner, that state was a prompt that never went away — annoying,
survivable. Under automatic apply it is an **infinite reload loop**: the app
reloads, comes back as the same build, finds the same answer, and reloads again.
The page never finishes loading, so nobody can reach Settings to escape it.

So a reload is spent from a budget: **at most two per build, per tab.** The
count is kept in `sessionStorage` against the build id currently running, which
is what lets it survive the very reload it is counting. A successful update
lands on a different id, where the count starts at zero again.

Two rather than one, because a first attempt can lose a race — a worker still
installing, a request that fell over — and giving up after a single try would
strand people on an old build for a transient reason.

When the budget runs out the app stays usable on the old build, and Settings
says **A new version could not install** and points at **Force a fresh copy**.
An old build is a small problem; a phone that will not stay on screen is the end
of somebody trusting the app.

If `sessionStorage` is unavailable — some privacy modes — the budget is treated
as already spent and the app does not auto-update at all. That is a real cost,
chosen deliberately: reloading with no way to count the reloads is the failure
nobody can recover from from inside the app.

### The observable

The current update state is written to `data-update-state` on the root element.
Nobody ever sees it; it exists because with the banner gone the end-to-end
suites had nothing to watch, and a test that cannot see the thing it measures
ends up measuring something else.

## Settings

**App version** shows the build, when it was last checked, and whether a new one
is on its way in. There is no **Restart** button, on purpose.

**Check for updates** stays, because "did it work?" is a fair question and this
is the screen somebody comes to to ask it.

If a copy is genuinely wedged, **Force a fresh copy** throws away the service
worker and every cache and downloads the app again. It touches nothing in
`localStorage` or IndexedDB, so it is safe to tell anybody to press it. It
exists so "uninstall and reinstall" never has to be the answer.

## The floor

The floor is much less useful than it was, and this section says so rather than
implying otherwise.

When a banner could be ignored, a phone could sit on a two-month-old bundle
indefinitely, and the floor was the lever that made a release non-optional. Now
every open copy takes the new build the first time it is quiet, so the gap the
floor was built to close mostly closes itself.

What the floor still does: a copy older than the published floor reports
`'required'` instead of `'ready'`, and Settings says **This version is out of
date** rather than **A new version is installing**. It does **not** make the
update apply any sooner, and deliberately so — the guard above is not overridden
by anything, including this.

**The floor is off by default and should stay off.**

### Raising it

One environment variable in the hosting project:

```text
BEACON_MIN_BUILD_TIME=2026-08-06T12:00:00Z
```

Any timestamp `Date.parse` understands. The natural value is the build time of
the release that introduced the change, printed by the build
(`build stamped: <id> (<time>)`) and served at `/version.json` as `time`.

Most hosts read environment variables at deploy time, so **setting the variable
requires a redeploy to take effect.** Changing it in a dashboard alone does
nothing.

### Lowering it

Clear the variable and redeploy. Nothing else has to be undone.

### The guard rails

In `lib/min-build.mjs`, covered by `tests/min-build.mjs`:

| Situation | What happens |
|---|---|
| Variable unset | No floor. |
| Variable empty or whitespace | No floor. |
| Value cannot be parsed as a date | **No floor**, and nothing is guessed. |
| Value is *later* than the server's own build | **Clamped** to the server's build. |
| Bundle has no readable build stamp | Never escalated. |
| Bundle is exactly at the floor | Not escalated. |

The clamp is the important one. A floor set past the newest build that exists
would mark every copy in the world out of date, including one installed thirty
seconds ago, against an update that has not been built and cannot be downloaded.
With the clamp, the worst a mistyped floor can do is "everybody has to be on the
newest build", which is a state people can reach.

## Where the pieces are

| File | What it does |
|---|---|
| `lib/auto-update.ts` | The policy: is anything unsaved, may it apply now, and has the attempt budget run out? No timers, no side effects. |
| `components/AutoUpdate.tsx` | The timing. Polls the policy and applies when it says yes. |
| `lib/min-build.mjs` | The floor. Resolves the published floor and compares a bundle against it. |
| `app/version.json/route.ts` | Publishes `build`, `time`, `minBuildTime`, `latestNote`. |
| `lib/app-update.ts` | Shared update state, including `'required'`. |
| `components/VersionWatch.tsx` | Asks the server on load, on return, on reconnect and on a timer. |
| `components/ServiceWorker.tsx` | Registers the worker and reports what it finds. |
| `app/settings/page.tsx` | The **App version** card. |
| `scripts/stamp-build.mjs` | Writes one build id and time into `lib/build-info.ts`. |

`stamp-build.mjs` matters more than it looks. The build id used to be computed
inside `next.config.mjs`, which is evaluated more than once, so the browser bundle
and the server route ended up with different ids, disagreed, and the app announced
an update that did not exist forever.

## Proving it

```bash
node tests/min-build.mjs            # the floor rule, no browser needed
node tests/auto-update-policy.mjs   # the apply/wait decision, both answers
npm run verify                      # static guards, includes both of the above
npm run verify:all                  # adds the browser walks below
```

**`tests/auto-update-policy.mjs` is the one to read first.** The browser can
prove the app does *not* reload while a message is half-written; it cannot
reliably prove the other half, because that needs a genuinely newer service
worker waiting and a single-build harness has none. A suite that only ever
demonstrates blocking would pass just as happily on a guard that blocks
**forever** — a real bug wearing the costume of a working one. So the policy is
a pure function and every branch of it is asserted, including the pair that says
the only difference between waiting and applying is the unsaved text itself.

The browser walks:

- `tests/e2e/update-typing.js` — types half a message, forces the update state,
  and waits past the quiet window. The app must not reload, and the half-written
  message must still be in the box.
- `tests/e2e/update-flow.js` — Settings reports a real build and a real date,
  offers **Check for updates**, and offers no **Restart to update**. Its second
  phase needs two genuinely different builds; see `tests/e2e/README.md`.
- `tests/e2e/update-speed.js` — how fast a running app notices a release that
  lands underneath it, that a hidden app costs nothing, that three return events
  make one request, and that nothing is ever offered to tap. It also stands up
  the reload-loop scenario in full — a build the app can never actually become —
  and asserts that it settles within two reloads. That assertion is how the loop
  was found in the first place.
