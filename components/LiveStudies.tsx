'use client';

// Lesson studies: Guides and leaders write series of studies with handouts and
// publish them; anybody in the church reads them. A draft is visible only to
// its author.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';
import { Rich } from '@/components/Rich';
import { humanError } from '@/lib/live/errors';
import { DropArea, FileDrop } from '@/components/FileDrop';
import { DrawButton, DrawingBoard, DrawingPicture, useFileUrl } from '@/components/draw/Draw';
import { WritingModeNote, WritingModeSwitch, useWritingMode } from '@/components/WritingMode';
import { drawingTitle, isDrawingName } from '@/lib/drawing-file';
import { uuid } from '@/lib/uuid';
import { useKeepUp, KEEP_UP_STUDIES } from '@/lib/live/keep-up';
import { ReadingBar } from '@/components/live/ReadingProgress';
import type { Role } from '@/lib/types';

/**
 * Who may write studies: Guides, Directors and Executive Directors. Mirrors
 * `public.may_write_studies()`, which is what actually refuses
 * (tests/an-explorer-reads-the-studies.mjs keeps the two in step).
 */
export function canWriteStudies(role: Role | undefined | null): boolean {
  return role === 'dm' || role === 'admin' || role === 'executive';
}

function message(cause: unknown): string {
  return humanError(cause, 'That did not work.');
}

function kb(bytes: number | null): string {
  if (!bytes) return '';
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** One attached handout. The URL is signed when it is opened, never stored. */
function FileRow({ file, canRemove, onRemove }: {
  file: live.LessonFile; canRemove: boolean; onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const url = await live.lessonFileUrl(file.path);
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
          } finally { setBusy(false); }
        }}
        className="font-semibold text-blue-700 underline underline-offset-2"
      >
        📎 {file.name}
      </button>
      <span className="text-xs text-gray-500">{kb(file.size_bytes)}</span>
      {canRemove && (
        <button type="button" onClick={onRemove} className="text-xs font-semibold text-red-700 underline">
          Remove
        </button>
      )}
    </li>
  );
}

/** One series, opened. `mine` only decides which controls show; the database enforces writes. */
/** Formatting tips for the study box, shown under it while writing. */
function WritingHints() {
  const Mark = ({ children }: { children: ReactNode }) => (
    <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] ring-1 ring-black/5">
      {children}
    </code>
  );
  // Advanced only: on Simple, what is typed is exactly what is shown.
  const mode = useWritingMode();
  if (mode !== 'advanced') return null;
  // Folded; opened on request.
  return (
    <details className="rounded-xl bg-gray-100 px-3 py-2 text-xs leading-relaxed text-gray-600">
      <summary className="cursor-pointer font-semibold text-gray-700">Formatting tips</summary>
      <ul className="mt-1 space-y-0.5">
        <li>
          <Mark>**Read:**</Mark> makes a bold opening, the way the sample studies
          head each section.
        </li>
        <li>
          <Mark>*The Desire of Ages*</Mark> slants a title.
        </li>
        <li>
          A web address becomes tappable on its own.{' '}
          <Mark>adventist.org/beliefs</Mark> is enough, with no https in front of it.
        </li>
      </ul>
    </details>
  );
}

/** Handouts on a form before the study exists; a drawing shows as its picture. */
function HeldFiles({ files, busy, onRemove, onReplace }: {
  files: File[];
  busy: boolean;
  onRemove: (at: number) => void;
  onReplace: (at: number, file: File) => void;
}) {
  if (!files.length) return null;
  return (
    <ul className="grid grid-cols-1 gap-2 text-sm">
      {files.map((f, at) => (
        <li key={`${f.name}-${at}`}>
          {isDrawingName(f.name) ? (
            <HeldDrawing file={f} busy={busy} onRemove={() => onRemove(at)} onReplace={(next) => onReplace(at, next)} />
          ) : (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 break-words font-semibold text-navy">📎 {f.name}</span>
              <span className="text-xs text-gray-500">{kb(f.size)}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(at)}
                className="tap-sm px-2 text-xs font-semibold text-red-700 underline"
              >
                Remove
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A drawing made on a form that is not saved yet: shown, changeable, removable. */
function HeldDrawing({ file, busy, onRemove, onReplace }: {
  file: File; busy: boolean; onRemove: () => void; onReplace: (next: File) => void;
}) {
  const src = useFileUrl(file);
  const [changing, setChanging] = useState(false);
  return (
    <>
      <DrawingPicture src={src} name={file.name}>
        <button type="button" disabled={busy} onClick={() => setChanging(true)} className="tap-sm font-semibold text-navy underline">
          Change drawing
        </button>
        <button type="button" disabled={busy} onClick={onRemove} className="tap-sm font-semibold text-red-700 underline">
          Remove
        </button>
      </DrawingPicture>
      {changing && (
        <DrawingBoard
          name={file.name}
          title={`Change ${drawingTitle(file.name)}`}
          initial={file}
          onClose={() => setChanging(false)}
          onSave={(next) => { onReplace(next); setChanging(false); }}
        />
      )}
    </>
  );
}

/**
 * A drawing on a saved study. Changing adds the new picture before removing
 * the old, so a failure leaves two, never none.
 */
function SavedDrawing({ file, canChange, busy, onReplace, onRemove }: {
  file: live.LessonFile;
  canChange: boolean;
  busy: boolean;
  onReplace?: (next: File) => Promise<void>;
  onRemove?: () => void;
}) {
  const [src, setSrc] = useState('');
  const [changing, setChanging] = useState<Blob | null>(null);
  const [trouble, setTrouble] = useState('');
  useEffect(() => {
    let current = true;
    live.lessonFileUrl(file.path).then((url) => { if (current) setSrc(url); }).catch(() => undefined);
    return () => { current = false; };
  }, [file.path]);
  const openToChange = async () => {
    setTrouble('');
    try {
      const res = await fetch(await live.lessonFileUrl(file.path));
      if (!res.ok) throw new Error(String(res.status));
      setChanging(await res.blob());
    } catch {
      setTrouble('The drawing could not be opened. Check the connection and try again.');
    }
  };
  return (
    <>
      <DrawingPicture src={src} name={file.name}>
        {src && (
          <button
            type="button"
            onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
            className="tap-sm font-semibold text-blue-700 underline"
          >
            Open full size
          </button>
        )}
        {canChange && (
          <>
            <button type="button" disabled={busy} onClick={() => void openToChange()} className="tap-sm font-semibold text-navy underline">
              Change drawing
            </button>
            <button type="button" disabled={busy} onClick={onRemove} className="tap-sm font-semibold text-red-700 underline">
              Remove
            </button>
          </>
        )}
      </DrawingPicture>
      {trouble && <p className="text-sm text-red-800">{trouble}</p>}
      {changing && (
        <DrawingBoard
          name={file.name}
          title={`Change ${drawingTitle(file.name)}`}
          initial={changing}
          onClose={() => setChanging(null)}
          onSave={async (next) => { await onReplace?.(next); setChanging(null); }}
        />
      )}
    </>
  );
}

function SeriesBody({ series, mine, ownSeries }: {
  series: live.LessonSeries;
  mine: boolean;
  /** Written by this person, so deleting a study really deletes it. */
  ownSeries: boolean;
}) {
  const [lessons, setLessons] = useState<live.Lesson[] | null>(null);
  const [files, setFiles] = useState<Record<string, live.LessonFile[]>>({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // The study being edited; one at a time.
  const [editing, setEditing] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Which study is asking "are you sure" before it is deleted.
  const [confirmDelete, setConfirmDelete] = useState('');
  // The new-study form is closed until asked for.
  const [adding, setAdding] = useState(false);
  // Handouts dropped onto the new study, sent once the study exists.
  const [newFiles, setNewFiles] = useState<File[]>([]);
  // My own reads only; the database refuses a read row for anyone else.
  const [reads, setReads] = useState<Set<string>>(new Set());
  const { profile } = useLiveSession();

  // Files over the limit are refused by name when dropped.
  const addNewFiles = (picked: File[]) => {
    const tooBig = picked.filter((f) => f.size > live.MAX_RESOURCE_FILE);
    setError(tooBig.length
      ? `${tooBig.map((f) => `\u201c${f.name}\u201d`).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} over 10 MB. Share a link to it instead.`
      : '');
    setNewFiles((was) => [...was, ...picked.filter((f) => f.size <= live.MAX_RESOURCE_FILE)]);
  };

  const load = useCallback(async () => {
    try {
      const rows = await live.listLessons(series.id);
      setLessons(rows);
      setFiles(await live.listLessonFiles(rows.map((l) => l.id)));
      setReads(new Set(await live.listMyReads()));
      setError('');
    } catch (cause) { setLessons([]); setError(message(cause)); }
  }, [series.id]);
  useEffect(() => { void load(); }, [load]);
  useKeepUp(KEEP_UP_STUDIES, load);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 border-t border-black/5 pt-3">
      {error && <p className="mb-2 rounded-xl bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {lessons !== null && lessons.length === 0 && (
        <p className="text-sm text-gray-500">
          {mine ? 'No studies in here yet. Tap + Add a study to write the first one.' : 'Nothing in here yet.'}
        </p>
      )}

      {/* My progress through this series: the same numbers the Director sees. */}
      {lessons !== null && lessons.length > 0 && (
        <div className="mb-3">
          <ReadingBar
            done={lessons.filter((l) => reads.has(l.id)).length}
            total={lessons.length}
            label="You have read"
          />
        </div>
      )}

      <ol className="space-y-3">
        {lessons?.map((lesson, i) => (
          <li key={lesson.id} className="rounded-xl bg-white p-3 ring-1 ring-black/5">
            {editing !== lesson.id ? (
              <>
                <p className="font-semibold text-navy">{i + 1}. {lesson.title}</p>
                {lesson.body && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                    <Rich text={lesson.body} />
                  </p>
                )}
                {/* A drawing is shown as a picture; a handout is a line to open. */}
                {(files[lesson.id] ?? []).filter((f) => isDrawingName(f.name)).map((f) => (
                  <div key={f.id} className="mt-2">
                    <SavedDrawing file={f} canChange={false} busy={busy} />
                  </div>
                ))}
                {(files[lesson.id] ?? []).some((f) => !isDrawingName(f.name)) && (
                  <ul className="mt-2 space-y-1">
                    {files[lesson.id].filter((f) => !isDrawingName(f.name)).map((f) => (
                      <FileRow
                        key={f.id}
                        file={f}
                        canRemove={false}
                        onRemove={() => undefined}
                      />
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {/* Reading is marked by a button, never by scrolling past. */}
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={reads.has(lesson.id)}
                    onClick={() => act(() => (reads.has(lesson.id)
                      ? live.unmarkLessonRead(lesson.id)
                      : live.markLessonRead(lesson.id)))}
                    className={`tap-sm rounded-full px-3 text-sm font-semibold transition-colors ${
                      reads.has(lesson.id)
                        ? 'bg-green-100 text-green-800 ring-1 ring-green-200'
                        : 'bg-slate-100 text-gray-600 ring-1 ring-black/5 hover:bg-slate-200'
                    }`}
                  >
                    {reads.has(lesson.id) ? '✓ Read' : 'Mark as read'}
                  </button>
                  {/* One Edit control per study; everything else, including delete, is inside it. */}
                  {mine && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(lesson.id);
                        setEditTitle(lesson.title);
                        setEditBody(lesson.body ?? '');
                        setConfirmDelete('');
                      }}
                      className="tap-sm text-sm font-semibold text-navy underline"
                    >
                      Edit this study
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* Edit in place with the handouts visible. The whole card accepts dropped files. */
              <DropArea
                busy={busy}
                label="Drop to add to this study"
                className="grid grid-cols-1 gap-2 rounded-xl"
                onFiles={(picked) => void act(async () => {
                  for (const file of picked) await live.attachLessonFile(lesson.id, file);
                })}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-navy">Editing this study</p>
                  <WritingModeSwitch />
                </div>
                <label className="text-xs font-semibold text-navy" htmlFor={`study-title-${lesson.id}`}>Title</label>
                <input
                  id={`study-title-${lesson.id}`}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title of this study"
                  className="tap w-full min-w-0 rounded-xl bg-slate-50 px-3 font-semibold ring-1 ring-navy/10"
                />
                <label className="text-xs font-semibold text-navy" htmlFor={`study-body-${lesson.id}`}>The study</label>
                <textarea
                  id={`study-body-${lesson.id}`}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={6}
                  placeholder="Write the study here."
                  className="w-full min-w-0 rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-navy/10"
                />
                <WritingHints />
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    disabled={busy || !editTitle.trim()}
                    onClick={() => act(async () => {
                      await live.updateLesson(lesson.id, { title: editTitle, body: editBody });
                      setEditing('');
                    })}
                  >
                    {busy ? 'Saving…' : 'Save changes'}
                  </Button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing('')}
                    className="tap-sm text-sm font-semibold text-gray-600 underline"
                  >
                    Cancel
                  </button>
                </div>

                <div className="mt-2 border-t border-black/5 pt-2">
                  <p className="text-xs font-semibold text-gray-600">Handouts and drawings</p>
                  {(files[lesson.id] ?? []).filter((f) => isDrawingName(f.name)).map((f) => (
                    <div key={f.id} className="mt-2">
                      <SavedDrawing
                        file={f}
                        busy={busy}
                        canChange={f.added_by === profile?.id}
                        onRemove={() => void act(() => live.removeLessonFile(f.id))}
                        onReplace={(next) => act(async () => {
                          await live.attachLessonFile(lesson.id, next);
                          await live.removeLessonFile(f.id);
                        })}
                      />
                    </div>
                  ))}
                  {(files[lesson.id] ?? []).some((f) => !isDrawingName(f.name)) && (
                    <ul className="mt-1 space-y-1">
                      {files[lesson.id].filter((f) => !isDrawingName(f.name)).map((f) => (
                        <FileRow
                          key={f.id}
                          file={f}
                          canRemove={f.added_by === profile?.id}
                          onRemove={() => void act(() => live.removeLessonFile(f.id))}
                        />
                      ))}
                    </ul>
                  )}
                  {/* Drag handouts in, or choose several at once. */}
                  <div className="mt-2">
                    <FileDrop
                      compact
                      busy={busy}
                      title="Add handouts"
                      hint="Drag files here, or anywhere on this study, or choose them. Up to 10 MB each."
                      onFiles={(picked) => void act(async () => {
                        for (const file of picked) await live.attachLessonFile(lesson.id, file);
                      })}
                    />
                  </div>
                  {/* Draw a picture straight onto the study. */}
                  <div className="mt-2">
                    <DrawButton
                      busy={busy}
                      title={`Drawing for ${editTitle.trim() || lesson.title}`}
                      existing={(files[lesson.id] ?? []).map((f) => f.name)}
                      onDrawn={(file) => act(() => live.attachLessonFile(lesson.id, file))}
                    />
                  </div>
                </div>

                {/* Delete last, in red, and it asks first. */}
                <div className="mt-2 border-t border-black/5 pt-2">
                  {confirmDelete === lesson.id ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="w-full text-sm font-semibold text-gray-700">
                        {ownSeries
                          ? `Delete “${lesson.title}”? It goes for everybody who can see this series.`
                          : `Delete “${lesson.title}” from your copy? Everybody else keeps it.`}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(async () => {
                          await live.deleteLesson(lesson.id);
                          setEditing(''); setConfirmDelete('');
                        })}
                        className="tap-sm rounded-full bg-white px-3 text-sm font-bold text-red-700 ring-1 ring-red-200"
                      >
                        Yes, delete it
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete('')}
                        className="tap-sm text-sm font-semibold text-gray-600 underline"
                      >
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(lesson.id)}
                      className="tap-sm text-sm font-semibold text-red-700 underline"
                    >
                      Delete study
                    </button>
                  )}
                </div>
              </DropArea>
            )}
          </li>
        ))}
      </ol>

      {mine && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="tap-sm mt-3 rounded-full px-4 text-sm font-bold text-navy ring-1 ring-navy/20"
        >
          + Add a study
        </button>
      )}
      {mine && adding && (
        <DropArea
          busy={busy}
          label="Drop to add to this study"
          className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-gray-50 p-3"
          onFiles={(picked) => addNewFiles(picked)}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-navy">New study</p>
            <WritingModeSwitch />
          </div>
          <label className="text-xs font-semibold text-navy" htmlFor={`new-study-title-${series.id}`}>Title</label>
          <input
            id={`new-study-title-${series.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title of this study"
            className="tap w-full min-w-0 rounded-xl bg-white px-3 ring-1 ring-navy/10"
          />
          <label className="text-xs font-semibold text-navy" htmlFor={`new-study-body-${series.id}`}>The study</label>
          <textarea
            id={`new-study-body-${series.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Write the study here."
            className="w-full min-w-0 rounded-xl bg-white px-3 py-2 ring-1 ring-navy/10"
          />
          <WritingHints />
          <FileDrop
            compact
            busy={busy}
            title="Handouts"
            hint="Drag files here, or anywhere on this study, or choose them. Up to 10 MB each."
            onFiles={(picked) => addNewFiles(picked)}
          />
          <DrawButton
            busy={busy}
            title={`Drawing for ${title.trim() || 'this study'}`}
            existing={newFiles.map((f) => f.name)}
            onDrawn={(file) => setNewFiles((was) => [...was, file])}
          />
          <HeldFiles
            files={newFiles}
            busy={busy}
            onRemove={(at) => setNewFiles((was) => was.filter((_, x) => x !== at))}
            onReplace={(at, next) => setNewFiles((was) => was.map((f, x) => (x === at ? next : f)))}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || !title.trim()}
              onClick={() => act(async () => {
                const id = await live.addLesson(series.id, {
                  title, body, position: (lessons?.length ?? 0) + 1,
                });
                // Close the form before sending handouts, so a failed file cannot cause a second save.
                const handouts = newFiles;
                setTitle(''); setBody(''); setNewFiles([]); setAdding(false);
                for (const f of handouts) await live.attachLessonFile(id, f);
              })}
            >
              {busy ? 'Saving…' : 'Add this study'}
            </Button>
            <button
              type="button"
              onClick={() => { setAdding(false); setTitle(''); setBody(''); setNewFiles([]); }}
              className="tap-sm text-sm font-semibold text-gray-600 underline"
            >
              Cancel
            </button>
          </div>
        </DropArea>
      )}
    </div>
  );
}

/** One study on the new-series form, before anything is saved. */
type DraftStudy = { key: string; title: string; body: string; files: File[] };
const blankStudy = (): DraftStudy => ({ key: uuid(), title: '', body: '', files: [] });

/**
 * A new series in one form: its name, its studies and their handouts, then
 * Save. Topic and subtitle appear on Advanced only. Saved in order (series,
 * each study, its files) and shared only once all of it is saved, so a failure
 * leaves a private draft.
 */
function NewSeries({ onSaved, onCancel }: {
  /** The series now exists: open it, and say what happened (or what did not). */
  onSaved: (id: string, said: { flash?: string; error?: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [desc, setDesc] = useState('');
  const [studies, setStudies] = useState<DraftStudy[]>([blankStudy()]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const advanced = useWritingMode() === 'advanced';
  const [error, setError] = useState('');

  const change = (key: string, patch: Partial<DraftStudy>) =>
    setStudies((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  // Files over the limit are refused by name when dropped.
  const addFiles = (key: string, files: File[]) => {
    const tooBig = files.filter((f) => f.size > live.MAX_RESOURCE_FILE);
    setError(tooBig.length
      ? `${tooBig.map((f) => `“${f.name}”`).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} over 10 MB. Share a link to it instead.`
      : '');
    const fits = files.filter((f) => f.size <= live.MAX_RESOURCE_FILE);
    setStudies((list) => list.map((s) => (s.key === key ? { ...s, files: [...s.files, ...fits] } : s)));
  };

  const save = async (share: boolean) => {
    if (!title.trim() || busy) return;
    setBusy(true); setError('');
    let id = '';
    const written = studies.filter((s) => s.title.trim() || s.body.trim() || s.files.length);
    try {
      setProgress('Saving the series…');
      id = await live.addLessonSeries({ title, topic, description: desc });
      for (let i = 0; i < written.length; i++) {
        const s = written[i];
        setProgress(`Saving study ${i + 1} of ${written.length}…`);
        // An untitled study is named by its place in the series.
        const lessonId = await live.addLesson(id, {
          title: s.title.trim() || `Study ${i + 1}`, body: s.body, position: i + 1,
        });
        for (const f of s.files) {
          setProgress(`Adding “${f.name}”…`);
          await live.attachLessonFile(lessonId, f);
        }
      }
      if (share) await live.setSeriesPublished(id, true);
      onSaved(id, {
        flash: share
          ? `“${title.trim()}” is shared with the church.`
          : `“${title.trim()}” is saved as a draft. Only you can see it until you share it.`,
      });
    } catch (cause) {
      // Keep whatever was saved as a draft and open it.
      if (id) onSaved(id, { error: `Saved as a draft so far, but not all of it: ${message(cause)}` });
      else setError(message(cause));
    } finally {
      setBusy(false); setProgress('');
    }
  };

  return (
    <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-extrabold text-navy">New series</p>
          <WritingModeSwitch />
        </div>
        <WritingModeNote />
      </div>
      <div>
        <label className="text-sm font-semibold text-navy" htmlFor="new-series-title">Name of the series</label>
        <input
          id="new-series-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New series title"
          className="tap mt-1 w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      {/* Topic and subtitle, on Advanced only. Empty topic means General. */}
      {advanced && (
        <div className="grid gap-2 rounded-xl bg-white p-3 ring-1 ring-navy/5">
          <label className="text-sm font-semibold text-navy" htmlFor="new-series-topic">
            Topic <span className="font-normal text-gray-500">(optional, groups it on the shelf)</span>
          </label>
          <input
            id="new-series-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            list="series-topics"
            placeholder="e.g. Prayer"
            className="tap w-full min-w-0 rounded-xl bg-slate-50 px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
          />
          <label className="text-sm font-semibold text-navy" htmlFor="new-series-desc">
            One line about it <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="new-series-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Shown under the name"
            className="tap w-full min-w-0 rounded-xl bg-slate-50 px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      )}

      {/* The studies are written here, in the same form. */}
      <ol className="grid grid-cols-1 gap-3">
        {studies.map((s, i) => (
          <li key={s.key}>
           <DropArea
            busy={busy}
            label={`Drop to add to Study ${i + 1}`}
            className="grid grid-cols-1 gap-2 rounded-xl bg-white p-3 ring-1 ring-black/5"
            onFiles={(files) => addFiles(s.key, files)}
           >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-navy">Study {i + 1}</p>
              {studies.length > 1 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStudies((list) => list.filter((x) => x.key !== s.key))}
                  className="tap-sm text-sm font-semibold text-red-700 underline"
                >
                  Remove
                </button>
              )}
            </div>
            <label className="text-xs font-semibold text-navy" htmlFor={`draft-title-${s.key}`}>Title</label>
            <input
              id={`draft-title-${s.key}`}
              value={s.title}
              onChange={(e) => change(s.key, { title: e.target.value })}
              placeholder={`Study ${i + 1}`}
              className="tap w-full min-w-0 rounded-xl bg-slate-50 px-3 ring-1 ring-navy/10"
            />
            <label className="text-xs font-semibold text-navy" htmlFor={`draft-body-${s.key}`}>The study</label>
            <textarea
              id={`draft-body-${s.key}`}
              value={s.body}
              onChange={(e) => change(s.key, { body: e.target.value })}
              rows={5}
              placeholder="Write the study here."
              className="w-full min-w-0 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-navy/10"
            />
            <WritingHints />
            <FileDrop
              compact
              busy={busy}
              title="Handouts"
              hint="Drag files here, or anywhere on this study, or choose them. Up to 10 MB each."
              onFiles={(files) => addFiles(s.key, files)}
            />
            <DrawButton
              busy={busy}
              title={`Drawing for ${s.title.trim() || `Study ${i + 1}`}`}
              existing={s.files.map((f) => f.name)}
              onDrawn={(file) => setStudies((list) => list.map((x) => (x.key === s.key ? { ...x, files: [...x.files, file] } : x)))}
            />
            <HeldFiles
              files={s.files}
              busy={busy}
              onRemove={(at) => setStudies((list) => list.map((x) => (x.key === s.key ? { ...x, files: x.files.filter((_, n) => n !== at) } : x)))}
              onReplace={(at, next) => setStudies((list) => list.map((x) => (x.key === s.key ? { ...x, files: x.files.map((f, n) => (n === at ? next : f)) } : x)))}
            />
           </DropArea>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={busy}
        onClick={() => setStudies((list) => [...list, blankStudy()])}
        className="tap-sm justify-self-start rounded-full px-4 text-sm font-bold text-navy ring-1 ring-navy/20"
      >
        + Add another study
      </button>

      {/* grid-cols-1 makes long file names truncate instead of widening the form. */}

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}
      {progress && <p className="text-sm font-semibold text-gray-600" aria-live="polite">{progress}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {/* Short enough to fit a phone-sized button. */}
        <Button disabled={busy || !title.trim()} onClick={() => void save(true)}>
          Save and share
        </Button>
        <Button variant="ghost" disabled={busy || !title.trim()} onClick={() => void save(false)}>
          Save as a draft
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="tap-sm text-sm font-semibold text-gray-600 underline"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Sharing puts it on the church&rsquo;s shelf for everyone. A draft is only yours to see.
        Either way you can add, change or delete studies at any time.
      </p>
    </div>
  );
}

export function LiveStudies({ openSeries = '', readOnly = false, note }: {
  openSeries?: string;
  /** Hide every writing control on a screen meant for reading. It can only take controls away. */
  readOnly?: boolean;
  /** A line under the heading, for a screen that wants to point somewhere. */
  note?: ReactNode;
}) {
  const { profile } = useLiveSession();
  // The role decides who may write (matching may_write_studies()); readOnly can only take away.
  const canWrite = canWriteStudies(profile?.role) && !readOnly;
  const advancedWriting = useWritingMode() === 'advanced';
  const [rows, setRows] = useState<live.LessonSeries[] | null>(null);
  // Arriving from "Read next" opens that series.
  const [open, setOpen] = useState(openSeries);
  useEffect(() => { if (openSeries) setOpen(openSeries); }, [openSeries]);
  // The new-series form is closed until asked for.
  const [creating, setCreating] = useState(false);
  const [flash, setFlash] = useState('');
  // The series being renamed; one at a time.
  const [renaming, setRenaming] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDesc, setNewDesc] = useState('');
  // The series asking for confirmation before it is deleted.
  const [confirming, setConfirming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listLessonSeries()); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useKeepUp(KEEP_UP_STUDIES, load);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const byTopic = (rows ?? []).reduce<Record<string, live.LessonSeries[]>>((acc, s) => {
    (acc[s.topic || 'General'] ??= []).push(s); return acc;
  }, {});
  // Existing topics are offered as suggestions, so one group is not typed three ways.
  const topics = Object.keys(byTopic);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-800/10 wash-sky-teal p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-700 text-xl shadow-sm">📖</span>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-navy">Lesson studies</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-gray-600">
              {note ?? (canWrite
                ? 'Open a series to read it. Start your own with + New series.'
                : 'Open a series to read it, and tick each study as you go.')}
            </p>
          </div>
        </div>
        {canWrite && !creating && (
          <Button onClick={() => { setCreating(true); setFlash(''); }}>+ New series</Button>
        )}
      </div>
      <div className="p-5 sm:p-6">

      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}

      {flash && <p className="mb-3 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{flash}</p>}
      {canWrite && creating && (
        <NewSeries
          onCancel={() => setCreating(false)}
          onSaved={(id, said) => {
            setCreating(false);
            setOpen(id);
            setFlash(said.flash ?? '');
            setError(said.error ?? '');
            void load();
          }}
        />
      )}
      <datalist id="series-topics">
        {topics.map((t) => <option key={t} value={t} />)}
      </datalist>

      <div className="space-y-4">
        {rows === null && <p className="text-sm text-gray-500">Loading…</p>}
        {rows?.length === 0 && (
          <p className="text-sm text-gray-500">
            {canWrite ? 'No series yet. Tap + New series to write the first one.' : 'No studies yet.'}
          </p>
        )}
        {Object.entries(byTopic).map(([t, list]) => (
          <div key={t}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-teal-700">{t}</h3>
            <div className="mt-2 space-y-2">
              {list.map((s) => {
                // Who may write. A Guide editing a church sample gets their own copy
                // (lib/live/data.ts). A convenience only; the database refuses anyone else.
                const mine = canWriteStudies(profile?.role) && !readOnly;
                // Publishing puts a study on everybody's shelf, so it stays with the author.
                const canPublish = !!profile && !readOnly && (
                  s.author_id === profile.id
                  || profile.role === 'admin'
                  || profile.role === 'executive'
                );
                const ownSeries = !!profile && s.author_id === profile.id;
                const opened = open === s.id;
                return (
                  <div key={s.id} className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-navy/5">
                    {/* The whole row opens the series; its controls are inside. */}
                    <button
                      type="button"
                      onClick={() => { setOpen(opened ? '' : s.id); setConfirming(''); setRenaming(''); }}
                      aria-expanded={opened}
                      className="flex w-full items-start gap-2 text-left"
                    >
                      <span aria-hidden className="mt-1 text-xs text-gray-400">{opened ? '▾' : '▸'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-navy">{s.title}</span>
                        {s.description && (
                          <span className="block text-sm leading-snug text-gray-500">
                            <Rich text={s.description} />
                          </span>
                        )}
                      </span>
                      {!s.is_published && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                          Draft
                        </span>
                      )}
                    </button>
                    {opened && !s.is_published && (
                      <p className="mt-1 pl-5 text-xs text-amber-800">A draft: only you can see it.</p>
                    )}
                    {opened && <SeriesBody series={s} mine={mine} ownSeries={ownSeries} />}

                    {/* Managing the series comes after its studies. */}
                    {opened && mine && (
                      <div className="mt-4 border-t border-black/5 pt-3">
                        {renaming === s.id ? (
                          <div className="grid gap-2 rounded-xl bg-white p-3 ring-1 ring-navy/10">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-bold text-navy">This series</p>
                              <WritingModeSwitch />
                            </div>
                            <label className="text-xs font-semibold text-navy" htmlFor={`series-title-${s.id}`}>Name</label>
                            <input
                              id={`series-title-${s.id}`}
                              value={newTitle}
                              onChange={(e) => setNewTitle(e.target.value)}
                              placeholder="Series title"
                              className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
                            />
                            {/* Topic and subtitle, on Advanced only. */}
                            {advancedWriting && (
                              <>
                              <label className="text-xs font-semibold text-navy" htmlFor={`series-topic-${s.id}`}>
                                Topic <span className="font-normal text-gray-500">(groups it on the shelf)</span>
                              </label>
                              <input
                                id={`series-topic-${s.id}`}
                                value={newTopic}
                                onChange={(e) => setNewTopic(e.target.value)}
                                list="series-topics"
                                placeholder="e.g. Prayer"
                                className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
                              />
                              <label className="text-xs font-semibold text-navy" htmlFor={`series-desc-${s.id}`}>One line about it</label>
                              <input
                                id={`series-desc-${s.id}`}
                                value={newDesc}
                                onChange={(e) => setNewDesc(e.target.value)}
                                placeholder="Shown under the name"
                                className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
                              />
                              </>
                            )}
                            <div className="flex items-center gap-3">
                              <Button
                                disabled={busy || !newTitle.trim()}
                                onClick={() => act(async () => {
                                  await live.updateLessonSeries(s.id, {
                                    title: newTitle, topic: newTopic, description: newDesc,
                                  });
                                  setRenaming('');
                                })}
                              >
                                {busy ? 'Saving…' : 'Save'}
                              </Button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setRenaming('')}
                                className="tap-sm text-sm font-semibold text-gray-600 underline"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : confirming === s.id ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="w-full text-sm font-semibold text-gray-700">
                              {ownSeries
                                ? `Delete “${s.title}” and every study in it? If the church can see it, it goes for everybody.`
                                : `Take “${s.title}” off your shelf? Everybody else keeps it.`}
                            </p>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void act(async () => {
                                await live.deleteLessonSeries(s.id);
                                setConfirming(''); setOpen('');
                              })}
                              className="tap-sm rounded-full bg-white px-3 text-sm font-bold text-red-700 ring-1 ring-red-200"
                            >
                              {ownSeries ? 'Yes, delete it' : 'Yes, take it off'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming('')}
                              className="tap-sm text-sm font-semibold text-gray-600 underline"
                            >
                              Keep it
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setRenaming(s.id);
                                setNewTitle(s.title);
                                setNewTopic(s.topic || '');
                                setNewDesc(s.description || '');
                              }}
                              className="tap-sm text-sm font-semibold text-navy underline"
                            >
                              Rename
                            </button>
                            {canPublish && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void act(() => live.setSeriesPublished(s.id, !s.is_published))}
                                className="tap-sm text-sm font-semibold text-navy underline"
                              >
                                {s.is_published ? 'Hide from the church' : 'Share with the church'}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirming(s.id)}
                              className="tap-sm text-sm font-semibold text-red-700 underline"
                            >
                              {ownSeries ? 'Delete series' : 'Take off my shelf'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      </div>
    </Card>
  );
}
