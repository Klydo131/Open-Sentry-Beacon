'use client';

// Inviting a roomful of people from a file, by name and by role.
//
// WHAT CHANGED AND WHY. This used to take a pile of addresses and give every
// one of them the same role and no name. That is fine for a column copied out
// of a spreadsheet and wrong for the thing people actually keep, which is a
// list with three columns in it:
//
//     Maria Santos,   maria@example.org,   Explorer
//     Joel Reyes,     joel@example.org,    Guide
//
// The old reader split on commas BEFORE it split on lines, so that first row
// became three fragments, two of which were not addresses. A file that says
// exactly who everybody is produced one invitation and two warnings. So the
// reader now takes a LINE at a time and reads the fields inside it, which is
// what makes the greeting in the email say "Maria" instead of "maria".
//
// WHY IT IS A LOOP AND NOT A BATCH ENDPOINT. Every rule that governs a single
// invitation lives in the edge function: the refusal when an address already
// belongs to a member, the one-invitation-per-address rule that switches off
// the previous link, the per-address cooldown, the role-specific message. A
// batch endpoint would have to reimplement all four, and the first one it got
// wrong would send a stranger a broken link. So this calls the same function
// the single form calls, once per person.
//
// NOTHING IS SENT UNTIL THE LIST HAS BEEN READ BACK. Reading twenty-five rows
// off a file is exactly the moment a stray line, a duplicate or a wrong role
// gets through, and an invitation cannot be recalled. The preview names the
// role every single row will be sent as, because the role is now per-row and a
// mistake in it is no longer visible in one place. It is not a courtesy step;
// it is the only place those are catchable.
//
// ONE FAILURE DOES NOT STOP THE REST. A single "already a member" in the middle
// of a list must not abandon the twenty-four after it, and the Director has to
// be told which line failed and why, by address, so they can act on that line
// rather than re-running the whole thing.

import { useRef, useState } from 'react';
import * as live from '@/lib/live/data';
import { Button, Card } from '@/components/ui';
import { roleNoun } from '@/lib/brand';
import type { Role } from '@/lib/types';
import { humanError } from '@/lib/live/errors';

// PARSER BEGINS HERE
//
// tests/bulk-invite.mjs lifts everything between this marker and the one below
// and RUNS it, so nothing between them may reach for an import. That is also
// why the "you cannot invite that" message quotes the word from the file
// rather than asking lib/brand for a label: the file is the better wording
// anyway, because it echoes what the person actually typed.

interface Parsed {
  email: string;
  name: string;
  /** The role this row asked for, or null when it did not name one. */
  role: Role | null;
  /** Why this row cannot be sent, or '' when it can. */
  problem: string;
  /** True for a row of column headings, which is skipped without alarm. */
  heading: boolean;
}

/**
 * Deliberately loose. The edge function and the database both check the
 * address properly; this only catches what is obviously not one, so that a
 * stray word in a file does not become a send attempt.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** `Their Name <someone@example.org>`, which is what a mail client hands over. */
const ANGLED = /^(.*?)[<(]\s*([^>)\s]+)\s*[>)]$/;

/**
 * The words a row may use for a role.
 *
 * FULL WORDS AND THE APP'S OWN CODES, AND NOTHING SHORTER. Single letters were
 * considered and rejected: `d` for Director sits one character from `ds`,
 * which is the Explorer's code in the database, and a list that quietly turns
 * an Explorer into a Director is the one mistake in this file that cannot be
 * undone by sending again. A church writing a list writes "Guide".
 */
const ROLE_WORDS: Record<string, Role> = {
  explorer: 'ds', explorers: 'ds', seeker: 'ds', seekers: 'ds', ds: 'ds',
  guide: 'dm', guides: 'dm', dm: 'dm',
  'disciple maker': 'dm', 'disciple-maker': 'dm', 'disciple makers': 'dm',
  director: 'admin', directors: 'admin', admin: 'admin',
  'executive director': 'executive', 'executive directors': 'executive',
  executive: 'executive', executives: 'executive',
};

/** Column headings, so a file exported with its header row does not read as a person. */
const HEADING_WORDS = new Set([
  'name', 'full name', 'first name', 'last name', 'person', 'member',
  'email', 'e-mail', 'email address', 'e-mail address', 'address', 'mail',
  'role', 'position', 'type', 'church', 'notes', 'note',
]);

const tidy = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.:]+$/, '');

/**
 * A file somebody can open, look at, and type over.
 *
 * ASKED FOR: "I need a format to download for the sample so that new Admins
 * have an idea how the format in sheets and excel should be made."
 *
 * WHY A FILE AND NOT A PICTURE OF ONE. The instructions above the box already
 * describe the format in words, and a Director who has never made a CSV does
 * not learn it from a sentence: they learn it by opening one, seeing three
 * columns, and typing over the rows. The download is the instruction.
 *
 * IT CARRIES THE HEADER ROW ON PURPOSE. The parser treats a heading line as a
 * heading rather than as a person -- `HEADING_WORDS` is there for exactly this
 * -- so the sample can be uploaded straight back without editing anything and
 * will read as three example people and not four.
 *
 * THE EXAMPLES ARE OBVIOUSLY EXAMPLES. example.org is the address reserved for
 * documentation and can never belong to a real person, so a Director who
 * forgets to replace a row invites nobody by accident.
 */
const SAMPLE_ROWS = [
  ['Name', 'Email', 'Role'],
  ['Maria Santos', 'maria@example.org', 'Explorer'],
  ['Joel Reyes', 'joel@example.org', 'Guide'],
  ['Ana Cruz', 'ana@example.org', 'Director'],
];

function sampleFile(): string {
  // CRLF, BECAUSE EXCEL ON WINDOWS IS WHO THIS IS FOR. A file with bare \n
  // opens in Notepad as one long line, which is the first thing somebody sees
  // and the reason they decide the format is complicated.
  const body = SAMPLE_ROWS.map((row) => row.join(',')).join('\r\n');
  // A BYTE ORDER MARK, so Excel reads it as UTF-8 and a Filipino name with an
  // accent in it does not arrive as mojibake in the church's roster.
  return `\ufeff${body}\r\n`;
}

/**
 * The fields inside one line.
 *
 * Commas, semicolons and tabs all separate, because a file saved out of a
 * spreadsheet uses one of the three and the person sending it does not know
 * which. Double quotes hold a field together, which is the whole reason a
 * comma-separated file can carry a name like "Santos, Maria" at all; without
 * this that one row would split into two and neither half would be a person.
 */
function splitFields(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',' || ch === ';' || ch === '\t') { out.push(field); field = ''; continue; }
    field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim()).filter(Boolean);
}

function readAddress(field: string): { email: string; name: string; isEmail: boolean } {
  const angled = ANGLED.exec(field);
  const email = (angled ? angled[2] : field).trim().toLowerCase();
  const name = (angled ? angled[1] : '').replace(/["']/g, '').trim();
  return { email, name, isEmail: LOOKS_LIKE_EMAIL.test(email) };
}

/**
 * Read a list of people.
 *
 * A LINE IS A PERSON, with their name and their role beside them. The fields
 * may be in any order, because a file exported from somewhere else rarely has
 * them in the order anybody expects: the address is found first and the rest of
 * the line is read around it. A row that names no role is left null here and
 * takes the role from the picker on screen, which is shown in the preview so it
 * is never a guess nobody saw.
 *
 * A LINE HOLDING SEVERAL ADDRESSES IS STILL A LIST. Somebody pasting a column
 * out of a spreadsheet, or a group copied out of a mail client, gets one
 * invitation per address exactly as before. Nothing that used to work stopped.
 *
 * `allowed` is the set of roles the person doing the inviting may hand out. A
 * row asking for more than that is REFUSED rather than quietly lowered: a
 * Director who writes "Executive Director" in a file has to be told, because
 * silently sending that person an Explorer invitation is a lie they will only
 * discover from the person they invited.
 */
export function parseInviteList(
  raw: string,
  allowed: readonly Role[] = ['executive', 'admin', 'dm', 'ds'],
): Parsed[] {
  const seen = new Set<string>();
  const out: Parsed[] = [];
  let firstRow = true;

  for (const line of raw.split(/\r?\n/)) {
    const fields = splitFields(line);
    if (!fields.length) continue;

    const read = fields.map(readAddress);
    const addresses = read.filter((f) => f.isEmail);

    // --- a heading row -----------------------------------------------------
    // Only the first row, only when it carries no address at all, and only
    // when one of its words is the email column. Anything looser would eat a
    // real person on the first line, which is the one nobody would notice
    // missing.
    if (firstRow && addresses.length === 0 && fields.length >= 2) {
      const words = fields.map(tidy);
      const allHeadings = words.every((w) => HEADING_WORDS.has(w));
      const namesTheEmail = words.some((w) => w.includes('mail'));
      if (allHeadings && namesTheEmail) {
        firstRow = false;
        out.push({ email: '', name: line.trim(), role: null, problem: '', heading: true });
        continue;
      }
    }
    firstRow = false;

    // --- several addresses on one line: a pasted list, not a record --------
    if (addresses.length > 1) {
      for (const found of addresses) {
        out.push(person(found.email, found.name, null, seen, allowed, ''));
      }
      continue;
    }

    // --- no address at all -------------------------------------------------
    if (addresses.length === 0) {
      // The whole line, so the preview shows what was actually in the file.
      out.push({
        email: fields.length === 1 ? read[0].email : '',
        name: fields.length === 1 ? '' : line.trim(),
        role: null,
        problem: 'That does not look like an email address',
        heading: false,
      });
      continue;
    }

    // --- one address: a record, read around it -----------------------------
    const at = read.findIndex((f) => f.isEmail);
    let role: Role | null = null;
    let roleAt = -1;
    let roleWord = '';
    for (let i = 0; i < fields.length; i += 1) {
      if (i === at) continue;
      const word = tidy(fields[i]);
      if (word in ROLE_WORDS) { role = ROLE_WORDS[word]; roleAt = i; roleWord = fields[i].trim(); break; }
    }

    // The name is whatever is left. A `Name <address>` field carries its own
    // name and wins, since that name belongs to that address by construction.
    let name = read[at].name;
    if (!name) {
      const spare = fields.findIndex((_, i) => i !== at && i !== roleAt);
      if (spare !== -1) name = fields[spare].replace(/["']/g, '').trim();
    }

    let refused = '';
    if (role && !allowed.includes(role)) {
      refused = `You cannot invite anybody as "${roleWord}"`;
    }
    out.push(person(read[at].email, name, role, seen, allowed, refused));
  }

  return out;
}

/** One person, with the checks that apply to every one of them. */
function person(
  email: string,
  name: string,
  role: Role | null,
  seen: Set<string>,
  allowed: readonly Role[],
  refused: string,
): Parsed {
  const isEmail = LOOKS_LIKE_EMAIL.test(email);
  let problem = refused;
  if (!isEmail) problem = 'That does not look like an email address';
  else if (seen.has(email)) problem = 'Listed twice';
  if (isEmail) seen.add(email);
  return { email, name, role: role && allowed.includes(role) ? role : null, problem, heading: false };
}

/**
 * Files this cannot read, and what to do instead.
 *
 * A .docx or a .xlsx is a zip archive, not text; reading one here would produce
 * a screenful of rubbish and a list of warnings that blames the person rather
 * than the format. A Google Doc or Sheet is not on the computer at all until it
 * is exported. Both get told the one thing that works, in the words the menu
 * actually uses.
 */
const NOT_TEXT = /\.(docx?|xlsx?|numbers|pages|pdf|odt|ods|odp|rtf|pptx?|key|zip)$/i;

// PARSER ENDS HERE

type Outcome = { email: string; ok: boolean; detail: string };

export function LiveBulkInvite({ roles }: { roles: Role[] }) {
  const [raw, setRaw] = useState('');
  const [role, setRole] = useState<Role>(roles[0] ?? 'ds');
  const [preview, setPreview] = useState<Parsed[] | null>(null);
  const [results, setResults] = useState<Outcome[] | null>(null);
  const [note, setNote] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = preview ?? [];
  const people = rows.filter((r) => !r.heading);
  const sendable = people.filter((p) => !p.problem);
  /** The role a row will actually be sent as, once the picker has had its say. */
  const roleFor = (row: Parsed): Role => row.role ?? role;

  const take = (text: string, from: string) => {
    setRaw(text);
    setResults(null);
    setPreview(parseInviteList(text, roles));
    setNote(from);
  };

  const openFile = async (file: File | undefined | null, input?: HTMLInputElement) => {
    // READ BEFORE CLEARING, and clear on the way IN for the button. WebKit
    // invalidates a File the moment the input that produced it is reset, so
    // `input.value = ''` on the line after taking the file aborts the read on
    // Safari and iOS while working perfectly in Chromium. The repo's own
    // guardrail caught this one before it shipped; four call sites had already
    // had it once, and it fails invisibly, which is why it survived there.
    const done = () => { if (input) input.value = ''; };
    if (!file) { done(); return; }
    if (NOT_TEXT.test(file.name)) {
      done();
      setNote(
        `${file.name} is not a text file, so nothing here can read it. Open it, `
        + 'choose File, then Download, then Comma-separated values, and use that file instead.',
      );
      return;
    }
    try {
      const text = await file.text();
      done();   // and now the same file can be chosen again
      take(text, `Read ${file.name}.`);
    } catch {
      done();
      setNote(`Could not read ${file.name}. Save it as a .csv and try again.`);
    }
  };

  const send = async () => {
    setBusy(true);
    setResults(null);
    setProgress(0);
    const done: Outcome[] = [];

    for (const each of sendable) {
      try {
        const result = await live.inviteMember({
          email: each.email,
          role: roleFor(each),
          // The form requires a name and the edge function puts it in the
          // greeting. A file usually has one now, which is the point of reading
          // rows; when it does not, the address is a better greeting than an
          // empty one.
          fullName: each.name || each.email.split('@')[0],
        });
        done.push({
          email: each.email,
          ok: true,
          detail: result.delivery === 'link'
            ? 'Created, but the email did not go. Send their link by hand.'
            : 'Invitation sent',
        });
      } catch (cause) {
        done.push({
          email: each.email,
          ok: false,
          detail: humanError(cause, 'Could not send'),
        });
      }
      setProgress((n) => n + 1);
      setResults([...done]);
    }

    setBusy(false);
    setPreview(null);
    setRaw('');
    setNote('');
  };

  const sent = (results ?? []).filter((r) => r.ok).length;
  const failed = (results ?? []).filter((r) => !r.ok);
  const skipped = people.length - sendable.length;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📋 Invite several people at once</h2>
      <p className="mt-1 text-sm text-gray-500">
        Upload a file with one person per row, in the order{' '}
        <strong>Name, Email, Role</strong>. A row that does not say a role gets
        the one chosen below. You can paste the same thing into the box instead.
      </p>

      {/* THE FILE. A drop area and a button, because a Director on a phone
          cannot drag anything and a Director on a laptop will try to. */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void openFile(e.dataTransfer.files?.[0]);
        }}
        className={`mt-3 rounded-xl border-2 border-dashed p-4 text-center transition ${
          dragging ? 'border-gold bg-amber-50' : 'border-gray-300 bg-gray-50'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.tab,.txt,text/csv,text/tab-separated-values,text/plain"
          onChange={(e) => { void openFile(e.target.files?.[0], e.target); }}
          className="hidden"
        />
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (fileRef.current) fileRef.current.value = '';
            fileRef.current?.click();
          }}
        >
          📄 Choose a list file
        </Button>
        <p className="mt-2 text-xs text-gray-500">
          A .csv or .txt file, or drop one here. From Google Sheets or Excel,
          choose File, then Download, then Comma-separated values.
        </p>

        {/* THE SAMPLE, NEXT TO THE THING IT IS A SAMPLE OF. Somewhere else on
            the page is somewhere nobody looks while they are stuck. */}
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([sampleFile()], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'invitation-list-sample.csv';
            document.body.append(link);
            link.click();
            link.remove();
            // Let the download start before the address stops meaning anything.
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
          }}
          className="mt-2 text-sm font-semibold text-navy underline decoration-dotted"
        >
          Download a sample list to fill in
        </button>
        <p className="mt-1 text-xs text-gray-500">
          Opens in Sheets or Excel. Type over the three example rows, keep the
          headings, and upload it back here.
        </p>
      </div>

      {note && <p className="mt-2 text-sm text-gray-600">{note}</p>}

      <textarea
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setPreview(null); setNote(''); }}
        rows={5}
        placeholder={'Maria Santos, maria@example.org, Explorer\nJoel Reyes, joel@example.org, Guide\nthird@example.org'}
        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2 font-mono text-sm"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold text-navy">
          A row with no role becomes{' '}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-xl border border-gray-300 px-2 py-1"
          >
            {roles.map((r) => <option key={r} value={r}>{roleNoun(r)}</option>)}
          </select>
        </label>
        <Button
          variant="ghost"
          disabled={busy || !raw.trim()}
          onClick={() => { setResults(null); setPreview(parseInviteList(raw, roles)); }}
        >
          Check the list
        </Button>
      </div>

      {/* THE PREVIEW. Read back before anything is sent, and it names the role
          of every row, because the role is per-row now and a wrong one is no
          longer visible in a single place on screen. */}
      {preview && (
        <div className="mt-4 rounded-xl bg-gray-50 p-3">
          <p className="text-sm font-bold text-navy">
            {sendable.length} to invite{skipped > 0 ? `, ${skipped} skipped` : ''}
          </p>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-sm">
            {rows.map((p, i) => (
              <li
                key={`${p.email}-${i}`}
                className={p.heading ? 'text-gray-400' : p.problem ? 'text-amber-800' : 'text-gray-700'}
              >
                {p.heading ? '· ' : p.problem ? '⚠️ ' : '· '}
                {p.heading ? (
                  <>
                    <span className="font-mono">{p.name}</span>
                    <span> · column headings, not a person</span>
                  </>
                ) : (
                  <>
                    {p.name ? <span className="font-semibold">{p.name}</span> : null}
                    {p.name ? ' · ' : ''}
                    <span className="font-mono">{p.email || '(blank)'}</span>
                    {p.problem
                      ? <span> · {p.problem}</span>
                      : (
                        <span>
                          {' · '}
                          {roleNoun(roleFor(p))}
                          {p.role ? '' : ' (from the picker)'}
                        </span>
                      )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="gold" disabled={busy || sendable.length === 0} onClick={() => void send()}>
              {busy ? `Sending ${progress} of ${sendable.length}…` : `Send ${sendable.length} invitations`}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button>
          </div>
          {sendable.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              Sent one at a time, so one refusal does not stop the others. Anybody
              who already holds an invitation gets a fresh link, and their old one
              stops working.
            </p>
          )}
        </div>
      )}

      {results && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-bold text-navy">
            {sent} sent{failed.length > 0 ? `, ${failed.length} could not be` : ''}
          </p>
          {failed.length > 0 && (
            <ul className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              {failed.map((r) => (
                <li key={r.email}><span className="font-mono">{r.email}</span> · {r.detail}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setResults(null)}
            className="text-xs font-semibold text-gray-400 underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </Card>
  );
}
