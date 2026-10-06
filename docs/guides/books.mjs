// What goes in each complete guide, and in what order.
//
// Read by build-guides.mjs. A chapter is a document already in the repository,
// a slice of one (a section of the handbook, say), a chapter written for the
// book in docs/guides/using/ or docs/guides/building/, or a picture chapter
// built from the screenshot manifests. Change the order here; change the words
// in the documents.

const H = 'docs/HANDBOOK.md';
const HOW = 'docs/HOW-TO-USE.md';
const START = 'docs/START-HERE.md';
const G = 'docs/guides/building/generated';

// ------------------------------------------------- the atlas, in words ---
// One line for every room, and one for every folder, so the picture chapters
// say what each screen is for. Written from the handbook and the code; where
// the sample church differs from a church's own app, the line says so.
const ROOMS = {
  Profile: 'Your own page: your name, your photograph and your details. Everybody has one, and it is the first row of the Menu.',
  Home: 'The church home, and the first room on every Menu: what the whole church is saying, before anybody turns to their own work.',
  'My Journey': 'An Explorer’s own room. It is built around one relationship, the Guide walking with them, and it holds nothing about anybody else.',
  'My Explorers': 'A Guide’s people: everyone they walk with, and what each of them needs this week.',
  Admin: 'The Director’s desk: who is waiting to be let in, who walks with whom, and the church’s safeguarding.',
  Office: 'Work rather than conversation: the numbers, lesson studies, the Sabbath program, evangelistic meetings and reports. Explorers have no Office, because none of it is theirs to do.',
  'This Sabbath': 'The Sabbath program and any evangelistic meetings a Guide or the church has posted. Once it has been opened with a signal, it opens again with none.',
  'Study Room': 'An Explorer’s own place to write while they read. Nobody else sees it. It is marked beta because the editor inside it is borrowed and is the heaviest part of the app.',
  Music: 'For the choir and anybody who loves music. Everything in it happens on the phone or computer itself; nothing is sent anywhere.',
  'My Files': 'A person’s own music, video and documents, saved on their own device. Nothing in it is shared and nothing comes from anybody else.',
  Mail: 'In the sample church, a mailbox showing what the app sends, without sending real email. In a church’s own app, Mail is for Directors and Executive Directors, and lists the invitations still open, to resend or cancel.',
  'Admin Reports': 'Reports, trials and the record: the part of the app nobody wants to need. It is always in a leader’s Menu, and says plainly when nothing is open.',
  Settings: 'Everything about this device and this account: text size, the look, installing, alerts, language, the guided walk, what is new, and help. A church’s own app adds a Password folder and an Admin Reports folder.',
};

const FOLDERS = {
  'Home/Notices': 'Pinned announcements from the church, newest first, with when each happens.',
  'Home/Blog': 'Posts written for the church. **Write a post** is at the top: a title, the words, **Publish**. Advanced settings narrow who reads it, or keep it as a draft.',
  'Home/Prayer wall': 'Requests the church has been asked to pray for. A request reaches the wall only when the person asking ticks the box, and their name is never shown.',
  'Home/The numbers': 'Counts for the whole church: how many are walking, at which stage, with how many Guides. Counts only; no names and no private details.',
  'My Journey/My Guide': 'The Explorer’s Guide, and anything waiting from them. The conversation itself is the round **Talk** button in the corner.',
  'My Journey/Study': 'The lessons the Guide has sent, in the order they were sent. There is no schedule and nothing to fall behind on.',
  'My Journey/Church': 'Notices and writing from the church, to read without owing anybody a reply.',
  'My Journey/Prayer': 'Asking for prayer, and praying for a Guide who has asked. A request goes to the Guide alone unless the Explorer chooses the church.',
  'My Explorers/My Explorers': 'Everyone this Guide walks with: the stage each has reached, who needs attention and why, and the way into each person’s page.',
  'My Explorers/Next 7 days': 'What is coming in the next week: meetings, follow-ups and anything due.',
  'Office/Numbers': 'How the church, or this Guide’s part of it, is going. The sample’s numbers are invented for practice; a church’s own Office shows its own.',
  'Office/Lesson studies': 'Writing a lesson study once and sending it to the people who need it, with files and drawings attached. Simple by default, with an Advanced mode.',
  'Office/Sabbath program': 'Planning a Sabbath’s order of service, then downloading it as a Word file or a picture, copying it as text, or posting it for This Sabbath.',
  'Office/Evangelistic meetings': 'Planning a series of meetings night by night: programs, teams, schedules and checklists, with a look of its own for the Word file and the picture.',
  'Office/Reports': 'The progress report: how the Explorers are doing this month or quarter, who needs somebody, and a Word file to hand in.',
  'Admin/Approvals': 'The most important screen in the app: who is waiting to be let in, and who Guides have recommended. An Explorer with no Guide has no app.',
  'Admin/People & Pairing': 'Who walks with whom. Pair an Explorer with a Guide, see who is unpaired, and who is at their limit.',
  'Admin/Materials': 'The church’s shared shelf: the resources everybody sees, stocked by the leaders.',
  'Admin/Mail': 'Invitations and the messages the app sends on the church’s behalf.',
  'Admin/Safeguarding': 'Reports somebody has made about a message or a person. The one place a leader may read a private conversation, and only the part reported.',
  'Admin/Analytics': 'The church’s numbers over time: growth, stages and how the Guides are carrying their people.',
  'Music/Listen': 'The player: your own music and video, playlists, and calming sounds for the background.',
  'Music/Tuner': 'Which note you are singing or playing, and whether it is flat or sharp. The microphone is used only while it listens, and nothing is recorded.',
  'Music/Conductor': 'A steady beat, and the conductor’s hand drawn for 2, 3, 4 or 6 beats. Tap the beat to set the tempo.',
  'Music/Pieces': 'The choir’s music: a photographed page made clean and square, or a MusicXML score or a notation program’s PDF that plays, with your own part louder. About this piece explains it from its own markings.',
  'Music/Play': 'A piano keyboard held by each finger at the choir’s concert pitch; in Advanced, the chords of any key and a beat maker.',
  'My Files/Browse': 'Everything on this person’s shelf, with a search box.',
  'My Files/Featured': 'What the church has put first.',
  'My Files/On this device': 'Files saved on this phone or computer, for reading and listening with no signal. They never leave the device.',
  'Mail/Inbox': 'What the app has sent this person.',
  'Mail/Sent': 'What this person has sent through the app, such as recommending somebody.',
  'Mail/Everyone’s mail': 'For leaders in the sample church: every message the app has sent, to anybody.',
  'Settings/General': 'Installing, alerts, text size, the look, and language.',
  'Settings/Church': 'For Directors: the church’s name and its data.',
  'Settings/Help': 'The guided walk, what is new, feedback, and where to find help.',
};

const about = {
  menu: 'Every room this person has, written out, with their own profile at the top. It is the first of the three words along the bottom of every screen: Menu, People, My Files.',
  room: (room) => ROOMS[room] || '',
  folder: (room, folder) => FOLDERS[`${room}/${folder}`] || '',
};

// ---------------------------------------------------------- using it ---
export const USING = {
  id: 'using',
  output: 'Hope-Beacon-Complete-Guide-Using.pdf',
  kind: 'Guide one of two · Using',
  title: 'Using Hope Beacon',
  subtitle: 'Every room, every folder and every role, explained in plain words and shown on a phone and a computer.',
  audience: [
    'Explorers, Guides, Directors and Executive Directors',
    'The church office, and whoever helps people get started',
    'Anybody deciding whether their church should use it',
  ],
  footer: 'Hope Beacon · The Complete Guide to Using It',
  about: 'docs/guides/using/00-about.md',
  coverPictures: ['docs/screenshots/complete/phone-explorer-home-1-notices.jpg', 'docs/screenshots/complete/phone-guide-music-3-conductor.jpg'],
  parts: [
    {
      title: 'Welcome',
      intro: 'What Hope Beacon is, who it is for, and the idea it is built around: one person walking with another.',
      chapters: [
        { src: { file: 'docs/guides/using/01-in-one-look.md' } },
        { src: { file: H, section: /^1\. What the app is/ } },
        { src: { file: H, section: /^2\. The four roles/ } },
        { src: { file: H, section: /^3\. The journey/ } },
        { src: { file: 'docs/ONBOARDING.md' } },
      ],
    },
    {
      title: 'Getting started',
      intro: 'Getting the app onto a phone or a computer, signing in, finding your way around, and making it comfortable to read.',
      chapters: [
        { src: { file: HOW, section: /^Part 1/ }, title: 'Getting it on your phone' },
        { src: { file: H, section: /^5\. Getting it onto a phone/ }, title: 'Your phone, getting around, and the looks' },
        { src: { file: 'docs/guides/using/02-settings-and-looks.md' },
          gallery: { filter: (e) => e.group === 'looks', columns: 2, heading: (e) => (e.device === 'phone' ? 'Every look, on a phone' : 'Every look, on a computer') } },
        { src: { file: 'docs/PLATFORMS.md' } },
      ],
    },
    {
      title: 'A tour, role by role',
      intro: 'The app as each person meets it. Read the part for your own role first; the others are there when you want to know what somebody else sees.',
      chapters: [
        { src: { file: HOW, section: /^Part 2/ }, title: 'If you are an Explorer' },
        { src: { file: 'docs/STUDY-ROOM.md' } },
        { src: { file: HOW, section: /^Part 3/ }, title: 'If you are a Guide' },
        { src: { file: HOW, section: /^Part 4/ }, title: 'If you are a Director' },
        { src: { file: HOW, section: /^Part 5/ }, title: 'The guided walk' },
      ],
    },
    {
      title: 'Running it, week to week',
      intro: 'The detail behind every task a church does in the app: people, conversations, the Office, the numbers, music, and the record.',
      chapters: [
        { src: { file: H, from: /^Inviting somebody/, until: /^The conversation$/ }, title: 'People: inviting, pairing and looking after accounts' },
        { src: { file: H, from: /^The conversation$/, until: /^Rooms and subrooms/ }, title: 'Conversations, meetings, the library, prayer and writing' },
        { src: { file: H, from: /^Rooms and subrooms/, until: /^Cases$/ }, title: 'Rooms, folders and the Office' },
        { src: { file: H, from: /^Cases$/, until: /^5\. Getting it onto a phone/ }, title: 'Cases, safeguarding, the audit and the numbers' },
        { src: { file: 'docs/guides/using/03-music-room.md' } },
        { src: { file: 'docs/JUSTICE.md' } },
      ],
    },
    {
      title: 'Every screen, in pictures',
      intro: 'An atlas of the whole app as the sample church shows it: every room and every folder, for each role, on a phone beside a computer. Use it to find a screen somebody describes, or to see what another role sees.',
      chapters: [
        { title: 'Explorer screens', file: 'docs/guides/using/', lead: 'What John Reyes, an Explorer in the sample church, sees: his own journey, the church, music and his own files.', atlas: { role: 'Explorer', about } },
        { title: 'Guide screens', file: 'docs/guides/using/', lead: 'What Maria Santos, a Guide in the sample church, sees: the people she walks with, her Office, and everything an Explorer has.', atlas: { role: 'Guide', about } },
        { title: 'Director screens', file: 'docs/guides/using/', lead: 'What Pastor Ramos, the sample church’s Director, sees: approvals, pairing, safeguarding and the church’s numbers.', atlas: { role: 'Director', about } },
        { title: 'Executive Director screens', file: 'docs/guides/using/', lead: 'What Bishop Alonzo, the sample Executive Director, sees: everything a Director does, across every church they oversee.', atlas: { role: 'Executive Director', about } },
        { title: 'On a tablet, and before signing in', file: 'docs/guides/using/', lead: 'The same rooms on a tablet held upright, which uses the phone’s layout with more room, and the two screens anybody can open.',
          gallery: { filter: (e) => e.device === 'tablet' || e.group === 'start', columns: 2, heading: (e) => (e.group === 'start' ? 'Before signing in' : `A ${e.role} on a tablet`) } },
      ],
    },
    {
      title: 'Help and reference',
      intro: 'When something looks wrong, the questions people ask, what the app keeps about you, what it costs, and the words it uses.',
      chapters: [
        { src: { file: HOW, section: /^If something looks wrong/ }, title: 'If something looks wrong' },
        { src: { file: H, section: /^12\. When something breaks/ }, title: 'When something breaks' },
        { src: { file: 'docs/guides/using/04-faq.md' } },
        { src: { file: H, section: /^11\. Data protection/ }, title: 'Your information, and how it is protected' },
        { src: { file: H, section: /^10\. What it costs/ } },
        { src: { file: 'docs/PRESENTING.md' }, title: 'Showing it to a church' },
        { src: { file: 'docs/LIVE-DEMO-RUNBOOK.md' } },
        { src: { file: 'docs/guides/using/05-glossary.md' } },
        { src: { file: `${G}/G-release-notes.md` }, title: 'What changed, release by release' },
        { src: { file: H, section: /^14\. What is not finished/ }, title: 'What is not finished yet' },
      ],
    },
  ],
};

// -------------------------------------------------------- building it ---
export const BUILDING = {
  id: 'building',
  output: 'Hope-Beacon-Complete-Guide-Building.pdf',
  kind: 'Guide two of two · Building',
  title: 'Building Hope Beacon',
  subtitle: 'How it is made, how to run your own, and how to change it safely: from a first clone to a reviewed pull request.',
  audience: [
    'Beginners: run it with no code written',
    'Developers, junior to senior: how it is built, and why',
    'IT people: hosting, email, data and security',
    'AI coding agents: the rules, the map and the proof',
  ],
  footer: 'Hope Beacon · The Complete Guide to Building It',
  about: 'docs/guides/building/00-about.md',
  coverPictures: ['docs/screenshots/complete/computer-guide-office-3-sabbath-program.jpg', 'docs/screenshots/complete/phone-director-admin-1-approvals.jpg'],
  parts: [
    {
      title: 'Orientation',
      intro: 'What you are building, the tools it stands on and why those, and how to take part.',
      chapters: [
        { src: { file: 'docs/guides/building/01-overview.md' } },
        { src: [{ file: START, intro: true }, { file: START, from: /^Before any of that/, until: /^Part 2/ }], title: 'Start here: the tools, and why these ones' },
        { src: { file: START, section: /^Part 2/ } },
      ],
    },
    {
      title: 'Setting it up and running it',
      intro: 'From a clone to a church app real people sign in to: the database, hosting, email, moving, updates and cost.',
      chapters: [
        { src: { file: 'docs/SETUP.md' } },
        { src: { file: START, section: /^Part 8/ }, title: 'The simple path, for everyone else' },
        { src: { file: START, section: /^Part 3/ }, title: 'Setting it up, step by step' },
        { src: { file: START, section: /^Part 4/ }, title: 'Deploying' },
        { src: { file: START, section: /^Part 7/ }, title: 'The manual path, for people who code' },
        { src: { file: 'docs/DEPLOY-ANYWHERE.md' } },
        { src: { file: 'docs/BACKENDS.md' } },
        { src: { file: 'docs/EMAIL.md' } },
        { src: { file: H, section: /^6\. Email, end to end/ } },
        { src: { file: H, section: /^7\. Moving to a new project/ } },
        { src: { file: H, section: /^8\. Every setting/ } },
        { src: { file: 'docs/UPDATES.md' } },
        { src: { file: START, section: /^Part 6/ }, title: 'When setting up goes wrong' },
        { src: { file: 'docs/WHAT-IT-COSTS.md' } },
        { src: { file: 'docs/COST-AND-FUTURE.md' } },
      ],
    },
    {
      title: 'How it is built',
      intro: 'The architecture, a guided tour of the code, the backend, and the design rules every screen follows.',
      chapters: [
        { src: { file: 'ARCHITECTURE.md' }, title: 'Architecture' },
        { src: { file: 'docs/guides/building/02-code-tour.md' } },
        { src: { file: 'docs/BACKEND-MAP.md' } },
        { src: { file: 'docs/BUILD-YOUR-OWN.md' }, title: 'Build your own Beacon: front end and backend' },
        { src: { file: 'docs/BUILD-BRIEF.md' }, title: 'The build brief' },
        { src: { file: 'docs/DESIGN.md' } },
        { src: { file: 'docs/VISUAL-LANGUAGE.md' } },
        { src: { file: 'docs/FRESH-LOOKS.md' }, title: 'The looks: Beacon, Study and Focus' },
        { src: { file: 'docs/CHAT-RESEARCH.md' }, title: 'Research record: the conversation' },
        { src: { file: 'docs/SABBATH-PROGRAM-RESEARCH.md' }, title: 'Research record: the Sabbath program' },
        { src: { file: 'docs/MUSIC-RESEARCH.md' }, title: 'Research record: the Music room' },
      ],
    },
    {
      title: 'The database and security',
      intro: 'The rules that must never break, what the app holds about people, and how it is defended.',
      chapters: [
        { src: { file: H, section: /^9\. The database and its rules/ } },
        { src: { file: 'docs/SECURITY.md' } },
        { src: { file: 'docs/DATA-PROTECTION.md' } },
      ],
    },
    {
      title: 'Proving it works',
      intro: 'The gate every change passes, the browser walks, Safari, and how to write a check that earns its place.',
      chapters: [
        { src: { file: 'docs/guides/building/03-quality.md' } },
      ],
    },
    {
      title: 'Recipes',
      intro: 'The common changes, step by step, each with the files to touch and the proof to show.',
      chapters: [
        { src: { file: 'docs/guides/building/04-recipes.md' } },
      ],
    },
    {
      title: 'Working together: people and AI agents',
      intro: 'How to contribute, the brief every AI agent reads first, and what has already gone wrong so it need not again.',
      chapters: [
        { src: { file: 'CONTRIBUTING.md' }, title: 'Contributing' },
        { src: { file: 'AGENTS.md' }, title: "The agents' brief" },
        { src: { file: START, section: /^Part 5/ }, title: 'Using AI to do the work' },
        { src: { file: 'docs/AI-SETUP-GUIDE.md' } },
        { src: { file: H, section: /^13\. For an AI tool/ } },
        { src: { file: 'docs/DEVELOPER-TOOLKIT.md' } },
        { src: { file: 'docs/guides/building/05-lessons.md' } },
        { src: { file: H, section: /^14\. What is not finished/ }, title: 'What is not finished' },
      ],
    },
    {
      title: 'Reference',
      intro: 'Generated from the repository on the day this edition was built: every file, migration, check, walk, address, command and release.',
      chapters: [
        { src: { file: `${G}/A-files.md` } },
        { src: { file: `${G}/B-migrations.md` }, flat: true },
        { src: { file: `${G}/C-checks.md` }, flat: true },
        { src: { file: `${G}/D-walks.md` }, flat: true },
        { src: { file: `${G}/E-routes.md` } },
        { src: { file: `${G}/F-commands.md` } },
        { src: { file: `${G}/G-release-notes.md` }, title: 'What changed, release by release' },
      ],
    },
  ],
};
