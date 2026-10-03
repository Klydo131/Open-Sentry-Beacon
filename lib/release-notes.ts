// What's new: the release notes people actually read.
//
// A version number tells you a build changed. It does not tell you what changed,
// which is the only part anyone cares about. This is the list, newest first, in
// plain language. No commit hashes, no internal names, nothing a person would
// have to be a developer to parse.
//
// Add an entry at the TOP whenever a release goes out. `id` must be unique and
// must never be reused, because it is what the app remembers to work out which
// notes a person has already seen.

export interface ReleaseNote {
  id: string; // stable, never reused
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: '2026-10-03-desktop-default',
    date: '2026-10-03',
    title: 'Computers open in the Desktop look',
    items: [
      'On a computer, your rooms are now down the left side and the bar along the bottom is gone. Phones and tablets have not changed.',
      'Prefer the look you had before? Settings, General, Look, then Classic. Your choice stays.',
    ],
  },
  {
    id: '2026-10-03-classic-look',
    date: '2026-10-03',
    title: 'Classic, and a Desktop look for computers',
    items: [
      'Settings, General, has a new Look card. The look you know is called Classic, and it stays chosen until you choose otherwise.',
      'On a computer, choose Desktop: your rooms go down the left side and the bar along the bottom goes away. On a phone or tablet it looks just like Classic.',
      'Classic itself has not changed, and any looks added later will appear beside it.',
    ],
  },
  {
    id: '2026-10-02-progress-report',
    date: '2026-10-02',
    title: 'A progress report, folders, calendars, and your plans on every device',
    items: [
      'Guides, Directors and Executive Directors have a progress report in the Office, under Reports: for a month or a quarter, how each Explorer is moving along the journey, the Bible studies and lessons, and who needs you this week. Add your own notes, then download it as a Word file.',
      'Evangelistic meetings now start from the night as many churches run it: children\'s time from 5:30 PM, health time, Bible study, then snacks. Each night has an end time too.',
      'Keep Sabbath programs and meetings in folders, and put them on your phone\'s calendar with Add to calendar, or one night at a time in Google Calendar.',
      'Your programs and meetings are still saved on your device first, and now also follow you to any phone or computer where you sign in. Only you can see that copy.',
    ],
  },
  {
    id: '2026-10-02-evangelistic-meetings',
    date: '2026-10-02',
    title: 'Plan evangelistic meetings your own way',
    items: [
      'Guides and Directors have a new Evangelistic meetings folder in the Office. Start with a plan (a night for each day, each with the usual program) or start blank.',
      'Shape it freely: add blocks to the whole series or to any night, name a list\'s columns yourself, copy a night to make the next, and choose its colour and heading style.',
      'Mark anything Team only to keep it off the picture and posts. Download a Word file or a picture, or post a night for the people you walk with or the whole church. Explorers find it on This Sabbath.',
    ],
  },
  {
    id: '2026-10-02-this-sabbath',
    date: '2026-10-02',
    title: 'Share the Sabbath program, and find it on This Sabbath',
    items: [
      'Guides and Directors can now post a Sabbath program in the app, to the people they walk with or to the whole church. Explorers find it on This Sabbath, in the Menu, and it is still there with no signal once they have opened it.',
      'Download picture makes a picture of the program for a group chat or a phone\'s gallery. A free Canva account can design a bulletin from it: in Canva choose Upload and add the picture or the Word file.',
      'Advanced settings adds minutes and start times, a note for the platform that stays off the congregation\'s copy, details of your own such as who is on duty, your own templates, and a reminder for each person taking part.',
    ],
  },
  {
    id: '2026-10-02-sabbath-program',
    date: '2026-10-02',
    title: 'Make the Sabbath program in the Office',
    items: [
      'Guides and Directors have a new Sabbath program folder in the Office. A new program starts with Sabbath School, the Divine Service, the afternoon program and sunset vespers, ready for names.',
      'Download it as a Word file, which also opens in Google Docs, or copy it as text for a group chat. Reuse next week starts the next one from this one, names and all.',
      'Your programs are kept on your own phone or computer, not sent anywhere. Download the ones you want to keep or share.',
    ],
  },
  {
    id: '2026-10-01-a-better-chat',
    date: '2026-10-01',
    title: 'A friendlier chat: reactions, replies and voice messages',
    items: [
      'Tap any message to react with 🙏 or a heart, to reply to that one message, to copy it, or to change or delete your own. You can also hold it, or swipe it to the right to reply.',
      'With nothing typed, the round button records a voice message: tap to start, then send it or delete it. Up to two minutes. The app only uses your microphone while you are recording.',
      'Photos open full screen inside the app, the time sits inside each message, and a button takes you back to the newest message when you have scrolled up.',
      'The tutorial shows you how, and moves along when you have done it.',
    ],
  },
  {
    id: '2026-10-01-smoother-motion',
    date: '2026-10-01',
    title: 'Smoother, calmer movement',
    items: [
      'Menus, the bell and the account switchers now open out of the button you pressed and fold back into it when you close them, instead of popping in and vanishing.',
      'Choosing another part of a room fades it in where the last one was, and a person\'s profile eases open under Profile.',
      'If your phone, tablet or computer is set to reduce motion, the app now honours it everywhere, including the tutorial\'s arrow, which used to keep bouncing.',
    ],
  },
  {
    id: '2026-10-01-talk-appointments-desk',
    date: '2026-10-01',
    title: 'Talk in the bubble, appointments first, and less scrolling',
    items: [
      'Your conversations are in the Talk bubble in the corner of every screen. Message on a person\'s page opens it straight at them, and Report is at the top of it.',
      'A Guide\'s page for an Explorer opens on Appointments, and an Explorer\'s own screen has their appointments near the top, so arranging a time takes no scrolling.',
      'Rooms with several parts now open them from one list at the top: tap it to see them all. It says which one you are in and how many there are.',
      'On a phone or an iPad your desk (your note, the pocket and the player) waits behind a small tab on the right edge. Tap it, or swipe in from that edge, to open it.',
      'Guides and Directors can see an Explorer\'s profile and picture: Profile is next to Message, and faces are shown in the lists of people.',
    ],
  },
  {
    id: '2026-09-30-menu-people-my-files',
    date: '2026-09-30',
    title: 'Menu, People and My Files, along the bottom',
    items: [
      'On a phone, an iPad or a computer, three buttons along the bottom of the screen now take you everywhere: Menu, People and My Files.',
      'Menu lists every room you have in words, with your profile at the top and the way out at the bottom. The small pictures under the top bar, and the column down the left side of a computer screen, are gone.',
      'People opens your own people: your Explorers if you are a Guide, your Guide if you are walking with one.',
      'My Files opens the files you keep on this device.',
      'Inside a conversation the buttons step aside to give the messages room. The arrow at the top left takes you back.',
    ],
  },
  {
    id: '2026-08-16-live-invitations',
    date: '2026-08-16',
    title: 'Invitation e-mails and live church accounts',
    items: [
      'Directors can now invite a person by e-mail in the role their church chose.',
      'An invited person sets their own password, then waits for a Director to approve access.',
      'Directors can suspend an approved account without deleting it, then approve it again when access should return.',
      'Approved Guides and Explorers enter their own private workspace; only the paired two can read their conversation.',
      'Sign-in now stays on Hope Beacon’s own secure connection, so browser privacy shields do not mistake a valid password for a failed login.',
    ],
  },
  {
    id: '2026-08-12-auto-update-and-names',
    date: '2026-08-12',
    title: 'Simpler names, and updates that just happen',
    items: [
      'Beacon now installs new versions by itself. There is no button to press and nothing to dismiss.',
      'It waits until you are not in the middle of writing something, so a half-finished message is never lost to an update.',
      'Missionaries are now called Guides, and Admins are called Support. Anyone being walked with is shown by their name, with no label at all.',
    ],
  },
  {
    id: '2026-08-03-orbit-video',
    date: '2026-08-03',
    title: 'Video keeps its original quality',
    items: [
      'Videos saved to Beacon now play in a full-size player with seeking, volume and fullscreen controls.',
      'Beacon keeps the original file on this device and shows its actual resolution. 4K/60 playback depends on the file format, browser, device and display.',
      'Beacon checks that a video can play before saving it and explains when a different format is needed.',
    ],
  },
  {
    id: '2026-08-03-reliable-feedback',
    date: '2026-08-03',
    title: 'Clearer, safer feedback',
    items: [
      'Unfinished words stay on your device, so a closed form or failed connection does not erase them.',
      'Beacon shows a receipt only after your feedback is actually saved. If storage is unavailable, it says so and keeps your words ready to copy or retry.',
      'Your feedback record does not include your IP address, browser or device details, cookies, or church records.',
    ],
  },
  {
    id: '2026-07-30-home-orbit',
    date: '2026-07-30',
    title: 'Church home, a real music player, and updates you can see',
    items: [
      'New Home board. Announcements, milestones and new members all in one place, before your own dashboard.',
      'Upload your own music and video, search it, and delete what you no longer want. Everything stays on your device.',
      'This “What’s new” panel, so you can always see what changed.',
      'The app now checks for updates on its own, without needing to be reinstalled.',
    ],
  },
  {
    id: '2026-07-30-tutorial',
    date: '2026-07-30',
    title: 'The tutorial works properly now',
    items: [
      'It guides you to the right screen instead of saying “not on this screen”.',
      'You can replay it any time from Settings, and it never changes your demo data.',
      'Fixed steps that pointed at buttons which were not on screen yet.',
    ],
  },
  {
    id: '2026-07-29-offline',
    date: '2026-07-29',
    title: 'Works offline, and tells you when you are',
    items: [
      'Every screen now works with no signal, not only the ones you had already opened.',
      'A clear Offline and Back online indicator, plus a Connection row in Settings.',
      'Your saved library files and notes are always available offline.',
    ],
  },
  {
    id: '2026-07-29-library',
    date: '2026-07-29',
    title: 'A real starter library',
    items: [
      'The Bible, Ellen G. White’s writings, the church’s statements of belief and this quarter’s Sabbath School. All free, all from the official publishers.',
      'Play saved audio and video straight from your library.',
      'YouTube and Facebook links open in place, only when you tap them.',
    ],
  },
];

export const LATEST_NOTE_ID = RELEASE_NOTES[0]?.id ?? '';

const SEEN_KEY = 'beacon-seen-notes';

export function seenNoteIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markNotesSeen() {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(RELEASE_NOTES.map((n) => n.id)));
  } catch {
    // Not being able to remember is a small loss; never let it throw.
  }
}

// How many notes this person has not read yet. A first-time user has "seen"
// nothing, but showing them a badge for four historical releases is noise, so a
// device with no record at all is treated as caught up.
export function unseenCount(): number {
  const seen = seenNoteIds();
  if (seen.length === 0) return 0;
  return RELEASE_NOTES.filter((n) => !seen.includes(n.id)).length;
}
