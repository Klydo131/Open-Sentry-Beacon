// The little bit of formatting people already write, actually shown.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. It was reported with a photograph.
//
// A study on the shelf read, on a real phone:
//
//     **Read:** Mark 2, verses 23 to 28.
//     **To think about:** what would a day genuinely built for your good...
//     **Where this comes from:** *The Desire of Ages* has a chapter...
//
// Every asterisk on screen. The person writing those studies was formatting
// them the way anybody formats text in 2026, and the app was printing the marks
// instead of obeying them. The heading of each section -- the single thing that
// makes a study skimmable -- was the most damaged part, because it is the part
// that was marked up.
//
// This is not a hypothetical about future authors. Counted in the live table:
// FIFTEEN of sixteen studies use `**bold**` and TEN use `*italic*`.
// ---------------------------------------------------------------------------
//
// WHAT IS SUPPORTED, AND WHY THE LIST IS THIS SHORT.
//
// Bold, italic, and the links lib/linkify.ts already found. That is all, and it
// is not laziness -- it is what the studies actually contain. Counted in the
// same table: ZERO headings, ZERO bullet lists, ZERO numbered lists, ZERO
// markdown links, ZERO backticks, ZERO block quotes, and ZERO underscores.
//
// Every rule beyond the ones people use is a new way for ordinary prose to come
// out wrong. `#` opens a heading and is also how somebody writes "#1". A `-` at
// the start of a line opens a list and is also how somebody starts a dash. The
// cost of those rules is paid by every author who was not thinking about
// markdown, to benefit nobody who is currently writing.
//
// `_` deserves its own note, because it nearly went in. The first count said
// all sixteen studies contained an underscore, which would have made
// `_italic_` worth supporting. That count was wrong: in SQL `LIKE '%_%'` the
// underscore is a SINGLE-CHARACTER WILDCARD, so the pattern asks "is there at
// least one character" and every row says yes. There is not one underscore in
// any study. Supporting it would have been a rule with no users that mangles
// every address containing `a_b`.
//
// ---------------------------------------------------------------------------
// IT PRODUCES DATA, NEVER MARKUP.
//
// The obvious implementation of "render markdown" is to build an HTML string
// and hand it to dangerouslySetInnerHTML. That is the single most common way an
// app of this shape gets a stored cross-site scripting hole, and here the text
// is written by one member and read by another -- a Guide writing for the
// Explorer they walk with, which is exactly the relationship the reports and
// the trial room exist to police.
//
// So this returns plain objects. The renderer turns them into React elements
// and React escapes every string it draws. There is no path from what an author
// types to markup, whatever they type. Links keep going through
// lib/linkify.ts, which parses each address and permits exactly two protocols.
// ---------------------------------------------------------------------------

import { linkifyParts } from './linkify';

/** One run of text, with whatever is true about it. */
export interface Span {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Present when this run is a link. The address, already checked. */
  href?: string;
}

interface Marked {
  text: string;
  bold: boolean;
  italic: boolean;
}

/**
 * One emphasis pass over already-split segments.
 *
 * Run for `**` first and then for `*`, which is what lets italic live inside
 * bold: the bold pass hands on its inner text unexamined, and the italic pass
 * looks at it like any other run. Doing it the other way round would let a
 * single `*` eat the first star of a `**` pair.
 */
function pass(segments: Marked[], marker: string, field: 'bold' | 'italic'): Marked[] {
  const out: Marked[] = [];

  for (const segment of segments) {
    // Already carrying this mark: nothing to find, and re-scanning would let
    // `**a**b**` reopen inside its own result.
    if (segment[field]) { out.push(segment); continue; }

    let plain = '';
    let i = 0;
    const flush = () => {
      if (plain) out.push({ ...segment, text: plain });
      plain = '';
    };

    while (i < segment.text.length) {
      if (segment.text.startsWith(marker, i)) {
        const from = i + marker.length;
        const end = segment.text.indexOf(marker, from);
        const inner = end === -1 ? '' : segment.text.slice(from, end);

        // THREE CONDITIONS, AND EACH ONE IS A REAL SENTENCE THAT WOULD
        // OTHERWISE BE MANGLED.
        //
        //   closed      -- `**unfinished` stays exactly as typed rather than
        //                  swallowing the rest of the study.
        //   not empty   -- `**` and `****` are not an emphasis of nothing.
        //   no space at -- "2 * 3 * 4" is arithmetic, not italics, and this is
        //   either end     the condition that tells the two apart. A marker
        //                  that opens a run is followed by the word it marks;
        //                  a stray asterisk is followed by a space.
        //   one paragraph -- a marker left open at the top of a study must not
        //                  reach down and bold everything under it.
        const usable =
          end !== -1
          && inner !== ''
          && !/^\s/.test(inner)
          && !/\s$/.test(inner)
          && !inner.includes('\n\n');

        if (usable) {
          flush();
          out.push({ ...segment, text: inner, [field]: true });
          i = end + marker.length;
          continue;
        }
      }

      plain += segment.text[i];
      i += 1;
    }

    flush();
  }

  return out;
}

/**
 * Text as a flat list of runs: what it says, and what is true about each part.
 *
 * Flat on purpose. A tree would be the general answer, and the renderer would
 * then need to walk it; there are two marks and they compose in one way, so a
 * span carrying both booleans says everything a tree would and can be drawn by
 * a `map`.
 */
export function richParts(text: string): Span[] {
  const marked = pass(pass([{ text, bold: false, italic: false }], '**', 'bold'), '*', 'italic');

  const spans: Span[] = [];
  for (const segment of marked) {
    // Links are found INSIDE each run rather than before the emphasis passes,
    // so an address inside `**...**` is still a link and an asterisk inside an
    // address cannot be mistaken for a marker.
    for (const part of linkifyParts(segment.text)) {
      if (typeof part === 'string') {
        if (part) spans.push({ text: part, bold: segment.bold, italic: segment.italic });
      } else {
        spans.push({
          text: part.label,
          bold: segment.bold,
          italic: segment.italic,
          href: part.href,
        });
      }
    }
  }
  return spans;
}
