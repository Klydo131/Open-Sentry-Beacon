import type { Stage, Track } from './types';

// Your church's name for this app: change APP_NAME and APP_SHORT_NAME. The
// browser tab, the installed app's name, link previews and emails all read
// them. "Hope Beacon" is an example; the gate only refuses a blank name or the
// project's own name (Open Sentry Beacon), which members should never see.

// Never rename the localStorage keys `hope-beacon.feedback.local` and
// `hope-beacon:library-favorites`: a key is an address, and renaming it loses
// what is stored there (tests/the-brand-is-one-name.mjs).

/** The full name. Browser tab, installed app, the "about" line. */
export const APP_NAME = 'Hope Beacon';

/** The short name. Used where space is tight: the header, a home-screen label. */
export const APP_SHORT_NAME = 'Hope Beacon';

/** One sentence, for link previews and installers. */
export const APP_DESCRIPTION =
  'Walking with Jesus, one step at a time. And never on your own. ' +
  'Someone from your church walks it with you.';

/**
 * Where this app's source code is. AGPL-3.0 section 13 requires a modified copy
 * to offer its users the source, so point this at your own repository.
 */
export const SOURCE_URL = 'https://github.com/Klydo131/Open-Sentry-Beacon';

/** The two ends of the logo gradient, left to right. */
export const BRAND_FROM = '#2F80ED';
export const BRAND_TO = '#3EB489';

export const NAVY = '#1E2A4A';

/** The tutorial's own colour, so the sample church never looks like a real one. */
export const TUTORIAL_PURPLE = '#4C3575';
export const GOLD = '#E8B84B';

// The six stages, in order, with each stage's colour.
export const STAGES: { key: Stage; label: string; color: string; blurb: string }[] =
  [
    // Label only: the key is a database enum used throughout the history.
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

// Role names on screen. The database keeps 'dm', 'ds', 'admin' and
// 'executive', and every permission is written against those. Change the
// words here; change the rule in roleLabel(). 'Explorer' is shown to the
// people supporting someone, never to the Explorer about themselves.
/** The stage before this one, or null at the first. */
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

/** Senior leadership is named only to leaders; Guides and Explorers read "Church leader". */
const SEES_EXECUTIVE_LABEL = ['admin', 'executive'];
const EXECUTIVE_TO_MEMBERS = 'Church leader';

/**
 * The label beside somebody's name, or null. `viewer` (the reader's role) is
 * required, so no call site can forget it and show a label it should not.
 */
export function roleLabel(role: string, viewer: string): string | null {
  if (role === 'ds' && !SEES_EXPLORER_LABEL.includes(viewer)) return null;
  if (role === 'executive' && !SEES_EXECUTIVE_LABEL.includes(viewer)) return EXECUTIVE_TO_MEMBERS;
  const label = ROLE_LABELS[role];
  return label ? label : null;
}

/** A word for a role where the interface must name it: pickers and explanations. */
export function roleNoun(role: string, viewer?: string): string {
  if (role === 'executive' && viewer !== undefined && !SEES_EXECUTIVE_LABEL.includes(viewer)) {
    return EXECUTIVE_TO_MEMBERS;
  }
  return ROLE_LABELS[role] || 'Explorer';
}

export function canKick(callerRole: string, targetRole: string): boolean {
  if (callerRole === 'executive') return ['admin', 'dm', 'ds'].includes(targetRole);
  if (callerRole === 'admin') return ['dm', 'ds'].includes(targetRole);
  if (callerRole === 'dm') return targetRole === 'ds';
  return false;
}

