// The appointment record: every appointment a Guide and Explorer ever made,
// and how it ended.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 16 NOVEMBER 2026: both people should have a record of their
// appointments, so it is known what was called off, what was deleted and what
// actually took place.
//
// NOTHING IS ERASED, which is why "deleted" is not a kind of its own here.
// Since 12 November an appointment is never removed from the database: what
// the app calls deleting or calling it off is the `cancelled` answer, recorded
// with who said it and when (answer_meeting), and a change of time is the old
// one called off with a note that starts "Moved to". "Clear from my list"
// tidies one person's upcoming list on one device and never touches this.
//
// ONE PLACE DECIDES WHAT HAPPENED, for both halves of the app: the live screen
// (components/LiveMeetings.tsx) and the sample church (components/Meetings.tsx)
// pass their rows through `recordRow`, and tests/a-meeting-keeps-its-record.mjs
// holds the rules.
// ---------------------------------------------------------------------------

export type MeetingState = 'proposed' | 'confirmed' | 'declined' | 'cancelled' | 'done' | 'missed';

export interface RecordInput {
  id: string;
  title: string | null;
  startsAt: string;
  mode: 'online' | 'in_person';
  status: MeetingState;
  /** Who answered last (confirmed, declined, called off, marked), as recorded. */
  byName?: string | null;
  /** When that answer was given. */
  at?: string | null;
  /** The reason given with the answer, if any. */
  note?: string | null;
  /** What they wrote when they arranged it: what to bring, what it is for. */
  notes?: string | null;
}

export type Outcome =
  | 'ahead'      // still to come
  | 'agreed'     // agreed, its time has passed, and nobody has said how it went
  | 'held'       // took place
  | 'missed'     // agreed, but it did not happen
  | 'moved'      // called off because it moved to another time
  | 'called-off' // called off (what the app used to call deleting)
  | 'declined'   // the other person could not make the time proposed
  | 'unanswered';// proposed, and nobody answered before it came round

export interface RecordRow extends RecordInput {
  outcome: Outcome;
  label: string;
  /** One line under the title: who, when, and why if they said why. */
  detail: string;
}

/** An hour's grace, as the list on the screen gives, so a meeting in progress is not yet history. */
const GRACE_MS = 60 * 60 * 1000;

const LABEL: Record<Outcome, string> = {
  ahead: 'Coming up',
  agreed: 'Did you meet?',
  held: 'Took place',
  missed: 'Did not happen',
  moved: 'Moved',
  'called-off': 'Called off',
  declined: 'Declined',
  unanswered: 'Never answered',
};

export function outcomeOf(m: RecordInput, now: number): Outcome {
  const passed = new Date(m.startsAt).getTime() <= now - GRACE_MS;
  switch (m.status) {
    case 'done': return 'held';
    case 'missed': return 'missed';
    case 'declined': return 'declined';
    case 'cancelled': return /^moved to\b/i.test((m.note ?? '').trim()) ? 'moved' : 'called-off';
    case 'proposed': return passed ? 'unanswered' : 'ahead';
    case 'confirmed': return passed ? 'agreed' : 'ahead';
    default: return 'ahead';
  }
}

function day(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function recordRow(m: RecordInput, now: number): RecordRow {
  const outcome = outcomeOf(m, now);
  const who = (m.byName ?? '').trim();
  const on = day(m.at);
  const why = (m.note ?? '').trim();
  const said = (verb: string) => [who ? `${who} ${verb}` : verb.charAt(0).toUpperCase() + verb.slice(1), on && `on ${on}`].filter(Boolean).join(' ');
  let detail = '';
  switch (outcome) {
    case 'held': detail = said('marked it as met'); break;
    case 'missed': detail = said('said it did not happen'); break;
    case 'moved': detail = [said('moved it'), why].filter(Boolean).join('. '); break;
    case 'called-off': detail = [said('called it off'), why && `Reason: ${why}`].filter(Boolean).join('. '); break;
    case 'declined': detail = [said('could not make it'), why && `Reason: ${why}`].filter(Boolean).join('. '); break;
    case 'unanswered': detail = 'Nobody answered before the time came round.'; break;
    case 'agreed': detail = 'Agreed by both of you. Say whether it took place.'; break;
    case 'ahead': detail = m.status === 'proposed' ? 'Waiting for an answer.' : 'Agreed by both of you.'; break;
  }
  return { ...m, outcome, label: LABEL[outcome], detail };
}

export interface MeetingRecord {
  /** Everything, newest first. */
  rows: RecordRow[];
  counts: Record<Outcome, number>;
  /** Took place, plus agreed times that passed and were not marked otherwise. */
  met: number;
}

export function meetingRecord(list: RecordInput[], now: number): MeetingRecord {
  const rows = list.map((m) => recordRow(m, now)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const counts = { ahead: 0, agreed: 0, held: 0, missed: 0, moved: 0, 'called-off': 0, declined: 0, unanswered: 0 } as Record<Outcome, number>;
  for (const r of rows) counts[r.outcome] += 1;
  return { rows, counts, met: counts.held + counts.agreed };
}

/** The filters on the record, in the order they are offered. */
export const RECORD_FILTERS: Array<{ key: 'all' | 'held' | 'off' | 'declined' | 'unanswered'; label: string; takes: Outcome[] }> = [
  { key: 'all', label: 'All', takes: ['ahead', 'agreed', 'held', 'missed', 'moved', 'called-off', 'declined', 'unanswered'] },
  { key: 'held', label: 'Took place', takes: ['held', 'agreed'] },
  { key: 'off', label: 'Called off or moved', takes: ['called-off', 'moved', 'missed'] },
  { key: 'declined', label: 'Declined', takes: ['declined'] },
  { key: 'unanswered', label: 'Never answered', takes: ['unanswered'] },
];
