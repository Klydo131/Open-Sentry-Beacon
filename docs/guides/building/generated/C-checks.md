# Appendix C. Every check in the gate

`npm run verify` runs these 178 checks after the typecheck and the production build, in this order. Each entry is the check's label in `scripts/verify.mjs` and the opening comment of its file: what it holds and why it exists.

#### no secrets

`tests/no-secrets.js`

Guardrail: this repository is public, so nothing in it may be a secret.

The live app has its own version of this file because it holds a real church's backend. This one exists for the opposite reason: everything here is meant to be read by strangers, which makes an accidentally committed key worse, not better. A private repo leaks to whoever has access; a public one leaks to a crawler within minutes, and the first thing an automated scanner does with a found key is use it.

node tests/no-secrets.js

#### no backend, no pipelines

`tests/no-backend.js`

The promise this project makes, checked rather than asserted in a README.

Open Sentry Beacon says three things about itself. Each one is easy to break with a single well-meaning commit, and each one is the reason somebody would trust it with a congregation's names:

1. IT SHIPS NO KEYS, AND RUNS WITH NO CONFIGURATION. Clone it and it works — a sample church, in the browser, with nothing to sign up for. Point it at your own database and it becomes real. Neither the keys nor the hostnames of anybody else's deployment are in here. 2. IT PHONES NOBODY. No analytics, no error reporting, no telemetry, no "anonymous usage statistics". A church's activity is the church's. 3. IT CARRIES NOBODY'S PIPELINE. This repository was extracted from a private one that has deployment monitoring, status notifications and its own reporting workflow. None of that belongs to the people who fork this, and some of it would quietly report to somebody else's systems.

#### test portability

`tests/test-portability.mjs`

Do the tests run anywhere, or only on the machine that wrote them?

Three separate portability bugs were committed into these suites before this check existed, and none of them failed loudly:

• `require('/opt/node22/lib/node_modules/playwright')` — an absolute path to one sandbox, in a committed test. • `const OUT = '/tmp/claude-0/-home-user/<session-id>/scratchpad'` — six files writing screenshots into a directory that exists for one session. • `const BASE = 'http://localhost:4002'` — a hardcoded port, so running the suite against a server anywhere else failed with a connection error that reads exactly like a broken app rather than a broken test.

#### brand consistency

`tests/brand-consistency.mjs`

Is the brand one drawing, or several that happen to look similar?

Before the Hope Beacon rename there were three different candles in this repo: app/icon.svg drew a plain one, public/icons/icon.svg drew a different one with rays and extra detail, and components/ShellChrome.tsx drew a third in JSX. Nobody noticed, because nothing ever renders them side by side — you see the favicon in a tab, the installed icon on a home screen, and the header inside the app, hours apart.

The mark is now defined once in components/SentryBeaconMark.tsx and the icon files are generated from the same path data by scripts/gen-icons.mjs. This check enforces that they have not drifted since — because generating a file and committing it is exactly the kind of step that gets skipped.

#### the brand is one name

`tests/the-brand-is-one-name.mjs`

The app is called Hope Beacon. The repository is called Open Sentry Beacon.

WHY THIS EXISTS. lib/brand.ts opened with "change these lines and nothing else", said nothing hard-codes the name, and named a test that would fail if something started to. All three were false.

tests/brand-consistency.mjs -- the test it named -- only ever compared the LOGO DRAWING between its copies. It never looked at the name once. So the promise was never enforced, fifty-one hard-coded occurrences accumulated across twenty-three screens, and the rename away from the app's first name had to visit eighty-four files instead of one.

#### media guardrails

`tests/media-guardrails.js`

*No header comment.*

#### backend CSP

`tests/backend-csp.mjs`

If this deployment has a backend, the browser must be allowed to reach it.

lib/mode.ts decides IS_LIVE purely from NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, and lib/supabase/client.ts then makes every data call FROM THE BROWSER. So the Content-Security-Policy is not a backstop here — it is on the critical path of every signed-in screen.

It was wrong. connect-src was the literal string "'self'", four lines under a comment instructing the reader to add their backend's origin to exactly that directive. A live deployment therefore refused its own database: sign-in, dashboards, sharing, all of it, failing in the browser console where no server log would ever show it.

#### real-time and pairing media

`tests/realtime-and-media.mjs`

Media and real-time: the invariants that are easy to break by accident.

These are source assertions, not a running app. Each one exists because the opposite mistake is both easy to make and silent when made — the kind that ships and is found by a user, not by a reviewer.

#### update floor

`tests/min-build.mjs`

The update floor, exercised without a browser or a server.

Every assertion here is about not pestering somebody for no reason. The floor decides when the update reminder stops being polite and starts coming back every hour, so the rule that raises it has to be provably conservative: unset is off, a typo is off, and a floor set past the newest build that exists is clamped rather than obeyed. That last one is the whole reason this file exists — a floor of "2027" on a 2026 deployment would demand an update that cannot be downloaded, so the reminder could never be satisfied and people would learn to ignore it.

#### auto-update policy

`tests/auto-update-policy.mjs`

When may the app reload itself? Every answer, asserted, against the real code.

The end-to-end suite proves the app does NOT reload while a message is half-written. It cannot reliably prove the other half — that a cleared box lets the update through — because that needs a genuinely newer service worker waiting, and a single-build harness has none.

That gap matters. A suite that only ever demonstrates blocking would pass just as happily on a guard that blocks FOREVER, which is a real bug wearing the costume of a working one. So the policy lives in `lib/auto-update.ts` as pure functions with no timers and no side effects, and every branch is checked here, in milliseconds, with no browser.

#### a first install stays on the page

`tests/a-first-install-stays-on-the-page.mjs`

Exercise the actual effect with both worker event orders. A first installation must not look like an update when WebKit claims the page early.

#### analytics over time

`tests/analytics-trend.mjs`

The arithmetic behind "activity over time", checked without a browser.

This is the part of the analytics screen that is easy to get subtly wrong and impossible to eyeball: bucket boundaries, an unfinished bucket that looks like a decline, and a percentage change with nothing to divide by. A church council makes decisions off these numbers, so they get a test rather than a look.

Imported straight from the TypeScript. Node 22 strips types natively and CI pins node-version: 22, so there is no build step between the code that ships and the code that is checked here.

#### security invariants

`tests/security-invariants.mjs`

Security invariants that must not regress, checked from the source.

This file exists because an audit is a photograph and a test is a promise. Every check below corresponds to something that was verified by hand during the 2026-08-08 audit and could be undone by an ordinary, well-meaning change six months from now — a new dependency, a new link field, a new API route, a CSP directive loosened to make an embed work.

Each check says WHY it is here, because an invariant nobody understands is an invariant somebody deletes.

#### the signed-out role

`tests/the-signed-out-role.mjs`

What a visitor who has not signed in is allowed to touch.

Supabase hands `anon` and `authenticated` every privilege on every new table, and Row Level Security is what takes it back. Two habits keep that safe, and both are easy to forget in a hurry:

1. A policy written with no `TO` clause applies to PUBLIC, which includes `anon`. 2. A table that keeps the default grant is one careless policy away from being world-readable, because the anonymous key ships inside the JavaScript bundle and anybody who opens the app already has it.

#### the Explorer starts with Jesus

`tests/the-explorer-starts-with-jesus.mjs`

What an Explorer's shelf opens with.

The starter kit began as a reference shelf and was shown, whole, to everybody: three editions of the Bible, the collected Ellen G. White, the full prophetic history, both statements of belief, this quarter's lesson, an archive of quarterlies going back decades, and the General Conference publications list.

That is the right shelf for a Director preparing a study. It is the wrong first thing to hand somebody who has just agreed to let a stranger walk with them, and it answers questions nobody has asked yet. Twenty items arranged like a filing cabinet is not a welcome.

#### dead is not refused

`tests/dead-is-not-refused.mjs`

The link checker must tell a wrong address from a site that dislikes robots.

WHY THIS TEST EXISTS. `scripts/check-links.mjs` was written to catch a wrong address on the church's shelf. Its first real run called four links dead. Three of them open perfectly in a browser: kingjamesbibleonline.org, adventistarchives.org and gcyouthministries.org all answer 403 to a GitHub runner, and hopetv.org answered 429 because the checker had just made nineteen requests in ten seconds. One self-inflicted, three not.

A checker that goes red for those is worse than no checker, because the church learns to click past it, and then it goes red for a real 404 and nobody looks. So the classification is the load-bearing part, and it is the part that was wrong — which is why it has a test and the twenty addresses do not. This runs against a server on localhost, so it needs no network and bothers no publisher.

#### notifications go through the worker

`tests/notifications-go-through-the-worker.mjs`

A notification a phone will actually show.

WHY THIS EXISTS. Alerts were turned on from a real Android phone, the screen said "✓ On", and nothing ever appeared. Chrome on Android refuses the `Notification` constructor outright — it throws `Illegal constructor` and permits only `ServiceWorkerRegistration.showNotification()`. The live settings screen called the constructor directly, so the confirmation threw and the person was left with a screen claiming success and a silent phone.

It worked on a desktop, which is exactly how it survived review, and the demo settings screen next door had always done it correctly. One copy of two reached for the raw API.

#### a study can be corrected

`tests/a-study-can-be-corrected.mjs`

A study you have written can be changed, not only deleted.

WHY THIS EXISTS. Lesson studies could be created, published, unpublished and deleted — and never edited. A typo in a title, or a series filed under the wrong area of interest, could only be fixed by deleting the whole thing and writing it again, which also destroyed every handout attached to it, because the files hang off the lesson row. So in practice nobody fixed anything and the shelf carried the mistake.

The database had allowed this all along: `lessons_edit` and `ls_edit` both permit an UPDATE from the author or from anybody who manages the church, and both pin church_id to the caller's own. Only the app was missing. That is worth a test precisely because nothing failed — no error, no refusal, just an absent button that nobody could point at.

#### the screen keeps up

`tests/the-screen-keeps-up.mjs`

The screen keeps up without anybody pressing refresh.

WHAT WAS WRONG. Exactly one table in the whole app was published for realtime — `messages` — so a conversation updated itself and every other screen did not. Post a notice, approve somebody, add a study, propose a time, and the person looking at that screen saw the old version until they pulled to refresh. In front of a room that reads as the app being broken.

THIS HAS TWO HALVES AND EITHER ONE ALONE DOES NOTHING, which is exactly why it is worth a test rather than a glance:

#### a resource can be taken off the shelf

`tests/a-resource-can-be-taken-off-the-shelf.mjs`

A resource you added can be taken off the shelf again.

WHY THIS EXISTS. The church library could be added to and shared from, and never tidied. A link pasted with a typo, a resource that turned out to be the wrong one, a video the church decided against — all of it stayed for good, because the only control on a row was Share. The shelf could only ever grow.

This is the same shape of gap as Lesson studies: `materials_drop` has permitted the delete the whole time — the person who added it, or anybody who manages the church — and only the app was missing. Nothing reports that kind of gap. There is no error and no refusal, just an absent button, which is why it is worth a test rather than a glance.

#### the docs know what shipped

`tests/the-docs-know-what-shipped.mjs`

The developer documentation still describes the app that exists.

WHY THIS EXISTS. ARCHITECTURE.md is what README sends a developer to first: "how it is built, and where everything lives. Start here if you are about to change something." For months it described an app with NO BACKEND and mapped nine paths — while the repository had grown a second half: `lib/live/`, twenty-eight `components/Live*.tsx` screens, seventy-one migrations and an edge function, none of which appeared in it. Somebody cloning the project to run it for their own church read a map with half the territory missing, and nothing anywhere reported that.

#### the ambience is pleasant

`tests/the-ambience-is-pleasant.mjs`

The ambient sounds are pleasant, and the harsh ones are labelled as such.

WHAT WAS REPORTED. "Some users didn't like the white noise because some of it are not pleasing." Three separate things were true, and a flat list of three buttons hid all of them:

* Every option was noise, and one was raw white noise -- flat all the way up, the harshest sound a speaker can make. It sat in the same undifferentiated list as the gentle ones. * Nothing moved. A two-second buffer looped forever at one level is a wall, and a wall is tiring within minutes however well its colour was chosen. * Every entry had a one-line description of what it sounded like, written the day the file was, and NO SCREEN HAD EVER DRAWN ONE. The information that would have let somebody avoid the harsh one was in the source.

#### the named Guide is paired

`tests/the-named-guide-is-paired.mjs`

A Guide chosen on an invitation is paired the moment the Explorer arrives.

WHAT WAS REPORTED. "The pair with Guide when I invite an Explorer for the first time is not working in the sub room approval. If I pair an invited Explorer to a guide, they should be paired right away."

THREE SEPARATE BUGS SAT ON ONE PATH, and only the third is the reported one. All three were found by probing the live database, not by reading.

ONE. The approval itself FAILED: "there is no unique or exclusion constraint matching the ON CONFLICT specification". The Director got an error and the person stayed unapproved. Self-inflicted the same day -- `a_pair_can_be_made_again` dropped the unconditional UNIQUE (ds_id, dm_id) for good reasons, and a trigger written long before said `on conflict (ds_id, dm_id)`, which needs exactly that index.

#### a first password

`tests/a-first-password.mjs`

The password an invitation e-mails somebody.

WHY THE INVITATION CARRIES ONE AT ALL. It used to carry a one-time link, and a one-time link is fragile in ways nobody invited to a church app should have to understand. It expires. It is spent by the first thing that opens it, which on many mail systems is a scanner and not a person. It works once, so a second tap fails. Twenty-three people were once stuck at the same moment, each holding an account with no password and a link already used.

WHAT IT HAS TO BE. Readable off a phone screen, typable on a phone keyboard by somebody in their seventies, and sayable down a telephone to a person who is stuck. That rules out `xK7#pQ2v` on all three counts.

#### the invitation carries a password

`tests/the-invitation-carries-a-password.mjs`

The invitation carries an account somebody can sign in to, not a link that dies.

WHAT WAS ASKED FOR. "We can make the email invitation have a faster process. How about we make the invitation with account with password already... That email and password must be emphasized first before tapping the accept or join in to the Web app. Once the user read the email and password, they are ready to tap or click the app."

WHAT IT REPLACES, AND WHY IT IS THE RIGHT TRADE. `auth.users` holds ONE confirmation token and ONE recovery token -- single slots, not a list. Every path that minted a second token silently killed the one already sitting in somebody's inbox. On top of that, a one-time link is spent by whatever opens it first, which on most mail systems is a scanner rather than a person, and it expires on a clock nobody invited to a church app knows about. Twenty-three people were stuck at once, each holding an account with no password and a link that had already been used.

#### the studies are sourced

`tests/the-studies-are-sourced.mjs`

The example studies name their sources, and the Explorer's series is plain.

WHAT WAS ASKED FOR, across two messages:

"I want the sample lesson studies to have sources with the 7th day Adventist sources please, not some random published no basis points... I dont want to see lesson studies that are just random automated by AI, it must have a strong content with strong sources too."

"Also please remove the churchy words for Explorers since they are new in faith too, let's focus more on Christ centered them for Explorers for we dont know if they have sensitive to religion or not."

#### the library is easy to use

`tests/the-library-is-easy-to-use.mjs`

The library shelf can be described, searched, and shared without a wall of buttons.

THREE THINGS, and the first is a real gap rather than a polish item.

ONE. THE FORM NEVER ASKED WHAT A LINK IS FOR. `addMaterial` has taken a description since the day it was written, `updateMaterial` takes one, and the row draws one -- and no screen ever offered a box to type it in. So every resource added by a real person is a bare title over a grey address, and the only items with a line explaining themselves are seeded ones. A link handed to somebody hesitant, with nothing saying why it is worth their time, is a link nobody taps.

#### a share can say why

`tests/a-share-can-say-why.mjs`

A Guide can say why they are sending something.

WHY THIS EXISTS. Every part of this feature was built except the one that takes the input, and nothing noticed for as long as it shipped:

material_shares.note the column, capped at 1000 -- migration 0008 shareMaterial(..., note) the data layer takes one -- lib/live/data.ts {s.note && <span>"{s.note}"</span>} the Explorer's card DRAWS it live.shareMaterial(m.id, p.id) the Guide's screen never passed it

So every share ever written carried an empty note. Not because Guides skipped it -- because there was no box. The receiving half of the feature had been rendering a field that could not be filled, which is the kind of fault that never produces an error and never appears in a log. It was found by counting: twenty-two shares in the church, twenty-two empty notes.

#### a Guide sees who already has it

`tests/a-guide-sees-who-already-has-it.mjs`

A Guide can see who already has a resource, without opening anything.

WHY THIS EXISTS. The chip that says "Maria has this" was on the row the whole time, fenced behind `pairings.length === 1`. So the only Guide it ever spoke to was one carrying a single Explorer. A Guide at the cap of five -- exactly the person who cannot hold it in their head -- saw nothing, and had to open the picker on every row in turn to answer "have I given them this yet".

The answer was already in memory. `alreadyShared` is loaded for EVERY pairing on the screen, not just the first; the fence was the only thing stopping it being read. This is a condition removed, not a feature added, which is why the check below is about the condition.

#### the chat is a bubble everywhere

`tests/the-chat-is-a-bubble-everywhere.mjs`

The chat is a bubble on every screen, not a room you navigate to.

WHY THIS EXISTS. The dock was `hidden xl:block`, so only a screen 1280px or wider ever got the floating chat. Everybody else was sent to /talk -- a PAGE, which means leaving whatever you were reading and losing the place you had scrolled to, every time you want to see whether somebody replied. On a phone that is most of the app's use.

Reported from a phone, with a screenshot: "I dont like this as a separate sub room on the phone or pad, I want it as a bubble like what you did at desktop and mac."

#### the thread reads like a conversation

`tests/the-thread-reads-like-a-conversation.mjs`

The thread reads like a conversation, not like a stack of records.

WHY THIS EXISTS. Asked for plainly, from a phone: "How can we improve the design and UI of chat right now, something is still missing I assume."

Nothing was missing. The proportions were wrong, and measuring the screenshot against a 412px phone says so exactly:

the "Private conversation" banner ~109 CSS px the photo-guidance note ~95 CSS px ONE ACTUAL MESSAGE ~91 CSS px

#### the live app offers what the tutorial offers

`tests/the-live-app-offers-what-the-tutorial-offers.mjs`

Anything the tutorial can do, the real app can do.

WHY THIS EXISTS. Reported with a screenshot of the live settings page: "Open Hope Beacon is missing the general settings that the Local Church has, like make the letters big or small or general settings at all. Can we add the please for ALL users."

It was not missing. app/settings/page.tsx -- the settings page inside the TUTORIAL -- had a folder called "Language and size" holding both controls. components/LiveAccountPages.tsx -- the settings page every real person opens -- had five folders and none of them was that one. It never imported useLocale at all.

#### emoji are suggested as you type

`tests/emoji-are-suggested-as-you-type.mjs`

Emoji are suggested while you type, and never offered to somebody who did not ask.

WHAT THIS IS. Type a colon and two letters -- `:pra` -- and the matches appear above the box. Asked for as "integrated with smart typing" rather than as a button, which is the better shape: a grid of four hundred pictures is a thing to go hunting in, and the point is to stay in the sentence.

THE TRIGGER HAS TO BE NARROW, AND THIS APP MAKES THAT SHARPER THAN USUAL. A colon is punctuation people already type, so a loose rule fires constantly in the middle of ordinary writing. The false positive that matters most here is a VERSE REFERENCE: `Luke 4:18` must never open a menu. `10:30` and `https://` are the same rule and equally unwelcome.

#### the chat is the bubble and it moves

`tests/the-chat-is-the-bubble-and-it-moves.mjs`

One way into the chat, it lets a Guide choose who, and it moves when touched.

THREE THINGS, ASKED FOR TOGETHER, WITH THE CHAT ICON CIRCLED IN RED ON A PHONE SCREENSHOT: "you can take out the chat room now since we already have the bubble, make sure that Bubble have choices of Explorers for Guides since Guides have multiple explorers to chat. Make some little animations at least for chat when you tap or click it for a better UI experience please, let's not make our web app static."

1. ONE WAY IN. The navigation carried a Talk row that opened /talk as a page. An icon in the navigation is a PLACE YOU GO: tapping it left whatever you were reading and threw away where you had scrolled to. Once the bubble worked at every size and opened OVER the page, that row was a second and worse way in to the same conversation.

#### an appointment is remembered

`tests/an-appointment-is-remembered.mjs`

An appointment can say why, a silence is broken, and what happened is kept.

THREE FAULTS IN THE APPOINTMENTS CARD, none of them reportable from outside and all three found by counting against the live database.

1. THE NOTE NOBODY COULD WRITE. `meetings.notes` has existed since migration 0009 with a 2000-character check, `scheduleMeeting` has accepted one since it was written, `listMeetings` selects it and the Meeting type carries it. The screen never passed one and never drew one. So all thirty-six appointments this church has arranged carry an EMPTY note -- not because nobody had anything to say, but because there was nowhere to say it. Identical in shape to the library's share note, found a day earlier, which is why it is worth a check rather than only a fix.

#### you can tell whether it was read

`tests/you-can-tell-whether-it-was-read.mjs`

You can tell whether the last thing you said has been read.

WHY THIS EXISTS. `read_at` has been written since this app had messages: opening a thread marks the OTHER person's messages read, all three screens that show a conversation call it, and it arrives in the browser on every load. Nothing ever drew it. The only thing it fed was the unread count on the bubble, so a Guide could see THAT something was waiting for them and never whether anything they sent had landed.

THE RULE THIS CHANGED, AND IT CHANGED BY DECISION RATHER THAN BY DRIFT. TalkDock said "no read receipts beyond the one this app already had". It was raised as a decision rather than built, with the concern stated plainly: a receipt puts pressure on the person who has not replied, and an Explorer bringing something hard to their Guide is the person least able to carry it. The owner asked for it anyway, knowing that. The comment in TalkDock is amended rather than deleted, so the reasoning survives the person.

#### a pairing has a track record

`tests/a-pairing-has-a-track-record.mjs`

A Director can see when two people connected, when they stopped, and when somebody was approved.

WHY THIS EXISTS. Asked for from the roster screen: "EDs and Directors should know when did the Guide and Explorer connected so we there would be a track record."

TWO HALVES, AND THEY FAILED FOR DIFFERENT REASONS.

1. THE START DATE WAS ALREADY IN THE BROWSER. `pairings.created_at` has existed since the table did, `listPairings` does `select('*')`, and the type has always carried it. The roster drew two names and a stage and no date at all -- so it answered "who" and never "since when", and three weeks and three months are different questions about the same two names.

#### the pocket keeps a web app safely

`tests/the-pocket-keeps-a-web-app-safely.mjs`

A pasted address becomes a tile, and cannot become a script.

WHY THIS EXISTS. "First I will copy the URL of the web app like example, spotify, youtube, or facebook, then I will paste it on the URL of the pocket micro-app and I click the save button, then it automatically registers the logo and app URL... that can be helpful to ALL users."

This replaces tests/a-room-for-the-apps-a-church-uses.mjs, retired in the same commit because the room it described is gone. Retiring a check is how coverage silently drops, so every SECURITY assertion that file made is carried over here and made to fit the new shape. The room's list lived in a table with policies; the pocket's lives in the browser. What does not change is that a string somebody pasted ends up in an href.

#### the rail is not the only way to reach something

`tests/the-rail-is-not-the-only-way-to-reach-something.mjs`

Nothing lives only in a rail that a phone never draws.

WHY THIS EXISTS. Asked plainly: "can we add the pocket app features in pads and mobile too?" -- and the answer was that it had never been on either.

The pocket was put in the right rail, which is where it was asked for, with the gap between the desk and the player circled in red on a desktop browser. That rail is `hidden ... xl:block`. `xl` is 1280px. An iPad mini is 744px across, an iPad Pro 1024px, a phone about 400px. So the feature shipped invisible to every tablet, every phone, and any laptop in a split window -- which is most of the congregation this app is for.

#### a case is reachable by whoever is in it

`tests/a-case-is-reachable-by-whoever-is-in-it.mjs`

Taking the door away must not take the room away.

WHY THIS EXISTS. "Take out the cases in both Guide and Explorer, rebrand it and put it on settings and make a sub room called 'Admin Reports'."

The door was the problem: a Guide or an Explorer had a scales-of-justice link in their sidebar at all times, on every screen, when almost none of them will ever be party to a proceeding. It reads as an accusation waiting to happen.

THE HALF THAT IS EASY TO LOSE WITH IT, and which app/cases/page.tsx has said in a comment since the day it was written: an Explorer called into a case is the person in it with the LEAST standing. Their answer has to be reachable without anybody having to tell them where to look, and they can post even while suspended, because suspending somebody pending a hearing must not take away their side of it.

#### a report is answered by one person

`tests/a-report-is-answered-by-one-person.mjs`

Nobody answers a report about themselves, and nobody joins somebody else's.

WHY THIS EXISTS. "any Directors can pick up a Guide and Explorer's report, but if a Director misbehave it will be put on trial with EDs and Head ED ... only one can chat such case, it wont be a group chat but a one on one chat."

THE HAZARD THIS GUARDS, WHICH PREDATED THE REQUEST. `reports_read` in migration 0021 admitted every approved admin and executive of the church with no exclusion for the person the report was ABOUT, and `report_person` notified all of them. So a Director could already read a report filed against them. Add "any Director can pick up a report" on top and it becomes a trap: the reported Director claims the case about themselves and is the only other person in a private thread with the member who spoke up.

#### an animation that loops does not repaint

`tests/an-animation-that-loops-does-not-repaint.mjs`

A loop that runs for ever may only move things the GPU can move.

WHY THIS EXISTS. Reported from a phone: "The animation is not that smooth, I can still and feel it's lagging loop. Can you make it smooth please."

The journey bar's sheen animated `background-position`. A background position is a PAINT property: every frame, for ever, the browser re-drew the gradient across the whole bar. Sixty times a second of repainting on a mid-range phone is what "lagging" was. Nothing was wrong with the timing or the design.

#### who may take a seat

`tests/who-may-take-a-seat.mjs`

Nobody hears their own case, and no Director hears a Director's.

WHY THIS EXISTS. "Any Director, ED, and Head can join the trial room" -- and then, asked back and answered in the owner's own words: "yes do that, except trials about themselves or fellow Directors".

HALF OF IT WAS ALREADY TRUE, WHICH IS WHY IT NEEDED A CHECK RATHER THAN A FEATURE. `in_trial` has always had a branch admitting any approved Director or Executive of the church, so leadership could already read every trial. What it never had was either exclusion:

#### an explorer is told what to do next

`tests/an-explorer-is-told-what-to-do-next.mjs`

An Explorer is told what to do, and never left on a dead end.

WHY THIS EXISTS. Twenty-one studies published in this church, two read. The pairings were made, nobody was unpaired, nine materials were shared: supply was healthy and demand was near zero. What was missing was the sentence that tells an Explorer what to do when they open the app today. My Journey opened on four folders and not one of them opened with a next step.

TWO RULES, AND THEY ARE THE WHOLE OF PHASES 1 AND 2.

#### the pocket is for tools

`tests/the-pocket-is-for-tools.mjs`

The pocket keeps tools, not feeds, and says so before anybody tries.

ASKED FOR: "I want to limit (with a disclosure of course to every user) to take our social media apps in the pocket application (Except for Youtube). Facebook, X, Instagram, Tiktok, LinkedIn, etc. are not allowed in the pocket application because it can bring distractions to all users."

A PRODUCT RULE, NOT A SAFETY ONE, and that shapes how it is built. tidyUrl refuses what could HARM somebody -- a `javascript:` address that would run in this app's origin. This refuses what is perfectly safe and that the church has decided does not belong one tap from a study. So it fails with words a person can read, and the reason is on screen BEFORE anybody tries rather than only after they are turned away.

#### a guide is told why sharing is paused

`tests/a-guide-is-told-why-sharing-is-paused.mjs`

A Guide who cannot share is told why, and the reason cannot drift from the rule.

FOUND BY PROBING THE LIVE DATABASE. A Guide sharing a resource with their own Explorer was refused. The rule was right -- an open case pauses sharing for that pairing -- but the Guide saw a bare row-level-security violation, which humanError renders as "you do not have permission, ask your Director". They DO have permission, it is paused rather than withheld, and this church has no Directors to ask.

THE DEFECT THIS CHECK IS REALLY ABOUT is not the missing sentence, which any assertion could pin. It is that a rule and its explanation are two statements of one thing, and two statements of one thing drift. The day a tenth condition is added to the rule, an explanation listing nine would start saying "nothing is wrong" to somebody being refused -- worse than silence, because it is confidently wrong.

#### the room belongs to its owner at any width

`tests/the-room-belongs-to-its-owner-at-any-width.mjs`

An Explorer's own room reaches them on the device they actually own.

MEASURED, NOT INFERRED. Chromium, the tutorial shell, signed in as an Explorer, six viewports:

iPhone SE 375 rail HIDDEN -> 339px Pixel 412 rail HIDDEN -> 376px iPad mini 744 rail HIDDEN -> 708px iPad Pro 1024 rail HIDDEN -> 988px split 1180 rail HIDDEN -> 1144px desktop 1440 rail 324px -> 324px (unchanged, as intended)

The right rail was `hidden ... xl:block`, so everything personal in it died below 1280px: the study timer, the theme picker, and the line an Explorer writes for themselves. None of those exist anywhere else -- Settings offers no theme and no motto -- so below 1280px they were not awkward to reach, they were gone. Every device an Explorer owns is below 1280px.

#### a study room the church owns

`tests/a-study-room-the-church-owns.mjs`

A study room belongs to the person whose room it is.

WHY THE CHURCH KEEPS THESE DOCUMENTS AT ALL. AFFiNE's editor, BlockSuite, is MIT and embeddable. Its server is not: everything under packages/backend is AFFiNE Enterprise Edition, production use only under their paid subscription terms. And the published BlockSuite packages do not close that gap -- the only class implementing the `Workspace` interface in the published tree is `TestWorkspace`, a test harness. So the document store is ours, which is the arrangement the church wanted regardless: study notes on the church's own database, under the church's own rules.

#### the study room is paid for on arrival

`tests/the-study-room-is-paid-for-on-arrival.mjs`

Nobody pays for the study room until they open it.

THE NUMBER THIS FILE EXISTS FOR. The study room's editor is BlockSuite, and it measures 3.25 MB gzipped -- against 0.54 MB for the whole of the rest of this application. Six times the entire app, for one room, on phones on Philippine mobile data.

Measured after wiring it in:

shared JS, every screen 102 kB -> 107 kB /ds first load 287 kB -> 339 kB editor chunk 4.63 MB, separate, fetched on tap

#### a room that already exists still opens

`tests/a-room-that-already-exists-still-opens.mjs`

A study room that is already in the database still opens.

THE GAP THIS FILLS, AND IT COST A LIVE AFTERNOON. Every other check on the study room opens a NEW room: the browser walk runs against the tutorial, because the tutorial needs no credentials, and the tutorial starts empty every time. A new room is the one case that cannot go wrong -- the code that reads it is the code that just wrote it.

The rooms that differ are the stored ones. Trimming the editor down to what a study room needs dropped `affine:surface`, the infinite canvas, which this room does not draw. But the pages already written have a surface block in them, and loading one raises `schema for flavour: affine:surface not found`.

#### a page can be tagged and dated

`tests/a-page-can-be-tagged-and-dated.mjs`

Tags mean one thing each, and a journal page lands on the right day.

ASKED FOR, IN THE SCREENSHOT OF AFFiNE'S "All docs": tags on the pages and a journal. Both look like the kind of feature a screen can be trusted with, and both have a failure that no screen would ever show you.

THE TAG ONE: "Romans", "romans" and " Romans " are one tag to a person and three to a list. A room that collects all three has a tag list nobody can use, and it happens over weeks, so it is never visible in a demo.

#### leadership sees the shape, not the thing

`tests/leadership-sees-the-shape-not-the-thing.mjs`

Leadership can see that somebody did something. Not what they did it with.

ASKED FOR, IN THESE WORDS: "Head ED, ED, and Directors can detect the activities (Except for chat) of Guide and Explorer, but the Head ED, ED, and Directors can't see the references. ... the website can't be seen but the Director can see the label of the activity is not good."

WHAT THIS FILE IS ACTUALLY FOR, because the obvious version of it is useless. A check that the SCREEN does not print an address passes on a screen that simply forgot to, and fails nothing on the day a different screen prints it. The rule has to be that the address is not THERE -- so what is asserted here is the absence of the column, the absence of it in every function's returned columns, and the absence of any migration putting it back.

#### a guide is given once

`tests/a-guide-is-given-once.mjs`

The room's Getting Started page is a gift, not a nag.

ASKED FOR: "Make sure there is an instruction manual inside the study room so Explorers can see the full potential of the Affine features like what Affine did in the tutorial."

THE HALF THAT IS EASY TO GET WRONG is not writing the page. It is not writing it again. "Is the guide page there?" is also false for somebody who read it and put it in the bin, so a room that asks that question hands it back every single time they open the room, forever. The same mistake was caught and avoided in the pocket's starter tile; this is the same rule in a second place, which is exactly when a rule stops being obvious.

#### a picker says why it is empty

`tests/a-picker-says-why-it-is-empty.mjs`

An empty picker says which kind of empty it is.

REPORTED AS A BUG, WITH A SCREENSHOT: "Pair a Guide and Explorer" with the Explorer box reading "No explorers to choose yet" and Create pairing greyed out.

THE CONTROL WAS RIGHT AND THE SENTENCE WAS WRONG. The picker offers only Explorers who have no Guide, and in that church every approved Explorer already had one, so the list was correctly empty. But "no Explorers to choose YET" means none exist, and a Director looking at a roster of fourteen Explorers and a picker saying there are none concludes the screen is broken. There was no way to tell a fully-paired church from a failed load.

#### leadership can measure without reading

`tests/leadership-can-measure-without-reading.mjs`

The analysis counts what people did. It cannot read what they said.

ASKED FOR: "Head ED, ED, and Directors must have analysis to track Guide and Explorer activities please."

THE DANGER IN A SCREEN LIKE THIS is not that it fails to count. It is that "analysis" is the word under which a conversation gets read: one more column would answer so many questions, and every column is a small argument on its own. So what is held here is the shape of the answer -- counts and dates -- rather than any particular number.

#### the comment stripper keeps the code

`tests/the-comment-stripper-keeps-the-code.mjs`

The thing that removes comments does not remove code.

WHY THIS EXISTS, WRITTEN DOWN AFTER IT BIT TWICE. Fifty test files in this repo blank out comments before searching a file, so a rule mentioned in a paragraph of reasoning is not mistaken for a rule that is implemented. Every one of them carried the same pasted line:

src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, blank)

`--` starts a comment in SQL. It also appears inside string literals. The study room's link classifier tests a host for `xn--`, the prefix on a punycode domain -- a name written in letters chosen to look like other letters, which is how a phishing address is made to read as a real one. Stripped by that line, the rule disappears, and a check asserting the classifier knows about punycode reported a missing feature that was there.

#### the shelf knows what it is holding

`tests/the-shelf-knows-what-it-is-holding.mjs`

The kind on a library row matches what is actually at the address.

WHY THIS EXISTS. The add form asks for a Kind, offers five, defaults to "Link", and puts the dropdown BELOW the address box -- so somebody pasting a YouTube URL reaches the Add button before they reach the question.

That was harmless while the kind was a small icon on the row. Then FILTER CHIPS were built on top of it, and a field nobody maintains became a control that lies: two of the nine items on this church's shelf were filed as "link" and were YouTube videos, so tapping Video hid half the real videos, and the person tapping had no way to tell. I built that filter, which is how a measurement rather than a report found this.

#### an Explorer reads the studies

`tests/an-explorer-reads-the-studies.mjs`

An Explorer reads the studies. Guides, Directors and Executive Directors write them.

THE OWNER'S DECISION, IN THEIR WORDS: "for Explorers they cannot edit what the sample Lesson studies are, only EDs, Directors and Guides can do that... Explorers can only see all of the Lesson studies from the sample and what the guide provided."

THIS NARROWS AN EARLIER INSTRUCTION, DELIBERATELY. `a_study_is_yours_to_change` opened writing to everybody, because the ask at the time was that everybody should keep their own edited copy. The owner has since narrowed it, which is theirs to decide and is the better shape: a study is teaching material, and the people who teach are Guides, Directors and Executive Directors. Somebody being walked with is not preparing the walk.

#### the reading is recorded

`tests/the-reading-is-recorded.mjs`

A study is marked read by the person who read it, and their leaders can see how far they have got.

THE ASK: "Can we add the progress bar that can be recorded by the EDs and Directors if the Explorer is really Reading the Lesson studies from the samples and the Guide made for the Explorer."

THE WORD THAT DECIDED THE DESIGN IS "really". A bar is worth having only if its number is evidence, and there were two easy ways to build one that is not:

#### the ship reads git correctly

`tests/the-ship-reads-git-correctly.mjs`

The shipping script reads `git status` correctly, including the first line.

THE BUG THIS EXISTS FOR, because it is a good one and it nearly went unnoticed.

`scripts/ship.mjs` asks git what changed, then hands those paths to `git add`. It got the list through a helper that trimmed the output -- reasonable for `rev-parse`, wrong here. `git status --porcelain` emits `XY<space>path`, and the status letters are frequently blank: an ordinary unstaged edit is " M path", starting with a SPACE. Trimming the whole output removed that space from the FIRST line only. `slice(3)` then cut one character into the path, and git was handed `ib/build-info.ts`, which matches nothing.

#### a report can carry evidence

`tests/a-report-can-carry-evidence.mjs`

A safeguarding report can carry the thing being reported.

WHAT WAS MISSING. A report held a reason and a paragraph of text. The thing being reported is very often a picture, a screenshot of a conversation, a voice note or a document — and the person holding it on their phone was asked to describe it in words, and a Director then decided on that description alone.

THE AUTHORISATION IS THE POINT, and it is narrower than anything else in this bucket. Lesson handouts and avatars are readable across a church because they are meant to be; evidence is not. It matches `reports_read` exactly — the Directors and Executive Directors of that church — which means, deliberately, that it is kept from the person who raised the report too. There is no "my reports" view anywhere in this app; attaching must not create one.

#### the sign-up can be shown

`tests/the-sign-up-can-be-shown.mjs`

The sign-up screen can be shown to a room, and can create nothing.

WHY THIS EXISTS. The join screen is the one screen nobody could demonstrate: it needs a live one-time link, opening one spends it, and the account it creates is real. So a church deciding whether to adopt this could be shown every screen except the first one anybody actually meets.

`?preview=ds|dm|admin|executive` renders the real form in that role's words. The whole value of it rests on one property — it must be incapable of writing anything — and that property is invisible on screen. A preview that quietly created an account would be far worse than having no preview at all, which is why it is checked here rather than trusted.

#### pinned posts and picked answers

`tests/pinned-posts-and-picked-answers.mjs`

Two small things that both destroy data when done carelessly.

1. GENDER AND STATUS BECAME LISTS. They were open text boxes, and six people had already answered: `Female`, `male`, `M` for one, `Married`, `S` for the other. Five shapes from six people, which is what an open box gets you.

THE DANGER IS THE MIGRATION, NOT THE LIST. A `select` whose value is `M` renders as its FIRST option, so the next time that person saves anything at all their answer silently becomes "Male" — or blank. They were never asked and never told. So the list must carry an unrecognised answer, and that is what `optionsFor` is for and what this checks.

#### a director can open somebody

`tests/a-director-can-open-somebody.mjs`

A Director can open a member, and record a guardian's permission.

TWO GAPS, and the second one is the serious one.

1. THE ROSTER SHOWED A NAME, A ROLE AND A STAGE. Everything the app knows about somebody was collected on sign-up and then only ever shown back to them, so the two questions a person running a church actually asks — "is this a real person I meant to let in?" and "does this pairing make any sense?" — could not be answered from any screen.

2. THE CONSENT WARNING COULD NEVER BE ANSWERED. The guardian columns, the database functions record_guardian_consent and withdraw_guardian_consent, the Directors' roster of minors and the red "MINOR · consent missing" badge were ALL built. No screen ever called the functions. So every Explorer under eighteen sat permanently at "consent missing" with no way to clear it, which is worse than no warning at all: a flag nobody can answer is one everybody learns to scroll past.

#### nobody is stranded without a password

`tests/nobody-is-stranded-without-a-password.mjs`

Being invited must end in a password, or the account is a locked door.

THE SHAPE OF THE PROBLEM. An invitation creates the auth account the moment it is SENT, not when the person arrives. So somebody whose one-time link is spent before they reach the password step has a real account, a real row, a real "has an account" tick on the Director's screen — and no password, and therefore no way in. Twenty-three people were in exactly that state at once: seven Directors, seven Guides, nine Explorers.

The usual cause was the old email order. They followed the install steps first, the installed app opened as a fresh session with no invitation in it, and the link was gone by the time they came back. Reordering the email fixes it going forward and does nothing for anybody already stranded.

#### a pair can be made again

`tests/a-pair-can-be-made-again.mjs`

Two people who were unpaired can be paired again.

THE BUG, REPORTED FROM A PHONE. A Director disconnected two people, tried to pair them again, and got:

duplicate key value violates unique constraint "pairings_ds_id_dm_id_key"

The constraint was UNIQUE (ds_id, dm_id) with no condition, and disconnecting does not delete the row — it archives it, deliberately, so the history of who walked with whom survives. Together those mean the archived row keeps that pair's slot forever: those two people can never be paired again, by anybody.

#### a link can be handed over

`tests/a-link-can-be-handed-over.mjs`

A Director can get the join link instead of emailing it.

WHY THIS EXISTS. An emailed invitation carries a one-time token, and the address it points at spends that token on any fetch. A mail scanner, a corporate filter or a phone drawing a preview opens it first, and the invited person is told their link expired on their very first tap. The templates now avoid that, but templates are pasted into a dashboard by hand, and a church on a demo deadline needs a route that depends on nothing being pasted anywhere. Nothing is emailed on this route, so there is nothing to intercept.

THE RULE IT MUST NOT BREAK. auth.users holds ONE token slot per purpose. Minting a second token overwrites the first, so a link minted AFTER a message has gone kills the link inside that message. Every invitation, every person. This route obeys that by sending nothing at all: one mint, one token, and the Director is told plainly that no email went.

#### Apple says Add, not Install

`tests/apple-says-add-not-install.mjs`

An Apple device is told the words that are on its own menu.

THE ASK: "Do not put Install when it is Safari or the device is made by Apple. Install is too misleading for Apple users."

It was misleading in a specific, expensive way. No Apple menu contains the word Install anywhere. An iPhone and an iPad say Add to Home Screen, in a Share sheet; a Mac says Add to Dock, under File in the menu bar. Somebody told to press Install opens the Share sheet, reads every entry, does not find it, and concludes the app is broken rather than that the instruction was for a different make of computer. The code already knew this and said so in a comment -- "Apple has no programmatic install, so Install now cannot install" -- above a button labelled Install now.

#### feedback reaches the church

`tests/feedback-reaches-the-church.mjs`

Feedback goes somewhere a person will read it.

THE REPORT: "Feedback is not working, I am pretty sure some feedbacks are still stuck in the database since I haven't received any email feedbacks."

Nothing was stuck, and the truth was worse. There was no feedback table, and `setFeedbackSink` was never called ANYWHERE in the app -- so every message went to the default sink in lib/backend/feedback.ts, which honestly saves to the sender's own browser and says so on screen. Every message people wrote is in `hope-beacon.feedback.local` on the phone that wrote it and has never crossed the network. None of it can be recovered centrally, because it was never centrally anywhere.

#### security audit and Guild activity

`tests/security-audit-and-guild-activity.mjs`

The audit room and Guild board are security boundaries, not just screens. Keep their three promises observable from source: audit scope is role based, direct table access is closed, and Guild activity never publishes a roster.

#### linkify safety

`tests/linkify.mjs`

What may become a clickable link, and what must stay text.

This runs against lib/linkify.ts directly, which is why the rules live in a plain TypeScript file with no JSX in it. The component that draws them is not interesting; the decisions are.

THE THING THIS FILE EXISTS TO PREVENT. Linkifying is how an app whose users type at each other grows an XSS hole. Two separate defences have to hold:

1. Nothing ever becomes HTML. The renderer emits React elements and plain strings, and React escapes strings — so markup somebody types is markup the reader sees, not markup the browser runs. That property is enforced by there being no dangerouslySetInnerHTML anywhere near it, which tests/no-backend.js and a grep both cover. 2. Escaping does not make a URL safe. `javascript:alert(1)` is a valid URL and a working attack the moment it lands in an href. That is what the protocol allowlist below is for, and it is the half people forget.

#### minor badge

`tests/minor-badge.mjs`

Who counts as a minor, and what the badge says about them.

THE BUG CLASS THIS EXISTS FOR. A safeguarding mark that is stored rather than computed is right on the day it is set and wrong from the morning of the person's eighteenth birthday, with nothing to announce that it has gone stale. So the rule is tested at the boundary, on both sides and on the day itself, because "roughly eighteen" is not a thing a safeguarding control may be.

node tests/minor-badge.mjs

#### email templates

`tests/email-templates.mjs`

The two rules that made an invitation arrive as a blank message.

These templates are pasted into the Supabase dashboard rather than deployed, so nothing else in this repository ever executes them. That is exactly why they need a check: a mistake here is invisible until somebody reports an empty email, and the person who reports it is a stranger being invited to a church.

RULE 1 — A SHORT LIST OF VARIABLES, AND NEVER {{ .ConfirmationURL }}.

Two separate failures produced this rule, and they pull in opposite directions, so both halves are checked.

#### invite emails

`tests/invite-emails.mjs`

Render all three invitations and look at what comes out.

This composer runs in Deno inside an edge function, so nothing else in this repository ever executes it. That is exactly why it needs a test: a mistake here is invisible until a stranger being invited to a church receives a broken message, and by then the only person who can report it is the person we were trying not to confuse.

It is transpiled and RUN rather than read as text. Checking the source for the string "Explorer" proves nothing about what a recipient sees; three real renders do.

#### the deployed function is the file

`tests/the-deployed-function-is-the-file.mjs`

What runs at Supabase is this directory, byte for byte.

WHY THIS EXISTS, AND IT IS NOT A TIDY-UP.

The invite edge function is the only code in this project that does not reach production through git. Vercel builds the app from `main`; the edge function is deployed by SENDING ITS SOURCE INLINE, as JSON, in a tool call. Nothing about that path is checked by the build, by CI, or by any other file here.

Two separate things have already gone wrong on it, and both were invisible from inside the repository:

#### iPhone install

`tests/ios-install.mjs`

What an iPhone needs before "Add to Home Screen" produces an app.

THE BUG THIS EXISTS FOR, reported as "iPhone and iPad users cannot install the app, in Chrome or in Safari".

`appleWebApp: { capable: true }` in app/layout.tsx no longer emits what its name says. Next emits the STANDARDISED `mobile-web-app-capable`, and Safari has never read that name -- it reads `apple-mobile-web-app-capable` and nothing else. So the built head carried a capable tag that Safari ignores and no capable tag that it honours.

#### plain words

`tests/plain-words.mjs`

The words a member reads, checked for the tells that make copy sound written by a machine.

WHY A TEST AND NOT A STYLE NOTE.

The owner asked twice for the em dashes to go. They went, and then they came back, because every new screen is written by someone (or something) reaching for the same punctuation, and nobody re-greps 22 files before a commit. A convention that is only written down is a convention that decays. This one fails the build instead.

WHAT IT LOOKS AT. Text that can reach a screen: string literals and JSX prose, with comments stripped first. Code comments are internal and may say whatever they need to; a reader of the app never sees them. That distinction is the whole reason this scanner exists rather than a plain `grep -r`.

#### accounts and sessions

`tests/accounts-and-sessions.mjs`

Three promises made to the owner today, each of which is invisible until it is broken in front of a congregation.

1. Deleting an account really frees the email address. 2. A Director can find one person in a list of thirty-seven. 3. Shipping an update does not sign everybody out.

All three are properties of code that only misbehaves against a real database with real people in it, which is exactly the situation where you cannot experiment. So they are checked here, at the level where they can be.

#### studies are formatted

`tests/studies-are-formatted.mjs`

A study is shown the way it was written.

THE BUG THIS EXISTS FOR, reported with a photograph of a real phone.

A study on the shelf read, on screen, exactly this:

**Read:** Mark 2, verses 23 to 28. **Where this comes from:** *The Desire of Ages* has a chapter... free at m.egwwritings.org/en/book/130/toc

Every asterisk printed. The section headings -- the one thing that makes a study skimmable -- were the most damaged part, because they were the part that was marked up. And the address at the end was dead text in the room where an Explorer is being asked to go and read something.

#### the pairing pickers say what they know

`tests/the-pairing-pickers-say-what-they-know.mjs`

The Guide and Explorer pickers never look ready before they are.

THE BUG THIS EXISTS FOR, reported from a Xiaomi phone with a photograph: "I dont see the names when it comes to pairing." The open dropdown held one row, "Choose guide", and nothing else.

The names were all there. Checked against the live database at the time: the church has FORTY-ONE approved Guides, every one of them with a name, and the signed-in Executive Director could read all forty-one under the row policies. Nothing was missing and nothing was hidden.

#### an invited executive can see their church

`tests/an-invited-executive-can-see-their-church.mjs`

An Executive Director who was invited can see the church they were invited to.

REPORTED AS "I dont see the names when it comes to pairing", from a phone and then, when that was not it, from a laptop. The Guide picker opened with one row in it, "Choose guide", and no people.

The people were there: forty-two approved Guides and forty-five approved Explorers. What was missing was the reader's permission to see any of them. Measured by running the real policies as each Executive Director in turn:

#### signing in is joining

`tests/signing-in-is-joining.mjs`

Somebody who has signed in has joined, and keeps the password they are using.

REPORTED TWICE IN ONE BREATH, and both are one column.

"some e-mails are already in the system but still in the re-send mail list, any e-mail that is already part of the Open Sentry Beacon should not be in the re-send mail list."

"once the user clicked and used the account the e-mail password that was sent should remain and can't be changed because that's a resident account already."

#### sharing a resource goes both ways

`tests/sharing-a-resource-goes-both-ways.mjs`

A shared resource reaches the other person, once, in the right card.

REPORTED AS THREE THINGS THAT TURNED OUT TO BE ONE SCREEN AND ONE PICKER:

"both Guide and Explorer can't exchange sources and it bugs out to both of them (like the shared sources for Explorer also appears in its shared sources location which is weird to look and not helpful)"

"when a guide has two or more Explorers and shares resources, the Explorers can't see the sources and share button is broken, sometimes it works most the time it doesn't"

#### the Explorer sees their journey

`tests/the-explorer-sees-their-journey.mjs`

An Explorer can see they are moving, without being told what they are.

THE ASK: "There must be a progressive bar that the Explorers can see too that is aligned with the Journey that the Guide sees, so when the Guide progresses the Explorer, the Explorer can appreciate and affirm that he/she progresses in the Journey with the Guide (no labels yet for the Explorer to see, but a really good animated progress bar can be good to see)."

The Guide has had the journey all along, as six named stages on their own screen. The Explorer had nothing at all: somebody could be moved forward and never know it had happened.

#### a series can say what it is

`tests/a-series-can-say-what-it-is.mjs`

A series can carry the line that explains it, and one page has one name.

TWO REPORTS, ONE CAUSE: a screen that did not say what its boxes and its doors were for.

ONE. "I still can't see the area of interest here", with two screenshots: a series created, the second box typed into, Save pressed, and the row exactly as it was -- while the two seeded series above it each carry a line of their own underneath the title.

Nothing was broken. `lesson_series.description` is that line. It has existed since the table was created, addLessonSeries has accepted one since the day it was written, and the row draws one when it is there. NO FORM EVER OFFERED A BOX TO TYPE IT IN. So the only series carrying that line are the ones that were seeded, and a Guide writing their own could not have it however hard they tried. The box that WAS there is the grouping -- it becomes the heading the series is filed under -- so typing a description into it changed the heading and left the row alone, which is precisely what was reported.

#### a resource is personal until it is shared

`tests/a-resource-is-personal-until-it-is-shared.mjs`

A resource is yours until you hand it to somebody.

REPORTED AS: "Why is it the resources are shared by other guides and Explorers, it should be contained and personal with each other, not a group study" -- and then, exactly: "not a group study by OTHER guides and explorers. If the Guide has multiple explorers, it should be private for those designated explorers."

HALF OF IT WAS ALREADY TRUE, and saying which half is the point of the first two blocks below. A share belongs to ONE pairing and `shares_read` is `in_pairing(pairing_id)`, so a Guide walking with five people hands something to one of them and the other four cannot see it. Explorers never had the church-wide arm of `can_read_material` at all. Nothing leaked between Explorers, then or now.

#### a record that outlives the people in it

`tests/a-record-that-outlives-the-people-in-it.mjs`

The record survives the people leaving, or it is not a record.

ASKED FOR AS: "before you delete, make sure to keep some records of data (dont delete the data, only delete the email please and the accounts of the email)" and "All the activities and important datas needs to be recorded to improve the app".

THE THING THAT MAKES THIS TABLE DIFFERENT FROM EVERY OTHER TABLE. Thirty-seven tables cascade off `profiles`. Deleting an account does not leave its history behind -- it takes the pairings, the prayer requests, the materials, the lessons, the meetings and the journey events with it. A record meant to outlive an account therefore cannot hold a foreign key to one, and the single most valuable check in this file is the one that says it holds none.

#### every room keeps up

`tests/every-room-keeps-up.mjs`

Every room keeps up, and a new one cannot ship without doing so.

REPORTED AS: "I still dont like that most users complain that they need to refresh their browser to get the real time results."

WHAT WAS ALREADY RIGHT, ruled out before anything was added:

The publication. Migration 20260902020000 publishes twenty-four tables with replica identity full.

#### the tutorial still points at something

`tests/the-tutorial-still-points-at-something.mjs`

The tutorial still points at something, and cannot quietly stop.

ASKED FOR AS: "Make sure the tutorial, is always updated."

WHAT GOES WRONG, AND WHY NOTHING CATCHES IT. The guided walk finds each step's subject with `document.querySelector('[data-quest="..."]')`. That string is the only bond between a step and the thing it points at, and NOTHING in the language checks it: rename a tab key, retire a room, and the step compiles, type-checks, ships, and lands its spotlight on nothing. The person following the walk is then stuck on a step that cannot be completed, which reads as "the app is broken" rather than "a marker moved".

#### a person waiting is visible to somebody

`tests/a-person-waiting-is-visible-to-somebody.mjs`

A person waiting for approval is visible to somebody who can approve them.

REPORTED FROM BOTH ENDS AT ONCE, which is the only reason it was findable: a Guide looking at "A Director or Executive Director must approve your account", and in the next window the Executive Director's own screen reading "Awaiting approval 0 - Nobody is waiting."

THE MECHANISM. Sending an invitation creates the account. The CHURCH and the invited role are attached afterwards, by claim_my_pending_invitation(). The join-link flow calls it. Signing in did not -- so anybody who arrived through /login instead of finishing their join link kept a profile with church_id NULL, and every approval list is scoped by church. A church-less profile therefore belongs to nobody and is invisible to every Director alive. The person waits forever, and the only screen that could rescue them truthfully reports that there is nobody to rescue.

#### re-send cannot rebuild a removed account

`tests/re-send-cannot-rebuild-a-removed-account.mjs`

Re-send cannot rebuild somebody a leader removed.

REPORTED FROM THE SCREEN: "I can still see the e-mails that I sent here that should have been disappeared because they where part of the system before and now they are deleted. If the e-mail is part of the system of the app, the re-send should be gone please."

WHY IT IS NOT COSMETIC. Sending an invitation CREATES the account -- supabase/functions/invite: "the account is created here, with a password already on it". So Re-send on a row whose person has been deleted does not resend a message. It rebuilds their account. If they were removed for a safeguarding reason, a button labelled as a retry silently readmits somebody a leader decided to remove, from a row that said "never sent" -- that is, from a row claiming nothing had ever happened.

#### a button cannot hide its own label

`tests/a-button-cannot-hide-its-own-label.mjs`

A button cannot hide its own label.

REPORTED TWICE, the second time with the diagnosis attached without meaning to: "I can't see what's on the box, I can only see it when I tap or hover to click it." That hover IS the proof. The button carried `hover:bg-red-700`, so hovering finally gave its white text a red ground to sit on; at rest the text was white on white and the control was invisible.

WHAT PRODUCED IT. Button composes one class attribute out of the variant's own colours and whatever the caller passes:

#### invite them actually invites them

`tests/invite-them-actually-invites.mjs`

"Invite them" actually invites them.

REPORTED IN THREE MESSAGES, each one a consequence of the last:

"does it automatically send a letter? How come there was no confirm in my mailbox as a Head ED?" -- nothing had been sent, so there was nothing to confirm. "How can I invite if I no longer see the e-mail when I click ok on the recommendation?" -- the click had ALSO hidden the address. "Can we just make this automatic if I click invite them?"

decideRecommendation() wrote a status column and stopped. The row read INVITED, the Guide who put the name forward saw INVITED, and no invitation, no account and no email existed anywhere.

#### leadership the head appoints does not queue

`tests/leadership-the-head-appoints-does-not-queue.mjs`

Leadership the Head Executive Director appoints does not sit in a queue.

ASKED FOR: "Once the head of Executive Director invites there's no need of approval for ED and Directors."

AND THE INCONSISTENCY THE AUDIT FOUND UNDERNEATH IT. handle_new_user already arrived approved for an Explorer and for an Executive Director, and not for a Director. Walked through the live trigger for each role inside a transaction that rolled back:

executive -> approved admin -> NOT approved ds -> approved dm -> NOT approved

#### a private copy is never published

`tests/a-private-copy-is-never-published.mjs`

A Guide's private working copy is never published to the church.

REPORTED AS: "I deleted this in my guide account and yet it's still here being share in the Explorer."

THE DELETE WAS NOT THE BUG. Deleting a series you did not write writes a hidden copy for you rather than removing it, and that worked. What it cannot reach is a DIFFERENT row that is also published.

Editing somebody else's series gives you a private copy. setSeriesPublished publishes any series by id and never asked whether it was one -- so a private copy could go church-wide, where ls_read admits any published series to every Explorer. In the live table that produced three rows with one title: the real original with six studies, an EMPTY published copy of it filed under another topic, and two hidden copies of THAT -- two people in turn deleting a thing neither could remove. The author of the published one had since been removed, so no Guide could manage it at all.

#### an appointment offers what you used before

`tests/an-appointment-offers-what-you-used-before.mjs`

An appointment offers the places and links you have used before.

ASKED FOR AS: "Can we have a drop down of places like Google earth can do for the users, there is a prediction of places while typing... Same with online call, it will have some save files of links so that users can just click it right away."

THE LINK HALF IS EXACTLY THAT. The places half was first deliberately NOT a search service: predictions from one would mean every partial address a Guide types about meeting an Explorer -- sometimes a minor, sometimes at their home -- leaving for a third party AS THEY TYPE.

#### a note read once can be put away

`tests/a-note-read-once-can-be-put-away.mjs`

A note somebody has read once can be put away.

ASKED FOR WITH A SCREENSHOT, both banners ringed in red: "i always need a fullscreen for messages please, make an option to exit or x on the red circles. It takes out the user's experience."

The arithmetic is the argument. On that phone the two notes take roughly a fifth of the glass on EVERY conversation, FOREVER, to say two things that are true once. A promise repeated past the point of being read stops being a promise and becomes furniture.

#### appointments first, the chat in the bubble

`tests/appointments-first-the-chat-in-the-bubble.mjs`

Appointments first on the page; the conversation in the bubble, on both halves of the app and both sides of a pairing.

WHY THIS EXISTS. Asked for on 30 September 2026, with a screenshot of a Guide's Talk tab: "I really think it's time to take out the chat in 'talk' room and rename talk to just appointments. Let's just improve talk to our bubble chat with smooth animations too and smooth UI design in our chat system (including the report system in the bubble chat). It's annoying for the users to scroll down for appointments usually." Then, asked: the same on an Explorer's home ("Yes, same everywhere"), Report visible in the bubble's header rather than in a menu, and the sample app a one-to-one copy.

#### sub-rooms are a drop-down

`tests/sub-rooms-are-a-drop-down.mjs`

Every set of sub-rooms is one drop-down, on every device.

WHY THIS EXISTS. Asked for on 30 September 2026, with a screenshot of a Guide's home and the strip of sub-rooms circled: "I want all sub-rooms to be drop down list or some kind of drop down for users to see all sub-rooms optimally in all devices. I realized users get confused that they need to slide sub-rooms and request a drop down feature instead."

Three things drew a strip: the sub-rooms of a room (RoomTabs), the tabs on one person's page (Tabs), and the sample Admin page's own grid. All three go through components/SubroomMenu.tsx now. A fourth strip written by hand next month would bring the swiping back on one screen, so this names them.

#### the desk is a drawer

`tests/the-desk-is-a-drawer.mjs`

On a phone or a pad the desk is a drawer from the right edge; on a desktop it is the column beside the page it always was.

WHY THIS EXISTS. Asked for on 30 September 2026, with a screenshot of a phone scrolled past the page into My office, On the desk, Pocket and Player: "the mini office (like in the desktop) should not be at the bottom for users to scroll down at least. For mobile and pads can you make it like a side screen where it's only optional to click? Like I'll just click a mini cabinet with an arrow '<<<' to appear on it or swipe it at the corner and it will appear, and it will disappear if I click an arrow '>>>'."

#### explorer profiles can be seen

`tests/explorer-profiles-can-be-seen.mjs`

A Guide, and a Director above them, can see an Explorer's profile and face.

WHY THIS EXISTS. Asked for on 30 September 2026, with a screenshot of a Guide's list of Explorers, every one of them initials in a circle: "I still can't see anyway to see the Explorers profile or their image display for Guides and higher up accounts, please make a way to do it."

Two things were true. The only way into a profile was a tap on a name that nothing announced. And no list a Guide or a Director reads ever drew a photo: the Guide's list did not even ask the database for one.

#### every animation can be stilled

`tests/every-animation-can-be-stilled.mjs`

Every animation in the app stops for somebody who asked for less movement.

WHY THIS EXISTS. Phones, tablets and computers all have a setting for less motion (iOS: Reduce Motion; Android: Remove animations; Windows and macOS have their own). People turn it on because movement on a screen makes them dizzy or sick, or because it distracts. The app promises it: every animation stops, the screens stay the same.

TWO WAYS THAT PROMISE HAS QUIETLY BROKEN HERE BEFORE, and this check holds against both of them for every animation, not just the ones somebody remembered:

#### fixed advisories stay fixed

`tests/fixed-advisories-stay-fixed.mjs`

A security advisory that was fixed stays fixed, and one that was left is left in writing.

WHY. A lockfile can quietly go back to an older version. A merge, a reinstall with an old lock, or a dependency that pins lower can each undo a fix nobody remembers making. And an advisory left open on purpose is only safe while the reason is written down where the next person will look.

This reads the lockfile; it does not ask the network. `npm audit --omit=dev` is still the real check. docs/SECURITY.md, "Known advisories in what the app installs", says what was found and what was done.

#### the deploy guide matches the app

`tests/the-deploy-guide-matches-the-app.mjs`

docs/DEPLOY-ANYWHERE.md describes the app as it is, not as it was.

WHY. A deployment guide is followed literally, by somebody who cannot tell a stale file name from a real one. The first draft of this guide named a migration that exists in a different repository; it read perfectly and pointed at nothing. So every file it names must exist, every setting it names must be the one the code reads, and every scenario must say whether this project has actually run it.

node tests/the-deploy-guide-matches-the-app.mjs

#### a conversation can reply, react and speak

`tests/a-conversation-can-reply-react-and-speak.mjs`

A conversation can reply, react and speak -- and stays exactly as private.

ASKED FOR ON 1 OCTOBER 2026: a chat that feels like the ones people already use, with reactions, replies and voice messages. Each of the three opened a way in that did not exist before, and this check holds the doors shut:

* a reaction is read by the two people in the pairing and written only through react_to(), from a fixed six that the screen and the database agree on; * a reply cannot point outside its conversation, and sending a message writes four columns and no others; * the microphone is allowed for this site only, asked for on a tap, let go when recording stops, and a recording is never sent on its own.

#### a stored path cannot leave its folder

`tests/a-stored-path-cannot-leave-its-folder.mjs`

A file path read from the database never becomes a different request.

Found by the security review of 1 October 2026. The storage library builds `<storage>/object/sign/<bucket>/<path>` from the path exactly as stored, with the sign-in of whoever is looking. Paths are written by other people -- the other person in a conversation, a Guide sharing a resource, a member attaching evidence -- so a path of `../../auth/v1/logout` turned "show this picture" into "sign me out of every device".

This holds three things: 1. lib/live/storage-path.ts lets through every path the app writes and refuses every shape a URL parser reads as more than a name; 2. every signed URL and download in lib/live/data.ts goes through it; 3. the app writes only the path shapes listed here, so a new one is looked at before it ships, and the database holds conversation files to theirs.

#### the chat works before its database update

`tests/the-chat-works-before-its-database-update.mjs`

The chat keeps working on a database that has not had its update yet.

Asked for on 1 October 2026. The owner's own database stays exactly as it is, and the code goes out anyway, so that every fork gets the whole app at once. The same is true of any church that updates its code before running `supabase db push`: the site changes in minutes, the database when somebody gets to it.

So on a database without migration 20261001120000: * the conversation is the words, the photos and the live refresh, as it was -- in particular the messages' live channel never names the reactions table, which that database does not have; * reply, react and voice are simply not offered, rather than offered and refused; * and they switch on by themselves once the database has them.

#### no hidden characters in the code

`tests/no-hidden-characters.mjs`

No file in this repository carries characters a reader cannot see.

"TROJAN SOURCE" (CVE-2021-42574). The characters that reverse the direction of the text after them (U+202A to U+202E, U+2066 to U+2069) make code read differently on screen from how it runs: a comment that seems to end where it does not, a check that seems to be there and is not. Zero-width characters (U+200B to U+200F, U+2060, U+FEFF) hide a difference between two names that look identical. In an open-source project anybody can propose a change, and a reviewer -- human or AI -- reads the screen, not the bytes.

TEXT FOR AN AI THAT NO PERSON CAN SEE (added after the audit of 3 October 2026). Unicode "tag" characters (U+E0000 to U+E007F) mirror plain ASCII and draw as nothing at all, so a sentence written in them is invisible on GitHub and in every editor while an AI tool reading the file still reads it as words. That is a way to slip instructions to a contributor's AI through a pull request a human approved. The variation selectors beyond the emoji ones (U+E0100 to U+E01EF) and the invisible maths operators (U+2061 to U+2064) can carry hidden text the same way. None has any use in this repository. (U+FE0F stays allowed: it is what turns a heart into the red heart emoji.)

#### every dependency is under a licence we can ship

`tests/dependency-licences.mjs`

Every package this app is built from is under a licence we can ship, and its notice ships with the app.

Asked for on 1 October 2026: "Make sure we don't have any issues with our open source project when it comes to other companies." The licence audit of that day found no incompatible licence -- and nothing that would have stopped one arriving with the next `npm install`, and no third-party notice anywhere in the built app. This holds both:

1. AN ALLOWLIST, not a blocklist. Each installed production package's licence must be one this project has looked at and can ship under AGPL-3.0-only. A new kind of licence fails here until a person reads it and adds it, with a reason. 2. THE NOTICES. scripts/third-party-notices.mjs lists every one of those packages with its licence text, runs at every build and dev server, and Settings links what it writes.

#### the research agents only read

`tests/the-research-agents-only-read.mjs`

The research agents in this repository read and report. They never write.

Asked for on 1 October 2026: "make some agents for research and put it on our open source project to improve our app in design and also security. Security will always be the number one priority for safety issues."

An agent definition is an instruction anyone can run with full access to their copy of the code. So the definitions are held to the same standard as the code: they may only read, they keep real people's data out of every prompt and report, the security reviewer says it comes first, and every file they tell an agent to read exists -- the first draft named `lib/safe-link`, which does not, and an agent sent to a file that is not there learns nothing and may invent what it would have said.

#### the guild wall keeps up without naming anybody

`tests/the-guild-wall-keeps-up-without-naming-anybody.mjs`

The Guild wall updates live, and still does not say who wrote what.

WHAT THIS PROTECTS. The wall is PSEUDONYMOUS. `private.list_guild_activity` never returns `author_id`; it computes a label -- 'You', 'A Guide', 'A fellow Explorer' -- and exposes amens as a count, not as `person_id`. A member reads the wall without learning which of the people in their guild wrote which post, or who agreed with it.

Realtime delivers THE ROW, not a function's output. So the obvious way to make this room live -- a read policy on `guild_activity_posts` -- would put `author_id` on the wire and quietly undo all of that. It would also look completely correct in review: the room would update, every existing check would stay green, and nothing would visibly break. The regression would be invisible until somebody worked out they could map every post to a person.

#### a message can be changed or taken back

`tests/a-message-can-be-changed-or-taken-back.mjs`

A message can be changed or taken back, and the record survives both.

THE FAULT THIS SHIPPED WITH, WHICH IS THE REASON FOR MOST OF THE CHECKS.

`messages_mark` is an UPDATE policy that exists so the RECIPIENT can stamp `read_at`. RLS is ROW level: it says nothing about which columns may change, and nothing about being the author. Verified against the live database before any of this was written:

UPDATE by the other person affected 1 row(s)

#### the browser writes only what the app writes

`tests/the-browser-writes-only-what-the-app-writes.mjs`

Two rules that came out of an audit, and the audit came out of one bug.

RULE ONE: A POLICY DECIDES ROWS, A GRANT DECIDES COLUMNS.

`messages_mark` was an UPDATE policy written for read receipts. RLS is ROW level and says nothing about columns, so it also let either person in a pairing rewrite the other's words. Auditing for the same shape found three more, one of which mattered:

prayer_requests a Guide could rewrite their Explorer's own prayer, and flip share_with_church to publish a private request to the whole congregation meetings either party could silently rewrite the time, place and JOINING LINK of a meeting the other had confirmed notifications the whole row, where the app writes read_at lesson_assignments the whole row, where the app writes completed_at

#### talk is a room of its own

`tests/talk-is-a-room-of-its-own.mjs`

The chat is a place you can go, and it took its safeguards with it.

WHY THIS EXISTS. Reported: the chat should not be a card people scroll a page to reach — "most users want always the present chat that doesn't need to scroll down for other features, specially for Explorers", and for Guides it is "their main connection to the Explorers".

THE RISK IN MOVING A CONVERSATION. This app has one rule about the Explorer's conversation that outranks the layout: the way OUT of a relationship lives on the same screen as the relationship. components/live/ExplorerPage.tsx says so in the source — "must not be moved to another one". Giving the conversation its own room is exactly the change that could leave that control behind on the old page, and nothing would error: the new room would simply be a chat with no way to report the person in it.

#### the surface has a scale

`tests/the-surface-has-a-scale.mjs`

The app has one elevation scale, one focus ring, and both are legible.

WHAT THIS IS ABOUT. Asked for: make the UI feel premium. Most of what reads as cheap in an interface is not colour or font choice, it is inconsistency — the same kind of surface drawn three weights apart on three screens — and details that were never finished, of which the focus ring is the usual one.

THE FOCUS RING WAS A MEASURED FAULT, not a matter of taste. It was a single gold outline. Gold on white is 1.84:1 where WCAG asks 3:1 of a focus indicator, so on every white surface in the app — which is nearly all of it — a keyboard user got a ring they could barely see. It is handsome on the navy header and that is presumably where it was judged.

#### nobody can flood a room

`tests/nobody-can-flood-a-room.mjs`

One account cannot write faster than the app allows.

WHY. Nothing in this database limited how fast anybody could write, and there were two costs to that.

HARASSMENT. This app's answer to one person hurting another is the report route and a Director. That is the right answer to what somebody SAYS and no answer at all to four hundred messages in a minute, which is a thing a person can do to somebody they are paired with.

AMPLIFICATION. One insert wakes every screen watching that table and each asks the database to recount. One cheap write becomes N pieces of work, where N is however many people have the app open. The client debounce makes N smaller; only a limit at the write makes it bounded.

#### the shelf can be narrowed

`tests/the-shelf-can-be-narrowed.mjs`

The library can be narrowed by name and by kind, and says what it did.

WHY. The shelf is one list, newest first. At twelve items that is fine; the church is adding roughly one a week and at sixty it is unusable, and the person who suffers first is a Guide hunting for the video they shared once.

Search already existed and covers title, description and address. What was missing was the other question. "Video" typed into a search box reads the WORD video in a title and a description, which is not the same question as "show me the videos" and answers it wrong in both directions -- it misses a video called "Baptism explained" and finds an article about videos.

#### bulk invite list

`tests/bulk-invite.mjs`

Reading a list of people out of a file.

WHY THIS IS TESTED AND THE REST OF THE PANEL IS NOT. Everything else in bulk invitation is a loop over a call that is already covered. This function is the part where a mistake is silent AND expensive: it decides who gets an email, what name greets them, and now WHICH ROLE they are given. A parser that drops a line invites twenty-four of twenty-five and nobody notices the missing one; a parser that keeps a duplicate sends somebody two invitations, which switches off the first and produces exactly the "my link says it expired" report that cost a week earlier; and a parser that reads the role column wrong hands somebody the wrong authority in a church.

#### stay signed in

`tests/stay-signed-in.mjs`

Staying signed in until you sign out.

THE BUG THIS EXISTS FOR: "Your account is not ready. JWT expired."

A Supabase access token lasts ONE HOUR. A refresh token lasts months and is what turns that into staying signed in on a device. Nothing here ever used the refresh token, so every member was signed out an hour after signing in and told their account was not ready, which is not what had happened.

WHY THE CHECK IS ON THE SOURCE. The failure is a timing one: it needs a real token, a real hour and a real Supabase to reproduce, and by the time a browser test could see it the person is already signed out. What can be checked here are the four properties that make the refresh correct, each of which is a way this has gone wrong in real applications.

#### errors are human

`tests/errors-are-human.mjs`

A person is never shown Postgres.

THE BUG THIS EXISTS FOR, on a Guide's own screen, on a phone:

permission denied for table pairings permission denied for function blog_feed

printed in red where the church's pairings and Community Blogs should have been, under that Guide's own name and their reminders. And in a conversation:

mime type application/vnd.openxmlformats-officedocument.wordprocessingml .document is not supported

#### pop-ups on a phone

`tests/overlays-on-a-phone.mjs`

Two rules a browser test in this sandbox CANNOT check.

THE REPORT: "all of the pop ups are not optimize for mobile and pads. No problem with mac and desktop."

That last sentence is the whole diagnosis, and it is why this file exists alongside tests/e2e/panels-fit-portrait.js rather than inside it.

RULE 1: A POP-UP MEASURES ITSELF AGAINST THE VISIBLE SCREEN.

#### icons render everywhere

`tests/glyphs-render-everywhere.mjs`

No character on screen may depend on a font nobody promised.

THE BUG, circled on an Android phone: the sign-out button in the header was an empty box. A tofu box is what a font draws when it has no glyph for a character.

The character was `⏻`, U+23FB POWER SYMBOL, and that is the whole trap: it LOOKS like an emoji and is not one. Emoji have a guaranteed fallback, because every phone ships a colour emoji font covering the emoji set. A symbol from Miscellaneous Technical has no such promise; it is drawn only if the text font happens to carry it. Apple's system font does. Android's Noto Sans does not. So it was correct on the iPhone it was written on, correct on the Mac it was reviewed on, and a blank box for every Android user in the church.

#### meeting links

`tests/meeting-links.mjs`

The way in to a meeting is one tap, and only ever to somewhere safe.

THE GAP: an online meeting had nowhere to put the link to join it. Migration 0009 describes `location` as "a place for in person, or a joining address for online" -- one field, on purpose. The write path then threw the value away whenever the meeting was online, so the half the schema described was never reachable, and two people who had just agreed a Zoom call still had to send the address to each other in a message.

WHY THIS IS A TEST AND NOT JUST A FEATURE. Anything that turns text somebody typed into an href is an injection surface. `javascript:alert(1)` is a valid URL and runs on click. `https://zoom.us@evil.example/j/1` is a valid URL that goes to evil.example, while a human reads the trustworthy name on the left -- and this field is filled in by a Guide and tapped by the Explorer they walk with, which is inside this app's threat model rather than outside it.

#### told on arrival

`tests/notified-on-arrival.mjs`

Somebody who signs in with things waiting is told.

THE ASK: "make sure the notification notified the user once the user logs in or goes online when the user have notifications."

It did not. The bell announced things that arrived WHILE somebody was already looking at the app, and deliberately said nothing on the first poll — which IS the sign-in moment, because the bell only mounts inside the signed-in shell. So the case that most needs a pop-up, opening the app to find a safeguarding report waiting, was the one case that never produced one.

#### destructive is discouraged

`tests/destructive-is-discouraged.mjs`

The most damaging button on a screen is never the most inviting one.

THE REPORT, from a Director's pairings screen: "I dont like that the size of Disconnect is bigger than Connect... We discourage Directors and EDs to delete and disconnect people but it's a second option just in case something bad happens only."

Disconnecting two people, or removing somebody from the church, is something a Director must be able to do and should almost never want to. It was drawn as an ordinary `ghost` button: same height, same weight, same everything as the controls around it, which is precisely how a screen says "this action is routine". Four other places had already noticed and patched a red TEXT colour on top of a ghost button, which made them red and left them full size.

#### the Guide is a person

`tests/the-guide-is-a-person.mjs`

An Explorer must be able to see that their Guide is a real person.

THE REPORT: "Explorer must see the Guide's profile and image please so that the explorer is aware of the Guide is not a robot but a real person."

The Explorer's home screen said "Walking with you" and then a name on a line. Everything else on that screen is generated — the greeting, the stages, the notifications — so a name in the same typeface as the rest of it is not evidence of anybody. The whole product rests on the Explorer believing a person is reading what they write.

#### a way out of the guild room

`tests/a-way-out-of-the-guild-room.mjs`

The one room where somebody can be hurt by a stranger and say nothing.

The Guild board lets a Guide or an Explorer put a thousand characters in front of a group. Checked against the live database on the day it shipped:

* a Director could not read the board at all; * no one but the author could remove anything from it; * there was no way for a member to say a post was wrong.

Explorers are in these guilds and some Explorers are minors — this app has a guardian-consent table and a badge for exactly that reason. Every other place in Beacon where one person can be hurt by another carries the same three things: a way to report it, somebody whose job it is to look, and a record that outlives the person it describes.

#### the guild room is archived, not deleted

`tests/the-guild-room-is-archived-not-deleted.mjs`

The Guild Room is put away, and nothing in it was thrown out.

WHY THIS EXISTS. "Take out the Guild Room feature, archive it for now since most users dont like it."

Archiving and deleting look identical from the navigation bar and could not be more different underneath, so this asserts both halves. The doors are gone -- that is the request. The room's contents, and above all the ability to act on a report about something said in it, are not -- that is the part that would have been an accident nobody noticed until it mattered.

#### rooms and subrooms

`tests/rooms-and-subrooms.mjs`

A room with subrooms, and every panel inside exactly one of them.

THE REPORT, with a drawing: rooms are main folders and subrooms are folders inside them. "I want the Office room to have subrooms for the user not to scroll down to look for their tool equipment... If I pick the Lesson studies subroom, I will automatically go there and create my own Lesson studies, not scroll down and find it."

The Office was nine panels stacked down one page. A Guide who came here to write a study walked past their numbers, the shelf, two pairing cards and a recommendation form to reach it, every time.

#### one loading screen

`tests/one-loading-screen.mjs`

One loading screen, and it is the one that was designed.

THE REPORT: "I want the same Loading screen of the Local church project to the Open Sentry Beacon."

The reason the two looked different was not styling. This repository had THREE waiting states and showed the plainest one:

1. `BeaconSplash` in components/BeaconLoader.tsx, the designed one, which nothing in the repository ever rendered; 2. `LiveLoading`, a second full-screen loader defined inside the live shell, flat navy with a hardcoded sentence, which is what people saw; 3. `BeaconSpinner`, the inline one, which is a different job and is fine.

#### the library is shared and watched

`tests/the-library-is-shared-and-watched.mjs`

The library nobody could add to, and the record that makes it safe to open.

THE REPORT was a screenshot: "You do not have permission to do that. If that seems wrong, ask your Director." Nothing was wrong with anybody's permission. Proved against the live database and rolled back:

insert into materials (...) returning id -> refused, "new row violates row-level security policy" the same insert with no returning clause -> allowed

The app saves the row and asks for its id back in one statement, so the database applies the READ rule to the row it is about to hand back, and that rule looked the material up BY ID on a snapshot from before it existed.

#### data protection

`tests/data-protection.mjs`

The promises a privacy notice makes have to be true in the code.

A notice is the easiest document in a product to let drift, because nothing breaks when it does. It says photographs are stripped of location; if somebody removes the line that does that, the notice becomes a false statement to a regulator rather than a stale comment.

WHY ANY OF THIS EXISTS. Under the Philippine Data Privacy Act (RA 10173, §3(l)) a person's age, marital status and religious affiliation are SENSITIVE personal information. This app records a birthday, a life status, and the whole of somebody's participation in a church, so every row in it is sensitive whether the column looks it or not. docs/DATA-PROTECTION.md is the map; this file holds the handful of claims that are the code's job to keep.

#### my own data

`tests/my-own-data.mjs`

"Send me everything you have about me."

RA 10173 §16(c) and GDPR Art. 15 both give a person the right to a copy of their own personal data, and Art. 20 adds that it has to arrive in a form they could carry somewhere else. Until this existed the app had no answer, which docs/DATA-PROTECTION.md listed as the largest gap engineering could close on its own.

THE ONE PROPERTY THIS FILE EXISTS TO PROTECT:

THE EXPORT RUNS AS THE PERSON ASKING, THROUGH THE ORDINARY RULES.

#### a picture looks like a picture

`tests/a-picture-looks-like-a-picture.mjs`

A photograph in a conversation is shown, not named.

THE REPORT, with a screenshot of a photo rendered as a blue underlined filename: "I should see the image or video in my chat, not the document file please."

THE PART WORTH RECORDING is that the sample side had done this correctly for months. components/Attachment.tsx draws an image as an image, an audio file as a player and a video as a video; the live conversation drew all three as a paperclip and a filename. So somebody learned the app in the tutorial, signed in, sent their Guide a photograph, and got `20260901_110714.jpg`.

#### printed docs render

`tests/printed-docs-render.mjs`

A document that is printed and handed to somebody has to render.

THE BUG THIS EXISTS FOR. The PDF builder ran its inline pass over the FIRST LINE of a list item and no further, so a bold phrase that wrapped inside a bullet came out with its asterisks still in it:

... and choose **Pause project**.

in print, in a document whose whole purpose is that somebody reads it and does what it says. Paragraphs had been joined before the inline pass for as long as the builder has existed; list items had not, and the handbook happens never to wrap a bold phrase inside a bullet, so nothing caught it. Two newer documents did, and both went out looking like that.

#### themes are readable

`tests/themes-are-readable.mjs`

A theme has to be readable, and it has to be applied.

THE BUG THIS EXISTS FOR: choosing "Slate" made the whole left column vanish.

The left navigation draws its labels in theme.ink and has NO surface of its own; it trusts the page behind it to be theme.bg. The live shell painted a hard-coded light grey instead and themed only the rails, so Slate's near-white ink landed on a near-white page. The right rail looked perfect throughout, because it paints theme.panel behind itself, which is exactly why this was reported as "themes are not working" rather than as one missing line.

#### migrations apply cleanly

`tests/migrations-apply-cleanly.mjs`

Will these migrations survive being applied to a real, fresh database?

WHY THIS EXISTS. Setting up a church is the one moment when every migration runs in order against an empty schema, and it is the moment nobody is watching a test suite. A migration that only works the first time, or that calls something the next file creates, fails there -- halfway through, on somebody else's evening, leaving a half-applied schema which is the worst place to be standing.

Two failures this catches, both found by running it:

#### live header fits a phone

`tests/live-header-fits.mjs`

The signed-in header has to fit on a phone, and there has to be a way home.

WHY THIS IS A SOURCE TEST AND NOT A BROWSER ONE. Every other layout check in this project renders the real page. This one cannot: the live shell only exists behind a Supabase session, and the sandbox these run in cannot reach Supabase at all. A browser test would have to sign in, so it would either be skipped or -- worse -- pass by rendering the login screen and finding nothing wrong with it.

So this asserts the structure that the bug was made of. An iOS user reported a tall empty strip down the right of every screen. That strip was the page being wider than the phone: the header packed the logo, five 44px section icons, a mode switch, a bell, an install chip, an avatar and a "Sign out" button into ONE non-wrapping row where nearly everything was `shrink-0`. At 390px that row needs roughly 600px, so it ran off the side and took the document's width with it.

#### live conversations fit phones and tablets

`tests/live-conversation-mobile.mjs`

The composer is on the screen, on a phone.

THE BUG, photographed on an Android phone: a Guide opened a conversation with their Explorer and the screen ended mid-sentence, on the line about photo sizes. The box to type in and the Send button were below the glass, and dragging did not bring them up: the thread fills nearly the whole screen and `overscroll-contain` stops a drag inside it from scrolling the page, which is correct and left nowhere to pull.

WHY THE OLD VERSION OF THIS FILE PASSED THROUGHOUT. It asserted that certain class names appeared in the source. Class names are not geometry, so it went green for a card that did not fit, and worse, one of the things it checked for was an attribute that never reached the DOM at all: `Card` takes a fixed prop list, a JSX attribute with a dash in its name is exempt from excess property checking, and `data-live-conversation` was therefore accepted by the compiler and dropped on the floor. Every rule written against that selector matched nothing.

#### the presentation screens are connected

`tests/presentation-feature-ui.mjs`

The presentation-inspired screens must remain connected to the existing feature paths. These guards deliberately check behaviour hooks, not colours: a clean card that cannot open, share, send, schedule, or request is a mock.

#### workflow files

`tests/workflows.mjs`

GitHub Actions workflow files, checked for the mistakes YAML cannot catch.

This exists because of one that got through. `keep-warm.yml` gave a `uses: actions/github-script@v7` step a `run:` block with JavaScript in it. That is perfectly valid YAML — it parsed cleanly with a YAML library, which is exactly what I checked — and it is an invalid WORKFLOW: a step either uses an action or runs a shell command, never both. GitHub rejected the whole file and the workflow never ran once.

The failure is quiet in a specific way worth knowing. A rejected workflow shows up in the Actions tab named by its PATH rather than by its `name:`, attributed to whichever push introduced it, and the rest of CI goes green around it. So "CI passed" and "this workflow has never executed" are comfortably true at the same time.

#### the lockfile can install

`tests/the-lockfile-can-install.mjs`

package.json and package-lock.json agree, so `npm ci` can start.

THIS IS tests/workflows.mjs ONE LEVEL DOWN, and it is here because the same class of failure got through a second time. That check exists because a workflow file was rejected by GitHub and never executed while the Actions tab stayed green. This one exists because a workflow that DID execute died on its first step, and the step that runs the gate was skipped.

What happened: a commit added `esbuild` to package.json's devDependencies and did not update package-lock.json. `npm install` does not care -- it fixes the lock as it goes, which is why every local run kept passing. `npm ci` refuses, by design: its whole promise is that it installs the lock exactly, so a lock that disagrees with the manifest is an error rather than something to repair. Both CI workflows that build this project start with `npm ci`.

#### a room can become a vault

`tests/a-room-can-become-a-vault.mjs`

The study room turns into an Obsidian vault, and a vault turns back into it.

The names, the front matter and the zip are decided in lib/study/obsidian.ts and can be checked without a browser, which is why they live there. Turning a page's BLOCKS into Markdown is BlockSuite's job and needs a live editor; that half is walked in tests/e2e/.

THE ZIP IS CHECKED AGAINST A REAL `unzip`, AND THAT IS THE POINT OF THIS FILE. A zip container written by hand is exactly the kind of thing that round-trips perfectly through its own reader and cannot be opened by anything else -- the reader and the writer agree on the same mistake. Info- ZIP and Python's zipfile have no such loyalty, so both are asked.

#### a Sabbath program is a Word file

`tests/a-sabbath-program-is-a-word-file.mjs`

The Sabbath program: its template, its dates, what it keeps, and a Word file that Word will open.

Asked for on 2 October 2026: Guides and every rank above them can make their own Sabbath program in the Office and download it "to words or docs". The owner chose to keep programs on the device, and to start from four parts: Sabbath School, the Divine Service, the afternoon program and sunset vespers.

THE FILE IS CHECKED BY THINGS THAT ARE NOT OURS. A Word file written by hand is exactly the kind of thing that reads back perfectly through its own code and is refused by Word, so:

#### evangelistic meetings are yours to shape

`tests/evangelistic-meetings-are-yours-to-shape.mjs`

Evangelistic meetings: a series a church shapes its own way, kept on the device, taken away as a Word file or a picture, and shared as a post that never carries the team's own blocks.

Asked for on 2 October 2026: "Make sure Evangelistic Meetings are super customizable, unlike Sabbath program it has a template that can put input, but for EMs users can have much more freedom to customise their meeting." The owner chose four freedoms (blocks, a list's own columns, many nights, the meeting's own look), kept on the device and shared as posts, for Guides and above.

#### a progress report counts what happened

`tests/a-progress-report-counts-what-happened.mjs`

The progress report counts what happened, for the right people, in the right period, and names who needs somebody to look.

Asked for on 2 October 2026: a progress report for Guides and higher up accounts, in the Office with the Reports subroom, integrated with how Explorers are progressing, in the shape of an Adventist teacher's report.

node tests/a-progress-report-counts-what-happened.mjs

#### the Office follows you: devices, folders, calendars

`tests/the-office-follows-you.mjs`

The Office's own documents follow their owner to every device, stay in the folders they were put in, and go onto a calendar.

Asked for on 2 October 2026: "Both Sabbath school and evangelistic meetings can have multiple storage files place in the sub-room to be organize and there can be an option to put it automatically on their digital calendars", and "make sure it's on device first, but ALSO it's transparent to go to other devices that is login".

node tests/the-office-follows-you.mjs

#### the Classic look stays as it is

`tests/the-classic-look-stays.mjs`

Classic, the app's look as it is, stays exactly as it is while other looks are added beside it.

ASKED FOR on 3 October 2026: "I want the current UI to be called "classic" in the settings right now, ChatGPT or Codex will introduce new theme UI that users can pick, but make sure the classic UI remains the same please."

What keeps Classic the same is a rule about where a look's styles may live, so that is what this checks (lib/ui-themes.ts says the rule in full):

#### a suspension is immediate

`tests/a-suspension-is-immediate.mjs`

A suspended account is refused on its very next request.

WHY THIS EXISTS. Suspension used to delete a person's sessions and ban their login, and a migration said that put somebody already signed in "out immediately". It did not: the data API checks a token's signature and expiry and never consults the sessions table, so a token issued before the suspension kept working until it lapsed. And for that time nothing noticed, because "approved" never meant "not suspended". Proven on the live database, in a transaction that was discarded: a Director marked suspended still passed is_admin() and is_approved_user(), and discipline_check() still said 'ok' to suspending an Explorer.

#### a door compares the right things

`tests/a-door-compares-the-right-things.mjs`

No rule in the database compares a column with itself.

WHY THIS EXISTS. Inside a subquery an unqualified column name binds to the NEAREST relation that has a column of that name, not to the row the rule is about. So

exists (select 1 from public.trial_parties tp where tp.trial_id = trial_id)

reads as "a party to this hearing" and means "a party to any hearing": `trial_id` is tp.trial_id. It is valid SQL and nothing warns. Two live policies had exactly this shape (see supabase/migrations/20260923180000_a_door_ compares_the_right_things.sql); one of them gave a voice in every hearing a person could see to anybody called to one.

#### prayer runs both ways

`tests/prayer-runs-both-ways.mjs`

Prayer runs both ways, and every door it opens is the narrow one.

WHAT THIS HOLDS. A Guide can ask the Explorers they walk with to pray for them, and an Explorer can answer "I am praying for this", exactly as it has always worked the other way round (supabase/migrations/20260924100000_a_ guide_can_ask_for_prayer_too.sql). A request is somebody's words arriving on somebody else's screen, so the rules that make that safe are checked here rather than trusted:

WHO READS the author; the one Explorer a Guide's request was written to, while they walk together; a Guide reading their Explorers' OWN requests. Not a second Guide, not another Explorer. WHO WRITES the author is the session -- the browser cannot name it, set a status, or say who is praying. A Guide asks only an Explorer they walk with, and never onto the church wall. WHO CHANGES the other side may move open -> praying and nothing else; only the author withdraws. WHO IS TOLD whoever asked, when somebody prays; the other side, when somebody asks. Never with the prayer's words, which would appear on a locked phone. A WAY OUT whoever a request was written TO can report it, from the request, and the words are copied into the report.

#### a church can install it either way

`tests/a-church-can-install-it-either-way.mjs`

A church can install the database either way, and gets the same one.

THE TWO WAYS. docs/START-HERE.md gives a church one command, `npx supabase db push`, which runs every migration and remembers which it ran, so the same command later installs only what is new. It also gives the manual way: every file, in order, with psql or the SQL Editor. A church following either -- with an AI helping or not -- must end up with the database the first church runs.

WHAT CAN QUIETLY BREAK THAT, all found on 24 September 2026:

#### resources and studies stay simple

`tests/resources-and-studies-stay-simple.mjs`

Resources and lesson studies stay simple enough to use without training.

WHY. On 25 September 2026 the owner said of these screens: "I dont really like the complication UI of the resources and lesson studies. As much as possible I want it more simple for users to do their job than being technical." Rendered with sample data on a phone, the reason was plain:

* every resource carried five controls under its title -- share, share outside, a church-shelf lozenge, edit, remove -- so four resources filled three screens, above a raw web address and a 70-word note about storage; * adding one asked for a "Kind" from a dropdown the address already answers; * the studies card opened on three empty boxes for starting a series, and every series carried Rename, Unpublish and a red Delete -- which deleted the series and every study in it on ONE tap, with nothing asking; * a Guide on one Explorer's Lessons tab got the whole writing desk, and an Explorer's Study folder opened on a form with their studies at the bottom.

#### a resource can be a file

`tests/a-resource-can-be-a-file.mjs`

A resource can be a file: dragged in, kept by the church, sent, and deleted.

WHY. On 25 September 2026 the owner said: "I cant even upload files in the resources but I can do that in the Library for all users ... files must be drag and drop please, and easy to share for all users ... Easy to add, easy to delete."

The library was links only, on purpose, and the reason was cost: a start-up on a free plan pays for every megabyte. So this file holds the two halves of the answer together -- that it is EASY (a drop box, a whole card that takes a drop, Send and Delete on the row) and that it is SAFE and COSTED (the church's existing 10 MB bucket, no video, nobody able to borrow somebody else's file, and the file gone when its resource is).

#### photos lose their location

`tests/photos-lose-their-location.mjs`

A photograph that says where it was taken never goes out saying so.

WHY. The privacy notice promises that "the location your camera recorded in it is removed" before a photo is stored. shrink-image.ts kept that promise only for photos worth shrinking -- over 400 KB -- and sent anything smaller untouched, GPS block and all. On 25 September 2026, while Resources and study handouts were opened to files and the owner asked for policy and security to be kept consistent, both of those uploads were also found to skip the shrinker entirely.

This runs the reader in lib/live/photo-location.ts on JPEGs built byte by byte here -- with and without a GPS block, in both byte orders, with the coordinates in XMP instead, and broken ones -- and then checks the shrinker and both new uploads use it.

#### what one person can upload

`tests/what-one-person-can-upload.mjs`

What one person can put in the church's storage, and who may put study handouts there.

WHY. On 25 September 2026 Resources were opened to files for every Guide and Explorer, and the owner asked for the app's policy and security to be kept consistent and safe. Two gaps were found and closed in supabase/migrations/20260925120000_what_one_person_can_upload.sql:

* nothing limited HOW MUCH one account could upload -- only the size of each file -- so one stolen password could fill the church's storage; * anybody signed in could upload study-handout FILES, although only Guides and leaders may write studies.

#### nobody promotes themselves

`tests/nobody-promotes-themselves.mjs`

Nobody can make themselves an admin, approve themselves, or move church.

WHY THIS FILE EXISTS. The rule that stops it has been in the database since the first migration -- the `lock_privileged_profile_columns` trigger -- and on 25 September 2026 it was proven again on the live database (an Explorer setting their own role to admin: refused, 42501; an unapproved account approving itself: refused, and still unapproved; both in a transaction that was discarded). But no test held it. A later migration could have dropped the trigger, or rewritten the function without the check, and every one of the nearly two hundred checks in the gate would still have passed.

#### place search

`tests/place-search.mjs`

Where to meet: type part of a name, see which place it is, tap it to pin it.

ASKED FOR, 26 September 2026: "I can't see my destination if it's really going to be that destination unless I already input the destination. I need to see the destination name, like auto name in google search, then just click or tap it to secure the location. Can we improve the appointments better please, specially the meet ups."

This file runs the real code against two real answers from the place search (tests/fixtures/photon-*.json, saved from the service on that day; place data © OpenStreetMap contributors, ODbL). It holds three promises:

#### a folder does not say whose church

`tests/a-folder-does-not-say-whose-church.mjs`

A stored file's folder does not tell a stranger which church its owner is in.

Found in the audit of 27 September 2026: `public.uploader_church(folder)` answered "which church is this person in?" for anybody's id, to any signed-in member, because it is callable on its own as well as from the storage rules. 20260927100000_a_folder_does_not_say_whose_church.sql makes it answer only with a church the caller could already see into or leads.

That change is safe for the storage rules ONLY because every rule uses the function inside can_access_church(...) or manages_church(...): both say no to nothing, so returning nothing to an outsider changes no rule's decision. This file holds both halves -- the guard in the function, and the wrapping in every rule -- because either alone would let the other quietly break.

#### the tutorial ring keeps up

`tests/the-tutorial-ring-keeps-up.mjs`

The tutorial's ring travels with the page, and never restarts a scroll.

WHAT WENT WRONG, and only on Safari. The WebKit job failed quest-roles, tutorial-repeat and tutorial-tut2 on every run from 239 to 246, and not the same ones each time. The logs showed the ring pointing at nothing, or at the church link in the header, while the step wanted an Explorer's card or a tab.

The cause was in components/Quest.tsx, not in the tests. `measure` runs on every scroll event. It started a smooth scroll to bring the target into place, and then, on each scroll event of that same scroll, found the target "not in place yet" and asked for the scroll again -- returning before it moved the ring. Chromium folds a repeated smooth scroll into the running one; WebKit abandons it and starts again from wherever the page is. So on Safari the page crawled and the ring waited at the target's OLD position, over whatever had scrolled underneath it. A third path slid a tab into view inside the sideways room strip with one latched `scrollIntoView`, which WebKit did not always honour, and never tried again.

#### a study takes files anywhere

`tests/a-study-takes-files-anywhere.mjs`

A study takes a dropped file anywhere on it, new or being edited, and a file dropped where nothing takes files is never opened in place of the app.

Asked for on 28 September 2026: "for lesson studies make sure if you make a new lesson, you can put attached files or drag and drop it even if you edit."

Every way of writing a study already had a small box for files. The trap was around it: a handout let go over the words of the study, a few pixels from the box, was opened by the browser itself -- the tab left the app, and the study being written went with it. So the whole study now takes the drop, in all three places a study is written, and a window-wide guard catches any file that lands where nothing takes files.

#### a study can have a drawing

`tests/a-study-can-have-a-drawing.mjs`

A study can have a drawing, and the drawing board costs nothing until it is used, asks nothing of anybody else's server, and carries nothing but the picture.

Asked for on 28 September 2026: "Make sure studies feature has Excalidraw on it's tools please, and make sure it works." tests/e2e/a-study-can-have-a- drawing.js is the "it works": a real board, a real drag, the drawing read back out of the saved picture. This file holds the rules around it that a walk cannot see.

node tests/a-study-can-have-a-drawing.mjs

#### an invitation password runs out

`tests/an-invitation-password-runs-out.mjs`

The password an invitation e-mails runs out after seven days, choosing a password signs out every other device, and none of it depends on the code being secret.

Asked on 29 September 2026: "If access to user's password is changed, can I still access the account in the invitation letter? Hackers might exploit that system in the long run if they saw the code in the open source code. We must find a better security system where the user is in control with it's data and password security even if everyone can the the open source code and systems."

The migration was run against the live database in a transaction that was thrown away, with two made-up accounts: the letter's password stopped working and its devices were signed out; a password chosen by the person was left exactly as it was. This file holds the rules that made that true.

#### an ended session ends at once

`tests/an-ended-session-ends-at-once.mjs`

A session ended elsewhere is refused at once, not an hour later.

Asked on 29 September 2026: "Improve what can be improved." The last open gap under "What is not protected" in docs/SECURITY.md was this one: signing out everywhere else, choosing a password, or an invitation's week running out ended the session on the server, but the pass a device already held kept working for up to an hour.

The migration was run against the live database in a transaction that was thrown away: a live session was let through and saw its church; the same person with an ended session was refused with PT401 and saw nothing; a token without a session id and the signed-out role were let through. The first run also showed the signed-out role REFUSED, because replacing a function in `public` fires lock_new_functions; the grant this file checks for is why.

#### the toolkit is opt-in

`tests/the-toolkit-is-opt-in.mjs`

The agent toolkit is vetted, pinned, and switched on by nobody but the developer who wants it.

Asked for on 29 September 2026, with a list of thirty Claude Code add-ons: "Put this in our system please. Dont repeat the tools that we have now. As much as possible this settup is available in our Open source project so that migration will be easy for all developers." And with it the standing rule: "We dont want rouge people or smart AI to ruin our Open source project."

Several of those tools run code by themselves on every session. A public repository that switched them on for whoever cloned it would be making that choice for strangers, so this file holds the line: a list anybody can read and install from, and nothing that installs itself.

#### the bottom bar

`tests/the-bottom-bar.mjs`

Menu | People | My Files, along the bottom of every phone and pad.

Asked for on 30 September 2026, with a sketch: "Can we have Menu | People | My Files as our bottom for our UI to make it simple in our Mobile and Pad?"

What this holds, in the order a person meets it: 1. Where each tab goes, and which tab is lit, run rather than read (lib/tab-bar.ts has no React in it for exactly this). 2. People opens each role's own home on its people, and the home table it uses is the same one sign-in uses. 3. The bar is on every screen that has the app's navigation: both shells and My Files, which runs outside them. 4. The page makes room for it, and everything that floats over the bottom of a phone stands on top of it rather than behind it. 5. The tutorial can still reach Home on a phone, through the Menu. 6. The header stays short: brand and person, no rooms.

#### text size is tried first

`tests/text-size-is-tried-first.mjs`

Text size is tried in the preview first; only Apply changes the app.

The owner, 3 October 2026: "text size should be tested and see first before applying, there should be an apply button for text size". The browser half is tests/e2e/text-size-is-tried-first.js.

node tests/text-size-is-tried-first.mjs

#### offline says offline

`tests/offline-says-offline.mjs`

When there is no signal, the badge says "Offline" and promises nothing.

The owner, 3 October 2026: "Just put offline for text, 'Everything still works here' is very misleading". Anything involving other people needs the network, so a badge that says everything works is wrong when it matters.

node tests/offline-says-offline.mjs

#### blog and announcements are home

`tests/blog-and-announcements-are-home.mjs`

Blog and Announcements are Home's folders, and there is no Publish room.

The owner, 3 October 2026: "will now be a sub room for home so people can write and publish in home page right away, make it simple with advance settings too", "take out publish in rooms since it is a sub room of home now", "Blog and announcement will be the sub rooms of home, so basically we will take out publish". The sample half is walked in tests/e2e/blog.js; the live half needs a database, so it is held here.

node tests/blog-and-announcements-are-home.mjs

#### signing out ends the session

`tests/signing-out-ends-the-session.mjs`

Signing out ends the session on the server, not only this device's copy.

Found by the security audit of 3 October 2026: "Sign out" deleted the session from the browser and told nobody, so a copy taken before the button was pressed kept working. lib/supabase/client.ts endBrowserSession now tells the sign-in server first, for this session only, and forgets it on the device whatever the network does.

The real module is bundled and run against a stand-in browser: storage, a clock and a fetch that records what it was asked.

#### room colours keep the look's light

`tests/room-colours-keep-the-look-light.mjs`

The room's colours work under every look, and never make it harder to read.

Asked for on 4 October 2026: "This colors doesnt work for other Themes in settings, please integrate it too". Under Beacon, Study and Focus the look painted over the palette, so the desk's colour swatches did nothing. lib/room-theme.ts now gives each look the palettes in that look's own light: every colour has the brightness of the look's own and the palette's hue.

WHY THE BRIGHTNESS IS KEPT. A look's stylesheet also paints colours of its own, chosen for its own light or dark: Focus's pale red for a warning, the gold badges. Put on as they are, a cream palette under Focus left that red at 1.5:1, and Slate under Beacon left grey on grey at 1.1:1. So this checks the arithmetic for every look against every palette, the pairings each look relies on, and that a look added later has colours the arithmetic can read. The browser half is tests/e2e/room-colours-in-every-look.js.

#### text and ground change together

`tests/text-and-ground-change-together.mjs`

A light background and the text on it change together, or not at all.

Found on 4 October 2026, measuring every look's own colours: under Focus, the Settings buttons "What's new", "Send feedback" and "Share Beacon", and the "Which Beacon is this" box, read at 1.1:1. Each set its white ground INLINE (style={{ backgroundColor: '#fff' }}), which no look can reach, and its text with a CLASS (text-navy, text-gray-500), which every look recolours. Focus turned the text pale and left the ground white.

The rule: an element that sets a light background inline must set its text colour inline too, so the pair stays a pair; or set both with classes, so the looks recolour both. This finds the half-and-half ones in every component and page.

#### the walks say what they saw

`tests/the-walks-say-what-they-saw.mjs`

A browser walk that fails says, in words, what the browser saw.

WHY. The Safari walks run on a Mac in CI and kept only screenshots when one failed, uploaded as an artifact that nobody working in a sandbox can open. For a week an Explorer's page failed to open on WebKit, and the log said which check went red and nothing about why.

tests/e2e/_playwright.js now watches every page a walk opens, through the one place every walk gets its browser, and prints the last things it saw (pages, what the page threw, console errors, failed requests) when the walk exits with a failure. Proven by hand on 30 September 2026 with a walk that failed on purpose after a thrown error and a refused request: the log named both. This holds the wiring, so it cannot quietly come undone.

#### a walk forgives only what it cut short

`tests/a-walk-forgives-only-what-it-cut-short.mjs`

A walk forgives a request only when its own next page load cut it short.

WHY. About 1.5 seconds after every page load the app checks for a new release (/version.json, then the browser's re-check of /sw.js). A walk that moves to its next page at that moment cancels both; WebKit reports each as "Cannot load ... due to access control checks", and Playwright calls it a page error. That failed fresh-looks on three of five Safari runs (3 and 4 October 2026). tests/e2e/_playwright.js has the rule, pageErrors().

Only WebKit produces the message, so this drives the rule with a pretend page and a pretend clock instead of a browser.

#### screens open without a hitch

`tests/screens-open-without-a-hitch.mjs`

Screens open without a hitch: no needless work in the frame a screen opens.

WHY. The owner, 4 October 2026: "can we even make our UI animations smoother please". The animations themselves were already cheap (they move only transform and opacity). The hitches were the app's own work, measured on a processor slowed 4x to stand in for a phone, in the frame where a screen slides in:

- the header and the tab bar forcing a page layout to measure themselves (held by tests/the-bottom-bar.mjs, with lib/published-height.ts); - the message box measuring itself while still empty, as a conversation opens with every message in it new on the page; - a new date formatter built for every time label in a thread; - the tab bar blurring what scrolls under it in the three looks whose bar is solid, where the blur cannot be seen.

#### the music room

`tests/the-music-room.mjs`

The Music room: a tuner, a conductor's metronome, a page scanner and a score to practise from, for music lovers and the choir.

Asked for on 4 October 2026: "Can we create another room for music for music lovers and choir, Put the main Audio tools to it, take out the audio tools from the library (unless they want to check and test the audio in the library). I want a tuner, a piece scanner, and beat maker (where you can track the beat like a conductor) ... make sure the features are Stable ... safe and not exploitable".

This runs the arithmetic every tool rests on, the score reader against a written-for-purpose piece, the zip reader against hostile archives, and the scanner's geometry, and reads the code for the promises that keep the room safe: the microphone is released, nothing is sent anywhere, nothing is evaluated. tests/e2e/the-music-room.js walks the room in a browser.

#### the owner sees it first

`tests/the-owner-sees-it-first.mjs`

Every change is planned, shown, tested and polished, and the owner is aware of it before it reaches `main` -- for people and their AI tools alike.

The owner's words, 30 September 2026: "Just remember to test, polish, and before pushing I should be aware. Same principle for the developers who will participate in this open source project with their AI tools."

A rule that lives only in documents can be deleted in a tidy-up without anybody noticing. This holds the places it was written: the brief every AI tool reads first, the contributor guide, the pull-request checklist, and the Claude-specific notes.

#### dev server

`tests/dev-server.mjs`

Does `npm run dev` actually show the app?

WHY THIS EXISTS. The README's first instruction to a newcomer is "try it in two minutes: git clone, npm install, npm run dev". On 2026-08-12 that produced a blank white page. HTTP 200, correct <title>, nothing rendered.

The cause was the Content-Security-Policy. Next.js's dev server compiles and hot-reloads through `eval`, and `script-src` had no 'unsafe-eval', so React never started. Production was always fine — `next build` does not use eval and the strict policy is exactly right there.
