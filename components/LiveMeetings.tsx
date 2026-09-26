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

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';
import {
  hasLink, joinLabel, joinUrl, placeLabel, placeUrl, wordsBesideLink,
} from '@/lib/live/meeting-link';
import { useKeepUp, KEEP_UP_MEETINGS } from '@/lib/live/keep-up';
import { PlaceSearch } from '@/components/PlaceSearch';
import { ExternalGlyph, PinGlyph } from '@/components/Glyph';
import { nearOf, pinOf } from '@/lib/live/place-pin';

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

  // WHAT THIS PERSON HAS USED BEFORE, OFFERED BACK -- and, since 26 September
  // 2026, places from the map as well.
  //
  // First asked for as a places dropdown "like Google earth can do". The
  // history half shipped then and the map half did not, on the reasoning that
  // every half-typed address would leave for a third party. Asked for again,
  // more plainly: "I can't see my destination if it's really going to be that
  // destination unless I already input the destination." The church decided;
  // what is built is the version that sends the least. The words go through the
  // church's own server (supabase/functions/places), so the member's address
  // never does, and no new origin enters the Content-Security-Policy. The
  // privacy notice says so.
  //
  // The history is still first in the list: it costs nothing, it covers what
  // recurs -- the hall, that one cafe, the same Zoom room every week -- and it
  // is drawn from the meetings ALREADY on this screen, so nobody can be shown
  // a place from a pairing they cannot already see.
  const history = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of [...(rows ?? [])].sort((x, y) => y.starts_at.localeCompare(x.starts_at))) {
      if (m.mode !== mode) continue;
      const value = (m.location ?? '').trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length === 8) break;
    }
    return out;
  }, [rows, mode]);

  // Where to prefer suggestions near: the last place this pair pinned, rounded
  // to the nearest town inside nearOf before it goes anywhere.
  const near = useMemo(() => nearOf(
    [...(rows ?? [])]
      .filter((m) => m.mode === 'in_person')
      .sort((x, y) => y.starts_at.localeCompare(x.starts_at))
      .map((m) => m.location),
  ), [rows]);
  const searchPlaces = useCallback((q: string) => live.searchPlaces(q, near), [near]);
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

  // WHICH ROW IS BEING SAID NO TO, and what reason is being typed. A reason is
  // optional: making it required turns "I am working that afternoon" into a
  // form somebody abandons, and an unanswered proposal is worse than a bare no.
  const [refusing, setRefusing] = useState('');
  const [why, setWhy] = useState('');

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(humanError(cause, 'That did not work.')); }
    finally { setBusy(false); }
  };

  // ANSWERED ONES ARE SHOWN, WHICH THEY WERE NOT.
  //
  // ASKED FOR: "If there is a record for acceptance in appointment, there must
  // be a record for cancel too so that Guides and Explorers are informed who
  // accepted and who declined."
  //
  // The old comment here said a cancelled meeting is kept but not shown, and
  // that the message in the conversation carries the news. No message was ever
  // sent. What actually happened was that the card disappeared, which reads as
  // a bug rather than an answer, and the person who arranged their afternoon
  // around it had nothing to look at and nobody to ask.
  //
  // So an answered appointment stays on the list until its time has passed,
  // drawn as what it is: who said no, when, and why if they said why.
  const STILL_ON = 60 * 60 * 1000;   // an hour's grace, so a meeting in progress stays put
  const all = rows ?? [];
  const past = (m: live.Meeting) => new Date(m.starts_at).getTime() <= Date.now() - STILL_ON;

  const upcoming = all.filter((m) => !past(m));

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

      {/* grid-cols-1: ONE COLUMN AS WIDE AS THE CARD, and no wider. Without it
          the column grew to the date box's natural width, about fifty pixels
          more than a phone has, and the card cut off the right-hand side of
          the form -- half the "In person" button, the end of every line.
          Found on 26 September 2026 when the place box was added; it was
          there before it. */}
      <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-3 sm:p-4">
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
          {/* "Online" rather than "Online call": the longer words wrapped onto
              two lines of a phone-sized button. */}
          {([['online', '💻 Online'], ['in_person', '📍 In person']] as const).map(([m, label]) => (
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
            {/* TYPE, SEE, TAP. Suggestions arrive as you type, each with its
                street and barangay, and tapping one pins that exact place.
                Typing an address by hand, or pasting a map link, still works:
                a suggestion is an offer, not a gate. */}
            <PlaceSearch
              value={location}
              onChange={setLocation}
              search={searchPlaces}
              history={history}
              source="openstreetmap"
              hint={<>Type a place and its town, like &ldquo;Jollibee Imus&rdquo;, then tap the right one.</>}
            />
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
              list="appointment-history"
              inputMode="url"
              placeholder="https://zoom.us/j/1234567890"
              aria-label="Link to join the call"
              className="tap w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
            />
            <p className="mt-1 text-xs text-gray-500">
              {location.trim() && !joinUrl('online', location)
                ? 'That is not a link, so it will be shown as written rather than as a button. Paste a link starting with https:// to make it one tap.'
                : `Paste the Zoom, Meet, Teams or Messenger link. It becomes a Join button for both of you. Leave it empty if you are ringing each other.${
                    history.length > 0 ? ' A link you have used before will be offered as you type.' : ''}`}
            </p>
          </div>
        )}
        {/* ONE LIST, because only one of the two inputs above is ever on the
            screen, and `history` already follows the mode. */}
        {history.length > 0 && (
          <datalist id="appointment-history">
            {history.map((v) => <option key={v} value={v} />)}
          </datalist>
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
                {/* AT LEAST 14rem FOR THE DETAILS, so on a phone the button
                    wraps under them instead of squeezing the title, the time
                    and the address into half the card. */}
                <div className="min-w-[14rem] flex-1">
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
                    {/* AN ANSWER IS NOT AN ERROR, so neither of these is red.
                        Somebody who cannot make a Tuesday has not done anything
                        wrong, and a scarlet badge on their name says otherwise
                        to the person reading it. */}
                    {m.status === 'declined' && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                        Not this time
                      </span>
                    )}
                    {m.status === 'cancelled' && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                        Called off
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {when(m.starts_at)} · {m.mode === 'online' ? 'Online call' : 'In person'}
                  </p>

                  {/* WHO ANSWERED, WHICH IS THE WHOLE REQUEST. It reads the
                      name recorded at the time rather than looking one up, so
                      it still says who it was after an account is deleted. */}
                  {m.answered_at && m.status !== 'proposed' && (
                    <p className="mt-0.5 text-sm text-gray-600">
                      {m.status === 'confirmed' ? '✅' : '↩️'}{' '}
                      <span className="font-semibold">{m.answer_name || 'Somebody'}</span>
                      {m.status === 'confirmed'
                        ? ' said yes'
                        : m.status === 'declined' ? ' could not make it' : ' called it off'}
                      {' · '}{when(m.answered_at)}
                      {m.answer_note && <>{' · '}&ldquo;{m.answer_note}&rdquo;</>}
                    </p>
                  )}
                  {/* THE PLACE ON ITS OWN LINE. Run into the date it was a tail
                      on a sentence nobody finished reading, which is half of
                      why the location looked like it was not there. */}
                  {shown && (m.mode === 'in_person' && pinOf(m.location) ? (
                    /* A PINNED PLACE: its name, then where it is, so "Jollibee"
                       says which Jollibee without anybody opening the map. */
                    <div className="mt-1.5 flex items-start gap-2" data-meeting-place="">
                      <PinGlyph size={18} className="mt-0.5 text-teal-700" />
                      <div className="min-w-0">
                        <p className="break-words font-semibold leading-snug text-navy">{shown.split(', ')[0]}</p>
                        {shown.includes(', ') && (
                          <p className="break-words text-sm leading-snug text-gray-600">{shown.split(', ').slice(1).join(', ')}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 break-words text-sm font-semibold text-navy">
                      {m.mode === 'online' ? '💻' : '📍'} {shown}
                    </p>
                  ))}
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
                  // TWO ANSWERS, NOT ONE. A card with only "Yes, that works" on
                  // it leaves somebody who cannot make the time with nothing to
                  // press, so they press nothing, and the other person is left
                  // reading silence. The refusal is a quiet button rather than
                  // a red one: saying no to a Tuesday is not a destructive act.
                  // NOT shrink-0: two controls allowed to wrap but not to
                  // shrink push the row wider than a 360px phone, which the
                  // gate catches and a person would meet as a sideways scroll
                  // on the one screen they answer on.
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Button disabled={busy} onClick={() => act(() => live.confirmMeeting(m.id))}>
                      Yes, that works
                    </Button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setRefusing(refusing === m.id ? '' : m.id); setWhy(''); }}
                      className="text-sm font-semibold text-gray-600 underline underline-offset-2 disabled:opacity-40"
                    >
                      Not this time
                    </button>
                  </div>
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
                    className="tap-sm inline-flex shrink-0 items-center rounded-xl bg-navy px-4 text-sm font-bold text-white"
                  >
                    {joinLabel(join)}
                  </a>
                ) : map ? (
                  <a
                    href={map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap-sm inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-navy ring-1 ring-black/10"
                  >
                    {placeLabel(map)} <ExternalGlyph size={16} />
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
                {/* NOTHING TO CALL OFF ONCE IT IS ANSWERED. Offering Cancel on
                    a declined appointment is offering an action that can only
                    fail, and the database refuses it for the same reason. */}
                {(m.status === 'proposed' || m.status === 'confirmed') && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => live.cancelMeeting(m.id))}
                    className="text-sm text-gray-500 underline underline-offset-2 disabled:opacity-40"
                  >
                    Call it off
                  </button>
                )}
              </div>

              {/* SAYING WHY, IF THERE IS A WHY WORTH SAYING. Optional on
                  purpose. Requiring a reason turns "I am working that
                  afternoon" into a form somebody abandons, and an unanswered
                  proposal is worse for the other person than a bare no. */}
              {refusing === m.id && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-black/10">
                  <p className="text-sm font-semibold text-navy">
                    Tell them you cannot make this one?
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    They will be told straight away, with your name on it. Nothing
                    is deleted: the appointment stays here saying you could not
                    make it.
                  </p>
                  <input
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    maxLength={140}
                    placeholder="A reason, if you want to give one (optional)"
                    aria-label="Why you cannot make this time"
                    className="tap mt-2 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-gold"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      disabled={busy}
                      onClick={() => act(async () => {
                        await live.declineMeeting(m.id, why);
                        setRefusing('');
                        setWhy('');
                      })}
                    >
                      Send my answer
                    </Button>
                    <Button variant="ghost" onClick={() => { setRefusing(''); setWhy(''); }}>
                      Go back
                    </Button>
                  </div>
                </div>
              )}

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
