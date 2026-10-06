# Appendix D. Every browser walk

75 walks in `tests/e2e/`. `npm run verify:all` runs every `.js` walk against a production build, four at a time; the Safari workflow runs the same walks on WebKit. `.mjs` walks are run by hand.

#### `a-phone-can-insert-things.js`

A phone can put a heading, a list and a quote on a page.

REPORTED, WITH A PHOTOGRAPH OF AN ANDROID PHONE: "it's not working in mobile". The `/` had been typed into the page and was sitting there as a character. No menu. No bar. Nothing to press.

WHY IT LOOKED FINE HERE. The slash-menu walk runs in a headless Chromium, where Playwright's keyboard sends real `keydown` events and the menu opens exactly as it does on a desktop. A phone's on-screen keyboard does not send those: GBoard and its cousins send composition and `beforeinput` events, so the character arrives with no keystroke for the menu to hear. Every assertion was true and none of them was about a phone.

#### `a-sabbath-program-downloads.js`

The Sabbath program, walked the way a Guide would on a phone.

Asked for on 2 October 2026: Guides and everybody above them make their own Sabbath program in the Office and download it for Word or Google Docs. Kept on the device, by the owner's choice.

So, in the sample church at phone width: open the Office, choose the folder, start a program, fill a line, download it, and read the file that arrived. Then the parts that matter as much as the file: it is still there after a reload, the next person on the same device does not see it, and an Explorer is not offered it.

#### `a-stray-file-is-not-opened.js`

A file let go where nothing takes files is stopped, not opened in the app's place -- and nothing else about dragging changes.

Asked for on 28 September 2026, with lesson studies: a handout dropped a few pixels from a study's file box was opened by the browser itself, which took the tab out of the app and the study being written with it. components/StrayFileDrops.tsx now stops such a drop on every screen. This walk runs on every engine the suites run on, WebKit included, because what a browser does with a dropped file is exactly the kind of thing that differs.

#### `a-study-can-have-a-drawing.js`

A Guide draws a picture for a lesson series, saves it, and changes it later.

Asked for on 28 September 2026: "Make sure studies feature has Excalidraw on it's tools please, and make sure it works." This is the "make sure it works": a real browser, the real board, a real drag on the real canvas -- not a check that the button exists.

It walks the sample app, because CI has no backend, and the sample app uses the same board (components/draw/DrawingBoard.tsx) as the live one. What it proves on the way: - the board opens from Draw a picture, and Save waits for a drawing; - a drag with the rectangle tool draws, and Save puts a picture on the form; - the picture is a PNG with the drawing INSIDE it, read back out here; - Change drawing reopens it with the shapes still there, and a second shape is saved alongside the first; - leaving with unsaved changes asks first; - no request leaves the app while drawing: the fonts come from /excalidraw/, and nothing is refused by the Content-Security-Policy; - Simple is where the form starts, and Advanced adds the topic.

#### `a-study-room-holds-many-pages.js`

A study room holds many pages, keeps them apart, and can put one away.

WHAT THIS IS ACTUALLY CHECKING. A second page is easy to make look right and easy to get wrong in a way no screenshot shows: two rows on the shelf and one document underneath, so everything typed on "Romans" is also on "Daniel" because both are rendering the same store. The assertion that matters is not that a page can be made, it is that what is written on one page is NOT on the other, and that it is still there when you come back.

It also holds the shelf itself to being useful rather than decorative: a page's own words have to reach the list, or the list is a column of identical rows and nobody can find anything. That preview is written by the page as it is edited -- every page is a separate document that must be fetched before a word of it can be read, so a shelf that read them all would be twenty round trips before it could draw one line.

#### `app-back.js`

An installed app must have a way back.

`display: 'standalone'` in the manifest is what makes the app feel like an app, and it is also what removes the browser's Back and Reload. That was reported from a real desktop install: "why can't I see the back, refresh and forward when I install it as a web app?"

Two things now answer it, and this suite checks both, because only one of them works on every platform:

#### `apple-install.js`

"The Install button does nothing on my iPhone."

THE BUG. Safari has never fired `beforeinstallprompt`, on iOS or on macOS. So on every Apple device the header's Install chip has no prompt to hand the browser and falls back to a link. That link pointed at `/settings`, and the install card lives near the bottom of a long page.

From the user's side: they press a button that says Install, Settings opens, and nothing that mentions installing is on screen. There is no error and nothing looks broken, so the reasonable conclusion is that the button does not work. Android users never saw this, because Chrome gives them a real one-tap prompt and they never take this branch.

#### `blog.js`

A Guide writes; the Explorers they walk with read it, and only them.

Four things this has to prove, and the last two are the ones worth writing a test for: 1. the Guide can write and publish a post 2. an Explorer paired with that Guide sees it on their home page 3. a DRAFT never reaches anybody 4. the reader count counts PEOPLE and excludes the author

Points 3 and 4 are where a blog quietly goes wrong. A draft that leaks is a privacy failure with a friendly face, and a counter that ticks up when the writer re-reads their own post flatters them with their own attention.

#### `board-and-trends.js`

The church board has no account, and the analytics now show change over time.

Two changes the owner asked for in one sentence: "take out the church member account since they don't have any account in this app. Let's just improve the analytics overtime and the Church board in each respect role in the account."

They are one change really. The board card was removed from the sign-in picker, because an option that opens with "you have no account here" is offering itself to somebody it then turns away. What the board actually needs moved into the accounts that exist — the admin's and the executive's — as a panel of counts they can read out or print at a meeting.

#### `chat-order.js`

A conversation must read in the order it happened.

THE BUG THIS EXISTS TO CATCH. Chat.tsx rendered the thread in two passes — every message, then every attachment — so a file always appeared at the very bottom however long ago it was sent. A Guide attached a study sheet, the Explorer replied, and the reply drew ABOVE the attachment while the timestamps underneath said the opposite.

The one assertion that matters is the middle one: a file sent BEFORE a message has to appear ABOVE it. Under the old code that is exactly what could never happen, so this suite fails against it — checked by reverting the component and running this, not by assuming.

#### `conversation-fits-the-glass.js`

The box you type in is on the screen.

THE BUG, photographed on an Android phone. A Guide opened the conversation with their Explorer and the screen ended mid-sentence, on the line about photo sizes. The composer and the Send button were below the glass. Dragging did not bring them up, because the thread fills nearly the whole screen and `overscroll-contain` stops a drag inside it from scrolling the page -- which is correct, and left nowhere on the screen to pull.

WHY THIS EXISTS ALONGSIDE tests/live-conversation-mobile.mjs. That file used to assert that certain class names appeared in the source, and it passed every day this was broken, because class names are not geometry. Worse, one of the things it checked for never reached the DOM at all. Only a rectangle can answer this question, so this measures one.

#### `drafts.js`

An unsent message waits for you, and disappears when you delete it.

The three things this proves, in a real browser:

1. Type, leave the conversation, come back — the text is still there. 2. Delete every character — the draft is gone, and stays gone. 3. A draft written to ONE person never appears in the box open to another.

The third is the one with consequences. A single shared storage key would put half a message meant for one Explorer into the composer open to a different one, and in this app that is not a glitch, it is a disclosure. It is also exactly the bug the obvious implementation has for one render after switching conversations, which is why useDraft keeps the text and its key together.

#### `evangelistic-meetings-are-yours-to-shape.js`

Evangelistic meetings: a Guide shapes a series their own way, and what is shared reaches the right Explorers, with no signal too, and never the team's own blocks.

Asked for on 2 October 2026: "super customizable, unlike Sabbath program it has a template that can put input, but for EMs users can have much more freedom to customise their meeting". The owner chose blocks, a list's own columns, many nights and the meeting's own look; kept on the device and shared as posts; for Guides and above.

Walked in the sample church, at phone width unless it says otherwise:

#### `fresh-looks.js`

Choose the new looks, read them at three sizes, and return to unchanged Classic. Only the invented sample church is used. Screenshots stay in ignored .ui-check. Run against a production server: node tests/e2e/fresh-looks.js PORT

#### `frozen-copy.js`

A copy installed from an address that can never update must say so.

THE REPORT: "one person got an outdated version and I don't know how it happened." Everyone else updated fine, which rules out the update system — it rules IN the one state that system cannot fix. Hosts give previews and individual deployments their own hostnames, and to a browser a different hostname is a different app: its own icon, its own worker, its own storage. A copy installed from one of those is frozen at the build that was there on the day, for ever, and from the inside it looks exactly like a healthy one.

#### `frutiger-aero-looks.js`

Frutiger Aero: five looks under one row in Settings, Look, that opens to show them, each with its picture and what it is like.

Asked for on 4 October 2026, with four design sheets: "Can we make more UI theme for fruteger aero, as sub file for 'look' so people can see the difference. Please make subfiles with drop down on it (with description)".

What a person does, in order: finds the row, opens it, sees five looks with a picture and a description each, chooses one, and finds the whole app in it (the Menu with its own drawing and words, readable, nothing sideways), still chosen after a reload, with the row open on it. Then back to Classic. The invented sample church only. A phone and a computer.

#### `header-layers.js`

Anything in the header that opens a panel must actually open it.

This exists because "Try an account" stopped working and the failure was invisible from every angle a normal test looks from. The button was present, visible, and enabled. Clicking it toggled React state, and `aria-expanded` went from false to true. The panel entered the DOM, and Playwright's `isVisible()` returned true for it. Every ordinary assertion passed.

It was still, from a person's point of view, a button that did nothing.

#### `in-app-browser.js`

Opening a shared link from inside another app's browser.

THE REPORTED BUG. A church shared the address in Messenger. Tapping it opens Messenger's OWN web view, which reports itself as an iPhone or iPad, is not standalone, and is on the right host — so every check said "offer the install" and the card printed "Tap Share at the bottom of Safari, choose Add to Home Screen".

There is no Safari. On iOS no in-app browser can install anything; only Safari can. Apple users were handed steps that cannot be carried out, with nothing saying the browser was the problem, and concluded the app was broken.

#### `install-detection.js`

Does the app know whether it is installed, and does it keep asking if not?

TWO PROPERTIES, AND THEY PULL AGAINST EACH OTHER. An app that never asks leaves people in a browser tab, losing their place every time they close it. An app that asks an installed user is broken in a way that reads as careless. So this checks both ends: the prompt comes back for somebody who has not installed, and it is gone the moment they have.

npm run build && node scripts/run-next.mjs start -p 4395 node tests/e2e/install-detection.js 4395

#### `install-every-browser.js`

The install steps, in whichever browser is actually in somebody's hand.

THE ASK: "I need all the installer in all browser please."

The card had four situations: Safari on iPhone, Safari on Mac, Chrome on Android, Chrome or Edge on a computer. Anybody in Samsung Internet, Opera, Brave, Firefox, Vivaldi or one of the smaller Chromium browsers was shown Chrome's menu, could not find it, and stopped. On Android in this part of the world Samsung Internet alone is a large share of handsets.

#### `join-consent.js`

The invited registration asks for three things and will not proceed without permission.

The assertion that matters is the disabled button. A consent checkbox that does not actually block anything is decoration, and decoration is worse than nothing here: it looks like the church asked, and produces a record saying they did, while a person who never noticed the box is signed up anyway.

#### `landing.js`

Pressing a link takes you TO THE THING, not near it.

THE REPORT, in the owner's words: "when I click out some features, it doesn't direct to the feature... so it felt like I got scammed or I still need to look for the feature."

Two separate faults produced that, and both only appear when the link is pressed from a page the link also points at — which is the common case, because the desk rail and the header are drawn on every screen:

#### `lesson-links.js`

Links in lesson study, rendered by a real browser.

tests/e2e/links.js proves this for a conversation. This proves the other half of what was asked for: a link typed into a SERIES DESCRIPTION is tappable where the series is read.

It matters more here than in a chat. A conversation link comes from one person you already walk with; a series description is written once by the library and then shown to everybody who is offered that series. One bad link there reaches every Explorer in the church, and it arrives wearing the church's authority.

#### `lesson-series.js`

A lesson series, built by the library and walked to the end by a seeker.

The client's request in one sentence: "Can the library upload lesson series on specific areas of interest that can be pushed to seekers and walked through with them until they finish?" This walks that sentence, in order, in one browser, as three different people:

an admin builds it → a missionary pushes it → a seeker finishes it

One persistent context on purpose. The demo database lives in localStorage and is shared by every persona, which is what makes it possible to prove that the thing one person created is the thing another person receives. Three separate contexts would prove three separate screens render.

#### `links.js`

Links in a conversation, rendered by a real browser.

tests/linkify.mjs proves the RULES. This proves the rules survive the trip through React and into the DOM — that a link really is an anchor somebody can tap, and that a hostile one really is not.

The distinction matters. A unit test showing `safeHref('javascript:...')` is null says nothing about what the page does; the component could ignore it. So each case below is typed into the real composer, sent, and then read back out of the rendered thread.

#### `long-message.js`

A long message has to be readable while you write it, and after you send it.

THE COMPLAINT. "When they create a very long message they can't see the whole message at all, or scroll up or down to see the whole message." The second half is the diagnosis: the composer was an `<input>`, a single line that accepted 4000 characters. There is no up or down in a one-line box, so nothing was broken and nothing could have been scrolled — the text simply ran off sideways and only the few words under the cursor were visible.

This runs at 390x844, an iPhone, because that is where it was reported.

#### `media-and-realtime.js`

Attachments and live sync, proved in a real browser.

Source assertions (tests/realtime-and-media.mjs) prove the rules are written. They cannot prove a person can actually attach a photo and see it, or that a second window updates without a refresh. This suite exists because a previous test suite in this project reported everything green on a guided tour that was completely stuck: asserting that code exists is not asserting that it works.

THE TWO PAGES MUST SHARE ONE BROWSER CONTEXT. Playwright isolates storage per context, and BroadcastChannel is same-origin — two contexts would be two different partitions and the live-sync check would fail for a reason that has nothing to do with the app.

#### `meet-up-place.js`

Booking a meet-up: type part of a place, see which one it is, tap it, and the appointment opens that exact spot.

Asked for on 26 September 2026: "I need to see the destination name, like auto name in google search, then just click or tap it to secure the location." This walks it in the sample app, on a phone-sized screen, where the place box searches a short list of sample landmarks instead of the map service -- the same component the live app uses.

npm run build && node scripts/run-next.mjs start -p 4382 node tests/e2e/meet-up-place.js 4382

#### `mobile-devices.js`

The app on a phone AND a tablet, at real device sizes, with touch instead of a mouse.

WHAT THIS PROVES AND WHAT IT DOES NOT. It runs Chromium with each device's viewport, pixel ratio, touch support and user agent. That is enough to catch the things that actually break on phones in practice: controls pushed off screen, tap targets too small to hit, a composer that a soft keyboard would bury, horizontal scroll, and features that silently need a mouse.

It is NOT Safari. iOS runs WebKit, and no amount of Chromium emulation is WebKit — engine bugs (video fullscreen behaviour, IndexedDB in private mode, date parsing) will not show up here. Those are covered by source assertions in tests/realtime-and-media.mjs and by the CI matrix, and where neither can reach, they are listed honestly as untested rather than assumed.

#### `my-files-on-a-phone-and-pad.js`

My Files on a phone and a pad, and a computer's My Files as it was.

Asked for on 6 October 2026: "The Library (My files) are not UI friendly for Mobile and Pad users, can we make it more aesthetic and simple use please. Desktop and Mac is ok for now."

What was wrong, measured on a 390px phone before the change: the header's tagline ran off the right-hand edge ("Live church. Real conne"); a welcome banner filled the whole first screen; six filter cards, each 112px tall, filled the second; the first resource began on the third; Browse was 5.6 screens long; and Delete on a file kept only on this device took one tap.

#### `no-sideways-scroll.js`

No screen scrolls sideways on a phone.

THE REPORTS, three of them now, all the same shape: a notification panel with its left half off the glass, an invitation row showing "Re-send", "Cancel" and half the word "Copy", and "overlapping design". Each was found by a person holding a phone, and each was invisible on a desktop because there was room for the mistake to hide in.

The general symptom is one number. If a page's content is wider than the screen, something on it is unreachable, whatever the cause: a fixed width, a long word, a table, or a row that asked to wrap and also refused to shrink. So this walks the app at phone width and compares those two numbers on every screen, and when they disagree it NAMES THE WIDEST ELEMENT rather than just failing, because "something overflows" is not a thing anybody can act on.

#### `office-subrooms.js`

The Office is a room with subrooms, not a page you scroll.

THE REPORT, with a drawing: rooms are main folders, subrooms are folders inside them. "I want the user to just click or tap the subrooms so they can just go to their destination and not scroll down tirelessly. If I pick the Lesson studies subroom, I will automatically go there and create my own Lesson studies, not scroll down and find it."

So this walks it the way a person would, in a real browser at phone width: open the room, press a subroom, and check that the thing you asked for is on screen WITHOUT SCROLLING and that the things you did not ask for are gone.

#### `old-save.js`

A database saved by yesterday's build must still open in today's.

This suite exists because of an outage, and the gap it fills is the reason the outage reached a phone. Every other suite starts in a clean browser context with empty storage, so every other suite is testing a FIRST run. Nobody's second run was ever tested — and the demo database lives in localStorage, so the second run is the one where the data on the device and the code in the bundle can disagree.

They disagreed. `lesson_series` was added to the database shape without being added to the hand-written list that filled newer collections into older saves. On any device with saved demo data `db.lesson_series` was undefined, the first .filter() on it threw during render, and the app fell to the "Beacon needs a fresh copy" screen — which could not help, because that screen clears caches and service workers and deliberately never touches storage. The person could refresh forever and nothing would change.

#### `panels-fit-portrait.js`

Pop-ups stay on the screen when the phone is held upright.

THE BUG, photographed: the notification panel opened with its left half off the edge of a phone in portrait. The heading read "ons", the switch was labelled "ications", and a safeguarding report said "rding report needs your attention". Turning the phone sideways made it look fixed. It was not fixed; there was simply room, which is why it was reported as "only good for horizontal".

`absolute right-0 w-80` aligns a panel's right edge to the BUTTON's, then draws 320px leftwards. The bell sits about two thirds across a phone header, so on a 412px screen the panel starts at roughly -50px. Nothing in that rule knows how wide the screen is.

#### `photos-shrink-before-sending.js`

A photo is made small before it is sent, and loses its location on the way.

WHY THIS IS A BROWSER TEST AND NOT A STATIC ONE. The work happens in canvas: decode, scale, re-encode. Nothing about whether it actually shrinks anything can be read off the source, and the number that matters is a ratio measured on a real image by a real browser.

THE NUMBERS THIS EXISTS FOR, from the live bucket: fifteen of sixteen files a church had sent each other were photographs averaging 2.3 MB and running to 4.4 MB. A conversation shows them a few hundred pixels wide, and every megabyte is paid for twice, once to store and again on every view.

#### `playlists.mjs`

The playlist, driven the way a person drives it.

WHY THIS EXISTS RATHER THAN A UNIT TEST. Every part of this feature is a browser part: IndexedDB holds the audio, localStorage holds the order, and an <audio> element decides when a track ended. A test that stubbed those would be testing the stubs. The one thing worth knowing — does the next track start? — only a browser can answer.

The playlists live in the Music room's Listen folder (they were in My Files until 4 October 2026), which needs somebody signed in to the sample church.

#### `prayer.js`

Asking for prayer, and somebody answering.

WHY THIS IS A ROUND TRIP AND NOT A FORM TEST. Asking for prayer is the most exposed thing an Explorer does in this app. The failure that matters is not "the textarea does not submit" — it is that the request goes in, is stored correctly, and NOBODY EVER SEES IT. That is exactly what was happening: the request landed on the Care tab of one person's page, and a Guide had to open each Explorer in turn and click a third tab to discover anybody had asked.

#### `quest-roles.js`

Every walk, walked. One per participant, in a real browser, at phone width.

The tutorial used to be one array of missionary steps, so there was one thing to test. There are now five walks, and the failure this suite exists to catch is the boring one: a step that points at a `data-quest` anchor nobody ever added, so the person is told "tap the highlighted button" with no highlight anywhere. That is not hypothetical — it is written down in Quest.tsx as something that already happened, and it happened again while this suite was being written: `<Button>` took a fixed prop list and dropped `data-quest` on the floor, so five anchors across three walks did not exist in the DOM.

#### `recommend-flow.js`

The client's requirement 2 and 8, end to end: "DMs recommend DS with an email address and name … If the DS accepts the admin's invite, DS enters through the app with a new account paired to the recommending DM." "The app begins on … Connect for DS (initiated by DM)."

A missionary recommends somebody who has NO account. The admin invites them. The invite link is opened and completed. A pairing must exist, with that missionary, at stage Connect — and the DM must still be unable to invite.

#### `room-colours-in-every-look.js`

The room's colours work under every look, not only Classic.

Asked for on 4 October 2026, with a picture of the Office swatches on the desk: "This colors doesnt work for other Themes in settings, please integrate it too". Under Beacon, Study and Focus the look painted over the palette, so choosing one changed nothing. Now the first swatch is the look's own colours and the others recolour it in the look's own light (lib/room-theme.ts, atTheLook): Warm Office under Focus is a warm dark, and Slate under Beacon a cool light. The arithmetic is checked for every look and palette by tests/room-colours-keep-the-look-light.mjs; this walk checks what the browser actually paints, and that no text on the pages a Guide uses most becomes harder to read than it is in the look itself.

#### `safari-handoff.js`

One tap from the wrong browser into Safari.

WHAT THIS IS FOR. Apple permits only Safari to add an app to the iPhone home screen. That is not ours to change. What was ours was the distance between "you are in Chrome" and "you are in Safari", which was three written steps about a ••• menu whose position differs in every app that has one, and which people were failing at -- the reported version being "they switch to Safari and it is still not working", because switching meant opening Safari and retyping the address, which loses the invitation link they were on.

#### `safeguarding.js`

Reporting somebody, and a Director acting on it.

This is the feature where "it renders" is not the question. The questions are whether an Explorer can actually reach the control while upset, whether the report arrives in front of a Director, and — the one that decides whether anybody ever uses it — whether the person reported is told.

npm run build && node scripts/run-next.mjs start -p 4370 node tests/e2e/safeguarding.js 4370

#### `seeker-dashboard.js`

The seeker's home is a dashboard, not just a content page.

Every other role has had one since the beginning. A seeker had to go looking to find out their missionary had written to them. This walks the real path — the missionary sends a message, then the seeker signs in — and asserts the strip tells them so, without ever naming a journey stage.

#### `seeker-no-stage.js`

Phase 2 verification: walk every screen a seeker can reach and prove no stage label appears anywhere in the rendered text.

#### `text-size-is-tried-first.js`

Text size is tried in the preview first, and changes the app only on Apply.

Asked for on 3 October 2026: "text size should be tested and see first before applying, there should be an apply button for text size". Walked on a phone, where the size matters most, and on a computer.

npm run build && node scripts/run-next.mjs start -p 4416 node tests/e2e/text-size-is-tried-first.js 4416

#### `the-affine-features-actually-work.js`

The study room's features DO something, not just appear in a menu.

WHY THIS EXISTS BESIDE the-study-room-has-affines-features.js, WHICH ALREADY PASSES. That walk asks the slash menu what it OFFERS -- "the menu offers table view", "the menu offers code block" -- and then inserts exactly one of them. Seven of its assertions are satisfied by a string appearing in a list.

This repository has spent a week on checks that stayed green while something was broken, and a menu entry is the purest example of the shape: the thing exists, it is named correctly, and nothing has established that choosing it does anything at all. A room advertised as "everything AFFiNE has" needs at least one walk that uses the features rather than reading their labels.

#### `the-bubble-has-one-scroll.js`

The Talk bubble has one scroll, and it is the messages.

REPORTED WITH A SCREENSHOT SHOWING BOTH SCROLLBARS: "this bubble 'talk' should be the WHOLE chat feature with only one scroll, the scroll should be the messages only right? Like a normal chat feature would be" -- and then a picture of Messenger, which is the shape being asked for.

WHAT WAS WRONG. globals.css caps the conversation card at the height of the SCREEN less the page chrome. That is right when the conversation is the page. The bubble is a 32rem panel with a height of its own, and a cap far larger than its container does nothing -- so the card grew to fit its content, the panel scrolled the card, and the thread scrolled inside that. The composer and the photo note travelled up and down with the messages, which is the one thing a chat window must never do.

#### `the-classic-look-stays.js`

Classic, in a browser: Settings names it and has it chosen, and the app still draws exactly the colours it drew on the day it was named.

Asked for on 3 October 2026: "I want the current UI to be called "classic" in the settings right now, ChatGPT or Codex will introduce new theme UI that users can pick, but make sure the classic UI remains the same please."

THE FINGERPRINT BELOW IS CLASSIC, measured on 3 October 2026 from the app as it was before this walk existed. If a change makes this walk fail, the change has altered Classic: make it a look of its own instead (see lib/ui-themes.ts). Change these numbers only when the owner has decided that Classic itself should change, and say so in the commit.

#### `the-desktop-layout.js`

The app on a computer, in a browser: every room down the left side, a light bar across the top, and no bar along the bottom; on a phone, the bar and the navy header as they always were.

Asked for on 3 October 2026: "This UI is not desktop friendly, can we make the desktop have it's own UI too", then "Top UI still looks like mobile", then "this is the classic. I dont want the UI classic with the outdated version where the UI is still mobile in desktop". So this is Classic on a computer, with nothing to choose. Classic's colours on a phone are walked in tests/e2e/the-classic-look-stays.js.

#### `the-editor-stylesheet-stays-in-the-editor.js`

The editor's stylesheet does not redraw the room around it.

TWO BUGS REPORTED FROM THE LIVE SITE ON ONE MORNING, both in the study room, both invisible to all 130 checks in the gate.

THE FIRST: a tag box with `w-32` on it, measured at 828px, and an "Add" beside it the size of a banner. AFFiNE's theme carries `input { flex: 1 1 0% }` written against the bare element, so it lands on every input on the screen. A class beats an element selector, so the colours and the padding were fine -- but `flex-basis: 0%` is what decides the size of a flex child, and `width` is never consulted. No width class could have fixed it.

#### `the-first-paint.js`

The first frame a person sees is already in their look.

Asked for on 3 October 2026: "fix the first paint flash too". The server cannot see which look a device chose, so every page arrived as Classic and React corrected it about a tenth of a second later. This walk notes the moment the look on <html> changes and the browser's own first-paint time, and checks which look was on the page when it first painted. Then, frame by frame, that the header is drawn in that look from its first frame on.

WHY NOT SIMPLY THE FIRST ANIMATION FRAME. That was the first version, and it failed the sign-in page with the fix in place: on a first visit the browser holds both painting and the script back until the stylesheet arrives, and an animation-frame tick can fall in that wait, when nothing is drawn. The browser's first-paint entry is when something actually reached the screen.

#### `the-install-invitation-stands-down.js`

The install invitation gets out of the way of a conversation.

WHY THIS EXISTS, AND WHY IT RUNS ON CHROMIUM. The conversation was unusable on short screens in Safari and nowhere else, and the reason it was nowhere else is the reason it went unnoticed for weeks: `isIos()` is false in headless Chromium, so the install bar there is a title and a button. On WebKit it renders the Add to Home Screen steps and grows to its ceiling of half the viewport. The conversation's cap subtracts whatever the bar is tall, so on a 667px screen it was left ~223px for a card whose heading, photo note and composer alone want ~292 -- the messages were squeezed to nothing and the box you type in was clipped out of a card that is `overflow-hidden`.

#### `the-install-prompt-covers-nothing.js`

The install prompt never lands on top of something you have to tap.

THE BUG, reported by CI as two unrelated failures on a Mac runner: e2e · mobile-devices timed out tapping a Guide's Explorer row on an iPad Mini, and e2e · panels-fit-portrait timed out clicking the notification bell on a phone held sideways. Playwright names the element that received the touch instead, and in both cases it was the same thing: the install steps list, inside `fixed bottom-4 right-...`. One cause, two symptoms, neither of them about the screen it was reported against.

#### `the-music-room.js`

The Music room, walked the way a choir member would.

Asked for on 4 October 2026: "another room for music for music lovers and choir ... take out the audio tools from the library ... I want a tuner, a piece scanner, and beat maker (where you can track the beat like a conductor)". tests/the-music-room.mjs holds the arithmetic and the code's promises; this proves the screens do what they say, in a browser:

- everybody finds Music in their rooms, and My Files points to it - the Tuner hears a 440 Hz tone as A4 in tune, follows a change of concert pitch, and lets the microphone go on Stop, on leaving the folder and when the phone locks - concert pitch is heard: a choice plays its A and says what it does, the starting note follows it, Compare plays 440 then yours, and Listen for the A takes an instrument's A and offers it - Advanced settings (5 October 2026), off until ticked: the Tuner's trail, drone and transposing instruments; the Conductor's clicks between beats, silent beats, count-in, speed trainer and saved tempos, counted by the sounds actually made; the score's transpose, loop, sound and silent part; and the Play folder's keyboard, chords and beat maker - the Conductor's baton moves on the beat, follows tapped tempo and a change of time signature, runs silent, and closes its audio on Stop - a score file opens, plays, follows your part and a change of tempo while playing, is kept, and opens again after a reload; a hostile one is refused in words - a photo of a page becomes a clean page, is kept without the photo, and is deleted with two taps - a music PDF (6 October 2026) is read on the phone under the site's own security policy, explains itself, is kept as itself and read again

#### `the-office-reports-files-and-calendars.js`

The Office's Reports, folders and calendars, walked in the sample church.

Asked for on 2 October 2026: a progress report for Guides and higher, in the Office with the Reports subroom; folders to keep many Sabbath programs and evangelistic meetings in order; and a way to put them on a calendar.

1. Maria, a Guide, opens Reports and finds her own Explorers' progress, the Bible studies and lessons, and who needs her; changes the period; writes a note that is still there after a reload; downloads the Word file. 2. Pastor Ramos, a Director, finds every Explorer in the church by stage and by Guide, and nothing from inside a pairing. 3. A program put in a folder is listed in that folder. 4. A planned series and a Sabbath program each download a calendar file with an event for each night or timed part; one night opens in Google Calendar.

#### `the-pairing-form-stays-in-one-line.js`

The two pickers on the pairing form sit on one line.

REPORTED: "when Directors are pairing, the UI is glitching, some Head Directors, ED, and Directors that some can't even pair because of the UI glitch."

WHAT IT ACTUALLY IS, MEASURED RATHER THAN GUESSED. A picker grows a search box once its list passes six names. The live church has twelve Guides and -- because every Explorer is already paired -- nothing to choose on the other side. So the Guide column grew a box and the Explorer column did not, the Guide column became 56px taller, and the two dropdowns landed on DIFFERENT LINES: the Explorer picker level with the Guide's search field, and the Guide's own dropdown below it. A Director reading that sees a form that has come apart and reaches for the wrong control.

#### `the-repair-only-fires-when-it-should.js`

The app repairs itself when a deploy broke it, and not otherwise.

components/SelfHeal.tsx exists for one failure: an installed copy holds a cached HTML shell, that shell asks for JavaScript by name, and a new deploy has deleted those files. Nothing inside the app can help, because nothing inside the app is running. So an inline script watches for it and throws away the service worker and every cache before reloading.

IT IS A BIG HAMMER, AND IT USED TO SWING AT ALMOST ANYTHING. The trigger was any `error` event whose target's URL contained `/_next/static/`. That is not the same question as "did the deploy delete this file", and three things that are not a broken deploy matched it:

#### `the-room-goes-in-and-out-of-obsidian.js`

A study room becomes an Obsidian vault, and a vault becomes a study room.

tests/a-room-can-become-a-vault.mjs already holds the half that can be checked without a browser -- the filenames, the front matter, and a zip that Info-ZIP and Python both agree is a zip. What it cannot check is the half that needs a live editor: that a page's BLOCKS become Markdown through AFFiNE's own adapters, and that Markdown becomes blocks again.

SO THIS WALK DOES THE ROUND TRIP. It writes a page, takes the copy, opens the downloaded zip on disk with a real `unzip`, and reads what is inside. Then it feeds a Markdown file back in and asks the shelf whether the page arrived with its title, its tag and its folder.

#### `the-room-has-folders-and-collections.js`

A page can be filed in a folder, and a question can be saved as a view.

THE LAST TWO FEATURES FROM THE OWNER'S SCREENSHOT of AFFiNE's sidebar: "Organize / First Folder", and "Collections".

WHY BOTH, WHEN THE ROOM ALREADY HAS TAGS. A folder is a place a page is IN and is what a person DECIDES. A collection is a question the shelf answers, saved so nobody retypes it, and gathers pages that were never put there: the difference is that a folder is somebody's decision and a collection is what is true. A page written next week that matches a collection is in it without anybody doing anything, which is the assertion at the bottom of this walk and the only one that tells the two apart.

#### `the-rooms-fit-a-phone.js`

On a phone or a pad, every room is reachable from the bar at the bottom.

HISTORY. This walk was written on 29 September 2026 for the header's row of room icons, after a Safari failure showed that on most phones Church, Library, Office and Publish were not on screen at all: the row was left with 45px at 412px wide and nothing at 360. It measured that the church link was wholly inside its strip.

On 30 September 2026 that row was replaced by what was asked for: "Menu | People | My Files as our bottom for our UI to make it simple in our Mobile and Pad". So this now walks the bar the way a person would, as a phone (touch, 2x) at the three widths that matter, and as a pad upright and on its side:

#### `the-study-room-can-do-more-than-type.js`

The study room is an editor, not a text box.

WHY THIS EXISTS, IN THE OWNER'S WORDS. "that's it? that's what all the study room can do? write notes? where are all the features of affine?"

That was a fair description of what was on the screen, and the cause was not missing features. Headings, quotes, three kinds of list, tables, callouts and dividers were all registered and all unreachable, because the room had blocks wired and no widgets: no slash menu to insert with, no toolbar to format with, nothing on a phone above the keyboard. Blocks are what an editor can hold; widgets are how a person gets at them. Wiring the first and not the second is exactly how an editor ends up looking like a text box.

#### `the-study-room-explains-itself.js`

A new room comes with a page that shows what the room can do.

ASKED FOR, WITH A SCREENSHOT OF AFFiNE'S OWN "Getting Started": "Make sure there is an instruction manual inside the study room so Explorers can see the full potential of the Affine features like what Affine did in the tutorial."

WHAT THIS WALK CHECKS AND WHAT IT DELIBERATELY DOES NOT. It checks the page is there, is made of the blocks it describes, and can be binned like any other. It does NOT check that binning it is permanent, and the reason is worth writing down: the only room a walk can reach is the walkthrough's, and the walkthrough keeps its pages in memory. Reload and the room is brand new, so the guide correctly reappears -- an assertion about "stays deleted" would pass on the bug and fail on the fix. That was written first and watched report a failure that was not one.

#### `the-study-room-has-affines-features.js`

The room has what AFFiNE has: databases, a canvas, tags and a journal.

REPORTED, WITH FOUR SCREENSHOTS AND A LINK TO AFFiNE'S REPOSITORY: "Did you even scan the whole affine on how the whole notion works? ... I want the whole feature please."

The honest answer was no. The room registered nine of AFFiNE's blocks and left out roughly thirty, and every previous walk asserted that the nine worked -- so the suite was green and the room was a quarter of what had been asked for three times. A test that checks only what was built cannot tell anybody that something was not built.

#### `the-study-room-on-every-size.js`

The study room opens and can be written in, at every size somebody has.

WHY A SECOND WALK. the-study-room-opens.js proves the editor assembles and accepts typing, once, at 412px. That is the phone most people here have and it is the right default, but "it works" was being claimed from one viewport while the room was asked to work on everything from a 360px Android to a desktop browser.

The editor is the part most likely to be wrong at a size nobody checked: its own defaults are a 944px document with 96px of padding a side, written for a desktop window, and on a phone that left a column 220 pixels wide with the placeholder cut off mid-word. Nothing went red. The page simply looked wrong at the size nobody had opened it at.

#### `the-study-room-opens.js`

The study room opens, and somebody can write in it.

WHY THIS WALK EXISTS AND THE OTHER CHECKS DO NOT COVER IT. The static checks assert the editor is imported lazily, gated behind a button, and that the build is configured to read BlockSuite at all. Every one of those can be true while the room opens to a blank box, because the editor is assembled at runtime from about a hundred custom elements and the failure mode is silence: no error, no text, nothing.

It failed that way three times while being built -- once on a decorator, once on the `accessor` keyword, once on vanilla-extract -- and each time the page simply rendered nothing. So the only honest test is to open it and type.

#### `this-sabbath-reaches-explorers-offline.js`

This Sabbath: a program shared in the app reaches the right Explorers, not the wrong ones, and can still be read with no signal.

Asked for on 2 October 2026: "the output for Sabbath program can be share to Explorers too", with Advanced settings, a Canva-ready output, and "accessible to all devices, offline and online".

Walked in the sample church, at phone width unless it says otherwise:

#### `thread-follows-the-newest.js`

A conversation opens on the newest message, and follows the one you send.

THE BUG, from a phone: "when I message, it should always track to the latest." The screenshot showed the last reply half hidden behind the composer.

There was no scrolling code in the thread AT ALL. It is a fixed-height box with `overflow-y-auto`, so it opened at scroll position ZERO — the oldest message in the conversation — and stayed there. Sending appended the new message below the fold, out of sight.

#### `tutorial-leaves-nothing-behind.js`

A first-time visitor's demo is not replaced by the tutorial's leftovers.

THE BUG, found in CI on WebKit and NOT a WebKit bug. Starting the tutorial parks the person's demo data and finishing puts it back. Both halves were written as "if there is something", and a first-time visitor has nothing: there is no `beacon-demo-v1` until something writes one. So the snapshot was skipped because there was nothing to snapshot, the restore was skipped for the same reason, and the tutorial's own database was left sitting there as the person's demo, with whatever they changed during the walk still in it. Their first look at the demo was the leftovers of a tutorial they had just finished, and nothing told them that is what they were looking at.

#### `tutorial-repeat.js`

*No header comment.*

#### `tutorial-space.js`

*No header comment.*

#### `tutorial-tut2.js`

*No header comment.*

#### `update-flow.js`

*No header comment.*

#### `update-speed.js`

How fast does a running app notice a new release, and what does it cost?

The owner's sentence was "let's make it more reliable, up to date and fast enough so we won't have this problem in our presentation." That is a claim with a number in it, and a claim with a number in it should have a test.

The old pacing was a 15-minute timer plus the `focus` event. Both are desktop assumptions: fifteen minutes is a long time to stand in front of a room, and `focus` is not how a phone comes back — switching apps and returning to an installed PWA fires `visibilitychange`, and a bfcache restore fires `pageshow` and may fire nothing else at all.

#### `update-typing.js`

The update must never land while somebody is writing.

WHY THIS IS THE MOST IMPORTANT TEST IN THE UPDATE SET. The banner is gone and the app now applies new builds by itself, which is what the owner asked for: most of the people using this are older and do not want to be asked to make decisions about software.

That trade has exactly one way to go badly, and it is silent. If a reload lands while a Guide is halfway through a message to the person they are walking with, the message is gone. They do not experience an update; they experience the app eating what they wrote. Nobody reports that as an update bug, so it would never come back to us as one.

#### `webkit-idb-probe.js`

What can this browser actually put in IndexedDB?

WHY THIS EXISTS. Attachments fail on WebKit and pass on Chromium, and two attempts to fix it by reasoning failed: reading the File into an ArrayBuffer broke Chromium, and holding the bytes across the write did nothing. Both were guesses dressed as diagnoses, seventeen minutes of CI apart.

So this stops guessing. It runs a battery of storage attempts against the real IndexedDB in the real browser and prints which ones survive, with the actual error for the ones that do not. The app is not involved: this is the platform being asked a direct question.
