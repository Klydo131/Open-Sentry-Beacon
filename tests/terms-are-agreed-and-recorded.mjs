// The Terms of Use and the Privacy Notice are agreed to properly, and recorded.
//
// 28 October 2026, asked for: "update our UI for agreeing on 'Terms' and
// 'Privacy Policy'. I want all of those to be handled professionally so that
// we won't face any legalities in the future." lib/legal.ts says what
// "professionally" means here, point by point; this keeps each point true in
// the source:
//
//   * the rules in lib/legal.ts answer as they say they do;
//   * the box starts unticked, links both documents, and every form's button
//     waits for it;
//   * it is a box of its own, beside the permission to keep sensitive
//     information, never folded into it;
//   * what is recorded is the versions, and the browser never writes when;
//   * a raised version stops everybody at the door, on both halves of the app;
//   * the documents say their version, promise nothing the app does not do,
//     and name no real person.
//
// supabase/tests/what-was-agreed-is-recorded.sql proves the database half, and
// tests/e2e/the-terms-are-agreed.js walks it.
//
//   node tests/terms-are-agreed-and-recorded.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-legal-'));
const bundle = path.join(out, 'legal.mjs');
await build({
  entryPoints: [path.join(root, 'lib/legal.ts')],
  outfile: bundle,
  bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
});
const L = await import(pathToFileURL(bundle).href);
fs.rmSync(out, { recursive: true, force: true });

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// ---- THE RULES ------------------------------------------------------------------
const current = { terms_version: L.TERMS_VERSION, privacy_version: L.PRIVACY_VERSION };
ok(/^\d{4}-\d{2}-\d{2}$/.test(L.TERMS_VERSION) && /^\d{4}-\d{2}-\d{2}$/.test(L.PRIVACY_VERSION),
  `each version is a date (${L.TERMS_VERSION}, ${L.PRIVACY_VERSION})`);
ok(L.TERMS_VERSION.length <= 40 && L.PRIVACY_VERSION.length <= 40, 'and fits the column the database keeps it in');
ok(L.hasAgreedToCurrent(current), 'agreeing to both current versions counts');
ok(!L.hasAgreedToCurrent({ ...current, privacy_version: '2000-01-01' }), 'an older Privacy Notice does not');
ok(!L.hasAgreedToCurrent({ ...current, terms_version: '2000-01-01' }), 'nor older Terms');
ok(!L.hasAgreedToCurrent(null) && !L.hasAgreedToCurrent({}), 'nor nothing at all');
ok(L.agreedToEarlier({ ...current, terms_version: '2000-01-01' }) && !L.agreedToEarlier({}) && !L.agreedToEarlier(current),
  'somebody who agreed to an earlier version is told what changed; a newcomer and the current are not');
ok(!L.canRecordAgreement({ id: 'x', consent_at: null }) && L.canRecordAgreement({ id: 'x', terms_version: null }),
  'nobody is stopped for an agreement the database cannot record yet');
ok(L.legalHref('terms') === '/terms' && L.legalHref('privacy', 'a b') === '/privacy?church=a%20b',
  'a link to a document carries the church, encoded');
const whole = { name: 'C', legal_name: 'C Inc.', legal_address: '1 Example Road', dpo_name: 'An Officer', dpo_email: 'x@example.org' };
ok(L.legalComplete(whole) && !L.legalComplete({ ...whole, dpo_name: '  ' }) && !L.legalComplete({ ...whole, legal_address: null }),
  'a church is named in full only with its legal name and address, its officer and their email');
ok(Array.isArray(L.WHAT_CHANGED) && L.WHAT_CHANGED.length > 0 && L.WHAT_CHANGED.every((s) => s.trim().length > 10),
  'what changed is said in words');

// ---- THE BOX --------------------------------------------------------------------
const box = read('components/AgreementBox.tsx');
ok(!/defaultChecked|checked=\{true\}|checked\s*\n/.test(box) && /checked=\{checked\}/.test(box),
  'the box is ticked only by the person: no box arrives ticked');
ok(/legalHref\('terms'/.test(box) && /legalHref\('privacy'/.test(box), 'it links both documents');
ok((box.match(/target="_blank" rel="noopener"/g) || []).length === 2, 'each opening beside the form, so what was typed is kept');
ok(/LEGAL_EFFECTIVE/.test(box), 'and says which versions are being agreed to');
ok(!/consent_at|ConsentWording|sensitive/i.test(box.replace(/^\s*\/\/.*$/gm, '')),
  'it is not the permission to keep sensitive information');

// ---- EVERY FORM WAITS FOR IT ------------------------------------------------------
const sampleJoin = read('app/join/page.tsx');
const liveJoin = read('components/live/DoorPages.tsx');
const step = read('components/live/ConsentStep.tsx');
const notice = read('components/AgreementNotice.tsx');
ok(/<AgreementBox[^>]*checked=\{agreed\}/.test(sampleJoin) && /disabled=\{[^}]*!consent[^}]*!agreed[^}]*\}/.test(sampleJoin),
  'the sample invitation form: two boxes, and its button waits for both');
ok(/<AgreementBox[^>]*checked=\{agreed\}/.test(liveJoin) && /disabled=\{busy \|\| !consent \|\| !agreed\}/.test(liveJoin),
  'the live invitation form: the same');
ok(/if \(!agreed\)/.test(liveJoin), 'and the live form checks again when it is sent, not only on the button');
ok(/<AgreementBox/.test(step) && /const ready = \(!needsConsent \|\| agreed\) && \(!needsTerms \|\| termsAgreed\)/.test(step),
  'the live agreement step waits for each box it shows');
ok(/<AgreementBox checked=\{agreed\}/.test(notice) && /disabled=\{!agreed\}/.test(notice),
  'the sample agreement step waits too');
ok(/sign me out/i.test(notice) && /sign me out|Sign out/i.test(step),
  'and both offer a way out for somebody who does not agree');

// ---- WHAT IS RECORDED --------------------------------------------------------------
const data = read('lib/live/data.ts');
const allow = data.slice(data.indexOf('const safe = {'), data.indexOf('};', data.indexOf('const safe = {')));
ok(/terms_version: patch\.terms_version/.test(allow) && /privacy_version: patch\.privacy_version/.test(allow),
  'a person’s own update carries the versions they agreed to');
ok(!/terms_agreed_at/.test(allow), 'and never when: the database stamps that');
ok(/\.\.\.\(recordsTerms \? \{ terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION \} : \{\}\)/.test(liveJoin),
  'the live join records them only once the database can');
const store = read('lib/demo/store.tsx');
ok(/agreeToCurrentTerms/.test(store) && /terms_version: TERMS_VERSION/.test(store), 'the sample records them as well');
const migration = read('supabase/migrations/20261028120000_what_was_agreed_is_recorded.sql');
ok(/grant update \(terms_version, privacy_version\) on public\.profiles to authenticated/.test(migration)
   && !/grant update \([^)]*terms_agreed_at/.test(migration),
  'the database lets a person write the versions and not the time');
ok(/new\.terms_agreed_at := now\(\)/.test(migration), 'and stamps the time itself');

// ---- A RAISED VERSION ASKS AGAIN ----------------------------------------------------
const shell = read('components/LiveAppShell.tsx');
const host = read('components/ConsentHost.tsx');
ok(/const needsTerms = canRecordAgreement\(profile\) && !hasAgreedToCurrent\(profile\)/.test(shell) && /needsTerms\)/.test(shell),
  'the live app stops anybody who has not agreed to the current versions');
ok(/!hasAgreedToCurrent\(currentUser\)\) return <AgreementNotice/.test(host), 'and so does the sample');

// ---- THE DOCUMENTS ----------------------------------------------------------------
const terms = read('app/terms/page.tsx');
const privacy = read('app/privacy/page.tsx');
ok(/TERMS_VERSION/.test(terms) && /LEGAL_EFFECTIVE/.test(terms) && /PRIVACY_VERSION/.test(privacy),
  'each document says which version it is');
ok(/laws of the Republic of the Philippines/.test(terms), 'the Terms say which law governs them');
ok(!/withdraw/i.test(terms.replace(/^\s*\/\/.*$/gm, '')),
  'the Terms promise no withdrawal of permission the app does not offer (removed in 0035; leaving is how)');
ok(/not legal advice/i.test(terms) && /lawyer|somebody qualified/i.test(terms),
  'and say they are a draft for somebody qualified to check');
ok(/ChurchLegalLine/.test(terms) && /ChurchLegalLine/.test(privacy),
  'both name the church from its own setting');
// Reserved for examples (RFC 2606 and 6761): anything else could be somebody's.
const fictional = (domain) => /(^|\.)example\.(org|com|net)$|\.(example|test|invalid|localhost)$/i.test(domain);
const real = [];
// The sample's legal details, not the whole sample: its pretend mail has a
// sender address of its own, which is no person's.
const seed = read('lib/demo/seed.ts');
const seedLegal = seed.slice(seed.indexOf('church_legal: {'), seed.indexOf('}', seed.indexOf('church_legal: {')));
const texts = { 'app/terms/page.tsx': read('app/terms/page.tsx'), 'app/privacy/page.tsx': read('app/privacy/page.tsx'),
  'lib/legal.ts': read('lib/legal.ts'), 'components/ChurchLegal.tsx': read('components/ChurchLegal.tsx'),
  'lib/demo/seed.ts (church_legal)': seedLegal };
ok(/legal_address: '/.test(seedLegal) && /dpo_email: '/.test(seedLegal), 'the sample church gives an address and names a Data Protection Officer');
for (const [f, text] of Object.entries(texts)) {
  for (const [address, domain] of text.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)) {
    if (!fictional(domain)) real.push(`${f}: ${address}`);
  }
}
ok(real.length === 0, `no document, and not the sample, carries a real address${real.length ? ` (${real.join(', ')})` : ''}`);
ok(/'\/terms'/.test(read('app/sw.js/route.ts')), 'the Terms open without a signal, like the Privacy Notice');

console.log(bad ? `\n${bad} check(s) failed` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
