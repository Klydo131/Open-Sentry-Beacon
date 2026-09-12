'use client';

// Booking a time together, for the two people in a pairing.
//
// THE GAP THIS CLOSES. The tutorial has had this card since the beginning and
// the live app never did. What live shipped instead was "Your reminders": a
// private checklist only the Guide could see. Those are different things. A
// reminder is a Guide talking to themselves. A meeting is two people agreeing
// on a time, and agreeing is the whole point of an app about walking with
// somebody.
//
// The database was ready. Migration 0009 created `meetings` with a title, a
// time, online or in person, a place, notes and a status, and wrote policies
// that let BOTH people read, create, edit and cancel. Nothing about this needed
// designing; it needed building.
//
// THE EXPLORER CAN PROPOSE, NOT ONLY ACCEPT. That is deliberate and it is what
// the policies already allowed. Somebody who can only ever be summoned is not
// walking alongside anyone.

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';
import {
  hasLink, joinLabel, joinUrl, placeLabel, placeUrl, wordsBesideLink,
} from '@/lib/live/meeting-link';
import { useKeepUp, KEEP_UP_MEETINGS } from '@/lib/live/keep-up';

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Within the next day, and not already past. Worth saying out loud. */
function soon(iso: string): boolean {
  const t = new Date(iso).getTime();
  const now = Date.now();
  return t > now && t - now < 24 * 60 * 60 * 1000;
}

export function LiveMeetings({ pairingId, withName }: { pairingId: string; withName?: string }) {
  const { profile } = useLiveSession();
  const me = profile?.id ?? '';
  const [rows, setRows] = useState<live.Meeting[] | null>(null);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [mode, setMode] = useState<live.MeetingMode>('online');
  const [location, setLocation] = useState('');
  // WHAT TO BRING, OR WHAT IT IS FOR. `meetings.notes` has existed since
  // migration 0009, `scheduleMeeting` has accepted one since it was written,
  // `listMeetings` selects it and the Meeting type carries it. This screen
  // never passed one and never drew one, so all thirty-six appointments this
  // church has arranged carry an empty note -- not because nobody had anything
  // to say, but because there was nowhere to say it. The same fault, found the
  // same way, as the share note in the library a day earlier.
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await live.listMeetings(pairingId));
      setError('');
    } catch (cause) {
      setRows([]);
      setError(humanError(cause, 'Could not load meetings.'));
    }
  }, [pairingId]);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_MEETINGS, load);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(humanError(cause, 'That did not work.')); }
    finally { setBusy(false); }
  };

  // Cancelled ones are kept but not shown: somebody who arranged an afternoon
  // around this needs to know it was called off, and that is what the message
  // in the conversation is for. A permanent list of things that are not
  // happening is not a diary.
  const STILL_ON = 60 * 60 * 1000;   // an hour's grace, so a meeting in progress stays put
  const all = rows ?? [];
  const past = (m: live.Meeting) => new Date(m.starts_at).getTime() <= Date.now() - STILL_ON;

  const upcoming = all.filter((m) => m.status !== 'cancelled' && !past(m));

  // A TIME THAT CAME AND WENT WITHOUT AN ANSWER.
  //
  // Three of this church's appointments are in this state and NOBODY WAS EVER
  // TOLD. A proposal sat unanswered, its date passed, and the filter above
  // simply stopped drawing it -- so the person who suggested it saw their
  // appointment disappear and had no way to tell "they said no" from "they
  // never saw it". Silence is the one answer a discipleship app should never
  // deliver on somebody's behalf.
  const missed = all.filter((m) => m.status === 'proposed' && past(m));

  // WHAT ACTUALLY HAPPENED, WHICH WAS BEING THROWN AWAY.
  //
  // Thirty-three of this church's thirty-six appointments are in the past, and
  // not one of them was visible to the two people it happened between. For an
  // app about walking with somebody over months, "when did we last meet, and
  // how often" is close to the only question a Guide needs answered, and the
  // card answered it for exactly one hour and then forgot.
  //
  // Confirmed only. A cancelled meeting is not a meeting that happened, and a
  // list of things that did not happen is not a history -- the same reason the
  // filter above has always left them out.
  const met = all
    .filter((m) => m.status === 'confirmed' && past(m))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-2xl shadow-sm">📅</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">Appointments</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">Make time to connect.</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              Propose an online call or an appointment in person.
              {withName ? ` You and ${withName} both see every detail.` : ' You both see every detail.'}
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
      )}

      <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-3 sm:p-4">
        <p className="text-sm font-bold text-navy">Plan an appointment</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is it about?"
          aria-label="What the appointment is about"
          className="tap w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
        />
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          aria-label="When"
          className="tap w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
        />

        {/* TWO BUTTONS, NOT A DROPDOWN, and that is the whole reason the
            location field went unnoticed. A <select> defaulted to Online and
            said "Online (call)" whether or not anybody had looked at it, so the
            place field, which only exists for the other choice, was never
            reached. Two buttons show both choices at once, and pressing one is
            one tap rather than open-scroll-choose. */}
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Online or in person">
          {([['online', '💻 Online call'], ['in_person', '📍 In person']] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setLocation(''); }}
              aria-pressed={mode === m}
              className={`tap-sm rounded-xl px-3 py-2.5 text-sm font-bold ${
                mode === m
                  ? 'bg-navy text-white'
                  : 'bg-gray-100 text-navy hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* AN IN-PERSON MEETING WITHOUT A PLACE IS NOT A MEETING.
            This used to be optional, so it was possible to propose meeting
            somebody in person and send them a time and no location. The other
            person then has to ask where, which is the one thing arranging it on
            a shared card was supposed to save them. The Propose button stays
            disabled until this is filled in.

            The example is a real address shape on purpose: "Church hall" alone
            maps to every church hall in the country. */}
        {mode === 'in_person' && (
          <div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Church cafe, 12 Rizal St, Cavite"
              aria-label="Where you are meeting"
              className="tap w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
            />
            <p className="mt-1 text-xs text-gray-500">
              A place and a street, which becomes an Open in Maps button for both
              of you. Or paste a map link and that exact pin is what opens, which
              beats a search when the place is hard to find.
            </p>
          </div>
        )}

        {/* THE JOINING LINK, which an online meeting had no way to carry.
            The app arranged the time and then left the two of them to send the
            Zoom link to each other in a message, which is the errand a shared
            card was supposed to remove, and the one thing somebody is looking
            for in the sixty seconds before a call starts.

            Optional on purpose. "I will ring you at seven" is a real answer to
            where, and it is kept and shown as written rather than refused. */}
        {mode === 'online' && (
          <div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              inputMode="url"
              placeholder="https://zoom.us/j/1234567890"
              aria-label="Link to join the call"
              className="tap w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
            />
            <p className="mt-1 text-xs text-gray-500">
              {location.trim() && !joinUrl('online', location)
                ? 'That is not a link, so it will be shown as written rather than as a button. Paste a link starting with https:// to make it one tap.'
                : 'Paste the Zoom, Meet, Teams or Messenger link. It becomes a Join button for both of you. Leave it empty if you are ringing each other.'}
            </p>
          </div>
        )}
        {/* OPTIONAL, AND ASKED FOR ANYWAY. The rule the library's add form
            already states: making it required would stop somebody arranging a
            time they are in a hurry about, and a time with no note still beats
            no time. The placeholder teaches by showing the shape of a useful
            answer rather than describing one. */}
        <label className="sr-only" htmlFor="meeting-notes">
          Anything to bring or know beforehand
        </label>
        <textarea
          id="meeting-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          /* The column's own limit, so a long note is stopped by the box rather
             than by an error after the button. */
          maxLength={2000}
          placeholder="Anything to bring or know first? (optional)"
          className="tap w-full rounded-xl bg-white px-4 py-2 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
        />
        <div>
          <Button
            variant="gold"
            disabled={busy || !startsAt || (mode === 'in_person' && !location.trim())}
            onClick={() => act(async () => {
              await live.scheduleMeeting(pairingId, {
                title, startsAt: new Date(startsAt).toISOString(), mode, location, notes,
              });
              setTitle(''); setStartsAt(''); setLocation(''); setNotes('');
            })}
          >
            {busy ? 'Saving…' : 'Propose this time'}
          </Button>
        </div>
      </div>

      {/* ONE ROW PER MEETING, in the same shape as My lessons and Shared with
          you: what it is on the left, the one thing to do on the right. The
          previous version stacked four separate controls under every meeting
          and read as a form rather than a list. */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-navy">Upcoming appointments</h3>
          {upcoming.length > 0 && <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-bold text-teal-700">{upcoming.length}</span>}
        </div>
        <div className="space-y-3">
        {rows !== null && upcoming.length === 0 && (
          <p className="text-sm text-gray-400">Nothing arranged yet.</p>
        )}
        {upcoming.map((m) => {
          const join = joinUrl(m.mode, m.location);
          const map = placeUrl(m.mode, m.location);
          // PRINT WHAT THEY WROTE, OR LET THE BUTTON CARRY IT. One rule for
          // both kinds of meeting: when the field holds a link, show the words
          // around it (a passcode, a hall name) and leave the address to the
          // button. When it holds no link, the field IS the answer, so show it.
          const shown = hasLink(m.location) ? wordsBesideLink(m.location) : (m.location ?? '');
          const mine = m.created_by === me;
          return (
            <div key={m.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-navy">{m.title || 'A time together'}</p>
                    {soon(m.starts_at) && (
                      <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-navy">
                        Soon
                      </span>
                    )}
                    {m.status === 'proposed' && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        Waiting
                      </span>
                    )}
                    {m.status === 'confirmed' && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                        Confirmed
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {when(m.starts_at)} · {m.mode === 'online' ? 'Online call' : 'In person'}
                  </p>
                  {/* THE PLACE ON ITS OWN LINE. Run into the date it was a tail
                      on a sentence nobody finished reading, which is half of
                      why the location looked like it was not there. */}
                  {shown && (
                    <p className="mt-0.5 break-words text-sm font-semibold text-navy">
                      {m.mode === 'online' ? '💻' : '📍'} {shown}
                    </p>
                  )}
                  {/* An online meeting whose "where" is NOT a link. Somebody
                      wrote how they are meeting rather than pasting an address,
                      and that is worth showing exactly as they wrote it. When
                      it IS a link the button below carries it, and repeating a
                      long URL here would only push the row off a phone. */}

                </div>

                {/* ONE BUTTON ON THE RIGHT, and which one depends on what this
                    person can actually do. ONLY THE OTHER PERSON CONFIRMS:
                    confirming your own proposal says nothing, because the whole
                    value of the state is that somebody else agreed to it. */}
                {m.status === 'proposed' && !mine ? (
                  <Button disabled={busy} onClick={() => act(() => live.confirmMeeting(m.id))}>
                    Yes, that works
                  </Button>
                ) : join ? (
                  /* THE ONE TAP. Named after the service where it can be told,
                     because "Join the Zoom call" is recognised in a way that a
                     bare link never is, and a person about to be late reads the
                     button and not the address. */
                  <a
                    href={join}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-meeting-join
                    className="tap-sm shrink-0 rounded-xl bg-navy px-4 text-sm font-bold text-white"
                  >
                    {joinLabel(join)}
                  </a>
                ) : map ? (
                  <a
                    href={map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap-sm shrink-0 rounded-xl bg-white px-4 text-sm font-semibold text-navy ring-1 ring-black/10"
                  >
                    {placeLabel(map)}
                  </a>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                {/* Kept as a quiet link rather than a second big button. Both
                    of these matter far less often than confirming or finding
                    the place, and two heavy buttons per row is what made the
                    list read as a form. */}
                {/* A proposal still waiting on the other person shows the big
                    button as "Yes, that works", so the way in becomes a quiet
                    link here instead. It is still there BEFORE confirming on
                    purpose: somebody deciding whether a time works often wants
                    to see where, or that the link is one they can open. */}
                {m.status === 'proposed' && !mine && join && (
                  <a
                    href={join}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-meeting-join
                    className="text-sm font-semibold text-navy underline underline-offset-2"
                  >
                    {joinLabel(join)}
                  </a>
                )}
                {m.status === 'proposed' && !mine && map && (
                  <a
                    href={map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-navy underline underline-offset-2"
                  >
                    {placeLabel(map)}
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => live.cancelMeeting(m.id))}
                  className="text-sm text-gray-500 underline underline-offset-2 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>

              {/* WHAT THEY WROTE, UNDER THE ARRANGEMENT. Below the controls
                  rather than above them: the time and the place are what
                  somebody opens this row for, and a paragraph between the title
                  and the Yes button would push the decision off a phone. */}
              {m.notes && (
                <p className="mt-2 whitespace-pre-wrap break-words border-t border-navy/5 pt-2 text-sm text-gray-600">
                  {m.notes}
                </p>
              )}
            </div>
          );
        })}
        </div>

        {/* ---------------------------------------------------------------
            A TIME THAT PASSED WITHOUT AN ANSWER
            ---------------------------------------------------------------
            These used to vanish. The person who suggested the time watched
            their appointment disappear and could not tell "they said no" from
            "they never saw it". Saying so is not a feature so much as the
            removal of a silence.

            NO BLAME IN THE WORDING, and that is deliberate. It says the time
            passed, not that somebody ignored you -- because the commonest
            reason by far is that they never opened the app, which is exactly
            what this church's numbers show. */}
        {missed.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-bold text-navy">Waiting on an answer, and the time has passed</p>
            <div className="mt-2 grid gap-2">
              {missed.map((m) => (
                <div key={m.id} className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <p className="font-bold text-navy">{m.title || 'A time together'}</p>
                  <p className="mt-0.5 text-sm text-amber-900">
                    {when(m.starts_at)} · nobody answered before it came round
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Suggest another time above, or tidy this away.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => live.cancelMeeting(m.id))}
                    className="mt-2 text-sm text-gray-500 underline underline-offset-2 disabled:opacity-40"
                  >
                    Tidy this away
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------
            WHAT ALREADY HAPPENED
            ---------------------------------------------------------------
            THE COUNT IS THE POINT, not the list. "You have met four times" is
            the one number a Guide actually wants, and it is what the hour-long
            filter was throwing away every time.

            FOLDED SHUT, because a diary is about what is next. It opens when
            somebody asks the question it answers. */}
        {met.length > 0 && (
          <details className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
            <summary className="cursor-pointer text-sm font-bold text-navy">
              {met.length === 1
                ? 'You have met once before'
                : `You have met ${met.length} times before`}
            </summary>
            <ul className="mt-3 grid gap-2">
              {met.map((m) => (
                <li key={m.id} className="border-t border-navy/5 pt-2 first:border-0 first:pt-0">
                  <p className="text-sm font-semibold text-navy">{m.title || 'A time together'}</p>
                  <p className="text-sm text-gray-500">
                    {when(m.starts_at)} · {m.mode === 'online' ? 'Online call' : 'In person'}
                  </p>
                  {m.notes && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-600">
                      {m.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      </div>
    </Card>
  );
}
