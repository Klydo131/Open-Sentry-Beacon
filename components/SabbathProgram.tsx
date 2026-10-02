'use client';

// The Sabbath program: plan the order of service for a Sabbath, then take it
// away (a Word file, a picture, text for a group chat) or share it with the
// church inside the app.
//
// Asked for on 2 October 2026 for Guides "and all higher up accounts", and the
// same day: "simple to use (with Advance settings of course)", shareable with
// Explorers, ready for Canva without cost or legal risk, and usable on every
// device with or without a signal. docs/SABBATH-PROGRAM-RESEARCH.md records the
// open-source tools this was modelled on and what was taken from each.
//
// ONE COMPONENT, THREE PLACES. The Office's Sabbath program folder, and the
// This Sabbath page (app/sabbath/page.tsx), in a church's own app and in the
// sample church. Nothing here reads the database: programs live on the device
// (lib/sabbath-program.ts says why), and sharing goes through the one function
// the page hands in, which uses the rules posts already have.
//
// SIMPLE UNLESS ASKED. Advanced settings are one switch, remembered on the
// device, and everything they add stays out of sight until it is on.
//
// A PART OF THE DAY IS A FOLDER. The full template is four parts and 28 lines,
// three boxes each. Drawn open, that is the long scroll the owner has asked
// three times to be rid of, so a part opens when it is tapped and the others
// fold shut.

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Button, Card } from '@/components/ui';
import {
  ArrowDownGlyph, ArrowUpGlyph, ChevronGlyph, ChevronLeftGlyph, CloseGlyph, CopyGlyph,
  DownloadGlyph, PlusGlyph,
} from '@/components/Glyph';
import {
  LIMITS, blankProgram, byDate, copyForNextSabbath, dateLabel, filledLines, formatClock,
  fromOwnTemplate, fromTemplate, loadAdvanced, loadPrograms, loadTemplates, manyLines, newLine,
  newSection, oneLine, overruns, peopleIn, programAsText, reminderText, saveAdvanced, savePrograms,
  saveTemplates, schedule, shareTitle, stillToFill, templateFrom, wholeMinutes,
  type OwnTemplate, type ProgramCopy, type ProgramLine, type ProgramSection, type SabbathProgram,
} from '@/lib/sabbath-program';
import { DOCX_MIME, programFileName, programToDocx } from '@/lib/sabbath-program-docx';
import { pictureFileName, programPicture } from '@/lib/sabbath-program-picture';
import { downloadBlob } from '@/lib/pdf';
import { canShareFiles, copyText, shareItem } from '@/lib/share';
import { useOnline } from '@/lib/online';

export const FIELD = 'w-full min-w-0 rounded-xl bg-white px-3 text-base ring-1 ring-navy/10';
// A box for one paragraph that can outgrow a phone's width: a note, or what a
// detail says. It grows to show every word, where the browser can
// (field-sizing), and is one line tall where it cannot, like the boxes around
// it, 44px like them (10 + 24 + 10). Enter does nothing, because what is
// typed is kept as one line.
export const GROWS = `block min-h-[44px] resize-none py-[10px] leading-[24px] [field-sizing:content] ${FIELD}`;
export const oneParagraph = (e: KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault(); };
// Its own width, not FIELD's: two width classes on one box are settled by
// where they sit in the stylesheet, and w-full sits after w-20.
const MINUTES_FIELD = 'w-20 shrink-0 rounded-xl bg-white px-3 text-base ring-1 ring-navy/10';
// Full width on a phone and a size down, so no label breaks over two lines.
// The size is forced: Button's own text-lg sits later in the stylesheet than
// text-base and would otherwise win.
export const WIDE = 'w-full !text-base sm:w-auto';

/** Post a program into the app, to the people the sender walks with or the whole church. */
export type ShareInApp = (post: { title: string; body: string; audience: 'all' | 'church' }) => Promise<void>;

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

/** The Word file, as the browser wants it. */
function docxBlob(p: SabbathProgram, copy: ProgramCopy): Blob {
  const bytes = programToDocx(p, new Date(), copy);
  return new Blob([bytes.buffer as ArrayBuffer], { type: DOCX_MIME });
}

export function IconButton({ label, onClick, disabled, children }: {
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
export function moved<T>(list: T[], from: number, by: -1 | 1): T[] {
  const to = from + by;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** "16 lines still need someone", the readiness check a coordinator wants on Friday. */
function toFillText(n: number): string {
  if (!n) return 'Every line has someone leading it.';
  return `${n} ${n === 1 ? 'line still needs' : 'lines still need'} someone to lead it.`;
}

export function SabbathPrograms({ owner, churchName, role, share }: {
  /** The signed-in account, so a shared computer keeps each person's list apart. */
  owner: string;
  churchName?: string;
  /** Decides who "Share in the app" offers first. */
  role?: string | null;
  /** Absent where sharing cannot happen, such as a page opened with no signal. */
  share?: ShareInApp;
}) {
  // null until read: the list is in the browser, and the server has none.
  const [programs, setPrograms] = useState<SabbathProgram[] | null>(null);
  const [templates, setTemplates] = useState<OwnTemplate[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setPrograms(loadPrograms(owner));
    setTemplates(loadTemplates(owner));
    setAdvanced(loadAdvanced(owner));
    setOpenId(null);
  }, [owner]);

  const commit = (next: SabbathProgram[]) => {
    const sorted = next.slice().sort(byDate);
    setPrograms(sorted);
    setSaved(savePrograms(owner, sorted));
  };

  const switchAdvanced = (on: boolean) => {
    setAdvanced(on);
    saveAdvanced(owner, on);
    if (!on) setChoosing(false);
  };

  const keepTemplate = (t: OwnTemplate): boolean => {
    const next = [t, ...templates.filter((x) => x.name.toLowerCase() !== t.name.toLowerCase())]
      .slice(0, LIMITS.templates);
    setTemplates(next);
    return saveTemplates(owner, next);
  };

  if (!programs) return null;

  const open = openId ? programs.find((p) => p.id === openId) : undefined;
  const full = programs.length >= LIMITS.programs;
  const church = churchName ?? programs[0]?.church ?? '';

  const start = (p: SabbathProgram) => {
    setChoosing(false);
    commit([p, ...programs]);
    setOpenId(p.id);
  };

  if (open) {
    return (
      <ProgramEditor
        key={open.id}
        program={open}
        saved={saved}
        advanced={advanced}
        canCopy={!full}
        role={role}
        share={share}
        onBack={() => setOpenId(null)}
        onChange={(p) => commit(programs.map((x) => (x.id === p.id ? { ...p, updated: Date.now() } : x)))}
        onCopy={() => start(copyForNextSabbath(open))}
        onDelete={() => {
          commit(programs.filter((x) => x.id !== open.id));
          setOpenId(null);
        }}
        onSaveTemplate={keepTemplate}
      />
    );
  }

  return (
    <Card className="p-5" data-panel="sabbath-programs">
      <h2 className="text-xl font-bold text-navy">🗓️ Sabbath program</h2>
      <p className="mt-1 text-gray-600">
        Plan the order of service, then download it, send it as a picture, or share it in the app.
      </p>
      <p className="mt-1 text-sm text-gray-600">
        Kept on this device, and it works without signal. The names you type stay here until you
        download or share the program.
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-navy/[0.03] p-3">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => switchAdvanced(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-navy"
          data-advanced-switch
        />
        <span>
          <span className="block font-semibold text-navy">Advanced settings</span>
          <span className="block text-sm text-gray-600">
            Minutes and start times, notes for the platform, details of your own, your own
            templates, and a reminder for each person taking part.
          </span>
        </span>
      </label>

      <div className="mt-4">
        <Button
          onClick={() => (advanced && templates.length ? setChoosing(!choosing) : start(fromTemplate(church)))}
          disabled={full}
        >
          <PlusGlyph /> New program
        </Button>
        {choosing && (
          <div className="mt-3 space-y-2" role="group" aria-label="Start from" data-template-chooser>
            <p className="text-sm font-semibold text-navy">Start from</p>
            <Button variant="ghost" className={WIDE} onClick={() => start(fromTemplate(church))}>
              The standard Sabbath
            </Button>
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <Button variant="ghost" className={`${WIDE} flex-1`} onClick={() => start(fromOwnTemplate(t, church))}>
                  {t.name}
                </Button>
                <IconButton
                  label={`Forget the template ${t.name}`}
                  onClick={() => {
                    const next = templates.filter((x) => x.id !== t.id);
                    setTemplates(next);
                    saveTemplates(owner, next);
                  }}
                >
                  <CloseGlyph size={18} />
                </IconButton>
              </div>
            ))}
            <Button variant="ghost" className={WIDE} onClick={() => start(blankProgram(church))}>
              A blank page
            </Button>
          </div>
        )}
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
            const left = stillToFill(p);
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
                      {left ? ` · ${left} still to fill` : ' · everyone named'}
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

function ProgramEditor({
  program: p, saved, advanced, canCopy, role, share, onBack, onChange, onCopy, onDelete, onSaveTemplate,
}: {
  program: SabbathProgram;
  saved: boolean;
  advanced: boolean;
  canCopy: boolean;
  role?: string | null;
  share?: ShareInApp;
  onBack: () => void;
  onChange: (p: SabbathProgram) => void;
  onCopy: () => void;
  onDelete: () => void;
  onSaveTemplate: (t: OwnTemplate) => boolean;
}) {
  const [openSection, setOpenSection] = useState<string | null>(p.sections[0]?.id ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState('');
  const [copy, setCopy] = useState<ProgramCopy>('congregation');
  const [templateName, setTemplateName] = useState('');
  // The platform copy is an Advanced setting; with it off, every file is the
  // congregation's.
  const chosen: ProgramCopy = advanced ? copy : 'congregation';
  const toFill = stillToFill(p);
  const late = advanced ? overruns(p) : [];

  // Whether this browser can hand a picture to another app. Phones mostly can;
  // most computers cannot, and there Download is the way.
  const shareable = useMemo(
    () => typeof File !== 'undefined'
      && canShareFiles(new File([new Uint8Array(1)], 'program.png', { type: 'image/png' })),
    [],
  );

  const setSection = (id: string, next: ProgramSection | null) => onChange({
    ...p,
    sections: next
      ? p.sections.map((s) => (s.id === id ? next : s))
      : p.sections.filter((s) => s.id !== id),
  });

  const download = () => {
    downloadBlob(docxBlob(p, chosen), programFileName(p, chosen));
    setMessage(`Downloaded: ${programFileName(p, chosen)}`);
  };

  const picture = async (andShare: boolean) => {
    try {
      const blob = await programPicture(p);
      if (andShare) {
        const file = new File([blob], pictureFileName(p), { type: 'image/png' });
        const result = await shareItem({ title: 'Sabbath program', file });
        if (result === 'shared') { setMessage('Shared.'); return; }
        if (result === 'cancelled') return;
      }
      downloadBlob(blob, pictureFileName(p));
      setMessage(`Downloaded: ${pictureFileName(p)}`);
    } catch {
      setMessage('This browser could not draw the picture. Download the Word file instead.');
    }
  };

  const copyAsText = async () => {
    const ok = await copyText(programAsText(p, chosen));
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
      <p className="mt-1 text-sm font-semibold text-navy" data-still-to-fill>{toFillText(toFill)}</p>

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

      {advanced && (
        <div className="mt-4" data-extras>
          <p className="text-sm font-semibold text-navy">Your own details</p>
          <p className="text-sm text-gray-600">
            Anything the fields above do not cover, such as who is on duty or what the offering is
            for. Each prints under the theme, on every copy.
          </p>
          {p.extras.length > 0 && (
            <ul className="mt-2 space-y-2">
              {p.extras.map((x) => (
                // On a phone: the name with its remove button, then what it says
                // across the whole width, so "Anna Yu and Peter Tan" is not cut
                // short. Wider: name, what it says, remove, in one row.
                <li
                  key={x.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-xl bg-navy/[0.03] p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]"
                  data-extra
                >
                  <input
                    aria-label="Name of this detail"
                    value={x.label}
                    maxLength={LIMITS.extraLabel}
                    placeholder="For example, Deacons on duty"
                    onChange={(e) => onChange({
                      ...p,
                      extras: p.extras.map((y) => (y.id === x.id ? { ...y, label: oneLine(e.target.value, LIMITS.extraLabel) } : y)),
                    })}
                    className={`tap-sm font-semibold ${FIELD}`}
                  />
                  <textarea
                    aria-label={`What ${x.label || 'this detail'} says`}
                    value={x.value}
                    rows={1}
                    maxLength={LIMITS.extraValue}
                    placeholder="What it says"
                    onKeyDown={oneParagraph}
                    onChange={(e) => onChange({
                      ...p,
                      extras: p.extras.map((y) => (y.id === x.id ? { ...y, value: oneLine(e.target.value, LIMITS.extraValue) } : y)),
                    })}
                    className={`order-3 col-span-2 sm:order-none sm:col-span-1 ${GROWS}`}
                  />
                  <IconButton
                    label={`Take out ${x.label || 'this detail'}`}
                    onClick={() => onChange({ ...p, extras: p.extras.filter((y) => y.id !== x.id) })}
                  >
                    <CloseGlyph size={18} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          {p.extras.length < LIMITS.extras && (
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => onChange({ ...p, extras: [...p.extras, { id: newLine().id, label: '', value: '' }] })}
            >
              <PlusGlyph /> Add a detail
            </Button>
          )}
        </div>
      )}

      <h3 className="mt-6 font-bold text-navy">Parts of the day</h3>
      {late.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-overruns>
          {late.map((o) => (
            <li key={o.part}>
              {o.part} runs {o.by} {o.by === 1 ? 'minute' : 'minutes'} into {o.next}.
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 space-y-2">
        {p.sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            section={s}
            advanced={advanced}
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

      <section className="mt-6 border-t border-navy/10 pt-4" data-take-away>
        <h3 className="font-bold text-navy">Take it away</h3>
        {advanced && (
          <fieldset className="mt-2">
            <legend className="text-sm font-semibold text-navy">Which copy</legend>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
              <label className="tap-sm inline-flex items-center gap-2">
                <input type="radio" name={`copy-${p.id}`} checked={copy === 'congregation'} onChange={() => setCopy('congregation')} />
                For the congregation
              </label>
              <label className="tap-sm inline-flex items-center gap-2">
                <input type="radio" name={`copy-${p.id}`} checked={copy === 'platform'} onChange={() => setCopy('platform')} />
                For the platform, with times and notes
              </label>
            </div>
          </fieldset>
        )}
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
          The Word file opens in Word, Google Docs and Pages. For Google Docs, upload it to Google
          Drive, or open it from the Google Docs app on a phone.
        </p>
        <p className="mt-1 text-sm text-gray-600" data-canva>
          To design it in Canva, a free account is enough: in Canva choose Upload, and add the Word
          file or the picture. The app sends nothing to Canva itself.
        </p>
        {advanced && copy === 'platform' && (
          <p className="mt-1 text-sm text-gray-600">
            The picture and anything shared in the app are always the congregation&rsquo;s copy: notes
            never leave this device that way.
          </p>
        )}
        {message && <p role="status" className="mt-2 text-sm font-semibold text-navy">{message}</p>}
      </section>

      <ShareInAppBox program={p} role={role} share={share} />

      {advanced && <Reminders program={p} />}

      {advanced && (
        <details className="mt-4 rounded-xl bg-navy/[0.03] p-3" data-save-template>
          <summary className="tap-sm flex cursor-pointer items-center font-bold text-navy">Save as a template</summary>
          <p className="mt-1 text-sm text-gray-600">
            Keeps the parts, their times and minutes, and the names of your own details, for next
            time. Who leads what, the details and the notes are not kept: they belong to this
            Sabbath.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              aria-label="Template name"
              placeholder="For example, Communion Sabbath"
              value={templateName}
              maxLength={LIMITS.templateName}
              onChange={(e) => setTemplateName(oneLine(e.target.value, LIMITS.templateName))}
              className={`tap-sm flex-1 ${FIELD}`}
            />
            <Button
              variant="ghost"
              className={WIDE}
              onClick={() => {
                const t = templateFrom(p, templateName);
                setMessage(onSaveTemplate(t)
                  ? `Saved the template "${t.name}". New program offers it.`
                  : 'This browser would not save the template.');
                setTemplateName('');
              }}
            >
              Save template
            </Button>
          </div>
        </details>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-navy/10 pt-4">
        <Button variant="ghost" onClick={onCopy} disabled={!canCopy} className={WIDE}>
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

/**
 * Share the congregation's copy inside the app, as a post with the sender's
 * name on it. A Guide's goes to the people they walk with, a leader's to the
 * whole church, and either can choose the other; the database's own rules for
 * posts decide who can read it, as they do for every post.
 */
function ShareInAppBox({ program, role, share }: {
  program: SabbathProgram;
  role?: string | null;
  share?: ShareInApp;
}) {
  const { online } = useOnline();
  const leads = role === 'admin' || role === 'executive';
  const [audience, setAudience] = useState<'all' | 'church'>(leads ? 'church' : 'all');
  const [state, setState] = useState<'idle' | 'posting' | 'posted' | 'failed'>('idle');
  const [why, setWhy] = useState('');
  const body = programAsText(program, 'congregation');
  // The same ceiling as a post written by hand (migration 0006).
  const tooLong = body.length > 20000;

  const post = async () => {
    if (!share) return;
    setState('posting');
    try {
      await share({ title: shareTitle(program), body, audience });
      setState('posted');
    } catch (cause) {
      setWhy(cause instanceof Error ? cause.message : '');
      setState('failed');
    }
  };

  return (
    <section className="mt-6 border-t border-navy/10 bg-white pt-4" data-share-in-app>
      <h3 className="font-bold text-navy">Share in the app</h3>
      {!share ? (
        <p className="mt-1 text-sm text-gray-600">
          Sharing in the app needs a connection to your church. The Word file and the picture work
          without one.
        </p>
      ) : (
        <>
          <fieldset className="mt-2">
            <legend className="sr-only">Who sees it</legend>
            <label className="flex cursor-pointer items-start gap-2 py-1">
              <input type="radio" name={`aud-${program.id}`} className="mt-1" checked={audience === 'all'} onChange={() => setAudience('all')} />
              <span>
                <span className="block font-semibold text-navy">The people I walk with</span>
                <span className="block text-sm text-gray-600">
                  Your Explorers see it in Church and on This Sabbath, with your name on it.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 py-1">
              <input type="radio" name={`aud-${program.id}`} className="mt-1" checked={audience === 'church'} onChange={() => setAudience('church')} />
              <span>
                <span className="block font-semibold text-navy">Everyone in the church</span>
                <span className="block text-sm text-gray-600">
                  It goes on Community Blogs for the whole church, with your name on it.
                </span>
              </span>
            </label>
          </fieldset>
          <Button
            onClick={() => void post()}
            disabled={!online || tooLong || state === 'posting'}
            className={`mt-2 ${WIDE}`}
          >
            {state === 'posted' ? 'Post it again' : 'Post it'}
          </Button>
          <p role="status" className="mt-2 text-sm text-gray-700">
            {!online && 'No signal. Post it when you have one; nothing is lost meanwhile.'}
            {online && tooLong && 'This program is too long to post. Share the Word file or the picture instead.'}
            {online && !tooLong && state === 'posted' && 'Posted. To take it down, open Publish.'}
            {online && !tooLong && state === 'failed' && `It did not post${why ? `: ${why}` : '.'} Nothing was shared.`}
          </p>
          <p className="text-sm text-gray-600">
            Only the congregation&rsquo;s copy is shared. Notes for the platform stay on this device.
          </p>
        </>
      )}
    </section>
  );
}

/** Everyone taking part, each with a reminder ready to paste into a message to them. */
function Reminders({ program }: { program: SabbathProgram }) {
  const people = peopleIn(program);
  const [said, setSaid] = useState('');
  return (
    <details className="mt-4 rounded-xl bg-navy/[0.03] p-3" data-reminders>
      <summary className="tap-sm flex cursor-pointer items-center font-bold text-navy">
        Reminders ({people.length} {people.length === 1 ? 'person' : 'people'})
      </summary>
      {people.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">Nobody is named yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {people.map((person) => (
            <li key={person.name} className="rounded-xl bg-white p-3 ring-1 ring-navy/10" data-reminder>
              <p className="font-semibold text-navy">{person.name}</p>
              <p className="text-sm text-gray-600">
                {person.duties.map((d) => `${d.part || 'A part'}${d.at ? ` (${d.at})` : ''}`).join(', ')}
              </p>
              <Button
                variant="ghost"
                className={`mt-2 ${WIDE}`}
                onClick={async () => {
                  const ok = await copyText(reminderText(program, person));
                  setSaid(ok
                    ? `Copied the reminder for ${person.name}. Paste it into a message to them.`
                    : 'This browser would not copy it.');
                }}
              >
                <CopyGlyph /> Copy reminder
              </Button>
            </li>
          ))}
        </ul>
      )}
      {said && <p role="status" className="mt-2 text-sm font-semibold text-navy">{said}</p>}
    </details>
  );
}

function SectionEditor({ section: s, advanced, first, last, open, onToggle, onChange, onMove, onRemove }: {
  section: ProgramSection;
  advanced: boolean;
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
  const plan = schedule(s);
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
            {[
              s.time,
              advanced && plan.end !== null ? `ends ${formatClock(plan.end, plan.twelve)}` : '',
              `${filledLines(s).length} lines`,
              `${named} with a name`,
            ].filter(Boolean).join(' · ')}
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
                  {advanced && (
                    // Minutes and the start time they give on one line, the
                    // note on its own: side by side, a phone left the note
                    // three letters wide and pushed it off the screen.
                    <div className="mt-1 grid gap-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center" data-line-advanced>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={LIMITS.minutes}
                          aria-label={`Minutes for ${name}`}
                          placeholder="Min"
                          value={l.minutes || ''}
                          onChange={(e) => setLine(l.id, { ...l, minutes: wholeMinutes(e.target.value) })}
                          className={`tap-sm ${MINUTES_FIELD}`}
                        />
                        <span className="w-28 shrink-0 text-sm text-gray-600" data-line-start>
                          {plan.startsById[l.id] ? `starts ${plan.startsById[l.id]}` : 'minutes'}
                        </span>
                      </div>
                      <textarea
                        aria-label={`Note for ${name}`}
                        value={l.note}
                        rows={1}
                        maxLength={LIMITS.note}
                        placeholder="Note for the platform"
                        onKeyDown={oneParagraph}
                        onChange={(e) => setLine(l.id, { ...l, note: oneLine(e.target.value, LIMITS.note) })}
                        className={GROWS}
                      />
                    </div>
                  )}
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
