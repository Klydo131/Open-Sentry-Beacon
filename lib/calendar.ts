// Putting a Sabbath program or a series of meetings on somebody's own
// calendar.
//
// Asked for on 2 October 2026: "there can be an option to put it automatically
// on their digital calendars". Two ways, both free and both the person's own
// act:
//
//   * A CALENDAR FILE (.ics, the iCalendar standard, RFC 5545). Every calendar
//     takes one: an iPhone or a Mac adds every event in it with one tap,
//     Outlook opens it, Google Calendar imports it (on a computer: Settings,
//     Import), and most Android calendars open it from the download. One file
//     holds every night of a series, so a week of meetings is one tap, not
//     seven.
//   * A GOOGLE CALENDAR LINK, for one night or one part, which opens Google
//     Calendar with the event filled in for the person to save. That sends the
//     event's words to Google when it is tapped, which the privacy notice says.
//
// What this is not: a calendar that updates itself when the program changes.
// That needs an address on a server that every calendar polls, and programs
// live on the planner's device. Download the file again after a change.
//
// TIMES ARE "FLOATING", written without a time zone, which RFC 5545 defines
// as the local time wherever the calendar is. A 5:30 PM meeting is at 5:30 PM
// on the phone in the hall; nothing has to know the church's time zone.

import {
  filledLines, parseClock, printable, schedule, type SabbathProgram,
} from '@/lib/sabbath-program';
import { meetingAsText, type EvangelisticMeeting } from '@/lib/evangelistic-meeting';

export interface CalendarEvent {
  /** Stable across downloads, so a calendar updates an event rather than doubling it. */
  uid: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
  location?: string;
  description?: string;
}

export const ICS_MIME = 'text/calendar;charset=utf-8';

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes after midnight on a YYYY-MM-DD day, as an iCalendar floating date-time: 20261004T173000. */
export function stamp(date: string, minutes: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, m - 1, d, 0, minutes);
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}T${pad(at.getHours())}${pad(at.getMinutes())}00`;
}

/** Minutes after midnight for "5:30 PM", "17:30" or "9", or null. */
export function clockMinutes(text: string): number | null {
  return parseClock(text)?.minutes ?? null;
}

/** Text made safe for an iCalendar value: backslashes, commas, semicolons and line breaks escaped. */
export function icsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * A line folded the way RFC 5545 asks: no line longer than 75 octets, each
 * continuation starting with a space, never splitting a character's bytes.
 */
export function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const bytes = new TextEncoder().encode(ch).length;
    if (size + bytes > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  out.push(current);
  return out.join('\r\n ');
}

/** A whole calendar file. `now` stamps when it was made, as the standard requires. */
export function icsCalendar(events: CalendarEvent[], name: string, now: Date = new Date()): string {
  const made = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hope Beacon//Church planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@hope-beacon`,
      `DTSTAMP:${made}`,
      `DTSTART:${stamp(e.date, e.start)}`,
      `DTEND:${stamp(e.date, e.end)}`,
      `SUMMARY:${icsText(e.title)}`,
      ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** A Google Calendar page with one event filled in, for the person to save. */
export function googleCalendarLink(e: CalendarEvent): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${stamp(e.date, e.start)}/${stamp(e.date, e.end)}`,
    ...(e.location ? { location: e.location } : {}),
    // Google refuses a very long address; the event's own words are enough.
    ...(e.description ? { details: e.description.slice(0, 1500) } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// ---------------------------------------------------------------------------
// WHAT GOES ON THE CALENDAR
// ---------------------------------------------------------------------------

/**
 * Each night of a series (or the one night chosen) that has a date and a
 * start time. A night with no end time is given three hours, which is what
 * the owner's church's nights run. The words are what is shared: a block
 * marked Team only never goes into a calendar, which may itself be shared.
 */
export function meetingEvents(m: EvangelisticMeeting, nightId: string | null): CalendarEvent[] {
  return m.nights.flatMap((n, i) => {
    if (nightId && n.id !== nightId) return [];
    const start = clockMinutes(n.time);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date) || start === null) return [];
    const said = clockMinutes(n.ends);
    return [{
      uid: `${m.id}-${n.id}`,
      title: `${m.name || 'Evangelistic meetings'}: Night ${i + 1}${n.topic ? `, ${n.topic}` : ''}`,
      date: n.date,
      start,
      end: said !== null && said > start ? said : start + 180,
      location: [m.place, m.church].filter(Boolean).join(', '),
      description: meetingAsText(m, n.id, 'shared'),
    }];
  });
}

/**
 * Each part of a Sabbath program that has a time. It ends when its minutes
 * run out (Advanced), or when the next timed part begins, or after an hour.
 */
export function programEvents(p: SabbathProgram): CalendarEvent[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return [];
  const timed = p.sections.filter(printable)
    .map((s) => ({ s, start: clockMinutes(s.time) }))
    .filter((x): x is { s: SabbathProgram['sections'][number]; start: number } => x.start !== null);
  return timed.map(({ s, start }, i) => {
    const ran = schedule(s).end;
    const next = timed.slice(i + 1).map((x) => x.start).find((t) => t > start);
    const end = ran !== null && ran > start ? ran : next ?? start + 60;
    return {
      uid: `${p.id}-${s.id}`,
      title: `${s.title || 'Sabbath program'}${p.church ? `, ${p.church}` : ''}`,
      date: p.date,
      start,
      end,
      location: p.church,
      description: filledLines(s)
        .map((l) => `${l.part}${l.detail ? `: ${l.detail}` : ''}${l.who ? ` (${l.who})` : ''}`)
        .join('\n'),
    };
  });
}
