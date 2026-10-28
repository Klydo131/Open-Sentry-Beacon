'use client';

// What people have actually said, where somebody can read it.
//
// THE BUG BEHIND THIS SCREEN: "Feedback is not working, I am pretty sure some
// feedbacks are still stuck in the database since I haven't received any email
// feedbacks." Nothing was stuck. `setFeedbackSink` was never called anywhere,
// so every message went to the default sink, which honestly saves to the
// sender's own browser -- and there was no feedback table for anything to be
// stuck in. The messages are on the phones that wrote them.
//
// Sending it somewhere was half the fix. This is the other half: a place to
// read it. A table nobody opens is the same complaint one level down.
//
// NOT AN EMAIL, and worth saying because email is what was expected. The
// built-in mailer allows about two messages an hour for the whole project, so
// feedback routed through it would be dropped on exactly the days worth hearing
// about. This arrives instantly and cannot be rate limited.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_FEEDBACK } from '@/lib/live/keep-up';
import * as live from '@/lib/live/data';
import { Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';
import { APP_NAME, SOURCE_URL } from '@/lib/brand';
import { BUILD_ID } from '@/lib/build-info';
import { FeedbackReviewInbox, type InboxActions, type InboxItem } from '@/components/FeedbackReviewInbox';

// SINCE 28 OCTOBER 2026 A PERSON WRITES IT UP AND HANDS IT ON (lib/feedback/
// hand-on.ts): to themselves, to a developer, or to an AI tool, and the
// sender sees what became of it. The screen is shared with the sample's inbox
// (components/FeedbackReviewInbox.tsx); this half reads and writes the
// church's database.

const asItem = (f: live.Feedback): InboxItem => ({
  id: f.id,
  category: f.category,
  message: f.message,
  contact: f.contact,
  page: f.page,
  build: f.build,
  createdAt: f.created_at,
  authorName: f.author_name ?? null,
  status: f.status,
  reply: f.reply,
  fixedIn: f.fixed_in,
  review: f.review,
});

export function LiveFeedbackInbox() {
  const [items, setItems] = useState<live.Feedback[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setItems(await live.listFeedback()); setError(''); }
    catch (cause) { setItems([]); setError(humanError(cause, 'Something went wrong.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something, a write-up included.
  useKeepUp(KEEP_UP_FEEDBACK, load);

  const actions: InboxActions = {
    async saveReview(id, review) {
      const item = items?.find((f) => f.id === id);
      if (!item) throw new Error('That feedback is no longer here. Reload the page.');
      await live.saveFeedbackReview(item, review);
      await load();
    },
    async setStatus(id, status, extra) {
      await live.setFeedbackStatus(id, status, extra);
      await load();
    },
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-teal-800/10 wash-teal-sky p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-2xl shadow-sm">📣</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">Feedback</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">What people have told you</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              Read it, write it up in your own words, and hand it on: fix it yourself, send
              it to a developer, or give it to an AI tool. The person who sent it sees what
              became of it.
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <FeedbackReviewInbox
          items={(items ?? []).map(asItem)}
          actions={actions}
          sourceUrl={SOURCE_URL}
          version={BUILD_ID}
          app={APP_NAME}
          error={error}
          loading={items === null}
        />
      </div>
    </Card>
  );
}
