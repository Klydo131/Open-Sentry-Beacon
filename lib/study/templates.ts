// Templates: a new page already laid out, for school, office, church and staff.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 28 October 2026. Simple and Advanced were made the same room
// ("The advance should be same with the simple feature"), and Advanced was
// given what other apps offer people who plan and run things: "office tools
// that [are] applicable for education sections and office and staff tools".
// The owner chose all four groups below.
//
// WHY TEMPLATES. A teacher, a secretary or a ministry leader writes the same
// few pages again and again: who came, what was decided, who serves on which
// Sabbath. A template saves them laying it out each time. The room already has
// the blocks those pages are made of (headings, to-dos, lists, tables), so a
// template is only those blocks, put in place: nothing new to learn, and every
// line can be changed or deleted like any other.
//
// OUR OWN WORDS. Every heading and line below was written for this church
// app, not copied from another product's gallery (28 October 2026: "dont copy
// the branded notes ... I want ours to be original as possible").
//
// NOTHING PERSONAL IN ANY OF THEM. Every word below is the same for every
// church; the blanks are for the person filling them in.
//
// AS DATA, so the words can be read and argued about without reading a single
// `addBlock`, and so tests/e2e/the-study-room-has-templates.js can check each
// one opens as the page it says it is.
// ---------------------------------------------------------------------------

import { Text, type Store } from '@blocksuite/store';

type Line =
  | { kind: 'h2' | 'h3' | 'text' | 'quote'; words: string }
  | { kind: 'todo' | 'bullet' | 'number'; words: string; done?: boolean }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'rule' };

export type TemplateGroup = 'Education' | 'Office' | 'Church' | 'Staff';

export interface StudyTemplate {
  id: string;
  group: TemplateGroup;
  /** The new page's name, and the card's. */
  title: string;
  /** One sentence on the card: what the page is for. */
  about: string;
  lines: Line[];
}

const blanks = (n: number, width: number): string[][] => Array.from({ length: n }, () => Array(width).fill(''));

export const TEMPLATES: StudyTemplate[] = [
  // ------------------------------------------------------------- education
  {
    id: 'lesson-plan',
    group: 'Education',
    title: 'Lesson plan',
    about: 'The aim, what to bring, each step with its time, and what to do after.',
    lines: [
      { kind: 'text', words: 'Date: ' },
      { kind: 'text', words: 'Class or group: ' },
      { kind: 'h2', words: 'Aim' },
      { kind: 'text', words: 'By the end, everyone will be able to: ' },
      { kind: 'h2', words: 'Scripture or topic' },
      { kind: 'text', words: '' },
      { kind: 'h2', words: 'What to bring' },
      { kind: 'bullet', words: 'Bibles' },
      { kind: 'bullet', words: 'Paper and pens' },
      { kind: 'bullet', words: '' },
      { kind: 'h2', words: 'Steps' },
      { kind: 'number', words: 'Welcome and prayer (5 minutes)' },
      { kind: 'number', words: 'A question to start (5 minutes)' },
      { kind: 'number', words: 'Read the passage together (10 minutes)' },
      { kind: 'number', words: 'Talk it through (15 minutes)' },
      { kind: 'number', words: 'Something to do (10 minutes)' },
      { kind: 'number', words: 'Close in prayer (5 minutes)' },
      { kind: 'h2', words: 'Questions to ask' },
      { kind: 'bullet', words: 'What does it say?' },
      { kind: 'bullet', words: 'What does it mean?' },
      { kind: 'bullet', words: 'What will we do about it this week?' },
      { kind: 'h2', words: 'After' },
      { kind: 'todo', words: 'Note who was missing, and reach out' },
      { kind: 'todo', words: 'Send a reminder for next time' },
    ],
  },
  {
    id: 'attendance',
    group: 'Education',
    title: 'Attendance',
    about: 'A name on each row and a column for each week: P present, A absent, L late.',
    lines: [
      { kind: 'text', words: 'Group: ' },
      { kind: 'text', words: 'Term: ' },
      { kind: 'text', words: 'Write P for present, A for absent, L for late.' },
      { kind: 'table', head: ['Name', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Notes'], rows: blanks(8, 6) },
    ],
  },
  {
    id: 'weekly-plan',
    group: 'Education',
    title: 'Weekly plan',
    about: 'This week’s focus, and a short list for each day.',
    lines: [
      { kind: 'text', words: 'Week of: ' },
      { kind: 'h2', words: 'This week’s focus' },
      { kind: 'text', words: '' },
      ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].flatMap((day): Line[] => [
        { kind: 'h3', words: day },
        { kind: 'todo', words: '' },
      ]),
      { kind: 'h2', words: 'Notes' },
      { kind: 'text', words: '' },
    ],
  },

  // ---------------------------------------------------------------- office
  {
    id: 'meeting-notes',
    group: 'Office',
    title: 'Meeting notes',
    about: 'Who came, the agenda, what was decided, and who does what by when.',
    lines: [
      { kind: 'text', words: 'Date: ' },
      { kind: 'text', words: 'Time: ' },
      { kind: 'text', words: 'Where: ' },
      { kind: 'h2', words: 'Who came' },
      { kind: 'bullet', words: '' },
      { kind: 'h2', words: 'Agenda' },
      { kind: 'number', words: 'Opening prayer' },
      { kind: 'number', words: '' },
      { kind: 'number', words: '' },
      { kind: 'h2', words: 'Notes' },
      { kind: 'text', words: '' },
      { kind: 'h2', words: 'Decided' },
      { kind: 'bullet', words: '' },
      { kind: 'h2', words: 'Action items' },
      { kind: 'todo', words: 'Who: . What: . By when: ' },
      { kind: 'todo', words: 'Who: . What: . By when: ' },
      { kind: 'todo', words: 'Who: . What: . By when: ' },
      { kind: 'h2', words: 'Next meeting' },
      { kind: 'text', words: '' },
    ],
  },
  {
    id: 'task-board',
    group: 'Office',
    title: 'Task board',
    about: 'To do, Doing and Done: tick a task when it is finished, and move it down.',
    lines: [
      { kind: 'text', words: 'Tick a task when it is finished. To move one, drag it by the dots at its left, or cut it and paste it under the next heading.' },
      { kind: 'h2', words: 'To do' },
      { kind: 'todo', words: '' },
      { kind: 'todo', words: '' },
      { kind: 'todo', words: '' },
      { kind: 'h2', words: 'Doing' },
      { kind: 'todo', words: '' },
      { kind: 'h2', words: 'Waiting on someone' },
      { kind: 'todo', words: '' },
      { kind: 'h2', words: 'Done' },
      { kind: 'todo', words: '', done: true },
    ],
  },

  // ---------------------------------------------------------------- church
  {
    id: 'sermon-notes',
    group: 'Church',
    title: 'Sermon notes',
    about: 'The passage, the main point, a verse to remember, and what you will do.',
    lines: [
      { kind: 'text', words: 'Date: ' },
      { kind: 'text', words: 'Speaker: ' },
      { kind: 'text', words: 'Passage: ' },
      { kind: 'h2', words: 'The main point' },
      { kind: 'text', words: '' },
      { kind: 'h2', words: 'Points' },
      { kind: 'number', words: '' },
      { kind: 'number', words: '' },
      { kind: 'number', words: '' },
      { kind: 'h2', words: 'A verse to remember' },
      { kind: 'quote', words: '' },
      { kind: 'h2', words: 'What I will do this week' },
      { kind: 'todo', words: '' },
      { kind: 'todo', words: '' },
      { kind: 'h2', words: 'Questions to ask my Guide' },
      { kind: 'bullet', words: '' },
    ],
  },
  {
    id: 'bible-study',
    group: 'Church',
    title: 'Bible study',
    about: 'Read, observe, interpret and apply: one passage, step by step.',
    lines: [
      { kind: 'text', words: 'Passage: ' },
      { kind: 'text', words: 'Date: ' },
      { kind: 'h2', words: 'Read' },
      { kind: 'text', words: 'Read the passage twice, slowly. Then write it in your own words.' },
      { kind: 'text', words: '' },
      { kind: 'h2', words: 'Observe: what does it say?' },
      { kind: 'bullet', words: 'Who is speaking, and to whom?' },
      { kind: 'bullet', words: 'What happens, or what is asked?' },
      { kind: 'bullet', words: '' },
      { kind: 'h2', words: 'Interpret: what does it mean?' },
      { kind: 'bullet', words: 'What did it mean to the first people who heard it?' },
      { kind: 'bullet', words: 'What does it show about God?' },
      { kind: 'bullet', words: '' },
      { kind: 'h2', words: 'Apply: what will I do?' },
      { kind: 'todo', words: '' },
      { kind: 'h2', words: 'Pray' },
      { kind: 'text', words: '' },
    ],
  },
  {
    id: 'prayer-list',
    group: 'Church',
    title: 'Prayer list',
    about: 'Each request with its date, and how and when it was answered.',
    lines: [
      { kind: 'text', words: 'Write a request and the date. When it is answered, write when and how.' },
      { kind: 'table', head: ['Date', 'Request', 'For', 'Answered on', 'How'], rows: blanks(6, 5) },
      { kind: 'h2', words: 'Thanksgiving' },
      { kind: 'bullet', words: '' },
    ],
  },

  // ---------------------------------------------------------------- staff
  {
    id: 'volunteer-schedule',
    group: 'Staff',
    title: 'Volunteer schedule',
    about: 'Who serves where and when, with a backup, and who has said yes.',
    lines: [
      { kind: 'text', words: 'Ministry or event: ' },
      { kind: 'text', words: 'Month: ' },
      { kind: 'text', words: 'Write Yes under Confirmed when they have said yes.' },
      {
        kind: 'table',
        head: ['Date', 'Role', 'Volunteer', 'Backup', 'Confirmed'],
        rows: [
          ['', 'Welcome', '', '', ''],
          ['', 'Music', '', '', ''],
          ['', 'Children', '', '', ''],
          ['', 'Food', '', '', ''],
          ['', 'Set up and clean up', '', '', ''],
          ['', '', '', '', ''],
        ],
      },
    ],
  },
  {
    id: 'event-plan',
    group: 'Staff',
    title: 'Event plan',
    about: 'A checklist, a timeline of who does what, and a budget.',
    lines: [
      { kind: 'text', words: 'Event: ' },
      { kind: 'text', words: 'Date and time: ' },
      { kind: 'text', words: 'Place: ' },
      { kind: 'text', words: 'Lead: ' },
      { kind: 'h2', words: 'Why we are doing it' },
      { kind: 'text', words: '' },
      { kind: 'h2', words: 'Checklist' },
      { kind: 'todo', words: 'Book the place' },
      { kind: 'todo', words: 'Invite people' },
      { kind: 'todo', words: 'Plan the programme' },
      { kind: 'todo', words: 'Food and drinks' },
      { kind: 'todo', words: 'Volunteers (make a Volunteer schedule)' },
      { kind: 'todo', words: 'Set up and clean up' },
      { kind: 'h2', words: 'Timeline' },
      {
        kind: 'table',
        head: ['When', 'What', 'Who'],
        rows: [
          ['Four weeks before', 'Book the place', ''],
          ['Two weeks before', 'Send the invitations', ''],
          ['One week before', 'Confirm the volunteers', ''],
          ['On the day', 'Set up', ''],
          ['After', 'Say thank you', ''],
        ],
      },
      { kind: 'h2', words: 'Budget' },
      { kind: 'table', head: ['Item', 'Cost', 'Paid by', 'Paid?'], rows: blanks(4, 4) },
      { kind: 'h2', words: 'Notes' },
      { kind: 'text', words: '' },
    ],
  },
];

export const TEMPLATE_GROUPS: Array<{ group: TemplateGroup; about: string }> = [
  { group: 'Education', about: 'For teaching a class or a group' },
  { group: 'Office', about: 'For meetings and the work that comes out of them' },
  { group: 'Church', about: 'For Sabbath, study and prayer' },
  { group: 'Staff', about: 'For people and events' },
];

/** Sort keys in AFFiNE's own order for table rows and columns: a0, a1, ... aZ. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const orderKey = (i: number) => `a${DIGITS[i] ?? DIGITS[DIGITS.length - 1]}`;

/** A table block's props: the first row is the head. */
function tableProps(head: string[], rows: string[][]) {
  const seed = Math.random().toString(36).slice(2, 8);
  const columns: Record<string, { columnId: string; order: string }> = {};
  const rowMap: Record<string, { rowId: string; order: string }> = {};
  const cells: Record<string, { text: Text }> = {};
  const columnIds = head.map((_, i) => `${seed}-c${i}`);
  columnIds.forEach((columnId, i) => { columns[columnId] = { columnId, order: orderKey(i) }; });
  [head, ...rows].forEach((row, r) => {
    const rowId = `${seed}-r${r}`;
    rowMap[rowId] = { rowId, order: orderKey(r) };
    columnIds.forEach((columnId, c) => { cells[`${rowId}:${columnId}`] = { text: new Text(row[c] ?? '') }; });
  });
  return { columns, rows: rowMap, cells };
}

/**
 * Lay a template out on a new page. Outside the undo history: a template is
 * where the page starts, not something Undo should take away. Today the page's
 * history only starts once it is open (StudyRoomEditor.tsx), which is after
 * this has run, so this is the second guard rather than the only one; it keeps
 * holding if a template is ever laid onto a page already open.
 */
export function writeTemplate(store: Store, template: StudyTemplate): void {
  store.withoutTransact(() => {
    const rootId = store.root?.id ?? store.addBlock('affine:page', {});
    if (store.getBlocksByFlavour('affine:surface').length === 0) {
      store.addBlock('affine:surface', {}, rootId);
    }
    const noteId = store.getBlocksByFlavour('affine:note')[0]?.id ?? store.addBlock('affine:note', {}, rootId);
    for (const line of template.lines) {
      switch (line.kind) {
        case 'rule':
          store.addBlock('affine:divider', {}, noteId);
          break;
        case 'table':
          store.addBlock('affine:table', tableProps(line.head, line.rows), noteId);
          break;
        case 'todo':
          store.addBlock('affine:list', { type: 'todo', checked: !!line.done, text: new Text(line.words) }, noteId);
          break;
        case 'bullet':
        case 'number':
          store.addBlock('affine:list', { type: line.kind === 'bullet' ? 'bulleted' : 'numbered', text: new Text(line.words) }, noteId);
          break;
        default:
          store.addBlock('affine:paragraph', { type: line.kind, text: new Text(line.words) }, noteId);
      }
    }
  });
}
