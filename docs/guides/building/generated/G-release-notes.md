# What changed, release by release

The app's own release notes (`lib/release-notes.ts`), newest first: 47 releases, as members read them in Settings, What's new.

### Alerts have a sound of their own

*2026-10-18*

- While Beacon is on your screen, a new alert plays Beacon's own sound: three quick glassy notes, rising and then settling. You hear it once, not twice: the phone's usual sound is held back for it.
- When Beacon is not on your screen, your phone's own notification sound plays as before, following your ringer and Do Not Disturb. Phones do not let any web app choose that one.
- Every alert now makes a sound. Before, a second alert arriving while the first was still showing replaced it without a sound, so a second message, or a prayer request after a message, could go unheard.
- Settings, General, Notifications: Hear it, and a switch to turn Beacon's sound off.

### Every screen opens with no signal

*2026-10-16*

- Once Beacon has been opened with a signal, every screen and every tool is kept on your phone: the Music room and all five of its folders, This Sabbath, the Office, the study room, the drawing board and the PDF reader. Before this, only the screens you had already opened worked, and the Tuner, the Conductor, Pieces and Play did not open at all.
- Signed in, you see what you last saw. The app keeps a copy of what your screens showed, for your account only, and deletes it when you sign out. Sending, posting and answering still need a signal, and the app says so when you try.
- A Guide's Explorers open with no signal too: the pages of the people on your lists are kept.
- Settings, General says whether everything is on your phone yet. The first time it takes about 5 MB, fetched in the background; after an update, only what changed. With Data Saver on, the biggest tools are kept the first time you open them.

### A simpler Tuner: a dial, a button, and a keyboard to sing to

*2026-10-15*

- The Tuner is a dial with your note in the middle, and one round button to start and stop listening. The words are gone; the dial says In tune, or how far off you are.
- Starting note and Concert pitch are one line each. Tap Concert pitch to open it.
- Sing the note, in Advanced settings, is a piano keyboard. Tap a key, sing it and hold it, and it says Perfect, Close, or Try again with what you sang. Sing again after a breath and it tells you again.
- The voice trail, the drone and your instrument are under More tools.
- On a tablet or a computer the dial sits beside its settings, or beside Sing the note, with two octaves of keys. On a computer you can type the note: A S D F G H J K are C to C, Z and X change the octave. The Play keyboard can be played the same way.
- On a computer the Music room uses the whole width of the window, so the Tuner fits on one screen with less scrolling. Your desk waits in its drawer (the tab on the right edge) unless the window is very wide, and the title and the folder button share one row.
- Sing the note now hears every try. A breath taken while the last grade was still showing used to be missed, so the same note sung again straight away was not graded.

### Sing the note, and a tuner that hears each note exactly

*2026-10-14*

- In the Music room, Tuner, tick Advanced settings and you will find Sing the note. Choose one note, or a run of five to ten (or let the app pick them for your voice), sing each one and hold it, and the tuner tells you whether you hit it: the right note, in the right octave. If you did not, it tells you what you sang instead.
- Hit every note and you are told so: Perfect pitch!
- Choose how close counts: Choir (within a quarter of a semitone) or Exact (within a tenth). Leave Play each note before I sing it off for the real test, from memory.
- The tuner itself hears more exactly: a singer with a wide vibrato is shown one note, not two; "ee" at the top of a voice is no longer missed; and a thin phone microphone no longer shows a low note an octave out. It was checked against real singing marked by trained musicians.
- Your voice, the drawing of the last ten seconds, is redrawn: one octave at a time, a row for each note with its name large enough to read on a phone, the note you are singing lit, and each note its own line. A stray sound no longer draws a tall streak.
- The microphone is used only while you sing, and nothing is recorded or sent.

### Choose your language before you sign in

*2026-10-13*

- The front door and the sign-in page now have a language chooser in the corner. Sixteen languages are offered, and the phone or computer keeps your choice after you sign in.
- The front door, the sign-in page and its messages, the code screen of two-step sign-in, and the bar along the bottom are translated. Arabic reads right to left. Everything else is still in English for now, including the permission you give when you join.
- The translations are drafts. If you speak one of these languages and something reads wrong, tell your church so it can be corrected.
- For developers: a guide and working examples for building your own app or server in Rust, C++, JavaScript, Python, PHP, Go, Java, Dart or plain REST, with the privacy rules kept in the database (docs/IN-ANY-LANGUAGE.md).

### Two-step sign-in

*2026-10-13*

- You can add a second step to signing in: a six-digit code from an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator. Somebody who learns your password still cannot sign in as you.
- Turn it on in Settings, on the Password page. It is recommended for Directors and Executive Directors.
- Once it is on, each new sign-in asks for your password and then the code.

### Questions people ask

*2026-10-07*

- Answers to the questions people ask: what the app is, who can see what, signing in, your information and the law, and finding your way around. Search them, or tap a question to read its answer.
- They are on the front door and the sign-in screen for anybody, before signing in, and in Settings, under Help, once you are in.
- The privacy notice now says plainly that conversations are encrypted on their way and where they are kept, but not end to end.

### Who can do what, kept by the church's own rules

*2026-10-07*

- Only an Executive Director can make somebody a Director or an Executive Director. A Director looks after Guides and Explorers.
- Directors can give an Explorer a different Guide with Change Guide. The Explorer keeps their place on the journey, the new Guide starts a fresh conversation, and nobody else ever reads what the two wrote to each other.

### Home is a billboard

*2026-10-07*

- A post can carry photos and one short video of about a minute. Photos are made smaller and lose where they were taken before they are kept. For anything longer, a YouTube or Facebook link plays inside the post.
- Share on an open post or notice sends its title and a link. Only people in your church can open the link.
- Home opens on the church's announcements and its newest blog posts, as cards you swipe sideways. A post with a picture shows the picture.
- Tap a card to read the whole thing, with its photos and any YouTube or Facebook video in it.
- The church's banner is shorter on a phone, so the cards are on the first screen.
- Whoever pinned a notice, or anybody in leadership, can take it down from the notice itself. Put back up is in the Announcements folder.

### Clearer conversations, a simpler Study Room

*2026-10-07*

- In a conversation your messages are blue and the other person's are white, so you can always tell who said what. The dark looks have a dark version of the same two.
- The box you write a message in now lines up with the paperclip and the send button.
- The Study Room starts Simple: your pages, New page and search, and on a page the writing and a few basics. Tap Advanced for folders, tags, Starred, the Journal and the whiteboard. Nothing you have written is hidden by switching.
- In Focus and Dark Aero the writing on a Study Room page was almost black on black. It is light now.
- An appointment that was called off no longer shows a Join button or counts as coming up, and Clear from my list takes it off your list once you have seen it.

### Easier to read, in every look

*2026-10-06*

- Small grey writing (dates, hints, "Report") is a shade darker, so it reads easily.
- A profile's banner is a deeper green or blue, so the name and the line under it stand out.
- Labels on coloured shapes, such as journey stages and the bars in The numbers, now pick dark or white writing, whichever reads.
- In Focus and Dark Aero, the featured resources, the bell's count, the Music player's buttons and a prayer request from your Guide could be almost invisible. They read clearly now.

### Your look, from the first moment

*2026-10-06*

- On a slow connection the page could show Classic for a moment before the look you chose. Now your look is there from the very first moment.

### My Files, simpler on a phone and a pad

*2026-10-06*

- My Files opens with a short title instead of a big banner, so the first resource is on the first screen.
- The filters are one row of chips with a count on each, and the list says which one you chose.
- On this device puts Upload files and Add a link at the top, with your files right below.
- Deleting one of your files now asks a second time, since nothing can bring it back.

### Music PDFs, read on your phone

*2026-10-06*

- Pieces now opens a PDF that MuseScore, Dorico or a similar program made, and reads it note by note: every part's notes and rhythm, the key, time and tempo, the words, and the loud and soft.
- It then plays, explains itself and can be conducted like any score. Under its title it says it was read from the print, so check it against the page before the choir learns from it.
- A scanned PDF is only a picture, and Pieces says so. Older Sibelius and Finale PDFs are not read yet.
- The reader is downloaded only the first time you open a PDF, and the PDF stays on your phone.

### A quicker tuner, and the Music room in every look

*2026-10-06*

- The tuner moves to a new note in about a tenth of a second, keeps its needle steady while you sing, and holds the last note for a moment when you stop.
- Its scale now shows the in-tune zone as a green band, with a bold line for the exact note, easy to see in the dark looks too.
- In dark looks, the conductor's hand, every part on a score and the play line can all be seen now.
- Drop-down lists, sheets and the chat no longer let the page show through them in the Frutiger Aero looks, so their words never mix with the words behind.
- A score in Pieces now explains itself: its tempo, time and key, where it is loud and soft, how high and low each part goes and its hardest leap, its words, and a sentence on its character, read from the score's own markings.
- Conduct this piece opens the Conductor already set to the score's time and tempo.

### Advanced settings in the Music room, and a new Play folder

*2026-10-05*

- Every Music folder opens as simple as before. Tick Advanced settings at the end of one for more, and untick it to put it back.
- Tuner: watch your voice as a line over the last ten seconds, sing against a held drone note, and see notes as a clarinet, trumpet, saxophone or horn reads them.
- Conductor: clicks between the beats, loud or silent beats, a one-bar count-in, a speed trainer that gets a little faster as you go, and tempos saved by name.
- Pieces: move a score up or down to suit your voices, loop a hard passage, silence your own part to sing it, and choose the sound.
- Play is a new folder: a piano keyboard to play with your fingers, the chords of any key a tap each, and a beat maker with a bass drum, snare and hi-hat.
- As before, it all happens on your phone, and what you save stays there.

### Concert pitch you can hear

*2026-10-04*

- In the Music room's Tuner, every change of concert pitch now plays the new A, and says in plain words what it does to every note.
- The common pitches are one tap away: 415 for baroque music, 432, 440 the standard, and 442 for many orchestras.
- Compare with 440 plays the standard A, then yours, so you can hear the difference.
- Listen for the A: ask the organist or pianist to hold an A, and the app measures it and offers it as your concert pitch. Nothing is recorded.
- The tuner shows the pitch it measures against, and the starting note shows the frequency it will play.

### A Music room, for the choir and everyone who loves music

*2026-10-04*

- Music is a new room for everybody, in your Menu and down the left on a computer.
- Listen: the media player, playlists and calming sounds are here now. Your music stays in My Files too, and each file there still has its own Play button.
- Tuner: sing or play a note and see which note it is and whether it is flat or sharp. There is a starting note for the choir, like a pitch pipe, and you can change concert pitch from A 440 for an older organ.
- Conductor: a steady beat with a picture of the conductor's hand for 2, 3, 4 and 6 beats. Tap the beat to set the tempo, or turn the clicks off and follow the hand in silence.
- Pieces: photograph a page of music and get it back straight and clean, black on white. Or open a MusicXML score file to hear every part, make yours louder, slow it down and start from anywhere.
- Everything in the Music room happens on your phone. The tuner uses the microphone only while it is listening, records nothing and sends nothing.

### Five new Frutiger Aero looks

*2026-10-04*

- Settings, General, Look has a new row, Frutiger Aero. Tap it to see five looks side by side, each with a picture and a line about it.
- Frutiger Eco, Dark Aero, Technozen, DORFic and Four Colors: glass, light and a gentle shine, from fresh and green to deep blue.
- Your rooms and everything in them stay the same. Classic is still one tap away.

### A tidier column on computers

*2026-10-04*

- In the Beacon, Study and Focus looks, the column down the left of a computer now starts with your rooms. Menu, People and My Files stay along the bottom of phones and tablets; on a computer, every room, My Files included, is already in the column.

### Smoother on your phone

*2026-10-04*

- Moving between pages, and opening a conversation, now has less work to do in the moment the screen slides in, so it stutters less.
- Scrolling is lighter in the Beacon, Study and Focus looks.

### Write a post straight from Home

*2026-10-04*

- Home now opens with "Write a post" near the top. One tap, and you are typing the title.
- The writing box is simpler: a title, your post, Publish. It tells you when your post has gone out.
- Advanced settings are still there, under Publish, for choosing who sees a post or saving a draft. You never have to open them.

### Your desk colours work in every look

*2026-10-04*

- The colours on your desk now change Beacon, Study and Focus too, not only Classic. The first one is the look's own colours, so you can always go back.
- Each look keeps its own light or dark. In Focus, Warm Office becomes a warm evening brown, and everything stays as easy to read as before.
- Each look remembers its own colour on this device.
- A few buttons in Settings were hard to read in Focus. They now follow every look.
- On a Mac, the invitation to install no longer covers the Talk button, and it steps aside while a conversation is open.

### Safer signing in and out

*2026-10-04*

- Sign out now ends that sign-in for good, not only on the screen in front of you. Your other devices stay signed in.
- A new invitation's password is three short words and a number, joined by dashes, such as harbor-acorn-river-48. It works for three days, so choose your own when you first sign in.
- If too many sign-ins arrive at once, the app now asks you to wait a few minutes instead of saying your password is wrong.

### Three new looks, the same familiar rooms

*2026-10-04*

- Choose bright Beacon, warm Study or dark Focus in Settings, General, Look. Each fits your phone, tablet and computer.
- Your choice stays on this device. Return to Classic whenever you like; its familiar look stays the same.
- First-time sign-in is no longer interrupted by an automatic refresh.

### Write your blog and announcements from Home

*2026-10-03*

- Home has a Blog folder: the writing box is open as soon as you arrive. A title, your post, Publish.
- Guides and leaders also have an Announcements folder in Home, to pin a notice for everybody.
- Need more? Tick Advanced settings to choose who sees a post, save a draft, or add when an announcement happens.
- There is no Publish room any more. Old links to it open Home's Blog folder.
- Offline, the app now simply says Offline.

### Try a text size before you apply it

*2026-10-03*

- Settings, General, Text size: choosing a size now shows it in the preview first, at exactly that size.
- Press Apply when it reads well, and every screen follows. Leave without pressing it and nothing changes.

### Classic is the computer design now

*2026-10-03*

- On a computer, Classic has your rooms down the left side and a light bar across the top. There is no separate Desktop choice any more: it is Classic.
- Nothing has changed on a phone or tablet.
- At the very end of a page, the desk on the right no longer slides under the top of the screen.

### A computer's top bar on a computer

*2026-10-03*

- On a computer, the top of the screen is now a light bar with your bell, your name and Sign out on the right. The Back arrow and the second logo are gone: the logo is in the sidebar, and your browser has Back.
- The desk on the right no longer slides under the top of the screen as you scroll, in Classic or Desktop.
- The look you chose is on the page from the very first moment it opens.

### Computers open in the Desktop look

*2026-10-03*

- On a computer, your rooms are now down the left side and the bar along the bottom is gone. Phones and tablets have not changed.
- Prefer the look you had before? Settings, General, Look, then Classic. Your choice stays.

### Classic, and a Desktop look for computers

*2026-10-03*

- Settings, General, has a new Look card. The look you know is called Classic, and it stays chosen until you choose otherwise.
- On a computer, choose Desktop: your rooms go down the left side and the bar along the bottom goes away. On a phone or tablet it looks just like Classic.
- Classic itself has not changed, and any looks added later will appear beside it.

### A progress report, folders, calendars, and your plans on every device

*2026-10-02*

- Guides, Directors and Executive Directors have a progress report in the Office, under Reports: for a month or a quarter, how each Explorer is moving along the journey, the Bible studies and lessons, and who needs you this week. Add your own notes, then download it as a Word file.
- Evangelistic meetings now start from the night as many churches run it: children's time from 5:30 PM, health time, Bible study, then snacks. Each night has an end time too.
- Keep Sabbath programs and meetings in folders, and put them on your phone's calendar with Add to calendar, or one night at a time in Google Calendar.
- Your programs and meetings are still saved on your device first, and now also follow you to any phone or computer where you sign in. Only you can see that copy.

### Plan evangelistic meetings your own way

*2026-10-02*

- Guides and Directors have a new Evangelistic meetings folder in the Office. Start with a plan (a night for each day, each with the usual program) or start blank.
- Shape it freely: add blocks to the whole series or to any night, name a list's columns yourself, copy a night to make the next, and choose its colour and heading style.
- Mark anything Team only to keep it off the picture and posts. Download a Word file or a picture, or post a night for the people you walk with or the whole church. Explorers find it on This Sabbath.

### Share the Sabbath program, and find it on This Sabbath

*2026-10-02*

- Guides and Directors can now post a Sabbath program in the app, to the people they walk with or to the whole church. Explorers find it on This Sabbath, in the Menu, and it is still there with no signal once they have opened it.
- Download picture makes a picture of the program for a group chat or a phone's gallery. A free Canva account can design a bulletin from it: in Canva choose Upload and add the picture or the Word file.
- Advanced settings adds minutes and start times, a note for the platform that stays off the congregation's copy, details of your own such as who is on duty, your own templates, and a reminder for each person taking part.

### Make the Sabbath program in the Office

*2026-10-02*

- Guides and Directors have a new Sabbath program folder in the Office. A new program starts with Sabbath School, the Divine Service, the afternoon program and sunset vespers, ready for names.
- Download it as a Word file, which also opens in Google Docs, or copy it as text for a group chat. Reuse next week starts the next one from this one, names and all.
- Your programs are kept on your own phone or computer, not sent anywhere. Download the ones you want to keep or share.

### A friendlier chat: reactions, replies and voice messages

*2026-10-01*

- Tap any message to react with 🙏 or a heart, to reply to that one message, to copy it, or to change or delete your own. You can also hold it, or swipe it to the right to reply.
- With nothing typed, the round button records a voice message: tap to start, then send it or delete it. Up to two minutes. The app only uses your microphone while you are recording.
- Photos open full screen inside the app, the time sits inside each message, and a button takes you back to the newest message when you have scrolled up.
- The tutorial shows you how, and moves along when you have done it.

### Smoother, calmer movement

*2026-10-01*

- Menus, the bell and the account switchers now open out of the button you pressed and fold back into it when you close them, instead of popping in and vanishing.
- Choosing another part of a room fades it in where the last one was, and a person's profile eases open under Profile.
- If your phone, tablet or computer is set to reduce motion, the app now honours it everywhere, including the tutorial's arrow, which used to keep bouncing.

### Talk in the bubble, appointments first, and less scrolling

*2026-10-01*

- Your conversations are in the Talk bubble in the corner of every screen. Message on a person's page opens it straight at them, and Report is at the top of it.
- A Guide's page for an Explorer opens on Appointments, and an Explorer's own screen has their appointments near the top, so arranging a time takes no scrolling.
- Rooms with several parts now open them from one list at the top: tap it to see them all. It says which one you are in and how many there are.
- On a phone or an iPad your desk (your note, the pocket and the player) waits behind a small tab on the right edge. Tap it, or swipe in from that edge, to open it.
- Guides and Directors can see an Explorer's profile and picture: Profile is next to Message, and faces are shown in the lists of people.

### Menu, People and My Files, along the bottom

*2026-09-30*

- On a phone, an iPad or a computer, three buttons along the bottom of the screen now take you everywhere: Menu, People and My Files.
- Menu lists every room you have in words, with your profile at the top and the way out at the bottom. The small pictures under the top bar, and the column down the left side of a computer screen, are gone.
- People opens your own people: your Explorers if you are a Guide, your Guide if you are walking with one.
- My Files opens the files you keep on this device.
- Inside a conversation the buttons step aside to give the messages room. The arrow at the top left takes you back.

### Invitation e-mails and live church accounts

*2026-08-16*

- Directors can now invite a person by e-mail in the role their church chose.
- An invited person sets their own password, then waits for a Director to approve access.
- Directors can suspend an approved account without deleting it, then approve it again when access should return.
- Approved Guides and Explorers enter their own private workspace; only the paired two can read their conversation.
- Sign-in now stays on Hope Beacon’s own secure connection, so browser privacy shields do not mistake a valid password for a failed login.

### Simpler names, and updates that just happen

*2026-08-12*

- Beacon now installs new versions by itself. There is no button to press and nothing to dismiss.
- It waits until you are not in the middle of writing something, so a half-finished message is never lost to an update.
- Missionaries are now called Guides, and Admins are called Support. Anyone being walked with is shown by their name, with no label at all.

### Video keeps its original quality

*2026-08-03*

- Videos saved to Beacon now play in a full-size player with seeking, volume and fullscreen controls.
- Beacon keeps the original file on this device and shows its actual resolution. 4K/60 playback depends on the file format, browser, device and display.
- Beacon checks that a video can play before saving it and explains when a different format is needed.

### Clearer, safer feedback

*2026-08-03*

- Unfinished words stay on your device, so a closed form or failed connection does not erase them.
- Beacon shows a receipt only after your feedback is actually saved. If storage is unavailable, it says so and keeps your words ready to copy or retry.
- Your feedback record does not include your IP address, browser or device details, cookies, or church records.

### Church home, a real music player, and updates you can see

*2026-07-30*

- New Home board. Announcements, milestones and new members all in one place, before your own dashboard.
- Upload your own music and video, search it, and delete what you no longer want. Everything stays on your device.
- This “What’s new” panel, so you can always see what changed.
- The app now checks for updates on its own, without needing to be reinstalled.

### The tutorial works properly now

*2026-07-30*

- It guides you to the right screen instead of saying “not on this screen”.
- You can replay it any time from Settings, and it never changes your demo data.
- Fixed steps that pointed at buttons which were not on screen yet.

### Works offline, and tells you when you are

*2026-07-29*

- Every screen now works with no signal, not only the ones you had already opened.
- A clear Offline and Back online indicator, plus a Connection row in Settings.
- Your saved library files and notes are always available offline.

### A real starter library

*2026-07-29*

- The Bible, Ellen G. White’s writings, the church’s statements of belief and this quarter’s Sabbath School. All free, all from the official publishers.
- Play saved audio and video straight from your library.
- YouTube and Facebook links open in place, only when you tap them.
