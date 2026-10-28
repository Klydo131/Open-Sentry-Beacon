// Feedback, reviewed by a person and handed on: to the reviewer, to a
// developer, or to an AI tool.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 28 October 2026: "a feedback system where AI tools can receive
// it, human checks it the feedback, then human can either fix it manually
// through code or give the feedback to other developers or the one who
// reviewed and recieved the feedback can use AI tools to help develop for
// solutions". The owner chose who reviews (Directors and the Executive
// Director, who already have the Feedback inbox), all three ways out (a brief
// to copy, a GitHub issue, a file for AI tools), and that the sender sees what
// happened to what they sent.
//
// A PERSON CHECKS IT FIRST, AND THAT CHECK IS ALSO A PRIVACY STEP. Feedback is
// written by members and can name people. Nothing in this file reads the
// member's own words, their name or their contact: everything handed on is
// built from the reviewer's SUMMARY, which the reviewer writes (starting from
// the message) and is told to keep free of names. As a second guard the
// summary is scrubbed of anything shaped like an email address or a phone
// number before it leaves.
//
// PURE FUNCTIONS, NO BROWSER. The live inbox, the sample inbox and
// tests/feedback-can-be-handed-on.mjs all call the same code, so what a test
// proves is what a Director's screen produces.
// ---------------------------------------------------------------------------

import { APP_NAME } from '@/lib/brand';

export type FeedbackStatus = 'new' | 'reviewing' | 'in_hand' | 'done' | 'wont_do';
export type FeedbackRoute = 'me' | 'developer' | 'ai';

/** What a reviewer has decided about one piece of feedback. Never the member's own words. */
export interface FeedbackReview {
  /** In the reviewer's words, with no names in it. What is handed on. */
  summary: string;
  /** What "fixed" looks like, so whoever takes it knows when to stop. */
  doneWhen: string;
  route: FeedbackRoute | null;
  /** A developer's name or handle, when route is 'developer'. */
  givenTo: string;
  /** For reviewers only. Never handed on, never shown to the sender. */
  note: string;
}

/** One piece of feedback as the hand-on needs it: its facts, never its author. */
export interface FeedbackForHandOn {
  id: string;
  category: string;
  page: string | null;
  build: string | null;
  createdAt: string;
  status: FeedbackStatus;
  review: FeedbackReview;
}

export const EMPTY_REVIEW: FeedbackReview = { summary: '', doneWhen: '', route: null, givenTo: '', note: '' };

export const KIND_WORDS: Record<string, string> = {
  bug: 'Something is broken',
  confusing: 'Something was confusing',
  idea: 'An idea',
  praise: 'Something good',
};

export const ROUTE_WORDS: Record<FeedbackRoute, string> = {
  me: 'the reviewer',
  developer: 'a developer',
  ai: 'an AI tool, with a person checking its work',
};

/** A short reference anyone can quote back: FB-1a2b3c4d. */
export function feedbackRef(id: string): string {
  return `FB-${id.replace(/-/g, '').slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// THE SECOND GUARD. The reviewer is asked to leave names out; this takes out
// what a reviewer is most likely to miss in a pasted message: an email
// address, a phone number, a link carrying a token. It does not find names,
// which is why a person reads it first and this only follows.
// ---------------------------------------------------------------------------
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email removed]')
    .replace(/https?:\/\/\S*[?#&](?:token|code|key|access_token|refresh_token|signature|sig)=\S*/gi, '[link removed]')
    .replace(/\+?\(?\d[\d\s().-]{5,}\d/g, (m) => {
      const digits = m.replace(/\D/g, '');
      const bare = m.trim();
      // A date (2026-10-28) and a version (1.4.2) are what a bug report is
      // made of; neither is a phone number.
      if (digits.length < 7 || digits.length > 15) return m;
      if (/^\d{4}-\d{2}-\d{2}/.test(bare) || /^\d+(\.\d+)+$/.test(bare)) return m;
      return '[number removed]';
    });
}

/** Ready to hand on: a person has written the summary. */
export function isReviewed(item: Pick<FeedbackForHandOn, 'review'>): boolean {
  return item.review.summary.trim().length > 0;
}

const DEFAULT_DONE: Record<string, string> = {
  bug: 'The steps in "What happened" no longer go wrong, on a phone and on a computer, and a check in tests/ goes red if they ever do again.',
  confusing: 'Somebody new to the app can do this without help, and the words on the screen say what happens before it happens.',
  idea: 'The owner has seen a plan with the options and chosen one (AGENTS.md section 0.2); build only what was chosen.',
  praise: 'Nothing to build. Keep whatever made this work.',
};

function firstLine(text: string, max = 72): string {
  const line = text.trim().split(/\r?\n/)[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/**
 * The brief: what a developer, or an AI tool a developer is driving, needs to
 * take this on. Markdown, so it reads the same pasted into a chat, an issue
 * or an email.
 */
export function feedbackBrief(item: FeedbackForHandOn, app = APP_NAME): string {
  if (!isReviewed(item)) throw new Error('A person has to write the summary before this is handed on.');
  const summary = scrub(item.review.summary.trim());
  const doneWhen = scrub(item.review.doneWhen.trim()) || DEFAULT_DONE[item.category] || DEFAULT_DONE.idea;
  const to = item.review.route === 'developer' && item.review.givenTo.trim()
    ? scrub(item.review.givenTo.trim())
    : item.review.route ? ROUTE_WORDS[item.review.route] : 'not decided yet';
  return [
    `# ${feedbackRef(item.id)}: ${firstLine(summary)}`,
    '',
    `- **Kind:** ${KIND_WORDS[item.category] ?? item.category}`,
    `- **Where in the app:** ${item.page || 'not recorded'}`,
    `- **Version:** ${item.build || 'not recorded'}`,
    `- **Received:** ${day(item.createdAt)}`,
    `- **Handed to:** ${to}`,
    '',
    '## What happened',
    '',
    summary,
    '',
    '## Done when',
    '',
    doneWhen,
    '',
    `## For whoever takes this on`,
    '',
    `This came from somebody using ${app}, and a person in their church has read it and written it up. Read AGENTS.md before changing anything: the rules there outrank this brief. Run \`npm run verify\`, and make each new check fail once to be sure it can. When it is fixed, tell the reviewer the version, so they can mark it done; the person who sent it sees that.`,
    '',
    `_No names or contact details are in this brief. Ask the reviewer, quoting ${feedbackRef(item.id)}, if you need more._`,
  ].join('\n');
}

/** GitHub keeps a new-issue link to about 8,000 characters; the body is cut well inside that. */
const ISSUE_BODY_MAX = 6000;

/**
 * A new-issue page with the brief already in it. Opened in the reviewer's own
 * browser and submitted by them: the app holds no GitHub password, and the
 * repository is public, so only a reviewed brief ever goes.
 */
export function feedbackIssueUrl(item: FeedbackForHandOn, sourceUrl: string, app?: string): string {
  const brief = feedbackBrief(item, app);
  const [titleLine, ...rest] = brief.split('\n');
  let body = rest.join('\n').trim();
  if (body.length > ISSUE_BODY_MAX) body = `${body.slice(0, ISSUE_BODY_MAX).trimEnd()}\n\n_(cut short; ask the reviewer for the rest)_`;
  const title = titleLine.replace(/^#\s*/, '');
  const base = sourceUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({ title, body, labels: 'feedback' });
  return `${base}/issues/new?${params.toString()}`;
}

export const AI_FILE_SCHEMA = 'hope-beacon/feedback-for-ai@1';

export interface FeedbackForAiFile {
  schema: typeof AI_FILE_SCHEMA;
  exportedAt: string;
  app: string;
  instructions: string;
  items: Array<{
    ref: string;
    kind: string;
    page: string | null;
    version: string | null;
    received: string;
    status: FeedbackStatus;
    handedTo: FeedbackRoute | null;
    whatHappened: string;
    doneWhen: string;
    brief: string;
  }>;
}

/**
 * Every reviewed piece of feedback still open, as one file an AI coding tool
 * can read in one go. Unreviewed items are left out: nothing reaches a tool
 * before a person has written it up.
 */
export function feedbackForAi(items: FeedbackForHandOn[], app = APP_NAME, now = new Date()): FeedbackForAiFile {
  const open = items.filter((i) => isReviewed(i) && (i.status === 'reviewing' || i.status === 'in_hand'));
  return {
    schema: AI_FILE_SCHEMA,
    exportedAt: now.toISOString(),
    app,
    instructions: 'Each item has been read and written up by a person in the church; no names or contact details are included. Read AGENTS.md before changing anything, take one item at a time, run npm run verify, and report the version that fixes it to the reviewer by its ref.',
    items: open.map((i) => ({
      ref: feedbackRef(i.id),
      kind: KIND_WORDS[i.category] ?? i.category,
      page: i.page,
      version: i.build,
      received: day(i.createdAt),
      status: i.status,
      handedTo: i.review.route,
      whatHappened: scrub(i.review.summary.trim()),
      doneWhen: scrub(i.review.doneWhen.trim()) || DEFAULT_DONE[i.category] || DEFAULT_DONE.idea,
      brief: feedbackBrief(i, app),
    })),
  };
}

/** What the person who sent it is told. Never the reviewer's notes, never who it went to. */
export function statusForSender(status: FeedbackStatus, fixedIn: string | null, reply: string | null): { word: string; line: string } {
  switch (status) {
    case 'new':
      return { word: 'Received', line: 'Your church has it and will look at it.' };
    case 'reviewing':
    case 'in_hand':
      return { word: 'Being looked at', line: 'Somebody is working on it.' };
    case 'done':
      return {
        word: 'Done',
        line: fixedIn ? `Done in version ${fixedIn}.${reply ? ` ${reply}` : ''}` : (reply || 'Done. Thank you for telling us.'),
      };
    case 'wont_do':
      return { word: 'Not this time', line: reply || 'Your church read it and decided not to change this for now.' };
    default:
      return { word: 'Received', line: '' };
  }
}
