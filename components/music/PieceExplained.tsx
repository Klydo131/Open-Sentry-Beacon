'use client';

// "About this piece": what the score says about itself, in plain words, above
// the notes. Asked for on 6 October 2026, so that "the choir singers and
// conductors understand how the piece works already". The words come from
// lib/music/explain.ts, read from the score's own markings on the phone;
// nothing here is sent anywhere, and nothing is shown as HTML.

import { useMemo } from 'react';
import { Button } from '@/components/ui';
import { explain } from '@/lib/music/explain';
import type { Meter } from '@/lib/music/beat';
import type { Score } from '@/lib/music/musicxml';

/** What the Conductor needs to beat a piece. */
export interface ConductSet {
  title: string;
  meter: Meter;
  bpm: number;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function PieceExplained({ score, mine, onConduct }: {
  score: Score;
  /** The line chosen as Your part, whose words are shown first. */
  mine: string;
  onConduct?: (set: ConductSet) => void;
}) {
  const e = useMemo(() => explain(score), [score]);
  const words = e.words.find((w) => w.id === mine) ?? e.words[0];

  return (
    <section className="mt-4 rounded-2xl bg-gray-50 p-4" aria-labelledby="piece-explained" data-piece-explained>
      <h3 id="piece-explained" className="text-lg font-bold text-navy">About this piece</h3>
      <p className="mt-1 text-navy" data-piece-summary>{e.summary}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="font-semibold text-gray-600">Tempo</dt><dd className="font-bold text-navy" data-piece-tempo>{e.tempo}</dd></div>
        <div><dt className="font-semibold text-gray-600">Time</dt><dd className="font-bold text-navy">{e.time ?? 'Not written'}</dd></div>
        <div><dt className="font-semibold text-gray-600">Key</dt><dd className="font-bold text-navy" data-piece-key>{e.key ?? 'Not written'}</dd></div>
        <div><dt className="font-semibold text-gray-600">Length</dt><dd className="font-bold text-navy">{e.bars ? `${e.bars} bars, ` : ''}about {clock(e.seconds)}</dd></div>
      </dl>

      {e.conductor && onConduct && (
        <div className="mt-3">
          <Button className="text-base" onClick={() => onConduct({ title: score.title, meter: e.conductor!.meter, bpm: e.conductor!.bpm })}>
            🎼 Conduct this piece
          </Button>
          <p className="mt-1 text-xs text-gray-600">Opens the Conductor at {e.conductor.bpm} a minute, {e.conductor.how}.</p>
        </div>
      )}

      {e.journey.length > 0 && (
        <div className="mt-4" data-piece-journey>
          <h4 className="font-bold text-navy">Loud, soft and speed</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {e.journey.map((j, i) => (
              <li key={i} className="text-navy"><span className="font-semibold text-gray-600">{j.where}:</span> {j.text}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4" data-piece-parts>
        <h4 className="font-bold text-navy">Each part</h4>
        <ul className="mt-1 space-y-2 text-sm">
          {e.parts.map((p) => (
            <li key={p.id} className="text-navy">
              <span className="font-bold">{p.name}</span>: {p.range}.
              {p.leap && (
                <>
                  {' '}Widest leap: {p.leap.name}, {p.leap.from} to {p.leap.to}, at {p.leap.where}.
                  {p.leap.hard && (
                    <span className="ml-1 inline-block rounded-full px-2 text-xs font-bold text-[color:var(--music-accent)] ring-1 ring-[color:var(--music-accent)]" data-piece-practise>
                      Practise this
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      {words && (
        <div className="mt-4" data-piece-words>
          <h4 className="font-bold text-navy">The words{e.words.length > 1 ? `, ${words.name}` : ''}</h4>
          <p className="mt-1 whitespace-pre-line text-sm text-navy">{words.text}</p>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-600">
        Read from the score&rsquo;s own markings, on this phone. The summary says what the composer wrote, in plain words.
      </p>
    </section>
  );
}
