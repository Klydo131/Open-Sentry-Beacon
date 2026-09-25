'use client';

import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { Button, Card } from '@/components/ui';
import { Linked } from '@/components/Linked';
import { LESSONS, lessonById, offerableSeries } from '@/lib/lessons';

// The library's series shelf.
//
// The client's words: "Can the library upload lesson series on specific areas of
// interest that can be pushed to seekers and walked through with them until they
// finish?" This is the first half — the building. A missionary does the pushing
// from a seeker's room, and the seeker does the walking on their own screen.
//
// Two decisions worth naming.
//
// A series is grouped by AREA OF INTEREST, not by journey stage. The stages are
// a note the church keeps about a person and a seeker never sees them; "Prayer"
// or "Understanding the Bible" is something somebody can say out loud about
// themselves. That is what makes a series safe to show a seeker the shape of.
//
// The order is the order you pick them in. There are no drag handles, no move-up
// arrows and no position numbers to keep in your head — you tap lessons in the
// order you want them walked, and the list underneath shows what you have built
// so far. An admin in their forties, on a phone, can do that on the first try.
export function LessonSeriesLibrary() {
  const { db, createSeries, setSeriesPublished } = useDemo();
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  // The builder is shut until somebody asks to build, and which series is
  // open to show its lessons.
  const [building, setBuilding] = useState(false);
  const [open, setOpen] = useState('');

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // A NAME AND AT LEAST ONE LESSON. The topic only groups the shelf, so it is
  // not a reason to refuse a series: left empty, it is filed under General --
  // the same answer the live app gives.
  const canSave = title.trim() && picked.length > 0;

  const save = () => {
    if (!canSave) return;
    createSeries({ title, topic: topic.trim() || 'General', description, lessonIds: picked });
    setSaved(title.trim());
    setTitle('');
    setTopic('');
    setDescription('');
    setPicked([]);
    setBuilding(false);
    setTimeout(() => setSaved(''), 5000);
  };

  const existing = [...db.lesson_series].sort(
    (a, b) => a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title),
  );
  const published = offerableSeries(db.lesson_series).length;

  return (
    <Card className="overflow-hidden p-0">
      {/* THE SHELF FIRST, THE BUILDER WHEN ASKED FOR -- the same shape as the
          live Lesson studies card. The builder used to be the whole top of the
          page, open on every visit, above the series people came to look at. */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-800/10 bg-gradient-to-r from-sky-50 via-white to-teal-50 p-5">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-navy">📖 Lesson studies</h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {published} of {existing.length} shared with the church. Guides can start a
            shared one for an Explorer in one tap.
          </p>
        </div>
        {!building && (
          <Button onClick={() => setBuilding(true)}>+ New series</Button>
        )}
      </div>
      <div className="p-5">

      {building && (
        <div className="mb-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
          <p className="mb-3 font-bold text-navy">Build a lesson series</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name (e.g. Learning to pray)"
              aria-label="Series name"
              className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10"
            />
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic, optional, groups it (e.g. Prayer)"
              aria-label="Topic"
              list="series-topics"
              className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10"
            />
            {/* Existing topics offered, new ones still accepted. A church should
                be able to use its own words without being told they are wrong. */}
            <datalist id="series-topics">
              {Array.from(new Set(db.lesson_series.map((s) => s.topic))).map((tp) => (
                <option key={tp} value={tp} />
              ))}
            </datalist>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line about who this is for (optional)"
              aria-label="Description"
              className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 sm:col-span-2"
            />
          </div>

          <p className="mb-2 mt-4 text-sm font-semibold text-navy">
            Tap lessons in the order you want them walked
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-navy/5">
            {LESSONS.map((l) => {
              const at = picked.indexOf(l.id);
              const on = at >= 0;
              return (
                <button
                  key={l.id}
                  onClick={() => toggle(l.id)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                    on ? 'bg-navy text-white' : 'bg-white hover:bg-gray-100'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      on ? 'bg-gold text-navy' : 'bg-gray-100 text-gray-400'
                    }`}
                    style={on ? { backgroundColor: '#E8B84B', color: '#1E2A4A' } : undefined}
                  >
                    {on ? at + 1 : '+'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{l.title}</span>
                    <span
                      className={`block truncate text-xs ${on ? 'text-white/70' : 'text-gray-400'}`}
                    >
                      {/* Deliberately NOT <Linked>. This row is a toggle button,
                          and an anchor inside a button is invalid HTML whose tap
                          either navigates away from a half-built series or is
                          swallowed by the button — neither is what anyone meant.
                          The description is linked where it is READ, in MySeries
                          and the ministry list, not here where it is picked. */}
                      {l.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="gold" disabled={!canSave} onClick={save}>
              Save series {picked.length > 0 ? `· ${picked.length} lessons` : ''}
            </Button>
            <button
              onClick={() => { setBuilding(false); setPicked([]); }}
              className="tap-sm rounded-xl px-3 text-sm font-semibold text-gray-600 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saved && (
        <p className="mb-3 rounded-xl bg-green-50 px-4 py-3 font-semibold text-green-700">
          ✓ &ldquo;{saved}&rdquo; is on the shelf. Guides can start it now.
        </p>
      )}

      {existing.length === 0 ? (
        <p className="text-gray-500">No series yet. Tap + New series to build the first one.</p>
      ) : (
        <div className="space-y-2">
          {existing.map((s) => {
            const opened = open === s.id;
            return (
              <div key={s.id} className="rounded-xl bg-gray-50 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* THE ROW OPENS TO SHOW ITS LESSONS, rather than every
                      series printing its whole list all the time. */}
                  <button
                    type="button"
                    onClick={() => setOpen(opened ? '' : s.id)}
                    aria-expanded={opened}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block font-bold text-navy">
                      <span aria-hidden className="mr-1 text-xs text-gray-400">{opened ? '▾' : '▸'}</span>
                      {s.title}
                    </span>
                    <span className="block text-sm font-semibold" style={{ color: '#B08419' }}>
                      {s.topic} · {s.lesson_ids.length} lessons
                    </span>
                  </button>
                  <button
                    onClick={() => setSeriesPublished(s.id, !s.is_published)}
                    className={`tap-sm shrink-0 rounded-xl px-3 text-sm font-semibold ${
                      s.is_published
                        ? 'bg-white text-navy ring-1 ring-navy/20'
                        : 'bg-navy text-white'
                    }`}
                  >
                    {s.is_published ? 'Hide from the church' : 'Share with the church'}
                  </button>
                </div>
                {s.description && (
                  <p className="mt-1 text-sm text-gray-500"><Linked text={s.description} /></p>
                )}
                {opened && (
                  <ol className="mt-3 space-y-1">
                    {s.lesson_ids.map((id, i) => {
                      const l = lessonById(id);
                      if (!l) return null;
                      return (
                        <li key={id} className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="w-5 shrink-0 text-right font-bold text-gray-400">
                            {i + 1}
                          </span>
                          <span className="min-w-0 truncate">{l.title}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-gray-500">
        Hiding a series stops it being offered. It never takes it from an Explorer who has already started it.
      </p>
      </div>
    </Card>
  );
}
