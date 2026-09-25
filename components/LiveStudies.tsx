'use client';

// Lesson studies a Guide writes, and an Explorer opens.
//
// WHAT WAS THERE BEFORE. A flat list of series titles and nothing else. No
// lessons inside them, no files, nothing to click. A Guide could not write one
// at all: the database policy on lesson_series was manages_church(church_id),
// so only a Director could, and the person actually sitting with somebody week
// by week could only look at a list.
//
// WHAT IT IS NOW. A Guide writes a series, adds studies to it, attaches the
// handouts they already use, and publishes it. Anybody in the church can open
// it and read the studies and the files. Directors keep the same power over
// everything, which is what manages_church still means.
//
// A DRAFT IS VISIBLE TO ITS AUTHOR ONLY, which sounds obvious and is the thing
// the old read policy got wrong: is_published alone meant a Guide could not see
// what they had just written until they published it, which makes writing it
// impossible.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';
import { Rich } from '@/components/Rich';
import { humanError } from '@/lib/live/errors';
import { ATTACHMENT_ACCEPT } from '@/lib/live/attachments';
import { useKeepUp, KEEP_UP_STUDIES } from '@/lib/live/keep-up';
import { ReadingBar } from '@/components/live/ReadingProgress';
import type { Role } from '@/lib/types';

/**
 * Who may write teaching material.
 *
 * Guides, Directors and Executive Directors. An Explorer reads every published
 * study in their church and everything their Guide shares, and writes none of
 * it -- the owner's decision, and the right shape: a study is something
 * prepared for somebody, and the person it is prepared for is not preparing it.
 *
 * THE SAME SENTENCE AS THE DATABASE. `public.may_write_studies()` in migration
 * `an_explorer_reads_the_studies` is the one that actually refuses. This exists
 * so nobody is shown a button that would be refused, and the two are checked
 * against each other by tests/an-explorer-reads-the-studies.mjs -- because two
 * copies of a rule are two things to change and one to forget.
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
      <span className="text-xs text-gray-400">{kb(file.size_bytes)}</span>
      {canRemove && (
        <button type="button" onClick={onRemove} className="text-xs font-semibold text-red-700 underline">
          Remove
        </button>
      )}
    </li>
  );
}

/**
 * One series, opened.
 *
 * `mine` decides whether the writing controls appear. It is a convenience, not
 * a control: the database refuses a write from anybody else regardless of what
 * this component draws.
 */
/**
 * What a Guide can actually do in that box, said where they are standing.
 *
 * THE SECOND HALF OF THE ASK, and the half that decides whether the first one
 * matters: "Make sure those who are making those Lesson studies (such as
 * guides) are aware of this functions."
 *
 * The box used to promise one thing in its placeholder text -- "Links become
 * clickable" -- which vanishes the moment somebody starts typing, and said
 * nothing at all about the bold and italic marks that fifteen of the sixteen
 * studies on the shelf were already using. Somebody was formatting their
 * studies and being shown asterisks, with no way to learn from the app whether
 * that was their mistake or its own.
 *
 * Under the box rather than inside it, so it is still there while they write.
 */
function WritingHints() {
  const Mark = ({ children }: { children: ReactNode }) => (
    <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] ring-1 ring-black/5">
      {children}
    </code>
  );
  return (
    <div className="rounded-xl bg-gray-100 px-3 py-2 text-xs leading-relaxed text-gray-600">
      <p className="font-semibold text-gray-700">Three things you can do here</p>
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
    </div>
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
  // Which study is open for editing, and the words as they are being changed.
  // One at a time on purpose: a phone has no room for two open editors, and
  // "which of these am I saving" is not a question worth creating.
  const [editing, setEditing] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Which study is asking "are you sure" before it is deleted.
  const [confirmDelete, setConfirmDelete] = useState('');
  // The new-study form is shut until somebody asks for it: a series you are
  // READING should read like one, not open on an empty form.
  const [adding, setAdding] = useState(false);
  // WHICH OF THESE I HAVE READ. Mine alone: the database refuses a read row
  // written for anybody else, so this never holds somebody else's answer.
  const [reads, setReads] = useState<Set<string>>(new Set());
  const { profile } = useLiveSession();

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
  // The screen keeps up when somebody else changes something.
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
        <p className="text-sm text-gray-400">
          {mine ? 'No studies in here yet. Tap + Add a study to write the first one.' : 'Nothing in here yet.'}
        </p>
      )}

      {/* MY OWN PROGRESS THROUGH THIS SERIES. Drawn from the same two numbers
          the Director sees, so nobody is ever looking at a different figure. */}
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
                {(files[lesson.id] ?? []).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {files[lesson.id].map((f) => (
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
                  {/* A BUTTON, NOT A SIDE EFFECT OF SCROLLING. Every lesson in an
                      open series is on screen at once, so marking one read
                      because it rendered would record the whole series on a
                      single tap and hand a Director a number that measures
                      nothing. The person says so themselves. */}
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
                  {/* ONE WRITING CONTROL ON A STUDY, NOT THREE. Edit, attach and
                      delete sat under every study all the time, so a series read
                      like a form. Everything a writer does to one study happens
                      inside Edit -- including the destructive control, which is
                      therefore never the first thing a thumb finds. */}
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
              /* EDITING IN PLACE, NOT ON ANOTHER SCREEN. The handouts stay
                 visible while the words are being changed, because the study
                 and the sheet that goes with it are one thing to the person
                 teaching from them. */
              <div className="grid gap-2">
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
                  <p className="text-xs font-semibold text-gray-600">Handouts</p>
                  {(files[lesson.id] ?? []).length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {files[lesson.id].map((f) => (
                        <FileRow
                          key={f.id}
                          file={f}
                          canRemove={f.added_by === profile?.id}
                          onRemove={() => void act(() => live.removeLessonFile(f.id))}
                        />
                      ))}
                    </ul>
                  )}
                  <label className="tap-sm mt-1 inline-flex cursor-pointer items-center text-sm font-semibold text-navy underline">
                    Attach a file
                    <input
                      type="file"
                      // Same list as the conversation picker and the bucket.
                      // See lib/live/attachments.ts.
                      accept={ATTACHMENT_ACCEPT}
                      className="hidden"
                      disabled={busy}
                      onChange={(event) => {
                        const input = event.target;
                        const file = input.files?.[0];
                        if (!file) return;
                        // The reset comes AFTER the upload. Clearing the input
                        // first aborts the read on WebKit, which fails silently
                        // and looks like a broken button on every iPhone.
                        void act(async () => {
                          try { await live.attachLessonFile(lesson.id, file); }
                          finally { input.value = ''; }
                        });
                      }}
                    />
                  </label>
                </div>

                {/* LAST, RED, AND IT ASKS FIRST. Deleting a study was one tap on
                    a red word beside Edit; nothing asked. */}
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
              </div>
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
        <div className="mt-3 grid gap-2 rounded-xl bg-gray-50 p-3">
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
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || !title.trim()}
              onClick={() => act(async () => {
                await live.addLesson(series.id, {
                  title, body, position: (lessons?.length ?? 0) + 1,
                });
                setTitle(''); setBody(''); setAdding(false);
              })}
            >
              {busy ? 'Saving…' : 'Add this study'}
            </Button>
            <button
              type="button"
              onClick={() => { setAdding(false); setTitle(''); setBody(''); }}
              className="tap-sm text-sm font-semibold text-gray-600 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveStudies({ openSeries = '', readOnly = false, note }: {
  openSeries?: string;
  /**
   * READING, NOT WRITING, on a screen whose job is something else. A Guide on
   * one Explorer's Lessons tab is there to see what that person can read and
   * how far they have got; the whole writing desk -- new series, rename,
   * publish, delete -- sat on top of that and made it look like the Office.
   * This only REMOVES controls. It can never grant one: the role decides that,
   * below, and the database decides it for real.
   */
  readOnly?: boolean;
  /** A line under the heading, for a screen that wants to point somewhere. */
  note?: ReactNode;
}) {
  const { profile } = useLiveSession();
  // THE ROLE DECIDES, NOT THE CALLER. This was a `canWrite` prop each screen
  // passed by hand, and the four call sites had already drifted: the Guide's
  // own studies tab passed nothing, so a Guide -- somebody whose job is
  // preparing studies -- could not start one. Meanwhile a screen could pass
  // `canWrite` for an Explorer and hand them a form the database would refuse.
  //
  // One rule, read from the profile, matching `may_write_studies()` in the
  // database. A prop that four callers guess at is four chances to get a
  // permission wrong. `readOnly` can only take away.
  const canWrite = canWriteStudies(profile?.role) && !readOnly;
  const [rows, setRows] = useState<live.LessonSeries[] | null>(null);
  // ARRIVING FROM "READ NEXT" OPENS THE RIGHT SERIES. Without this the card
  // would name a study and then drop somebody on a shelf of closed folders to
  // find it again, which is most of the way back to the problem it solves.
  const [open, setOpen] = useState(openSeries);
  useEffect(() => { if (openSeries) setOpen(openSeries); }, [openSeries]);
  // THE NEW-SERIES FORM IS SHUT UNTIL ASKED FOR. It was three empty boxes at
  // the top of the card on every visit, above the studies people came to read,
  // for the one day in a month somebody starts a series.
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  // THE LINE UNDER THE TITLE, which no form ever asked for until it did:
  // `lesson_series.description` has existed since the table was created, and a
  // Guide writing their own series could not give it one. The TOPIC is the
  // grouping, drawn as the heading above the series, which is why it says so.
  const [desc, setDesc] = useState('');
  // Which series is being renamed. Same one-at-a-time rule as the studies
  // inside them.
  const [renaming, setRenaming] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDesc, setNewDesc] = useState('');
  // Which series is asking "are you sure" before it goes. Deleting a series --
  // and every study in it -- was ONE TAP on a red word sitting beside Rename.
  const [confirming, setConfirming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listLessonSeries()); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
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
  // The topics already in use, offered as suggestions, so the same group is
  // not typed three ways ("Prayer", "prayer", "Prayers").
  const topics = Object.keys(byTopic);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-800/10 bg-gradient-to-r from-sky-50 via-white to-teal-50 p-5 sm:p-6">
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
          <Button onClick={() => setCreating(true)}>+ New series</Button>
        )}
      </div>
      <div className="p-5 sm:p-6">

      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}

      {canWrite && creating && (
        <div className="mb-5 grid gap-2 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
          <label className="text-sm font-semibold text-navy" htmlFor="new-series-title">Name</label>
          <input
            id="new-series-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New series title"
            aria-label="New series title"
            className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
          />
          <label className="mt-1 text-sm font-semibold text-navy" htmlFor="new-series-topic">
            Topic <span className="font-normal text-gray-500">(optional, groups it on the shelf)</span>
          </label>
          <input
            id="new-series-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            list="series-topics"
            placeholder="e.g. Prayer"
            className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
          />
          <label className="mt-1 text-sm font-semibold text-navy" htmlFor="new-series-desc">
            One line about it <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="new-series-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Shown under the name"
            className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || !title.trim()}
              onClick={() => act(async () => {
                const id = await live.addLessonSeries({ title, topic, description: desc });
                setTitle(''); setTopic(''); setDesc('');
                setCreating(false);
                setOpen(id);
              })}
            >
              Create series
            </Button>
            <button
              type="button"
              onClick={() => { setCreating(false); setTitle(''); setTopic(''); setDesc(''); }}
              className="tap-sm text-sm font-semibold text-gray-600 underline"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-500">It starts as a draft only you can see. Share it with the church when it is ready.</p>
        </div>
      )}
      <datalist id="series-topics">
        {topics.map((t) => <option key={t} value={t} />)}
      </datalist>

      <div className="space-y-4">
        {rows === null && <p className="text-sm text-gray-400">Loading…</p>}
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
                // WHO MAY WRITE. Guides, Directors and Executive Directors, and
                // a Guide correcting a church sample gets their OWN copy rather
                // than rewriting it for the other forty Guides (the copy is made
                // in lib/live/data.ts). An Explorer reads; they do not write.
                //
                // NOT THE BOUNDARY. `an_explorer_reads_the_studies` is what
                // actually refuses, and it refuses a request that never went
                // near a screen. This only stops offering a button that would
                // be refused, which is a courtesy, not a lock.
                const mine = canWriteStudies(profile?.role) && !readOnly;
                // PUBLISHING IS THE EXCEPTION, and it is the one act here that
                // is genuinely church-wide: it puts a study on everybody's
                // shelf. Editing privately and publishing universally cannot
                // share a gate, so this one stays with whoever wrote it.
                const canPublish = !!profile && !readOnly && (
                  s.author_id === profile.id
                  || profile.role === 'admin'
                  || profile.role === 'executive'
                );
                const ownSeries = !!profile && s.author_id === profile.id;
                const opened = open === s.id;
                return (
                  <div key={s.id} className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-navy/5">
                    {/* THE WHOLE ROW OPENS IT, and the row carries nothing else
                        but a Draft tag. Rename, Publish and Delete were three
                        words beside every title -- a list to read, not a
                        shelf -- and they now sit inside the series you open. */}
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

                    {/* LOOKING AFTER THE SERIES ITSELF, at the foot of it once
                        it is open: the studies come first because reading them
                        is what the series is for. */}
                    {opened && mine && (
                      <div className="mt-4 border-t border-black/5 pt-3">
                        {renaming === s.id ? (
                          <div className="grid gap-2 rounded-xl bg-white p-3 ring-1 ring-navy/10">
                            <label className="text-xs font-semibold text-navy" htmlFor={`series-title-${s.id}`}>Name</label>
                            <input
                              id={`series-title-${s.id}`}
                              value={newTitle}
                              onChange={(e) => setNewTitle(e.target.value)}
                              placeholder="Series title"
                              className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
                            />
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
                            {/* Renaming a series was once only possible by
                                deleting it, which took every study with it. */}
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
