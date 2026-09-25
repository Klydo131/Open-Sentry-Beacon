'use client';

import Link from 'next/link';
import { MinorBadge } from '@/components/MinorBadge';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_MY_PAIRING, KEEP_UP_ROSTER, KEEP_UP_PRAYER } from '@/lib/live/keep-up';
import { stageInfo, previousStage, STAGES, nextStage } from '@/lib/brand';
import { useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { LiveReportControl } from '@/components/LiveSafeguarding';
import type { Message, Profile, Stage } from '@/lib/types';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveBlogFeed } from '@/components/LiveBlog';
import { LivePrayerForGuide } from '@/components/LivePrayer';
import { LiveMeetings } from '@/components/LiveMeetings';
import { useDraft, clearDraft } from '@/lib/drafts';
import { MemberReading } from '@/components/live/ReadingProgress';
import { LiveLibraryForGuide, LiveSharedWithMe } from '@/components/LiveLibrary';
import { LiveFollowUps, LiveNotes } from '@/components/LiveMinistry';
import { LiveStudies } from '@/components/LiveStudies';
import { NewBadge } from '@/components/NewBadge';
import { Avatar, Button, Card, Tabs } from '@/components/ui';
import { JourneyPath } from '@/components/JourneyPath';
import { Conversation, Notice, errorText } from '@/components/live/shared';
import { LiveAnnouncements } from '@/components/LiveAnnouncements';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { MemberProfile } from '@/components/live/MemberProfile';

// SPLIT OUT OF components/LiveCorePages.tsx, which had grown to three thousand
// lines holding nineteen components: the signed-out door, the Director's whole
// admin screen, both Guide screens, the Explorer's screen and every small piece
// they share. Nobody can hold that in their head, and a maintainer looking for
// the login form had to know it was in a file called "core pages".
//
// The old module still exists as a re-export, so nothing that imported from it
// had to change. New code should import from the file that actually holds the
// screen.

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}


export function LiveGuidePage() {
  const { profile } = useLiveSession();
  const [rows, setRows] = useState<live.PairingView[]>([]);
  const [error, setError] = useState('');
  // LOADED, FAILED AND GENUINELY EMPTY ARE THREE DIFFERENT THINGS.
  //
  // `rows.length === 0` was all three at once, so a Guide with two Explorers
  // whose pairings failed to load was told "Nobody is paired with you yet.
  // Your Director arranges that." That sentence is not a blank screen; it is
  // a claim about the church, and it was false, and it sent somebody to ask a
  // Director for something they already had.
  const [ready, setReady] = useState(false);
  // WHO HAS ASKED FOR PRAYER, on the card, before anything else.
  //
  // The requests were already on this page — but below Recommend, Follow-ups,
  // Lesson series and the Library, which is a long way down on a phone. Asking
  // for prayer is the most exposed thing an Explorer does here, and the list a
  // Guide actually looks at said nothing about it. Somebody writes "please pray
  // for my mother" and, as far as they can tell, nothing happens.
  //
  // `open` only: the badge clears once the Guide presses "I'm praying", which
  // is what keeps it worth reading rather than permanent furniture.
  const [unprayed, setUnprayed] = useState<Record<string, number>>({});
  // LIFTED OUT OF ITS EFFECT so it can be re-run, which is the whole of what
  // "keeps up" means here. It was an anonymous body inside useEffect, so the
  // roster and the prayer badge could only ever be as fresh as the last full
  // page load -- a Guide was paired with somebody, or somebody asked for
  // prayer, and this screen went on showing the version from when it opened.
  const loadRoster = useCallback(async () => {
    try {
      const data = await live.listPairings();
      setRows(data.filter((row) => row.status === 'active'));
      setReady(true);
    } catch (cause) {
      setError(errorText(cause));
    }
    try {
      const requests = await live.listPrayerRequests();
      const counts: Record<string, number> = {};
      for (const r of requests) {
        // The Explorer's own requests only: what the Guide asked THEM is
        // waiting on the Explorer, not on the Guide.
        if (r.status !== 'open' || !live.isExplorersOwn(r)) continue;
        counts[r.ds_id] = (counts[r.ds_id] ?? 0) + 1;
      }
      setUnprayed(counts);
    } catch {
      /* The badge is an aid, not the feature. A Guide who cannot load it still
         has the full list further down the page, so this must not take the
         whole screen down with it. */
    }
  }, []);
  useEffect(() => { void loadRoster(); }, [loadRoster]);
  useKeepUp(KEEP_UP_ROSTER, loadRoster);
  useKeepUp(KEEP_UP_PRAYER, loadRoster);

  // FOUR FOLDERS. The Guide's home was the greeting, the announcements, the
  // picture prompt, the summary, five Explorer cards, the follow-ups, every
  // prayer request and the whole congregation's writing, one below the other.
  // The roster is what a Guide comes here for, so it is the folder that opens.
  const waitingPrayers = Object.values(unprayed).reduce((a, b) => a + b, 0);
  const rooms: Room[] = [
    { id: 'people', label: '🤝 My Explorers', badge: rows.length },
    { id: 'waiting', label: '📋 Follow-ups' },
    { id: 'prayer', label: '🙏 Prayer', badge: waitingPrayers, urgent: waitingPrayers > 0 },
    { id: 'church', label: '⛪ Church' },
  ];
  const [room, chooseRoom] = useRoom(rooms, 'beacon:guide-room', { prayer: 'prayer' });

  return (
    <LiveAppShell allow={['dm']}>
      {/* GREETED BY NAME, AND TOLD THE ONE NUMBER THAT MATTERS.
          The heading was "My Explorers" over "Only people paired with you
          appear here", which is a label and a disclaimer: it says what the page
          is called and what it is not. The tutorial has opened on a greeting
          and a count since it was written, and a Guide trained there signed in
          to something colder and less informative. The count is the number the
          whole design turns on. */}
      <h1 className="text-3xl font-extrabold text-room">
        {greeting()}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
      </h1>
      <p className="mt-1 text-room-soft">
        {rows.length > 0
          ? `You are walking with ${rows.length} ${rows.length === 1 ? 'person' : 'people'}.`
          : error
            // Say nothing about the pairings, because nothing is known about
            // them. The Notice underneath carries what actually happened.
            ? 'Your Explorers could not be loaded just now.'
            : ready
              ? 'Nobody is paired with you yet. Your Director arranges that.'
              : 'Loading the people you walk with.'}
      </p>
      {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}

      <div className="mt-5"><RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} /></div>

      {/* FIRST ON THE DASHBOARD, under the greeting that names the page. A
          Guide is the person a church most needs to reach: they carry the
          notices to the people they walk with. It draws nothing when there is
          nothing pinned, so an ordinary day costs them no space. */}
      <div className="mt-6"><LiveAnnouncements hideWhenEmpty /></div>

      {/* THE EXPLORER'S SCREEN NOW SHOWS YOUR FACE, so it matters that there
          is one. An Explorer is handed a stranger's name by an app and has to
          decide whether anybody is really on the other end; their home screen
          draws the Guide's picture, city and interests for exactly that
          reason. Of twenty-six Guides in the live church, one had a photo and
          none had chosen an icon, so for almost everybody that card would draw
          two initials on a navy circle and prove nothing.

          It goes away the moment either one is set, and an icon is a single
          tap, so this is a prompt that can be answered rather than a banner
          that lives here. */}
      {profile && !profile.photo_path && !profile.avatar && (
        <Card className="mt-4 p-4">
          <p className="font-bold text-navy">Put a face to your name</p>
          <p className="mt-1 text-sm text-gray-500">
            The people you walk with see your picture on their home screen. A
            photo or one of the icons is enough; it tells them a real person is
            reading what they write.
          </p>
          <Link
            href="/profile"
            className="tap-sm mt-3 inline-flex items-center rounded-xl bg-gray-100 px-4 text-sm font-bold text-navy hover:bg-gray-200"
          >
            Add your picture
          </Link>
        </Card>
      )}

      {/* HOW MANY, AT WHAT LEVEL, AND HOW MANY HAVE FINISHED.
          A Guide could see a list of cards and nothing else: answering "where
          are my people up to" meant reading every card and counting. These are
          the same rows, added up. */}
      {room === 'people' && rows.length > 0 && <MyExplorersAtAGlance rows={rows} waiting={unprayed} />}

      {/* Cases moved to their own room, /cases, reachable from the rail on
          every screen. A formal hearing does not belong as one card among a
          Guide's Explorers. */}
      {/* ONE ROW PER PERSON, FULL WIDTH, NOT A GRID OF TILES.
          Two columns of tiles made every name compete with the one beside it,
          and on a desktop it left the right half of a wide screen empty while
          truncating the names in the left half. A roster is a list: face, name,
          what is going on with them, and where they are up to, in the same
          places on every row so the eye can run straight down the column.

          The stage sits on the right on its own line above the path, which is
          where the reference design puts it and where a scan for "who is at
          Commission" actually looks. */}
      {room === 'people' && <div className="mt-6 space-y-2.5">
        {rows.map((row) => {
          const stage = stageInfo(row.journey_stage);
          const waiting = unprayed[row.ds_id] ?? 0;
          return (
            <Link key={row.id} href={`/dm/${row.id}`} className="block">
              <Card className="p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Avatar name={row.ds_name} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-lg font-bold text-navy">{row.ds_name}</p>
                      <NewBadge person={{ signup_completed_at: row.ds_signup_completed_at }} />
                      {/* The Guide is the adult in the room, so they see this
                          and not only a Director. Drawn next to the name rather
                          than tucked into the profile, because a safeguarding
                          mark you have to go looking for is one nobody sees. */}
                      <MinorBadge person={{ birthday: row.ds_birthday, guardian_consent_at: row.ds_guardian_consent_at }} />
                    </div>
                    {/* THE LINE UNDER THE NAME IS WHAT NEEDS DOING, when there
                        is anything. A prayer request waiting is the one thing
                        on this row that is asking something of the Guide, so it
                        takes the line; the path is context and yields to it. */}
                    {waiting > 0 ? (
                      <p className="mt-0.5 text-sm font-semibold" style={{ color: '#7C3AED' }}>
                        🙏 Asked for prayer{waiting > 1 ? ` ×${waiting}` : ''}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm text-gray-500">{row.track} path</p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className="inline-block rounded-full px-3 py-1 text-xs font-bold"
                      style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                    >
                      {stage.label}
                    </span>
                    {waiting > 0 && (
                      <p className="mt-1 text-xs text-gray-500">{row.track} path</p>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>}
      {/* `ready` as well as `!error`: still fetching is not the same as nobody,
          and this card was the second place saying so. */}
      {room === 'people' && rows.length === 0 && ready && !error && <Card className="mt-6 p-6 text-center text-gray-500">No active pairing yet.</Card>}

      {/* FOLLOW-UPS STAY. They are about the people on this list and nothing
          else, which is what this screen is for. Writing studies, stocking the
          shelf, recommending somebody and the blog desk all moved to the
          Office, because they are work rather than people and they were making
          this page four screens long. See app/office/page.tsx. */}
      {room === 'waiting' && <div className="mt-6 space-y-6">
        <LiveFollowUps pairings={rows.map((r) => ({ id: r.id, ds_name: r.ds_name }))} />
      </div>}

      {/* Named requests from their own Explorers. A prayer request is about a
          person, so it belongs here rather than in the Office. */}
      {/* alwaysShow, because a folder called Prayer that draws nothing at all
          when a Guide opens it reads as broken rather than as quiet. */}
      {room === 'prayer' && <div className="mt-6 space-y-6">
        <LivePrayerForGuide
          nameFor={(id) => rows.find((r) => r.ds_id === id)?.ds_name ?? 'An Explorer'}
          explorers={rows.map((r) => ({ id: r.ds_id, name: r.ds_name }))}
          alwaysShow
        />
      </div>}

      {room === 'church' && <div className="mt-6"><LiveBlogFeed selfId={profile?.id} /></div>}
    </LiveAppShell>
  );
}

// WHAT THIS PERSON HAS CHANGED ABOUT THEMSELVES.
//
// The app no longer offers a way to erase your details; it asks you to keep
// them true instead, and tells the people walking with you when they move. That
// undertaking is worth nothing if the change is invisible, so this is the half
// that makes it real.
//
// COLLAPSED BY DEFAULT, AND ABSENT WHEN THERE IS NOTHING. A Guide opens this
// screen to talk to somebody, not to audit them, and a permanent panel headed
// "changes" turns a conversation into a file. It appears only when something
// actually changed, and shows the newest three until asked for more.
//
// The values are shown in full rather than masked. A Guide who can see the
// current phone number gains nothing from having the previous one starred out,
// and "changed from ****** to ******" answers none of the questions that make
// this worth having.

function DetailChanges({ personId, firstName }: { personId: string; firstName: string }) {
  const [rows, setRows] = useState<live.ProfileChange[] | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    live.listProfileChanges(personId)
      .then((r) => { if (alive) setRows(r); })
      // A refusal and an empty history look the same from here, and both mean
      // "nothing to show". Neither is worth an error box on a chat screen.
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [personId]);

  if (!rows || rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, 3);

  return (
    <Card className="p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
        What {firstName} has updated
      </h2>
      <ul className="mt-2 space-y-2">
        {shown.map((row) => (
          <li key={row.id} className="text-sm text-gray-700">
            <span className="font-semibold text-navy">
              {live.PROFILE_FIELD_LABEL[row.field] ?? row.field}
            </span>{' '}
            <span className="text-gray-400 line-through">{row.old_value || 'blank'}</span>
            {' \u2192 '}
            <span className="font-medium">{row.new_value || 'blank'}</span>
            <span className="ml-2 text-xs text-gray-400">
              {new Date(row.changed_at).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 3 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-3 text-sm font-semibold text-navy underline"
        >
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </Card>
  );
}

/**
 * The five rooms of one relationship.
 *
 * Talk is first because it is what a Guide opens this screen to do. Care
 * carries a count, because a prayer request waiting is the one thing here that
 * is asking something of them and a silent tab is how it got missed before.
 */

type GuideTab = 'talk' | 'journey' | 'care' | 'lessons' | 'resources';


export function LiveConversationPage() {
  const [tab, setTab] = useState<GuideTab>('talk');
  // Their profile, folded away until asked for. The conversation is what this
  // screen is for, so the details sit above it and start shut.
  const [openProfile, setOpenProfile] = useState(false);
  const [theirProfile, setTheirProfile] = useState<Profile | null>(null);

  const [prayerWaiting, setPrayerWaiting] = useState(0);
  const params = useParams();
  const pairingId = String(params.id);
  const { profile } = useLiveSession();
  const [pairing, setPairing] = useState<live.PairingView | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<live.PairingFile[]>([]);
  // Unsent text survives leaving this screen, and is never sent anywhere until
  // the person presses Send. See lib/drafts.ts.
  const [body, setBody] = useDraft(pairingId);
  const [error, setError] = useState('');
  const [attachError, setAttachError] = useState('');
  const [busy, setBusy] = useState(false);

  // Fetched when it is first opened rather than on every visit to the screen:
  // most of a Guide's time here is the conversation, and a profile nobody asked
  // for is a request nobody needed.
  useEffect(() => {
    if (!openProfile || theirProfile || !pairing?.ds_id) return;
    void live.memberProfile(pairing.ds_id).then(setTheirProfile).catch(() => setTheirProfile(null));
  }, [openProfile, theirProfile, pairing?.ds_id]);

  const load = useCallback(async () => {
    try {
      const [pairs, nextMessages, nextFiles] = await Promise.all([
        live.listPairings(),
        live.listMessages(pairingId),
        // Never allowed to take the conversation down with it: a church whose
        // storage is misconfigured must still be able to talk.
        live.listPairingFiles(pairingId).catch(() => [] as live.PairingFile[]),
      ]);
      const mine = pairs.find((pair) => pair.id === pairingId) ?? null;
      setPairing(mine);
      setMessages(nextMessages);
      setFiles(nextFiles);
      await live.markRead(pairingId);

      // THE COUNT ON THE CARE TAB. Without it the tab is silent about a
      // request waiting, and a silent tab is exactly how prayer requests went
      // unanswered when they were merely further down the page. Failing to
      // load it must never take the conversation down, so it is caught and the
      // badge simply does not draw.
      if (mine) {
        try {
          const requests = await live.listPrayerRequests();
          setPrayerWaiting(
            requests.filter((r) => r.status === 'open' && r.ds_id === mine.ds_id && live.isExplorersOwn(r)).length,
          );
        } catch {
          setPrayerWaiting(0);
        }
      }
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [pairingId]);

  const attach = useCallback(async (chosen: File) => {
    setAttachError('');
    setBusy(true);
    try {
      await live.sendPairingFile(pairingId, chosen);
      await load();
    } catch (cause) {
      setAttachError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }, [pairingId, load]);

  const dropFile = useCallback(async (file: live.PairingFile) => {
    setAttachError('');
    try {
      await live.removePairingFile(file);
      await load();
    } catch (cause) {
      setAttachError(errorText(cause));
    }
  }, [load]);

  useEffect(() => {
    void load();
    return live.subscribeToMessages(pairingId, () => void load());
  }, [pairingId, load]);
  // Everything around the conversation: files, the pairing, their profile.
  useKeepUp(KEEP_UP_MY_PAIRING, load);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await live.sendMessage(pairingId, body);
      // Clear the stored draft NOW rather than leaving it to the debounce. A
      // Guide who sends and immediately taps back unmounts the composer inside
      // the debounce window, which cancels the pending write — and the draft of
      // the message they just sent would still be sitting there next time.
      clearDraft(pairingId);
      setBody('');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    setBusy(true);
    setError('');
    try {
      await live.advanceStage(pairingId);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  // PUTTING IT BACK. Advance is one tap and a mis-tap had no remedy: the stage
  // is on somebody else's journey, so the only fix left was asking a Director
  // to edit the database. Confirmed, because a correction is still a change to
  // a record about a person, and recorded, because pretending the mistake
  // never happened is what makes a history untrustworthy.
  const stepBack = async () => {
    if (!pairing) return;
    const to = stageInfo(previousStage(pairing.journey_stage) ?? pairing.journey_stage).label;
    if (!confirm(
      `Put ${pairing.ds_name} back to ${to}? This is recorded as a correction, `
      + 'and they are never shown their stage either way.',
    )) return;
    setBusy(true);
    setError('');
    try {
      await live.stepBackStage(pairingId);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LiveAppShell allow={['dm']}>
      {!pairing ? <Card className="p-6">This Explorer is not on your list.</Card> : (
        <div className="space-y-5">
          <Link href="/dm" className="text-navy underline">← My Explorers</Link>
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={pairing.ds_name} size={52} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* THE NAME OPENS THEM. A Guide is the person actually
                      sitting with this Explorer and had less about them on
                      screen than a Director did — a name, a stage and a badge.
                      What they can see is decided by the database:
                      profiles_read_paired serves the profile of somebody you
                      are paired with, and nothing else. The address they were
                      invited at and the day they arrived stay with leadership. */}
                  <button
                    type="button"
                    onClick={() => setOpenProfile((was) => !was)}
                    className="truncate text-2xl font-extrabold text-navy underline underline-offset-4"
                  >
                    {pairing.ds_name}
                  </button>
                  {/* The screen a Guide spends their time on. If the badge is
                      anywhere, it is here: this is where the conversation
                      happens and where knowing you are talking to a child
                      changes how you write. */}
                  <MinorBadge person={{ birthday: pairing.ds_birthday, guardian_consent_at: pairing.ds_guardian_consent_at }} />
                </div>
                <p className="text-sm text-gray-500">
                  Private conversation
                  <span className="text-gray-400"> · tap their name to see their profile</span>
                </p>
              </div>
              {/* THE STAGE, READ ONLY, HERE. The buttons that change it moved
                  to the Journey tab, where the six steps are drawn and the
                  change is in front of the thing it changes. Two Advance
                  buttons on one screen is one too many, and the one at the top
                  changed a stage the Guide could not see. */}
              <div className="shrink-0 text-right">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-navy">
                  Step {stageInfo(pairing.journey_stage).label}
                </span>
                <p className="mt-1 text-sm font-semibold capitalize text-blue-700">
                  {pairing.track} track
                </p>
              </div>
            </div>
          </Card>

          {/* UNDER THE HEADER, NOT OVER THE CONVERSATION. A Guide opens this to
              remember something about the person they are about to write to, so
              it belongs next to their name and above the thread rather than on
              top of it. */}
          {openProfile && theirProfile && (
            <MemberProfile
              person={theirProfile}
              pairedWith={profile ?? null}
              onClose={() => setOpenProfile(false)}
            />
          )}

          {error && <Notice tone="error">{error}</Notice>}

          {/* TABS, THE SAME FIVE THE TUTORIAL HAS TAUGHT ALL ALONG.
              The tutorial's version of this screen has had Talk, Journey, Care
              and Resources since it was written; live it was one long scroll,
              so a Guide who learned the job in the demo signed in and found the
              screen they were trained on did not exist. Everything below was
              already here. Nothing is added and nothing is hidden that was not
              already several screens down. */}
          <Tabs<GuideTab>
            tabs={[
              { key: 'talk', label: 'Talk', icon: '💬' },
              { key: 'journey', label: 'Journey', icon: '🎯' },
              { key: 'care', label: 'Care', icon: '🙌', badge: prayerWaiting || undefined },
              { key: 'lessons', label: 'Lessons', icon: '📖' },
              { key: 'resources', label: 'Resources', icon: '📚' },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'talk' && (
            <>
              <Conversation
                messages={messages}
                files={files}
                myId={profile?.id ?? ''}
                myName={profile?.full_name}
                theirName={pairing.ds_name}
                body={body}
                setBody={setBody}
                send={send}
                busy={busy}
                onAttach={(chosen) => void attach(chosen)}
                onRemoveFile={(file) => void dropFile(file)}
                attachError={attachError}
                onEditMessage={live.editMessage}
                onDeleteMessage={live.deleteMessage}
              />
              {/* Reporting runs BOTH ways. A Guide receiving something they
                  should not have received needs this as much as an Explorer
                  does, and a route only the junior party can use is one nobody
                  uses. It stays with the conversation it is about. */}
              <LiveReportControl
                subjectId={pairing.ds_id}
                subjectName={pairing.ds_name}
                pairingId={pairing.id}
              />
              {/* ARRANGING A TIME IS PART OF THE RELATIONSHIP, so it sits with
                  the conversation on BOTH sides -- the same card, the same
                  meetings, in the same place on each screen.

                  IT USED TO SIT UNDER JOURNEY, and that was the mistake. Journey
                  is the one tab on this screen the Explorer never sees: it holds
                  the six stages, the Advance button and the stage history, and
                  it exists for the Guide to record where somebody has got to.
                  Putting the shared diary in there filed a thing the two of them
                  DO TOGETHER inside the folder of things the Guide does ABOUT
                  them -- so the Explorer proposed a time in their chat and the
                  Guide had to leave the conversation, and know which tab to go
                  to, before they could see it had been asked.

                  The Explorer's screen has always had it beneath the thread.
                  This is the Guide's screen catching up, not a new feature. */}
              <LiveMeetings pairingId={pairing.id} withName={pairing.ds_name} />
            </>
          )}

          {tab === 'journey' && (
            <>
              {/* THE SIX STEPS, DRAWN, and the move to the next one under them.
                  The stage was a word in a pill at the top of the page and the
                  button that changes it sat beside it, which tells a Guide what
                  the stage is called and nothing about where it sits in a
                  journey. The tutorial has drawn the path since it was written.
                  Same component, so the demo and the live app cannot drift.

                  THE EXPLORER NEVER SEES THIS. Their own screen says nothing
                  about their stage, on purpose: the journey is a relationship,
                  not a score, and a person who can watch their own progress bar
                  starts performing for it. */}
              <Card className="p-5">
                <h2 className="text-xl font-bold text-navy">Journey</h2>
                <div className="mt-4">
                  <JourneyPath current={pairing.journey_stage as Stage} />
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button
                    variant="gold"
                    onClick={() => void advance()}
                    disabled={busy || pairing.journey_stage === 'commission'}
                  >
                    {pairing.journey_stage === 'commission'
                      ? 'Journey complete'
                      : `Advance to ${stageInfo(nextStage(pairing.journey_stage) ?? 'commission').label} →`}
                  </Button>
                  {/* Only where there is somewhere to go back to. Advancing is
                      one tap and taps go wrong; the correction is recorded
                      rather than erased, so the history stays honest. */}
                  {previousStage(pairing.journey_stage) && (
                    <Button variant="ghost" onClick={() => void stepBack()} disabled={busy}>
                      Undo, step back
                    </Button>
                  )}
                  <p className="text-sm text-gray-500">
                    {pairing.journey_stage === 'commission'
                      ? `${pairing.ds_name.split(' ')[0]} has walked the whole journey.`
                      : `This is recorded in ${pairing.ds_name.split(' ')[0]}'s journey history.`}
                  </p>
                </div>
              </Card>

              <DetailChanges
                personId={pairing.ds_id}
                firstName={pairing.ds_name.split(' ')[0]}
              />
            </>
          )}

          {tab === 'care' && (
            <>
              {/* THE PRAYER REQUESTS. Asking for prayer is the most exposed
                  thing an Explorer does in this app, and the answer to it used
                  to be one screen away from where the Guide actually sits.
                  Somebody wrote what they needed prayer for, their Guide
                  replied to messages all evening on a phone, and never saw it,
                  which came back as "the Guide cannot see prayer requests". The
                  row was always there and always readable; it was just never in
                  front of them. The tab carries a count so it is never silent
                  about one waiting. */}
              <LivePrayerForGuide
                alwaysShow
                onlyFor={pairing.ds_id}
                nameFor={() => pairing.ds_name}
                heading={`Praying with ${pairing.ds_name.split(' ')[0]}`}
              />
              <LiveNotes pairingId={pairing.id} />
            </>
          )}

          {tab === 'lessons' && (
            <div className="space-y-4">
              {/* HOW FAR THIS PERSON HAS GOT, above the studies themselves.
                  A Guide is the one who will actually do something about a bar
                  that has not moved, so they should not have to go and ask a
                  Director what it says. `may_see_reading()` lets the paired
                  Guide read it and nobody else's Guide. */}
              <MemberReading memberId={pairing.ds_id} name={pairing.ds_name} />
              {/* THE STUDIES THIS PERSON CAN READ, not the writing desk. A
                  Guide here is looking at one Explorer; writing and changing
                  studies is the Office's job, and it is one tap away. */}
              <LiveStudies
                readOnly
                note={<>What {pairing.ds_name.split(' ')[0]} can read. To write or change a study, go to <Link href="/office?room=studies" className="font-semibold text-navy underline">the Office</Link>.</>}
              />
            </div>
          )}

          {tab === 'resources' && (
            <div className="space-y-4">
              {/* WHAT THEY SENT YOU, FIRST. Reported as "As a guide I can't see
                  what source or resource shared by the Explorer here." Sharing
                  has run both ways since the library was opened up and the rows
                  were being written; the only card that draws one was mounted
                  on the Explorer's screen and nowhere else. Above the shelf,
                  because a thing somebody handed you is news and your own shelf
                  is not. */}
              <LiveSharedWithMe
                pairingId={pairing.id}
                heading={`From ${pairing.ds_name.split(' ')[0]}`}
                intro={`What ${pairing.ds_name.split(' ')[0]} has sent you. Tap one to open it.`}
              />
              {/* THE SHELF, FOR SENDING. This tab is about one person, so the
                  card says what it is for here: something for them. */}
              <LiveLibraryForGuide
                pairings={[{ id: pairing.id, ds_name: pairing.ds_name }]}
                sharesShownFor={pairing.id}
                heading={`Send ${pairing.ds_name.split(' ')[0]} something`}
                intro="Pick from the church's resources, or add a link of your own."
              />
            </div>
          )}
        </div>
      )}
    </LiveAppShell>
  );
}


function MyExplorersAtAGlance({
  rows, waiting,
}: { rows: live.PairingView[]; waiting: Record<string, number> }) {
  const graduated = rows.filter((r) => r.journey_stage === 'commission').length;
  const walking = rows.length - graduated;
  const prayers = Object.values(waiting).reduce((a, b) => a + b, 0);

  // WHAT IS WAITING, before the numbers. A Guide opening this screen is asking
  // "is there anything I should do today", and the honest answer is usually
  // short: somebody asked for prayer, or you are meeting somebody on Thursday.
  const [next, setNext] = useState<live.Meeting | null>(null);
  useEffect(() => {
    let alive = true;
    live.myUpcomingMeetings(1)
      .then((list) => { if (alive) setNext(list[0] ?? null); })
      // A missed meeting lookup must not take the numbers down with it.
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const nameFor = (pairingId: string) =>
    rows.find((r) => r.id === pairingId)?.ds_name ?? 'someone';

  return (
    <Card className="mt-6 p-5">
      {(prayers > 0 || next) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {prayers > 0 && (
            <span className="rounded-full bg-purple-100 px-3 py-1.5 text-sm font-semibold text-purple-900">
              🙏 {prayers} {prayers === 1 ? 'prayer request' : 'prayer requests'} waiting
            </span>
          )}
          {next && (
            <span className="rounded-full bg-gold/25 px-3 py-1.5 text-sm font-semibold text-navy">
              📅 {new Date(next.starts_at).toLocaleDateString(undefined, {
                weekday: 'long', hour: 'numeric', minute: '2-digit',
              })} with {nameFor(next.pairing_id)}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-navy">Your Explorers</h2>
        <p className="text-sm text-gray-500">
          {rows.length} {rows.length === 1 ? 'person' : 'people'} paired with you
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-gold/15 p-4 text-center">
          <p className="text-3xl font-extrabold text-navy">{graduated}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Graduated</p>
        </div>
        <div className="rounded-xl bg-navy/5 p-4 text-center">
          <p className="text-3xl font-extrabold text-navy">{walking}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Still walking</p>
        </div>
      </div>

      <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-gray-500">By level</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STAGES.map((stage) => {
          const n = rows.filter((r) => r.journey_stage === stage.key).length;
          return (
            <div
              key={stage.key}
              className={`rounded-xl p-3 text-center ${n === 0 ? 'bg-gray-100' : ''}`}
              // The stage's own colour, faintly, so the levels read as a
              // sequence rather than six identical boxes. Only where somebody
              // is actually standing: an empty level should recede.
              style={n > 0 ? { backgroundColor: `${stage.color}22` } : undefined}
            >
              <p className={`text-2xl font-extrabold ${n === 0 ? 'text-gray-400' : 'text-navy'}`}>{n}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
