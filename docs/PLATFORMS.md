# Which platforms this runs on

The short answer: any current phone or computer, and it installs from the
browser with no app store on any of them.

The longer answer separates **what has been tested** from **what is expected to
work**, because those are not the same thing and a document that blurs them is
worse than no document.

---

## Running the app

| Platform | State | How we know |
|---|---|---|
| Chrome, Edge, Brave (desktop) | **Tested** | Every end-to-end walk runs in Chromium on each push. |
| Android (Chrome) | **Tested** | `tests/e2e/mobile-devices.js` runs at Pixel 5 size with touch input and a real file attachment. |
| iPhone and iPad (Safari) | **Expected, engine not tested** | Layout and touch are covered at iPhone size; Safari's own engine is not run here. See below. |
| Firefox | **Expected, not tested** | No known blockers. Nothing in the app uses a Chromium-only API. Firefox on a computer cannot INSTALL a web app; the app says so rather than offering steps that fail. |
| Samsung Internet, Opera, Vivaldi, Hola and other Chromium browsers | **Install steps tested, engine not tested** | `tests/e2e/install-every-browser.js` loads Settings under each browser's real identifier and checks the steps shown are that browser's. The engine underneath is Chromium in every case, which IS tested; the shell around it is not run here. |
| Windows / macOS / Linux | **Tested** | CI runs the full static suite on all three. |

## Building and contributing

| Platform | State | How we know |
|---|---|---|
| Linux | **Tested** | CI. |
| Windows | **Tested** | CI, since it caught a real failure — see below. |
| macOS | **Tested** | CI. |

Everything you need is Node 22 (22.23.4 or newer) and npm. Every script in `package.json` is
`node scripts/<something>.mjs` — no shell built-ins, no `rm`, no environment
variables set inline — so the same command works in PowerShell, cmd, bash and
zsh without a compatibility layer.

---

## The iOS caveat, stated properly

iPhones and iPads run **WebKit**, and no other engine is permitted on them. Our
test browser is Chromium. Running Chromium with an iPhone's screen size, pixel
ratio and touch input catches the things that break phones in practice — content
pushed off screen, tap targets too small for a thumb, horizontal scrolling,
features that quietly need a mouse — and that is what `mobile-devices.js` does.

It does **not** catch WebKit engine differences, and pretending otherwise would
be the kind of claim this project exists to avoid. Two specific iOS behaviours
were found by reading the code rather than by testing, and both are now fixed:

- **Video would have gone fullscreen.** iOS pulls a `<video>` out of the page
  and plays it over everything unless `playsInline` is set. An attached video
  would have thrown the reader out of the conversation. Desktop testing would
  never have shown this.
- **Attaching a file would have thrown on plain http.** `crypto.randomUUID()` is
  a secure-context API: it is undefined over `http://` on a LAN address — which
  is exactly how a church tries something on its own machine first — and absent
  before Safari 15.4. It now falls back instead of throwing.

**Before a church commits to iOS, open it on a real iPhone and try four things:**
attach a photo, play an attached video, add it to the home screen, and use it
with the wifi off. If you can, try one of those in a Private tab too — Safari
restricts storage there and the app should degrade rather than break.

## Version floors

Nothing here is exotic, but these are the honest minimums:

| Feature | Needs | If older |
|---|---|---|
| Live sync between windows | `BroadcastChannel` — Safari 15.4+, Chrome 54+ | Silently off. The app works, windows just do not update each other. |
| Attachments | IndexedDB | The attachment is refused and removed rather than left broken. |
| Install to home screen | Safari 11.3+, Chrome 68+ | Runs as a normal web page. |
| Offline use | Service workers, and **https** (or localhost) | Over plain http it works online only. |

That last row is the one that surprises people. **Service workers require a
secure context.** A church serving this over `http://` on its own network gets a
working app with no offline support, and no error explaining why.

---

## What is not supported, and will not be

- **Internet Explorer.** No.
- **A native app in the App Store or Play Store.** There isn't one, and that is
  the point: no review queue, no gatekeeper, and updates arrive the next time
  somebody opens it. The trade is that there is no store listing to be found in,
  so distribution is a link you send.
- **Syncing between two devices without a backend.** Live sync is between
  windows on one device. Two phones need a server to sync through; see
  `docs/BACKENDS.md`.
