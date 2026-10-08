// Exercise the actual hook's resource lifecycle without opening a microphone.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';

const data = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const react = data(`export const useCallback=f=>f;
export const useEffect=f=>{globalThis.cleanup=f()};
export const useRef=x=>({current:x});
export const useState=x=>{const i=globalThis.states.push(x)-1;return [x,v=>{
globalThis.states[i]=typeof v==='function'?v(globalThis.states[i]):v}];};`);
const notes = data('export const A4_DEFAULT=440;export const clampA4=x=>x,readFrequency=x=>x;');
const pitch = data('export const LONG_WINDOW=4096;export class PitchTracker {push(){return null}}');
const source = fs.readFileSync(new URL('../lib/music/tuner.ts', import.meta.url), 'utf8')
  .replace("from 'react'", `from '${react}'`)
  .replace("from '@/lib/music/notes'", `from '${notes}'`)
  .replace("from '@/lib/music/pitch-tracker'", `from '${pitch}'`);
const { useTuner } = await import(data(transformSync(source, { loader: 'ts', format: 'esm' }).code));
const pending = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };

function fixture(failure = '') {
  let stopped = 0, closed = 0;
  const frames = new Map();
  const media = {getTracks: () => [{stop: () => stopped++}]};
  globalThis.states = [];
  globalThis.document = {hidden: false, addEventListener() {}, removeEventListener() {}};
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    AudioContext: class {
      state = 'running'; sampleRate = 48000;
      constructor() {if (failure === 'constructor') throw Error('setup');}
      async resume() {if (failure === 'resume') throw Error('resume');}
      async close() {this.state = 'closed'; closed++;}
      createAnalyser() {
        if (failure === 'analyser') throw Error('analyser');
        return {getFloatTimeDomainData() {if (failure === 'frame') throw Error('frame');}};
      }
      createMediaStreamSource() {
        if (failure === 'source') throw Error('source');
        return {connect() {}};
      }
    },
  };
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {
    mediaDevices: {getUserMedia: async () => media},
  }});
  globalThis.requestAnimationFrame = f => {const id = frames.size + 1; frames.set(id, f); return id;};
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  return {media, frames, stopped: () => stopped, closed: () => closed};
}

for (const failure of ['constructor', 'resume', 'analyser', 'source']) {
  const f = fixture(failure), tuner = useTuner();
  await tuner.start();
  assert.equal(f.stopped(), 1, `${failure}: acquired track released`);
  assert.equal(f.closed(), failure === 'constructor' ? 0 : 1, `${failure}: context released`);
  assert.equal(states[0], 'unavailable');
  tuner.stop(); cleanup();
  assert.equal(f.stopped(), 1, `${failure}: cleanup is idempotent`);
}
{
  const f = fixture(), tuner = useTuner();
  await tuner.start();
  assert.equal(states[0], 'listening'); assert.equal(f.stopped(), 0);
  tuner.stop(); assert.equal(f.stopped(), 1); assert.equal(f.closed(), 1);
}
{
  const f = fixture(), permission = pending();
  navigator.mediaDevices.getUserMedia = () => permission.promise;
  const tuner = useTuner(), start = tuner.start();
  tuner.stop(); permission.resolve(f.media); await start;
  assert.equal(f.stopped(), 1); assert.equal(f.frames.size, 0);
}
{
  const f = fixture(), resumed = pending();
  window.AudioContext.prototype.resume = () => resumed.promise;
  const tuner = useTuner(), start = tuner.start();
  await Promise.resolve(); tuner.stop(); resumed.resolve(); await start;
  assert.equal(f.stopped(), 1); assert.equal(f.closed(), 1); assert.equal(f.frames.size, 0);
}
{
  const f = fixture('frame'), tuner = useTuner();
  await tuner.start(); [...f.frames.values()][0]();
  assert.equal(f.stopped(), 1); assert.equal(f.closed(), 1); assert.equal(states[0], 'unavailable');
}
console.log('PASS: microphone setup failures, late permission, pending resume, Stop and frame failure release resources.');
