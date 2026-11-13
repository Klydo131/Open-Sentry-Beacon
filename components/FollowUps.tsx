'use client';

import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { Card, Button } from '@/components/ui';
import { todayKey } from '@/lib/engagement';

// A missionary's own reminders for one seeker — "call before Sabbath", "bring
// the study guide". Private to the missionary, like the notes beside them.
//
// Engagement already flags a seeker who has gone quiet, but only after the fact.
// This is the other half: a way to plan the next touch before the silence.
export function FollowUps({ pairingId }: { pairingId: string }) {
  const { db, userId, addFollowUp, toggleFollowUp, deleteFollowUp } = useDemo();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  const today = todayKey();

  const mine = db.follow_ups.filter(
    (f) => f.pairing_id === pairingId && f.owner_id === userId,
  );
  // Open items first, soonest due at the top; undated ones sink below dated
  // ones rather than sorting as if they were due in year zero.
  const open = mine
    .filter((f) => !f.done_at)
    .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
  const done = mine
    .filter((f) => f.done_at)
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));

  const add = () => {
    if (!title.trim()) return;
    addFollowUp(pairingId, title, due || undefined);
    setTitle('');
    setDue('');
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">✅ Follow-ups</h2>
      <p className="mb-4 text-sm text-gray-500">
        Your own reminders. Nobody else sees this list.
      </p>

      <div className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="What needs doing?"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="tap w-full min-w-0 rounded-xl bg-white px-3 text-base ring-1 ring-black/5"
          aria-label="Due date"
        />
        <Button variant="gold" disabled={!title.trim()} onClick={add}>
          Add
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {open.length === 0 && done.length === 0 && (
          <p className="text-gray-500">Nothing to follow up on.</p>
        )}

        {open.map((f) => {
          const overdue = !!f.due_on && f.due_on < today;
          const soon = f.due_on === today;
          return (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
            >
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggleFollowUp(f.id)}
                aria-label={`Mark "${f.title}" done`}
                className="h-5 w-5 shrink-0 accent-green-600"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy">{f.title}</p>
                {f.due_on && (
                  <p
                    className="text-sm font-semibold"
                    style={{
                      color: overdue ? '#DC2626' : soon ? '#B45309' : '#9AA3B2',
                    }}
                  >
                    {overdue ? 'Overdue · ' : soon ? 'Due today · ' : 'Due '}
                    {new Date(`${f.due_on}T00:00:00`).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                )}
              </div>
              <button
                onClick={() => deleteFollowUp(f.id)}
                className="text-sm font-semibold text-gray-500 underline hover:text-red-600"
              >
                Delete
              </button>
            </div>
          );
        })}

        {done.length > 0 && (
          <details className="pt-1">
            <summary className="cursor-pointer text-sm font-semibold text-gray-500">
              {done.length} done
            </summary>
            <div className="mt-2 space-y-2">
              {done.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked
                    onChange={() => toggleFollowUp(f.id)}
                    aria-label={`Mark "${f.title}" not done`}
                    className="h-5 w-5 shrink-0 accent-green-600"
                  />
                  <p className="min-w-0 flex-1 text-gray-500 line-through">
                    {f.title}
                  </p>
                  <button
                    onClick={() => deleteFollowUp(f.id)}
                    className="text-sm font-semibold text-gray-500 underline hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}
