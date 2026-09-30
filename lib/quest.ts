import { roleNoun } from '@/lib/brand';
// The Beacon tutorial — a guided, follow-the-arrow quest for a new user.
//
// Steps complete themselves when you actually DO the thing: a screen emits a
// small window event (`beacon:open-seeker`, `beacon:message`, …) and the quest
// watches for it. Screens never import the quest — they just announce what
// happened. The progression logic here is pure; the visuals live in Quest.tsx.
//
// ---------------------------------------------------------------------------
// One walk per person, not one walk for everybody.
//
// This file used to hold a single array, and every step in it was a missionary's
// job. Whoever you were, the tutorial signed you in as Maria Santos and taught
// you her work. The client's own words for why that is a problem: "Most of the
// church directors (Admins and Executive Admins and Church board members) are in
// their 40s and are not techy. We have a challenge but they can learn."
//
// They can. But not by being shown somebody else's job. A director who opens the
// demo needs to be walked through approving a missionary and reading the church
// at a glance, which is what they will actually do on a Sunday, and the old
// tutorial never mentioned either.
//
// So the engine is unchanged — it was already pure and role-agnostic, every
// function below takes `steps` as an argument — and the data grew a dimension.
// One track per participant, chosen by who is signed in.
// ---------------------------------------------------------------------------

import type { Role } from './types';

export interface QuestTarget {
  /** data-quest attribute of the element to point at. */
  target: string;
  /** What to say while pointing at it. */
  hint: string;
}

export interface QuestStep {
  id: string;
  title: string;
  hint: string;
  /**
   * Where in the app this step happens, as a path a person can read.
   *
   * Being told to tap a glowing button teaches you nothing about the app: you
   * learn the location of one control and forget it. Naming the screen means
   * that when the arrow is gone you still know where the thing lives, which is
   * the difference between being led through a demo and being able to use it.
   */
  where?: string;
  /**
   * What this feature is FOR, and the part that is not obvious from looking at
   * it. Not instructions — those are `hint`. This is the thing a person would
   * otherwise have to be told by whoever trained them.
   */
  learn?: string;
  /** data-quest attribute of the element the arrow points at ('' = none). */
  target: string;
  /**
   * Ordered fallbacks, tried in turn when `target` is not in the DOM.
   *
   * Three of these steps act on a control inside a seeker's room, and a room is
   * two hops from the seeker list: open a person, then pick a tab. A single
   * fallback was not enough — standing on the list with no seeker open, the
   * tutorial could find neither the control nor its tab, and fell through to
   * offering "Go to My Seekers" while you were already looking at My Seekers.
   * Tapping that navigated to the page you were on, so nothing happened.
   *
   * The chain walks back one hop at a time: the control, then the tab that
   * reveals it, then the seeker card that opens the room at all.
   */
  fallbacks?: QuestTarget[];
  /**
   * The screen this step lives on. Only ever offered when you are NOT already
   * there — a button that navigates you to where you are standing is not
   * guidance, it is a no-op that reads as a broken button.
   */
  route?: string;
  routeLabel?: string;
  /** any of these events completes the step. */
  events: string[];
}

// Said in one place so the wording is identical wherever the chain lands.
const OPEN_A_SEEKER: QuestTarget = {
  target: 'seeker-card',
  hint: 'Open an Explorer first. Tap the highlighted card to go into their room.',
};

// ------------------------------------------------------- the missionary ----
// Unchanged. The client praised this walk, so not a word of it moves.
const DM_STEPS: QuestStep[] = [
  {
    id: 'open',
    where: 'My Explorers',
    learn:
      'This list is only the people paired with you. You never see another Guide\u2019s Explorers, and they never see yours. Each card shows how long it has been since you last spoke, so the quiet ones rise to the top.',
    title: 'Open an Explorer',
    hint: 'Tap the highlighted card to open this person’s journey. You only ever see the Explorers paired with you.',
    target: 'seeker-card',
    route: '/dm',
    routeLabel: 'Go to My Explorers',
    events: ['beacon:open-seeker'],
  },
  {
    id: 'message',
    where: 'My Explorers \u203a an Explorer \u203a Talk',
    learn:
      'Talk is a private conversation between the two of you. It is not a group chat, and church leaders cannot read it. The number on the Talk tab counts messages you have not opened yet.',
    title: 'Send a message',
    hint: 'Type in the highlighted box and send. This conversation is private. Only the two of you can ever read it.',
    target: 'chat-send',
    fallbacks: [
      {
        target: 'tab-talk',
        hint: 'Open the Talk tab. That is where the conversation lives.',
      },
      OPEN_A_SEEKER,
    ],
    route: '/dm',
    routeLabel: 'Go to My Explorers',
    events: ['beacon:message'],
  },
  {
    id: 'advance',
    where: 'My Explorers \u203a an Explorer \u203a Journey',
    learn:
      'The journey is six stages: Create, Connect, Care, Call, Cultivate, Commission. Advancing stamps the date, so the history underneath becomes the record of how you walked with this person. You can move someone back if you moved them early.',
    title: 'Advance their journey',
    hint: 'Tap the highlighted button to move them one step forward on the path. It’s logged, and they get a gentle notification.',
    target: 'advance',
    fallbacks: [
      {
        target: 'tab-journey',
        hint: 'Open the Journey tab. The path and the Advance button are in there.',
      },
      OPEN_A_SEEKER,
    ],
    route: '/dm',
    routeLabel: 'Go to My Explorers',
    events: ['beacon:advance'],
  },
  {
    id: 'share',
    where: 'My Explorers \u203a an Explorer \u203a Resources',
    learn:
      'What you share lands in that person\u2019s library and nowhere else. Sharing is one person at a time, so an Explorer only ever sees what you chose for them, when they are ready for it.',
    title: 'Share a resource',
    hint: 'Tap the highlighted Share button to give them a reading or video. An Explorer only ever sees what you personally share.',
    target: 'share',
    fallbacks: [
      {
        target: 'tab-resources',
        hint: 'Open the Resources tab. Everything you can share is in there.',
      },
      OPEN_A_SEEKER,
    ],
    route: '/dm',
    routeLabel: 'Go to My Explorers',
    events: ['beacon:share'],
  },
  {
    id: 'profile',
    where: 'You \u203a Profile',
    learn:
      'Your profile is what an Explorer sees when they tap your name. A photo and one honest line about yourself is what turns a message from a stranger into a message from a person.',
    title: 'Make it yours',
    hint: 'Tap your picture, top-right, any time to edit your profile: a photo, your interests, and how people can reach you.',
    target: 'profile-link',
    events: ['beacon:profile'],
  },
  {
    id: 'done',
    where: 'Anywhere you like',
    learn:
      'Everything here is sample data on your own device. Nothing you do reaches a real person, so open every screen and press every button. Settings has the tutorial again whenever you want it.',
    title: 'You’re ready',
    hint: 'That’s the heart of Beacon. Explore freely from here, or create your own account to begin for real.',
    target: '',
    events: ['beacon:finish'],
  },
];

// ---------------------------------------------------------- the admin ------
// The person who runs the church's account day to day. Everything here is a
// thing they will do in their first week and could not discover on their own.
const ADMIN_STEPS: QuestStep[] = [
  {
    id: 'a-approvals',
    where: 'Admin › Approvals',
    learn:
      'Nobody gets into your church by signing up. Every new person waits here until you let them in, and the number on this tab is how many are waiting. This is the gate, and you hold it.',
    title: 'See who is waiting',
    hint: 'Tap the highlighted Approvals tab. Anyone who has asked to join is listed there.',
    target: 'tab-approvals',
    route: '/admin',
    routeLabel: 'Go to Admin',
    events: ['beacon:tab-approvals'],
  },
  {
    id: 'a-approve',
    where: 'Admin › Approvals',
    learn:
      'You choose the role as you approve, and that choice decides what they can see for as long as they are here. A Guide sees the Explorers paired with them. An Explorer sees only their own journey. Nobody can change their own role afterwards, including you.',
    title: 'Let someone in',
    hint: 'Pick a role for the highlighted person, then tap Approve. They can sign in from that moment.',
    target: 'approve',
    fallbacks: [
      {
        target: 'tab-approvals',
        hint: 'Open the Approvals tab first. The people waiting are in there.',
      },
    ],
    route: '/admin',
    routeLabel: 'Go to Admin',
    events: ['beacon:approve'],
  },
  {
    id: 'a-recommend',
    where: 'Admin › Approvals › Recommended by a Guide',
    learn:
      'A Guide cannot invite anybody themselves. They recommend a name and an email, it arrives here, and you decide. When you invite, the new person is paired to the Guide who recommended them automatically, so nobody has to remember to do it afterwards.',
    title: 'Act on a recommendation',
    hint: 'Tap Invite on the highlighted recommendation. That sends the invitation and sets up the pairing in one go.',
    target: 'invite-recommended',
    fallbacks: [
      {
        target: 'tab-approvals',
        hint: 'Open the Approvals tab. Recommendations from Guides are listed under the people waiting.',
      },
    ],
    route: '/admin',
    routeLabel: 'Go to Admin',
    events: ['beacon:invite-recommended'],
  },
  {
    id: 'a-pair',
    where: 'Admin › People & pairing',
    learn:
      'A pairing is the whole relationship: it is what lets those two message each other, and it is what stops everybody else reading it. Unpair them and the conversation is no longer visible to either side. This is also where you can remove a member.',
    title: 'Pair a Guide with an Explorer',
    hint: 'Choose a Guide and an Explorer in the highlighted card, then create the pairing. They can talk from that moment.',
    target: 'create-pairing',
    fallbacks: [
      {
        target: 'tab-pairing',
        hint: 'Open the People & pairing tab. The pairing card is at the top.',
      },
    ],
    route: '/admin',
    routeLabel: 'Go to Admin',
    events: ['beacon:pair'],
  },
  {
    id: 'a-materials',
    where: 'Admin › Materials',
    learn:
      'Anything you add here becomes available for Guides to share, but it does not reach a single Explorer until a Guide chooses to send it to one. You stock the shelf; they decide who is ready for what.',
    title: 'Stock the library',
    hint: 'Open the highlighted Materials tab. Readings and videos you add here are what Guides can share.',
    target: 'tab-materials',
    route: '/admin',
    routeLabel: 'Go to Admin',
    events: ['beacon:tab-materials'],
  },
  {
    id: 'done',
    where: 'Anywhere you like',
    learn:
      'Everything here is sample data on your own device. Nothing you do reaches a real person, so open every screen and press every button. Settings has this walk again whenever you want it.',
    title: 'You’re ready',
    hint: 'That is the admin’s job in Beacon: who gets in, who walks with whom, and what is on the shelf. The Analytics tab also holds a “For the church board” panel, for when you are asked at a meeting.',
    target: '',
    events: ['beacon:finish'],
  },
];

// ------------------------------------------------------ the executive ------
// Oversight rather than operation. A church director wants to know how the
// church is doing and who is joining it; they are not the person creating
// pairings every week.
const EXEC_STEPS: QuestStep[] = [
  {
    id: 'x-analytics',
    where: 'Admin › Analytics',
    learn:
      'These are counts, not names. You can see how many people are being walked with and how active the church is, without reading anybody’s private conversation. Scroll down and there is a “For the church board” panel: the four numbers to read out at a meeting, what the board is deliberately not shown, and a Print button. The board has no account here. You are the one who will be asked, so it lives in yours.',
    title: 'Read the church at a glance',
    hint: 'Tap the highlighted Analytics tab. This is the whole church in numbers.',
    target: 'tab-analytics',
    route: '/admin',
    routeLabel: 'Go to Admin',
    events: ['beacon:tab-analytics'],
  },
  {
    id: 'x-church',
    where: 'Home',
    learn:
      'The journey chart shows how many people are at each of the six stages. It never names anyone. An Explorer looking at this same screen does not see the chart at all, because a stage is a note the church keeps about a person, not a thing that person is.',
    title: 'See the journey chart',
    hint: 'Tap the highlighted Home link. The journey chart is below the activity board.',
    target: 'church-link',
    // ON A PHONE OR A PAD HOME IS IN THE MENU. The header's church link is a
    // desktop control now; below 1280px the bottom bar is the navigation and
    // the Menu lists Home first. One hop back: the Menu tab, then Home in it.
    fallbacks: [
      { target: 'tab-menu', hint: 'Tap Menu at the bottom of the screen. Home is the first room in it.' },
    ],
    route: '/church',
    routeLabel: 'Go Home',
    events: ['beacon:open-church'],
  },
  {
    id: 'x-approvals',
    where: 'Admin › Approvals',
    learn:
      'Church board approval of a Guide happens off the app, in your meeting, exactly as it does today. What happens here is only the record of it: somebody is let in, with a role, and the app remembers who did it and when.',
    title: 'See who is waiting to join',
    hint: 'Tap the highlighted Approvals tab. Nobody joins your church without passing through here.',
    target: 'tab-approvals',
    route: '/admin',
    routeLabel: 'Go to Admin',
    events: ['beacon:tab-approvals'],
  },
  {
    id: 'done',
    where: 'Anywhere you like',
    learn:
      'Everything here is sample data on your own device, so nothing you press reaches a real person. Settings has this walk again whenever you want it, and the admin walk is there too if you want to see the day-to-day side.',
    title: 'You’re ready',
    hint: 'That is the oversight view: the numbers, the journey, and the gate.',
    target: '',
    events: ['beacon:finish'],
  },
];

// ---------------------------------------------------------- the seeker -----
// Three steps, deliberately. This is the person with the least reason to
// persevere with a tutorial, and the six-stage ladder must never appear.
const DS_STEPS: QuestStep[] = [
  {
    id: 's-message',
    where: 'My Journey › Talk with your Guide',
    learn:
      'This conversation is only between you and the person walking with you. Church leaders cannot read it. Nobody else in the church can read it.',
    title: 'Say hello',
    hint: 'Type in the highlighted box and send. Only the two of you can ever read this.',
    target: 'chat-send',
    route: '/ds',
    routeLabel: 'Go to My Journey',
    events: ['beacon:message'],
  },
  {
    id: 's-lesson',
    where: 'My Journey › My lessons',
    learn:
      'Your Guide chooses what to send you and when. Nothing appears here that they did not pick for you, and there is no schedule you are behind on.',
    title: 'Open a lesson',
    hint: 'Tap the highlighted lesson to open it. Mark it done when you have finished, in your own time.',
    target: 'ds-lesson',
    // A target inside a room the person has not opened is not on the screen at
    // all, so the spotlight has nothing to land on. Falling back to the room's
    // own tab points at the thing that reveals it, which is exactly what the
    // Guide's steps already do with `tab-talk`.
    fallbacks: [
      { target: 'room-study', hint: 'Open Study. Your lessons are kept in there.' },
    ],
    route: '/ds',
    routeLabel: 'Go to My Journey',
    events: ['beacon:ds-lesson'],
  },
  {
    id: 's-prayer',
    where: 'My Journey › Prayer',
    learn:
      'A request goes to your Guide by default. If you tick the box, the whole church can pray for it, and your name is never shown when they do.',
    title: 'Ask for prayer',
    hint: 'Write what is on your heart and tap the highlighted button. Your Guide will see it.',
    target: 'ds-prayer',
    fallbacks: [
      { target: 'room-prayer', hint: 'Open Prayer. That is where you write your request.' },
    ],
    route: '/ds',
    routeLabel: 'Go to My Journey',
    events: ['beacon:ds-prayer'],
  },
  {
    id: 'done',
    where: 'Anywhere you like',
    learn:
      'Everything here is sample data on your own device. Nothing you write reaches a real person, so try anything you like.',
    title: 'That’s everything',
    hint: 'Someone is walking with you, you can read what they send, and you can ask for prayer. That is all there is to it.',
    target: '',
    events: ['beacon:finish'],
  },
];

// ------------------------------------------------------------ the map ------

// A walk belongs to a role, and only to a role.
//
// There used to be a fifth track for a church board member. The owner cut it,
// and the reasoning is worth keeping: "take out the church member account since
// they don't have any account in this app." Offering board members a card on the
// sign-in screen implied an account that does not exist and is not being built.
// Their approval of a missionary happens in their own meeting, off the app.
//
// The need behind that walk was real, so it did not disappear — it moved into
// the accounts that DO exist. Admin and Executive both carry a "For the church
// board" panel on the Analytics tab: the numbers to read out, what the board is
// deliberately not shown, and where its approval actually happens. See
// app/admin/page.tsx.
export type QuestTrack = Role;

export const QUEST_BY_TRACK: Record<QuestTrack, QuestStep[]> = {
  executive: EXEC_STEPS,
  admin: ADMIN_STEPS,
  dm: DM_STEPS,
  ds: DS_STEPS,
};

/** Human names for the walks, used by Settings and the sign-in screen. */
// The FIFTH copy of the role-label map, and the one that names the cards on
// the front door — the first words a visitor reads. It still said "Missionary"
// and "Admin" two renames after those words were retired, because every pass
// went looking for the map it already knew about.
//
// Derived now. There is no longer a place to forget.
export const TRACK_LABELS: Record<QuestTrack, string> = {
  executive: roleNoun('executive'),
  admin: roleNoun('admin'),
  dm: roleNoun('dm'),
  ds: roleNoun('ds'),
};

/** The demo persona each walk signs you in as. */
export const TRACK_PERSONA: Record<QuestTrack, string> = {
  executive: 'exec-1',
  admin: 'admin-1',
  dm: 'dm-maria',
  ds: 'ds-john',
};

export function stepsFor(track: QuestTrack): QuestStep[] {
  return QUEST_BY_TRACK[track] ?? DM_STEPS;
}

// The steps a person actually performs. 'done' is a closing card, not a task —
// counting it made the front door say "4-step" while the panel counted to 6, two
// different wrong numbers for the same tutorial.
export function tasksIn(steps: QuestStep[]): QuestStep[] {
  return steps.filter((s) => s.id !== 'done');
}

/** How many things this walk asks you to do. Differs per track now. */
export function taskCount(track: QuestTrack): number {
  return tasksIn(stepsFor(track)).length;
}

// Every event any walk listens for. The Quest component subscribes to all of
// them and lets the active track decide which ones mean anything, so adding a
// step never means remembering to register its event somewhere else.
export const QUEST_EVENTS: string[] = Array.from(
  new Set(Object.values(QUEST_BY_TRACK).flatMap((steps) => steps.flatMap((s) => s.events))),
);

/** Mark complete every step whose events include the fired event. Forgiving:
 *  doing something early still counts. Returns ids in step order. */
export function completeByEvent(
  steps: QuestStep[],
  completed: string[],
  eventType: string,
): string[] {
  const done = new Set(completed);
  for (const s of steps) if (s.events.includes(eventType)) done.add(s.id);
  return steps.filter((s) => done.has(s.id)).map((s) => s.id);
}

/** Index of the first not-yet-completed step, or -1 when all are done. */
export function currentStepIndex(steps: QuestStep[], completed: string[]): number {
  const done = new Set(completed);
  return steps.findIndex((s) => !done.has(s.id));
}

// Progress counts tasks only, so the denominator matches what the person was
// promised and what the checklist shows.
export function questProgress(
  steps: QuestStep[],
  completed: string[],
): { done: number; total: number } {
  const tasks = steps.filter((s) => s.id !== 'done');
  const ids = new Set(tasks.map((s) => s.id));
  return { done: completed.filter((id) => ids.has(id)).length, total: tasks.length };
}

/** Announce a completed action. No-op on the server; guarded for SSR. */
export function emitQuest(type: string, detail?: unknown): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
