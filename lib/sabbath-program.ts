// A Sabbath program: the order of service for one Sabbath, made in the Office by
// a Guide or a leader, kept on their own device, and downloaded as a Word file.
//
// ASKED FOR on 2 October 2026: "Guides and all higher up accounts can make
// their own Sabbath program tool, it can be downloaded to words or docs too in
// their office."
//
// KEPT ON THE DEVICE, BY THE OWNER'S CHOICE, the same day. Three things follow:
//
//   * It works on a church's app the day it ships. There is no table, no
//     security rule and no migration, so a church that has not updated its
//     database still has it.
//   * The names typed into it (who prays, who preaches) stay on that phone or
//     computer. They leave it only inside a file the person downloads or
//     shares, which is their act, not the app's.
//   * A program made on a phone is not on the laptop, and two leaders do not
//     see each other's. They share the file, the way churches already pass a
//     program round.
//
// ONE LIST PER ACCOUNT. A church office computer is often shared, so the list
// is kept under the signed-in account's id: a second leader on the same
// computer starts with their own empty list, not the first leader's names.
//
// Word itself is written by lib/sabbath-program-docx.ts. This file is the
// program, its starting template, and keeping it.

import { uuid } from '@/lib/uuid';

export interface ProgramLine {
  id: string;
  /** What happens: "Opening hymn". */
  part: string;
  /** Which hymn, which passage, which title. */
  detail: string;
  /** Who leads it. */
  who: string;
  /** Advanced: how many minutes it takes. 0 when nobody has said. */
  minutes: number;
  /** Advanced: for the people leading, printed on the platform copy only, never shared. */
  note: string;
}

export interface ProgramSection {
  id: string;
  /** "Sabbath School", "Divine Service". */
  title: string;
  /** Free text, because churches write it every way: "9:00 AM", "9:00-10:15". */
  time: string;
  lines: ProgramLine[];
}

/**
 * A detail of a church's own (Advanced), for whatever the standard fields do
 * not cover: "Deacons on duty", "Offering for", "Sunset". Asked for on
 * 2 October 2026: "users can add additional input in the advance settings if
 * the basic is not enough for them".
 */
export interface ProgramExtra {
  id: string;
  label: string;
  value: string;
}

export interface SabbathProgram {
  id: string;
  /** A folder of the planner's own, to keep many programs in order. '' for none. */
  folder: string;
  church: string;
  /** YYYY-MM-DD. */
  date: string;
  /** The day's theme or the sermon title. Optional. */
  theme: string;
  /** Advanced: the church's own details, printed under the theme. */
  extras: ProgramExtra[];
  sections: ProgramSection[];
  /** Announcements, one per line. Optional. */
  notes: string;
  /** When it was last changed, in milliseconds. */
  updated: number;
}

/**
 * The four parts of a Sabbath the owner chose to start from, in the order the
 * day runs. Every line is a starting point: each can be renamed, moved or
 * removed, and a church that has no afternoon program removes that part once.
 *
 * NO HYMN TITLES ARE SHIPPED. The hymnal's numbering and titles belong to its
 * publisher, and every church already has the book. A line says "Opening hymn";
 * the person types the number and title they are using.
 */
export const TEMPLATE: ReadonlyArray<{ title: string; parts: readonly string[] }> = [
  {
    title: 'Sabbath School',
    parts: ['Song service', 'Opening hymn', 'Opening prayer', 'Welcome', 'Mission story',
      'Lesson study', 'Closing hymn', 'Closing prayer'],
  },
  {
    title: 'Divine Service',
    parts: ['Call to worship', 'Invocation', 'Opening hymn', 'Scripture reading',
      'Pastoral prayer', 'Tithes and offering', "Children's story", 'Special music', 'Sermon',
      'Closing hymn', 'Benediction'],
  },
  {
    title: 'Afternoon program (AY)',
    parts: ['Song service', 'Opening prayer', 'Scripture reading', 'Topic', 'Special music',
      'Closing prayer'],
  },
  {
    title: 'Sunset vespers',
    parts: ['Hymn', 'Reading', 'Closing prayer'],
  },
];

// How long each field may be. Generous for anything a program says; they exist
// so that a paste of something enormous cannot fill the device's storage.
export const LIMITS = {
  programs: 120, // two years of Sabbaths, kept in folders
  folder: 60,
  sections: 12,
  lines: 40, // in one section
  church: 120,
  theme: 200,
  title: 80,
  time: 40,
  part: 80,
  detail: 200,
  who: 120,
  notes: 3000,
  minutes: 240, // one line of a service
  note: 300,
  templates: 10,
  templateName: 60,
  received: 20, // programs shared with this person, kept for reading offline
  extras: 12,
  extraLabel: 40,
  extraValue: 200,
} as const;

// Control characters, the marks that reverse or hide text (the trick behind
// CVE-2021-42574, here it would print one name in place of another), the
// byte-order mark, and the two code points XML refuses outright. Nothing a
// person types on purpose, and each one can corrupt the Word file or what it
// shows.
const HIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFEFF\uFFFE\uFFFF]/g;

/** One line of text, tidied: no hidden characters, no line breaks, no runaway length. */
export function oneLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(HIDDEN, '').replace(/[\r\n\t]+/g, ' ').slice(0, max);
}

/** Several lines of text, tidied the same way but keeping its line breaks. */
export function manyLines(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').replace(HIDDEN, '').replace(/\t/g, ' ').slice(0, max);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A date as YYYY-MM-DD, in local time. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The coming Sabbath, or today if today is the Sabbath. */
export function nextSabbath(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return dayKey(d);
}

/** "Sabbath, October 3, 2026", or the weekday's own name for any other day. */
export function dateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return '';
  const when = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(when.getTime())) return '';
  const day = when.getUTCDay() === 6
    ? 'Sabbath'
    : when.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const rest = when.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  return `${day}, ${rest}`;
}

export function newLine(part = ''): ProgramLine {
  return { id: uuid(), part, detail: '', who: '', minutes: 0, note: '' };
}

/** Minutes as a whole number from 0 to the limit. Anything else is "not said", which is 0. */
export function wholeMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(LIMITS.minutes, Math.max(0, Math.round(n))) : 0;
}

export function newSection(title = ''): ProgramSection {
  return { id: uuid(), title, time: '', lines: [newLine()] };
}

/** A new program for the coming Sabbath, laid out from the template. */
export function fromTemplate(church: string, now: Date = new Date()): SabbathProgram {
  return {
    id: uuid(),
    folder: '',
    church: oneLine(church, LIMITS.church),
    date: nextSabbath(now),
    theme: '',
    extras: [],
    sections: TEMPLATE.map((s) => ({
      id: uuid(),
      title: s.title,
      time: '',
      lines: s.parts.map((p) => newLine(p)),
    })),
    notes: '',
    updated: now.getTime(),
  };
}

/**
 * The same program for another Sabbath: every part and every name kept, a new
 * date. Most weeks differ only in who is doing what, so starting from last
 * week is less typing than starting from the template.
 */
export function copyForNextSabbath(p: SabbathProgram, now: Date = new Date()): SabbathProgram {
  const after = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = p.date.split('-').map(Number);
  const from = y && m && d ? new Date(y, m - 1, d + 1) : after;
  return {
    ...p,
    id: uuid(),
    date: nextSabbath(from > after ? from : after),
    extras: p.extras.map((x) => ({ ...x, id: uuid() })),
    sections: p.sections.map((s) => ({
      ...s,
      id: uuid(),
      lines: s.lines.map((l) => ({ ...l, id: uuid() })),
    })),
    updated: now.getTime(),
  };
}

/**
 * Whatever came out of storage, made safe to use: right shape, tidy text,
 * within the limits. Anything that is not a program at all is dropped rather
 * than guessed at. Storage is the person's own, but it is also anything an
 * older version of this file, or another tab, left there.
 */
export function tidyProgram(raw: unknown): SabbathProgram | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '';
  const sections = (Array.isArray(r.sections) ? r.sections : [])
    .slice(0, LIMITS.sections)
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      id: typeof s.id === 'string' && s.id ? s.id : uuid(),
      title: oneLine(s.title, LIMITS.title),
      time: oneLine(s.time, LIMITS.time),
      lines: (Array.isArray(s.lines) ? s.lines : [])
        .slice(0, LIMITS.lines)
        .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
        .map((l) => ({
          id: typeof l.id === 'string' && l.id ? l.id : uuid(),
          part: oneLine(l.part, LIMITS.part),
          detail: oneLine(l.detail, LIMITS.detail),
          who: oneLine(l.who, LIMITS.who),
          minutes: wholeMinutes(l.minutes),
          note: oneLine(l.note, LIMITS.note),
        })),
    }));
  return {
    id: oneLine(r.id, 64),
    folder: oneLine(r.folder, LIMITS.folder).trim(),
    church: oneLine(r.church, LIMITS.church),
    date,
    theme: oneLine(r.theme, LIMITS.theme),
    extras: (Array.isArray(r.extras) ? r.extras : [])
      .slice(0, LIMITS.extras)
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        id: typeof x.id === 'string' && x.id ? oneLine(x.id, 64) : uuid(),
        label: oneLine(x.label, LIMITS.extraLabel),
        value: oneLine(x.value, LIMITS.extraValue),
      })),
    sections,
    notes: manyLines(r.notes, LIMITS.notes),
    updated: typeof r.updated === 'number' && Number.isFinite(r.updated) ? r.updated : 0,
  };
}

/** Newest Sabbath first; the undated ones last. */
export function byDate(a: SabbathProgram, b: SabbathProgram): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.updated - a.updated;
}

/** Read something this file keeps. null when it is not there, or storage is shut. */
export function readKept(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Keep something. False when the browser would not. */
export function keep(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const PROGRAMS_KEY = 'beacon-sabbath-programs';

/** Where one account's programs are kept on this device. */
export function programsKey(owner: string): string {
  return `${PROGRAMS_KEY}:${owner}`;
}

/** This account's programs on this device. An empty list if there are none, or storage is shut. */
export function loadPrograms(owner: string): SabbathProgram[] {
  const list = readKept(programsKey(owner));
  if (!Array.isArray(list)) return [];
  return list.map(tidyProgram).filter((p): p is SabbathProgram => !!p).sort(byDate);
}

/**
 * Keep this account's programs on this device. False when the browser would
 * not: a private window, storage that is full, or storage switched off. The
 * screen says so, because "saved" that was not saved is how a Sabbath program
 * goes missing on Friday night.
 */
export function savePrograms(owner: string, list: SabbathProgram[]): boolean {
  return keep(programsKey(owner), list.slice(0, LIMITS.programs));
}

/** What a line says, in one line of text: "Opening hymn: No. 12, Holy, Holy, Holy (Maria Santos)". */
function lineText(l: ProgramLine): string {
  const what = [l.part, l.detail].filter(Boolean).join(': ');
  return l.who ? `${what} (${l.who})` : what;
}

/** The church's own details worth printing: both a name and something to say. */
export function filledExtras(p: SabbathProgram): ProgramExtra[] {
  return p.extras.filter((x) => x.label.trim() && x.value.trim());
}

/** Lines worth printing: a line with nothing in it is a gap in the program, not a part of it. */
export function filledLines(s: ProgramSection): ProgramLine[] {
  return s.lines.filter((l) => l.part || l.detail || l.who);
}

/**
 * Whether a part of the day belongs on the printed program: it has lines, or
 * at least a time. A heading with nothing under it and no time is a part the
 * church is not holding this week, and printing it would announce one.
 */
export function printable(s: ProgramSection): boolean {
  return filledLines(s).length > 0 || !!s.time;
}

// ---------------------------------------------------------------------------
// TIMES (Advanced)
// ---------------------------------------------------------------------------

/**
 * The first clock time in a part's time, in minutes after midnight, and
 * whether it was written with AM or PM. "9:00 AM", "9am", "09:00", "9.00",
 * "9:00-10:15" and "14:30" are all read. A bare "9" is not a time, because it
 * could as easily be a page number.
 */
export function parseClock(text: string): { minutes: number; twelve: boolean } | null {
  const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const mins = m[2] ? Number(m[2]) : 0;
  if (mins > 59) return null;
  if (m[3]) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (/^p/i.test(m[3]) ? 12 : 0);
    return { minutes: hours * 60 + mins, twelve: true };
  }
  if (!m[2] || hours > 23) return null;
  return { minutes: hours * 60 + mins, twelve: false };
}

/** A time of day the way the church wrote its own: "9:05 AM", or "9:05" on a 24-hour clock. */
export function formatClock(minutes: number, twelve: boolean): string {
  const day = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(day / 60);
  const mins = String(day % 60).padStart(2, '0');
  if (!twelve) return `${hours}:${mins}`;
  return `${hours % 12 || 12}:${mins} ${hours < 12 ? 'AM' : 'PM'}`;
}

export interface Schedule {
  /** When each line starts, by its id; missing where it cannot be known. */
  startsById: Record<string, string>;
  /** When the part starts and ends, in minutes after midnight, when that is known. */
  start: number | null;
  end: number | null;
  twelve: boolean;
}

/**
 * When each line of a part starts: the part's time, plus the minutes of the
 * lines before it. A line with no minutes ends the count, because every time
 * after it would be a guess, and a guessed time on a printed program is one a
 * person turns up for.
 */
export function schedule(s: ProgramSection): Schedule {
  const clock = parseClock(s.time);
  const twelve = clock ? clock.twelve : true;
  const startsById: Record<string, string> = {};
  let at = clock ? clock.minutes : null;
  const lines = filledLines(s);
  for (const l of lines) {
    if (at !== null) startsById[l.id] = formatClock(at, twelve);
    at = at !== null && l.minutes > 0 ? at + l.minutes : null;
  }
  const end = clock && lines.length && lines.every((l) => l.minutes > 0) ? at : null;
  return { startsById, start: clock ? clock.minutes : null, end, twelve };
}

/** Each part that runs into the start of the next one, and by how many minutes. */
export function overruns(p: SabbathProgram): { part: string; next: string; by: number }[] {
  const timed = p.sections.filter(printable).map((s) => ({ s, when: schedule(s) }));
  const out: { part: string; next: string; by: number }[] = [];
  for (let i = 0; i + 1 < timed.length; i++) {
    const { s, when } = timed[i];
    const next = timed[i + 1];
    if (when.end !== null && next.when.start !== null && when.end > next.when.start) {
      out.push({ part: s.title || 'Untitled part', next: next.s.title || 'Untitled part', by: when.end - next.when.start });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// WHO IS TAKING PART (Advanced: reminders)
// ---------------------------------------------------------------------------

export interface Duty {
  section: string;
  part: string;
  detail: string;
  /** The line's own start time when it is known, otherwise its part's. */
  at: string;
}

export interface Person {
  name: string;
  duties: Duty[];
}

/** Everybody named in the program, in the order they first appear, with what each of them leads. */
export function peopleIn(p: SabbathProgram): Person[] {
  const byName = new Map<string, Person>();
  for (const s of p.sections) {
    if (!printable(s)) continue;
    const { startsById } = schedule(s);
    for (const l of filledLines(s)) {
      const name = l.who.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = name.toLowerCase();
      if (!byName.has(key)) byName.set(key, { name, duties: [] });
      byName.get(key)!.duties.push({
        section: s.title || 'Untitled part',
        part: l.part,
        detail: l.detail,
        at: startsById[l.id] || s.time,
      });
    }
  }
  return [...byName.values()];
}

/** A reminder for one person, ready to paste into a message to them. */
export function reminderText(p: SabbathProgram, person: Person): string {
  const when = dateLabel(p.date) || 'the Sabbath';
  const where = p.church ? ` at ${p.church}` : '';
  const duties = person.duties.map((d) => {
    const what = [d.part || 'A part', d.detail && `(${d.detail})`].filter(Boolean).join(' ');
    return `- ${what}, ${d.section}${d.at ? `, ${d.at}` : ''}`;
  });
  return [`Hi ${person.name}. A reminder for ${when}${where}:`, ...duties, 'Thank you for taking part.'].join('\n');
}

/** Lines that name what happens but not who leads it: what is left to arrange. */
export function stillToFill(p: SabbathProgram): number {
  return p.sections.reduce((n, s) => n + s.lines.filter((l) => l.part && !l.who.trim()).length, 0);
}

// ---------------------------------------------------------------------------
// THE TWO COPIES
// ---------------------------------------------------------------------------

/**
 * Who a copy is for. The congregation's copy is what is shared, posted and
 * drawn as a picture. The platform copy adds each line's start time and the
 * private notes, for the people leading the service, and is only ever
 * downloaded or copied by the person who made it.
 */
export type ProgramCopy = 'congregation' | 'platform';

/**
 * The whole program as plain text, for pasting into a group chat. Churches
 * pass the program round in Messenger and Viber; a Word file is the wrong
 * thing to make somebody open on a phone to find out when Sabbath School starts.
 */
export function programAsText(p: SabbathProgram, copy: ProgramCopy = 'congregation'): string {
  const platform = copy === 'platform';
  const out: string[] = [];
  if (p.church) out.push(p.church);
  const when = dateLabel(p.date);
  if (when) out.push(when);
  if (p.theme) out.push(`Theme: ${p.theme}`);
  for (const x of filledExtras(p)) out.push(`${x.label}: ${x.value}`);
  if (platform) out.push('Platform copy, with times and notes');
  for (const s of p.sections) {
    if (!printable(s)) continue;
    const plan = schedule(s);
    const span = platform && plan.start !== null && plan.end !== null
      ? `${formatClock(plan.start, plan.twelve)} to ${formatClock(plan.end, plan.twelve)}`
      : s.time;
    out.push('');
    out.push([s.title.toUpperCase(), span].filter(Boolean).join(' · '));
    for (const l of filledLines(s)) {
      const at = platform ? plan.startsById[l.id] : '';
      out.push(`- ${at ? `${at}  ` : ''}${lineText(l)}`);
      if (platform && l.note) out.push(`  Note: ${l.note}`);
    }
  }
  const notes = p.notes.split('\n').map((n) => n.trim()).filter(Boolean);
  if (notes.length) {
    out.push('', 'ANNOUNCEMENTS');
    for (const n of notes) out.push(`- ${n}`);
  }
  return out.join('\n').trim();
}

// ---------------------------------------------------------------------------
// A CHURCH'S OWN TEMPLATES (Advanced)
// ---------------------------------------------------------------------------

export interface OwnTemplate {
  id: string;
  name: string;
  /** The names of the church's own details; what they said was this week's. */
  extras: string[];
  sections: { title: string; time: string; lines: { part: string; minutes: number }[] }[];
}

export const TEMPLATES_KEY = 'beacon-sabbath-templates';
export function templatesKey(owner: string): string {
  return `${TEMPLATES_KEY}:${owner}`;
}

/**
 * A program's shape, kept as a template: its parts, their times, its lines and
 * their minutes. Never its names, details or notes, which are this week's and
 * not next month's: a template that carried names would print last Sabbath's
 * preacher on a program nobody had checked.
 */
export function templateFrom(p: SabbathProgram, name: string): OwnTemplate {
  return {
    id: uuid(),
    name: oneLine(name, LIMITS.templateName) || 'My template',
    extras: p.extras.map((x) => x.label).filter(Boolean),
    sections: p.sections.map((s) => ({
      title: s.title,
      time: s.time,
      lines: s.lines.filter((l) => l.part).map((l) => ({ part: l.part, minutes: l.minutes })),
    })),
  };
}

/** A new program for the coming Sabbath, laid out from one of the church's own templates. */
export function fromOwnTemplate(t: OwnTemplate, church: string, now: Date = new Date()): SabbathProgram {
  return {
    id: uuid(),
    folder: '',
    church: oneLine(church, LIMITS.church),
    date: nextSabbath(now),
    theme: '',
    extras: t.extras.map((label) => ({ id: uuid(), label, value: '' })),
    sections: t.sections.map((s) => ({
      id: uuid(),
      title: s.title,
      time: s.time,
      lines: s.lines.length
        ? s.lines.map((l) => ({ ...newLine(l.part), minutes: wholeMinutes(l.minutes) }))
        : [newLine()],
    })),
    notes: '',
    updated: now.getTime(),
  };
}

/** A program with one empty part, for a day the template does not fit. */
export function blankProgram(church: string, now: Date = new Date()): SabbathProgram {
  return { ...fromTemplate(church, now), sections: [newSection('')] };
}

export function tidyTemplate(raw: unknown): OwnTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const sections = (Array.isArray(r.sections) ? r.sections : [])
    .slice(0, LIMITS.sections)
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      title: oneLine(x.title, LIMITS.title),
      time: oneLine(x.time, LIMITS.time),
      lines: (Array.isArray(x.lines) ? x.lines : [])
        .slice(0, LIMITS.lines)
        .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
        .map((l) => ({ part: oneLine(l.part, LIMITS.part), minutes: wholeMinutes(l.minutes) })),
    }));
  if (!sections.length) return null;
  const extras = (Array.isArray(r.extras) ? r.extras : [])
    .slice(0, LIMITS.extras)
    .map((x) => oneLine(x, LIMITS.extraLabel))
    .filter(Boolean);
  return { id: oneLine(r.id, 64), name: oneLine(r.name, LIMITS.templateName) || 'My template', extras, sections };
}

export function loadTemplates(owner: string): OwnTemplate[] {
  const list = readKept(templatesKey(owner));
  return Array.isArray(list) ? list.map(tidyTemplate).filter((t): t is OwnTemplate => !!t) : [];
}

export function saveTemplates(owner: string, list: OwnTemplate[]): boolean {
  return keep(templatesKey(owner), list.slice(0, LIMITS.templates));
}

// ---------------------------------------------------------------------------
// PROGRAMS SHARED WITH THIS PERSON (This Sabbath)
// ---------------------------------------------------------------------------
//
// A program reaches Explorers as a post in the app (lib/live/data.ts
// createBlogPost, under the existing rules for who may read a post), titled so
// it can be recognised. This Sabbath keeps the ones a person has seen, on their
// device, so they can be read with no signal on the Sabbath itself.

/** How a shared program's post is titled, which is also how This Sabbath knows one. */
export const SHARE_PREFIX = 'Sabbath program · ';

export function shareTitle(p: SabbathProgram): string {
  return `${SHARE_PREFIX}${dateLabel(p.date) || 'no date'}`.slice(0, 200);
}

export function isSharedProgram(title: string): boolean {
  return title.startsWith(SHARE_PREFIX);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

/** The Sabbath a shared program is for, as YYYY-MM-DD, read back out of its title. '' when it says none. */
export function sharedDate(title: string): string {
  const m = /([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(title);
  const month = m ? MONTHS.indexOf(m[1]) + 1 : 0;
  return m && month ? `${m[3]}-${pad(month)}-${pad(Number(m[2]))}` : '';
}

export interface ReceivedProgram {
  id: string;
  title: string;
  body: string;
  /** The name of whoever shared it. */
  from: string;
  /** When it was shared. */
  at: string;
}

export const RECEIVED_KEY = 'beacon-sabbath-received';
export function receivedKey(owner: string): string {
  return `${RECEIVED_KEY}:${owner}`;
}

/** Coming Sabbaths first, nearest first; then past ones, most recent first. */
export function byComingSabbath(today: string) {
  return (a: ReceivedProgram, b: ReceivedProgram): number => {
    const da = sharedDate(a.title);
    const db = sharedDate(b.title);
    const ca = da >= today ? 0 : 1;
    const cb = db >= today ? 0 : 1;
    if (ca !== cb) return ca - cb;
    if (da !== db) return ca === 0 ? (da < db ? -1 : 1) : (da < db ? 1 : -1);
    return a.at < b.at ? 1 : -1;
  };
}

export function tidyReceived(raw: unknown): ReceivedProgram | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.title !== 'string' || !isSharedProgram(r.title)) return null;
  return {
    id: oneLine(r.id, 64),
    title: oneLine(r.title, 200),
    body: manyLines(r.body, 20000),
    from: oneLine(r.from, LIMITS.who),
    at: oneLine(r.at, 40),
  };
}

export function loadReceived(owner: string): ReceivedProgram[] {
  const list = readKept(receivedKey(owner));
  return Array.isArray(list) ? list.map(tidyReceived).filter((x): x is ReceivedProgram => !!x) : [];
}

/** Keep what the church has shared, as it stands now: a post taken down goes from the phone too. */
export function saveReceived(owner: string, list: ReceivedProgram[]): boolean {
  return keep(receivedKey(owner), list.slice(0, LIMITS.received));
}

export interface SharedView {
  /** The church, the day, the theme. */
  head: string[];
  parts: { heading: string; items: string[] }[];
}

/**
 * A shared program's text, read back into headings and lines for showing.
 * It is a post somebody wrote, so it is read as text and nothing else: any
 * line that does not look like a program line is shown as it is.
 */
export function readShared(body: string): SharedView {
  const blocks = body.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim()));
  const [head = [], ...rest] = blocks;
  return {
    head,
    parts: rest.filter((b) => b.length).map(([heading, ...items]) => ({
      heading,
      items: items.map((i) => i.replace(/^\s*-\s+/, '').trim()),
    })),
  };
}

// ---------------------------------------------------------------------------
// SMALL THINGS REMEMBERED ON THE DEVICE
// ---------------------------------------------------------------------------

/** Whether this person has Advanced switched on, on this device. */
export function loadAdvanced(owner: string): boolean {
  return readKept(`beacon-sabbath-advanced:${owner}`) === true;
}

export function saveAdvanced(owner: string, on: boolean): boolean {
  return keep(`beacon-sabbath-advanced:${owner}`, on);
}

/**
 * The role this person had the last time the app could ask, so This Sabbath
 * can offer a leader their own programs with no signal. It only decides what
 * this device shows of this device's own storage; nothing it unlocks reaches
 * the church.
 */
export function rememberRole(owner: string, role: string): void {
  keep(`beacon-sabbath-role:${owner}`, role);
}

export function rememberedRole(owner: string): string | null {
  const role = readKept(`beacon-sabbath-role:${owner}`);
  return typeof role === 'string' ? role : null;
}
