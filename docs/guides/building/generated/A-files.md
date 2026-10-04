# Appendix A. Every source file, and what it is for

Generated from the comment at the top of each file. Where a file has no such comment, that is said too: it is a gap worth filling.

## A.1 Pages and routes

#### `app/admin/page.tsx`

*No header comment.*

#### `app/api/app-icon/route.ts`

The real logo of a web app somebody put in their pocket.

WHY THE SERVER FETCHES IT AND NOT THE PHONE. Asked for plainly: "I wanted to see the logo of the web app please if there is a logo." The pocket drew a letter on a colour instead, and the note in lib/pocket.ts gave two reasons. Both are answered by moving the fetch rather than by accepting them:

1. THE CONTENT POLICY. `img-src` is `'self' data: blob:`. A tile pointing straight at https://faithlife.com/favicon.ico would need it widened to arbitrary origins, which weakens the policy for every page in the app, for ever, to draw an icon. An image served from THIS origin needs no change at all, so the policy stays exactly as narrow as it was.

2. THE PRIVACY. A favicon loaded by the browser is a request from a church member's phone to that company, carrying their IP address, every time the rail renders. Spotify and Facebook would learn that somebody is sitting in this app and roughly where they are. Fetched here, the only thing those companies see is a server asking for a picture, once, and nothing about any member at all.

#### `app/api/auth/sign-in/route.ts`

*No header comment.*

#### `app/apps/page.tsx`

The Apps room, retired in favour of the pocket.

THE ROUTE STAYS, for the same reason the Guild Room's does: links already point here, and a not-found page reads as a broken app rather than a room that was replaced. Anything a Director added is still in `church_apps`; the table was not dropped.

#### `app/cases/page.tsx`

Cases, in a room of their own.

WHY IT IS NOT A CARD ON A DASHBOARD ANY MORE. A case is a formal proceeding about a person, sometimes about the person reading it, and it sat as one more panel among a Guide's Explorers and an Explorer's lessons. Two things go wrong with that. It is easy to scroll past on the one day it matters, and it puts a hearing in the same visual rank as a study plan.

A room also means it can be linked to. "Open the case" in a notification, a Director saying "look at the Cases screen", a person coming back tomorrow to add something: all of those need an address, and a card halfway down another page does not have one.

EVERY ROLE HAS IT, including an Explorer, and that is the point. An Explorer called into a case is the person in it with the least standing, and their answer must be reachable without anybody having to tell them where to look. They can post here even while suspended: suspending somebody pending a hearing must not take away their side of it.

#### `app/church/page.tsx`

*No header comment.*

#### `app/dm/[id]/page.tsx`

*No header comment.*

#### `app/dm/page.tsx`

*No header comment.*

#### `app/ds/page.tsx`

*No header comment.*

#### `app/global-error.tsx`

The last resort, shown only when the app could not start at all.

components/SelfHeal.tsx repairs this automatically the first time. If the person lands here, the automatic repair already ran once this session and the fresh copy failed too, so reloading on a timer would just spin. Instead they get a plain screen, an honest sentence, and a button that does the same repair on purpose.

This file deliberately imports nothing. A broken build is exactly the moment when reaching for a shared helper fails, and a recovery screen that cannot render is not a recovery screen. Inline styles for the same reason: the stylesheet may be one of the files that did not load.

#### `app/guilds/page.tsx`

The Guild Room, archived.

"Take out the Guild Room feature, archive it for now since most users dont like it."

THE ROUTE STAYS AND SAYS SO. Deleting it would turn every link that already points here -- a notification somebody has not opened, a message where a Director wrote "see the Guild Room", a bookmark on a phone -- into a not-found page, which reads as the app being broken rather than as a room being put away. A person who arrives here should be told what happened in a sentence, not left guessing.

NOTHING BEHIND IT WAS REMOVED. The guilds, the posts and the amens are all still in the database, `list_guild_activity` still redacts names exactly as it always has, and a reported post can still be taken down from safeguarding -- which matters, because a report about something said in this room has to outlive the room. Bringing it back is restoring the navigation entries named in components/LiveAppShell.tsx.

#### `app/join/page.tsx`

*No header comment.*

#### `app/layout.tsx`

*No header comment.*

#### `app/library/page.tsx`

*No header comment.*

#### `app/login/page.tsx`

*No header comment.*

#### `app/mail/page.tsx`

*No header comment.*

#### `app/manifest.ts`

*No header comment.*

#### `app/menu/page.tsx`

The Menu tab. Every room this person has, written out, and the way out.

Opened from the bottom bar on a phone or a pad (components/TabBar.tsx). It is a page rather than a panel over the page for the reason a messaging app makes it a tab: it IS a place you go, the phone's own Back leaves it, and the bar stays on screen with Menu lit so you can see where you are. It works at every width; a desktop simply has the rail and rarely needs it.

Both halves draw the same list from the same function, railGroupsFor(), so a room is in the Menu for exactly the people whose rail has it.

#### `app/music/page.tsx`

The Music room (4 October 2026), for every role on both halves of the app. The room itself is components/music/MusicRoom.tsx; this page only puts it in the right shell. Nothing in the room reads or writes the church's database, so the two halves draw exactly the same thing.

#### `app/office/page.tsx`

The office: where the work is done, as opposed to where the people are.

WHY THIS ROOM EXISTS. The tools were scattered through the screens that are about people. A Guide's roster carried study-writing, library-stocking and a blog desk under the list of the five people they walk with; a Director's analytics and export lived inside one tab of the admin screen, three clicks from anywhere. So the screens about people were long, and the tools were hard to find, and both problems have the same fix.

The split is by KIND OF WORK, not by permission:

* a roster, a conversation, a case -> about a person, on their own screen * numbers, exports, stocking a shelf -> office work, in here * a blog post, an announcement -> Home's Blog and Announcements folders

#### `app/page.tsx`

*No header comment.*

#### `app/password/page.tsx`

/password -- one address for the one task.

REPORTED: "The change your password should have their own page, users get confuse why there isn't a dedicated page for new password and it's the same page for home."

LIVE ONLY, AND THAT IS NOT AN OVERSIGHT. The tutorial half of the app has no accounts and no passwords -- its people are sample data in browser storage -- so there is nothing here for it to change. A demo visitor is sent to their own settings rather than shown a form that could not do anything.

#### `app/policy/page.tsx`

How we treat each other here.

WRITTEN TO BE READ, which is the whole difficulty. Every church has a safeguarding policy and almost nobody has read one: they are written by lawyers, for lawyers, to survive a complaint rather than to prevent one. A policy nobody finishes protects nobody.

So: short sentences, no clause numbers, no "the Organisation shall", and the part people actually need — how to report, and what happens next — near the top rather than buried at the end. The audience is a church member in their forties who is not technical and is possibly upset.

#### `app/privacy/page.tsx`

What we do with what you tell us.

WRITTEN TO BE READ, like the safeguarding policy beside it. Almost nobody finishes a privacy notice, which is why almost every one of them is written as though nobody will. This one is short sentences and no clause numbers, because the audience is a church member who has just been invited by somebody they trust and is deciding whether to sign up.

TWO THINGS EVERY CHURCH RUNNING THIS MUST FILL IN before publishing it: who the controller is, and who the Data Protection Officer is. They are marked in the text and there is no way to guess them from here. The blanks are visible on purpose: a notice with a plausible-looking wrong name on it is worse than one that admits it is unfinished.

WHY IT MATTERS MORE THAN IT LOOKS. Under the Philippine Data Privacy Act a person's age, marital status and religious affiliation are SENSITIVE personal information, and this app records all three by existing. That raises the standard from "tell people" to "get express consent, appoint a Data Protection Officer, and register if you pass a thousand members". docs/DATA-PROTECTION.md has the full map and the list of what is still missing.

#### `app/profile/page.tsx`

*No header comment.*

#### `app/publish/page.tsx`

/publish IS HOME'S BLOG FOLDER NOW.

Publish was a room of its own, for every role, from late September 2026. On 3 October the owner moved its two halves into Home: "Blog and announcement will be the sub rooms of home, so basically we will take out publish". Home (/church) has a Blog folder, with the writing desk above what people wrote, and an Announcements folder for those who pin notices.

The address stays, because it is in people's bookmarks, in installed apps' history and in older messages, and a link that leads nowhere is worse than one that leads somewhere slightly different. `?room=` opens the folder (components/Rooms.tsx).

#### `app/robots.ts`

*No header comment.*

#### `app/sabbath/page.tsx`

This Sabbath, for every member: the program the church shared, and a leader's own programs, readable and editable with no signal.

WHY THIS PAGE DOES NOT WAIT FOR THE DATABASE. Every other signed-in page asks the database who the person is before it draws anything, so opened with no signal it can only say it could not load the account. This one has nothing it needs from the database to be useful: the programs are on the phone. So when the person cannot be looked up, it draws from the device for the account this browser is signed in as, says so, and catches up the moment the church can be reached.

That fallback reads only this device's own storage, under this browser's own signed-in account. It unlocks nothing on the server, and the remembered role it uses decides only which of the device's own lists to show.

#### `app/settings/page.tsx`

*No header comment.*

#### `app/setup/page.tsx`

/setup — the page that tells you what is left to do, and checks.

WHY THIS EXISTS. Everything needed to run a real Hope Beacon already ships in this repository: the whole schema, the security rules, the sign-in gateway. What was missing was any way to find out WHERE YOU ARE. A developer who had done three of the four steps saw exactly what a developer who had done none of them saw — the sample-people front door — with nothing on screen to say which step was still outstanding or that a step existed at all.

So this page does not explain the project. It answers one question: what do I do next? It probes the real connection and names the next action, and it is reachable in both modes, because the mode you are in IS the thing you are trying to change.

It reads only. It writes nothing, stores nothing, and sends nothing anywhere except the one query below, to the database you configured yourself.

#### `app/signup/page.tsx`

*No header comment.*

#### `app/study/page.tsx`

The Study Room: a room in My Rooms, not a card at the bottom of a tab.

ASKED FOR, AND GOT WRONG THE FIRST TIME. "I want Affine to be the special room for the Explorer", and then, after it arrived as a card under the Study tab: "I told you to make it a separate room in My Rooms application right? For us to see the whole feature of Affine!"

In this app a ROOM is a specific thing: an entry in the left rail beside Home, My Journey and My Files, with a page of its own. A card inside another room's tab is not that, and it also gave a full editor about a third of a screen to live in, which is the opposite of what an editor needs.

So: its own route, its own rail entry, and the editor gets the page. It opens on arrival rather than behind a button, because walking into the Study Room IS asking for it -- the button exists so nobody downloads three megabytes while reading something else, and that reason does not apply here.

#### `app/sw.js/route.ts`

*No header comment.*

#### `app/talk/page.tsx`

/talk — the conversation, full screen, with a way out.

A REAL ROUTE RATHER THAN ONLY A PANEL. The chat had to be somewhere you can go, and a route is what makes that true rather than decorative: the back button works, a reload keeps you in the same conversation, a notification can point at the thread instead of at the app in general, and the installed app can be opened straight into it. A panel that exists only in memory has none of that, and is the version people find themselves lost inside.

EXIT GOES BACK, not to a fixed page. Somebody who opened the chat from the library should land back in the library. `router.back()` when there is somewhere to go back to, and home when the chat is where they arrived.

#### `app/version.json/route.ts`

*No header comment.*

## A.2 Components

#### `components/AnchoredPanel.tsx`

A panel that hangs off a button and STAYS ON THE SCREEN.

THE BUG THIS EXISTS FOR, photographed on a phone held upright: the notification panel opened with its left half off the edge of the screen. The heading read "ons", the switch was labelled "ications", and a safeguarding report said "rding report needs your attention". Every word that mattered was past the edge of the glass.

The cause is that `absolute right-0 w-80` aligns the panel's right edge to the BUTTON's right edge and then draws 320px leftwards. That is fine on a wide screen. The bell is about two thirds of the way across a phone header, so on a 412px portrait screen the panel starts at roughly -50px. Nothing clamps it, because nothing in that rule knows how wide the screen is.

Turning the phone sideways made it look fixed. It was not fixed; there was simply room. That is why the report was "only good for horizontal".

#### `components/AppShell.tsx`

*No header comment.*

#### `components/AutoUpdate.tsx`

*No header comment.*

#### `components/BackButton.tsx`

The Back button an installed app does not get for free.

The manifest asks for `minimal-ui`, which persuades desktop Chrome, Edge and Android Chrome to keep a slim Back and Reload above the page. Safari has never implemented it, so on an iPhone home-screen app there is no browser Back at all and never will be. Without something in the page itself, a person who taps into a seeker's room, a lesson or a settings screen has no way out except the bottom nav — which only reaches the top-level sections, not the screen they came from.

Why this reads window.history.length rather than counting renders:

The first version kept a depth counter in component state, incremented on every pathname change. It never appeared. The shell that hosts this header is applied per page rather than in a layout, so it UNMOUNTS AND REMOUNTS on every navigation and the counter went back to 1 each time. `history.length` belongs to the browser, so it survives that. The e2e suite tests/e2e/app-back.js is what found it; the build was perfectly happy.

#### `components/BeaconLoader.tsx`

*No header comment.*

#### `components/Blog.tsx`

The Guide's blog, and the Explorer's reading of it.

WHY THIS EXISTS AS WELL AS THE CHAT. A conversation is one-to-one and expects a reply; that is its strength and also its cost. Some things a Guide wants to say are said once, to everybody, and should sit somewhere an Explorer can read them at midnight without owing an answer by morning. Sermon notes, a thought for the week, what is happening on Sabbath.

TWO SWITCHES, DELIBERATELY. `visibility` decides whether a post exists for anyone but its author — a draft is private until it is ready. `audience` decides who receives it once published. One flag would have meant the only way to take a post off the front page is to delete it, and a Guide should be able to retire last month's note without destroying it.

THE COUNTER SHOWS A NUMBER AND NEVER A NAME. It counts people rather than opens, so re-reading does not inflate it, and the author is excluded from their own count. Who read what is recorded only so the number can mean "readers"; it is never displayed. An Explorer should be able to read quietly, for the same reason they are never shown their own journey stage and the prayer wall carries no names.

#### `components/BuildNotice.tsx`

*No header comment.*

#### `components/Chat.tsx`

The sample app's conversation: the sample store's rows, handed to the one chat both halves draw (components/talk/ChatView.tsx).

A ONE-TO-ONE COPY OF THE LIVE CHAT, by the owner's rule for the sample half. Until 1 October 2026 this file drew its own thread -- a name and a time under every bubble, a word "Send", no way to change or take back a message, no days -- and the two had drifted into different chats. Now it only turns the store's messages, attachments and reactions into what ChatView draws, and passes the writes back to the store. Replies, reactions, voice messages, editing and taking back all behave as they do live, under the same rules.

A THREAD IS A SEQUENCE OF EVENTS, NOT TWO LISTS. Messages and attachments go in together and ChatView orders them by time, so a file sits next to the message it belongs to rather than at the bottom.

#### `components/ChurchBillboard.tsx`

*No header comment.*

#### `components/ConsentHost.tsx`

*No header comment.*

#### `components/ConsentNotice.tsx`

*No header comment.*

#### `components/DataManager.tsx`

*No header comment.*

#### `components/DemoAnalytics.tsx`

The tutorial's analytics, and the two views under it.

WHY THIS FILE EXISTS. All of this lived inside app/admin/page.tsx, which was fine while the Admin tab was the only place that showed it. The Office room shows the same screen, and a page file in the App Router may not export anything but the page, so the choice was to duplicate it or to move it. A second copy of an analytics screen is two screens that disagree the first time one of them is changed.

Nothing here is altered from what the Admin tab already rendered. It is the same code in a file both callers can import.

#### `components/DemoRibbon.tsx`

*No header comment.*

#### `components/DemoTalkDock.tsx`

The chat bubble in the sample app: the live bubble's twin.

WHY THE SAMPLE HAS ONE NOW. Until 30 September 2026 the sample app had no bubble: its conversations were cards on two pages, a Guide's Talk tab and an Explorer's home. The owner asked for the conversation to leave those pages for the bubble, and for the sample to stay a one-to-one copy of the live app ("Yes, keep it 1:1"), because the sample is what a church tries and what the tutorial teaches.

SO EVERYTHING YOU SEE IS SHARED. The bubble, the sheet, the header with Report in it, the list and the sliding between them are components/talk/Dock.tsx, which the live bubble draws too. What is here is only the data: the sample store's pairings and messages instead of the live database's, shaped into the same thread rows.

#### `components/DeskDrawer.tsx`

The desk (My office, or My room for an Explorer), as a drawer on a phone or a pad.

ASKED FOR ON 30 SEPTEMBER 2026, with a screenshot of a phone scrolled past the page into My office, On the desk, Pocket and Player: "the mini office (like in the desktop) should not be at the bottom for users to scroll down at least. For mobile and pads can you make it like a side screen where it's only optional to click? Like I'll just click a mini cabinet with an arrow '<<<' to appear on it or swipe it at the corner and it will appear, and it will disappear if I click an arrow '>>>'."

Below 1280px the desk used to stack UNDER the page, so every page on a phone was the page and then a second page of desk that nobody had asked for. It is a drawer there now: a small tab on the right edge opens it, the arrows inside put it away, and a swipe in from the right edge does the same as the tab. It starts closed. From 1280px nothing changes: the desk is the column beside the page it has always been, and this component steps out of the way entirely (`display: contents`, globals.css `.desk-drawer`).

#### `components/DesktopNav.tsx`

THE ROOMS, DOWN THE LEFT SIDE OF A COMPUTER SCREEN.

Asked for on 3 October 2026, with a screenshot of a Guide's home on a wide screen: "This UI is not desktop friendly, can we make the desktop have it's own UI too". It began as a look of its own, Desktop, and the same day the owner made it Classic's: "this is the classic. I dont want the UI classic with the outdated version where the UI is still mobile in desktop". So it is drawn under every look, and shown from 1280px up, the width the desk already moves beside the page at; below that, `hidden`, a phone and a pad keep the bar along the bottom.

THE SAME ROOMS AS THE MENU, FROM THE SAME LIST. railGroupsFor() is what the Menu draws for each role on both halves; drawing it again here means a room added to the Menu arrives in the sidebar without anybody remembering to. What it replaces on a computer, the bar along the bottom, is hidden by app/desktop-layout.css, which also turns the header into the top bar.

#### `components/EvangelisticMeetings.tsx`

Evangelistic meetings: a series of nights, planned the church's own way.

Asked for on 2 October 2026: "super customizable, unlike Sabbath program it has a template that can put input, but for EMs users can have much more freedom to customise their meeting". lib/evangelistic-meeting.ts says what the four freedoms are and why a block can be the team's only.

THE SAME HOUSE RULES AS THE SABBATH PROGRAM (components/SabbathProgram.tsx), because the same people use both and the phone is the same width: * one night open at a time, so a week of meetings is not one long scroll; * typing and arranging are two modes, so the boxes keep a phone's width and the move and remove buttons appear only when asked for; * nothing here reads the database. Meetings live on the device, and sharing goes through the one function the page hands in.

#### `components/Feedback.tsx`

*No header comment.*

#### `components/FeedbackNudge.tsx`

*No header comment.*

#### `components/FeedbackNudgeHost.tsx`

*No header comment.*

#### `components/FileDrop.tsx`

Drag files in, or choose them. One box for every place a person adds a file.

Asked for on 25 September 2026: "files must be drag and drop please ... easy to add". On a computer that means dropping a file from the desktop onto the box; on a phone, where nothing can be dragged, the same box is a button that opens the phone's own picker. Both land in one callback, so a screen that accepts files has exactly one way in to reason about.

#### `components/Folders.tsx`

Folders for the Office's own documents: Sabbath programs and evangelistic meetings.

Asked for on 2 October 2026: "Both Sabbath school and evangelistic meetings can have multiple storage files place in the sub-room to be organize". The owner chose folders: a program or a series is put in a folder by naming one, and the list shows each folder as a group that opens and shuts.

A FOLDER IS A NAME, NOT A THING THAT HAS TO EXIST FIRST. Typing a new name makes the folder; moving the last item out of it makes it go. Nothing to create, rename or empty, and nothing to get out of step.

#### `components/FollowUps.tsx`

*No header comment.*

#### `components/FreshMenu.tsx`

*No header comment.*

#### `components/FrozenCopy.tsx`

"One person is stuck on an old version and nobody can work out why."

THE CAUSE, and it is not the update system. Hosts give every preview — and often every individual deployment — its own hostname, and to a browser a different hostname is a different application: its own icon, its own service worker, its own storage. A copy installed from one of those addresses can NEVER receive a production update. No amount of checking helps: the origin it was installed from is frozen at the build that was there that day, and the app is dutifully staying up to date with a version of itself that will never move again.

lib/canonical.ts already knows this. Until now it was used for exactly one thing — deciding whether to OFFER an install — and was deliberately silent otherwise, because a banner across the front door of a preview reads to a casual visitor like a security warning about the site itself.

#### `components/Glyph.tsx`

The icons a person has to press, drawn rather than typed.

THE BUG, circled in a screenshot on an Android phone: the sign-out button in the header was an empty box. Not a wrong icon, not a missing image, a tofu box, which is what a font draws when it has no glyph for a character.

The character was `⏻`, U+23FB POWER SYMBOL. It lives in the Miscellaneous Technical block, and that is the whole problem: it LOOKS like an emoji and is not one. Emoji get a guaranteed fallback, because every phone ships a colour emoji font covering the whole emoji set. A symbol from Miscellaneous Technical gets no such promise: it is drawn only if the text font happens to include it. Apple's system font does. Android's Noto Sans does not.

So it rendered on the iPhone it was written on, on the Mac it was tested on, and on the reviewer's laptop, and it was a blank box for everybody on Android.

#### `components/InstallCard.tsx`

Installing the app, as something you can go and find.

WHY THE AUTOMATIC PROMPT IS NOT ENOUGH, and this is not belt-and-braces.

* Chrome fires `beforeinstallprompt` only once its own engagement heuristics are satisfied — a certain amount of time on the site, a certain number of visits. On a phone handed round at a demo, that is usually never. * Firefox does not fire it at all, on any platform. * Safari has never had it, on Mac or on iPhone. * And once anybody presses "Later", the prompt is quiet for days.

So the floating card is a nudge for the people who happen to qualify, and this is the answer for everybody else: a permanent entry in Settings that works on every device, and says exactly what to press on the one you are holding.

#### `components/InstallChip.tsx`

A quiet "Install" in the header, for as long as the app is not installed.

The floating card asks once and then goes away for two days; Settings has the full instructions but you have to know to look. This is the middle: always visible on a device that has not installed the app, never visible on one that has, and one tap from the real thing when the browser offers it.

It disappears the moment the app is installed, which is the point — a permanent Install button inside an installed app is how you can tell nobody tried it.

#### `components/InstallHomeButton.tsx`

Install, on the front door, where somebody who has not signed in can see it.

WHY IT MOVED HERE. It was a chip in the signed-in header, wedged between the notification bell and the avatar on a row that is already tight on a phone. Two things were wrong with that. The people who most need to install are the ones who have just opened the link their church sent and have not signed in yet, and they never saw it. And on an iPhone the control cannot install anything anyway: it can only explain, and a 32px chip is not where an explanation goes.

So: a real button at the bottom of the front door, and the full card in Settings for people already inside.

IT DRAWS NOTHING ONCE THE APP IS INSTALLED. An installed app showing an Install button is the app telling somebody it does not know what it is.

#### `components/InstallPrompt.tsx`

*No header comment.*

#### `components/InstallSteps.tsx`

How to install Hope Beacon, in whichever browser is actually in your hand.

THE ASK: "I need all the installer in all browser please." The card had steps for four situations: Safari on iPhone, Safari on a Mac, Chrome on Android, and Chrome or Edge on a computer. Anybody in Samsung Internet, Opera, Brave, Firefox, Vivaldi or one of the smaller Chromium browsers was shown Chrome's menu, could not find it, and stopped. Samsung Internet alone is a large share of Android phones.

WHY THIS IS A LIST YOU PICK FROM RATHER THAN A DETECTION.

Sniffing the user agent gets the common browsers right and everything else wrong, silently. Two specific traps decided it:

* Brave does not put "Brave" in its user agent at all. It is detected, if at all, by a `navigator.brave` object. * Searching for "Hola" in a user agent matches `Le Hola`, which is a LeEco PHONE MODEL and not a browser. A church member on that handset would have been told they were in a browser they have never installed.

#### `components/InviteManager.tsx`

*No header comment.*

#### `components/JourneyPath.tsx`

*No header comment.*

#### `components/LessonSeriesLibrary.tsx`

*No header comment.*

#### `components/Linked.tsx`

The renderer for lib/linkify.ts.

The rules about what may become a link live in lib/linkify.ts, which is plain TypeScript with no JSX so the tests can import and exercise them directly. This file is only the drawing.

#### `components/LiveAccountPages.tsx`

Your profile, and your settings — on the LIVE app.

Both of these existed only in the tutorial. /profile and /settings were written against the in-browser demo store and never given a live version, so on a church's real deployment they fell through to AppShell's placeholder — the grey "This live screen is being connected" card. A signed-in member could not change their own name, and nobody could turn notifications on.

Not a policy and not a decision anybody made. Just two screens that were never finished, behind a card that made it look deliberate.

#### `components/LiveActivityAnalysis.tsx`

Who is being walked with, and who is not.

ASKED FOR: "Head ED, ED, and Directors must have analysis to track Guide and Explorer activities please."

WHY THIS IS NOT THE ACTIVITY RECORD AGAIN. The record answers "what happened", newest first, and it is the right shape for a question about an event. It is the wrong shape for the question a Director actually carries, which is "is anybody being left". Forty rows of things that happened do not say that one Explorer has heard from nobody in three weeks: that person appears in the feed exactly zero times, which is the whole problem, and a list of events can only ever show what is there.

SO THE QUIET COLUMN IS THE POINT OF THE SCREEN. Everything else here is context for it. The rows arrive sorted with the unpaired first and then the quietest, because sorting by name puts the person nobody has noticed wherever the alphabet happens to put them, which is how they stay unnoticed.

#### `components/LiveAdminReports.tsx`

Admin Reports: a queue for leadership, and a private conversation for two.

THE SHAPE, as asked for: "if a report comes from Guide and Explorer, Directors are the Front line and we'll see it as a report, any Directors can pick up a Guide and Explorer's report ... Guides and Explorers can chat a live Director on it privately 1 on 1 ... only one can chat such case, it wont be a group chat but a one on one chat."

WHAT THIS FILE IS NOT ALLOWED TO DECIDE. Every rule that matters is in migration 20260915120000: nobody handles a report they are the subject of, a report about a Director or an Executive Director goes to Executive Directors only, and only the member who raised it and the one person who picked it up can read or write the conversation. This screen renders what the database already decided. A bug here can hide a control; it cannot widen a rule.

WHY THE CASE IS VISIBLE TO LEADERSHIP BUT THE CONVERSATION IS NOT. Directors have to see a queue or nobody could pick anything up, and an Executive who cannot see that a case exists cannot oversee anything. "Only one can chat" is about the talking. So the row is leadership's and the thread is the two people's, and `messages` is a count rather than a preview.

#### `components/LiveAnalytics.tsx`

The church's numbers, for a Director or an Executive Director on a Tuesday.

WHO THIS IS FOR. Somebody who uses a spreadsheet occasionally and has never opened a BI tool, who has ten minutes before a meeting and needs to be able to say what is happening. So: a headline they can read at a glance, two charts that answer two specific questions, the averages a spreadsheet would give them, and a file they can attach to an email.

THE TWO QUESTIONS, replacing a generic "everything week by week" chart that answered neither:

1. Who is using it — Guides and Explorers, active and inactive, over a day, a week and a month. 2. Who is arriving and who is leaving — new members by role at any grain from daily to yearly, and the suspensions, refusals and removals beside them.

#### `components/LiveAnnouncements.tsx`

What the church has pinned, on its own.

SPLIT OUT OF LiveBillboard, which is the second time that file has given a piece away and for the same reason both times (see LiveWriteNotice). The billboard is the church screen: a masthead with the church's name and its counts, and the notices underneath. A Guide opening their own dashboard does not want the masthead — they want the notices, and until now the only way to have them was to bring the whole church screen along.

WHERE IT IS NOW, which was the ask: Explorer after the Guide's name and before the conversation. Their screen is a relationship first; a notice from the church sits under the person and above the talking. Guide the first thing on the dashboard. Director the first thing under the room tabs. The tabs stay put: see the and ED note in AdminPage on why nothing is ever allowed above them.

#### `components/LiveAppShell.tsx`

*No header comment.*

#### `components/LiveBell.tsx`

The notification bell, live.

A notification belongs to exactly one person and the policy says so. There is no insert policy at all: notifications are written by notify_user(), which is SECURITY DEFINER and checks that both people are in the same church. A client able to write this table directly could make the app say anything to anybody.

#### `components/LiveBillboard.tsx`

The church home board, live.

The tutorial has had a masthead, a strip of things for a Director to action, a row of notices and a stream of what is happening. Live had a heading and two stat cards. This is the same board against the real database.

TWO THINGS ARE DELIBERATELY DIFFERENT FROM THE TUTORIAL.

The notices are real rows a Director writes, not three hard-coded strings. A demonstration can pretend; a church needs to change the time of a meeting.

There is no feed of journey milestones. In the tutorial that stream is anonymised invented data. Against a real congregation of forty, "a friend moved forward this week" is a sentence a handful of people can attach a name to, and the people it is about never agreed to be in it. The counts say the same thing without pointing at anybody.

#### `components/LiveBlog.tsx`

The blog, against a real database. The live twin of components/Blog.tsx.

The demo version keeps posts in the browser and can decide for itself who sees what. This one decides nothing: it asks for posts and shows what comes back, because row level security already returned only what this person is entitled to (migration 0006). A filter here would protect nobody — the browser can call PostgREST directly with the same public key.

The one thing that could not be a policy is the reader count, because it is an aggregate rather than a row. It comes from a SECURITY DEFINER function that returns a NUMBER and never the names behind it. The Guide learns that four people read the post and never which four, for the same reason an Explorer is never shown their own journey stage: somebody exploring faith should be able to read quietly without being watched doing it.

#### `components/LiveBulkInvite.tsx`

Inviting a roomful of people from a file, by name and by role.

WHAT CHANGED AND WHY. This used to take a pile of addresses and give every one of them the same role and no name. That is fine for a column copied out of a spreadsheet and wrong for the thing people actually keep, which is a list with three columns in it:

Maria Santos, maria@example.org, Explorer Joel Reyes, joel@example.org, Guide

The old reader split on commas BEFORE it split on lines, so that first row became three fragments, two of which were not addresses. A file that says exactly who everybody is produced one invitation and two warnings. So the reader now takes a LINE at a time and reads the fields inside it, which is what makes the greeting in the email say "Maria" instead of "maria".

#### `components/LiveChurchPages.tsx`

The last two screens that still fell through to the placeholder.

/church and /mail were written against the in-browser store, so on a live deployment both showed AppShell's grey "This live screen is being connected" card. That card was the single most-reported thing in this app, and every report was the same underlying fault: a page with no live version.

/mail needed more than a port. In the tutorial it is a SIMULATED mailbox — "what Beacon would send you" — which is a teaching device and means nothing on a real deployment, where mail goes to real inboxes. Its honest live counterpart is the outbox: who has been invited, who has not arrived, and the link to hand over when the email did not make it.

#### `components/LiveCorePages.tsx`

KEPT AS A RE-EXPORT, DELIBERATELY.

This file held three thousand lines and nineteen components: the signed-out door, the Director's entire admin screen, both Guide screens, the Explorer's screen, and every small shared piece. It was split by SCREEN, because that is how somebody looks for code: they are fixing the login form, or the roster, or the conversation, and they should not have to know those three live together.

Every screen that imported from here still can. Deleting this file would mean touching a dozen call sites in the same change as moving three thousand lines, and a refactor that big should be provable by "nothing else changed".

NEW CODE SHOULD IMPORT FROM THE FILE THAT HOLDS THE SCREEN:

#### `components/LiveDesk.tsx`

What is on your desk: what is coming, and what is waiting for you.

THE OLD ONE WAS ALWAYS EMPTY. The rail's desk card took a list of numbers and the live shell passed `[]`, hard-coded, so every signed-in person has always been told "Nothing waiting. A good place to be." whatever was actually waiting. It looked like a considered empty state and was a panel nobody had ever wired up.

TWO HALVES, AND THE ORDER IS THE POINT.

COMING UP is a fact about the calendar. It cannot be acted on now and it is the thing people forget, so it goes first and it is short.

WAITING FOR YOU is work. Every line is something somebody is waiting on, it links to the screen that resolves it, and it disappears when it is done.

#### `components/LiveExecutive.tsx`

What a Director and an Executive Director see beyond the member list.

The live executive page had invitations, approvals and pairing and nothing else, which is a workspace for administering people rather than a view of a ministry. This adds the three things the sample-data version has and the live one did not: the numbers, the board report, and the library.

EVERY NUMBER HERE IS A COUNT, NEVER A CONTENT. A leader is shown how many conversations are happening and never a conversation, how many prayer requests exist and never who wrote one. That is the same line the rest of the product draws, and it is drawn in the DATABASE — prayer_wall() and church_meeting_summary() return aggregates, and messages are unreadable to a leader by policy. Nothing here is a screen politely declining to render something it could have.

#### `components/LiveExport.tsx`

Taking the church's own data out of the app.

WHY A CHURCH NEEDS THIS. The data belongs to the congregation, not to us, and a church that cannot get a list of its own members out of an app is depending on us being here next year. The roster is the file somebody actually asks for: names, where they are, who walks with them.

EXPORT ONLY. The tutorial's version can also RESTORE, because its whole database is a browser tab and overwriting it costs nothing. Against a real congregation, restore means deleting live rows and putting older ones back, with a button in a screen, and there is no version of that which is safe enough to sit next to Download. Restoring a real project is a database job, and the handbook covers it.

EVERY ROW HERE IS A ROW THE READER COULD ALREADY SEE. This builds the file from the same calls the screens use, so the export can never widen access: it is subject to exactly the policies the person is subject to.

#### `components/LiveFeedbackInbox.tsx`

What people have actually said, where somebody can read it.

THE BUG BEHIND THIS SCREEN: "Feedback is not working, I am pretty sure some feedbacks are still stuck in the database since I haven't received any email feedbacks." Nothing was stuck. `setFeedbackSink` was never called anywhere, so every message went to the default sink, which honestly saves to the sender's own browser -- and there was no feedback table for anything to be stuck in. The messages are on the phones that wrote them.

Sending it somewhere was half the fix. This is the other half: a place to read it. A table nobody opens is the same complaint one level down.

NOT AN EMAIL, and worth saying because email is what was expected. The built-in mailer allows about two messages an hour for the whole project, so feedback routed through it would be dropped on exactly the days worth hearing about. This arrives instantly and cannot be rate limited.

#### `components/LiveGuildActivity.tsx`

*No header comment.*

#### `components/LiveGuildRoom.tsx`

Two things a Guide could not do, both on the Office screen.

`LiveAskToWalkWith` is the Guide's side: who is waiting, and a way to say "I have room for them" without catching a Director in a corridor.

`LivePairingRequestsForDirector` is the other side of the same table.

`LiveGuildRoom` is the Guides' room. A ROOM, NOT PRIVATE MESSAGES, and that is a safeguarding decision rather than a shortcut: every private conversation in this app happens in exactly one place and is reportable, and Guide-to-Guide direct messages would be a second private channel with no oversight. A room read by every Guide and by leadership is accountable by construction.

#### `components/LiveGuilds.tsx`

Guilds: the Directors' room for grouping Guides and Explorers, and the numbers that say whether those groups are actually alive.

A pairing is one Guide and one Explorer. That is right for discipleship and useless for everything a church does in groups — a campus, a cohort, a Sabbath team. A guild is that grouping with a name a Director chooses, and the naming is the part that matters to the people in it.

WHAT THE BADGES MEAN, spelled out on the screen rather than left to colour. A leader who cannot say what "thriving" measures will eventually trust it when it is wrong. The rules live in guild_metrics() (migration 0029) so the word and the number can never drift apart:

thriving somebody wrote in the last 14 days, every Explorer has a Guide, nobody is suspended steady written to in the last 45 days, nobody suspended watch somebody is suspended, OR an Explorer here has no Guide stagnant nothing written in 45 days, or the guild is empty

#### `components/LiveHallOfJustice.tsx`

The Hall of Justice: what is being heard, and who is in the room.

ASKED FOR: "Any Director, ED, and Head can join the trial room (the court room should look like a UI game where it is looks like a virtual Hall of Justice Room)", and then, corrected twice: "yes do that, except trials about themselves or fellow Directors", and then "what I mean ED, Director and Head Director can join is they are on the sidelines and can monitor the hearing. That's all. The only one who accepted the case will be main Judge Director."

WHAT THIS FILE IS NOT ALLOWED TO DECIDE. Every rule lives in migration 20260916120000. `trials_i_may_sit_on` already excludes a case about the person asking and, unless they are an Executive Director, a case about a Director. So a list that is empty is a list of cases they may not watch, and this screen cannot widen that by drawing a button.

#### `components/LiveLibrary.tsx`

The church library, against a real database. See migration 0008.

A resource is a title and a LINK, or a FILE kept in the church's own storage (20260925100000). What it must never be is a file held in one person's browser: that was a bug the sibling deployment shipped -- a Guide "shared" a file from IndexedDB, an Explorer received a title with nothing behind it, and the player sat at 0:00. A link opens on any device, and so does a file the church keeps; a file in IndexedDB opens on one.

The Explorer's view is not a filtered copy of the Guide's. Both call the same function and the database returns different rows, because the policy already knows who is asking. A filter here would protect nobody.

#### `components/LiveLibraryRecord.tsx`

*No header comment.*

#### `components/LiveMeetings.tsx`

Booking a time together, for the two people in a pairing.

THE GAP THIS CLOSES. The tutorial has had this card since the beginning and the live app never did. What live shipped instead was "Your reminders": a private checklist only the Guide could see. Those are different things. A reminder is a Guide talking to themselves. A meeting is two people agreeing on a time, and agreeing is the whole point of an app about walking with somebody.

The database was ready. Migration 0009 created `meetings` with a title, a time, online or in person, a place, notes and a status, and wrote policies that let BOTH people read, create, edit and cancel. Nothing about this needed designing; it needed building.

THE EXPLORER CAN PROPOSE, NOT ONLY ACCEPT. That is deliberate and it is what the policies already allowed. Somebody who can only ever be summoned is not walking alongside anyone.

#### `components/LiveMinistry.tsx`

The rest of the ministry, live: recommendations, a Guide's private tools, and lesson series. See migration 0011.

WHAT IS PRIVATE HERE, AND FROM WHOM. Notes and follow-ups belong to the Guide who wrote them and to nobody else — not the Explorer they are about, not the Director above them. A private note a leader can read is not a private note, so that is a policy (`author_id = auth.uid()`) rather than a screen that declines to render.

#### `components/LiveMyData.tsx`

*No header comment.*

#### `components/LivePrayer.tsx`

Prayer, against a real database. See migration 0007.

Three components because there are three genuinely different views, not three styles of one view:

LiveAskForPrayer the Explorer's own — raise one, withdraw one, and pray for what their Guide has asked of them LivePrayerForGuide what their Guide sees, WITH the name — and where the Guide asks the people they walk with to pray for them LivePrayerWall what the congregation sees, with NO name

PRAYER RUNS BOTH WAYS (migration 20260924100000). Whoever asked, the other side can say "I am praying for this" and the asker is told; only the asker can withdraw it or call it answered. A request is somebody's words arriving on somebody else's screen, so every one that arrives carries a Report link on the same card: the words are copied into the report and every Director is told, and the person reported is not.

#### `components/LiveProgressReport.tsx`

The progress report in a church's own app: the same screen as the sample church's (components/ProgressReport.tsx), given what the database lets this reader see.

A GUIDE asks for their pairings, the journey, their meetings, the lessons sent and their own follow-ups. LEADERSHIP asks for the pairings and the journey only: the rules give leadership every Explorer's stage and its history, and nothing inside a pairing, and this screen does not ask for what it would not be given. No policy changed for it.

It keeps up: a stage moved, a study confirmed or a lesson finished elsewhere changes the report while it is open.

#### `components/LiveSafeguarding.tsx`

Safeguarding on the live app: raising a report, and a Director acting on it.

The demo has had this since it was asked for. The live database had nothing, which meant a real church with real members had no route at all — the exact inversion of where it matters.

The rules live in the database (migration 0021), not here. A Director reads reports because a policy says so; an Explorer cannot, whatever this file does. That ordering is deliberate: a screen that forgot to filter would leak nothing, because the rows never arrive.

#### `components/LiveSecurityAudit.tsx`

*No header comment.*

#### `components/LiveStudies.tsx`

Lesson studies a Guide writes, and an Explorer opens.

WHAT WAS THERE BEFORE. A flat list of series titles and nothing else. No lessons inside them, no files, nothing to click. A Guide could not write one at all: the database policy on lesson_series was manages_church(church_id), so only a Director could, and the person actually sitting with somebody week by week could only look at a list.

WHAT IT IS NOW. A Guide writes a series, adds studies to it, attaches the handouts they already use, and publishes it. Anybody in the church can open it and read the studies and the files. Directors keep the same power over everything, which is what manages_church still means.

A DRAFT IS VISIBLE TO ITS AUTHOR ONLY, which sounds obvious and is the thing the old read policy got wrong: is_published alone meant a Guide could not see what they had just written until they published it, which makes writing it impossible.

#### `components/LiveTrialRoom.tsx`

The trial room.

WHY A CHURCH NEEDS THIS AT ALL. Hope Beacon puts two people in a private conversation. Reports (migration 0021) tell the leadership when that goes wrong; without this they can read the report and do nothing about it. A safeguarding system that ends at "we have been informed" is not one.

TWO ACTS, KEPT SEPARATE ON PURPOSE:

SUSPEND ("jail") The account is switched OFF (0026). They stay in the church and keep their history, and cannot sign in at all; live sessions are dropped so somebody already signed in is out at once. Reversible — releasing them switches it back on. This is both "we are looking into it" and "you are out until you have spoken to us", and most real situations are one of those, not expulsion. REMOVE ("kick") They are gone.

#### `components/LiveWriteNotice.tsx`

Writing an announcement, on the Publish screen.

SPLIT OUT OF LiveBillboard, which is where it was written and the wrong place for it to live. The billboard is the church's home screen: a person opening it is reading what the church has said, and a composer sitting on top of that screen made a reader's page into a writer's page for the three roles who can write. Writing now has a room, and the billboard shows the notices.

The take-down controls stayed on the billboard, beside the notice they act on. Deleting something is about the thing in front of you; writing is a task you go somewhere to do.

#### `components/LookBeforePaint.tsx`

Puts this device's look on <html> before the first frame (lib/look-before-paint.ts says why). Rendered first in <body> by app/layout.tsx, so it runs before anything below it is drawn.

#### `components/Mailbox.tsx`

*No header comment.*

#### `components/MediaPlayer.tsx`

*No header comment.*

#### `components/Meetings.tsx`

*No header comment.*

#### `components/MenuList.tsx`

The Menu tab: every room this person has, written out, one tap each.

ONE LIST, THE SAME ONE AS THE DESKTOP RAIL. The rooms come from railGroupsFor() in RoomRails.tsx, which is what the left rail draws at 1280px and up. So a room added for one role appears in both places or in neither, and a phone can never again be missing a room a desktop has -- the defect tests/live-header-fits.mjs was first written to catch, when the Office was reachable on a Mac and nowhere else. The sample side and the live side both hand their groups to this component, so they cannot drift either.

SHAPED LIKE THE MENU PEOPLE ALREADY KNOW: who you are at the top, then the places you can go, then the way out at the bottom. The picture that asked for it was a messaging app's own Menu tab; the rows here are this app's rooms and nothing else. Emoji mark each room as they do on the rail (decoration, which Glyph.tsx allows); the chevron you press toward is drawn.

#### `components/MessageBox.tsx`

The box you write a message in.

WHAT WAS WRONG. It was an `<input>`. A single line, 4000 characters allowed into it, and no way to see more than about forty of them at once. Somebody writing a real message — the kind people actually send their Guide, several sentences about something difficult — could see only the fragment under the cursor, and the text scrolled sideways as they typed. It was reported as "I can't see the whole message, and I can't scroll up or down", and the second half of that sentence is the diagnosis: there is no up or down in a one-line input. Nothing was broken, and nothing could have been scrolled.

WHAT IT IS NOW. A textarea that grows as you write, up to a cap, and scrolls inside itself after that. It starts exactly one line tall, so a short reply looks and feels the way it always did.

#### `components/MinorBadge.tsx`

*No header comment.*

#### `components/ModeSwitch.tsx`

Move between the live app and the offline tutorial.

THEY ARE TWO SEPARATE THINGS. Live keeps real people in a real database and is invitation-only. The tutorial invents its people in this browser, works on a plane, and cannot reach a database at all. Neither is a cut-down version of the other — the same screens and the same features, different data behind them — and this control exists so nobody has to take that on trust.

It used to only DESCRIBE the mode, because the mode was fixed at build time by whether Supabase keys were present. A visitor to a deployed church app could not reach the tutorial by any route, and the one link this panel offered pointed at a query parameter nothing read. lib/tutorial.tsx moved the choice to runtime, so this now actually moves you.

It can only ever move in the safe direction. Choosing the tutorial cannot touch a database; leaving it cannot conjure one that was never configured, which is why a deployment with no keys is told what it would take rather than given a button that looks like it worked.

#### `components/MySeries.tsx`

*No header comment.*

#### `components/NewBadge.tsx`

"New", for seven days.

WHY IT EXPIRES. A badge that never comes off stops being information and becomes decoration: after a month every second person is "new" and nobody reads it. Seven days is roughly a week of church life, which is the window where somebody actually is new to the people around them.

IT IS COMPUTED, NEVER STORED. A stored boolean is correct on the day it is written and silently wrong a week later, with nothing to tell anybody it has gone stale. This reads the date it already has, every time it draws, so it cannot drift.

WHICH DATE. signup_completed_at is when they chose a password and actually arrived, which is what "new" means to the people meeting them. created_at is when a Director typed their address, which can be weeks earlier and would make somebody who joined this morning look like an old hand. It falls back to created_at only when the first is missing.

#### `components/NotificationBell.tsx`

*No header comment.*

#### `components/OnlineStatus.tsx`

*No header comment.*

#### `components/PlaceSearch.tsx`

Where to meet: type part of a name, see the places it could be, tap one.

ASKED FOR, 26 September 2026: "I can't see my destination if it's really going to be that destination unless I already input the destination. I need to see the destination name, like auto name in google search, then just click or tap it to secure the location."

So the box does three things a plain text box did not:

1. It SUGGESTS as you type -- places you have met before first, then places from the map -- each with its street, barangay, city and province, so the right branch of a restaurant with five branches can be told apart. 2. Tapping one SECURES it: what is saved is that place's name and address plus a map link to its exact spot (lib/live/place-pin.ts), so the other person opens the place that was chosen, not a guess from the words. 3. It SHOWS what was chosen, with a way to check it on the map before anybody is asked to go there, and a way to change it.

#### `components/PlayerBar.tsx`

The player, in two sizes.

`PlayerStrip` is the right-rail version: what is playing, the transport and the volume. It is the one people see all day, so it is deliberately small.

`PlayerPanel` is the library version: a picture when there is one, the full transport, and the things you choose from underneath it, in tabs.

BOTH DRIVE THE SAME ELEMENT. See lib/player.tsx: it lives above both, in the root layout, so pressing play in the rail and then opening the library does not start a second copy, and leaving the library does not cut the sound off. A video's picture moves to whichever of them is showing it and its sound never stops.

WHAT A PLAYER HAS TO HAVE, and this had none of it: a progress bar you can drag, the time so far and the time left, previous and next, and a mute. A play button and a volume slider is a toy.

#### `components/Playlists.tsx`

Playlists, and a player that keeps going.

PORTED FROM OPEN MORBITAL (github.com/Klydo131/open_morbital_official), used under AGPL-3.0 as part of this work; see NOTICES.md and lib/playlists.ts. Morbital's shape is kept: a named, ordered list of track ids, with a queue that has shuffle and repeat over it.

WHAT THIS ADDS THAT MediaPlayer DOES NOT. MediaPlayer plays ONE item, chosen by tapping it, and stops at the end. That is right for a Guide opening a study video somebody shared. It is not a music player: there is no next track, so listening to eight songs means going back to the list eight times.

The browser is still doing the playing — one <audio>/<video> element with `controls`, exactly as MediaPlayer does. What is added is only the part the browser cannot know: which file comes after this one.

#### `components/Pocket.tsx`

The pocket, on the desk. See lib/pocket.ts for why the marks are drawn rather than fetched, and why this lives in the browser rather than a table.

#### `components/ProgressReport.tsx`

The progress report, in the Office's Reports subroom: how the Explorers are moving along the journey, for a month or a quarter, in the shape an Adventist teacher or Bible worker would recognise. lib/progress-report.ts says what is counted, from what, and why each reader sees what they see.

ONE SCREEN, TWO HALVES. ProgressReportView draws a report from whatever it is given; the sample church's wrapper is below, and a church's own app's is components/LiveProgressReport.tsx, which asks the database.

THE NOTES ARE THE READER'S OWN, kept on this device for each period, the way a Bible worker's monthly report has a space for "other activities and experiences". They go into the Word file and the text, and nowhere else.

#### `components/Quest.tsx`

*No header comment.*

#### `components/QuestPicker.tsx`

*No header comment.*

#### `components/ReadingSettings.tsx`

LANGUAGE AND TEXT SIZE, IN ONE PLACE THAT BOTH SETTINGS PAGES DRAW.

REPORTED WITH A SCREENSHOT OF THE LIVE SETTINGS PAGE: "Open Hope Beacon is missing the general settings that the Local Church has, like make the letters big or small or general settings at all. Can we add the please for ALL users."

Every part of it was already built. lib/i18n.tsx has held the scale, the localStorage key, the effect that applies it to the root font size, and the words `textSize`, `small`, `normal`, `large` and `xlarge` translated into all sixteen languages, for as long as the file has existed. LocaleProvider is mounted in app/layout.tsx, so it was running on every page of the live app the whole time.

What was missing was the screen. app/settings/page.tsx -- the DEMO settings, the one inside the tutorial -- had a folder called "Language and size". components/LiveAccountPages.tsx, which is the settings page every real person actually opens, had five folders and none of them was that one. It did not even import useLocale. So the app could make its text bigger for anybody who was pretending, and not for anybody who was using it.

#### `components/ReportDialog.tsx`

Reporting somebody, in the moment you decide to.

The hard part of this is not the form. It is that a person about to use it is upset, unsure whether it "counts", and afraid of what happens next. Every choice here is aimed at that:

* WHAT HAPPENS IS STATED BEFORE THEY TYPE, not after they submit. The one fact that decides whether somebody reports at all is that the other person is never told, so it is the first thing on screen. * THE DETAIL BOX IS OPTIONAL. Requiring an explanation asks the person to write down the thing they are upset about before they are ready, and some will close the dialog instead. * NO "ARE YOU SURE?". A confirmation step reads as the app doubting them. Reporting is reversible in the sense that matters — a Director can close it as nothing to answer — so there is nothing to guard against. * IT CANNOT BE FIRED BY A MIS-TAP. The control that opens it is a plain text link, not a button sitting next to Send.

#### `components/Rich.tsx`

The renderer for lib/rich-text.ts.

The rules about what becomes bold, italic or a link live in lib/rich-text.ts and lib/linkify.ts, which are plain TypeScript with no JSX so the tests can import and exercise them directly. This file is only the drawing.

A DROP-IN FOR `<Linked>`, and the difference is the point. `<Linked>` is for text somebody typed into a message box: a chat line, a prayer request, a note under a ministry. Nobody writes `**` in those, and turning asterisks into formatting there would surprise the person who typed one.

This is for text somebody WROTE -- a study, meant to be read later by somebody else, with sections and emphasis. Fifteen of the sixteen studies on the shelf already carry that formatting and were showing it as asterisks.

#### `components/RoleSwitcher.tsx`

*No header comment.*

#### `components/RoomRails.tsx`

*No header comment.*

#### `components/Rooms.tsx`

*No header comment.*

#### `components/SabbathProgram.tsx`

The Sabbath program: plan the order of service for a Sabbath, then take it away (a Word file, a picture, text for a group chat) or share it with the church inside the app.

Asked for on 2 October 2026 for Guides "and all higher up accounts", and the same day: "simple to use (with Advance settings of course)", shareable with Explorers, ready for Canva without cost or legal risk, and usable on every device with or without a signal. docs/SABBATH-PROGRAM-RESEARCH.md records the open-source tools this was modelled on and what was taken from each.

ONE COMPONENT, THREE PLACES. The Office's Sabbath program folder, and the This Sabbath page (app/sabbath/page.tsx), in a church's own app and in the sample church. Nothing here reads the database: programs live on the device (lib/sabbath-program.ts says why), and sharing goes through the one function the page hands in, which uses the rules posts already have.

#### `components/SeekerNotes.tsx`

*No header comment.*

#### `components/SelfHeal.tsx`

*No header comment.*

#### `components/SentryBeaconMark.tsx`

The app's mark.

An open ring that flicks inward into a speech tail: a conversation someone left open. That is the product in one shape — one person staying with another — and the circle deliberately does not close.

TO USE YOUR OWN LOGO: replace RING and TAIL below with your own SVG path data, or replace the whole <svg> with an <img>. Then run `node scripts/gen-icons.mjs` so the favicon and the home-screen icons are regenerated from the same drawing. Colours come from lib/brand.ts.

Drawn as geometry rather than shipped as an image, on purpose. A pasted PNG is the thing people notice: it brings its own background, its own idea of white, its own soft edges, and it blurs on a high-density screen. This is vector at every size and sits on navy or on white with no halo.

#### `components/ServiceWorker.tsx`

*No header comment.*

#### `components/ShareSheet.tsx`

*No header comment.*

#### `components/SourceCard.tsx`

Where this app's source code is — offered from inside the app, on purpose.

THIS IS A LICENCE OBLIGATION, NOT A COURTESY. Open Sentry Beacon is AGPL-3.0, and section 13 says that anyone who MODIFIES the program and lets people use it over a network must prominently offer those people the source of the version they are actually using. A link on the signed-out front page is not enough on its own: most people who use this app never see that page again after their first visit.

IF YOU FORK THIS AND CHANGE ANYTHING, CHANGE SOURCE_URL in lib/brand.ts to point at your own repository. Leaving it pointing upstream while your deployment differs is the single likeliest way an honest church ends up in breach — it tells your congregation "here is the code you are running" and then shows them somebody else's.

#### `components/StrayFileDrops.tsx`

A file dropped where nothing takes files is ignored, not opened.

A browser's own answer to a file let go over a page that did not ask for it is to OPEN THE FILE: the tab leaves the app and shows the PDF or the picture instead. Whatever was being typed goes with it. Found on 28 September 2026, when a study being edited took files only on a small box at its foot, and a handout dropped a few pixels away from that box took the Guide out of the app and their edit with it.

Every place that takes files marks the drop as handled (FileDrop, DropArea, the Resources card, the bulk-invite list), and this listens on the window, after all of them, so it only ever sees a drop nobody took. It then does the one thing the browser would not: nothing. While a file is dragged over such a place the pointer says "not here" rather than inviting a drop.

#### `components/SubroomMenu.tsx`

Every sub-room of a room, in one drop-down, on every device.

ASKED FOR ON 30 SEPTEMBER 2026, with a screenshot of a Guide's home: "I want all sub-rooms to be drop down list or some kind of drop down for users to see all sub-rooms optimally in all devices. I realized users get confused that they need to slide sub-rooms and request a drop down feature instead to see all sub-rooms in a room like most modern websites do."

The strip it replaces scrolled sideways inside its own box, so on a phone the rooms past the edge of the screen were simply not there for anybody who did not know to swipe. A list that opens shows every one of them at once.

WHAT THE OLD STRIP GOT RIGHT IS KEPT ON THE CLOSED BUTTON. Rooms.tsx used to explain why it was not a drop-down: a closed menu hides how many rooms there are, and whether something is waiting in one you are not in. So the button says both -- "2 of 4", and a red count when something that needs doing is in another room -- and the question of whether to open it answers itself.

#### `components/TabBar.tsx`

Menu | People | My Files, along the bottom of every phone and pad.

WHAT IT REPLACED. Below 1280px the only way around the app was a row of emoji along the top: Church, Office, Publish, Library, Cases, Mail, Settings, sliding sideways under a thumb, with a gradient to hint that more were hidden past the edge. It worked, and it asked somebody to recognise eight small pictures, remember which one was which, and know to push the row to find the rest. That is a lot to ask of a person opening a church app on an older phone.

Asked for instead, with a sketch: "Can we have Menu | People | My Files as our bottom for our UI to make it simple in our Mobile and Pad?" Three words, always on screen, always in the same place, reachable by the thumb that is already holding the phone. Every room that was in the top row is in Menu, as a list with its name written out.

#### `components/ThisSabbath.tsx`

This Sabbath: the program the church has shared, on every member's phone, with or without a signal.

Asked for on 2 October 2026: the Sabbath program "can be share to Explorers too", and it must be "accessible to all devices, offline and online". The owner chose to send it as a post in the app (see components/SabbathProgram.tsx, "Share in the app"), so it arrives under the rules every post already has: the sender's name on it, readable only inside the church.

THE PHONE FIRST, THEN THE CHURCH. What this page shows comes from the device's own copy before anything is asked of the network, and the copy is brought up to date whenever the church can be reached. Signal is weakest in a church hall on the Sabbath morning, which is exactly when this is opened.

#### `components/TrendChart.tsx`

*No header comment.*

#### `components/TutorialBar.tsx`

The permanent "you are in the tutorial" bar, and the way out of it.

TWO SEPARATE FAILURES MADE THIS NECESSARY, both found by the owner opening the app rather than by any check:

1. THERE WAS NO WAY BACK. Pressing "Open the tutorial" took you to the tutorial's front door, which has no app shell around it — the mode switch lives in the header you only get AFTER choosing somebody to be. So the front door of the tutorial was a room with no exit, and the only way back to the real sign-up was editing the address bar.

2. IT LOOKED IDENTICAL TO THE LIVE APP. Same navy, same mark, same title, same gold button. Somebody who pressed the button and landed here concluded nothing had happened.

A timed notice was already in the layout (DemoRibbon) and could not fix either: it appears on a schedule, it can be missed, and it deliberately hides while the guided walk is running — which is exactly when somebody is most deeply inside sample data. What was missing is something that is simply always there.

#### `components/TutorialExtras.tsx`

The four things that only belong to the offline tutorial.

These used to be gated on IS_DEMO in app/layout.tsx, which is a server component and so can only read a build-time constant. On a church's deployed app that constant is permanently false, so the guided walk — the entire point of having a tutorial — could never appear there no matter what the visitor chose. Wrapping them in a client component is what lets the decision be made per visitor instead of per build.

The ribbon is the one that must not slip. A screen full of invented people with nothing saying so is how somebody types a real prayer request into sample data.

#### `components/TutorialHost.tsx`

*No header comment.*

#### `components/UiTheme.tsx`

Puts the look chosen on this device onto the page, once it has loaded.

The server always sends <html data-ui-theme="classic">, so Classic is there from the first paint and nothing moves for anybody who has not chosen otherwise. A look added later is applied here, after the first paint; if one ever needs to be there before it, that is a small script in the head, and the Content-Security-Policy in next.config.mjs has to allow it. See lib/ui-themes.ts.

#### `components/VersionWatch.tsx`

*No header comment.*

#### `components/WhatsNew.tsx`

*No header comment.*

#### `components/WhichApp.tsx`

*No header comment.*

#### `components/WritePost.tsx`

*No header comment.*

#### `components/WritingMode.tsx`

Simple or Advanced: how much of the study-writing form somebody is shown.

ASKED FOR on 28 September 2026: "Make sure the UI for making lesson studies are easy and simple use / Most guides are not much technical so there must be a simple and advance setting for it."

SIMPLE IS WHERE EVERYBODY STARTS, and it is the whole job: a name, the studies, their handouts and drawings, and Save. ADVANCED adds what a Guide who wants it can use -- a topic to group the series on the shelf, a line under its name, and the marks that make text bold or slanted, which are typed as asterisks and look like mistakes to anybody who has not been told.

ONE SETTING FOR THE WHOLE DEVICE, not one per form. Somebody who chose Advanced chose it for themselves, and being put back to Simple on the next study would be the app forgetting what they said. It lives in this browser only: it is a preference about the screen, not something the church needs to know. It never hides anything already written -- a topic typed in Advanced is still saved after switching back.

#### `components/draw/Draw.tsx`

The light half of the drawing board: the button, the picture, and the door the heavy half comes in through.

Everything a study screen needs to OFFER a drawing lives here and weighs nothing. The board itself (components/draw/DrawingBoard.tsx, with Excalidraw in it) is fetched by next/dynamic the moment somebody presses Draw a picture, so a Guide reading a study, or an Explorer, never downloads it.

#### `components/draw/DrawingBoard.tsx`

The drawing board: Excalidraw, full screen, for a picture that goes with a study.

ASKED FOR on 28 September 2026: "Make sure studies feature has Excalidraw on it's tools please, and make sure it works."

WHAT IT MAKES. A picture, saved as one PNG the study keeps like any handout: an Explorer taps it and sees it, on any phone. The drawing itself travels inside that PNG (Excalidraw's "embed scene"), so the person who drew it can press Change drawing and carry on with the same boxes and arrows rather than scribbling over a flat image. See lib/drawing-file.ts.

THE ONE RULE OF THIS FILE: nothing else imports it except through next/dynamic. Excalidraw is about a megabyte of script. It arrives when somebody presses Draw, and never on a screen where nobody is drawing -- tests/a-study-can-have-a-drawing.mjs holds that.

#### `components/draw/excalidraw-asset-path.ts`

Where the drawing board's fonts are, and nowhere else. Imported FIRST by DrawingBoard.tsx, before Excalidraw itself, and that order is the point.

Excalidraw works out every font's address from window.EXCALIDRAW_ASSET_PATH and falls back to esm.sh when that is unset. scripts/excalidraw-assets.mjs copies the fonts into public/excalidraw/, so the path is set to them here.

AND THE FALLBACK IS TAKEN OFF. Even with the path set, Excalidraw adds esm.sh as a second source on every font. The Content-Security-Policy refuses it, so nothing is fetched from there -- but a browser checks every source a font names the moment the font is made, and each check is a "Refused to load the font" in the console: about 230 of them every time the board opened (found on 28 September 2026 by tests/e2e/a-study-can-have-a-drawing.js, which listens for any request that leaves the app). So a font made while the board is loaded has its esm.sh sources removed before the browser sees them, as long as a source of our own is left. Nothing else about any font changes.

#### `components/live/AdminPage.tsx`

*No header comment.*

#### `components/live/DoorPages.tsx`

*No header comment.*

#### `components/live/ExplorerPage.tsx`

*No header comment.*

#### `components/live/Face.tsx`

Faces on the live app: the photo a person chose, wherever somebody who may see it sees their name.

Asked for on 30 September 2026: "I still can't see anyway to see the Explorers profile or their image display for Guides and higher up accounts." Every list a Guide or a Director reads drew initials, even for somebody who had uploaded a photo. The storage rule already allowed it (anybody signed in may read a face; nobody but its owner may write one), so nothing about who can see what has changed -- only that it is now shown.

#### `components/live/GuidePages.tsx`

*No header comment.*

#### `components/live/JourneyBar.tsx`

The Explorer's own journey, drawn as movement rather than as a category.

THE ASK: "There must be a progressive bar that the Explorers can see too that is aligned with the Journey that the Guide sees, so when the Guide progresses the Explorer, the Explorer can appreciate and affirm that he/she progresses in the Journey with the Guide (no labels yet for the Explorer to see, but a really good animated progress bar can be good to see)."

NO LABEL, NO NUMBER, NO TICKS, and each of those is a decision rather than an omission.

NO NAME, because tests/e2e/seeker-no-stage.js walks every screen an Explorer can reach and fails if any of the six stage words appears. That rule predates this bar and is untouched by it.

#### `components/live/MemberProfile.tsx`

What a Director sees when they open somebody.

THE TWO QUESTIONS THIS ANSWERS, both asked by the person running a church: "is this a real person I meant to let in?", and "does this pairing make any sense?" Neither could be answered from the roster, which showed a name, a role and a stage — everything the app knows about somebody was collected on sign-up and then only ever shown back to them.

IT IS A READ, NOT A FILE. No notes, no assessment, nothing a Director writes here. The moment a screen like this becomes somewhere to record an opinion about a member, it is a personnel file that the member cannot see and did not agree to. The one place a judgement is written down is the safeguarding record, where it is deliberately permanent and deliberately reviewable.

AND IT SHOWS ONLY WHAT THEY CHOSE TO GIVE. Every field below is optional on the sign-up form; a blank is a person who declined, and it is drawn as "not given" rather than left as an empty row, because a Director should be able to tell "did not answer" from "the screen is broken".

#### `components/live/NextStudy.tsx`

One sentence telling an Explorer what to do today.

WHY THIS EXISTS. Twenty-one studies are published in this church and two have been read. Nothing was broken in the library: the pairings are made, nobody is unpaired, materials are shared. What was missing is this card. My Journey opened on four folders and not one of them opened with a next step, so the studies sat behind a folder called Study and waited to be gone looking for.

BY NAME, NOT BY COUNT. "You have 13 studies left" is a chore. "A king who could not sleep" is a thing somebody might want to read. The title is the whole point of the card, so it is the largest thing on it.

AND A NUMBER THE EXPLORER MOVES THEMSELVES. The journey bar above this shows what the GUIDE has decided about somebody, and it does not move when they read. This one does, and the two sit together on purpose: what somebody else thinks of your progress, and what you actually did.

#### `components/live/ReadingProgress.tsx`

How far through the studies somebody has got.

THE ASK: "Can we add the progress bar that can be recorded by the EDs and Directors if the Explorer is really Reading the Lesson studies from the samples and the Guide made for the Explorer."

ONE COMPONENT, THREE SCREENS. The Explorer sees their own bar above their studies, a Guide sees it on the person they walk with, and a Director or Executive Director sees it on the member's card. Three copies of a percentage calculation is two chances for the Director's number to disagree with the Explorer's, and a leader and a member looking at different figures for the same thing is worse than having no figure at all.

THE NUMBER IS NOT DECORATION. `BeaconLoader` carries a rule in its header that a bar must never invent a percentage, and this one obeys it: the numerator is rows in `lesson_reads` and the denominator is lessons that exist. When there is nothing to read the bar does not draw at all, because zero out of zero is not nought per cent, it is a question with no answer.

#### `components/live/TalkDock.tsx`

The chat that is always within reach, and says when somebody is waiting.

ONE SHAPE NOW, AT EVERY SIZE: a bubble you tap, and a conversation over the page rather than instead of it.

PHONE / PAD bubble in the corner, opening to the WHOLE SCREEN. WIDE the same bubble, opening to a panel beside the page.

WHAT THIS REPLACED, AND WHY THE OLD REASONING WAS HALF RIGHT. This used to be `hidden xl:block`, so only a very wide screen got the floating chat. The comment here defended it: "a small floating panel on a small screen covers the thing it floats over, which is why the phone does not get one." That is true, and it is still true.

What it missed is that the panel does not have to be small. A phone was sent to /talk instead -- a PAGE, which means navigating away from whatever you were reading and losing the place you had scrolled to, every time you want to see whether somebody replied. Reported exactly that way: "I dont like this as a separate sub room on the phone or pad, I want it as a bubble like what you did at desktop."

#### `components/live/TalkSurface.tsx`

Talk: the conversation as a place you go, not a card you scroll past.

WHAT THIS IS FOR.

Reported: "most users want always the present chat that doesn't need to scroll down for other features, specially for Explorers. For guides... they want the Chat to be exclusive only because it's their main connection to the Explorers."

Before this, an Explorer's conversation was a card on a page with a journey bar above it and a library below, and a Guide's was one tab of five inside one Explorer's page — so a Guide with five Explorers had five places to look and no way to see who was waiting.

WHAT IT DELIBERATELY IS NOT. This is not a rebuild of anybody's messenger. The shapes a chat needs — a list that puts the waiting ones first, a thread, a count on the way in — are older than any of those products, and everything here is built out of this app's own pieces: the same `Conversation` the two pages already used, the same pairing rules, the same report control that must travel with a conversation wherever it goes. There is no presence, no typing indicator, no receipts beyond the one this app already had, and no channel that is not a pairing two people are already in.

#### `components/live/shared.tsx`

*No header comment.*

#### `components/music/ConductorPanel.tsx`

The Conductor folder: a metronome that beats the way a conductor does.

The clicks come from lib/music/metronome.ts, on the audio clock. The baton is drawn from the same clock every frame: a dot that falls into each beat of the pattern (2, 3, 4 or 6) and rises out of it, so the choir can watch the beat as well as hear it. It can also run silent, the baton alone, for a conductor following it during a service.

The dot is moved by setting its position directly each frame rather than through React state, so the page does not re-render sixty times a second; only the beat number does, once a beat.

#### `components/music/Listen.tsx`

Listen: the media player, its playlists and the calming sounds, moved here from My Files on 4 October 2026 ("take out the audio tools from the library").

THE FILES THEMSELVES DID NOT MOVE. Music somebody saved is still in their device library (lib/localMedia.ts), so My Files still lists it and still plays any one file with its own Play button; this room is where it is played as music, in order, with the full player. Music added here is saved to the same place, so it shows up in both.

#### `components/music/MusicRoom.tsx`

The Music room: for everybody who sings, plays, or only listens.

Asked for on 4 October 2026: "another room for music for music lovers and choir. Put the main audio tools to it ... I want a tuner, a piece scanner, and beat maker (where you can track the beat like a conductor)." Four folders, one per job:

Listen the media player, playlists and calming sounds, moved here from My Files (which keeps a Play button on each file) Tuner which note you are singing or playing, and how far off Conductor a metronome that beats the pattern a conductor's hand draws Pieces a photo of a page made clean, and a score file played part by part so a singer can learn theirs

EVERYTHING HAPPENS ON THE PHONE. Nothing in this room talks to the church's database or to anybody else: the microphone is measured and thrown away, a photo is straightened on the phone, a score is read on the phone, and what is kept is kept on the phone. tests/the-music-room.mjs holds that line.

#### `components/music/PageScanner.tsx`

Photo to clean page: choose a photo of a page of music, put a dot on each corner of the paper, and get the page back flat, cropped and black on white. The arithmetic is lib/music/page-scan.ts; this is the screen around it.

THE PHOTO NEVER LEAVES THE PHONE AND IS NOT KEPT. It is read into memory, shrunk, and dropped once the clean page is made. Only the clean page is saved, and it is drawn fresh from pixels, so nothing the camera wrote into the photo (where it was taken, which phone) comes with it.

THE PHOTO PICKER, NOT THE CAMERA. A plain image input lets somebody take a picture or pick one they already have, and the browser asks nothing. Using the camera directly would need a camera permission this app does not ask for anywhere (next.config.mjs: camera=()).

#### `components/music/PiecesPanel.tsx`

The Pieces folder: the choir's music, kept on this phone. Two kinds:

a clean page, made from a photo by the scanner (components/music/PageScanner) a score file (MusicXML), opened to see and hear every part (ScoreView)

Kept in the room's own store (lib/music/pieces.ts), apart from My Files. A saved score is checked again every time it is opened, exactly as when it was first chosen: what is on the phone is trusted no more than a new file.

#### `components/music/ScoreView.tsx`

A score to learn a part from: every line of a MusicXML file, drawn as notes on a strip (higher notes higher, longer notes longer) and played by the phone, with your own part louder, any part silent, at any tempo, from any point you tap.

NOT PRINTED NOTATION, AND THAT IS A DECISION WITH A REASON. Drawing real staves, clefs and beams needs an engraving library, and the one built for the web (OpenSheetMusicDisplay) brings 82 packages, a megabyte and a half of code, and evaluated code this app's security rules forbid (docs/MUSIC-RESEARCH.md). A singer learning a part needs to hear it and see where it goes; the printed page is what the scanner is for.

Everything a person wrote into the file (titles, part names) reaches the screen as text, never as markup.

#### `components/music/TunerPanel.tsx`

The Tuner folder: the note you are singing or playing, how far off it is, and a pitch pipe to give the choir its starting note.

The microphone is opened by lib/music/tuner.ts only after Start is pressed, and released on Stop, on leaving this folder, and when the phone locks. What it hears is measured on the phone and thrown away.

#### `components/study/StudyInsertBar.tsx`

The way to insert something when there is no `/` key to press.

REPORTED, WITH A PHOTOGRAPH OF AN ANDROID PHONE: the `/` typed into the page and sat there as a character. No menu, nothing.

WHY, AND IT IS NOT A BUG IN BLOCKSUITE. Their slash menu opens on a `keydown` for the `/` key. A phone's on-screen keyboard does not send those: GBoard and its cousins send composition and `beforeinput` events, and the character arrives without any keydown the menu could recognise. AFFiNE knows this -- their own slash menu declines to register on a mobile scope at all, and their answer is a bar above the keyboard instead.

SO WHY NOT USE THEIRS. Because it only exists while a virtual keyboard is open, and there is no virtual keyboard in a headless browser: it cannot be tested here, at all, by anybody. This project has shipped four things that could not be tested here and the owner found every one of them. A bar this app draws itself is one that a browser walk can open, press and assert on.

#### `components/study/StudyRoom.tsx`

The Explorer's study room, and the gate that keeps it from costing everybody.

ASKED FOR: AFFiNE as the Explorer's special room, "a special room like the library page... the whole Affine features like this but with Hope Beacon brand", and then, plainly: "If I click the study room I want to see this with the brand of Hope beacon, if I want to exit the study room, then I will go back to Hope Beacon web page, simple as that."

THE ONE RULE OF THIS FILE. The editor is the heaviest thing in the app -- around 800 kB gzipped against roughly 540 kB for everything else put together. It is loaded here with next/dynamic and ssr:false, which is what puts it in its own chunk and keeps it out of the shared bundle. A plain import instead of this one would put it on the sign-in screen.

THERE IS NO LONGER A BUTTON, and that is the point rather than a loosening. The room used to be a card inside another screen with an "Open my study room" button, because three megabytes should not land on somebody reading their journey. It now has a route of its own and nothing else renders it, so walking into /study IS the asking -- and tests/the-study-room-is-paid-for-on- arrival.mjs holds that: one importer, arriving dynamically, rendered from one route.

#### `components/study/StudyRoomEditor.tsx`

The study room: a workspace of pages, and the editor for one of them.

THE ROOM IS LIGHT AND THE EDITOR IS HEAVY, and keeping those two facts apart is the shape of this file. The full AFFiNE feature set -- the canvas, the databases, the embeds, the code highlighter's WebAssembly -- is over a megabyte gzipped. The list of pages needs none of it.

So nothing here imports the drawing half at the top. `lib/study/effects.ts` and `lib/study/view-extensions.ts` are fetched with `await import(...)` at the moment somebody opens a page, which is the moment they have asked for an editor. Opening the room itself pays for the schema and this screen, and the page list appears while the editor is still arriving.

AND THE WHOLE THING IS STILL BEHIND ONE ROUTE. components/study/StudyRoom.tsx is the only importer and uses next/dynamic with ssr:false. Importing this anywhere else silently puts the editor on every screen in the app, and tests/the-study-room-is-paid-for-on-arrival.mjs is there to stop that.

#### `components/study/StudyShelf.tsx`

The shelf: every page in the room, before you open one.

ASKED FOR, WITH A SCREENSHOT OF AFFiNE'S OWN "All docs": a list of documents with a preview line and a date, a star on each, grouped by when they were last touched, with a search over the top -- "I want the whole Affine features like this but with Hope Beacon brand please."

WHY A LIST AND NOT THE TABS THIS REPLACED. A strip of chips is fine for three pages and useless for thirty: no preview, no dates, no order, nothing to search, and on a phone the eleventh page is off the side of the screen with nothing to say it exists. The library room in this app already solved the same problem the same way, which is exactly why it was named in the request.

GROUPED BY WHEN, NOT BY NAME. It is how somebody looks for the page they were writing on Tuesday. Alphabetical order helps when you know what a thing is called, and a study room is full of pages nobody has named.

#### `components/study/StudyTags.tsx`

The tags on the page somebody has open.

ASKED FOR, IN THE SCREENSHOT OF AFFiNE'S "All docs": a tag on each row and a list of tags to filter by. The field has been in BlockSuite's own DocMeta all along; nothing had ever written to it.

THE INPUT OFFERS WHAT THE ROOM ALREADY USES, which is the whole difference between a tag list and a pile of near-misses. Left to type it fresh, somebody writes "Romans", "romans" and "Romans 8" over three weeks and ends up with three tags that mean one thing. The datalist puts the room's own tags under the cursor, and `withTag` folds a difference in capitals into whichever spelling got there first.

IT IS UNDER THE TITLE, NOT BEHIND A MENU. A tag added later is a tag never added: the moment somebody knows what a page is about is the moment they name it, and that is the moment the title is being typed.

#### `components/study/StudyWorkspaceShell.tsx`

The Study Room as a room you walk into, and walk back out of.

ASKED FOR, IN THESE WORDS: "If I click the study room I want to see this with the brand of Hope beacon, if I want to exit the study room, then I will go back to Hope Beacon web page, simple as that."

So it takes the screen. Not a card on a page with the app's rails either side of it, competing for a 360px phone with a header, a left rail and a right rail: the workspace fills the window, and one clearly marked way out puts somebody back in the app.

WHY AN OVERLAY RATHER THAN A DIFFERENT SHELL. The screen still has to be behind the same gate as every other live screen -- signed in, an Explorer, the same redirect when they are not -- and that gate lives in LiveAppShell along with the chrome. Rendering over the top keeps one authorisation path for the whole app rather than a second one written for this room, which is the kind of duplicate that ends with a screen nobody remembered to protect.

#### `components/talk/ChatAttachment.tsx`

One attachment in a conversation, drawn the same way on both halves.

A PICTURE LOOKS LIKE A PICTURE, A VOICE MESSAGE PLAYS, A FILE IS A CARD. Decided by the mime type both halves already store:

image -> the picture itself, rounded, with no bubble around it; a tap opens it full screen inside the app (ImageViewer), not in a new browser tab that leaves the conversation behind audio -> a player: play, a bar to move through it, the length. A voice message (lib/talk/voice.ts) says "Voice message"; an audio file somebody chose says its name video -> the sample app only (the live store refuses video); plays inline other -> a card with the file's name and size, which opens it

WHERE THE BYTES COME FROM IS THE CALLER'S BUSINESS. The live half signs a short-lived URL for a private file; the sample half makes a URL from bytes kept on this device. Both arrive here as `load()`, and `release()` lets the sample half free its URL when the picture leaves the screen.

#### `components/talk/ChatView.tsx`

The conversation: one component, drawn by both halves of the app.

ASKED FOR ON 1 OCTOBER 2026, with a screenshot of the chat: "Can we improve the chat more to be modern looking and functional as well ... most people are digital natives. All users should feel familiar and welcoming to our app (with unique design for sure)." Chosen: keep the soft tints (yours teal, theirs warm sand) and sharpen the shape; add reactions, replies and voice messages.

ONE COMPONENT FOR BOTH HALVES. The sample app (components/Chat.tsx) and the live app (components/live/shared.tsx, Conversation) had drifted into two different chats. Each now only fetches and saves; everything you SEE is here, so the sample is the live app one-to-one and a fix lands in both.

WHAT IS FAMILIAR, ON PURPOSE: * Bubbles in runs: one person's messages within five minutes sit close, their inner corners tighten, and the time is said once, at the end. * The time and the receipt sit INSIDE the bubble, at the end of the last line, instead of on rows of their own underneath. * Hold a message (or right-click, or ⋯) for React, Reply, Copy, Edit and Delete. Swipe a message to the right to reply to it. * Pictures without a bubble around them, opening full screen in the app. * A message of only one to three emoji is drawn large, with no bubble. * A button back to the newest message when you have scrolled up, with how many arrived meanwhile.

#### `components/talk/Composer.tsx`

Where a message is written: one rounded bar, the way every chat app has it.

ASKED FOR ON 1 OCTOBER 2026, the composer ringed in red on a phone: a boxed paperclip, a tall grey field, and a pale circle that looked switched off. Now:

[paperclip] ( Write a message… ) (●)

* The paperclip is a plain icon, not a box. It is still a full-size target, and still says "Attach a file" to a screen reader. * The field is a pill that grows with what is typed (MessageBox: emoji by :name, Enter to send on a computer, Return for a new line on a phone). * ONE ROUND BUTTON, and it says what it will do. Empty: a microphone, to record a voice message, where the browser can. Something typed: a solid Send. Changing a message: Save. Never a faded circle that looks broken.

#### `components/talk/Dock.tsx`

The chat bubble's frame: the bubble, the sheet it opens to, the one header inside it, and the list of conversations. Drawn by BOTH halves of the app.

ONE FRAME FOR TWO HALVES. The live bubble (components/live/TalkDock.tsx) and the sample one (components/DemoTalkDock.tsx) fill it with their own data -- the live database, or the sample store -- and nothing else. The tutorial and the sample app are what a church is shown before it signs up; a bubble that looked or moved differently there would be teaching the wrong app.

WHY THE CHAT LIVES HERE NOW. Asked for on 30 September 2026, with a screenshot of a Guide's Talk tab: "take out the chat in 'talk' room and rename talk to just appointments. Let's just improve talk to our bubble chat with smooth animations too and smooth UI design in our chat system (including the report system in the bubble chat). It's annoying for the users to scroll down for appointments usually." The pages keep the appointments; the bubble keeps the talking, and the way to report travels with it into the header.

#### `components/talk/MessageButton.tsx`

"Message them": the way into a conversation from a page about one person.

The conversation used to be ON these pages, above the appointments, so a Guide or an Explorer scrolled past the whole thread to arrange a time. It lives in the bubble now (components/talk/Dock.tsx), and this opens the bubble straight at the right person -- on both halves of the app, since the sample and the live pages draw the same button.

#### `components/talk/MessageMenu.tsx`

What you can do with one message: react, reply, copy, change or take back.

ONE MENU, OPENED THE WAY EVERY MESSAGING APP OPENS IT. Hold a message on a phone, right-click it on a computer, or press the small ⋯ beside it (which a keyboard reaches too). It used to be two underlined links -- Edit, Delete -- inside every message you had ever sent, which made each of your bubbles two lines taller and put a red word in the middle of the conversation. Asked for on 1 October 2026 with a screenshot of exactly that.

A SHEET FROM THE BOTTOM OF THE CONVERSATION, at every size. On a phone that is where the thumb is; in the desktop panel it is the same panel. The message it is about is lit where it sits AND quoted at the top of the sheet: lifting the bubble above the dimmed thread put it on top of the reactions whenever it sat low on the screen (seen in the first screenshot), and a quote is never in the way.

#### `components/ui.tsx`

*No header comment.*

## A.3 Libraries

#### `lib/about-you.ts`

The two questions with a fixed set of answers.

WHY THEY BECAME LISTS. Gender and Status were open text boxes, and six people had answered before this changed: `Female`, `male`, `M` for one, and `Married`, `S` for the other. Five different shapes from six people, which is what an open box gets you — and it makes the answers useless for anything except reading one at a time, because "M" and "male" and "Male" do not group.

KEEPING WHAT SOMEBODY ALREADY WROTE IS THE HARD PART, and skipping it is how this kind of change quietly destroys data: render a `select` whose value is `M`, and the browser shows the FIRST option instead, so the next time that person saves anything at all their answer silently becomes "Male" — or blank. They were never asked and never told. `optionsFor` therefore carries any existing answer into the list, so it stays selected and stays theirs until they choose to change it.

#### `lib/activity.ts`

The church activity billboard — "what's happening", composed from real demo data rather than a hardcoded list.

The hard rule here is the same one the /church board has always kept: the shared feed shows NO individual seeker's private journey. A milestone is celebrated in the aggregate — "someone reached the Care stage" — never "John reached Care". A seeker glancing at the billboard learns the church is moving, not who is where. Anything that needs a name to be useful (a new sign-up to vouch for, an approval to grant) is not in the shared feed at all; it lives in the privileged strip below, which only Admin and Executive ever see, and only because acting on it is their job.

#### `lib/analytics-trend.ts`

*No header comment.*

#### `lib/app-update.ts`

*No header comment.*

#### `lib/apple-install.ts`

What an Apple device calls the thing everybody else calls Install.

THE ASK, from the owner: "Do not put Install when it is Safari or the device is made by Apple. Install is too misleading for Apple users."

They are right, and the code already half knew it. InstallPrompt carries the note "Apple has no programmatic install, so Install now cannot install", and the button was labelled Install anyway. On an iPhone or iPad the control is called Add to Home Screen; on a Mac it is Add to Dock. Neither menu contains the word Install anywhere, so somebody told to press Install goes looking through a Share sheet for a word that is not in it, and concludes the app is broken rather than that the instruction was wrong.

THE THREE ARE NOT ONE. An iPhone and an iPad were treated as a single case and they are not: the Share button is at the BOTTOM of Safari on an iPhone and at the TOP, in the toolbar, on an iPad. A Mac has no Share button in the steps at all, it has a menu bar. So they get three sets of words.

#### `lib/auto-update.ts`

When is it safe to reload the app out from under somebody?

Pulled out of components/AutoUpdate so it can be exercised directly. The end-to-end suite can prove the app does NOT reload while a message is half-written, but it cannot reliably prove the opposite half — that a cleared box lets the update through — because that needs a genuinely newer service worker waiting, which a single-build test harness does not have.

A test that only ever demonstrates the blocking case would pass just as happily on a guard that blocks FOREVER, which is a real bug wearing the costume of a working one. So the decision lives here, in a function with no timers and no side effects, and both answers get asserted.

#### `lib/backend/feedback.ts`

Where feedback goes — and the one place this app talks to a server.

THIS FILE IS THE POINT OF THE PROJECT, so it is worth reading even if you skip everything else.

Open Sentry Beacon has no backend. Every screen runs from a store in the browser, so the app installs, works offline and demonstrates itself with no account, no database and no configuration. That is deliberate: a church should be able to try the whole thing before deciding anything.

But a real deployment needs somewhere for a member's message to actually go. Rather than pick a provider for you — Supabase, Firebase, a mailbox, a spreadsheet, a self-hosted API — the app asks a SINK. The default one keeps everything on the device. Swap it for your own in one call and nothing else in the app changes.

#### `lib/backup.ts`

Data export / backup for a church.

The whole point: the church owns its data. It can take a full copy out whenever it wants (a real safety net), and put a copy back (restore). Kept dependency-free — a backup is just JSON, a roster is just CSV, both readable with tools every church already has (Notepad, Excel, Google Sheets).

#### `lib/brand.ts`

*No header comment.*

#### `lib/build-info.ts`

GENERATED by scripts/stamp-build.mjs before every build. Do not edit. One value per build, imported by both the browser bundle and the server route so the two can never disagree about which build is running.

#### `lib/calendar.ts`

Putting a Sabbath program or a series of meetings on somebody's own calendar.

Asked for on 2 October 2026: "there can be an option to put it automatically on their digital calendars". Two ways, both free and both the person's own act:

* A CALENDAR FILE (.ics, the iCalendar standard, RFC 5545). Every calendar takes one: an iPhone or a Mac adds every event in it with one tap, Outlook opens it, Google Calendar imports it (on a computer: Settings, Import), and most Android calendars open it from the download. One file holds every night of a series, so a week of meetings is one tap, not seven. * A GOOGLE CALENDAR LINK, for one night or one part, which opens Google Calendar with the event filled in for the person to save. That sends the event's words to Google when it is tapped, which the privacy notice says.

What this is not: a calendar that updates itself when the program changes. That needs an address on a server that every calendar polls, and programs live on the planner's device. Download the file again after a change.

#### `lib/canonical.ts`

*No header comment.*

#### `lib/demo/drawings.ts`

The sample app's drawings, kept in this tab and nowhere else.

WHY NOT IN THE SAMPLE DATABASE. That database is one JSON value written to localStorage on every single change anybody makes, so a picture stored in a row would be re-written with every tap, and a few drawings would fill the five megabytes the whole sample church has to live in. tests/realtime-and-media.mjs forbids file bytes in lib/demo/store.tsx for exactly that reason, and caught this on 28 September 2026.

WHY NOT IN INDEXEDDB, where the sample app keeps its photos. WebKit refuses to store a picture there under the conditions CI runs it in (see tests/e2e/webkit-idb-probe.js), and the drawing walk runs on WebKit.

So a drawing lives in this tab's sessionStorage, written once, under an id the series row points at. It lasts until the tab is closed, which is what the builder says, and it is honest for a sample: nothing in the sample app is meant to be kept. The live app keeps a drawing as a file on the study.

#### `lib/demo/sample-places.ts`

Places the sample app suggests when somebody tries booking a meet-up.

The sample app talks to nothing (tests/no-backend.js), so it cannot ask a map service. It searches this list instead, which is enough to show what the live app does: type part of a name, see where each one is, tap one to pin it.

Public landmarks only -- a cathedral, a mall, a park -- never a home or a person. The coordinates were looked up on OpenStreetMap on 26 September 2026, so Check it on the map opens the right spot. Two cathedrals in two cities are here on purpose: typing "cathedral" shows why the address line matters.

#### `lib/demo/seed.ts`

*No header comment.*

#### `lib/demo/store.tsx`

*No header comment.*

#### `lib/drafts.ts`

Unsent messages survive leaving the screen.

WHAT THIS IS. You start writing to somebody, get interrupted, and go and look at a lesson — or your phone locks, or the browser drops the tab to save memory, which phones do constantly. When you come back, what you had written is still in the box. Delete it all and the draft goes with it, so an empty box stays empty and nothing lingers to surprise you next time.

WHY IT NEVER LEAVES THE DEVICE. A draft is the most private thing in this app. It is a half-finished thought, often the hardest one somebody has tried to put into words, and frequently it is deleted rather than sent — that deletion is a decision, and it has to be real. So drafts live in this browser's own storage and are never written to the database, never sent to the church, and never readable by a Guide, a Director or anybody else. There is deliberately no server side to this file.

#### `lib/drawing-file.ts`

A drawing made in a study, as a file: a picture anybody can open, that the person who drew it can open again and keep drawing.

WHAT THE FILE IS. An ordinary PNG, so an Explorer taps it and sees a picture on any phone, with nothing to install. Inside it, in one text chunk, is the drawing itself -- the shapes, the arrows, the words -- the way Excalidraw writes it with "embed scene". That is what lets "Change drawing" reopen it as shapes rather than as a flat image to scribble over.

HOW IT IS KNOWN. By its name ending `.excalidraw.png`, which is Excalidraw's own convention for exactly this kind of file, and by that chunk being in it.

WHY THIS FILE STRIPS IT BEFORE IT IS SENT. Every picture that leaves somebody's device goes through lib/live/shrink-image.ts, which re-draws it so any hidden location goes with the old copy. A re-drawn drawing loses its shapes too, so a drawing is let through -- but only as the picture and the drawing. A PNG can carry other chunks (a camera's EXIF, a colour profile naming a device, free text), so everything else is cut out here. A photo renamed to look like a drawing therefore still arrives with nothing in it but its pixels.

#### `lib/engagement.ts`

*No header comment.*

#### `lib/evangelistic-meeting-docx.ts`

Evangelistic meetings as a Word document (.docx), written in the browser.

The same small, hand-written Word file as the Sabbath program's (lib/sabbath-program-docx.ts says why it is written by hand, and why the order of every element matters), with what a series needs on top:

* A LIST HAS ITS OWN COLUMNS, one to six, so its table is as wide as the page with the columns sharing it, and its header row repeats when a long list runs onto the next page. * THE MEETING'S OWN LOOK: its colour on the title, the headings and their rules, and its heading face. A colour too pale to read as words draws the rules only, and the words are written in ink (lib/evangelistic-meeting.ts, wordColour). The faces are Georgia, Arial and Verdana, which Word, Google Docs, Pages and LibreOffice all have: nothing is embedded or fetched. * TWO COPIES. What is shared leaves out every team-only block; the team's copy has them all, marked.

#### `lib/evangelistic-meeting-picture.ts`

Evangelistic meetings as a picture: one night's program, or the whole series at a glance, for a group chat, a phone's gallery, or Canva's free Upload.

Drawn on the device, like the Sabbath program's picture (lib/sabbath-program-picture.ts), in the meeting's own colour and heading face. It is always what is shared: a team-only block is never drawn.

A LIST'S COLUMNS ON A PICTURE. A list can have up to six columns, and six columns of text do not fit 1080 pixels at a size anybody can read on a phone. So a line is drawn as its first column, in bold on the left, and the rest of it on the right, joined by a dot: "7:00 PM | Song service · David Cruz". The Word file keeps the real columns.

#### `lib/evangelistic-meeting.ts`

Evangelistic meetings: a series of nights, each planned however the church plans it, kept on the planner's own device and shared as a post.

ASKED FOR on 2 October 2026: "Make sure Evangelistic Meetings are super customizable, unlike Sabbath program it has a template that can put input, but for EMs users can have much more freedom to customise their meeting." The owner then chose all four kinds of freedom offered:

* BLOCKS. A night, and the series as a whole, is a list of blocks the planner chooses and orders: a list, a paragraph, a checklist. "A program", "a team" and "a schedule" are only lists with their columns already named. * THEIR OWN COLUMNS. A list names its own columns, up to six, where the Sabbath program has its fixed three (what, details, who). * MANY NIGHTS. Each night has its own date, time, topic and blocks, and one night can be copied to make the next. * THEIR OWN LOOK. A colour and a heading style for the Word file and the picture.

#### `lib/folders.ts`

Folders for the Office's own documents, as plain functions: a folder is a name on an item, and these group by it. components/Folders.tsx draws them.

#### `lib/i18n.tsx`

*No header comment.*

#### `lib/lessons.ts`

*No header comment.*

#### `lib/linkify.ts`

Turn the links people type into links they can tap.

Somebody shares a passage, a video, a church notice — and until now it landed as dead text that the other person had to select, copy and paste into a browser. On a phone that is a genuine barrier, and the people this app is for are not the people who will bother.

THIS IS AN INJECTION SURFACE, AND IT IS BUILT LIKE ONE.

Everything below takes text that one member typed and renders it into a screen another member is reading. The obvious implementation — a regular expression that wraps matches in <a> tags, fed to dangerouslySetInnerHTML — is the single most common way an app of this shape gets an XSS hole, because the same string then carries both the link AND any markup the author felt like including.

#### `lib/live/analytics.ts`

What a church can actually measure about itself, for a Director on a Tuesday.

TWO QUESTIONS, AND THIS FILE ANSWERS BOTH LITERALLY.

1. Who is using it? Guides and Explorers, active and inactive, over a day, a week and a month. 2. Who is arriving, and who is leaving? New members by role over any grain from a day to a year, and the record of suspensions, refusals and removals beside it.

It replaced a generic "everything week by week" chart, which answered neither and made a Director derive both.

EVERY SOURCE IS SOMETHING THE READER MAY ALREADY SEE, with one deliberate exception. Arrivals and departures come from profiles and the discipline log under the caller's own policies. Activity comes from church_activity(), which is SECURITY DEFINER because it counts message senders — a Director may not read a message and never will, and this returns four integers per role, never a name and never a word of one. A count is not a conversation.

#### `lib/live/announce-plan.ts`

What to pop up, given what is waiting.

THE ASK: "make sure the notification notified the user once the user logs in or goes online when the user have notifications."

It did not. The bell announced things that arrived WHILE somebody was already looking at the app, and deliberately said nothing on the first poll — which is the sign-in moment, because the bell only mounts inside the signed-in shell. So the one case that most needs a pop-up, arriving to find a safeguarding report waiting, was the one case that never got one.

The reason for that silence was real and is kept: opening the app after a quiet week fired ELEVEN separate pop-ups at once, and somebody buried like that switches alerts off and then hears about nothing ever again. But silence is not the fix for eleven. One is.

#### `lib/live/attachments.ts`

What may be attached to a conversation or a lesson, in one place.

THE SAME LIST LIVES IN THE DATABASE, and it is the one that decides: the `pairing-media` bucket carries an allow-list of mime types, and Storage refuses anything else no matter what this file says. See supabase/migrations/0048_a_study_sheet_is_a_word_document.sql, which is also where the reasoning for what is left out is written down.

So why have this at all? Because a file picker that will happily let somebody choose a file the server is about to refuse is a trap. The report was a Guide attaching a study sheet and getting "mime type application/vnd.openxml- formats-officedocument.wordprocessingml.document is not supported" back. Half of that was the missing type; the other half was being allowed to pick it.

KEEP THE TWO IN STEP. If you widen the bucket, widen this; a type here that the bucket refuses is the trap again, and a type in the bucket that is missing here is a file people cannot choose.

#### `lib/live/data.ts`

Talking to a real database.

This is the live twin of lib/demo/store.tsx. The demo keeps everything in the browser and can afford to be relaxed, because the only data it can damage is sample data in your own tab. This file talks to a database with real people in it, so the rules are different and worth stating before the code.

THE FOUR RULES THIS FILE IS BUILT ON

1. THE DATABASE DECIDES, NOT THIS FILE. Every function below asks for what it wants and lets row level security return what the caller is entitled to. None of them filters "for security" in JavaScript. A check in this file protects nobody: the browser can call PostgREST directly with the same key, and anything only this file enforces is enforced nowhere. Where you see a filter here it is for correctness or for fewer rows, never for access — and it is commented as such.

#### `lib/live/emoji.ts`

Emoji, suggested while you type, rather than hunted for in a grid.

WHAT THIS IS. Type a colon and a couple of letters -- `:pra` -- and the matches appear above the box. Pick one and it replaces what you typed. The same pattern people already know from every tool that has it, and the reason it was asked for as "integrated with smart typing" rather than as a button.

WHY A COLON, AND NOT SUGGESTING ON ORDINARY WORDS. The obvious "smarter" version watches what somebody writes and offers an emoji for it -- type "pray" and be offered a folded-hands. That would be wrong HERE, and it is worth saying why rather than leaving it as a taste. This box is where somebody tells their Guide about an illness, a marriage in trouble, a bereavement. An app that pops a cheerful picture up beside those words has made a joke of them. A colon is a deliberate act: nothing is ever suggested to somebody who did not ask, in the middle of the hardest sentence they will write this year.

#### `lib/live/errors.ts`

What a person is told when something fails.

THE BUG THIS EXISTS FOR, on a Guide's own screen: two red boxes reading "permission denied for table pairings" and "permission denied for function blog_feed", under their name and their reminders. Nobody outside a database can act on either sentence, and both were saying the same ordinary thing — you are signed out — in the least useful words available.

This is the floor, not the fix. The reason those requests arrived as nobody is fixed in lib/supabase/client.ts. But a screen should never be able to print Postgres at somebody, whatever goes wrong upstream, so the translation lives here and every live screen goes through it.

WRITTEN ONCE. The same ternary was copied into thirty-three components, each with its own fallback and none of them translating anything. Thirty-three copies of a decision is thirty-three places to forget it.

#### `lib/live/feedback-sink.ts`

Feedback, sent to the church rather than kept on the phone.

THE BUG THIS EXISTS FOR: "Feedback is not working, I am pretty sure some feedbacks are still stuck in the database since I haven't received any email feedbacks."

Nothing was stuck. `setFeedbackSink` was never called, anywhere, so every message went to the DEFAULT sink in lib/backend/feedback.ts -- which saves to the sender's own browser and says so honestly on screen. There was no feedback table to be stuck in. Each message is still sitting in `hope-beacon.feedback.local` on the phone of whoever wrote it and has never crossed the network.

The default is right for the open-source build: a church cloning this has no server on the first run, and a demo that silently drops feedback teaches everybody that feedback is pointless. What was missing is this half -- the sink for a church that HAS a database.

#### `lib/live/keep-up.ts`

The screen keeps up on its own.

WHAT THIS FIXES. One table in the whole app was published for realtime — `messages` — so a conversation updated itself and every other screen did not. Post a notice, approve somebody, add a study, share a resource, propose a time: the person looking at that screen saw the old version until they pulled to refresh. In front of a room that reads as the app being broken, and there is no way to explain it that sounds like anything else.

Migration 20260902020000 publishes the tables. This is the other half.

RLS DECIDES, NOT THIS FILE. Realtime evaluates the same policies as a SELECT, per subscriber, so an event only arrives for a row this person could already have read. Nothing here filters for privacy, and nothing here could: a filter in the browser is a courtesy to the network, never a boundary.

#### `lib/live/kind-from-url.ts`

What kind of thing is at this address.

WHY THIS EXISTS. The library's add form asks for a Kind, offers five, and defaults to "Link". The dropdown sits BELOW the address box, so somebody pasting a YouTube URL reaches the button before they reach the question. The field is therefore whatever the form defaulted to, on almost every row.

That was harmless while the kind was only a small icon. Then a filter was built on top of it -- chips reading "Video 2", "PDF 1" -- and a field nobody maintains became a control that LIES. On this church's shelf, two of the nine items filed as "link" are YouTube videos: tapping Video hides half the real videos, and the person doing the tapping has no way to tell.

The fix is not a better dropdown. It is to stop asking somebody to classify something the address already says plainly. This reads the URL and offers the answer as the DEFAULT; the dropdown stays, and a deliberate choice still wins. See the add form for how "deliberate" is decided.

#### `lib/live/meeting-link.ts`

The way in to a meeting, whichever kind it is.

THE GAP: an online meeting had nowhere to put the link to join it. The app arranged the time and then left two people to send a Zoom address to each other in a message, which is the errand a shared card was meant to remove, and the one thing somebody is hunting for in the sixty seconds before a call.

The column was always meant to hold it. Migration 0009 documents `location` as "a place for in person, or a joining address for online" -- one field, on purpose, so nobody has to pick a category before typing where to meet. The write path in lib/live/data.ts then threw the value away whenever the meeting was online, so the half the schema described was never reachable.

Kept out of the component so it can be run rather than read. What counts as a safe link is a security question, and a security question deserves a test that executes the real function.

#### `lib/live/my-data.ts`

Everything this app holds about you, in one file you can take away.

THE RIGHT THIS ANSWERS. RA 10173 §16(c) gives a person the right to a copy of their own personal data; GDPR Art. 15 gives the same right and Art. 20 adds that it must arrive in a structured, machine-readable form somebody could carry to another service. Until now this app could not answer either, which docs/DATA-PROTECTION.md listed as the largest gap that was engineering's to close rather than a lawyer's.

THE PROPERTY THAT MAKES IT SAFE, and it is the whole design:

EVERY QUERY BELOW RUNS AS THE PERSON ASKING, THROUGH THE ORDINARY RULES.

There is no `security definer` function here and no service key. If the database would not let this person read a row on any other screen, it does not appear in their export either. An export built the other way — a privileged function assembling "everything about user X" — is one bug away from handing somebody else's conversation to whoever asks, and the bug would be invisible because the output looks the same.

#### `lib/live/not-yet.ts`

"Not on this database yet": telling a missing feature from a real failure.

The app and its database are updated separately. A push reaches the site in minutes; the database changes only when somebody runs the new migration. A church that updates the code first, a fork that pulls before running `supabase db push`, or a deployment whose owner has chosen not to run it yet, must keep a conversation that works -- the words, the photos, the live refresh -- with the newer things simply not offered until the database has them. Asked for on 1 October 2026, for replies, reactions and voice (supabase/migrations/20261001120000): the owner's own database stays exactly as it is, and the code goes out anyway.

So a read that fails because a table or column is not there is told apart from one that fails because the network dropped: the first switches a feature off quietly, the second is still an error somebody should see.

#### `lib/live/office-plans.ts`

The account's copy of a person's Sabbath programs and evangelistic meetings, in a church's own app (supabase/migrations/ 20261002150000_office_plans_follow_you.sql). Private to the owner by the table's own rules.

A DATABASE WITHOUT THE TABLE IS NOT AN ERROR. Until the migration runs, the tools work exactly as they did, on the device alone: load answers null and nothing is saved.

#### `lib/live/photo-location.ts`

Does this photograph say where it was taken? Read from its bytes, before it is sent.

WHY THIS EXISTS. The privacy notice promises that "the location your camera recorded is removed" before a photo is stored, and shrink-image.ts keeps the promise by re-encoding through a canvas, which drops every tag. But it only re-encodes a photo worth shrinking -- over 400 KB -- and hands anything smaller back untouched, tags and all. A small photograph with coordinates in it (a cropped picture, one saved by an app that compresses but keeps EXIF) went to the server with the address of wherever it was taken. Found on 25 September 2026, while making Resources and study handouts take files, when the owner asked for the app's policy and security to be kept consistent.

So the question is asked of every JPEG, whatever its size: does it carry a GPS block, or an XMP packet naming GPS coordinates? If it does, it is re-encoded even when that makes it bigger. Privacy before bytes.

#### `lib/live/place-pin.ts`

A chosen place, written into an appointment so both people see the same spot.

Asked for on 26 September 2026: "I need to see the destination name, like auto name in google search, then just click or tap it to secure the location." Securing it means the other person opens THE place that was chosen -- this branch, on this street -- and not whatever a map search guesses from the words.

NO NEW COLUMN. `meetings.location` has always held a place name and, when there is one, a link, and the card already draws exactly that: the words as the place, the link as its Open in Maps button (lib/live/meeting-link.ts). A chosen place is therefore written as its name and address followed by a map link to its exact coordinates. Every appointment made before this still reads the way it did, and so does one somebody types by hand.

Pure functions, so tests/place-search.mjs runs them rather than reads them.

#### `lib/live/push-devices.ts`

Where this device says how to reach it.

THE HALF OF PUSH THAT WAS NEVER WRITTEN. `subscribeToPush()` in lib/push.ts has always asked the browser for a subscription and always handed it back to a caller that dropped it on the floor. A subscription nobody keeps is a phone number written down and thrown away: the device is willing to be reached and there is no record anywhere of how.

So this keeps it, in the church's own database, behind owner-only policies. Everything a push needs is here and nothing else is: an endpoint, two encryption keys, and a label so somebody can recognise a device they no longer own. No location, no identifiers, nothing that says anything about the person beyond "one of their devices is willing to be told".

AND IT CAN BE UNDONE. Turning device alerts off does not hide a switch; it unsubscribes the browser AND removes the row, so the church has no way to reach a device that asked not to be reached. A setting that only stops the showing, while the sending carries on, is not the setting people think it is.

#### `lib/live/report-formats.ts`

Five renderers, one report. See lib/live/report.ts for the description.

NO NEW DEPENDENCIES, DELIBERATELY. This app runs on free tiers and ships to phones in a congregation; a spreadsheet library and a PDF library would be several hundred kilobytes downloaded by everybody so that a Director can save a file twice a year.

WHAT EACH FORMAT ACTUALLY IS, because the file extensions are doing work:

CSV plain text. Opens anywhere. No formatting, no second table, which is why the sheet format exists as well. .xls an HTML table. Excel, Google Sheets, Numbers and LibreOffice have all opened these for twenty years, and it keeps headings, several tables and the notes, which CSV cannot. .doc an HTML document. Word and Google Docs open it and it stays editable, which is the point: a church cuts it down and forwards it. PDF written by hand, byte by byte, in lib/pdf.ts. Fixed layout, nothing to install, nobody can accidentally edit the figures. print the browser's own dialog, which every phone and computer can already save as PDF and which lets somebody pick the paper.

#### `lib/live/report.ts`

The church report, described ONCE and rendered five ways.

WHY A DESCRIPTION RATHER THAN FIVE EXPORT FUNCTIONS. A church takes these numbers to a board meeting, and the CSV, the spreadsheet, the document and the PDF have to agree with the screen and with each other. Written five times they would agree on the day they were written; someone then adds a column to the CSV, and a year later the PDF a treasurer is holding says something the spreadsheet does not.

So the report is DATA. Each renderer walks the same structure and does nothing but formatting.

EVERY FORMAT CARRIES THE SAME EXPLANATION, and that is the point of putting the notes in the structure rather than on the screen. A spreadsheet with a column headed "Active" and no definition beside it is how somebody decides that eleven of nineteen Guides are not working. The word means "the app recorded them doing something", it does not mean visits, and that sentence has to travel with the number into whatever file it ends up in.

#### `lib/live/session-verdict.ts`

What a failed load means for somebody's session.

THE BUG: "Some of the users still experiencing getting log out when they tab out to another web page or they exit the browser."

Three things had to be wrong at once, and they were:

1. The question was asked of the ERROR MESSAGE. The old test was /jwt|expired|invalid|refresh token|not authenticated/ against whatever string came back, and `invalid` and `expired` are ordinary words. A routine database complaint like "invalid input syntax for type uuid" ended the session. So did every "JWT expired" that was really a phone whose radio had not come back yet: the refresh could not leave the device, the stale token went instead, and the server said the only thing it could say.

#### `lib/live/session.tsx`

*No header comment.*

#### `lib/live/shrink-image.ts`

Make a photo small enough to send, before it is sent.

WHY, IN NUMBERS FROM THE LIVE BUCKET. Fifteen of the sixteen files a real church had sent each other were photographs, averaging 2.3 MB and running to 4.4 MB, for 34 MB in total. One was a PDF, at two kilobytes. A phone camera produces four thousand pixels across; a conversation shows the result about three hundred pixels wide on a phone and never more than about eight hundred. Every one of those megabytes was paid for twice, once to store and once again on every single view, because a signed URL is fetched fresh each time and no cache in front of it will keep a private object.

Sixteen hundred pixels at quality 0.82 puts a typical phone photo between two and four hundred kilobytes, which nobody can tell apart on the screen it is read on. That is most of a nine-tenths saving on the only thing in this app that grows without anybody deciding it should.

#### `lib/live/storage-path.ts`

A stored file path, checked before it becomes part of a URL.

FOUND BY THE SECURITY REVIEW OF 1 OCTOBER 2026. To open a private file the app asks the file store to sign it, and the storage library builds that request as `<storage>/object/sign/<bucket>/<path>` with the path pasted in as it is, carrying the sign-in of whoever is LOOKING. The path comes from a database row, and some of those rows were written by somebody else: the other person in a conversation, a Guide who shared a resource, a member who attached evidence to a report. A path of `../../auth/v1/logout` turns "show me this picture" into "sign me out of every device".

The database now refuses that shape for conversation files (20261001120000_a_conversation_can_reply_react_and_speak). This is the same rule in the browser, for every bucket, and for rows written before it.

#### `lib/localMedia.ts`

On-device media storage. Files never leave the browser.

#### `lib/look-before-paint.ts`

THE CHOSEN LOOK IS ON THE PAGE BEFORE ANYTHING IS DRAWN.

Asked for on 3 October 2026: "fix the first paint flash too". The server cannot know what this device chose, because the choice lives in the browser's storage, so every page arrived as `data-ui-theme="classic"` and components/UiTheme.tsx corrected it once React had loaded, about a tenth of a second later. Measured in the sample church on a computer, that tenth of a second was a blank page, so with Desktop nobody saw it. A look that colours the whole page (a dark one) would flash Classic's light ground on every load, the sign-in page included.

So this runs first, as a script at the top of <body> (components/LookBeforePaint.tsx): it reads the stored look and puts it on <html> before the page below it is parsed or painted.

THE SAME RULE AS knownTheme(), FROM THE SAME REGISTRY. The list of looks and the default are taken from lib/ui-themes.ts when the app is built, so a look registered there is applied before paint with no change here, and anything not registered (a typo, an old look, somebody's tampering) is the default. tests/the-classic-look-stays.mjs runs this script against knownTheme() for every kind of stored value.

#### `lib/minor.ts`

Who is under 18, and who checked the letter.

DERIVED, NEVER STORED. The badge is computed from the birthday every time it is drawn. A stored "is a minor" flag is correct on the day somebody sets it and silently wrong from the morning of that person's eighteenth birthday, and nothing would ever announce that it had gone stale. A safeguarding mark that quietly becomes false is worse than none, because people trust it.

The database agrees: public.is_minor(date) is STABLE for the same reason, and cannot be a generated column because Postgres only allows IMMUTABLE functions there. Both sides compute; neither remembers.

#### `lib/mode.ts`

Demo, or real, decided by whether a database is configured.

THIS IS THE HINGE OF THE WHOLE PROJECT. Clone the repo with nothing set up and it runs on sample data in the browser — that is what lets a church look at the thing before committing to anything. Set two environment variables and the same code talks to your own Supabase project, with your own people in it.

Deliberately NOT a build-time flag or a hand-set MODE variable. Somebody eventually sets MODE=live while forgetting the keys, and the app breaks in a way that reads like a bug rather than a missing step. Asking "do I have what I need to reach a database?" cannot get out of step with reality, because it IS reality.

Both variables are NEXT_PUBLIC_ because the browser makes the calls. The anon key is not a secret — see supabase/migrations/0001_core_schema.sql. What protects your congregation's data is row level security, not the obscurity of that string.

#### `lib/motion.ts`

Motion that needs JavaScript, in one place.

MOST MOTION IS CSS, and belongs there: a class in app/globals.css, switched off under prefers-reduced-motion further down the same file. This file is for the three things CSS cannot do on its own:

usePresence keep a panel on the screen long enough to be seen leaving. Closing is an unmount; without this a panel simply vanishes. fadeInAfter fade in whatever a sub-room menu just swapped in below it. The menu cannot know what each page draws under it, so it fades the elements that follow it, whatever they are. scrollMotion 'smooth' or 'auto' for scrollIntoView and scrollBy. A stylesheet's reduced-motion rule never reaches a scroll started from JavaScript, so it has to ask.

EVERY ONE OF THEM ASKS prefersLessMotion() FIRST. Somebody who has asked their device for less movement gets the same screens with nothing moving: panels appear and go, rooms swap, scrolls jump.

#### `lib/music/audio.ts`

The Music room's sound: one place that opens the audio clock, schedules ahead of it, and makes the two sounds the room needs, a click and a sung note. lib/music/metronome.ts and lib/music/score-player.ts both use it, so the scheduling is written once.

NOTHING IS DOWNLOADED. The click and the voice are made by oscillators on the phone, so the room works with no signal and sends nothing anywhere.

#### `lib/music/beat.ts`

The conductor's beat: when each click falls, which beat of the bar it is, and where the baton is between them. Pure functions, no browser, so tests/the-music-room.mjs runs them.

WHY THE CLICKS ARE SCHEDULED, NOT TIMED. A browser timer (setTimeout) can fire tens of milliseconds late whenever the phone is busy, and a metronome that wanders by that much is worse than none: a choir hears it at once. The Web Audio clock does not wander. So a cheap timer wakes every 25 ms and hands the audio clock every click due in the next tenth of a second, each at its exact time ("A tale of two clocks", web.dev/articles/audio-scheduling). `due` below is that hand-over, written so it can be tested.

#### `lib/music/metronome.ts`

The conductor's metronome: clicks on the audio clock, and where the baton is for the picture. lib/music/beat.ts holds the arithmetic; this holds the clock.

#### `lib/music/musicxml.ts`

Reading a MusicXML score into lines a choir can practise: each voice of each part, as notes on a timeline, with its lyrics and the tempo.

MusicXML is the score format every notation program exports (MuseScore, Finale, Sibelius, Dorico). Only the partwise form is read, which is what they all write by default. What is read is what practising a part needs: pitches, lengths, voices, ties, the first verse's lyrics, the tempo. Dynamics, slurs and the rest of the engraving are not.

REPEATS ARE PLAYED ONCE, straight through. Following repeat signs, voltas and D.C. al Fine correctly is a project of its own; the room says so.

A SCORE IS SOMETHING SOMEBODY SENT YOU, so it is untrusted input: - it is parsed by the browser's own XML parser, which never fetches anything a file points at (no external entities, no DTDs loaded); - a file that declares its own entities is refused before parsing, the shape of the "billion laughs" attack; - the tree is walked with a hard ceiling on elements, notes, lines and length, so a hostile file can make the room say no, never hang it. Nothing here writes HTML: names and lyrics reach the screen as text.

#### `lib/music/notes.ts`

Notes, frequencies and cents: the arithmetic every tool in the Music room shares. Pure functions, no browser, so tests/the-music-room.mjs runs them.

Equal temperament, the tuning a piano, a keyboard and every tuner app assume: each semitone is the twelfth root of two, and A above middle C is the reference, 440 Hz unless a choir tunes to something else (some baroque groups use 415, some orchestras 442).

#### `lib/music/page-scan.ts`

Turning a photo of a page of music into a clean page: straightened, cropped to the paper, and made black on white so it reads on a phone in a dim church.

HOW. The person drags four corners onto the corners of the paper (the room starts them just inside the photo's edges). The four points define a perspective map from the flat page to the photo; every pixel of the clean page is looked up through it (`warp`). Then each pixel is compared with the average brightness around it (`clean`): ink is darker than the paper near it, whatever the lighting, so a shadow across the page does not turn into a black band the way a single threshold would.

Pure arithmetic on pixel arrays: no browser, no library, nothing sent anywhere. tests/the-music-room.mjs runs it.

#### `lib/music/pieces.ts`

The Music room's pieces, kept on this device: clean pages made by the scanner, and score files. A store of its own (IndexedDB "beacon-music"), apart from My Files, so a choir's pages do not fill somebody's media list and My Files stays exactly as it was. Nothing here is uploaded.

THE BYTES ARE STORED, NOT THE BLOB. WebKit will not put a Blob into IndexedDB at all, and says so with a null error: lib/localMedia.ts found that the hard way and tests/e2e/webkit-idb-probe.js proves it. This store first went out storing Blobs, and on Safari no score or page could be kept (the Safari walk of 4 October 2026). So: an ArrayBuffer and its type, put back together as a Blob on the way out.

#### `lib/music/score-file.ts`

Opening a score file somebody chose: the one way into lib/music/musicxml.ts from a browser. Checks the kind and size first, unzips a .mxl (lib/music/zip.ts), parses with the browser's own XML parser, and hands the tree to readScore. Every refusal is a sentence a person can act on.

#### `lib/music/score-player.ts`

Playing a score's voices so a singer can learn theirs: every line at once, or one alone, or one louder than the rest, at any tempo, from any point. The notes are sung by the phone (lib/music/audio.ts), scheduled ahead on the audio clock the same way the metronome's clicks are.

#### `lib/music/tuner.ts`

The tuner: listen through the microphone and say which note is sounding and how far off it is.

THE MICROPHONE, AND WHAT HAPPENS TO WHAT IT HEARS. It is opened only when somebody presses Start, and the browser asks them first. The sound is measured on the phone, a few thousand samples at a time, and thrown away: nothing is recorded, kept or sent anywhere. The microphone is released (the browser's recording light goes off) the moment they press Stop, leave the room, or the phone locks or switches apps.

THE PITCH is found by the McLeod pitch method ("A smarter way to find pitch", McLeod and Wyvill, 2005), through pitchy (MIT, github.com/ianprime0509/pitchy): accurate on a held voice or instrument, and quick enough for every frame.

#### `lib/music/zip.ts`

Reading one file out of a zip: enough for a compressed MusicXML score (.mxl), which is a zip holding the score and a note saying where it is.

WHY NOT A LIBRARY. The usual one (JSZip) is 100 KB and does far more than this needs. Browsers can already inflate: DecompressionStream('deflate-raw') is in every current browser and in Node, so what is left is reading the zip's table of contents, which is a few dozen lines.

A ZIP IS SOMETHING SOMEBODY SENT YOU. The table of contents can lie about sizes, and a small file can inflate to gigabytes (a "zip bomb"). So: - only stored and deflated entries are read; encrypted, split and Zip64 archives are refused; - the table of contents may hold at most MAX_ENTRIES entries; - inflating stops the moment the output passes the size the entry declared or MAX_INFLATED, whichever is smaller, whatever the entry claims.

#### `lib/noise.ts`

Ambient sound, generated rather than downloaded.

WHY NOT AUDIO FILES. An hour of white noise is tens of megabytes. Serving it to a congregation would cost real egress every time somebody pressed play, on a project whose whole point is running for nothing, and it would not work on the bus. Generated noise is a few lines of arithmetic: no file, no bandwidth, no network, and it never ends because there is nothing to end.

WHAT WAS WRONG WITH IT, reported by the people using it: "some of it are not pleasing." Three things were true at once, and each one is fixed below.

1. ALL THREE OPTIONS WERE NOISE, and one of them was raw white noise -- flat all the way up, which is the harshest thing a speaker can make and the sound most people mean when they say noise is unpleasant. It sat in the same undifferentiated list as the gentle ones, so somebody looking for something calming had a one-in-three chance of an ear full of hiss.

#### `lib/notification-prefs.ts`

*No header comment.*

#### `lib/online.ts`

*No header comment.*

#### `lib/open-bell.ts`

One way to say "open the notification panel", from anywhere on the screen.

The bell is drawn once, in the app header. Everything else that wants to send somebody to their notifications — the desk's "Unread notifications" row today, anything else tomorrow — is somewhere else in the tree entirely, with no parent in common but the shell.

The alternative was a `?bell=1` query parameter, and it does not work: the link points at the screen the person is already on, so Next.js changes the address without re-rendering anything, and `useSearchParams()` drags a Suspense boundary into every statically rendered page for the privilege. A window event costs nothing and cannot go stale in the URL afterwards.

#### `lib/pdf.ts`

A tiny, dependency-free PDF writer — just enough for the church report: text (Helvetica / Helvetica-Bold) and filled rectangles on one A4 page. PDF is a plain-text format; we build the objects and byte-accurate xref by hand and hand back a Blob. Keeping this in-house avoids adding a PDF library to a project that runs on free tiers.

#### `lib/plan-sync.ts`

Keeping the Office's own documents (Sabbath programs, evangelistic meetings) the same on every device the person signs in on, with the device always first.

THE RULE IS SMALL ON PURPOSE: each item carries `updated`, the moment it was last changed, and whichever copy is newer wins, on the device and in the account alike. A deletion is remembered as a mark with its own moment, so a device that was offline cannot bring back what was deleted elsewhere, and a later edit on that device can.

This file decides; it never asks the network. lib/use-plan-sync.ts runs it against the account's copy (lib/live/office-plans.ts), and tests/the-office-follows-you.mjs holds every case below.

#### `lib/player-lists.ts`

Playlists for the player, kept on the device.

A PLAYLIST IS NAMES AND IDS, NEVER TRACKS. The same reasoning as the library's own playlists: a track stored inside a playlist is a track stored twice, and the same piece in five playlists is five copies. Ids cost a few short strings, and localStorage is exactly the right size of place for a few kilobytes of ordering.

ON THE DEVICE, NOT IN THE CHURCH'S DATABASE. What somebody listens to while they read is nobody else's business, and a church database is a place other people can see. Nothing here is uploaded and nothing reaches a server.

#### `lib/player.tsx`

One media player, shared by every screen that shows it.

WHY A CONTEXT AND NOT A COMPONENT. The player appears twice: full size on the library page, and as a strip in the right rail of every room. Those are two views of ONE thing. Built as two components each holding their own element, pressing play in the rail while the library was playing would give you both at once, and navigating from the library to anywhere else would cut the sound off mid-track. The element lives here, above both, and outlives the page. The provider sits in the ROOT LAYOUT, so it survives moving between routes too.

ONE ELEMENT, AND IT IS A <video>. An <audio> element cannot show a picture, and a second element for video would be a second thing that can be playing. A <video> plays audio perfectly well, so there is one, created imperatively and parked in a hidden corner of the document. When the full player mounts it ADOPTS that element into its own stage; when it unmounts the element goes back to the corner, still playing. That is why a video keeps its sound when you walk out of the library, and picks its picture back up when you return.

#### `lib/playlists.ts`

Playlists for the library player.

PORTED FROM OPEN MORBITAL, the owner's local-first music player (github.com/Klydo131/open_morbital_official), AGPL-3.0 upstream, and used here under its terms as part of this AGPL-3.0 work. See NOTICES.md. The data model below is Morbital's `StoredPlaylist`; the code is written against this app's own storage rather than copied, because Morbital is Vite/zustand/dexie and this is Next.js.

WHY A PLAYLIST IS ONLY NAMES AND IDS. The media itself is already in IndexedDB (lib/localMedia.ts) and can be hundreds of megabytes a file. A playlist that stored tracks would store them AGAIN, so putting one song in five playlists would cost five copies of the song. Storing ids costs five short strings, and localStorage — which is small, synchronous and perfect for a few kilobytes of ordering — is exactly the right place for them.

#### `lib/pocket.ts`

The pocket: a person's own shortcuts to the web apps they already use.

ASKED FOR LIKE THIS: "First I will copy the URL of the web app like example, spotify, youtube, or facebook, then I will paste it on the URL of the pocket micro-app and I click the save button, then it automatically registers the logo and app URL, Now when I click the logo, it automatically goes in that web app destination... some people use office web app so that can be helpful to ALL users."

WHY THE MARK IS DRAWN AND NOT FETCHED. "It automatically registers the logo" is the interesting half. The obvious way is to fetch each site's favicon, and it is the wrong way twice over. The app's CSP allows images from `'self'`, `data:` and `blob:` only, so every real favicon would need img-src widened to arbitrary origins -- and once it is, every tile on a person's desk quietly tells that company the person is here, each time the rail renders. A church member's screen should not report to Facebook that it exists.

#### `lib/progress-report-docx.ts`

The progress report as a Word document, for a Director's desk, a board meeting, or the Guide's own records.

The same hand-written Word file as the Sabbath program's (lib/sabbath-program-docx.ts says why it is written by hand and why the order of every element matters), with its styles: a title, the summary as a two-column table, where everybody is on the journey, each Explorer as a row, and the reader's own notes.

#### `lib/progress-report.ts`

The progress report: how the Explorers a Guide walks with, or a church's Explorers as a whole, are moving along the journey, for a month or a quarter.

ASKED FOR on 2 October 2026: "a progress report for Guides and higher up accounts ... make sure it integrates with the data and relevance on how Explorers are progressing rightly. Probably you can research of progress reports of teachers in the SDA format." In the Office, with the Reports subroom.

THE SHAPE IS THE ADVENTIST ONE. A Sabbath School class record is kept by the quarter (attendance, lesson study, visits, Bible studies), and a Bible worker's report by the month (Bible studies given, visits, decisions, baptisms, and a space to write what happened). So this report is for a month or a quarter, counts the same kinds of things in this app's own terms, and has a space for the Guide's own words:

#### `lib/published-height.ts`

A bar says how tall it is, so the page can make room for it.

The header is sticky and the tab bar is fixed, so the page cannot see either of them. Each one publishes its height on <html> as a CSS variable (`--app-header`, `--tab-bar`), and globals.css spends it: the page's padding, where a scrolled-to control comes to rest, and what floats above the bar.

WHY THIS IS ONE HOOK, AND WHY IT MEASURES THE WAY IT DOES (4 October 2026). Three components did this, each with its own copy, and each measured with getBoundingClientRect() while React was still putting the new screen in place. That forces the browser to lay out the whole page there and then, in the middle of the update: about 60ms of every page change on a phone-speed processor, spent in the frame where the new screen slides in. Two of the copies also ran after EVERY update of the app's frame, not only when the bar changed size, because their effect had no dependency list.

#### `lib/push.ts`

Notifications, both kinds, and the difference matters.

ON-DEVICE. The app raises a real system notification itself, from the page, about something the browser already knows. It has always worked and it can only ever reach somebody who has the app open in front of them.

BACKGROUND PUSH. The church's database sends to the device whether or not the app is running: a locked phone in a pocket lights up. This is the half that was missing, and "notifications do not work on all devices" was a fair description of an app that had only the first kind.

It is wired now: subscribeToPush() asks the browser, lib/live/push-devices.ts keeps the answer in `push_subscriptions`, a trigger on `notifications` calls the `notify` edge function, and the service worker's push handler -- which has been sitting ready this whole time -- raises the notification.

#### `lib/quest.ts`

*No header comment.*

#### `lib/realtime.ts`

Real-time synchronisation — the fourth box in the architecture diagram.

WHAT THIS ACTUALLY DOES, STATED PLAINLY: it keeps every open window of this app on ONE DEVICE in step with each other, live. Open the missionary in one window and the seeker in another, send a message, and it appears in the other window immediately with no refresh. That is a genuinely useful thing — it is the clearest way to demonstrate a two-person conversation to a room — and it is honestly all a backendless app can do. Two different phones cannot sync through a server that does not exist.

So this file is deliberately two things at once:

1. A WORKING FEATURE for the demo, via BroadcastChannel. 2. A SEAM. Call setRealtimeTransport() with an adapter for your provider and every window on every device syncs instead, with nothing else in the app changing. That is the same shape as lib/backend/feedback.ts, and for the same reason: the app should not pick your provider for you.

#### `lib/release-notes.ts`

What's new: the release notes people actually read.

A version number tells you a build changed. It does not tell you what changed, which is the only part anyone cares about. This is the list, newest first, in plain language. No commit hashes, no internal names, nothing a person would have to be a developer to parse.

Add an entry at the TOP whenever a release goes out. `id` must be unique and must never be reused, because it is what the app remembers to work out which notes a person has already seen.

#### `lib/rich-text.ts`

The little bit of formatting people already write, actually shown.

WHY THIS EXISTS. It was reported with a photograph.

A study on the shelf read, on a real phone:

**Read:** Mark 2, verses 23 to 28. **To think about:** what would a day genuinely built for your good... **Where this comes from:** *The Desire of Ages* has a chapter...

Every asterisk on screen. The person writing those studies was formatting them the way anybody formats text in 2026, and the app was printing the marks instead of obeying them. The heading of each section -- the single thing that makes a study skimmable -- was the most damaged part, because it is the part that was marked up.

#### `lib/room-theme.ts`

*No header comment.*

#### `lib/sabbath-program-docx.ts`

A Sabbath program as a Word document (.docx), written in the browser.

ONE FILE FOR WORD AND FOR GOOGLE DOCS. The owner asked for "words or docs". Google Docs opens a .docx as it is (upload it to Drive, or open it from the Google Docs app on a phone), and so do Pages and LibreOffice. A second format would be a second thing to keep right for nothing a person could tell apart.

WHAT IS IN IT, AND WHY IT IS THIS SMALL. A .docx is a zip of seven short XML parts, and the app already writes zips by hand for the study room's Obsidian export (zipVault in lib/study/obsidian.ts, checked against a real `unzip`), so that writer is used rather than a second one. Only what a program needs is written: a title, the date, the theme, one heading and one table per part of the day, and the announcements. Fonts are Georgia and Arial because Word, Google Docs, Pages and LibreOffice all have them or a metric twin; anything fancier is substituted by whichever program opens it, and then the layout moves.

#### `lib/sabbath-program-picture.ts`

A Sabbath program as a picture: for a group chat, a phone's gallery, or Canva.

WHY A PICTURE AS WELL AS THE WORD FILE. Most people a program is for will see it on a phone, in Messenger or Viber, and a Word file is the wrong thing to make somebody open there to find out when Sabbath School starts. A picture opens where it lands. It is also the most ordinary thing Canva's free plan takes as an upload, so a church that wants to design its bulletin can start from it (docs/SABBATH-PROGRAM-RESEARCH.md says why nothing here talks to Canva itself).

DRAWN ON THE DEVICE, so it works with no signal and in any language the phone has fonts for: the text is laid out on a canvas, not sent anywhere to be rendered. It is the congregation's copy: no private notes, ever.

Two passes over the same layout code, one to measure and one to draw, so the picture is exactly as tall as the program and nothing is cut off.

#### `lib/sabbath-program.ts`

A Sabbath program: the order of service for one Sabbath, made in the Office by a Guide or a leader, kept on their own device, and downloaded as a Word file.

ASKED FOR on 2 October 2026: "Guides and all higher up accounts can make their own Sabbath program tool, it can be downloaded to words or docs too in their office."

KEPT ON THE DEVICE, BY THE OWNER'S CHOICE, the same day. Three things follow:

* It works on a church's app the day it ships. There is no table, no security rule and no migration, so a church that has not updated its database still has it. * The names typed into it (who prays, who preaches) stay on that phone or computer. They leave it only inside a file the person downloads or shares, which is their act, not the app's. * A program made on a phone is not on the laptop, and two leaders do not see each other's. They share the file, the way churches already pass a program round.

#### `lib/save-media.ts`

Saving a file to this device, in ONE place.

WHY THIS IS A HOOK AND NOT COPIED CODE. The player's Vault now offers "Save music or video" in the right rail, and the Library page has offered "Upload files" all along. Written twice, those become two upload paths that drift — and the thing they would drift on is not cosmetic. This function carries a WebKit fix that took a live bug to find (see the `finally` below), plus the storage-quota request and the duration/resolution probe. A second copy would have quietly shipped without one of them.

So there is one path, and both buttons call it.

#### `lib/scroll-to-hash.ts`

Land on the thing that was linked to, not near it.

THE BUG THIS EXISTS FOR: "it doesn't go to the feature I clicked".

A plain `#anchor` link works only if the target is in the document when the browser looks for it. In this app it usually is not. The card lives behind a tab that has not rendered, or behind data that has not loaded, so the browser finds nothing, gives up silently, and leaves the person at the top of a long page hunting for what they just pressed. Being sent to the right page and abandoned is the same as not being sent.

So this waits for the element instead of assuming it. It polls briefly, and gives up rather than looping forever, because a link to something that genuinely is not on this screen should fail quietly rather than hang.

#### `lib/share.ts`

Sharing via the device's own share sheet (Web Share API). The file goes straight from the user's device to whatever they pick — WhatsApp, Messenger, Telegram, or another device nearby (AirDrop / Nearby Share / Bluetooth). No server, no hosting: Beacon is a bridge. Falls back to copying a link where the Web Share API isn't available (most desktops).

#### `lib/site-visibility.ts`

Is this deployment allowed to appear in search results?

THE PROBLEM THIS SOLVES. Being findable was previously refused in three separate places — the `robots` metadata in app/layout.tsx, app/robots.ts, and the X-Robots-Tag header in next.config.mjs — each carrying a comment saying "change all three, or none". That instruction is correct and it is also the kind of instruction people follow twice out of three times. A half-change is the worst outcome available: a site that is indexed while everyone involved believes it is not, or a showcase nobody can find because one of the three was missed.

So it became one switch. Set BEACON_PUBLIC_SITE=1 and all three agree.

THE DEFAULT IS STILL NO, AND THAT IS DELIBERATE. This repository is meant to be forked and deployed by a church. Such a deployment holds real people's names and conversations, and a shared deep link that gets indexed is the cheapest possible leak. Being findable is opted into on purpose; it is never arrived at by forgetting something.

#### `lib/starter-kit.ts`

*No header comment.*

#### `lib/study/blob-source.ts`

Where a picture in a study room actually lives.

ASKED FOR: "I want the whole feature please." Images and attachments are part of AFFiNE, and until this file existed the room kept them in BlockSuite's `MemoryBlobSource` -- a Map in the tab. A photograph of somebody's Bible page survived until the tab closed and then came back as a broken block. The block was registered, which made it worse: the feature appeared to work.

SAME SHAPE AS THE DOCUMENT SOURCE, deliberately. Rows in the church's own database, owner-only, capped, gone when the account goes. A study room is one person's room and its pictures are one person's pictures.

THE KEY IS THE CONTENT'S OWN CHECKSUM -- BlockSuite hashes the bytes before it ever asks this to store them. Two copies of the same picture are one row, and a row never changes: a different picture is a different key. That is why there is no update path here and no update policy in the migration.

#### `lib/study/doc-source.ts`

Where an Explorer's study documents are kept: the church's own database.

WHY THIS FILE IS THE WHOLE INTEGRATION. AFFiNE's editor is MIT and its server is not -- packages/backend is Enterprise Edition, production use only under a paid subscription -- so the editor had to arrive without the place it keeps documents. Reading the published packages turned up the seam that makes this tractable: BlockSuite's `DocEngine` talks to a `DocSource`, and a DocSource is three methods. Everything else about persistence is theirs.

So this is not a reimplementation of AFFiNE's backend. It is the adapter that points their engine at `study_docs`, a table the church owns, behind owner-only policies that were verified against the live database.

A SNAPSHOT, NOT A LOG. Their IndexedDB source keeps an array of updates and merges it when it grows. A row per document holding one merged state is the better shape here for one reason: this is a 500 MB free tier shared by a whole congregation, and an append-only log with no compaction job is how a study room quietly eats a church's database.

#### `lib/study/effects.ts`

Everything the editor has to have loaded before it can draw anything.

THREE SIDE EFFECTS AND NO EXPORTS, which is why it is a file of its own: it is imported with `await import(...)` when somebody opens a page, so that opening the ROOM does not pay for it. See lib/study/view-extensions.ts.

The first import has no bindings on purpose. It registers roughly a hundred custom elements as a side effect, and it is the whole reason paragraphs, lists, tables, databases and the canvas exist. Without it the editor renders nothing and reports no error.

THE EDITOR SHIPS NO COLOURS OF ITS OWN. Every BlockSuite stylesheet is written against `var(--affine-text-primary-color)` and about two hundred siblings, and nothing in the package defines them -- AFFiNE's own app does, in the theme package. Without it every one of those variables resolves to nothing and each rule silently falls back to whatever it inherits.

#### `lib/study/extensions.ts`

What a study room is made of: everything AFFiNE has.

ASKED FOR, WITH FOUR SCREENSHOTS OF AFFiNE'S OWN APP AND A LINK TO THEIR REPOSITORY: "Did you even scan the whole affine on how the whole notion works? The whole point is to look to have a Notion feel in the study room. I want the whole feature please."

The answer to the question is: not properly, and this file was the evidence. It used to name nine blocks by hand and leave out roughly thirty, and the reasoning for each omission was sound on its own terms and wrong as a whole. A hand-picked list is a running argument with a person who has said three times what they want.

SO THE LIST IS AFFiNE'S OWN. `getInternalStoreExtensions()` and `getInternalViewExtensions()` are the exact sets AFFiNE ships to its own users, and taking them whole is what makes the room's features the same features rather than a subset somebody has to discover the edges of. What arrives with them, none of which this room had:

#### `lib/study/getting-started.ts`

The page that shows somebody what the room can do, by being made of it.

ASKED FOR, WITH A SCREENSHOT OF AFFiNE'S OWN "Getting Started" DOCUMENT: "Make sure there is an instruction manual inside the study room so Explorers can see the full potential of the Affine features like what Affine did in the tutorial ... I want this kind of tutorial in our Study Room please."

WHY A PAGE AND NOT A HELP SCREEN. docs/STUDY-ROOM.md exists and is thorough and almost nobody will read it, because it is somewhere else. AFFiNE's answer is the right one: the tutorial IS a document in the workspace, made of the blocks it is describing, so the first thing a person does is tick a box in a real to-do list and the feature has taught itself.

GIVEN ONCE, NEVER PUT BACK. The same rule as the Faithlife tile in the pocket, and for the same reason: a page the app restores is not a default, it is a nag. Somebody who reads it and deletes it has said what they want. The room records that it has been given its guide, so the answer does not depend on the page still being there.

#### `lib/study/memory-source.ts`

Where the tutorial's study room keeps its pages: nowhere.

WHY THE TUTORIAL NEEDS ITS OWN. The real study room writes to `study_docs` through SupabaseDocSource, which needs a signed-in person and their own row. The tutorial has neither: it runs on sample data with no session at all, and `db()` throws there rather than returning a client. So somebody walking through the demo would meet the one room that errors instead of opening.

AND WHY IT FORGETS ON PURPOSE. The obvious alternative is IndexedDB, which BlockSuite already ships a source for, and it would make the demo feel more real by remembering what somebody typed. It would also leave a database on the machine of a person who was only looking -- and this project has a check, tutorial-leaves-nothing-behind, for exactly that habit. A walkthrough should not install anything.

#### `lib/study/obsidian.ts`

The study room as an Obsidian vault, and back again.

WHY THIS EXISTS, AND IT IS THE SAME ARGUMENT AS components/LiveExport.tsx: what somebody writes in this room is theirs. A member who leaves the church, or a Guide who prefers to prepare a study on a laptop in an app they already trust, should be able to take their pages with them and bring them back. A room you can only read inside one website is a room somebody is renting.

OBSIDIAN RATHER THAN "MARKDOWN" IN GENERAL, because the conventions are what make the files useful rather than merely readable. This room already has the four things Obsidian has, arrived at independently:

a tag -> `tags:` in YAML front matter, which Obsidian reads natively a folder -> a folder the journal -> a daily note, named for its date a linked page-> [[wikilinks]]

#### `lib/study/shelf.ts`

What the study room knows about each page, beyond the writing on it.

ASKED FOR, WITH A SCREENSHOT OF AFFiNE'S OWN APP: "what I meant for a special room like the library page is, I want the whole Affine features like this but with Hope Beacon brand please."

The screenshot is a workspace, not an editor: a list of documents with a preview line and a date, a star on each, tags, a trash, a search, and a view somebody browses before they open anything. That is a different shape from a strip of tabs above a page, and it is the shape the library already has in this app, which is exactly why it was asked for in those words.

WHERE THIS LIVES. BlockSuite's own DocMeta already carries `title`, `tags`, `createDate`, `updatedDate` and `favorite` -- AFFiNE's list is built on the same fields. Two more are needed for the rest of that screen and are added here rather than invented elsewhere: a short `preview` so a list can show what a page is about without loading every page, and `trashedAt` so deleting is something a person can undo.

#### `lib/study/vault-io.ts`

Turning a page into Markdown, and Markdown into a page.

THE HALF THAT NEEDS A LIVE EDITOR. lib/study/obsidian.ts decides what a file is called, what its front matter says and how a folder of them becomes a zip -- all of it testable in Node. This is the other half: blocks in, blocks out, which only BlockSuite can do and only with a store in front of it.

AFFiNE'S OWN ADAPTERS, NOT A CONVERTER OF OURS. Every block package in @blocksuite ships `src/adapters/markdown.ts`, and the factory that assembles them is what AFFiNE's own import and export panel uses. Writing a second converter here would start correct for paragraphs and headings and then quietly fall behind on tables, callouts, code fences and footnotes -- the blocks somebody would most notice losing.

#### `lib/study/view-extensions.ts`

How a study page is drawn, kept apart from what a study page IS.

WHY THIS IS A SEPARATE FILE FROM extensions.ts, and it is the only reason: the browser must be able to open the room without downloading it.

Taking AFFiNE's whole feature set is most of a megabyte of JavaScript, gzipped -- the canvas, the databases, the embeds, the highlighter's WebAssembly. That is the right price for an editor and the wrong price for a LIST OF PAGES, which is the first thing anybody sees and which needs none of it. Before this split, opening the room downloaded the entire editor before it could draw a single page title, on a phone, on Philippine mobile data, and the room was reported as broken when it was only loading.

So: the store side (what a page may contain, the schema) is small and loads with the room. This file and `effects.ts` are imported with `await import(...)` at the moment somebody opens a page, which is the moment they are asking for an editor. See components/study/StudyRoomEditor.tsx.

#### `lib/study/workspace.ts`

The Explorer's study room, as a workspace the church owns.

WHY THIS IS OURS AND NOT THEIRS. BlockSuite ships exactly one implementation of each of `Workspace`, `Doc` and `WorkspaceMeta`, and all three are in `@blocksuite/store/test`, carrying this note:

@internal Test only Do not use this in production

It is a church's discipleship app; shipping something to members that its own authors mark "do not use in production" is not a thing to do quietly. So the three classes here implement those interfaces over BlockSuite's PUBLIC pieces -- DocEngine, BlobEngine, AwarenessStore, StoreContainer, createYProxy -- which are exported for exactly this purpose.

The structure follows their test implementation closely, because it is the reference for how these interfaces fit together and inventing a different shape would be guessing at Yjs subdoc semantics. BlockSuite is MIT; the notice is in NOTICES.md.

#### `lib/supabase/client.ts`

The browser's connection to your database, or null when there is none.

RETURNS NULL RATHER THAN THROWING, and that is the whole point. A client that throws when the keys are absent means the app cannot start without a database, which would quietly kill the promise that you can clone this and look at it. Every caller checks for null and falls back to the sample data.

tests/no-backend.js enforces this: a bare `process.env.X!` or a throw on a missing key fails the build.

#### `lib/supabase/session-recheck.ts`

When a refused data request should make this device ask about its session.

Since 29 September 2026 the database refuses a request whose session has been ended -- "Sign out everywhere else", a password chosen, an invitation's week running out -- with HTTP 401, instead of honouring the pass the device already held for up to an hour (supabase/migrations/20260929130000_an_ended_ session_ends_at_once.sql).

A 401 is not proof that the session is over, and this app never decides that from a request's answer (lib/supabase/client.ts, refreshBrowserSession). It asks the one server that knows, by spending the refresh token: refused means the session is over and the device shows the front door; accepted means it carries on with a fresh token.

AT MOST ONCE A MINUTE, so a request that keeps answering 401 for any other reason can never become a stream of refreshes.

#### `lib/tab-bar.ts`

The bar along the bottom of a phone or a pad: Menu, People, My Files.

Asked for with a sketch and a screenshot of a messaging app's menu: "Can we have Menu | People | My Files as our bottom for our UI to make it simple in our Mobile and Pad?"

Kept pure, with no React and no database, so the two questions that decide what the bar does can be tested in Node: where each tab goes for a given role, and which tab is lit on a given screen. Both shells (the sample one and the live one) and My Files, which runs outside either shell, draw the same bar from these.

#### `lib/talk/reactions.ts`

The six reactions, in the order the menu shows them.

A FIXED SIX, NOT A KEYBOARD. Every messaging app people already use offers a short row of reactions before anything else, and a short row is what makes reacting one tap. A free choice of emoji would also make the database column free text, which is a column nobody can promise anything about.

🙏 FIRST, ON PURPOSE. This is a church's app, and "I'm praying for you" is the reaction a Guide and an Explorer reach for most. It is the one detail of the row that is ours rather than borrowed.

THE SAME SIX ARE IN THE DATABASE: the check on message_reactions.emoji and the list inside react_to(), in supabase/migrations/20261001120000_a_conversation_can_reply_react_and_speak.sql. tests/a-conversation-can-reply-react-and-speak.mjs fails if the three differ. To change the set, change all three and add a migration; never edit one that has run.

#### `lib/talk/thread.ts`

How a conversation is laid out in time: days, runs, and the clock.

Pure functions, shared by both halves of the app through components/talk/ChatView.tsx. Moved here from components/live/shared.tsx on 1 October 2026, when the sample app's chat started drawing the same thread.

#### `lib/talk/voice.ts`

Recording a voice message, in the browser, with nothing to install.

ASKED FOR ON 1 OCTOBER 2026, among the things people expect from a chat app: "Voice messages". For somebody who finds typing slow -- an older member, or anybody explaining something that matters -- speaking is the easier way to say it, and it is how a great many people message every day.

TAP TO START, THEN CANCEL OR SEND. Not hold-to-talk: holding a button down for a minute is hard on an older hand, and a slip of the thumb sends something half-said. Two clear buttons are slower by one tap and never send by accident.

THE MICROPHONE IS ASKED FOR ON THE TAP, NEVER BEFORE, and released the moment recording stops or is cancelled, so the phone's "microphone in use" light goes off when it should. next.config.mjs allows the microphone for this site only (Permissions-Policy: microphone=(self)); camera and location stay off.

#### `lib/talk-open.ts`

Open the chat bubble, at one conversation or at the list, from anywhere.

WHY AN EVENT. The bubble is drawn once, by the shell, and the buttons that open it live on pages the shell knows nothing about: the Message button on a Guide's page for one Explorer, the one on an Explorer's home. A prop would have to be threaded through every page in between; a context would tie the sample half and the live half to one provider. A window event is the same shape on both halves, and it is already how the tutorial is told things (lib/quest.ts, emitQuest).

Asked for on 30 September 2026, with a screenshot of the Talk tab: "take out the chat in 'talk' room and rename talk to just appointments. Let's just improve talk to our bubble chat." The conversation lives in the bubble now, so a page that is about one person says "Message" and opens it there.

#### `lib/tutorial.tsx`

THE TUTORIAL IS NOT PART OF THE LIVE APP. This file is what keeps that true.

There are two separate things in this repository and they share nothing but the screens they are drawn on:

THE LIVE APP real people, real database, invitation only. Every row it shows came from Postgres and passed a security policy. THE TUTORIAL sample people invented in the browser. No database, no account, no network. Works on a plane. Nothing typed into it is ever sent anywhere.

A visitor must be able to try the second one WITHOUT touching the first — that is the whole point of having it. Before this file existed there was no way to: lib/mode.ts decides live-or-demo from whether Supabase keys are present at build time, so on a deployed church app IS_LIVE was permanently true and the tutorial, though compiled into the bundle, was unreachable. The front door offered "Sign in" and "I have an invitation" and nothing else, so somebody evaluating the app had no way in at all.

#### `lib/types.ts`

Domain types — the shape of everything the app stores. The demo store keeps to these exactly, so the screens don't care where the data comes from.

#### `lib/ui-themes.ts`

The app's looks, chosen in Settings, General, Look.

ASKED FOR on 3 October 2026: "I want the current UI to be called "classic" in the settings right now, ChatGPT or Codex will introduce new theme UI that users can pick, but make sure the classic UI remains the same please."

CLASSIC IS THE APP AS IT IS. It has no stylesheet of its own and it never will: it is what every component already draws, so choosing it changes nothing and nothing has to be maintained to keep it. The page always carries which look is chosen, as data-ui-theme on <html>, and Classic's value, "classic", is matched by no rule anywhere.

ON A COMPUTER, CLASSIC IS THE DESKTOP DESIGN. For a few hours on 3 October 2026 that was a second look called Desktop, beside a Classic that still put the phone's bar and navy band on a computer. The owner, the same day, with a screenshot of Desktop: "this is the classic. I dont want the UI classic with the outdated version where the UI is still mobile in desktop". So the rooms down the left and the light top bar are now the app's own computer layout (components/DesktopNav.tsx, app/desktop-layout.css), under every look, and a device that had chosen Desktop is simply on Classic again.

#### `lib/url-signal.ts`

Notice when the address changes, including when React cannot.

THE BUG THIS EXISTS FOR: a Director standing on `/admin?room=pairings` presses "Waiting to be approved" on their desk. It links to `/admin?room=approvals`. Same page, same component, so nothing unmounts and nothing re-renders — the address in the bar changes and the screen does not. The desk rail is drawn ON the admin page, so this is not an edge case; it is the most likely press there is. It reads exactly as reported: "I click it and it doesn't go to the feature."

Next's App Router gives no hook for this. `usePathname()` does not change, because the path did not. `useSearchParams()` does, but it forces a Suspense boundary onto every statically rendered page that touches it, which is a large change to make for a query string. `popstate` covers the back button only — the browser does not fire it, or `hashchange`, for a pushState.

#### `lib/url.ts`

Only allow http(s) links to become clickable. A material's external_url is entered by an admin/DM; without this guard a value like "javascript:…" would render as an href and run on click (stored XSS). Anything that isn't an absolute http/https URL returns null and is shown as plain, non-clickable text.

#### `lib/use-plan-sync.ts`

Running lib/plan-sync.ts for a screen: when it opens, when the signal comes back, when another device changes something (the account's copy is published, so a change on the phone reaches the laptop while it is open), and a moment after each change here.

With no store (the sample church, a page opened with no signal) or a database that has no account copy yet, it does nothing and says so: the device's copy is all there is, as before.

#### `lib/uuid.ts`

A v4 UUID that works everywhere the app runs.

WHY THIS FILE EXISTS. `crypto.randomUUID()` is a SECURE-CONTEXT api. It is undefined over plain `http://` on a LAN address — which is exactly how a church tries the app on its own machine or office network first — and it is absent in Safari before 15.4. Unguarded it does not degrade, it throws, so whatever the caller was doing fails outright: no attachment, no feedback, no error anybody can act on.

`crypto.getRandomValues()` has no such restriction. It is available on plain http, in every browser that matters, and it is what the fallback uses. So the result is a real random v4 UUID on every platform, not a weaker id on the older ones — which matters because the previous fallback here was `Math.random()`, and a value that merely looks like an id is the kind of thing somebody later treats as one.

#### `lib/video.ts`

Turn a YouTube or Facebook video link into an embeddable player URL.

No SDK, no API key, no dependency: both platforms expose a plain iframe endpoint and that is the entire integration. We never download, re-host or proxy the video — the person's browser talks to YouTube/Facebook directly, exactly as it would in a normal tab. That keeps this free and keeps us on the right side of both platforms' terms, which forbid re-hosting their video.

## A.4 Scripts

#### `scripts/blocksuite-aliases.mjs`

Where `@blocksuite/*` imports actually point, in one place.

WHY THIS EXISTS, AND IT IS NOT A PREFERENCE. Every @blocksuite package's `exports` map points at its own TypeScript SOURCE -- "./src/index.ts" -- with no `types` condition and no `main`. Two things follow, both measured rather than assumed:

* `tsc --noEmit` pulls their source into OUR program and fails on it: "Cannot find name 'VirtualKeyboard'", "'priorityTarget' is used before its initialization". Their files, our gate, and skipLibCheck cannot help because these are .ts in the program rather than .d.ts.

* A bundler reading the same map gets raw Lit decorators (`@prop()`) and the `accessor` keyword, and the build dies on syntax.

Every package also ships a complete, compiled `dist` with .js and .d.ts. So both problems have one answer: resolve @blocksuite to dist. This file computes that mapping from each package's own exports map rather than guessing the layout -- which matters, because a handful of subpaths do not mirror it (`@blocksuite/affine-gfx-turbo-renderer/painter` is a worker file, not a directory).

#### `scripts/check-links.mjs`

Does every resource on the shelf still open?

WHY THIS EXISTS. The starter kit is nineteen links to other people's websites. Nothing in this repository controls them. A publisher reorganises, a PDF moves, a ministry lets a domain lapse — and the church finds out when an Explorer taps a resource on their first day and gets a 404. That is the worst possible moment for it, and nothing else in the test suite would ever notice, because every other check reads the source rather than the internet.

It could not be written to run where it was written: that sandbox has no route out, so `curl` to any of these hosts fails at the proxy. GitHub Actions does have a route out, which is why this runs there rather than in `npm run verify`.

node scripts/check-links.mjs

#### `scripts/complete-guide-shots.mjs`

Every screen of the sample church, for the two complete guides.

THE LIST OF SCREENS IS READ FROM THE APP, NOT WRITTEN HERE. For each sample person it opens every room in their Menu and, inside each room, opens the folder list and visits every folder it finds. A room or folder added later is photographed the next time this runs, without anybody remembering to add it; one that is removed simply stops appearing. That is what keeps the guides honest about what the app shows today.

Sample people only (lib/demo/seed.ts): nothing here can photograph a real member, because the app is started with no database.

npm run build && node scripts/run-next.mjs start -p 4321 node scripts/complete-guide-shots.mjs 4321 # everything node scripts/complete-guide-shots.mjs 4321 phone # one part: phone, # computer or extras

#### `scripts/excalidraw-assets.mjs`

Puts the drawing board's fonts where the app itself serves them.

WHY. Excalidraw draws its hand-lettered text with its own fonts, and when it is not told where they are it fetches them from esm.sh. This app's Content-Security-Policy (next.config.mjs) allows fonts from 'self' and nowhere else, on purpose -- so without this, every word on a drawing would fall back to a plain system font, silently, in production only. And a church app asking a CDN for a font on every drawing tells that CDN who is drawing.

So the fonts are copied out of the installed package into public/excalidraw/ before every build and every dev server, and components/draw/DrawingBoard.tsx points Excalidraw at /excalidraw/. They come from node_modules, so they are always the version the code expects and nothing binary is kept in git.

LEFT OUT: Xiaolai, the Chinese, Japanese and Korean handwriting face. It is thirteen megabytes on its own, against about half a megabyte for the rest, and is only asked for when somebody writes those scripts on a drawing. Then the policy refuses the CDN and the browser uses a system font that has them, so the words still appear, in a plainer hand.

#### `scripts/fake-supabase.mjs`

A stand-in for Supabase, so the LIVE screens can be rendered and looked at.

WHY THIS EXISTS. The live screens only render when the app is in live mode AND somebody is signed in AND their profile loads. Without all three they redirect to the sign-in page, so "it did not show the placeholder" was the most anyone could verify — and that is a long way from "the screen works". Four screens shipped a placeholder for weeks precisely because nobody could see them.

This answers the handful of PostgREST and Auth calls those screens make, with obviously-fake data, so a browser can drive the real components end to end.

It is a TEST FIXTURE and nothing else. It grants everything it is asked for, which is exactly right here and would be catastrophic anywhere near a real deployment — so it binds to localhost only and refuses to start unless NODE_ENV is undefined or 'test'.

#### `scripts/fresh-install.sh`

*No header comment.*

#### `scripts/gen-icons.mjs`

Generate every icon this app serves, from the one definition of the mark.

npm run icons

Run this after changing the logo (components/SentryBeaconMark.tsx) or the brand colours (lib/brand.ts), and commit what it writes. tests/brand-consistency.mjs fails if you forget, which is the whole reason it exists — "the logo didn't change on my phone" was a real bug, and the cause was a regenerated component with stale icon files still committed beside it.

Two things this has to get right, both learned the hard way:

1. It writes the filenames the manifest ACTUALLY references. The first version wrote icon.svg and icon-maskable.svg into the beta repo, whose manifest points at icon-beta.svg — so the app kept serving the old lighthouse and the home screen never changed. The manifest is now read and every filename it names gets written.

#### `scripts/guide-shots.mjs`

Capture the pictures the setup guide walks you through.

SEPARATE FROM scripts/screenshots.mjs ON PURPOSE. That one photographs the PRODUCT — a Guide's desk, a conversation — for the README, to answer "what is this?". These photograph the JOURNEY a person setting it up actually takes, to answer "am I in the right place?". Different audience, different moments, and mixing them would mean every README refresh silently rewrites the guide's illustrations too.

npm run build && node scripts/run-next.mjs start -p 4310 node scripts/guide-shots.mjs 4310

Every shot is the real app running with its own sample people. Nothing is composed or retouched. If a screen changes, rerun this — a screenshot is the one kind of documentation that rots with nothing failing.

#### `scripts/lib/changed-files.mjs`

What `git status` says has changed, parsed.

ITS OWN MODULE SO IT CAN BE TESTED. Living inside ship.mjs it could not be: importing that script runs it, prints a usage message and exits. A helper that cannot be tested is exactly where a bug like the one below survives.

#### `scripts/lint.mjs`

There is no linter in this project, and this says so out loud.

WHAT `npm run lint` USED TO DO. It ran `next lint`, which found no ESLint configuration, and so opened an INTERACTIVE WIZARD asking which style you would like -- and a stray Enter writes a config file into the checkout. A developer's first read of a codebase should not begin by being asked to make a decision nobody has made, in a prompt that looks like an error.

WHAT THAT HID, which is the part worth knowing. ESLint is not in devDependencies, there is no .eslintrc or eslint.config anywhere, and neither the verify gate nor CI has ever run it. Meanwhile the source carries 45 `eslint-disable-next-line` comments across 7 files -- 42 of them for react-hooks/exhaustive-deps. Every one of them READS as a considered suppression that somebody weighed, and not one has ever suppressed anything, because no linter has ever run to be suppressed. That is a misleading comment repeated 45 times, which is worse than no comment at all.

#### `scripts/live-journey-check.mjs`

Does the LIVE app work, end to end, before a real church depends on it?

WHY THIS IS SEPARATE FROM tests/e2e. Those run against the sample-data build, which is the right thing for most checks and useless for this one: live mode is a different code path, reached only when NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY are set at BUILD time. Four live screens once shipped a placeholder for weeks because nobody could see them.

It answers the question asked before a domain is pointed at anything: if a Director invites somebody tomorrow, does every screen in that journey exist?

node scripts/fake-supabase.mjs 4397 (or with TLS, see below) NEXT_PUBLIC_SUPABASE_URL=https://localhost:4397 \ NEXT_PUBLIC_SUPABASE_ANON_KEY=test-key npm run build node scripts/run-next.mjs start -p 4930 node scripts/live-journey-check.mjs 4930

#### `scripts/live-screens-check.mjs`

Does each live screen actually mount its own component?

WHY A BROWSER AND NOT A GREP. The live-or-tutorial choice is made at runtime, per visitor, in lib/tutorial.tsx. Reading the source tells you a branch exists; only a browser tells you which way it went. Four screens spent weeks showing AppShell's "This live screen is being connected" placeholder while their source looked perfectly reasonable.

npm run build && node scripts/run-next.mjs start -p 4320 node scripts/live-screens-check.mjs 4320

Needs NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY set at BUILD time, because that is what puts the app in live mode. It does not need the database to answer: a screen that renders its own loading state has proved the point, and a screen showing the placeholder has proved the opposite.

#### `scripts/run-next.mjs`

*No header comment.*

#### `scripts/screenshots.mjs`

Capture the README screenshots from the running app.

npm run build && node scripts/run-next.mjs start -p 4300 node scripts/screenshots.mjs 4300 (every picture) node scripts/screenshots.mjs 4300 conversation (just the named ones)

WHY THIS IS A SCRIPT AND NOT A FOLDER OF SAVED IMAGES. A screenshot is a claim about what the app looks like today, and it is the one kind of documentation that rots without anyone noticing — nothing fails, the picture just quietly stops being true. Regenerating is one command, so when a screen changes there is no excuse.

It did rot: from 16 September to 3 October 2026 the README showed the left column and the header strip that the bottom bar replaced, a conversation that now opens in its bubble, and none of the Office. Nothing failed.

#### `scripts/setup.mjs`

`npm run setup` — connect this app to your own database, without editing code.

WHY THIS EXISTS. Everything needed to run a real Hope Beacon already ships in this repository: the whole schema, the security rules, the sign-in gateway. The only thing standing between a fresh clone and a working church app was two settings, and the instructions for them lived in a document that asked a non-programmer to create a file with a leading dot, in the right folder, with two exact variable names spelled correctly and no trailing spaces.

That is not a setup step, it is a spelling test, and it is the one that was failing people. This script asks two questions and writes the file.

It never touches the network and never sends anything anywhere. It reads two values you paste, checks their SHAPE only, and writes them to `.env.local`, which .gitignore already refuses to commit.

#### `scripts/ship.mjs`

Gate, commit, push. One command, so the three cannot drift apart.

node scripts/ship.mjs <message-file> node scripts/ship.mjs --dry-run <message-file>

WHY THIS EXISTS, AND IT IS NOT TIDINESS.

Shipping was a block of shell written fresh each time: run the gate, read the verdict, commit, push. Written fresh each time means wrong differently each time, and it produced two real faults in one afternoon.

ONE. TWO ARMED JOBS AT ONCE. A push job left running from an earlier change was still alive when a second was started. Both watched the same tree and both read the same message file off disk, so the first committed a source change under a message written for something else, and the second committed the build stamp under the same message again. The history ended up with two commits, 27 minutes apart, carrying one sentence between them and neither of them describing what it contained.

#### `scripts/stamp-build.mjs`

Stamps one build identity into lib/build-info.ts before every build.

WHY THIS FILE EXISTS. The build id used to be computed inside next.config.mjs as Date.now(), and that config is evaluated more than once: the browser bundle took its value from one evaluation and the server route took its value from another. They disagreed, so the app compared its own id against the server's, found a difference that was never real, and announced "A new version is ready" forever. An update prompt that is always on is worse than no prompt, because people learn to ignore it.

Writing the value to a file makes it a compiled-in constant on both sides. One build, one id, no clock involved, nothing left to evaluate twice.

HOSTING. This reads the environment variables the common hosts already set, and falls back to a timestamp when it recognises none of them — so it works on Vercel, Netlify, Cloudflare Pages, GitHub Actions, a container, or a laptop, with nothing to configure anywhere.

#### `scripts/third-party-notices.mjs`

Writes public/third-party-notices.txt: every open-source package this app is built from, with its licence.

WHY. Almost every package here is under a licence (MIT, ISC, BSD, Apache-2.0, MPL-2.0) that asks for its notice to go with every copy, and the minified code a browser downloads is a copy. The build strips those notices out of the code, and until 1 October 2026 nothing put them back: the licence audit of that day found no notice anywhere in the built app. Settings -> General now links this file ("Code from other projects").

WHAT IS LISTED. Every production dependency in package-lock.json that is actually installed -- not only what reaches the browser, which would need the bundler's opinion and could miss something. Development tools are left out: they never reach anybody.

WHERE THE TEXT COMES FROM. Each package's own licence files, word for word. A package that ships none gets its declared licence named, its author and source, and the standard text of that licence once at the end of this file, taken from another installed package's own copy -- never typed from memory.

#### `scripts/verify.mjs`

One command that runs every guard, so nobody has to remember the list.

npm run verify static guards only — no server, no browser, ~30s npm run verify:all the above plus every end-to-end walk (~4 min)

Why this exists: the checks were all here already and all run by hand, which meant in practice they ran when someone remembered, which meant a stale assertion could sit green-looking for weeks. Three of them had drifted so far they were asserting the *opposite* of what had been asked for, and the only reason anyone noticed was an unrelated investigation.

The e2e half also owns the server lifecycle, because doing that by hand is its own source of wrong answers: `next start` exits 1 when a previous next-server still holds the port, and a stale server happily answers on the old build so the suite passes against code that no longer exists. This picks a free port, waits for the build id it just built, and always tears down.

#### `scripts/walkthrough-shots.mjs`

Photograph the app the way a member actually meets it, for the illustrated guide.

THREE SHOT SCRIPTS, AND THEY ARE NOT INTERCHANGEABLE.

scripts/screenshots.mjs the PRODUCT, for the README: "what is this?" scripts/guide-shots.mjs the SETUP JOURNEY: "am I in the right place?" this one the MEMBER'S JOURNEY: "how do I use it?"

Mixing them would mean a README refresh silently rewrote the member's guide.

PHONE-SHAPED ON PURPOSE. Every one of these is taken at 390x844, because that is what the congregation is holding. A guide illustrated with desktop windows teaches people to look for things where they are not. The two Director screens are the exception and say so: approving members is desk work.

#### `scripts/woff2-names.mjs`

Reads the names a font file carries about itself: who made it, and under what licence. WOFF2 only -- the format every font this app serves is in.

WHY THIS EXISTS. The drawing board's fonts are copied out of Excalidraw's package and served from this app (scripts/excalidraw-assets.mjs). Most of their licences ask that the licence go with every copy, and the copies served here lost it: the subsetting that makes them small keeps a font's name table and nothing else. So the licence file written next to them is read out of the fonts themselves, and cannot drift from what is actually served. Found by the licence audit of 1 October 2026.

No dependency: a WOFF2 file is a table directory followed by one Brotli stream, and Node can undo Brotli on its own. The name table is never transformed, so it can be read straight out of that stream.
