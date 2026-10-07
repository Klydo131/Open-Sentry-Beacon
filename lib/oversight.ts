// What this app is, and who looks after it: said the same way everywhere a
// person is asked to trust it.
//
// The owner, 7 October 2026: "Make sure when a user is invited, the email
// invitation has transparency letting all users know that this app is well
// monitored by the church ... This is a 1 on 1 discipleship private app and
// only used for ministry." And the law asks it in its own words: a person is
// told what is done with their information, by whom and why, before it is
// collected, and consent to sensitive personal information is specific and
// informed (RA 10173 sections 13 and 16; NPC Circular 2023-04). Membership of
// a church's discipleship app is a religious affiliation, which the Act counts
// as sensitive.
//
// ONE SOURCE FOR THREE PLACES. The invitation e-mail
// (supabase/functions/invite/email.ts, which is deployed on its own and so
// carries its own copy), the sign-up page's permission box
// (components/live/DoorPages.tsx), and the sample church's welcome
// (components/ConsentNotice.tsx). tests/the-app-says-who-looks-after-it.mjs
// keeps the e-mail's copy saying the same thing.
//
// EVERY SENTENCE IS ONE THE DATABASE KEEPS TRUE. Leaders see counts and dates
// and never a conversation (tests/leadership-can-measure-without-reading.mjs,
// supabase/tests/a-leader-stays-within-their-rank.sql); a reported message is
// the one thing that reaches them, because that is what reporting is for. A
// notice that promised more privacy than the app keeps, or threatened more
// watching than it does, is the legal trouble this exists to prevent.

import { APP_NAME } from '@/lib/brand';

export interface OversightPoint {
  icon: string;
  text: string;
}

export function oversightPoints(churchName?: string | null): OversightPoint[] {
  const church = churchName?.trim() || 'Your church';
  return [
    {
      icon: '⛪',
      text: `${APP_NAME} is a private app for one-to-one discipleship and the ministry of ${church}. It is used for nothing else.`,
    },
    {
      icon: '🛡️',
      text: `It is overseen by the church. ${church}'s Directors and Executive Directors approve who joins, decide who walks with whom, and can see how the app is being used: who is paired with whom, where each person is on the journey, and counts and dates of meetings and messages.`,
    },
    {
      icon: '🔒',
      text: 'What you write to the person you walk with stays between the two of you. Nobody else can read it, the church\'s leaders included, unless one of you reports a message; a reported message goes to leadership so they can keep everybody safe.',
    },
    {
      icon: '📜',
      text: `${church} keeps your information under the Data Privacy Act of 2012 (Republic Act 10173). You can ask for a copy of it, have it corrected, or have your account removed.`,
    },
  ];
}
