// A case's record as a plain text file, for printing or keeping.
//
// PLAIN TEXT ON PURPOSE. A record that needs this app to read it is not a
// record anybody can check. Every statement and exhibit carries its SHA-256,
// and the chain carries every hash, so the file can be checked years from now
// with nothing but a SHA-256 tool and the instructions at its end
// (docs/COURT-ROOM.md says the same in more words).

import type { CourtCaseFull, RecordCheck } from '@/lib/live/court';
import { ACT_WORDS } from '@/lib/court/forensics';

const VERDICT: Record<string, string> = {
  dismissed: 'Dismissed',
  counselled: 'Counselled',
  suspended: 'Suspended',
  removed: 'Removed from the church',
};

const RECOMMENDATION: Record<string, string> = {
  dismiss: 'Dismiss the case',
  counsel: 'Counsel, with no change to their account',
  suspend: 'Suspend them',
  remove: 'Remove them from the church',
};

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '');

export function recordText(full: CourtCaseFull, check: RecordCheck | null, savedBy: string): string {
  const c = full.case;
  const lines: string[] = [];
  const rule = '-'.repeat(72);
  lines.push('THE RECORD OF A CASE', rule);
  lines.push(`In the matter of: ${c.subject_name}`);
  lines.push(`What it is about: ${c.summary}`);
  lines.push(`Opened: ${when(c.opened_at)} by ${c.opener_name}`);
  lines.push(`Judge: ${c.judge_name}`);
  lines.push(`Status: ${c.status === 'open' ? 'In session'
    : c.status === 'with_board' ? `Heard ${when(c.heard_at)}, waiting for the Church Board's ruling`
    : `Decided, ${when(c.closed_at)}`}`);
  if (c.recommendation) {
    lines.push(`The judge recommended: ${RECOMMENDATION[c.recommendation] ?? c.recommendation}`
      + `${c.recommendation_note ? ` -- ${c.recommendation_note}` : ''}`);
  }
  if (c.ruling_words && c.verdict) {
    lines.push(`Ruling of the Church Board: ${VERDICT[c.verdict] ?? c.verdict}, presented ${c.ruling_presented_on ?? ''}`
      + ` by ${c.ruling_presented_by ?? 'the Church Board'}, written down by ${c.ruling_recorded_name ?? 'Someone'}`);
    lines.push(...c.ruling_words.split('\n').map((l) => `   ${l}`));
  } else if (c.verdict) {
    lines.push(`Verdict: ${VERDICT[c.verdict] ?? c.verdict}${c.verdict_note ? ` -- ${c.verdict_note}` : ''}`);
  }
  if (c.seal_hash) lines.push(`Seal (SHA-256 of the record's entry that closed the hearing): ${c.seal_hash}`);
  lines.push(`Case id: ${c.id}`);
  lines.push(`Saved: ${when(new Date().toISOString())} by ${savedBy}`);
  if (check) {
    lines.push(`Record check by the database when saved: ${check.holds ? 'HOLDS' : 'DOES NOT HOLD'}, `
      + `${check.entries} entries, last hash ${check.head}`);
  }

  lines.push('', 'WHAT WAS SAID', rule);
  full.statements.forEach((s, i) => {
    const who = s.for_name ? `${s.for_name} (written down by ${s.author_name})` : s.author_name;
    lines.push(`${i + 1}. ${when(s.at)} -- ${who}`);
    lines.push(...s.body.split('\n').map((l) => `   ${l}`));
    lines.push(`   SHA-256 of the words: ${s.sha256}`);
  });
  if (!full.statements.length) lines.push('Nothing has been said yet.');

  lines.push('', 'EXHIBITS', rule);
  for (const e of full.exhibits) {
    lines.push(`Exhibit ${e.label}: ${e.title}`);
    lines.push(`   Entered ${when(e.entered_at)} by ${e.entered_name}${e.shown_to === 'bench' ? ' (shown to the judge and the gallery only)' : ''}`);
    if (e.kind === 'file') lines.push(`   File: ${e.file_name}, ${e.size_bytes} bytes, ${e.mime ?? 'unknown type'}`);
    if (e.note) lines.push(`   Note: ${e.note}`);
    if (e.kind === 'writing' && e.writing) lines.push(...e.writing.split('\n').map((l) => `   | ${l}`));
    lines.push(`   SHA-256: ${e.sha256}`);
  }
  if (!full.exhibits.length) lines.push('No exhibits.');

  if (full.record) {
    lines.push('', 'THE CHAIN OF CUSTODY', rule);
    for (const r of full.record) {
      lines.push(`#${r.seq} ${when(r.at)} -- ${r.actor_name} -- ${ACT_WORDS[r.act] ?? r.act}`);
      if (r.detail) lines.push(`   ${r.detail}`);
      lines.push(`   time (microseconds): ${r.at_us}   actor id: ${r.actor_id ?? ''}   act: ${r.act}`);
      lines.push(`   about: ${r.about}`);
      lines.push(`   previous: ${r.prev_hash}`);
      lines.push(`   hash:     ${r.hash}`);
    }
  }

  lines.push('', 'HOW TO CHECK THIS FILE', rule,
    'A statement: its SHA-256 is the SHA-256 of its words exactly as written (UTF-8).',
    'A file exhibit: its SHA-256 is the SHA-256 of the file. On a computer:',
    '   sha256sum photo.jpg            (Linux)',
    '   shasum -a 256 photo.jpg        (Mac)',
    '   certutil -hashfile photo.jpg SHA256   (Windows)',
  );
  if (full.record) {
    lines.push(
      'The chain: each entry\'s hash is the SHA-256 of these eight lines joined by a',
      'newline (no newline after the last): previous hash, position, time in',
      'microseconds, actor id (or nothing), actor name, act, about, detail.',
      'The first entry\'s previous hash is the SHA-256 of "Hope Beacon court record",',
      'a newline, and the case id. Change any entry and every hash after it changes.',
    );
  }
  return lines.join('\n') + '\n';
}
