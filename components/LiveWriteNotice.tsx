'use client';

// Writing an announcement, on the Publish screen.
//
// SPLIT OUT OF LiveBillboard, which is where it was written and the wrong place
// for it to live. The billboard is the church's home screen: a person opening it
// is reading what the church has said, and a composer sitting on top of that
// screen made a reader's page into a writer's page for the three roles who can
// write. Writing now has a room, and the billboard shows the notices.
//
// The take-down controls stayed on the billboard, beside the notice they act on.
// Deleting something is about the thing in front of you; writing is a task you
// go somewhere to do.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_NOTICES } from '@/lib/live/keep-up';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';

const message = (cause: unknown) =>
  humanError(cause, 'That did not work.');

/**
 * One box, with its name above it and its sample still inside.
 *
 * A placeholder is not a label. It is the only thing naming the box until
 * somebody types, and then it disappears exactly when they might want to check
 * what they were filling in. The two are separate here, which is also what lets
 * the name be read out loud by a screen reader instead of guessed at.
 */
function Field({ label, value, onChange, placeholder, multiline = false }: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const id = `notice-${label.toLowerCase()}`;
  const shared =
    'w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gold';
  return (
    <div className="mt-2">
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500"
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
        />
      ) : (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
        />
      )}
    </div>
  );
}

export function LiveWriteNotice() {
  const { profile } = useLiveSession();
  const leads = profile?.role === 'admin' || profile?.role === 'executive';
  // Guides as well as leadership. A Guide arranging something for the people
  // they walk with had nowhere to pin it and sent the same message five times.
  const mayPost = leads || profile?.role === 'dm';

  // Fixed, not chosen. See the note beside where it is drawn.
  const icon = '📌';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [whenText, setWhenText] = useState('');
  const [mine, setMine] = useState<live.Announcement[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    try { setMine(await live.listAnnouncements()); setError(''); }
    catch (cause) { setMine([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_NOTICES, load);

  // AN EXPLORER IS TOLD WHY, rather than shown nothing. A room that is blank
  // for a whole role reads as broken; a room that explains itself reads as
  // designed, and points them at the thing they CAN do.
  if (!mayPost) {
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📌 Announcements</h2>
        <p className="mt-1 text-sm text-gray-500">
          A notice is pinned to the top of everybody&rsquo;s church screen, so
          Guides and Directors write those. Anything you want to say to the
          church goes in your blog above, which everybody reads too and which
          carries your name.
        </p>
      </Card>
    );
  }

  const post = async () => {
    if (!title.trim() || busy) return;
    setBusy(true); setError(''); setFlash('');
    try {
      await live.addAnnouncement({ icon, title, body, whenText });
      // No icon to reset: it is fixed now, so there is nothing to put back.
      setTitle(''); setBody(''); setWhenText('');
      setFlash('Pinned to the church home screen.');
      await load();
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };

  const ownOrAll = (mine ?? []).filter((n) => leads || n.author_id === profile?.id);

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📌 Write an announcement</h2>
      <p className="mt-1 text-sm text-gray-500">
        Pinned to the top of the church home screen until somebody takes it down.
      </p>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      {flash && (
        <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {flash}
        </p>
      )}

      {/* THE PIN IS A MARK, NOT A BOX. Reported with it circled in red: "I want
          the pin just to be an icon, not a value set that can change or type."
          It was a text input holding an emoji, so it invited a decision nobody
          came here to make -- and, because anything typed went through to the
          church home screen, a stray keystroke could put a letter where every
          member expected a pin. It is drawn now and there is nothing to get
          wrong.

          `icon` is still sent, because the notices already pinned carry it and
          the church screen reads it; what changed is that it is no longer
          somebody's problem to supply. */}
      <div className="mt-4 grid gap-2 sm:grid-cols-[3rem_1fr]">
        <span
          aria-hidden
          className="grid h-full min-h-[2.75rem] place-items-center rounded-xl bg-gray-50 text-xl ring-1 ring-black/5"
        >
          {icon}
        </span>
        <Field
          label="Title"
          value={title}
          onChange={setTitle}
          placeholder="Sabbath worship"
        />
      </div>

      {/* EVERY BOX SAYS WHAT IT IS, AND STILL SHOWS THE SAMPLE. Asked for
          together: "I want cattegory, Like Title or announcement, the content,
          and sample of date ... There is no name of the categories but I can
          see samples on it to pin."
          The samples were doing both jobs at once, and a placeholder cannot:
          it is the only label until you type, and then it is gone. Somebody
          halfway through a notice had three filled boxes and no way to tell
          which was which. The names sit above, the samples stay inside. */}
      <Field
        label="Announcement"
        value={body}
        onChange={setBody}
        placeholder="Gather with the church family for worship and study."
        multiline
      />

      {/* FREE TEXT, NOT A DATE PICKER. "This Sabbath, 9:00 AM" and "Every
          evening this week" are both what a church actually writes, and neither
          is a date. The label says When rather than Date for the same reason. */}
      <Field
        label="When"
        value={whenText}
        onChange={setWhenText}
        placeholder="This Sabbath, 9:00 AM"
      />
      {/* SAID BEFORE THEY POST. There is no audience to choose, and somebody
          writing a notice should know that rather than assume there is one. */}
      <p className="mt-2 text-xs text-gray-500">
        Everybody in the church sees this. Anything for fewer people belongs in
        a message or in your blog.
      </p>
      <div className="mt-3">
        <Button variant="gold" disabled={busy || !title.trim()} onClick={() => void post()}>
          {busy ? 'Posting…' : 'Pin it'}
        </Button>
      </div>

      {/* WHAT IS ALREADY UP, so somebody does not pin the same thing twice.
          Taking one down happens on the church screen beside the notice
          itself, which is where you are when you decide it has served. */}
      <div className="mt-5 border-t border-gray-100 pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
          {leads ? 'Already pinned' : 'Yours, already pinned'}
        </p>
        {mine === null ? (
          <BeaconSpinner inline label="Loading" className="mt-2" />
        ) : ownOrAll.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nothing yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {ownOrAll.map((n) => (
              <li key={n.id} className="flex items-center gap-2 text-sm">
                <span aria-hidden>{n.icon}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-navy">{n.title}</span>
                {!n.is_pinned && (
                  <span className="shrink-0 text-xs text-gray-400">taken down</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
