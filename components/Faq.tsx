'use client';

// The questions people ask, drawn the same way wherever they are read: on the
// page anybody can open before signing in (/faq), and in Settings, Help, in the
// sample church and in a real one. The answers live in lib/faq.ts.
//
// SIMPLE ON PURPOSE. A search box, the questions under their headings, and an
// answer that opens under the question tapped. Each question is a native
// <details>, so it opens with a tap, a click or the keyboard, a screen reader
// announces it as something that expands, and it works before any script has
// loaded. Nothing animates.
//
// A LINK TO ONE ANSWER WORKS. /faq#faq-sign-out opens that answer and brings it
// into view, so a Director can send somebody straight to it.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { faqCount, faqSections, type FaqItem, type FaqLink } from '@/lib/faq';
import { scrollMotion } from '@/lib/motion';
import { Card } from '@/components/ui';

const HASH = 'faq-';

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

function matches(item: FaqItem, query: string[]): boolean {
  if (query.length === 0) return true;
  const hay = `${item.q} ${item.a.join(' ')}`.toLowerCase();
  return query.every((w) => hay.includes(w));
}

function AnswerLink({ link }: { link: FaqLink }) {
  const cls = 'font-semibold text-navy underline underline-offset-4';
  return link.href.startsWith('/')
    ? <Link href={link.href} className={cls}>{link.label}</Link>
    : <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>{link.label} ↗</a>;
}

export function Faq({ inSettings = false }: { inSettings?: boolean }) {
  const sections = useMemo(() => faqSections(), []);
  const total = useMemo(() => faqCount(sections), [sections]);
  const [query, setQuery] = useState('');
  const q = words(query);

  const shown = sections
    .map((s) => ({ ...s, items: s.items.filter((item) => matches(item, q)) }))
    .filter((s) => s.items.length > 0);
  const found = faqCount(shown);
  // A search that leaves three answers or fewer opens them: somebody who typed
  // "password" wants the answer, not another list to tap through.
  const openAll = q.length > 0 && found <= 3;

  // Arriving at /faq#faq-<id>, or following such a link while already here:
  // open that answer and bring it into view. Only the hash changes in the
  // second case, so nothing mounts again; the hashchange event is the only
  // thing that says so.
  useEffect(() => {
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith(HASH)) return;
      const el = document.getElementById(id);
      if (!(el instanceof HTMLDetailsElement)) return;
      el.open = true;
      el.scrollIntoView({ block: 'start', behavior: scrollMotion() });
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  const Heading = inSettings ? 'h3' : 'h2';

  return (
    <div className="space-y-6" data-faq>
      <div>
        <label htmlFor="faq-search" className="sr-only">Search the questions</label>
        <input
          id="faq-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Search the questions"
          className="tap w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-teal-600"
          data-faq-search
        />
        <p className="mt-2 text-sm text-gray-600" role="status" aria-live="polite" data-faq-count>
          {q.length === 0
            ? `${total} questions, in ${sections.length} groups. Tap one to read the answer.`
            : found === 0
              ? `Nothing matches “${query.trim()}”.`
              : `${found} of ${total} questions match “${query.trim()}”.`}
        </p>
      </div>

      {shown.map((section) => (
        <section key={section.id} aria-labelledby={`faq-group-${section.id}`} data-faq-group={section.id}>
          <Heading id={`faq-group-${section.id}`} className="mb-2 flex items-center gap-2 text-lg font-bold text-navy">
            <span aria-hidden>{section.icon}</span>
            {section.title}
          </Heading>
          <div className="divide-y divide-gray-200 rounded-2xl bg-white px-4 ring-1 ring-navy/10">
            {section.items.map((item) => (
              <details key={item.id} id={`${HASH}${item.id}`} open={openAll || undefined} className="group" data-faq-item={item.id}>
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold text-navy [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <span aria-hidden className="shrink-0 text-xl leading-none text-gray-500 group-open:rotate-90">›</span>
                </summary>
                <div className="space-y-2 pb-4 text-gray-700" data-faq-answer>
                  {item.a.map((para, i) => <p key={i}>{para}</p>)}
                  {item.links?.length ? (
                    <p className="flex flex-wrap gap-x-4 gap-y-1">
                      {item.links.map((link) => <AnswerLink key={link.href} link={link} />)}
                    </p>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="text-sm text-gray-600">
        {inSettings
          ? 'Still have a question? Ask a Director at your church.'
          : 'Still have a question? Ask whoever at your church invited you.'}
      </p>
    </div>
  );
}

/**
 * The same answers inside the app, in Settings, Help, for both halves. The
 * wrapper carries the anchor because Card takes no data attribute it does not
 * name, and `/settings#faq` lands on the Help folder (see each settings page's
 * useRoom translations).
 */
export function FaqCard() {
  return (
    <div id="faq" data-faq-card>
      <Card className="p-5">
        <h2 className="mb-1 text-xl font-bold text-navy">❓ Questions people ask</h2>
        <p className="mb-4 text-sm text-gray-600">
          The same answers anybody can read before signing in.{' '}
          <Link href="/faq" className="font-semibold text-navy underline underline-offset-4">
            Open them on their own page
          </Link>{' '}
          to send somebody a link.
        </p>
        <Faq inSettings />
      </Card>
    </div>
  );
}
