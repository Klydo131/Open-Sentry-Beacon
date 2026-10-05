'use client';

// A score to learn a part from: every line of a MusicXML file, drawn as notes
// on a strip (higher notes higher, longer notes longer) and played by the
// phone, with your own part louder, any part silent, at any tempo, from any
// point you tap.
//
// NOT PRINTED NOTATION, AND THAT IS A DECISION WITH A REASON. Drawing real
// staves, clefs and beams needs an engraving library, and the one built for
// the web (OpenSheetMusicDisplay) brings 82 packages, a megabyte and a half
// of code, and evaluated code this app's security rules forbid
// (docs/MUSIC-RESEARCH.md). A singer learning a part needs to hear it and
// see where it goes; the printed page is what the scanner is for.
//
// Everything a person wrote into the file (titles, part names) reaches the
// screen as text, never as markup.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useScorePlayer, TRANSPOSE_MAX, type Mix } from '@/lib/music/score-player';
import { TIMBRES, TIMBRE_NAME, type Timbre } from '@/lib/music/audio';
import { AdvancedToggle, useAdvanced } from '@/components/music/Advanced';
import { midiName } from '@/lib/music/notes';
import { TEMPO_MAX, TEMPO_MIN } from '@/lib/music/beat';
import type { Score, ScoreLine } from '@/lib/music/musicxml';

/** A quarter note's width on the strip, and a semitone's height. */
const PX = 28;
const ROW = 6;
const PAD = 10;
const xOf = (quarter: number) => PAD + quarter * PX;

const MIXES: Mix[] = ['normal', 'loud', 'off'];
const MIX_LABEL: Record<Mix, string> = { normal: 'Normal', loud: 'Louder', off: 'Silent' };

function lowHigh(midis: number[]): [number, number] | null {
  if (!midis.length) return null;
  let low = midis[0];
  let high = midis[0];
  for (const m of midis) { if (m < low) low = m; if (m > high) high = m; }
  return [low, high];
}

function minutes(quarters: number, bpm: number): string {
  const s = Math.round((quarters * 60) / bpm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Every note of every line, drawn once. A large score is thousands of
 * rectangles, so this is kept apart from the controls around it: pressing
 * Play, moving the start or changing the tempo does not redraw a single note.
 * Only choosing your part or changing how a line is heard does.
 */
const NoteLayer = memo(function NoteLayer({ lines, mine, mix, high }: {
  lines: ScoreLine[];
  mine: string;
  mix: Record<string, Mix>;
  high: number;
}) {
  const yOf = (midi: number) => PAD + (high - midi) * ROW;
  // Your part drawn last, on top of the others where they cross.
  const order = [...lines].sort((a, b) => Number(a.id === mine) - Number(b.id === mine));
  return (
    <>
      {order.map((line) => {
        const off = (mix[line.id] ?? 'normal') === 'off';
        const className = off ? 'fill-slate-400' : line.id === mine ? 'fill-teal-700' : 'fill-navy';
        const opacity = off ? 0.25 : line.id === mine ? 1 : 0.5;
        return (
          <g key={line.id} className={className} opacity={opacity} data-line={line.id}>
            {line.notes.map((n, i) => (
              <rect key={i} x={xOf(n.start) + 0.5} y={yOf(n.midi)} width={Math.max(2, n.length * PX - 1)} height={ROW - 1} rx={1.5} />
            ))}
          </g>
        );
      })}
    </>
  );
});

export function ScoreView({ score, onClose }: { score: Score; onClose: () => void }) {
  const player = useScorePlayer(score);
  const { playing, tempo, mix, position } = player;
  const [mine, setMine] = useState('');
  const [from, setFrom] = useState(0);
  const head = useRef<SVGLineElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [advanced, keepAdvanced] = useAdvanced('pieces');
  // Turning Advanced off plays the score as written again.
  const setAdvanced = (on: boolean) => {
    keepAdvanced(on);
    if (!on) {
      player.setTranspose(0);
      player.setLoop(null);
      player.setTimbre('voice');
    }
  };

  const [low, high] = useMemo(
    () => lowHigh(score.lines.flatMap((l) => l.notes.map((n) => n.midi))) ?? [60, 72],
    [score],
  );
  const yOf = (midi: number) => PAD + (high - midi) * ROW;
  const width = xOf(Math.max(1, score.length)) + PAD;
  const height = yOf(low) + ROW + PAD;

  // The playhead, every frame while playing, and the strip scrolled to keep it in view.
  useEffect(() => {
    const line = head.current;
    if (!playing || !line) { line?.setAttribute('visibility', 'hidden'); return; }
    let frame = 0;
    const draw = () => {
      const at = position();
      if (at !== null) {
        const x = String(xOf(at));
        line.setAttribute('x1', x);
        line.setAttribute('x2', x);
        line.setAttribute('visibility', 'visible');
        const box = scroller.current;
        const px = xOf(at);
        if (box && (px < box.scrollLeft || px > box.scrollLeft + box.clientWidth - 48)) {
          box.scrollLeft = Math.max(0, px - 48);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playing, position]);

  const chooseMine = (id: string) => {
    const changes: Record<string, Mix> = {};
    if (mine && mine !== id) changes[mine] = 'normal';
    if (id) changes[id] = 'loud';
    setMine(id);
    if (Object.keys(changes).length) player.setMix(changes);
  };

  const startAt = (event: React.MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    startFrom(Math.floor(((event.clientX - box.left) / box.width) * width / PX - PAD / PX));
  };

  const lastBeat = Math.max(0, Math.floor(score.length) - 1);
  const beats = lastBeat + 1;
  const loop = player.loop;
  const setLoopBeats = (first: number, last: number) => {
    const a = Math.max(1, Math.min(beats, Math.round(first)));
    const b = Math.max(a, Math.min(beats, Math.round(last)));
    player.setLoop({ from: a - 1, to: b });
  };
  const mineSilent = !!mine && mix[mine] === 'off';
  const singMine = (on: boolean) => { if (mine) player.setMix({ [mine]: on ? 'off' : 'loud' }); };
  const startFrom = (beat: number) => {
    const at = Math.max(0, Math.min(lastBeat, Math.round(beat)));
    setFrom(at);
    if (playing) player.play(at);
  };

  return (
    <Card className="p-5" data-panel="score-view">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold text-navy" data-score-title>{score.title}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {score.lines.length} {score.lines.length === 1 ? 'part' : 'parts'} · about {minutes(score.length, tempo)} at this tempo
          </p>
        </div>
        <Button variant="ghost" onClick={() => { player.stop(); onClose(); }}>Close</Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {playing
          ? <Button variant="ghost" onClick={player.stop}>■ Stop</Button>
          : <Button onClick={() => { player.play(from); }}>▶ Play{from > 0 ? ` from beat ${from + 1}` : ''}</Button>}
        {from > 0 && <Button variant="ghost" onClick={() => setFrom(0)}>Back to the start</Button>}
      </div>
      {advanced && (loop || player.transpose !== 0) && (
        <p className="mt-2 text-sm font-semibold text-teal-700" data-score-playing-as>
          {[loop ? `Looping beats ${loop.from + 1} to ${loop.to}` : '', player.transpose ? `${player.transpose > 0 ? 'up' : 'down'} ${Math.abs(player.transpose)} ${Math.abs(player.transpose) === 1 ? 'semitone' : 'semitones'}` : ''].filter(Boolean).join(', ')}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="text-sm font-bold text-navy">Your part</span>
          <select
            id="score-mine"
            value={mine}
            onChange={(e) => chooseMine(e.target.value)}
            className="tap mt-1 block rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
          >
            <option value="">All parts the same</option>
            {score.lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <div>
          <p className="text-sm font-bold text-navy">Tempo, beats a minute</p>
          <div className="mt-1 flex items-center gap-2">
            <Button variant="ghost" className="px-4" onClick={() => player.setTempo(tempo - 5)} disabled={tempo <= TEMPO_MIN}>− 5</Button>
            <p className="min-w-12 text-center text-lg font-bold tabular-nums text-navy" data-score-tempo>{tempo}</p>
            <Button variant="ghost" className="px-4" onClick={() => player.setTempo(tempo + 5)} disabled={tempo >= TEMPO_MAX}>+ 5</Button>
          </div>
          {tempo !== score.tempo && (
            <button type="button" onClick={() => player.setTempo(score.tempo)} className="mt-1 text-sm font-semibold text-teal-700 underline">
              Back to the score&rsquo;s {score.tempo}
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-600">Tap the notes, or use the slider under them, to start from that beat. Your part is drawn in green.</p>
      <div ref={scroller} className="mt-2 overflow-x-auto rounded-xl bg-gray-50 ring-1 ring-navy/10">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onClick={startAt}
          className="block cursor-pointer"
          role="img"
          aria-label={`The notes of ${score.title}, every part, from left to right`}
          data-score-roll
        >
          {/* A faint line at every C, named, so the strip has a way to read up and down. */}
          {Array.from({ length: high - low + 1 }, (_, i) => low + i).filter((m) => m % 12 === 0).map((m) => (
            <g key={m}>
              <line x1={0} x2={width} y1={yOf(m) + ROW / 2} y2={yOf(m) + ROW / 2} className="stroke-navy/15" strokeWidth={1} />
              <text x={2} y={yOf(m) + ROW / 2 - 2} fontSize={9} className="fill-slate-500">{midiName(m)}</text>
            </g>
          ))}
          <NoteLayer lines={score.lines} mine={mine} mix={mix} high={high} />
          {from > 0 && <line x1={xOf(from)} x2={xOf(from)} y1={0} y2={height} className="stroke-teal-700" strokeWidth={2} strokeDasharray="4 3" />}
          <line ref={head} x1={PAD} x2={PAD} y1={0} y2={height} className="stroke-rose-600" strokeWidth={2} visibility="hidden" data-playhead />
        </svg>
      </div>

      <label className="mt-3 block">
        <span className="text-sm font-bold text-navy">Start from beat {from + 1}</span>
        <input
          id="score-from"
          type="range"
          min={0}
          max={lastBeat}
          value={from}
          onChange={(e) => startFrom(Number(e.target.value))}
          className="mt-1 w-full accent-teal-700"
        />
      </label>

      <ul className="mt-5 space-y-3">
        {score.lines.map((line) => {
          const range = lowHigh(line.notes.map((n) => n.midi));
          const heard = mix[line.id] ?? 'normal';
          return (
            <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-navy/10">
              <div className="min-w-0">
                <p className="break-words font-bold text-navy">{line.name}</p>
                <p className="text-sm text-gray-500">{range ? `${midiName(range[0])} to ${midiName(range[1])}` : 'No notes'}</p>
              </div>
              <div className="flex gap-1" role="group" aria-label={`How ${line.name} is heard`}>
                {MIXES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => player.setMix({ [line.id]: m })}
                    aria-pressed={heard === m}
                    className={`tap-sm rounded-lg px-3 text-sm font-bold ring-1 ${heard === m ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/20 hover:bg-sky-50'}`}
                  >
                    {MIX_LABEL[m]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 border-t border-navy/10 pt-4">
        <AdvancedToggle
          folder="pieces"
          on={advanced}
          onChange={setAdvanced}
          what="Move the music up or down, loop a hard passage, silence your own part to sing it yourself, and choose a sound."
        />
      </div>
      {advanced && (
        <div className="mt-4 grid gap-4 md:grid-cols-2" data-score-advanced>
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="font-bold text-navy">Transpose</p>
            <p className="text-sm text-gray-600">Move every part up or down, to suit your voices.</p>
            <div className="mt-2 flex items-center gap-2">
              <Button variant="ghost" className="px-4" onClick={() => player.setTranspose(player.transpose - 1)} disabled={player.transpose <= -TRANSPOSE_MAX}>
                <span aria-hidden>− 1</span><span className="sr-only">Down a semitone</span>
              </Button>
              <p className="min-w-24 text-center font-bold tabular-nums text-navy" data-score-transpose>
                {player.transpose === 0 ? 'As written' : `${player.transpose > 0 ? '+' : '−'}${Math.abs(player.transpose)} semitone${Math.abs(player.transpose) === 1 ? '' : 's'}`}
              </p>
              <Button variant="ghost" className="px-4" onClick={() => player.setTranspose(player.transpose + 1)} disabled={player.transpose >= TRANSPOSE_MAX}>
                <span aria-hidden>+ 1</span><span className="sr-only">Up a semitone</span>
              </Button>
            </div>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <label className="flex items-start gap-3 text-navy">
              <input
                id="score-loop"
                type="checkbox"
                checked={!!loop}
                onChange={(e) => (e.target.checked ? setLoopBeats(from + 1, Math.min(beats, from + 8)) : player.setLoop(null))}
                className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
              />
              <span>
                <span className="block font-bold">Loop a passage</span>
                <span className="block text-sm text-gray-600">Play the same beats over and over, to learn them.</span>
              </span>
            </label>
            {loop && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-navy" data-score-loop>
                <label htmlFor="score-loop-from" className="text-sm font-semibold">From beat</label>
                <input
                  id="score-loop-from"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={beats}
                  value={loop.from + 1}
                  onChange={(e) => setLoopBeats(Number(e.target.value), Math.max(Number(e.target.value), loop.to))}
                  className="tap w-20 rounded-xl bg-white px-3 text-base font-bold tabular-nums ring-1 ring-navy/20"
                />
                <label htmlFor="score-loop-to" className="text-sm font-semibold">to</label>
                <input
                  id="score-loop-to"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={beats}
                  value={loop.to}
                  onChange={(e) => setLoopBeats(loop.from + 1, Number(e.target.value))}
                  className="tap w-20 rounded-xl bg-white px-3 text-base font-bold tabular-nums ring-1 ring-navy/20"
                />
              </div>
            )}
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <label className="flex items-start gap-3 text-navy">
              <input
                id="score-sing-mine"
                type="checkbox"
                checked={mineSilent}
                disabled={!mine}
                onChange={(e) => singMine(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
              />
              <span>
                <span className="block font-bold">I sing my part</span>
                <span className="block text-sm text-gray-600">
                  {mine ? 'Your part goes silent and the others play, so you sing it against them.' : 'Choose Your part, above, first.'}
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <label htmlFor="score-sound" className="block font-bold text-navy">Sound</label>
            <select
              id="score-sound"
              value={player.timbre}
              onChange={(e) => player.setTimbre(e.target.value as Timbre)}
              className="tap mt-2 block w-full rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
            >
              {TIMBRES.map((t) => <option key={t} value={t}>{TIMBRE_NAME[t]}</option>)}
            </select>
          </div>
        </div>
      )}
    </Card>
  );
}
