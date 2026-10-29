// The FAQ, written once. The public page (app/faq/page.tsx) and Settings, Help
// both render it through components/Faq.tsx. Every answer must stay true to the
// code: limits are read from the modules that enforce them, and the oversight
// answers reuse lib/oversight.ts word for word, as the invitation does.
// Deployment-specific facts (hosting country, the DPO) belong in the church's
// privacy notice, so answers point there.

import { APP_NAME, APP_SHORT_NAME, SOURCE_URL } from '@/lib/brand';
import { oversightPoints } from '@/lib/oversight';
import { CLIP_MOST_BYTES, POST_FILES_MOST } from '@/lib/post-media';

export interface FaqLink {
  label: string;
  /** A page in this app ("/privacy"), or the source code on GitHub. */
  href: string;
}

export interface FaqItem {
  /** Stable, so `/faq#faq-<id>` can be sent to somebody and keeps working. */
  id: string;
  q: string;
  /** Paragraphs, in order. Plain text: nothing here is ever drawn as HTML. */
  a: string[];
  links?: FaqLink[];
}

export interface FaqSection {
  id: string;
  icon: string;
  title: string;
  items: FaqItem[];
}

const CLIP_MB = Math.round(CLIP_MOST_BYTES / 1024 / 1024);

export function faqSections(): FaqSection[] {
  // The same four sentences as the invitation email and the sign-up page.
  const [whatItIs, overseen, between, law] = oversightPoints(null).map((p) => p.text);

  return [
    {
      id: 'about',
      icon: '⛪',
      title: 'About the app',
      items: [
        {
          id: 'what-is-it',
          q: `What is ${APP_NAME}?`,
          a: [
            whatItIs,
            'It pairs an Explorer, who is learning about Jesus, with a Guide from the church who walks alongside them. The app holds what that relationship needs: your conversation, readings, prayer requests and meeting times.',
          ],
        },
        {
          id: 'who-looks-after-it',
          q: 'Who looks after it?',
          a: [overseen],
        },
        {
          id: 'roles',
          q: 'What are Explorers, Guides and Directors?',
          a: [
            'An Explorer walks the journey, with one Guide beside them.',
            'A Guide walks with a few Explorers and chooses what to share with them and when.',
            'A Director looks after the church in the app: invites people, approves them, and decides who walks with whom.',
          ],
        },
        {
          id: 'who-can-join',
          q: 'Can anyone join or see what is inside?',
          a: [
            'No. Membership is by invitation only; there is no public sign-up. A visitor who finds the address can see the welcome page, these questions, the privacy notice and a tutorial with sample data, but nothing about any member. The app is not indexed by search engines.',
          ],
        },
        {
          id: 'cost-and-ads',
          q: 'Does it cost anything? Is there advertising?',
          a: [
            'It is free for members and contains no advertising. Your information is never sold or shared with outside companies for analysis. The only usage figures kept are the counts and dates your church’s leaders see.',
            `${APP_NAME} is free, open-source software. Your church pays only for the hosting services that run its copy.`,
          ],
        },
        {
          id: 'open-source',
          q: 'Who made it? Can another church use it?',
          a: [
            'It is free software under the GNU Affero General Public License, and its source code is public. Any church can run its own copy, with its own members and database, and is responsible for that copy. No information is shared between churches.',
          ],
          links: [{ label: 'The code, on GitHub', href: SOURCE_URL }],
        },
      ],
    },
    {
      id: 'joining',
      icon: '🔑',
      title: 'Joining and signing in',
      items: [
        {
          id: 'how-to-join',
          q: 'How do I join?',
          a: [
            'A leader at your church sends you an invitation by email. It contains your sign-in details and a button that opens the app. Sign in, then choose your own password.',
            'A Director approves each new account. Until then, the app shows that your account is awaiting approval.',
          ],
        },
        {
          id: 'invitation-password',
          q: 'The password in my invitation stopped working.',
          a: [
            'The temporary password expires after three days, or as soon as you choose your own, so that it cannot be reused by anyone who sees the email. Tap “Forgot your password?” on the sign-in screen to receive a link for setting a new one.',
          ],
          links: [{ label: 'Forgot your password?', href: '/forgot-password' }],
        },
        {
          id: 'two-invitations',
          q: 'I have two invitations. Which do I use?',
          a: ['Use the most recent one. Each new invitation replaces the one before it.'],
        },
        {
          id: 'no-email',
          q: 'My invitation never arrived.',
          a: [
            'Check your Spam or Promotions folder first. If it is not there, confirm your email address with the person who invited you; they can send it again.',
          ],
        },
        {
          id: 'forgot-password',
          q: 'I forgot my password.',
          a: [
            'Tap “Forgot your password?” on the sign-in screen. It opens a page of its own: type your e-mail address, and a link to choose a new password is sent to you. The link opens the page where you choose it. If your account uses an authenticator app, that page asks for the code too.',
            'Each link works once, for one hour, and only the newest one works. Once signed in, you can change your password at any time on the Password page.',
          ],
          links: [{ label: 'Forgot your password?', href: '/forgot-password' }],
        },
        {
          id: 'two-step',
          q: 'What is two-step sign-in, and should I turn it on?',
          a: [
            'Two-step sign-in adds a six-digit code from an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator, after your password. Someone who learns your password still cannot sign in as you.',
            'Turn it on in Settings, on the Password page, under “Two-step sign-in”. It is strongly recommended for Directors and other church leaders, who can see the church’s member list, and they need it to open Admin Reports’ court room, unless the church’s project sends that code by email instead.',
            'If you lose the phone that holds your authenticator app, contact a Director at your church. Once your identity is confirmed, your church’s administrator can remove it so you can sign in with your password and set it up again.',
          ],
        },
        {
          id: 'under-18',
          q: 'I am under 18. Can I join?',
          a: [
            'Yes, with the consent of a parent or guardian. This is why the app asks for your date of birth: members under 18 join only after a parent or guardian has agreed.',
          ],
        },
        {
          id: 'devices',
          q: 'Can I use it on my phone and my computer?',
          a: [
            'Yes. Sign in on each device. On a phone, add it to your home screen and it opens like any other app (see “How do I put it on my phone’s home screen?” below).',
          ],
        },
        {
          id: 'sign-out',
          q: 'How do I sign out? What if my phone is lost or stolen?',
          a: [
            'Sign out is at the bottom of the Menu. It ends the session completely, not only on the screen in front of you.',
            'If a device is lost, stolen or shared, open the Password page on any device you still have and press “Sign out everywhere else”. Every other device is signed out immediately.',
          ],
        },
      ],
    },
    {
      id: 'conversation',
      icon: '💬',
      title: 'Your Guide and your conversation',
      items: [
        {
          id: 'who-reads',
          q: 'Who can read my messages?',
          a: [between, 'No other account can open it, including other Guides and every church leader. This is enforced on the server, not only by the app’s screens.'],
        },
        {
          id: 'encrypted',
          q: 'Is my conversation encrypted?',
          a: [
            'Yes, while it travels to and from your device and while it is stored. It is not end-to-end encrypted: your church’s server keeps it so that a message can be reported, deleted at your request, or included in a copy of your data. This means the few people who administer your church’s database could access it outside the app. Your church is responsible for limiting who they are, as described in its privacy manual.',
          ],
        },
        {
          id: 'what-leaders-see',
          q: 'What do the church’s leaders see about me?',
          a: [
            'Who is paired with whom, each person’s stage on the journey, and counts and dates: for example, that a message was sent on Tuesday, never what it said. Leaders use this to care for the church and to notice when someone has been left without a Guide.',
          ],
        },
        {
          id: 'report',
          q: 'What happens when I report a message?',
          a: [
            'The message is sent to your church’s leadership so they can keep everyone safe, and the app tells you this before you confirm. Reporting is the only way a leader ever reads a message.',
            'The person you reported is not told when you send it. A Director reads it first, and may then bring them into the conversation about it so it can be talked through; you are told if they do. They never see the pictures or files you attached.',
          ],
        },
        {
          id: 'report-conversation',
          q: 'Who can read the conversation about a report?',
          a: [
            'It is in Admin Reports, under Settings. The person who raised the report and the Director holding it write in it, and the church’s other leaders who may handle it can read it, so nothing is said there between two people only. It says at the top who is in it.',
            'Nobody handles a report about themselves, and a report about a Director is for Executive Directors only. Nothing written there can be changed or taken back.',
          ],
        },
        {
          id: 'brought-in',
          q: 'A Director asked me into a conversation about a report. What does that mean?',
          a: [
            'Somebody reported something that involves you, and the Director holding it would like to talk it through with you and the person who raised it, together. Nothing has been decided. You can read the report and everything said so far, and answer in your own words.',
          ],
        },
        {
          id: 'deleted-record',
          q: 'What stays if my account is deleted?',
          a: [
            'Everything in your account goes. Safeguarding reports stay, because a church has to be able to show what it did: a report you raised or that was about you, with the conversation about it. Your name stays in them as it was, shown with “(account deleted)”, and nothing else about you is kept.',
          ],
        },
        {
          id: 'edit-delete',
          q: 'Can I change or take back a message?',
          a: [
            'Yes, but only your own. An edited message is marked “edited”, and a deleted message is replaced by a note that it was deleted, so the conversation stays clear for both of you.',
            'Deleting removes the words from view, not from the record. They are kept where neither of you can read them, and leadership sees them only when reviewing a safeguarding report.',
          ],
        },
        {
          id: 'photos-voice',
          q: 'Can I send photos, voice messages and reactions?',
          a: [
            'Yes. Photos are resized and their location data is removed before they are stored. Voice messages can be up to two minutes long, and the app uses your microphone only while you are recording. Reactions, like the conversation itself, are visible only to the two of you.',
          ],
        },
        {
          id: 'different-guide',
          q: 'What if I need a different Guide?',
          a: [
            'Speak to a Director at your church. They can assign you a different Guide in one step, and you keep your place on the journey. Your earlier conversation remains between you and your first Guide; your new Guide starts a new one.',
          ],
        },
        {
          id: 'meetings',
          q: 'How do we arrange to meet?',
          a: [
            'Use Appointments. Propose a time to meet online, with a link to the call, or in person, with a place search to help you choose the location. The other person accepts or declines. A cancelled meeting is marked as such, and you can clear it from your list once you have seen it.',
          ],
        },
        {
          id: 'prayer',
          q: 'Can I ask for prayer?',
          a: [
            'Yes, from the bottom of your own screen. Your request goes to your Guide and no one else. When they press “I’m praying”, you are notified, with the date. A Guide can also ask the people they walk with to pray for them.',
          ],
        },
        {
          id: 'journey',
          q: 'What are the stages of the journey?',
          a: [
            'Beginner, Connect, Care, Call and Cultivate. A stage is a note for your Guide, not a score, and the app never pressures anyone to move on.',
          ],
        },
      ],
    },
    {
      id: 'privacy',
      icon: '🛡️',
      title: 'Your information and the law',
      items: [
        {
          id: 'what-is-kept',
          q: 'What is kept about me?',
          a: [
            'Your name, email address and date of birth; anything you choose to add, such as a photo, your city, your work or your interests; what you write; and what the church records, such as when you were approved and any safeguarding report or decision concerning you.',
          ],
          links: [{ label: 'The privacy notice', href: '/privacy' }],
        },
        {
          id: 'why-agree',
          q: 'Why am I asked to agree so clearly?',
          a: [
            'Under the Philippine Data Privacy Act of 2012 (Republic Act 10173), your age and your connection with a church are sensitive personal information. You are therefore told first what is kept and who is responsible for it, and you give consent by ticking an empty box yourself, never simply by continuing.',
          ],
        },
        {
          id: 'terms-of-use',
          q: 'What are the Terms of Use, and why are there two boxes?',
          a: [
            'The Terms of Use say what you and your church can expect of each other in the app: keeping your account to yourself, how people treat each other, what happens to what you write, and how to leave. One box agrees to them and to the privacy notice; the other, separately, gives your church permission to keep information the law counts as sensitive. Neither box starts ticked.',
            'Your agreement is recorded with the version of each document and the time. If either changes, the app tells you what changed and asks you again before you carry on.',
          ],
          links: [{ label: 'The Terms of Use', href: '/terms' }, { label: 'The privacy notice', href: '/privacy' }],
        },
        {
          id: 'where-kept',
          q: 'Where is my information kept?',
          a: [
            'With the hosting services your church uses to run its copy of the app. The privacy notice names them, states the country where your information is kept, and says clearly if that is outside the Philippines.',
          ],
          links: [{ label: 'The privacy notice', href: '/privacy' }],
        },
        {
          id: 'your-rights',
          q: 'Can I see, correct or delete what is kept about me?',
          a: [
            law,
            '“Download my information” on your profile gives you a copy in a single file at any time. For any other request, write to your church’s Data Protection Officer, who is named in the privacy notice. You will receive a response within 30 days.',
          ],
          links: [{ label: 'The privacy notice', href: '/privacy' }],
        },
        {
          id: 'when-deleted',
          q: 'What happens when an account is deleted?',
          a: [
            'Its contents are removed immediately, with no waiting period, along with every file that belonged to it: photos at once, and other files during the nightly clean-up.',
            'Two things are kept: safeguarding reports, and the record that the account was removed. A church must be able to show how it acted, which a record its subject could erase would not allow.',
          ],
        },
        {
          id: 'photo-location',
          q: 'Can a photo I add show where I live?',
          a: [
            'No. Every photo you add, whether in a conversation, on a post or as your profile picture, is resized and has its location data removed before it is stored.',
            'The only exception is evidence attached to a safeguarding report, which is kept exactly as given so that its integrity is preserved. Only the leaders who may handle the report can open it.',
          ],
        },
        {
          id: 'if-wrong',
          q: 'What if something goes wrong with my information?',
          a: [
            'If your information is exposed in a way that could harm you, your church must notify you and the National Privacy Commission within 72 hours of becoming aware of it, as the law requires.',
          ],
        },
        {
          id: 'complain',
          q: 'Who do I complain to?',
          a: [
            'First, your church’s Data Protection Officer, who is named in the privacy notice. If you are not satisfied with the response, you may file a complaint with the National Privacy Commission at privacy.gov.ph.',
          ],
          links: [{ label: 'The privacy notice', href: '/privacy' }],
        },
      ],
    },
    {
      id: 'using',
      icon: '📱',
      title: 'Using the app',
      items: [
        {
          id: 'install',
          q: 'How do I put it on my phone’s home screen?',
          a: [
            'Go to Settings, General, Install. On an iPhone or iPad, open the app in Safari first; the Install card shows the two steps Apple requires (Share, then Add to Home Screen).',
          ],
        },
        {
          id: 'alerts',
          q: 'How do I get alerts on my phone?',
          a: [
            'Tap the bell, then “Turn on device alerts”, and allow notifications when your phone asks. On an iPhone, add the app to your home screen first: Apple allows alerts only from apps installed there.',
            'Alerts show who sent a message, never its words or the words of a prayer request, because an alert can appear on a locked screen.',
          ],
        },
        {
          id: 'alert-sound',
          q: 'What does an alert sound like, and can I change it?',
          a: [
            `While ${APP_SHORT_NAME} is open on your screen, alerts play ${APP_SHORT_NAME}’s own sound: three quick, bright notes that rise and then settle. Settings, General, Notifications has a “Hear it” button and a switch to turn the sound off.`,
            `When ${APP_SHORT_NAME} is not on your screen, your phone plays its own notification sound, which follows your ringer and Do Not Disturb settings. Web apps cannot choose that sound. On Android you may be able to select a different one in your phone’s notification settings for ${APP_SHORT_NAME} or for your browser; on an iPhone it cannot be changed.`,
            `On an iPhone, ${APP_SHORT_NAME}’s own sound is muted when the silent switch is on. On Android it follows the media volume, which is one reason it plays only while the app is open.`,
          ],
        },
        {
          id: 'no-signal',
          q: 'Does it work with no signal?',
          a: [
            'Yes, its screens do. Once the app has been opened with a connection, every screen and tool is stored on your device, including the Music room, This Sabbath, the Office, the study room, the drawing board and any books of the Bible you have saved. Settings, General confirms when everything is available offline.',
            'When you are signed in, you see what you last viewed, and the top of the screen shows Offline. Sending a message, posting or replying requires a connection, and the app tells you if something could not be sent.',
          ],
        },
        {
          id: 'text-size',
          q: 'Can I make the text larger?',
          a: [
            'Yes: Settings, General, Text size. You see a preview first, and the app changes only when you press Apply. The same section has the language and appearance settings.',
          ],
        },
        {
          id: 'looks',
          q: 'Can I change how the app looks?',
          a: [
            'Yes: Settings, General, Look. Classic is the original design; Beacon, Study, Focus and the Frutiger Aero family offer other colour schemes, some of them dark. Your choice is saved on that device.',
          ],
        },
        {
          id: 'home',
          q: 'What is on Home?',
          a: [
            'Your church’s noticeboard: announcements, then the latest blog posts, in two rows you can swipe sideways. Tap a card to read the full post with its photos.',
          ],
        },
        {
          id: 'posts',
          q: 'Who can write a post, and who reads it?',
          a: [
            'Any approved member can, using “Write a post” on Home. A post goes to the whole church or, under Advanced settings, only to the people you walk with or to people you choose.',
            `A post can include up to ${POST_FILES_MOST} photos and one short video of about a minute (${CLIP_MB} MB at most). For longer videos, add a YouTube or Facebook link and it plays within the post.`,
          ],
        },
        {
          id: 'share',
          q: 'Can I share a post with somebody?',
          a: [
            'Yes. Share, on an open post, sends its title and a link. The link opens only for someone signed in to your church who is allowed to read that post, so a member’s writing never leaves the church.',
          ],
        },
        {
          id: 'announcements',
          q: 'Who can pin an announcement?',
          a: [
            'Guides and church leaders. An announcement goes to the whole church, and its author or any leader can take it down.',
          ],
        },
        {
          id: 'my-files',
          q: 'What is My Files?',
          a: [
            'All your files in one place. Files under “On this device” stay on your device and go directly to the person you send them to, without passing through a server. Resources are stored by the church: only you can open one until you share it, after which the recipient can open it too.',
          ],
        },
        {
          id: 'music',
          q: 'What is the Music room?',
          a: [
            'A tuner, a conductor’s beat, your music pieces and something to listen to, all running on your device. The tuner listens only after you tap its microphone button, and nothing it hears is recorded or sent.',
          ],
        },
        {
          id: 'study-room',
          q: 'What is the Study Room?',
          a: [
            'A private space for everybody in the app to write and keep notes on what they are reading. Nobody else can read it. It opens in Simple mode, which already has everything: your pages, Starred, the journal, the Bin, folders, tags and search. Every page can be written on or turned into a whiteboard to draw on. Advanced mode adds Templates, pages already laid out for a lesson plan, attendance, meeting notes, sermon notes, a prayer list, a volunteer schedule and more, and your writing is unchanged when you switch. It keeps a copy on your device, so it works with no signal, and signing out deletes that copy.',
            'On a page, the bar above the writing has Heading, List, To-do and Quote, and More for everything else, including a picture and today\u2019s date. The whiteboard starts clean. On a phone or tablet, tap Tools in its corner for the tools (on a phone, a row of them by name: Select, Pen, Eraser, Shape, Note, Text and More), and tap a shape, a sticky note or a drawing once for a small bar over it: its colour, Lock, a bin to delete it, and three dots for the rest (bring to front, send to back, copy, duplicate). On a computer, double-click empty board (or right-click) for the tools, and double-click a thing for its bar. Press and hold with a finger, or right-click, to open those three dots straight away. Undo and Redo sit beside the tools.',
          ],
        },
        {
          id: 'office',
          q: 'What is the Office?',
          a: [
            'A workspace for Guides and leaders to plan a Sabbath program or a series of evangelistic meetings, download it as a Word file or an image, post it to the church, and prepare progress reports.',
          ],
        },
      ],
    },
    {
      id: 'guides',
      icon: '🧭',
      title: 'For Guides',
      items: [
        {
          id: 'how-many',
          q: 'How many Explorers can I walk with?',
          a: [
            'Your church sets the limit, up to 100, and the app enforces it.',
          ],
        },
        {
          id: 'guide-sees',
          q: 'What can I see about the Explorers I walk with?',
          a: [
            'Their profile and photo, what they write to you, their prayer requests and their stage on the journey. You cannot see the Explorers of other Guides.',
          ],
        },
        {
          id: 'recommend',
          q: 'Can I invite somebody?',
          a: ['Guides recommend; Directors invite. Recommend the person, and a Director will decide.'],
        },
      ],
    },
    {
      id: 'leaders',
      icon: '🏛️',
      title: 'For Directors',
      items: [
        {
          // supabase/tests/a-leader-stays-within-their-rank.sql proves each sentence.
          id: 'who-makes-whom',
          q: 'Who can invite or promote whom?',
          a: [
            'Directors are appointed by the church’s senior leadership, never by another Director. A Director invites, approves and changes the role of Guides and Explorers in their own church. Nobody changes their own role.',
            'These rules are enforced on the server, not only by the app’s screens.',
          ],
        },
        {
          id: 'change-pairs',
          q: 'Can leaders change who walks with whom?',
          a: [
            'Yes. Change Guide, next to Disconnect, assigns an Explorer a different Guide in one step: the first pairing ends, a new one begins, and the Explorer keeps their place on the journey. Changing a pairing never opens a conversation to anyone, including leaders.',
          ],
        },
        {
          id: 'read-a-chat',
          q: 'Can I read a conversation if I am worried about somebody?',
          a: [
            'No. A conversation reaches leadership only when one of its participants reports a message. Otherwise you see pairings, journey stages, and counts and dates, which are the tools for caring for the church.',
          ],
        },
        {
          id: 'who-answers',
          q: 'Who looks into a problem between a Guide and an Explorer?',
          a: [
            'The Director who brought them into the app, by inviting or approving them. The app records who did, so that Director can always be identified. Any Director can still suspend an account or end a pairing immediately to keep someone safe; the responsible Director then follows up.',
          ],
        },
        {
          id: 'disapprove-delete',
          q: 'What is the difference between Disapprove and Delete?',
          a: [
            'Disapprove deactivates an account: the person cannot sign in, but their account and history remain, and you can approve them again. Delete permanently removes the account, its messages and its pairings, and frees the email address. The app asks for confirmation before deleting and keeps a record of who removed whom.',
          ],
        },
        {
          id: 'suspend',
          q: 'Who can a leader act on?',
          a: [
            'A Director acts on Guides and Explorers, never on another Director; only the church’s senior leadership can act on a Director. No one can act on themselves.',
          ],
        },
      ],
    },
    {
      id: 'trying',
      icon: '🧪',
      title: 'Trying it out',
      items: [
        {
          id: 'tutorial',
          q: 'What is the tutorial?',
          a: [
            'A complete working church with sample data, so you can try every role before you are invited. It runs entirely in your browser: no account is needed, nothing is sent anywhere, and nothing you do there affects any church’s real information.',
          ],
        },
        {
          id: 'sample-photos',
          q: 'Where do photos I add in the sample church go?',
          a: ['They stay in your browser, on your device, and are not sent anywhere.'],
        },
        {
          id: 'reset',
          q: 'Can I start the sample church again?',
          a: ['Yes: use “Reset demo data” at the bottom of the sample sign-in screen.'],
        },
      ],
    },
  ];
}

/** How many questions there are, for the page's own line about itself. */
export function faqCount(sections: FaqSection[] = faqSections()): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}
