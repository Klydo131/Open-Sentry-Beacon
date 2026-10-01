// Every set of sub-rooms is one drop-down, on every device.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Asked for on 30 September 2026, with a screenshot of a
// Guide's home and the strip of sub-rooms circled: "I want all sub-rooms to be
// drop down list or some kind of drop down for users to see all sub-rooms
// optimally in all devices. I realized users get confused that they need to
// slide sub-rooms and request a drop down feature instead."
//
// Three things drew a strip: the sub-rooms of a room (RoomTabs), the tabs on
// one person's page (Tabs), and the sample Admin page's own grid. All three go
// through components/SubroomMenu.tsx now. A fourth strip written by hand next
// month would bring the swiping back on one screen, so this names them.
//
// AND IT KEEPS WHAT THE STRIP GOT RIGHT. Rooms.tsx used to explain why it was
// NOT a drop-down: a closed menu hides how many rooms exist and what is waiting
// in them. The closed button answers both -- "2 of 4", and the count waiting in
// another room -- and that is checked here too, so a tidy-up cannot quietly
// bring the old objection back true.
//
//   node tests/sub-rooms-are-a-drop-down.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTs } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => stripTs(fs.readFileSync(path.join(root, p), 'utf8'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const menu = read('components/SubroomMenu.tsx');
const rooms = read('components/Rooms.tsx');
const ui = read('components/ui.tsx');
const admin = read('app/admin/page.tsx');

// 1. All three strips go through the one drop-down.
{
  const roomTabs = rooms.slice(rooms.indexOf('export function RoomTabs'));
  const tabs = ui.slice(ui.indexOf('export function Tabs'), ui.indexOf('export function Tabs') + 1500);
  ok(/<SubroomMenu\b/.test(roomTabs) && !/role="tablist"|overflow-x-auto/.test(roomTabs),
     'the sub-rooms of a room are the drop-down, not a strip that slides');
  ok(/<SubroomMenu\b/.test(tabs) && !/role="tablist"/.test(tabs),
     'the tabs on one person\'s page are the drop-down too');
  ok(/<SubroomMenu\b/.test(admin) && !/grid grid-cols-2 gap-2 sm:flex sm:flex-wrap/.test(admin),
     'and so are the sample Admin page\'s rooms, as on the live Admin page');
}

// 2. The closed button says how many there are, which one this is, and what
//    is waiting elsewhere.
{
  ok(/\{index \+ 1\} of \{items\.length\}/.test(menu), 'closed, it says "2 of 4"');
  ok(/i\.id !== current\?\.id && i\.tone/.test(menu) && /waitingElsewhere > 0 &&/.test(menu),
     'and shows the count waiting in the rooms you are not in');
  ok(/aria-haspopup="listbox"/.test(menu) && /aria-expanded=\{open\}/.test(menu),
     'a screen reader is told it opens a list, and whether it is open');
}

// 3. Open, every room is there, and it behaves like a list.
{
  ok(/items\.map\(\(item\) =>/.test(menu) && /role="option"/.test(menu) && /aria-selected=\{on\}/.test(menu),
     'open, it lists every room, and marks the one you are in');
  ok(/event\.key === 'Escape'/.test(menu) && /pointerdown/.test(menu),
     'Escape or a tap outside closes it');
  ok(/ArrowDown/.test(menu) && /ArrowUp/.test(menu), 'the arrow keys move through it');
  ok(/onChoose\(item\.id\); setOpen\(false\)/.test(menu), 'choosing a room closes it');
  ok(/data-room=\{item\.room\}/.test(menu) && /room: r\.id/.test(rooms),
     'each room still carries data-room, which the desk\'s ?room= links and the walks use');
}

// 4. Every option is a full-size target, and the list stays on the screen.
{
  ok(/role="option"[\s\S]{0,300}className=\{`tap /.test(menu), 'every room in the list is a full-size target');
  ok(/absolute left-0 right-0/.test(menu) && !/min-w-\[20rem\]/.test(menu),
     'the list is as wide as its own button, so it cannot run off the screen');
  ok(/70vh[\s\S]{0,120}70dvh/.test(menu), 'and no taller than the part of the screen a phone shows');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
