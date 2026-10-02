'use client';

// Evangelistic meetings: a series of nights, planned the church's own way.
//
// Asked for on 2 October 2026: "super customizable, unlike Sabbath program it
// has a template that can put input, but for EMs users can have much more
// freedom to customise their meeting". lib/evangelistic-meeting.ts says what
// the four freedoms are and why a block can be the team's only.
//
// THE SAME HOUSE RULES AS THE SABBATH PROGRAM (components/SabbathProgram.tsx),
// because the same people use both and the phone is the same width:
//   * one night open at a time, so a week of meetings is not one long scroll;
//   * typing and arranging are two modes, so the boxes keep a phone's width
//     and the move and remove buttons appear only when asked for;
//   * nothing here reads the database. Meetings live on the device, and
//     sharing goes through the one function the page hands in.
//
// FREEDOM WITHOUT A BLANK STARE. A blank page is offered, but so is a plan to
// change: a night for each day with the usual program, and the team and a
// to-do list for the series. Every name, column, block and night in it can be
// renamed, moved or taken out.

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Button, Card } from '@/components/ui';
import {
  ArrowDownGlyph, ArrowUpGlyph, ChevronGlyph, ChevronLeftGlyph, CloseGlyph, CopyGlyph, DownloadGlyph,
  PlusGlyph,
} from '@/components/Glyph';
import { FIELD, GROWS, IconButton, WIDE, moved, oneParagraph, type ShareInApp } from '@/components/SabbathProgram';
import { dateLabel, manyLines, oneLine } from '@/lib/sabbath-program';
import {
  BLOCK_CHOICES, COLOURS, HEADING_FACES, MEETING_LIMITS as L, blankSeries, bySeries, comingSunday,
  contrastOnWhite, dayAfter, firstDate, hexColour, loadMeetings, meetingAsText, meetingShareTitle, newBlock, newItem, newNight,
  newRow, plannedSeries, saveMeetings, withNightCopied,
  type ChecklistBlock, type EvangelisticMeeting, type HeadingStyle, type ListBlock, type MeetingBlock,
  type MeetingCopy, type MeetingLook, type MeetingNight, type TextBlock,
} from '@/lib/evangelistic-meeting';
import { DOCX_MIME } from '@/lib/sabbath-program-docx';
import { meetingFileName, meetingToDocx } from '@/lib/evangelistic-meeting-docx';
import { meetingPicture } from '@/lib/evangelistic-meeting-picture';
import { downloadBlob } from '@/lib/pdf';
import { canShareFiles, copyText, shareItem } from '@/lib/share';
import { useOnline } from '@/lib/online';

/** "Sun, Oct 4": short enough for a night's folder on a phone. */
function shortDate(date: string): string {
  const full = dateLabel(date);
  if (!full) return '';
  const m = /^(\w+), (\w+) (\d+),/.exec(full);
  return m ? `${m[1].slice(0, 3)}, ${m[2].slice(0, 3)} ${m[3]}` : full;
}

const KIND_NAME: Record<MeetingBlock['kind'], string> = { list: 'List', text: 'Paragraph', checklist: 'Checklist' };

export function EvangelisticMeetings({ owner, churchName, role, share }: {
  /** The signed-in account, so a shared computer keeps each person's meetings apart. */
  owner: string;
  churchName?: string;
  role?: string | null;
  /** Absent where sharing cannot happen, such as a page opened with no signal. */
  share?: ShareInApp;
}) {
  const [meetings, setMeetings] = useState<EvangelisticMeeting[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [first, setFirst] = useState(() => comingSunday());
  const [count, setCount] = useState('7');
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setMeetings(loadMeetings(owner));
    setOpenId(null);
  }, [owner]);

  if (!meetings) return null;

  const commit = (next: EvangelisticMeeting[]) => {
    const sorted = next.slice().sort(bySeries);
    setMeetings(sorted);
    setSaved(saveMeetings(owner, sorted));
  };
  const full = meetings.length >= L.meetings;
  const church = churchName ?? meetings[0]?.church ?? '';
  const start = (m: EvangelisticMeeting) => {
    setChoosing(false);
    commit([m, ...meetings]);
    setOpenId(m.id);
  };

  const open = openId ? meetings.find((m) => m.id === openId) : undefined;
  if (open) {
    return (
      <MeetingEditor
        key={open.id}
        meeting={open}
        saved={saved}
        role={role}
        share={share}
        onBack={() => setOpenId(null)}
        onChange={(m) => commit(meetings.map((x) => (x.id === m.id ? { ...m, updated: Date.now() } : x)))}
        onDelete={() => {
          commit(meetings.filter((x) => x.id !== open.id));
          setOpenId(null);
        }}
      />
    );
  }

  return (
    <Card className="p-5" data-panel="evangelistic-meetings">
      <h2 className="text-xl font-bold text-navy">📣 Evangelistic meetings</h2>
      <p className="mt-1 text-gray-600">
        Plan a series your own way: its nights, the blocks on each night, the columns in each list,
        and its look. Then download it, send it as a picture, or share it in the app.
      </p>
      <p className="mt-1 text-sm text-gray-600">
        Kept on this device, and it works without signal. The names you type stay here until you
        download or share them.
      </p>

      <div className="mt-4">
        <Button onClick={() => setChoosing(!choosing)} disabled={full}>
          <PlusGlyph /> New meetings
        </Button>
        {choosing && (
          <div className="mt-3 space-y-3 rounded-xl bg-navy/[0.03] p-3" role="group" aria-label="Start new meetings" data-meeting-chooser>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-navy">First night</span>
                <input
                  type="date"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  className={`tap-sm ${FIELD}`}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-navy">How many nights</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={L.nights}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className={`tap-sm ${FIELD}`}
                />
              </label>
            </div>
            <div>
              <Button className={WIDE} onClick={() => start(plannedSeries(church, first, Number(count)))}>
                Start with a plan
              </Button>
              <p className="mt-1 text-sm text-gray-600">
                A night for each day with the usual program, and a team and a to-do list for the whole
                series. Change, move or take out any of it.
              </p>
            </div>
            <div>
              <Button variant="ghost" className={WIDE} onClick={() => start(blankSeries(church, first))}>
                Start blank
              </Button>
              <p className="mt-1 text-sm text-gray-600">One night and nothing on it. Add only what you want.</p>
            </div>
          </div>
        )}
        {full && (
          <p className="mt-2 text-sm text-gray-600">
            This device holds {L.meetings} series. Delete an old one to make room.
          </p>
        )}
      </div>

      {!saved && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          This browser would not save on this device. Download your meetings before you leave the page.
        </p>
      )}

      {meetings.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">No meetings yet.</p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Your evangelistic meetings">
          {meetings.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setOpenId(m.id)}
                data-meeting-row
                className="tap flex w-full items-center gap-3 rounded-xl bg-white px-4 py-2 text-left ring-1 ring-navy/10 transition hover:bg-navy/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-navy">{m.name || 'Untitled meetings'}</span>
                  <span className="block truncate text-sm text-gray-600">
                    {[shortDate(firstDate(m)), `${m.nights.length} ${m.nights.length === 1 ? 'night' : 'nights'}`]
                      .filter(Boolean).join(' · ')}
                  </span>
                </span>
                <ChevronGlyph />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MeetingEditor({ meeting: m, saved, role, share, onBack, onChange, onDelete }: {
  meeting: EvangelisticMeeting;
  saved: boolean;
  role?: string | null;
  share?: ShareInApp;
  onBack: () => void;
  onChange: (m: EvangelisticMeeting) => void;
  onDelete: () => void;
}) {
  const [openNight, setOpenNight] = useState<string | null>(m.nights[0]?.id ?? null);
  const [scope, setScope] = useState<string>('series');
  const [copy, setCopy] = useState<MeetingCopy>('shared');
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A night chosen to take away, unless it has since been taken out.
  const nightId = scope !== 'series' && m.nights.some((n) => n.id === scope) ? scope : null;

  const shareable = useMemo(
    () => typeof File !== 'undefined'
      && canShareFiles(new File([new Uint8Array(1)], 'meetings.png', { type: 'image/png' })),
    [],
  );

  const setNight = (id: string, next: MeetingNight | null) => onChange({
    ...m,
    nights: next ? m.nights.map((n) => (n.id === id ? next : n)) : m.nights.filter((n) => n.id !== id),
  });

  const download = () => {
    const bytes = meetingToDocx(m, nightId, copy);
    const name = meetingFileName(m, nightId, copy);
    downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: DOCX_MIME }), name);
    setMessage(`Downloaded: ${name}`);
  };

  const picture = async (andShare: boolean) => {
    const name = meetingFileName(m, nightId, 'shared', 'png');
    try {
      const blob = await meetingPicture(m, nightId);
      if (andShare) {
        const result = await shareItem({ title: m.name || 'Evangelistic meetings', file: new File([blob], name, { type: 'image/png' }) });
        if (result === 'shared') { setMessage('Shared.'); return; }
        if (result === 'cancelled') return;
      }
      downloadBlob(blob, name);
      setMessage(`Downloaded: ${name}`);
    } catch {
      setMessage('This browser could not draw the picture. Download the Word file instead.');
    }
  };

  const copyAsText = async () => {
    const ok = await copyText(meetingAsText(m, nightId, copy));
    setMessage(ok ? 'Copied. Paste it into a message.' : 'This browser would not copy it. Download the file instead.');
  };

  return (
    <Card className="p-5" data-panel="evangelistic-meeting">
      <button
        type="button"
        onClick={onBack}
        className="tap-sm -ml-2 inline-flex items-center gap-1 rounded-lg px-2 font-semibold text-navy hover:bg-navy/5"
      >
        <ChevronLeftGlyph /> All meetings
      </button>

      <h2 className="mt-2 text-xl font-bold text-navy">{m.name || 'Evangelistic meetings'}</h2>
      <p role="status" className={`mt-1 text-sm ${saved ? 'text-gray-600' : 'font-semibold text-red-700'}`}>
        {saved
          ? 'Saved on this device as you type.'
          : 'This browser would not save on this device. Download it before you leave the page.'}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {([
          ['name', 'Name of the meetings', 'e.g. Hope for Today', L.name],
          ['church', 'Church', 'Your church', L.church],
          ['place', 'Place', 'Where they are held', L.place],
          ['tagline', 'A line under the name', 'e.g. All are welcome', L.tagline],
        ] as const).map(([key, label, hint, max]) => (
          <label key={key} className="block">
            <span className="text-sm font-semibold text-navy">{label}</span>
            <input
              value={m[key]}
              maxLength={max}
              placeholder={hint}
              onChange={(e) => onChange({ ...m, [key]: oneLine(e.target.value, max) })}
              className={`tap-sm ${FIELD}`}
            />
          </label>
        ))}
      </div>

      <LookEditor meeting={m} onChange={(look) => onChange({ ...m, look })} />

      <h3 className="mt-6 font-bold text-navy">For the whole series</h3>
      <p className="text-sm text-gray-600">Blocks that belong to every night: about the meetings, the team, what to get ready.</p>
      <BlocksEditor blocks={m.blocks} where="the whole series" onChange={(blocks) => onChange({ ...m, blocks })} />

      <h3 className="mt-6 font-bold text-navy">The nights</h3>
      <div className="mt-2 space-y-2" data-nights>
        {m.nights.map((n, i) => (
          <NightEditor
            key={n.id}
            night={n}
            index={i}
            open={openNight === n.id}
            canCopy={m.nights.length < L.nights}
            onToggle={() => setOpenNight(openNight === n.id ? null : n.id)}
            onChange={(next) => setNight(n.id, next)}
            onCopy={() => {
              const next = withNightCopied(m, n.id);
              onChange(next);
              setOpenNight(next.nights[next.nights.length - 1]?.id ?? null);
            }}
            onRemove={() => setNight(n.id, null)}
          />
        ))}
      </div>
      {m.nights.length < L.nights && (
        <Button
          variant="ghost"
          className={`mt-2 ${WIDE}`}
          onClick={() => {
            const last = m.nights[m.nights.length - 1];
            const night = last ? newNight(dayAfter(last.date), last.time) : newNight();
            onChange({ ...m, nights: [...m.nights, night] });
            setOpenNight(night.id);
          }}
        >
          <PlusGlyph /> Add a night
        </Button>
      )}

      <section className="mt-6 border-t border-navy/10 pt-4" data-take-away>
        <h3 className="font-bold text-navy">Take it away</h3>
        <label className="mt-2 block">
          <span className="text-sm font-semibold text-navy">What</span>
          <select
            aria-label="What to take away"
            value={nightId ?? 'series'}
            onChange={(e) => setScope(e.target.value)}
            className={`tap-sm ${FIELD}`}
          >
            <option value="series">The whole series</option>
            {m.nights.map((n, i) => (
              <option key={n.id} value={n.id}>
                {[`Night ${i + 1}`, shortDate(n.date), n.topic].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-sm text-gray-600">
          The whole series: every night in full in the Word file, and the series with its nights at a
          glance in the picture, the text and a post.
        </p>
        <fieldset className="mt-2">
          <legend className="text-sm font-semibold text-navy">Which copy</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            <label className="tap-sm inline-flex items-center gap-2">
              <input type="radio" name={`copy-${m.id}`} checked={copy === 'shared'} onChange={() => setCopy('shared')} />
              What is shared
            </label>
            <label className="tap-sm inline-flex items-center gap-2">
              <input type="radio" name={`copy-${m.id}`} checked={copy === 'team'} onChange={() => setCopy('team')} />
              Everything, for the team
            </label>
          </div>
        </fieldset>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={download} className={WIDE}>
            <DownloadGlyph /> Download Word file
          </Button>
          <Button variant="ghost" onClick={() => void picture(false)} className={WIDE}>
            <DownloadGlyph /> Download picture
          </Button>
          {shareable && (
            <Button variant="ghost" onClick={() => void picture(true)} className={WIDE}>
              Share the picture
            </Button>
          )}
          <Button variant="ghost" onClick={() => void copyAsText()} className={WIDE}>
            <CopyGlyph /> Copy as text
          </Button>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          The Word file opens in Word, Google Docs and Pages. To design it in Canva, a free account is
          enough: in Canva choose Upload, and add the Word file or the picture.
        </p>
        <p className="mt-1 text-sm text-gray-600">
          The picture and anything posted are always what is shared: a block marked for the team never
          leaves this device that way.
        </p>
        {message && <p role="status" className="mt-2 text-sm font-semibold text-navy">{message}</p>}
      </section>

      <MeetingShareBox meeting={m} nightId={nightId} role={role} share={share} />

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-navy/10 pt-4">
        {confirmDelete ? (
          <>
            <span className="text-sm text-gray-700">Delete these meetings from this device? They cannot be brought back.</span>
            <Button variant="danger" onClick={onDelete}>Delete them</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep them</Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete these meetings</Button>
        )}
      </div>
    </Card>
  );
}

/** The meeting's colour, heading face and title, for the Word file and the picture. */
function LookEditor({ meeting: m, onChange }: { meeting: EvangelisticMeeting; onChange: (look: MeetingLook) => void }) {
  const look = m.look;
  const pale = contrastOnWhite(look.colour) < 4.5;
  const preset = COLOURS.some((c) => c.hex === look.colour);
  return (
    <details className="mt-4 rounded-xl bg-navy/[0.03] p-3" data-look>
      <summary className="tap-sm flex cursor-pointer items-center font-bold text-navy">Its look</summary>
      <p className="mt-1 text-sm text-gray-600">For the Word file and the picture.</p>

      <fieldset className="mt-3">
        <legend className="text-sm font-semibold text-navy">Colour</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {COLOURS.map((c) => (
            <label key={c.hex} className="relative cursor-pointer" title={c.name}>
              <input
                type="radio"
                name={`colour-${m.id}`}
                checked={look.colour === c.hex}
                onChange={() => onChange({ ...look, colour: c.hex })}
                className="peer sr-only"
              />
              <span className="sr-only">{c.name}</span>
              <span
                aria-hidden
                className="block h-11 w-11 rounded-full ring-offset-2 ring-offset-white peer-checked:ring-[3px] peer-checked:ring-navy peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy"
                style={{ background: c.hex }}
              />
            </label>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-3">
          <input
            type="color"
            aria-label="Your own colour"
            value={look.colour}
            onChange={(e) => onChange({ ...look, colour: hexColour(e.target.value) ?? look.colour })}
            className="h-11 w-14 shrink-0 cursor-pointer rounded-lg bg-white ring-1 ring-navy/10"
          />
          <span className="text-sm text-gray-700">{preset ? 'Or choose your own colour' : 'Your own colour'}</span>
        </label>
        {pale && (
          <p className="mt-1 text-sm text-gray-700" data-pale-colour>
            A light colour draws the lines only. The words stay dark, so they can be read.
          </p>
        )}
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-sm font-semibold text-navy">Headings</legend>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
          {(Object.keys(HEADING_FACES) as HeadingStyle[]).map((key) => (
            <label key={key} className="tap-sm inline-flex items-center gap-2">
              <input
                type="radio"
                name={`faces-${m.id}`}
                checked={look.headings === key}
                onChange={() => onChange({ ...look, headings: key })}
              />
              <span style={{ fontFamily: HEADING_FACES[key].css }} className="font-bold">{HEADING_FACES[key].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-sm font-semibold text-navy">The name</legend>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
          <label className="tap-sm inline-flex items-center gap-2">
            <input type="radio" name={`align-${m.id}`} checked={look.align === 'centre'} onChange={() => onChange({ ...look, align: 'centre' })} />
            Centred
          </label>
          <label className="tap-sm inline-flex items-center gap-2">
            <input type="radio" name={`align-${m.id}`} checked={look.align === 'left'} onChange={() => onChange({ ...look, align: 'left' })} />
            On the left
          </label>
        </div>
      </fieldset>

      <div
        className="mt-3 overflow-hidden rounded-xl bg-white p-4 ring-1 ring-navy/10"
        style={{ borderTop: `6px solid ${look.colour}`, textAlign: look.align === 'left' ? 'left' : 'center' }}
        data-look-preview
      >
        <p
          className="break-words text-xl font-bold"
          style={{ fontFamily: HEADING_FACES[look.headings].css, color: pale ? '#1f2937' : look.colour }}
        >
          {m.name || 'Evangelistic meetings'}
        </p>
        {m.tagline && <p className="text-sm text-gray-700">{m.tagline}</p>}
      </div>
    </details>
  );
}

function NightEditor({ night: n, index, open, canCopy, onToggle, onChange, onCopy, onRemove }: {
  night: MeetingNight;
  index: number;
  open: boolean;
  canCopy: boolean;
  onToggle: () => void;
  onChange: (n: MeetingNight) => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const label = `night ${index + 1}`;
  return (
    <div className="rounded-2xl bg-white ring-1 ring-navy/10" data-night>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="tap flex w-full items-center gap-3 rounded-2xl px-4 py-2 text-left hover:bg-navy/5"
      >
        <ChevronGlyph open={open} />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-navy">
            Night {index + 1}{n.date ? ` · ${shortDate(n.date)}` : ''}{n.time ? ` · ${n.time}` : ''}
          </span>
          <span className="block truncate text-sm text-gray-600">{n.topic || 'No topic yet'}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-navy/10 p-2 sm:p-3">
          <div className="grid gap-2 sm:grid-cols-[12rem_10rem_minmax(0,1fr)]">
            <input
              type="date"
              aria-label={`Date of ${label}`}
              value={n.date}
              onChange={(e) => onChange({ ...n, date: /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : '' })}
              className={`tap-sm ${FIELD}`}
            />
            <input
              aria-label={`Time of ${label}`}
              value={n.time}
              maxLength={L.time}
              placeholder="Time, e.g. 7:00 PM"
              onChange={(e) => onChange({ ...n, time: oneLine(e.target.value, L.time) })}
              className={`tap-sm ${FIELD}`}
            />
            <textarea
              aria-label={`Topic of ${label}`}
              value={n.topic}
              rows={1}
              maxLength={L.topic}
              placeholder="Topic"
              onKeyDown={oneParagraph}
              onChange={(e) => onChange({ ...n, topic: oneLine(e.target.value, L.topic) })}
              className={`font-semibold ${GROWS}`}
            />
          </div>

          <BlocksEditor blocks={n.blocks} where={label} onChange={(blocks) => onChange({ ...n, blocks })} />

          <div className="flex flex-wrap items-center gap-2 border-t border-navy/10 pt-3">
            <Button variant="ghost" onClick={onCopy} disabled={!canCopy} className={WIDE}>
              <CopyGlyph /> Copy to a new night
            </Button>
            {confirmRemove ? (
              <>
                <Button variant="danger" onClick={onRemove}>Remove night {index + 1}</Button>
                <Button variant="ghost" onClick={() => setConfirmRemove(false)}>Keep it</Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => setConfirmRemove(true)}>Remove this night</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A list of blocks, for the whole series or for one night: typing, adding, and arranging. */
function BlocksEditor({ blocks, where, onChange }: {
  blocks: MeetingBlock[];
  /** "the whole series", "night 2": said in every label, so a screen reader knows which. */
  where: string;
  onChange: (blocks: MeetingBlock[]) => void;
}) {
  const [arranging, setArranging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const setBlock = (next: MeetingBlock) => onChange(blocks.map((b) => (b.id === next.id ? next : b)));

  if (arranging) {
    return (
      <div className="mt-2 space-y-2" data-arranging-blocks>
        <ol className="space-y-2">
          {blocks.map((b, i) => {
            const name = b.title || `block ${i + 1}`;
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-1 rounded-xl bg-navy/[0.03] p-2" data-block>
                <span className="min-w-[10rem] flex-1 break-words px-2 leading-snug">
                  <span className="block font-semibold text-navy">{b.title || `Block ${i + 1}`}</span>
                  <span className="block text-sm text-gray-600">{KIND_NAME[b.kind]}{b.teamOnly ? ', team only' : ''}</span>
                </span>
                <span className="ml-auto flex flex-wrap justify-end gap-1">
                  <IconButton label={`Move ${name} up`} disabled={i === 0} onClick={() => onChange(moved(blocks, i, -1))}>
                    <ArrowUpGlyph size={18} />
                  </IconButton>
                  <IconButton label={`Move ${name} down`} disabled={i === blocks.length - 1} onClick={() => onChange(moved(blocks, i, 1))}>
                    <ArrowDownGlyph size={18} />
                  </IconButton>
                  {confirmRemove === b.id ? (
                    <>
                      <Button variant="danger" onClick={() => { onChange(blocks.filter((x) => x.id !== b.id)); setConfirmRemove(null); }}>
                        Remove {name}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmRemove(null)}>Keep it</Button>
                    </>
                  ) : (
                    <IconButton label={`Remove ${name}`} onClick={() => setConfirmRemove(b.id)}>
                      <CloseGlyph size={18} />
                    </IconButton>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <Button onClick={() => { setArranging(false); setConfirmRemove(null); }}>Done</Button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      {blocks.length === 0 && <p className="text-sm text-gray-600">Nothing here yet.</p>}
      {blocks.map((b) => <BlockEditor key={b.id} block={b} where={where} onChange={setBlock} />)}
      <div className="flex flex-wrap items-center gap-2">
        {blocks.length < L.blocks && (
          <Button variant="ghost" onClick={() => setAdding(!adding)} aria-expanded={adding}>
            <PlusGlyph /> Add a block
          </Button>
        )}
        {blocks.length > 0 && (
          <Button variant="ghost" onClick={() => { setArranging(true); setAdding(false); }}>Arrange blocks</Button>
        )}
      </div>
      {adding && (
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={`Add a block to ${where}`} data-block-chooser>
          {BLOCK_CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => { onChange([...blocks, newBlock(c.key)]); setAdding(false); }}
              className="tap rounded-xl bg-white px-4 py-2 text-left ring-1 ring-navy/15 transition hover:bg-navy/5"
            >
              <span className="block font-semibold text-navy">{c.label}</span>
              <span className="block text-sm text-gray-600">{c.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockEditor({ block: b, where, onChange }: {
  block: MeetingBlock;
  where: string;
  onChange: (b: MeetingBlock) => void;
}) {
  const title = b.title || (b.kind === 'list' ? 'this list' : b.kind === 'text' ? 'this paragraph' : 'this checklist');
  return (
    <div className="space-y-2 rounded-xl bg-navy/[0.03] p-2 sm:p-3" data-block data-kind={b.kind}>
      <input
        aria-label={`Name of this block, in ${where}`}
        value={b.title}
        maxLength={L.title}
        placeholder={b.kind === 'text' ? 'Heading, e.g. About the meetings' : 'Name, e.g. Program'}
        onChange={(e) => onChange({ ...b, title: oneLine(e.target.value, L.title) })}
        className={`tap-sm font-bold ${FIELD}`}
      />
      <label className="flex cursor-pointer items-start gap-2 px-1 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={b.teamOnly}
          onChange={(e) => onChange({ ...b, teamOnly: e.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-navy"
          aria-label={`Team only: ${title}`}
        />
        <span>Team only: kept off the picture and anything posted</span>
      </label>
      {b.kind === 'list' && <ListEditor block={b} title={title} onChange={onChange} />}
      {b.kind === 'text' && <TextEditor block={b} title={title} onChange={onChange} />}
      {b.kind === 'checklist' && <ChecklistEditor block={b} title={title} onChange={onChange} />}
    </div>
  );
}

function ListEditor({ block: b, title, onChange }: {
  block: ListBlock;
  title: string;
  onChange: (b: ListBlock) => void;
}) {
  const [arranging, setArranging] = useState(false);
  const [confirmColumn, setConfirmColumn] = useState<string | null>(null);
  const columnName = (i: number) => b.columns[i]?.name || `Column ${i + 1}`;
  const setRow = (id: string, cells: Record<string, string> | null) => onChange({
    ...b,
    rows: cells ? b.rows.map((r) => (r.id === id ? { ...r, cells } : r)) : b.rows.filter((r) => r.id !== id),
  });
  const takeOutColumn = (id: string) => {
    onChange({
      ...b,
      columns: b.columns.filter((c) => c.id !== id),
      rows: b.rows.map((r) => {
        const { [id]: _gone, ...cells } = r.cells;
        return { ...r, cells };
      }),
    });
    setConfirmColumn(null);
  };
  // On a phone, every box of a line is full width, one under the other. Wider,
  // a line's boxes sit side by side, one per column.
  const across = { '--cols': `repeat(${b.columns.length}, minmax(0, 1fr))` } as CSSProperties;

  return (
    <div className="space-y-2">
      <details className="rounded-lg bg-white/70 px-2 py-1" data-columns>
        <summary className="tap-sm flex cursor-pointer items-center text-sm font-semibold text-navy">
          Columns ({b.columns.length}): {b.columns.map((c, i) => c.name || `Column ${i + 1}`).join(', ')}
        </summary>
        <ol className="mt-1 space-y-1 pb-1">
          {b.columns.map((c, i) => {
            const used = b.rows.some((r) => (r.cells[c.id] ?? '').trim());
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-1">
                <input
                  aria-label={`Column ${i + 1} of ${title}`}
                  value={c.name}
                  maxLength={L.column}
                  placeholder={`Column ${i + 1}`}
                  onChange={(e) => onChange({
                    ...b,
                    columns: b.columns.map((x) => (x.id === c.id ? { ...x, name: oneLine(e.target.value, L.column) } : x)),
                  })}
                  className={`tap-sm min-w-[9rem] flex-1 ${FIELD}`}
                />
                <span className="flex gap-1">
                  <IconButton label={`Move ${columnName(i)} earlier`} disabled={i === 0}
                    onClick={() => onChange({ ...b, columns: moved(b.columns, i, -1) })}>
                    <ArrowUpGlyph size={18} />
                  </IconButton>
                  <IconButton label={`Move ${columnName(i)} later`} disabled={i === b.columns.length - 1}
                    onClick={() => onChange({ ...b, columns: moved(b.columns, i, 1) })}>
                    <ArrowDownGlyph size={18} />
                  </IconButton>
                  {b.columns.length > 1 && confirmColumn !== c.id && (
                    <IconButton label={`Take out ${columnName(i)}`}
                      onClick={() => (used ? setConfirmColumn(c.id) : takeOutColumn(c.id))}>
                      <CloseGlyph size={18} />
                    </IconButton>
                  )}
                </span>
                {confirmColumn === c.id && (
                  <span className="flex w-full flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-700">What it says on every line goes too.</span>
                    <Button variant="danger" onClick={() => takeOutColumn(c.id)}>Remove {columnName(i)}</Button>
                    <Button variant="ghost" onClick={() => setConfirmColumn(null)}>Keep it</Button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {b.columns.length < L.columns && (
          <Button
            variant="ghost"
            className="mb-1"
            onClick={() => onChange({ ...b, columns: [...b.columns, { id: newRow().id, name: '' }] })}
          >
            <PlusGlyph /> Add a column
          </Button>
        )}
      </details>

      {!arranging && (
        // Wider than a phone, a line's boxes sit side by side, so the column
        // names head them once rather than only as faded placeholders.
        <div className="hidden gap-1 px-1 text-sm font-semibold text-navy sm:grid sm:[grid-template-columns:var(--cols)]" style={across} aria-hidden>
          {b.columns.map((c, i) => <span key={c.id} className="truncate">{c.name || `Column ${i + 1}`}</span>)}
        </div>
      )}
      <ol className="space-y-2">
        {b.rows.map((r, ri) => {
          const first = b.columns.map((c) => r.cells[c.id]).find((v) => v && v.trim()) || `Line ${ri + 1}`;
          if (arranging) {
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-1 rounded-lg bg-white/70 p-1" data-row>
                <span className="min-w-[10rem] flex-1 break-words px-2 font-semibold leading-snug text-navy">{first}</span>
                <span className="ml-auto flex gap-1">
                  <IconButton label={`Move ${first} up`} disabled={ri === 0} onClick={() => onChange({ ...b, rows: moved(b.rows, ri, -1) })}>
                    <ArrowUpGlyph size={18} />
                  </IconButton>
                  <IconButton label={`Move ${first} down`} disabled={ri === b.rows.length - 1} onClick={() => onChange({ ...b, rows: moved(b.rows, ri, 1) })}>
                    <ArrowDownGlyph size={18} />
                  </IconButton>
                  <IconButton label={`Remove ${first}`} onClick={() => setRow(r.id, null)}>
                    <CloseGlyph size={18} />
                  </IconButton>
                </span>
              </li>
            );
          }
          return (
            <li
              key={r.id}
              className="grid gap-1 rounded-xl bg-navy/[0.06] p-1.5 sm:bg-transparent sm:p-0 sm:[grid-template-columns:var(--cols)]"
              style={across}
              data-row
            >
              {b.columns.map((c, ci) => (
                <textarea
                  key={c.id}
                  aria-label={`${columnName(ci)}, line ${ri + 1} of ${title}`}
                  value={r.cells[c.id] ?? ''}
                  rows={1}
                  maxLength={L.cell}
                  placeholder={columnName(ci)}
                  onKeyDown={oneParagraph}
                  onChange={(e) => setRow(r.id, { ...r.cells, [c.id]: oneLine(e.target.value, L.cell) })}
                  className={`${ci === 0 ? 'font-semibold ' : ''}${GROWS}`}
                />
              ))}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {arranging ? (
          <Button onClick={() => setArranging(false)}>Done</Button>
        ) : (
          <>
            {b.rows.length < L.rows && (
              <Button variant="ghost" onClick={() => onChange({ ...b, rows: [...b.rows, newRow()] })}>
                <PlusGlyph /> Add a line
              </Button>
            )}
            {b.rows.length > 1 && <Button variant="ghost" onClick={() => setArranging(true)}>Arrange lines</Button>}
          </>
        )}
      </div>
    </div>
  );
}

function TextEditor({ block: b, title, onChange }: {
  block: TextBlock;
  title: string;
  onChange: (b: TextBlock) => void;
}) {
  return (
    <textarea
      aria-label={`Words for ${title}`}
      value={b.body}
      rows={4}
      maxLength={L.text}
      placeholder="Write it in your own words."
      onChange={(e) => onChange({ ...b, body: manyLines(e.target.value, L.text) })}
      className={`block min-h-[7rem] py-2 leading-relaxed ${FIELD}`}
    />
  );
}

function ChecklistEditor({ block: b, title, onChange }: {
  block: ChecklistBlock;
  title: string;
  onChange: (b: ChecklistBlock) => void;
}) {
  const setItem = (id: string, next: ChecklistBlock['items'][number] | null) => onChange({
    ...b,
    items: next ? b.items.map((i) => (i.id === id ? next : i)) : b.items.filter((i) => i.id !== id),
  });
  return (
    <div className="space-y-1">
      <ul className="space-y-1">
        {b.items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => setItem(item.id, { ...item, done: e.target.checked })}
              aria-label={`Done: ${item.text || `item ${i + 1}`}`}
              className="h-6 w-6 shrink-0 accent-navy"
            />
            <textarea
              aria-label={`Item ${i + 1} of ${title}`}
              value={item.text}
              rows={1}
              maxLength={L.item}
              placeholder="Something to do"
              onKeyDown={oneParagraph}
              onChange={(e) => setItem(item.id, { ...item, text: oneLine(e.target.value, L.item) })}
              className={`${item.done ? 'text-gray-500 line-through ' : ''}${GROWS}`}
            />
            <IconButton label={`Take out ${item.text || `item ${i + 1}`}`} onClick={() => setItem(item.id, null)}>
              <CloseGlyph size={18} />
            </IconButton>
          </li>
        ))}
      </ul>
      {b.items.length < L.items && (
        <Button variant="ghost" onClick={() => onChange({ ...b, items: [...b.items, newItem()] })}>
          <PlusGlyph /> Add an item
        </Button>
      )}
    </div>
  );
}

/**
 * Post what is shared, as a post with the sender's name on it: the whole
 * series at a glance, or the night chosen under Take it away. The rules every
 * post has decide who may read it.
 */
function MeetingShareBox({ meeting: m, nightId, role, share }: {
  meeting: EvangelisticMeeting;
  nightId: string | null;
  role?: string | null;
  share?: ShareInApp;
}) {
  const { online } = useOnline();
  const leads = role === 'admin' || role === 'executive';
  const [audience, setAudience] = useState<'all' | 'church'>(leads ? 'church' : 'all');
  const [state, setState] = useState<'idle' | 'posting' | 'posted' | 'failed'>('idle');
  const [why, setWhy] = useState('');
  const body = meetingAsText(m, nightId, 'shared');
  const tooLong = body.length > 20000;
  const at = nightId ? m.nights.findIndex((n) => n.id === nightId) : -1;
  const what = at >= 0 ? `Night ${at + 1}` : 'The whole series, at a glance';

  const post = async () => {
    if (!share) return;
    setState('posting');
    try {
      await share({ title: meetingShareTitle(m, nightId), body, audience });
      setState('posted');
    } catch (cause) {
      setWhy(cause instanceof Error ? cause.message : '');
      setState('failed');
    }
  };

  return (
    <section className="mt-6 border-t border-navy/10 bg-white pt-4" data-meeting-share>
      <h3 className="font-bold text-navy">Share in the app</h3>
      {!share ? (
        <p className="mt-1 text-sm text-gray-600">
          Sharing in the app needs a connection to your church. The Word file and the picture work
          without one.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-700">Posts: <span className="font-semibold">{what}</span>. Choose another under What, above.</p>
          <fieldset className="mt-2">
            <legend className="sr-only">Who sees it</legend>
            <label className="flex cursor-pointer items-start gap-2 py-1">
              <input type="radio" name={`meet-aud-${m.id}`} className="mt-1" checked={audience === 'all'} onChange={() => setAudience('all')} />
              <span>
                <span className="block font-semibold text-navy">The people I walk with</span>
                <span className="block text-sm text-gray-600">They see it in Church and on This Sabbath, with your name on it.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 py-1">
              <input type="radio" name={`meet-aud-${m.id}`} className="mt-1" checked={audience === 'church'} onChange={() => setAudience('church')} />
              <span>
                <span className="block font-semibold text-navy">Everyone in the church</span>
                <span className="block text-sm text-gray-600">It goes on Community Blogs for the whole church, with your name on it.</span>
              </span>
            </label>
          </fieldset>
          <Button onClick={() => void post()} disabled={!online || tooLong || state === 'posting'} className={`mt-2 ${WIDE}`}>
            {state === 'posted' ? 'Post it again' : 'Post it'}
          </Button>
          <p role="status" className="mt-2 text-sm text-gray-700">
            {!online && 'No signal. Post it when you have one; nothing is lost meanwhile.'}
            {online && tooLong && 'This is too long to post. Post one night at a time, or share the Word file.'}
            {online && !tooLong && state === 'posted' && 'Posted. To take it down, open Publish.'}
            {online && !tooLong && state === 'failed' && `It did not post${why ? `: ${why}` : '.'} Nothing was shared.`}
          </p>
        </>
      )}
    </section>
  );
}
