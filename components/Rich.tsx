'use client';

// The renderer for lib/rich-text.ts.
//
// The rules about what becomes bold, italic or a link live in lib/rich-text.ts
// and lib/linkify.ts, which are plain TypeScript with no JSX so the tests can
// import and exercise them directly. This file is only the drawing.
//
// A DROP-IN FOR `<Linked>`, and the difference is the point. `<Linked>` is for
// text somebody typed into a message box: a chat line, a prayer request, a note
// under a ministry. Nobody writes `**` in those, and turning asterisks into
// formatting there would surprise the person who typed one.
//
// This is for text somebody WROTE -- a study, meant to be read later by
// somebody else, with sections and emphasis. Fifteen of the sixteen studies on
// the shelf already carry that formatting and were showing it as asterisks.

import type { ReactNode } from 'react';
import { richParts } from '@/lib/rich-text';

/**
 * A study, drawn the way it was written.
 *
 * Sits inside whatever element already styles it, so `whitespace-pre-wrap` and
 * friends keep working exactly as before.
 *
 * `rel="noopener noreferrer"` is not optional. Without `noopener`, the page
 * opened gets a handle on this one through window.opener and can navigate it
 * somewhere else -- a phishing move that works even from a link somebody
 * trusted enough to tap. `noreferrer` keeps the church's address out of the
 * other site's logs.
 */
export function Rich({ text }: { text: string }): ReactNode {
  const spans = richParts(text);

  // Nothing to mark up -- hand back the string so the common case adds no
  // elements at all.
  if (spans.length === 1 && !spans[0].bold && !spans[0].italic && !spans[0].href) {
    return text;
  }

  return (
    <>
      {spans.map((span, i) => {
        // Built inside out so bold and italic compose without four branches.
        let node: ReactNode = span.href ? (
          <a
            href={span.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
          >
            {span.text}
          </a>
        ) : (
          span.text
        );
        if (span.italic) node = <em>{node}</em>;
        if (span.bold) node = <strong className="font-bold text-navy">{node}</strong>;

        return <span key={`${i}-${span.text.slice(0, 12)}`}>{node}</span>;
      })}
    </>
  );
}
