// Questions people ask, answered once.
//
// ASKED FOR (7 October 2026): "I want a complete FAQ in the app too please
// before users login and inside the app in settings."
//
// ONE SOURCE FOR TWO PLACES. The page anybody can open before signing in
// (app/faq/page.tsx, linked from the front door and the sign-in screens) and
// the Help folder in Settings, in the sample church and in a real one, all draw
// this list through components/Faq.tsx. A question answered in one place and
// not the other is the drift tests/the-live-app-offers-what-the-tutorial-
// offers.mjs exists to stop elsewhere.
//
// EVERY ANSWER IS ONE THE APP KEEPS TRUE, which is the only kind worth giving
// to somebody deciding whether to trust it. Where the answer is a rule, the
// rule is the database's and its test is named in the comment beside it; where
// it is a number, the number is read from the code that enforces it, so the
// two cannot drift apart. The privacy answers say what the privacy notice says
// (app/privacy/page.tsx) and the oversight answers ARE the oversight wording
// (lib/oversight.ts), word for word, because the invitation e-mail and the
// sign-up page say them too, and a person should never read two versions.
//
// WHAT IS NOT HERE. Anything that is one deployment's and not the app's: which
// country the database is in, who the Data Protection Officer is. Those are in
// the church's own privacy notice, and these answers point there instead of
// guessing.
//
// Plain words, no clause numbers, no "user". Written for somebody who has just
// been invited by a person they trust and wants to know what they are joining.

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
  // The same four sentences as the invitation e-mail and the sign-up page.
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
            'Two people walk together: an Explorer, who is finding out about Jesus, and a Guide from the church who walks alongside them. The app carries what that takes: your conversation, readings, prayer requests and the times you meet.',
          ],
        },
        {
          id: 'who-looks-after-it',
          q: 'Who looks after it?',
          a: [overseen],
        },
        {
          id: 'roles',
          q: 'What are Explorers, Guides, Directors and Executive Directors?',
          a: [
            'An Explorer walks the journey, with one Guide beside them.',
            'A Guide walks with a few Explorers and chooses what to share with them and when.',
            'A Director looks after the church in the app: invites people, approves them, and decides who walks with whom.',
            'An Executive Director oversees one or more churches and appoints the Directors.',
          ],
        },
        {
          id: 'who-can-join',
          q: 'Can anybody join, or see what is inside?',
          a: [
            'No. It is by invitation only, and there is no public sign-up. Somebody who finds the address sees the front door, these questions, the privacy notice and a tutorial with sample people in it, and nothing about any member. Nothing inside is shown to search engines.',
          ],
        },
        {
          id: 'cost-and-ads',
          q: 'Does it cost anything? Are there adverts?',
          a: [
            'Nothing for members, and there are no adverts. Nothing about you is sold, and no outside company is given your activity to study. The only numbers kept are the counts and dates the church’s leaders see.',
            `${APP_NAME} is free, open-source software. Your church pays only for the services that run its copy.`,
          ],
        },
        {
          id: 'open-source',
          q: 'Who made it? Can another church have its own?',
          a: [
            'It is free software under the GNU Affero General Public License, and anybody can read how it works. Any church can run its own copy, with its own members and its own database. Nothing is shared between churches.',
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
            'Somebody at your church sends you an invitation by e-mail. It holds your sign-in details and a button that opens the app. Sign in, then choose your own password.',
            'A Director approves each new account. Until they have, the app tells you that you are waiting, rather than letting you in to an empty screen.',
          ],
        },
        {
          id: 'invitation-password',
          q: 'The password in my invitation stopped working.',
          a: [
            'It works for three days, or until you choose your own, because anybody who can read the e-mail could use it. Tap “Forgot your password?” on the sign-in screen and a link to choose a new one is sent to you.',
          ],
          links: [{ label: 'Sign in', href: '/login' }],
        },
        {
          id: 'two-invitations',
          q: 'I have two invitations. Which do I use?',
          a: ['The newest. Sending a new invitation switches off the one before it.'],
        },
        {
          id: 'no-email',
          q: 'My invitation never arrived.',
          a: [
            'Look in Spam or Promotions first. If it is not there, check the address with whoever invited you; they can send it again.',
          ],
        },
        {
          id: 'forgot-password',
          q: 'I forgot my password.',
          a: [
            'Tap “Forgot your password?” on the sign-in screen, and a link to choose a new one is sent to your e-mail. Once you are in, you can change it any time on the Password page.',
          ],
          links: [{ label: 'Sign in', href: '/login' }],
        },
        {
          id: 'two-step',
          q: 'What is two-step sign-in, and should I turn it on?',
          a: [
            'It adds a second step after your password: a six-digit code from an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator. Somebody who learns your password still cannot sign in as you.',
            'Turn it on in Settings, on the Password page, under “Two-step sign-in”. It is recommended for Directors and Executive Directors, who can see the church’s list of members.',
            'If you lose the phone with your authenticator app, ask your church’s Director to contact whoever looks after the app. They can remove it from your account so you can sign in with your password and set it up again.',
          ],
        },
        {
          id: 'under-18',
          q: 'I am under 18. Can I join?',
          a: [
            'Yes, once a parent or guardian has agreed. That is why the app asks for your birthday: somebody under 18 is walked with differently, and their parent or guardian agrees first.',
          ],
        },
        {
          id: 'devices',
          q: 'Can I use it on my phone and my computer?',
          a: [
            'Yes. Sign in on each. On a phone, put it on your home screen and it opens like any other app (see “How do I put it on my phone’s home screen?” below).',
          ],
        },
        {
          id: 'sign-out',
          q: 'How do I sign out? I lost my phone.',
          a: [
            'Sign out is at the bottom of the Menu. It ends that sign-in on the server too, not only on the screen in front of you.',
            'For a lost or shared device, open the Password page on any device you still have and press “Sign out everywhere else”. Every other device is signed out at once.',
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
          a: [between, 'No other account in the app can open it: not other Guides, not Directors, not Executive Directors. The database refuses them, whatever is used to ask.'],
        },
        {
          id: 'encrypted',
          q: 'Is my conversation encrypted?',
          a: [
            'On its way to and from your phone, always, and where it is stored. It is not end-to-end encrypted: the church’s server keeps it, so that it can be reported, removed when you ask, and given to you in a copy. That means the very few people who run the church’s database could reach it there, outside the app. Who they are is the church’s to limit, and its privacy manual says how.',
          ],
        },
        {
          id: 'what-leaders-see',
          q: 'What do the church’s leaders see about me?',
          a: [
            'Who is paired with whom, where each person is on the journey, and counts and dates: that a message was sent on Tuesday, never what it said. They use these to look after the church and to notice when somebody has been left without a Guide.',
          ],
        },
        {
          id: 'report',
          q: 'What happens when I report a message?',
          a: [
            'It goes to the church’s leadership, so they can keep everybody safe. The screen says this before you report. It is the one way a leader ever reads a message, and the person you reported is not told who did.',
          ],
        },
        {
          id: 'edit-delete',
          q: 'Can I change or take back a message?',
          a: [
            'Yes: your own, and only your own. An edited message is marked “edited”. A deleted one leaves a line saying a message was deleted, so the other person is never left wondering whether they imagined it.',
            'Deleting takes the words off the screen, not out of the record. They are kept where neither of you can read them, and leadership sees them only if a safeguarding report is looked at.',
          ],
        },
        {
          id: 'photos-voice',
          q: 'Can I send photos, voice messages and reactions?',
          a: [
            'Yes. A photo is made smaller, and the place it was taken is removed, before it is kept. A voice message is up to two minutes, and the app uses your microphone only while you are recording. Reactions are seen by the two of you, like the conversation.',
          ],
        },
        {
          id: 'different-guide',
          q: 'What if I need a different Guide?',
          a: [
            'Tell a Director at your church. They can give you a different Guide in one step, and you keep your place on the journey. Your first conversation stays between you and your first Guide; the new Guide starts a new one.',
          ],
        },
        {
          id: 'meetings',
          q: 'How do we arrange to meet?',
          a: [
            'From Appointments. Suggest a time online, with the link to the call, or in person, with a place search that suggests where you mean. The other person agrees or says not this time. A meeting that is called off says so, and you can clear it from your list once you have seen it.',
          ],
        },
        {
          id: 'prayer',
          q: 'Can I ask for prayer?',
          a: [
            'Yes, at the foot of your own screen. It goes to your Guide and nobody else. When they press “I’m praying”, you are told, with the date. A Guide can ask the people they walk with to pray for them too.',
          ],
        },
        {
          id: 'journey',
          q: 'What are the stages of the journey?',
          a: [
            'Beginner, Connect, Care, Call and Cultivate. The stage is a note for your Guide, not a score, and nothing in the app hurries anybody along.',
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
            'Your name and e-mail, and whatever you choose to add: a picture, your city, your work, what you are interested in. Your birthday. What you write. And what the church records: when you were approved, and any safeguarding report or decision about you.',
          ],
          links: [{ label: 'The privacy notice', href: '/privacy' }],
        },
        {
          id: 'why-agree',
          q: 'Why am I asked to agree so clearly?',
          a: [
            'Under the Philippine Data Privacy Act of 2012 (Republic Act 10173), your age and your connection with a church are sensitive personal information. So you are told first what is kept and who looks after it, and you agree by ticking an empty box yourself, never by carrying on.',
          ],
        },
        {
          id: 'where-kept',
          q: 'Where is my information kept?',
          a: [
            'With the services your church uses to run its copy of the app. The privacy notice names them, says which country the information is kept in, and says plainly if that is outside the Philippines.',
          ],
          links: [{ label: 'The privacy notice', href: '/privacy' }],
        },
        {
          id: 'your-rights',
          q: 'Can I see, correct or delete what is kept about me?',
          a: [
            law,
            'In the app, “Download my information” on your profile gives you a copy in one file, whenever you like. For anything else, write to the church’s Data Protection Officer, who is named in the privacy notice. You will have an answer within 30 days.',
          ],
          links: [{ label: 'The privacy notice', href: '/privacy' }],
        },
        {
          id: 'when-deleted',
          q: 'What happens when an account is deleted?',
          a: [
            'What is in it goes at once, not after a waiting period, and so does every file that belonged to it: pictures straight away, and the rest at the nightly clean-up, which removes each stored file whose record is gone.',
            'Two things are kept: safeguarding reports, and the record that the account was removed. A church has to be able to show that it acted, and a record the person it describes could erase would show nothing.',
          ],
        },
        {
          id: 'photo-location',
          q: 'Can a photo I add show where I live?',
          a: [
            'No. Every photo you add, in a conversation, on a post or as your picture, is made smaller and has the location your camera recorded taken out before it is kept.',
            'The one exception is evidence attached to a safeguarding report, which is kept exactly as it was sent, because changing it could make it worth less. Only the leadership handling the report can open it.',
          ],
        },
        {
          id: 'if-wrong',
          q: 'What if something goes wrong with my information?',
          a: [
            'If your information is exposed in a way that could harm you, you and the National Privacy Commission are told within 72 hours of it being known, as the law requires.',
          ],
        },
        {
          id: 'complain',
          q: 'Who do I complain to?',
          a: [
            'The church’s Data Protection Officer first, who is named in the privacy notice. If you are not satisfied with the answer, you can complain to the National Privacy Commission at privacy.gov.ph.',
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
            'Settings, General, Install. On an iPhone or iPad, open the app in Safari first; the Install card shows the two taps Apple asks for (Share, then Add to Home Screen).',
          ],
        },
        {
          id: 'alerts',
          q: 'How do I get alerts on my phone?',
          a: [
            'Tap the bell, then “Turn on device alerts”, and allow it when your phone asks. On an iPhone, put the app on your home screen first: Apple allows alerts only from apps installed there.',
            'Alerts never carry the words of a message or a prayer request, because an alert can appear on a locked phone.',
          ],
        },
        {
          id: 'alert-sound',
          q: 'What does an alert sound like, and can I change it?',
          a: [
            `While ${APP_SHORT_NAME} is on your screen, an alert plays ${APP_SHORT_NAME}’s own sound: three quick glassy notes, rising and then settling. Settings, General, Notifications has a “Hear it” button and a switch to turn it off.`,
            `When ${APP_SHORT_NAME} is not on your screen, your phone plays its own notification sound, which follows your ringer and Do Not Disturb. No website or web app can choose that sound; it belongs to the phone. On Android you may be able to pick a different one in your phone’s notification settings for ${APP_SHORT_NAME} or for your browser. On an iPhone it cannot be changed.`,
            `On an iPhone, ${APP_SHORT_NAME}’s own sound is quiet when the silent switch is on. On Android it follows the media volume, which is one reason it plays only while you are looking at the app.`,
          ],
        },
        {
          id: 'no-signal',
          q: 'Does it work with no signal?',
          a: [
            'Its screens do. Once the app has been opened with a signal, every screen and every tool is kept on your phone: the Music room, This Sabbath, the Office, the study room, the drawing board, and the books of the Bible you saved. Settings, General says when all of it is there.',
            'Signed in, you see what you last saw, and the top of the screen says Offline. Sending a message, posting or answering needs a signal, and the app tells you when it could not.',
          ],
        },
        {
          id: 'text-size',
          q: 'Can I make the writing bigger?',
          a: [
            'Yes: Settings, General, Text size. It shows you the new size first and changes the app only when you press Apply. The same place has the language and the look.',
          ],
        },
        {
          id: 'looks',
          q: 'Can I change how it looks?',
          a: [
            'Settings, General, Look. Classic is the app as it was made; Beacon, Study and Focus, and a family of Frutiger Aero looks, change its colours, and some are dark. The choice is kept on that device.',
          ],
        },
        {
          id: 'home',
          q: 'What is on Home?',
          a: [
            'The church’s billboard: announcements, then the newest blog posts, in two rows you swipe sideways. Tap a card to read the whole post with its photos.',
          ],
        },
        {
          id: 'posts',
          q: 'Who can write a post, and who reads it?',
          a: [
            'Anybody approved in the church can, from “Write a post” on Home. A post goes to the whole church, or, under Advanced settings, only to the people you walk with or people you pick.',
            `A post can carry up to ${POST_FILES_MOST} photos and one short video of about a minute (${CLIP_MB} MB at most). For anything longer, put a YouTube or Facebook link in the post and it plays inside it.`,
          ],
        },
        {
          id: 'share',
          q: 'Can I share a post with somebody?',
          a: [
            'Yes: Share, on an open post, sends its title and a link. The link opens only for somebody signed in to your church who may read that post, so sharing it can never carry a member’s writing outside the church.',
          ],
        },
        {
          id: 'announcements',
          q: 'Who can pin an announcement?',
          a: [
            'Guides, Directors and Executive Directors. An announcement goes to the whole church. Its writer, or anybody in leadership, can take it down.',
          ],
        },
        {
          id: 'my-files',
          q: 'What is My Files?',
          a: [
            'Your files in one place. Files under “On this device” stay on your phone and go straight to the person you send them to; they never reach a server. Resources are kept by the church: only you can open one until you send it, and then so can the person you sent it to.',
          ],
        },
        {
          id: 'music',
          q: 'What is the Music room?',
          a: [
            'A tuner, a conductor’s beat, your pieces and something to listen to, all working on your phone. The tuner listens only after you tap its microphone button, and nothing it hears is recorded or sent.',
          ],
        },
        {
          id: 'study-room',
          q: 'What is the Study Room?',
          a: [
            'An Explorer’s own place to write and keep notes on what they are reading. It starts Simple, with pages, search and the Bin. Advanced adds folders, tags, a whiteboard and more, and nothing written changes when you switch.',
          ],
        },
        {
          id: 'office',
          q: 'What is the Office?',
          a: [
            'For Guides and leadership. Plan a Sabbath program or a series of evangelistic meetings, download it as a Word file or a picture, post it to the church, and make a progress report.',
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
            'As many as your church has set, and the database holds to it. It started at five, because that is about how many people one person can really walk with.',
          ],
        },
        {
          id: 'guide-sees',
          q: 'What can I see about the Explorers I walk with?',
          a: [
            'Their profile and picture, what they write to you, their prayer requests and where they are on the journey. Never another Guide’s people.',
          ],
        },
        {
          id: 'recommend',
          q: 'Can I invite somebody?',
          a: ['Guides recommend; Directors invite. Recommend the person, and a Director decides.'],
        },
      ],
    },
    {
      id: 'leaders',
      icon: '🏛️',
      title: 'For Directors and Executive Directors',
      items: [
        {
          // supabase/tests/a-leader-stays-within-their-rank.sql keeps every
          // sentence of this answer, as invented people, on every fresh install.
          id: 'who-makes-whom',
          q: 'Who can invite or promote whom?',
          a: [
            'Only an Executive Director makes somebody a Director or an Executive Director, whether by invitation or by changing a role, and only an Executive Director approves one. A Director invites, approves and changes the role of Guides and Explorers in their own church. Nobody changes their own role.',
            'The database keeps these rules, not only the screens, so they hold whatever is used to reach it.',
          ],
        },
        {
          id: 'change-pairs',
          q: 'Can leaders change who walks with whom?',
          a: [
            'Yes. Change Guide, beside Disconnect, gives an Explorer a different Guide in one step: the first pairing ends, a new one begins, and the Explorer keeps their place on the journey. Changing a pair never opens a conversation to anybody, leaders included.',
          ],
        },
        {
          id: 'read-a-chat',
          q: 'Can I read a conversation if I am worried about somebody?',
          a: [
            'No. A conversation reaches leadership only when somebody in it reports a message. Everything else you see is pairings, journey stages, and counts and dates, and those are what you look after the church with.',
          ],
        },
        {
          id: 'who-answers',
          q: 'Who looks into a problem between a Guide and an Explorer?',
          a: [
            'The Director who brought them into the app, by inviting or approving them. The app keeps who did, so that Director can always be found. Any Director can still suspend an account or end a pairing at once to keep somebody safe; the responsible Director then follows up.',
          ],
        },
        {
          id: 'disapprove-delete',
          q: 'What is the difference between Disapprove and Delete?',
          a: [
            'Disapprove switches an account off: they cannot come in, but they and their history stay, and you can approve them again. Delete removes the account, its messages and its pairings for good, and frees the e-mail address. The app asks a second time before a delete, and keeps a record of who removed whom.',
          ],
        },
        {
          id: 'suspend',
          q: 'Who can a leader act on?',
          a: [
            'A Director acts on Guides and Explorers, never another Director. An Executive Director acts on anybody in the churches they oversee except another Executive Director. Nobody acts on themselves, and nobody at all can act on the Head Executive Director.',
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
            'A complete working church with sample people in it, so you can try every role before anybody invites you. It runs entirely in your browser: no account, nothing sent anywhere, and nothing you do there can touch a church’s real information.',
          ],
        },
        {
          id: 'sample-photos',
          q: 'Where do photos I add in the sample church go?',
          a: ['They stay in your own browser, on your own device, and go nowhere else.'],
        },
        {
          id: 'reset',
          q: 'Can I start the sample church again?',
          a: ['Yes: “Reset demo data”, at the foot of the sample sign-in screen.'],
        },
      ],
    },
  ];
}

/** How many questions there are, for the page's own line about itself. */
export function faqCount(sections: FaqSection[] = faqSections()): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}
