// A study takes a dropped file anywhere on it, new or being edited, and a file
// dropped where nothing takes files is never opened in place of the app.
//
// Asked for on 28 September 2026: "for lesson studies make sure if you make a
// new lesson, you can put attached files or drag and drop it even if you edit."
//
// Every way of writing a study already had a small box for files. The trap was
// around it: a handout let go over the words of the study, a few pixels from
// the box, was opened by the browser itself -- the tab left the app, and the
// study being written went with it. So the whole study now takes the drop, in
// all three places a study is written, and a window-wide guard catches any file
// that lands where nothing takes files.
//
// Seen working in Chromium against the practice backend, with synthetic drags
// (a drop on the words attached the file; a drop on the box inside was added
// once; a drop on the header was stopped). This file holds the wiring.
//
//   node tests/a-study-takes-files-anywhere.mjs

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');

// 1. One way to take a drop, shared, that never takes one twice.
const drop = code(readFileSync('components/FileDrop.tsx', 'utf8'));
ok(/export function useFileDropArea\(/.test(drop) && /export function DropArea\(/.test(drop),
  'any card or form can take dropped files the same way the box does');
ok(/const \{ over, handlers \} = useFileDropArea\(onFiles, \{ busy, multiple \}\);/.test(drop),
  'and the box itself uses that same way');
const onDrop = drop.slice(drop.indexOf('onDrop: (e: React.DragEvent) => {'));
ok(/if \(taken\(e\)\) return;/.test(onDrop.slice(0, 300)) && /isDefaultPrevented\(\)/.test(drop),
  'a drop the box inside already took is not added again by the card around it');
ok(/data-drop-area=""/.test(drop) && /\{label\}/.test(drop),
  'and a card being dragged over says it will take the file');

// 2. All three ways of writing a study.
const studies = code(readFileSync('components/LiveStudies.tsx', 'utf8'));
// The whole opening tag: its `>` is the one on a line of its own, not the `=>`
// inside a handler.
const areas = [...studies.matchAll(/<DropArea\b[\s\S]*?\n\s*>/g)].map((m) => m[0]);
ok(areas.length === 3, `three studies-being-written take drops (${areas.length})`);
ok(areas.some((a) => /live\.attachLessonFile\(lesson\.id, file\)/.test(a)),
  'a study being EDITED takes a file dropped anywhere on it, straight onto the study');
ok(areas.some((a) => /onFiles=\{\(picked\) => addNewFiles\(picked\)\}/.test(a)),
  'a NEW study in a series takes one and holds it until the study is added');
ok(areas.some((a) => /onFiles=\{\(files\) => addFiles\(s\.key, files\)\}/.test(a)),
  'each study in a NEW SERIES takes one for itself');
ok((studies.match(/<FileDrop/g) || []).length === 3,
  'and each still has its box, with Choose files for a phone');
{
  const adder = studies.slice(studies.indexOf('const addNewFiles'), studies.indexOf('const addNewFiles') + 700);
  ok(/const tooBig = picked\.filter\(\(f\) => f\.size > live\.MAX_RESOURCE_FILE\);/.test(adder)
     && /tooBig\.map\(\(f\) =>/.test(adder) && /over 10 MB\. Share a link to it instead\./.test(adder),
    'a file too big is found and named when it is dropped, the same way in both forms');
}

// 3. Nowhere in particular: stopped, never opened.
const stray = code(readFileSync('components/StrayFileDrops.tsx', 'utf8'));
ok(/window\.addEventListener\('drop', drop\)/.test(stray) && /window\.addEventListener\('dragover', over\)/.test(stray),
  'the whole window listens for a file nobody took');
ok((stray.match(/if \(!carriesFiles\(e\) \|\| e\.defaultPrevented\) return;/g) || []).length === 2,
  'and leaves alone anything that is not a file, and any drop something else took');
ok(/dropEffect = 'none'/.test(stray), 'the pointer says "not here" rather than inviting a drop');
const layout = readFileSync('app/layout.tsx', 'utf8');
ok(/<StrayFileDrops \/>/.test(code(layout)), 'and it is on every screen of the app');

console.log(bad === 0 ? '\nA study takes its handouts wherever they are dropped.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
