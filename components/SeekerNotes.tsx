'use client';

import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { Card, Button } from '@/components/ui';

// A missionary's private journal about one seeker.
//
// Nobody else can read these — not the seeker, not an admin.
// That is the whole point: a missionary needs somewhere to write "his father is
// ill, don't push the study this week" without it becoming a church record.
// Every read is filtered on author_id, so a note never leaves its author.
export function SeekerNotes({
  pairingId,
  seekerName,
}: {
  pairingId: string;
  seekerName: string;
}) {
  const { db, userId, addNote, deleteNote } = useDemo();
  const [body, setBody] = useState('');

  const mine = db.seeker_notes
    .filter((n) => n.pairing_id === pairingId && n.author_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const save = () => {
    if (!body.trim()) return;
    addNote(pairingId, body);
    setBody('');
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">🔒 Private notes</h2>
      <p className="mb-4 text-sm text-gray-500">
        Only you can see these. {seekerName} never sees your notes, and neither
        does your admin.
      </p>

      <div className="rounded-xl bg-gray-50 p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={`What should you remember about ${seekerName}?`}
          className="w-full resize-y rounded-xl bg-white px-4 py-3 text-base outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold"
        />
        <div className="mt-2">
          <Button variant="gold" disabled={!body.trim()} onClick={save}>
            Save note
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {mine.length === 0 ? (
          <p className="text-gray-500">No notes yet.</p>
        ) : (
          mine.map((n) => (
            <div key={n.id} className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="whitespace-pre-wrap text-navy">{n.body}</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {new Date(n.created_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <button
                  onClick={() => deleteNote(n.id)}
                  className="text-xs font-semibold text-gray-500 underline hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
