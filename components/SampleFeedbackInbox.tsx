'use client';

// The sample's Feedback inbox: the live inbox's screen, reading the feedback
// sent from this device (lib/feedback/on-this-device.ts), so the walkthrough
// shows a Director exactly what they will do with real feedback.

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { APP_NAME, SOURCE_URL } from '@/lib/brand';
import { BUILD_ID } from '@/lib/build-info';
import { FeedbackReviewInbox, type InboxActions } from '@/components/FeedbackReviewInbox';
import { readDeviceFeedback, saveDeviceReview, setDeviceStatus, type DeviceFeedback } from '@/lib/feedback/on-this-device';

export function SampleFeedbackInbox() {
  const [items, setItems] = useState<DeviceFeedback[] | null>(null);
  const load = useCallback(() => setItems(readDeviceFeedback()), []);
  useEffect(() => { load(); }, [load]);

  const actions: InboxActions = {
    async saveReview(id, review) { saveDeviceReview(id, review); load(); },
    async setStatus(id, status, extra) { setDeviceStatus(id, status, extra); load(); },
  };

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-2xl font-extrabold text-navy">📣 What people have told you</h2>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">
        Read it, write it up in your own words, and hand it on: fix it yourself, send it
        to a developer, or give it to an AI tool. The person who sent it sees what became
        of it. In this walkthrough it is the feedback sent from this device.
      </p>
      <div className="mt-4">
        <FeedbackReviewInbox
          items={(items ?? []).map((f) => ({ ...f, authorName: null }))}
          actions={actions}
          sourceUrl={SOURCE_URL}
          version={BUILD_ID}
          app={APP_NAME}
          loading={items === null}
        />
      </div>
    </Card>
  );
}
