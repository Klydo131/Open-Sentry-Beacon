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
}

export interface ProgramSection {
  id: string;
  /** "Sabbath School", "Divine Service". */
  title: string;
  /** Free text, because churches write it every way: "9:00 AM", "9:00-10:15". */
  time: string;
  lines: ProgramLine[];
}

export interface SabbathProgram {
  id: string;
  church: string;
  /** YYYY-MM-DD. */
  date: string;
  /** The day's theme or the sermon title. Optional. */
  theme: string;
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
  programs: 60, // a year of Sabbaths, and some
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
  return { id: uuid(), part, detail: '', who: '' };
}

export function newSection(title = ''): ProgramSection {
  return { id: uuid(), title, time: '', lines: [newLine()] };
}

/** A new program for the coming Sabbath, laid out from the template. */
export function fromTemplate(church: string, now: Date = new Date()): SabbathProgram {
  return {
    id: uuid(),
    church: oneLine(church, LIMITS.church),
    date: nextSabbath(now),
    theme: '',
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
        })),
    }));
  return {
    id: oneLine(r.id, 64),
    church: oneLine(r.church, LIMITS.church),
    date,
    theme: oneLine(r.theme, LIMITS.theme),
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

export const PROGRAMS_KEY = 'beacon-sabbath-programs';

/** Where one account's programs are kept on this device. */
export function programsKey(owner: string): string {
  return `${PROGRAMS_KEY}:${owner}`;
}

/** This account's programs on this device. An empty list if there are none, or storage is shut. */
export function loadPrograms(owner: string): SabbathProgram[] {
  try {
    const raw = window.localStorage.getItem(programsKey(owner));
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.map(tidyProgram).filter((p): p is SabbathProgram => !!p).sort(byDate);
  } catch {
    return [];
  }
}

/**
 * Keep this account's programs on this device. False when the browser would
 * not: a private window, storage that is full, or storage switched off. The
 * screen says so, because "saved" that was not saved is how a Sabbath program
 * goes missing on Friday night.
 */
export function savePrograms(owner: string, list: SabbathProgram[]): boolean {
  try {
    window.localStorage.setItem(programsKey(owner), JSON.stringify(list.slice(0, LIMITS.programs)));
    return true;
  } catch {
    return false;
  }
}

/** What a line says, in one line of text: "Opening hymn: No. 12, Holy, Holy, Holy (Maria Santos)". */
function lineText(l: ProgramLine): string {
  const what = [l.part, l.detail].filter(Boolean).join(': ');
  return l.who ? `${what} (${l.who})` : what;
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

/**
 * The whole program as plain text, for pasting into a group chat. Churches
 * pass the program round in Messenger and Viber; a Word file is the wrong
 * thing to make somebody open on a phone to find out when Sabbath School starts.
 */
export function programAsText(p: SabbathProgram): string {
  const out: string[] = [];
  if (p.church) out.push(p.church);
  const when = dateLabel(p.date);
  if (when) out.push(when);
  if (p.theme) out.push(`Theme: ${p.theme}`);
  for (const s of p.sections) {
    const lines = filledLines(s);
    if (!printable(s)) continue;
    out.push('');
    out.push([s.title.toUpperCase(), s.time].filter(Boolean).join(' · '));
    for (const l of lines) out.push(`- ${lineText(l)}`);
  }
  const notes = p.notes.split('\n').map((n) => n.trim()).filter(Boolean);
  if (notes.length) {
    out.push('', 'ANNOUNCEMENTS');
    for (const n of notes) out.push(`- ${n}`);
  }
  return out.join('\n').trim();
}
