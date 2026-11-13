'use client';

// The renderer for lib/linkify.ts.
//
// The rules about what may become a link live in lib/linkify.ts, which is plain
// TypeScript with no JSX so the tests can import and exercise them directly.
// This file is only the drawing.

import type { ReactNode } from 'react';
import { linkifyParts } from '@/lib/linkify';

/**
 * User-written text with its links made tappable.
 *
 * Drop-in for `{someText}` inside whatever element already styles it, so
 * `whitespace-pre-wrap` and friends keep working exactly as before.
 *
 * `rel="noopener noreferrer"` is not optional. Without `noopener`, the page
 * opened gets a handle on this one through window.opener and can navigate it
 * somewhere else — a phishing move that works even from a link somebody trusted
 * enough to tap. `noreferrer` keeps the church's address out of the other
 * site's logs.
 */
export function Linked({ text }: { text: string }): ReactNode {
  const parts = linkifyParts(text);

  // Nothing to do — return the string so the common case adds no elements.
  if (parts.length === 1 && typeof parts[0] === 'string') return text;

  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <a
            key={`${part.href}-${i}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
          >
            {part.label}
          </a>
        ),
      )}
    </>
  );
}
