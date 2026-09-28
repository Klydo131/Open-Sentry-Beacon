'use client';

import { useDemo } from '@/lib/demo/store';
import { Card } from '@/components/ui';
import { Linked } from '@/components/Linked';
import { seriesProgress } from '@/lib/lessons';
import { safeExternalUrl } from '@/lib/url';
import { DrawingPicture } from '@/components/draw/Draw';

// The seeker's half of a lesson series: the walking.
//
// The client asked for lessons that can be "pushed to seekers and walked through
// with them until they finish", and this is where the finishing happens. Three
// things it does that a flat list of assignments cannot:
//
//   - It says how long the road is. "2 of 6" from the first day, not a list that
//     mysteriously grows. Somebody who knows there are four left behaves
//     differently from somebody who has no idea.
//   - It says which one is next, and only that one is offered. A course walked
//     out of order is not a course.
//   - It says when they are done, out loud. Finishing something is the point.
//
// No stage name appears here, and none can: a series is grouped by area of
// interest, and the lesson's own stage is never read. That rule is owned by
// tests/e2e/seeker-no-stage.js and it still binds.
export function MySeries() {
  const { db, currentUser, completeLesson } = useDemo();
  const me = currentUser!;
  const pairing = db.pairings.find((p) => p.ds_id === me.id && p.status === 'active');
  if (!pairing) return null;

  // Only series this person has actually been started on.
  const started = db.lesson_series
    .filter((s) =>
      db.lesson_assignments.some(
        (a) => a.pairing_id === pairing.id && a.series_id === s.id,
      ),
    )
    .map((s) => ({ series: s, progress: seriesProgress(s, db.lesson_assignments, pairing.id) }))
    // Unfinished first: the one with work left is the one they came for.
    .sort((a, b) => Number(a.progress.finished) - Number(b.progress.finished));

  if (started.length === 0) return null;

  return (
    <>
      {started.map(({ series, progress }) => (
        // A wrapper carrying the series id, so a test can read ONE card rather
        // than the whole page. Without it a suite matched "N of M" anywhere on
        // screen and reported this series' progress using a different series'
        // numbers — it passed, on the wrong evidence.
        <div key={series.id} data-series={series.id}>
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-wide" style={{ color: '#B08419' }}>
                {series.topic}
              </p>
              <h2 className="text-xl font-bold text-navy">{series.title}</h2>
              {series.description && (
                <p className="mt-1 text-sm text-gray-500"><Linked text={series.description} /></p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                progress.finished ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}
            >
              {progress.finished ? '✓ Finished' : `${progress.done} of ${progress.total}`}
            </span>
          </div>

          {/* THE PICTURE THE GUIDE DREW FOR IT, above the lessons, as the live
              app shows a drawing above a study's handouts. */}
          {series.drawing && (
            <div className="mt-3">
              <DrawingPicture src={series.drawing} name="Drawing 1.excalidraw.png" />
            </div>
          )}

          <div className="my-4 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                backgroundColor: progress.finished ? '#16A34A' : '#7FB03A',
              }}
            />
          </div>

          {progress.finished && (
            <div className="mb-4 rounded-xl bg-green-50 p-4">
              <p className="font-bold text-green-700">🎉 You finished the whole series.</p>
              <p className="mt-1 text-sm text-green-800">
                Every lesson done. Tell the person walking with you. They will be
                glad to hear it.
              </p>
            </div>
          )}

          <ol className="space-y-2">
            {progress.steps.map(({ lesson, assignment }, i) => {
              const isDone = assignment?.status === 'completed';
              const isNext = !isDone && progress.next?.id === lesson.id;
              // Not yet shared by the missionary, and not the one in front of
              // them. Shown so the road has a visible length, but greyed: a
              // course you can skim ahead in is a list, not a walk.
              const locked = !assignment && !isNext;
              const url = safeExternalUrl(lesson.link);
              return (
                <li
                  key={lesson.id}
                  className={`rounded-xl px-4 py-3 ${
                    isNext ? 'bg-white ring-2' : 'bg-gray-50'
                  }`}
                  style={isNext ? { boxShadow: 'inset 0 0 0 2px #E8B84B' } : undefined}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold"
                      style={
                        isDone
                          ? { backgroundColor: '#16A34A', color: '#fff' }
                          : isNext
                            ? { backgroundColor: '#E8B84B', color: '#1E2A4A' }
                            : { backgroundColor: '#E5E7EB', color: '#9CA3AF' }
                      }
                    >
                      {isDone ? '✓' : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-semibold ${
                          locked ? 'text-gray-400' : 'text-navy'
                        }`}
                      >
                        {lesson.title}
                      </p>
                      <p className={`text-sm ${locked ? 'text-gray-300' : 'text-gray-500'}`}>
                        <Linked text={lesson.description} />
                      </p>
                      {isNext && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-navy ring-1 ring-black/5"
                            >
                              Open
                            </a>
                          )}
                          {assignment && (
                            <button
                              onClick={() => completeLesson(assignment.id)}
                              className="tap-sm rounded-lg px-4 text-sm font-bold text-navy"
                              style={{ backgroundColor: '#E8B84B' }}
                            >
                              Mark done
                            </button>
                          )}
                          {!assignment && (
                            <p className="text-sm text-gray-400">
                              Your Guide will open this one for you next.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
        </div>
      ))}
    </>
  );
}
