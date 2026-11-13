// The Guide and Explorer pickers never look ready before they are.
//
// ---------------------------------------------------------------------------
// THE BUG THIS EXISTS FOR, reported from a Xiaomi phone with a photograph. The open dropdown held one
// row, "Choose guide", and nothing else.
//
// The names were all there. Checked against the live database at the time: the
// church has FORTY-ONE approved Guides, every one of them with a name, and the
// signed-in Executive Director could read all forty-one under the row policies.
// Nothing was missing and nothing was hidden.
//
// What went wrong was WHEN. LiveAdminPage keeps a `loading` flag and used it
// for the account lists, but the pairing form was drawn regardless -- so for as
// long as the fetch took, both pickers sat on screen fully tappable with
// nothing in them but their own placeholder. And a native <select> that is
// ALREADY OPEN does not accept new options: the list arrives, the open sheet
// goes on showing what it had, and it stays empty until somebody closes it and
// opens it again. Nobody does that. They report that the names are missing.
//
// It reads as a phone-specific fault and is not one. It is a race, and a phone
// on mobile data loses it every time while this sandbox and a laptop on office
// wifi finish loading before a hand can reach the control. That is the entire
// reason it was seen on a Xiaomi and never here.
//
//   node tests/the-pairing-pickers-say-what-they-know.mjs
//
// The component is RUN, not read. Its source could contain the word "Loading"
// and still render an enabled, empty control.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---------------------------------------------------------------------------
// Run the real component against a stand-in React.
// ---------------------------------------------------------------------------
//
// The only thing SelectPerson needs at runtime is createElement -- `Profile` is
// a type and disappears in transpiling -- so a few lines of stub let the actual
// shipped function build an actual element tree, which is then inspected. That
// is the difference between checking what the file SAYS and what it DOES.
const src = read('components/live/shared.tsx');
const start = src.indexOf('/**\n * Pick a person from a list.');
const end = src.indexOf('export function Notice');
ok(start !== -1 && end > start, 'the picker is where this test expects it');

const js = ts.transpileModule(
  `${src.slice(start, end).replace('export function', 'function')}\nmodule.exports = { SelectPerson };`,
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  },
).outputText;

const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
  }),
  Fragment: 'fragment',
};
// A HOOK STUB, so a component with local state can still be rendered here.
//
// The picker gained a search box, which means it gained `useState`, and this
// harness calls the component as a plain function. The stub hands back whatever
// `typed` currently holds instead of the initial value, which turns the
// limitation into the useful thing: the filter can be driven from a test and
// its RESULT inspected, rather than asserted about by reading the source.
let typed = '';
const useState = (initial) => [typed === null ? initial : (typed || initial), () => {}];

const mod = { exports: {} };
new Function('module', 'exports', 'React', 'useState', js)(mod, mod.exports, React, useState);
const { SelectPerson } = mod.exports;

/** Walk the tree and hand back the one <select>. */
function findSelect(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'select') return node;
  for (const child of node.children ?? []) {
    const found = findSelect(child);
    if (found) return found;
  }
  return null;
}
const optionsOf = (select) => select.children.map((o) => ({
  value: o.props.value,
  text: o.children.map((c) => (typeof c === 'string' ? c : '')).join(''),
}));

const person = (id, full_name) => ({ id, full_name, role: 'dm', is_approved: true });
const render = (people, loading, extra = {}) =>
  SelectPerson({ label: 'Guide', value: '', onChange: () => {}, people, loading, ...extra });

// ---------------------------------------------------------------------------
// 1. WHILE IT IS LOADING
// ---------------------------------------------------------------------------
{
  const select = findSelect(render([], true));
  ok(select.props.disabled === true,
     'a picker with nothing in it yet cannot be opened');
  ok(/loading/i.test(optionsOf(select)[0].text),
     'and it says it is still loading rather than "Choose guide"');
  ok(optionsOf(select).length === 1, 'with no people in it, because there are none yet');
}

// ---------------------------------------------------------------------------
// 2. WHEN THE ANSWER IS GENUINELY NONE
// ---------------------------------------------------------------------------
//
// A different sentence from the one above, on purpose. "Still loading" and
// "there are none" are different facts and a Director acts differently on each.
{
  const select = findSelect(render([], false));
  ok(select.props.disabled === true, 'an empty picker cannot be opened either');
  const text = optionsOf(select)[0].text;
  ok(/no guides/i.test(text), `it says there are none to choose (${JSON.stringify(text)})`);
  ok(!/loading/i.test(text), 'and does not claim to be loading when it has finished');
}

// ---------------------------------------------------------------------------
// 3. WHEN THE PEOPLE ARE THERE
// ---------------------------------------------------------------------------
{
  const select = findSelect(render([person('a', 'Ana Cruz'), person('b', 'Joel Reyes')], false));
  ok(select.props.disabled === false, 'a picker holding people opens');
  const options = optionsOf(select);
  ok(options.length === 3, 'one row per person, plus the placeholder');
  ok(/choose guide/i.test(options[0].text), 'the placeholder invites a choice');
  ok(options[1].text === 'Ana Cruz' && options[2].text === 'Joel Reyes',
     'and every person is drawn by name');
  ok(options[1].value === 'a' && options[2].value === 'b',
     'carrying the id the form actually submits');
}

// ---------------------------------------------------------------------------
// 4. A PERSON WITH NO NAME IS STILL A ROW YOU CAN SEE
// ---------------------------------------------------------------------------
//
// Nobody in this church has a blank name today. That is a fact about the data
// rather than a promise about it, and an option whose text is empty draws as a
// blank line -- the same  report arriving by a second
// route, and one that would be far harder to recognise.
{
  for (const blank of [null, '', '   ', undefined]) {
    const options = optionsOf(findSelect(render([person('x', blank)], false)));
    ok(options[1].text.trim() !== '',
       `a person whose name is ${JSON.stringify(blank)} still draws something readable`);
  }
  const options = optionsOf(findSelect(render([person('x', '  Ana Cruz  ')], false)));
  ok(options[1].text === 'Ana Cruz', 'and a padded name is trimmed rather than shown as typed');
}

// ---------------------------------------------------------------------------
// 5. THE FORM ACTUALLY TELLS IT WHICH STATE IT IS IN
// ---------------------------------------------------------------------------
//
// Every check above passes on a component nobody hands `loading` to, which is
// exactly the shape the bug had: the flag existed on the page and was used for
// two other lists while this form was drawn regardless.
{
  const admin = read('components/live/AdminPage.tsx');
  const wired = (admin.match(/loading=\{loading\}/g) ?? []).length;
  ok(wired >= 2, `both pairing pickers are told whether the page is loading (found ${wired})`);

  const form = admin.slice(admin.indexOf('Pair a Guide and Explorer'));
  const upTo = form.slice(0, form.indexOf('</form>'));
  ok((upTo.match(/<SelectPerson/g) ?? []).length === 2, 'the form has the two pickers');
  ok((upTo.match(/loading=\{loading\}/g) ?? []).length === 2,
     'and neither of them is the one that was forgotten');
}

// ---------------------------------------------------------------------------
// 5. TYPING A NAME, WHICH IS WHY THE BOX EXISTS
// ---------------------------------------------------------------------------
//
// Reported by Directors. This church has 42 Explorers with no Guide and 39
// Guides carrying nobody, so both pickers are around forty entries: a native
// select is right at five and a scroll at forty, and a Director looking for
// somebody already has their name.
{
  const many = Array.from({ length: 12 }, (_, i) => person(`p${i}`, `Person ${i}`));
  const withMaria = [...many, person('maria', 'Maria Santos')];

  // The box appears only once the list is long enough to need it.
  const shortOne = render([person('a', 'Ana')], false);
  const hasBox = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'input' && node.props?.type === 'search') return true;
    return (node.children ?? []).some(hasBox);
  };
  ok(!hasBox(shortOne), 'a short list gets no search box');
  ok(hasBox(render(withMaria, false)), 'a long one does');

  // AND IT ACTUALLY NARROWS.
  typed = 'maria';
  const narrowed = optionsOf(findSelect(render(withMaria, false)));
  typed = '';
  ok(narrowed.some((o) => o.text.includes('Maria Santos')),
     'typing a name keeps the person who matches');
  ok(!narrowed.some((o) => o.text.includes('Person 3')),
     'and drops the people who do not');

  // THE CHOSEN PERSON SURVIVES A SEARCH THAT NO LONGER MATCHES THEM.
  //
  // Without this the selected option leaves the list while the value stays set,
  // so the box draws blank while still holding somebody -- the control
  // disagreeing with itself, and a Director pairing the wrong person because it
  // looked empty.
  typed = 'zzz';
  const stillThere = optionsOf(findSelect(render(withMaria, false, { value: 'maria' })));
  typed = '';
  ok(stillThere.some((o) => o.value === 'maria'),
     'somebody already chosen stays in the list even when the words stop matching them');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);