import type { Stage, Track } from './types';

// ---------------------------------------------------------------------------
// Your church's name for this app. Start here, and read the next paragraph.
//
// This is the first thing most forks want to change, so it is deliberately the
// first thing in the first file. The name shipped below is an EXAMPLE -- one
// church's -- and replacing it is expected, supported, and checked for in the
// sense that the gate refuses a BLANK name rather than a different one. The browser tab, the installed app's name on a
// phone home screen, and the link preview all come from these constants.
//
// CHANGE THESE TWO LINES AND NOTHING ELSE. That is true now, and it is worth
// saying how recently it became true, because the same sentence sat here for
// months while it was false.
//
// It used to claim that nothing hard-codes the name and that
// tests/brand-consistency.mjs would fail if something started to. That test
// only ever compared the LOGO DRAWING between its copies; it never looked at
// the name once. So forty-five hard-coded occurrences accumulated across
// twenty-three screens behind a promise nobody was testing, and the rename from
// the app's first name had to visit ninety-nine files instead of one.
//
// Those forty-five now read from the constants below, and
// tests/the-brand-is-one-name.mjs fails if a single one comes back. A comment
// in the source may still say the name in plain words -- a comment is prose,
// not something a person reads on a screen, and rewriting those would make the
// code harder to read to satisfy a rule that was never about them.
// ---------------------------------------------------------------------------

// AND ONE THING A RENAME MUST NOT TOUCH. Two localStorage keys carry the app's
// old name -- `hope-beacon.feedback.local` and `hope-beacon:library-favorites`.
// A storage key is an ADDRESS, not a label: renaming one does not move what is
// stored there, it points the browser at a drawer nothing has ever written to,
// and somebody's unsent feedback or saved favourites are gone with no error and
// no way back. They keep their original spelling forever, and
// tests/the-brand-is-one-name.mjs goes red if either is swept up by the next
// find-and-replace.

// THREE LAYERS OF NAME, AND ONLY TWO OF THEM ARE FIXED.
//
//     THE PROJECT      Open Sentry Beacon   what a developer clones. Fixed. It
//                                           is the name of the software.
//     THIS DEPLOYMENT  Hope Beacon          what this particular church calls
//                                           it. An EXAMPLE. See below.
//     YOUR FORK        whatever you like    your church's name for it.
//
// HOPE BEACON IS AN EXAMPLE, NOT THE PRODUCT'S NAME. It is what the demo and
// the first real congregation run under, and it is here so that everything
// downstream -- the manifest, the invitation e-mails, the sign-in screen -- has
// a real name to show rather than a placeholder nobody would notice was still a
// placeholder. Change it. That is what it is for.
//
// CONFLATING THE FIRST TWO COST A RENAME IN EACH DIRECTION, which is why they
// are spelled out. A sweep once replaced the app's name with the PROJECT'S, so
// a congregation signed in under a name nobody had given them, on the screen
// where they type their password -- the worst possible place to look
// unfamiliar. It was caught from a screenshot by the owner, not by a test.
//
// A church never sees the project's name. It sees this file. Anything the
// project is called belongs in README.md, AGENTS.md and a clone URL, and
// nowhere a member can read.
//
// WHAT THE GATE ENFORCES, so that a fork knows what it is free to do: that a
// name is SET and is not the project's own name leaking through. Not what the
// name is. tests/the-brand-is-one-name.mjs used to pin the literal string
// below, which would have failed the build of the first church that did what
// docs/START-HERE.md tells them to do.

/** The full name. Browser tab, installed app, the "about" line. */
export const APP_NAME = 'Hope Beacon';

/** The short name. Used where space is tight: the header, a home-screen label. */
export const APP_SHORT_NAME = 'Hope Beacon';

/**
 * One sentence. Shown by link previews and by an installer.
 *
 * WHAT THIS APP IS ABOUT, said in the order that matters. It used to open
 * "A disciple-making journey app for local churches" — which describes the
 * customer rather than the point. A church is who runs it; walking with Christ
 * is what it is for, and that is what somebody sent a link should read first.
 * The vocabulary inside the app is untouched: "your church invited you" is
 * still a church, because there it means an actual congregation.
 */
export const APP_DESCRIPTION =
  'Walking with Jesus, one step at a time. And never on your own. ' +
  'Someone from your church walks it with you.';

/** The two ends of the logo gradient, left to right. */
export const BRAND_FROM = '#2F80ED';
export const BRAND_TO = '#3EB489';

export const NAVY = '#1E2A4A';

/**
 * The tutorial's own colour.
 *
 * The tutorial used to be drawn in NAVY, exactly like the live app: same mark,
 * same title, same gold Sign in, same "I have an invitation". A person who
 * pressed "Open the tutorial" landed on a screen indistinguishable from the one
 * they had just left and reasonably concluded nothing had happened.
 *
 * That is not only confusing, it is the failure the demo ribbon was written to
 * prevent — somebody typing a real person's details into sample data because
 * nothing on screen said which app they were in. A colour is the one signal
 * that works before anybody reads a word.
 *
 * Deep plum rather than a warning colour: the tutorial is a legitimate part of
 * the product, not a mistake to escape from. It matches the purple the demo
 * notice has always used.
 */
export const TUTORIAL_PURPLE = '#4C3575';
export const GOLD = '#E8B84B';

// The six disciple-making stages, in order, with the brand color for each.
// Traditional track = orange family, merges to gold at "Call", greens to
// "Commission". Colors come straight from the design spec.
export const STAGES: { key: Stage; label: string; color: string; blurb: string }[] =
  [
    // LABEL ONLY. The key is a database enum on every pairing and every
    // journey event; renaming it would be a migration and a rewrite of
    // recorded history to change one word on a screen. "Beginner" says what
    // the stage means to the person in it, which "Create" never did: it named
    // what the church was doing, not where the Explorer was.
    { key: 'create', label: 'Beginner', color: '#F5921B', blurb: 'Just beginning' },
    { key: 'connect', label: 'Connect', color: '#EA7C1F', blurb: 'Building rapport' },
    { key: 'care', label: 'Care', color: '#E0703C', blurb: 'Walking alongside' },
    { key: 'call', label: 'Call', color: '#E8B84B', blurb: 'Point of decision' },
    {
      key: 'cultivate',
      label: 'Cultivate',
      color: '#A9C24A',
      blurb: 'Growing in faith',
    },
    {
      key: 'commission',
      label: 'Commission',
      color: '#7FB03A',
      blurb: 'Sent to disciple',
    },
  ];

export const STAGE_ORDER: Stage[] = STAGES.map((s) => s.key);

export function stageInfo(stage: Stage) {
  return STAGES.find((s) => s.key === stage) ?? STAGES[0];
}

export function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function nextStage(stage: Stage): Stage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

export function trackColor(track: Track): string {
  return track === 'traditional' ? '#EA7C1F' : '#2F80ED';
}

// What each role is CALLED on screen. The database still stores 'dm', 'ds',
// 'admin' and 'executive' — every permission rule is written against those, and
// renaming them would mean rewriting the security model to change a word.
//
// The wording came from the client, and the reasoning is worth keeping:
//
//   'Guide' rather than 'Digital Missionary'  — describes what the person does
//                                               rather than a title to live up to.
//   'Director' rather than 'Admin'            — the job is leading the church's
//                                               Hope Beacon ministry, not
//                                               administering people.
//   'Executive Director' above that           — the same job across more than
//                                               one church.
//   'Explorer' for a seeker                   — someone exploring the world of
//                                               SDA values.
//
// A ROLE LABEL IS NOT A BADGE THE PERSON WEARS. This replaced an earlier rule
// here, which was to give a seeker no label at all. That rule's reasoning was
// right — printing a category under somebody's name sorts them in front of the
// very people walking with them — but it also left a Guide unable to tell who
// was who on a roster, and it left the app with no word for the person it
// exists to serve.
//
// So the label exists, and it is scoped to the READER instead of deleted:
// 'Explorer' renders for a Guide, a Director and an Executive Director, and it
// renders nowhere the app tells you what YOU are — not your own header, not
// your own profile, not the welcome notification. It is how the people
// supporting someone refer to them, not something said back to the person.
//
// Everyone else's label is unconditional: a Guide seeing "Guide" under their
// own name is a job title, and an Explorer needs to see "Guide" under the name
// of the person walking with them.
//
// If you are forking this and want different words, this map is the only place
// to change them. If you want a different RULE, change roleLabel() — and the
// test in tests/brand-consistency.mjs will tell you what you broke.
/**
 * The stage before this one, or null at the very first.
 *
 * Used by the Guide's Undo control, and by anything that needs to know whether
 * stepping back is even possible before offering it. Reading the order from
 * STAGES rather than repeating it means a stage added to the journey cannot
 * leave a second list quietly wrong.
 */
export function previousStage(stage: Stage): Stage | null {
  const i = STAGES.findIndex((s) => s.key === stage);
  return i > 0 ? STAGES[i - 1].key : null;
}

export const ROLE_LABELS: Record<string, string> = {
  executive: 'Executive Director',
  admin: 'Director',
  dm: 'Guide',
  ds: 'Explorer',
};

/** The roles that read a roster, and so are shown an Explorer's label. */
const SEES_EXPLORER_LABEL = ['dm', 'admin', 'executive'];

/**
 * The label to show beside somebody's name, or null when there should be none.
 *
 * @param role   whose label this is — the person being described.
 * @param viewer the role of the person reading the screen.
 *
 * `viewer` is REQUIRED, and that is the whole design. Optional would mean every
 * call site that forgot it silently fell back to showing the label, which is
 * the one outcome this exists to prevent — a rule that fails open is not a
 * rule, and it would fail open in exactly the screens nobody re-reads.
 *
 * In most call sites the answer is "the same person", because the screen is
 * your own header or your own profile — so `roleLabel(me.role, me.role)` is the
 * common shape, and it reads as what it is: you, looking at yourself.
 */
export function roleLabel(role: string, viewer: string): string | null {
  if (role === 'ds' && !SEES_EXPLORER_LABEL.includes(viewer)) return null;
  const label = ROLE_LABELS[role];
  return label ? label : null;
}

/**
 * A word for the role when the interface HAS to name it — a chooser, a
 * "who are you?" card, an explanation of who the app is for.
 *
 * These are two different jobs and conflating them is how the blank-label
 * change goes wrong. A badge under somebody's name should say nothing for a
 * seeker: they are a person, not a category, and that is the whole request.
 * But an option in a picker cannot be blank — nobody can choose an empty row —
 * and a card headed by nothing is broken rather than tactful.
 *
 * So a seeker is described here rather than titled: "Someone exploring" says
 * what is true without pinning a label on anybody, and it is never shown beside
 * their own name.
 */
export function roleNoun(role: string): string {
  return ROLE_LABELS[role] || 'Explorer';
}

export function canKick(callerRole: string, targetRole: string): boolean {
  if (callerRole === 'executive') return ['admin', 'dm', 'ds'].includes(targetRole);
  if (callerRole === 'admin') return ['dm', 'ds'].includes(targetRole);
  if (callerRole === 'dm') return targetRole === 'ds';
  return false;
}

export function canDisapprove(callerRole: string): boolean {
  return callerRole === 'executive' || callerRole === 'admin';
}
