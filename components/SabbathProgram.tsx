'use client';

// The Sabbath program, in the Office: plan the order of service for a Sabbath,
// then take it away as a Word file, through the phone's share sheet, or as text
// for a group chat.
//
// Asked for on 2 October 2026 for Guides "and all higher up accounts". The
// Office is already theirs and nobody else's (app/office/page.tsx), so this
// file draws the tool and leaves who may see it to the room it sits in.
//
// ONE COMPONENT FOR BOTH HALVES. Nothing here touches the database: programs
// live on the device (lib/sabbath-program.ts says why), so the tutorial and a
// church's real app run exactly the same code, and what somebody learns in one
// is true in the other.
//
// A PART OF THE DAY IS A FOLDER. The full template is four parts and 28 lines,
// three boxes each. Drawn open, that is the long scroll the owner has asked
// three times to be rid of, so a part opens when it is tapped and the others
// fold shut.

import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@/components/ui';
import {
  ArrowDownGlyph, ArrowUpGlyph, ChevronGlyph, ChevronLeftGlyph, CloseGlyph, CopyGlyph,
  DownloadGlyph, PlusGlyph,
} from '@/components/Glyph';
import {
  LIMITS, byDate, copyForNextSabbath, dateLabel, filledLines, fromTemplate, loadPrograms,
  manyLines, newLine, newSection, oneLine, programAsText, savePrograms,
  type ProgramLine, type ProgramSection, type SabbathProgram,
} from '@/lib/sabbath-program';
import { DOCX_MIME, programFileName, programToDocx } from '@/lib/sabbath-program-docx';
import { downloadBlob } from '@/lib/pdf';
import { canShareFiles, copyText, shareItem } from '@/lib/share';

const FIELD = 'w-full min-w-0 rounded-xl bg-white px-3 text-base ring-1 ring-navy/10';

/** What to type in a line's details, guessed from what the line is. */
function detailHint(part: string): string {
  const p = part.toLowerCase();
  if (p.includes('song service')) return 'Songs';
  if (/hymn|song/.test(p)) return 'Hymn number and title';
  if (/scripture|reading/.test(p)) return 'Bible passage';
  if (/sermon|topic|story/.test(p)) return 'Title';
  if (p.includes('music')) return 'Song';
  return 'Details (optional)';
}

/** The file, as the browser wants it. */
function docxBlob(p: SabbathProgram): Blob {
  const bytes = programToDocx(p);
  return new Blob([bytes.buffer as ArrayBuffer], { type: DOCX_MIME });
}

function IconButton({ label, onClick, disabled, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="tap-sm grid shrink-0 place-items-center rounded-lg bg-white text-navy ring-1 ring-navy/10 transition hover:bg-navy/5 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Move the item at `from` one place up (-1) or down (+1). */
function moved<T>(list: T[], from: number, by: -1 | 1): T[] {
  const to = from + by;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function SabbathPrograms({ owner, churchName }: {
  /** The signed-in account, so a shared computer keeps each person's list apart. */
  owner: string;
  churchName?: string;
}) {
  // null until read: the list is in the browser, and the server has none.
  const [programs, setPrograms] = useState<SabbathProgram[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setPrograms(loadPrograms(owner));
    setOpenId(null);
  }, [owner]);

  const commit = (next: SabbathProgram[]) => {
    const sorted = next.slice().sort(byDate);
    setPrograms(sorted);
    setSaved(savePrograms(owner, sorted));
  };

  if (!programs) return null;

  const open = openId ? programs.find((p) => p.id === openId) : undefined;
  const full = programs.length >= LIMITS.programs;

  const start = (p: SabbathProgram) => {
    commit([p, ...programs]);
    setOpenId(p.id);
  };

  if (open) {
    return (
      <ProgramEditor
        key={open.id}
        program={open}
        saved={saved}
        canCopy={!full}
        onBack={() => setOpenId(null)}
        onChange={(p) => commit(programs.map((x) => (x.id === p.id ? { ...p, updated: Date.now() } : x)))}
        onCopy={() => start(copyForNextSabbath(open))}
        onDelete={() => {
          commit(programs.filter((x) => x.id !== open.id));
          setOpenId(null);
        }}
      />
    );
  }

  return (
    <Card className="p-5" data-panel="sabbath-programs">
      <h2 className="text-xl font-bold text-navy">🗓️ Sabbath program</h2>
      <p className="mt-1 text-gray-600">
        The order of service for a Sabbath, ready to download for Word or Google Docs.
      </p>
      <p className="mt-1 text-sm text-gray-600">
        Kept on this device only. The names you type stay here unless you download or share the
        file.
      </p>

      <div className="mt-4">
        <Button onClick={() => start(fromTemplate(churchName ?? ''))} disabled={full}>
          <PlusGlyph /> New program
        </Button>
        {full && (
          <p className="mt-2 text-sm text-gray-600">
            This device holds {LIMITS.programs} programs. Delete an old one to make room.
          </p>
        )}
      </div>

      {!saved && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          This browser would not save on this device. Download a program before you leave the page.
        </p>
      )}

      {programs.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">
          No programs yet. A new one starts with Sabbath School, the Divine Service, the afternoon
          program and sunset vespers, ready for names.
        </p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Your Sabbath programs">
          {programs.map((p) => {
            const named = p.sections.reduce((n, s) => n + s.lines.filter((l) => l.who).length, 0);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(p.id)}
                  data-program-row
                  className="tap flex w-full items-center gap-3 rounded-xl bg-white px-4 py-2 text-left ring-1 ring-navy/10 transition hover:bg-navy/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-navy">
                      {dateLabel(p.date) || 'No date yet'}
                    </span>
                    <span className="block truncate text-sm text-gray-600">
                      {p.theme || `${p.sections.length} parts`}
                      {named ? ` · ${named} named` : ' · no names yet'}
                    </span>
                  </span>
                  <ChevronGlyph />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ProgramEditor({ program: p, saved, canCopy, onBack, onChange, onCopy, onDelete }: {
  program: SabbathProgram;
  saved: boolean;
  canCopy: boolean;
  onBack: () => void;
  onChange: (p: SabbathProgram) => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [openSection, setOpenSection] = useState<string | null>(p.sections[0]?.id ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState('');

  // Whether this browser can hand a file to another app. Phones mostly can;
  // most computers cannot, and there Download is the way.
  const shareable = useMemo(
    () => typeof File !== 'undefined'
      && canShareFiles(new File([new Uint8Array(1)], 'program.docx', { type: DOCX_MIME })),
    [],
  );

  const setSection = (id: string, next: ProgramSection | null) => onChange({
    ...p,
    sections: next
      ? p.sections.map((s) => (s.id === id ? next : s))
      : p.sections.filter((s) => s.id !== id),
  });

  const download = () => {
    downloadBlob(docxBlob(p), programFileName(p));
    setMessage(`Downloaded: ${programFileName(p)}`);
  };

  const share = async () => {
    const file = new File([docxBlob(p)], programFileName(p), { type: DOCX_MIME });
    const result = await shareItem({ title: 'Sabbath program', file });
    if (result === 'shared') setMessage('Shared.');
    else if (result !== 'cancelled') download();
  };

  const copy = async () => {
    const ok = await copyText(programAsText(p));
    setMessage(ok
      ? 'Copied. Paste it into a message.'
      : 'This browser would not copy it. Download the file instead.');
  };

  return (
    <Card className="p-5" data-panel="sabbath-program">
      <button
        type="button"
        onClick={onBack}
        className="tap-sm -ml-2 inline-flex items-center gap-1 rounded-lg px-2 font-semibold text-navy hover:bg-navy/5"
      >
        <ChevronLeftGlyph /> All programs
      </button>

      <h2 className="mt-2 text-xl font-bold text-navy">{dateLabel(p.date) || 'Sabbath program'}</h2>
      <p role="status" className={`mt-1 text-sm ${saved ? 'text-gray-600' : 'font-semibold text-red-700'}`}>
        {saved
          ? 'Saved on this device as you type.'
          : 'This browser would not save on this device. Download it before you leave the page.'}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-navy">Church</span>
          <input
            value={p.church}
            maxLength={LIMITS.church}
            onChange={(e) => onChange({ ...p, church: oneLine(e.target.value, LIMITS.church) })}
            className={`tap mt-1 ${FIELD}`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-navy">Date</span>
          <input
            type="date"
            value={p.date}
            onChange={(e) => onChange({ ...p, date: e.target.value })}
            className={`tap mt-1 ${FIELD}`}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-navy">Theme or sermon title (optional)</span>
          <input
            value={p.theme}
            maxLength={LIMITS.theme}
            onChange={(e) => onChange({ ...p, theme: oneLine(e.target.value, LIMITS.theme) })}
            className={`tap mt-1 ${FIELD}`}
          />
        </label>
      </div>

      <h3 className="mt-6 font-bold text-navy">Parts of the day</h3>
      <div className="mt-2 space-y-2">
        {p.sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            section={s}
            first={i === 0}
            last={i === p.sections.length - 1}
            open={openSection === s.id}
            onToggle={() => setOpenSection(openSection === s.id ? null : s.id)}
            onChange={(next) => setSection(s.id, next)}
            onMove={(by) => onChange({ ...p, sections: moved(p.sections, i, by) })}
            onRemove={() => setSection(s.id, null)}
          />
        ))}
      </div>
      {p.sections.length < LIMITS.sections && (
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => {
            const s = newSection();
            onChange({ ...p, sections: [...p.sections, s] });
            setOpenSection(s.id);
          }}
        >
          <PlusGlyph /> Add a part of the day
        </Button>
      )}

      <label className="mt-6 block">
        <span className="font-bold text-navy">Announcements (optional)</span>
        <span className="block text-sm text-gray-600">One per line.</span>
        <textarea
          value={p.notes}
          maxLength={LIMITS.notes}
          rows={4}
          onChange={(e) => onChange({ ...p, notes: manyLines(e.target.value, LIMITS.notes) })}
          className={`mt-1 py-2 ${FIELD}`}
        />
      </label>

      {/* Full width on a phone and a size down, so no label breaks over two
          lines. The size is forced: Button's own text-lg sits later in the
          stylesheet than text-base and would otherwise win. */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={download} className="w-full !text-base sm:w-auto">
          <DownloadGlyph /> Download Word file
        </Button>
        {shareable && (
          <Button variant="ghost" onClick={() => void share()} className="w-full !text-base sm:w-auto">
            Share the file
          </Button>
        )}
        <Button variant="ghost" onClick={() => void copy()} className="w-full !text-base sm:w-auto">
          <CopyGlyph /> Copy as text
        </Button>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        It opens in Word, Google Docs and Pages. For Google Docs, upload it to Google Drive, or open
        it from the Google Docs app on a phone.
      </p>
      {message && <p role="status" className="mt-2 text-sm font-semibold text-navy">{message}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-navy/10 pt-4">
        <Button variant="ghost" onClick={onCopy} disabled={!canCopy} className="w-full !text-base sm:w-auto">
          Reuse next week
        </Button>
        {confirmDelete ? (
          <>
            <span className="text-sm text-gray-700">Delete it from this device? It cannot be brought back.</span>
            <Button variant="danger" onClick={onDelete}>Delete it</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete program</Button>
        )}
      </div>
    </Card>
  );
}

function SectionEditor({ section: s, first, last, open, onToggle, onChange, onMove, onRemove }: {
  section: ProgramSection;
  first: boolean;
  last: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (s: ProgramSection) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  // TYPING AND ARRANGING ARE TWO MODES, the way a phone's own lists have Edit.
  // With move and remove buttons on every line there was no width left on a
  // phone for what the line says: three 44-point buttons beside a box left
  // "Song se" of the part's name, and moving them down a row did the same to
  // "Who lead". So a line is its three boxes, at full width, and the buttons
  // appear only when somebody asks to move or remove something.
  const [arranging, setArranging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const title = s.title || 'Untitled part';
  const named = s.lines.filter((l) => l.who).length;
  const setLine = (id: string, next: ProgramLine | null) => onChange({
    ...s,
    lines: next ? s.lines.map((l) => (l.id === id ? next : l)) : s.lines.filter((l) => l.id !== id),
  });

  return (
    <div className="rounded-2xl ring-1 ring-navy/10" data-program-section>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="tap flex w-full items-center gap-3 rounded-2xl px-4 py-2 text-left hover:bg-navy/5"
      >
        <ChevronGlyph open={open} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-navy">{title}</span>
          <span className="block text-sm text-gray-600">
            {[s.time, `${filledLines(s).length} lines`, `${named} with a name`].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-navy/10 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
            <input
              aria-label="Name of this part"
              value={s.title}
              maxLength={LIMITS.title}
              placeholder="Name of this part"
              onChange={(e) => onChange({ ...s, title: oneLine(e.target.value, LIMITS.title) })}
              className={`tap-sm font-semibold ${FIELD}`}
            />
            <input
              aria-label={`Time of ${title}`}
              value={s.time}
              maxLength={LIMITS.time}
              placeholder="Time, e.g. 9:00 AM"
              onChange={(e) => onChange({ ...s, time: oneLine(e.target.value, LIMITS.time) })}
              className={`tap-sm ${FIELD}`}
            />
          </div>

          <ol className="space-y-2" data-arranging={arranging ? '' : undefined}>
            {s.lines.map((l, i) => {
              const name = l.part || `line ${i + 1}`;
              if (arranging) {
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-1 rounded-xl bg-navy/[0.03] p-2" data-program-line>
                    {/* The name keeps room for itself and the buttons wrap
                        under it when a phone is too narrow for both: three
                        44-point buttons beside it left about 120 points, and
                        "Openin..." and "Welcom e" are not lines anybody can
                        move with confidence. */}
                    <span className="min-w-[10rem] flex-1 break-words px-2 leading-snug">
                      <span className="block font-semibold text-navy">{l.part || `Line ${i + 1}`}</span>
                      {l.who && <span className="block text-sm text-gray-600">{l.who}</span>}
                    </span>
                    <span className="ml-auto flex gap-1">
                      <IconButton label={`Move ${name} up`} disabled={i === 0}
                        onClick={() => onChange({ ...s, lines: moved(s.lines, i, -1) })}>
                        <ArrowUpGlyph size={18} />
                      </IconButton>
                      <IconButton label={`Move ${name} down`} disabled={i === s.lines.length - 1}
                        onClick={() => onChange({ ...s, lines: moved(s.lines, i, 1) })}>
                        <ArrowDownGlyph size={18} />
                      </IconButton>
                      <IconButton label={`Remove ${name}`} onClick={() => setLine(l.id, null)}>
                        <CloseGlyph size={18} />
                      </IconButton>
                    </span>
                  </li>
                );
              }
              return (
                <li key={l.id} className="rounded-xl bg-navy/[0.03] p-2" data-program-line>
                  <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
                    <input
                      aria-label={`Part ${i + 1} of ${title}`}
                      value={l.part}
                      maxLength={LIMITS.part}
                      placeholder="What happens"
                      onChange={(e) => setLine(l.id, { ...l, part: oneLine(e.target.value, LIMITS.part) })}
                      className={`tap-sm font-semibold ${FIELD}`}
                    />
                    <input
                      aria-label={`Details for ${name}`}
                      value={l.detail}
                      maxLength={LIMITS.detail}
                      placeholder={detailHint(l.part)}
                      onChange={(e) => setLine(l.id, { ...l, detail: oneLine(e.target.value, LIMITS.detail) })}
                      className={`tap-sm ${FIELD}`}
                    />
                    <input
                      aria-label={`Who leads ${name}`}
                      value={l.who}
                      maxLength={LIMITS.who}
                      placeholder="Who leads it"
                      onChange={(e) => setLine(l.id, { ...l, who: oneLine(e.target.value, LIMITS.who) })}
                      className={`tap-sm ${FIELD}`}
                    />
                  </div>
                </li>
              );
            })}
          </ol>

          {arranging ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => { setArranging(false); setConfirmRemove(false); }}>Done</Button>
              <IconButton label={`Move ${title} up`} disabled={first} onClick={() => onMove(-1)}>
                <ArrowUpGlyph size={18} />
              </IconButton>
              <IconButton label={`Move ${title} down`} disabled={last} onClick={() => onMove(1)}>
                <ArrowDownGlyph size={18} />
              </IconButton>
              {confirmRemove ? (
                <>
                  <Button variant="danger" onClick={onRemove}>Remove {title}</Button>
                  <Button variant="ghost" onClick={() => setConfirmRemove(false)}>Keep it</Button>
                </>
              ) : (
                <Button variant="danger" onClick={() => setConfirmRemove(true)}>Remove this part</Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {s.lines.length < LIMITS.lines && (
                <Button variant="ghost" onClick={() => onChange({ ...s, lines: [...s.lines, newLine()] })}>
                  <PlusGlyph /> Add a line
                </Button>
              )}
              <Button variant="ghost" onClick={() => setArranging(true)}>Arrange lines</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
