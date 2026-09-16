'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useKeepUp, KEEP_UP_MY_PAIRING } from '@/lib/live/keep-up';
import { NAVY } from '@/lib/brand';
import { useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { LiveReportControl } from '@/components/LiveSafeguarding';
import type { Message, Profile } from '@/lib/types';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveAskForPrayer } from '@/components/LivePrayer';
import { LiveMeetings } from '@/components/LiveMeetings';
import { useDraft, clearDraft } from '@/lib/drafts';
import { LiveSharedWithMe, LiveLibraryForGuide } from '@/components/LiveLibrary';
import { LiveStudies } from '@/components/LiveStudies';
import { Avatar, Card } from '@/components/ui';
import { Conversation, Notice, errorText } from '@/components/live/shared';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { NextStudy } from '@/components/live/NextStudy';
import { JourneyBar } from '@/components/live/JourneyBar';
import { LiveAnnouncements } from '@/components/LiveAnnouncements';
import { LiveBlogFeed } from '@/components/LiveBlog';

// SPLIT OUT OF components/LiveCorePages.tsx, which had grown to three thousand
// lines holding nineteen components: the signed-out door, the Director's whole
// admin screen, both Guide screens, the Explorer's screen and every small piece
// they share. Nobody can hold that in their head, and a maintainer looking for
// the login form had to know it was in a file called "core pages".
//
// The old module still exists as a re-export, so nothing that imported from it
// had to change. New code should import from the file that actually holds the
// screen.

export function LiveExplorerPage() {
  const { profile } = useLiveSession();
  const [pairing, setPairing] = useState<live.MyPairing | null>(null);
  const [files, setFiles] = useState<live.PairingFile[]>([]);
  const [attachError, setAttachError] = useState('');
  // The attach handler is created once and would otherwise capture whatever
  // `pairing` was at that render — null, on the first one. A ref reads the
  // current value at the moment the file is chosen.
  const pairingRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // `pairing` is null until it loads, so the draft has nothing to key on for the
  // first render or two. useDraft handles that: the box is simply unsaved until
  // the id arrives, and the draft appears the moment it does.
  const [body, setBody] = useDraft(pairing?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const mine = await live.getMyPairing();
      setPairing(mine);
      if (mine) {
        setMessages(await live.listMessages(mine.id));
        // The Explorer sends files too. A route only the Guide can use turns a
        // conversation into a broadcast.
        setFiles(await live.listPairingFiles(mine.id).catch(() => [] as live.PairingFile[]));
        await live.markRead(mine.id);
      }
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  const attach = useCallback(async (chosen: File) => {
    const id = pairingRef.current;
    if (!id) return;
    setAttachError('');
    setBusy(true);
    try {
      await live.sendPairingFile(id, chosen);
      await load();
    } catch (cause) {
      setAttachError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const dropFile = useCallback(async (file: live.PairingFile) => {
    setAttachError('');
    try {
      await live.removePairingFile(file);
      await load();
    } catch (cause) {
      setAttachError(errorText(cause));
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);
  // A file arriving, or the Guide changing, without a reload. The messages
  // have their own subscription two lines below.
  useKeepUp(KEEP_UP_MY_PAIRING, load);
  const pairingId = pairing?.id;
  useEffect(() => { pairingRef.current = pairingId ?? null; }, [pairingId]);
  useEffect(
    () => pairingId ? live.subscribeToMessages(pairingId, () => void load()) : undefined,
    [pairingId, load],
  );

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pairing || !body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await live.sendMessage(pairing.id, body);
      clearDraft(pairing.id);
      setBody('');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  // FOUR FOLDERS, BECAUSE THIS SCREEN RAN TO NEARLY SEVEN ON A PHONE.
  //
  // An Explorer's own journey was: their Guide, the church's notices, the
  // conversation, the way out of it, the meetings, what has been shared with
  // them, the studies, everything the congregation has written, and the box
  // for asking prayer. All of it theirs, all of it worth having, and all of it
  // one below the other.
  //
  // The relationship stays together in the first folder, and it is the one
  // that opens. The journey is a relationship, so the Guide, the talking, the
  // way out and the arranging of a time are one thing and are not split up.
  // THE CHURCH ROOM APPEARS ONLY WHEN THERE IS SOMETHING IN IT.
  //
  // Reported from the live app: the tab opened on nothing. That was not a bug —
  // the read policy is `church_id = my_church_id()` and an Explorer satisfies
  // it — the church had simply not posted anything addressed to them yet. An
  // empty folder on somebody's first day reads as an app that is broken, so the
  // ask was to take the tab out.
  //
  // TAKING IT OUT ALTOGETHER WAS WRONG, and the blog walk is what said so: this
  // room is the Explorer's ONLY route to what the church writes, and the reader
  // count on a Guide's post is recorded when an Explorer opens it here. Removing
  // the tab did not remove an empty room, it removed a working feature that
  // happened to be empty in one church this week.
  //
  // So the room is conditional rather than gone. Nothing to read, no tab; the
  // moment a Guide publishes something for them, it is there. Neither an empty
  // folder nor a lost feature.
  const [churchHasSomething, setChurchHasSomething] = useState(false);
  useEffect(() => {
    // One row is all this asks: "is there anything at all?" The feed itself is
    // loaded by the room when somebody opens it.
    void live.listBlogFeed(1)
      .then((posts) => setChurchHasSomething(posts.length > 0))
      .catch(() => setChurchHasSomething(false));
  }, []);

  const rooms: Room[] = [
    { id: 'guide', label: '🤝 My Guide' },
    { id: 'study', label: '📖 Study' },
    ...(churchHasSomething ? [{ id: 'church', label: '⛪ Church' }] : []),
    { id: 'prayer', label: '🙏 Prayer' },
  ];
  const [room, chooseRoom] = useRoom(rooms, 'beacon:journey-room', { prayer: 'prayer' });
  // Which series the shelf should already be open at, when somebody arrives
  // from the Read next card rather than by browsing.
  const [openSeries, setOpenSeries] = useState('');

  return (
    <LiveAppShell allow={['ds']}>
      <div className="space-y-5">
        <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg, ${NAVY}, #2F80ED)` }}>
          <p className="text-white/70">Welcome,</p>
          <h1 className="text-3xl font-extrabold">{profile?.full_name.split(' ')[0]}</h1>
          <p className="mt-3 text-white/80">Your journey is a relationship, not a score.</p>
        </div>

        <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

        {error && <Notice tone="error">{error}</Notice>}

        {room === 'guide' && (
          <>
            {/* WHO IS WALKING WITH YOU, FIRST, and on this screen only.
                On a Director's or a Guide's home the church's writing comes
                first, because their job is the church. An Explorer opening My
                Journey is not looking for the church, they are looking for
                their person. */}
            {pairing && <GuideCard pairing={pairing} />}

            {/* AND HOW FAR THE TWO OF THEM HAVE COME, directly under the person
                it was travelled with. Asked for in these words: "There must be
                a progressive bar that the Explorers can see too that is aligned
                with the Journey that the Guide sees, so when the Guide
                progresses the Explorer, the Explorer can appreciate and affirm
                that he/she progresses in the Journey with the Guide."

                The Guide has had this all along, as six named stages on their
                own screen. The Explorer had nothing: somebody could be moved
                forward and never know it happened. This is the same journey,
                drawn as movement rather than as a category -- no stage name, no
                fraction, no ticks, each of those a decision explained in the
                component itself.

                It draws nothing without a pairing, which is why it can sit
                outside the branch below that handles that case. */}
            {pairing && <JourneyBar guideName={pairing.dm_name} />}

            {/* THE FIRST THING ON THE FIRST SCREEN. An Explorer who opens the
                app cold now meets one sentence telling them what to do, by
                name, before the conversation or anything else. */}
            <NextStudy
              onOpen={(seriesId) => {
                setOpenSeries(seriesId);
                chooseRoom('study');
              }}
            />

            {/* THE CHURCH, BETWEEN THE PERSON AND THE TALKING. Asked for in
                exactly those words: after the Guide's name box and before the
                chat box. It is the one thing in this folder that did not come
                from the two of them, and below the thread nobody would ever
                scroll to it. Draws nothing when there is nothing pinned. */}
            <LiveAnnouncements hideWhenEmpty />

            {!pairing ? (
              <Card className="p-6 text-center">
                {/* THE WAIT, WITH SOMETHING IN IT. One line saying a Guide
                    was coming "soon" was the whole of this screen, so an
                    Explorer's first week could be a sentence that never
                    changed. It now says what has already happened, that the
                    church can see they are waiting, and what they can do
                    meanwhile -- because the studies do not need a Guide. */}
                <h2 className="text-xl font-bold text-navy">Your Guide is being arranged</h2>
                <p className="mt-2 text-gray-600">
                  A Director can see that you are waiting, and pairs people
                  themselves rather than leaving it to chance. It usually takes a
                  few days.
                </p>
                <p className="mt-3 text-gray-600">
                  You do not have to wait to begin. The studies your church has
                  published are open to you now, in the Study folder above, and
                  whoever you are paired with will be able to see where you got to.
                </p>
              </Card>
            ) : (
              <>
                <Conversation
                  // THE THIRD WAITING SCREEN. An Explorer whose Guide has not
                  // written yet was told to "start with a welcome", which is the
                  // Guide's job. This says the true thing instead: nothing is
                  // wrong, and they are allowed to go first.
                  emptyLine="No messages yet. Your Guide will write, and you can write first if you would like to."
                  messages={messages}
                  files={files}
                  myId={profile?.id ?? ''}
                  myName={profile?.full_name}
                  theirName={pairing.dm_name}
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
                {/* THE ONE THAT MATTERS MOST. The Explorer is the person with
                    the least standing in this relationship and the most reason
                    to stay silent, so their route out has to be on the same
                    screen as the conversation itself. It is in this folder for
                    that reason and must not be moved to another one. */}
                <LiveReportControl
                  subjectId={pairing.dm_id}
                  subjectName={pairing.dm_name}
                  pairingId={pairing.id}
                />
                {/* ARRANGING A TIME IS PART OF THE RELATIONSHIP, so it sits
                    with the conversation rather than in a folder of its own. */}
                <LiveMeetings pairingId={pairing.id} withName={pairing.dm_name} />
              </>
            )}
          </>
        )}

        {/* WHAT SOMEBODY HAS PUT IN FRONT OF YOU TO READ. A file a Guide
            shared and a study series the church published are the same errand,
            so they are one folder. */}
        {/* AN EXPLORER SHARES TOO, and until today could not. The library was
            Guides and leadership only. It goes both ways now: an Explorer who
            finds something worth reading can put it in front of the person
            walking with them, which is a small thing and is most of what
            "a relationship, not a score" means in practice. */}
        {room === 'study' && (
          <>
            {pairing && (
              <LiveLibraryForGuide
                pairings={[{ id: pairing.id, ds_name: pairing.dm_name }]}
              />
            )}
            <LiveSharedWithMe />
            <LiveStudies openSeries={openSeries} />
          </>
        )}

        {/* READ, THEN ASK. Writing moved to the Publish room, which every role
            has: this screen is somebody's journey, and their own blog desk sat
            on it because there was nowhere else to put it. */}
        {/* ASKING FOR PRAYER IS THE MOST EXPOSED THING ANYBODY DOES HERE, which
            is why it was last on the page and is its own folder now rather than
            the first thing anybody sees on opening their journey. */}
        {room === 'church' && <LiveBlogFeed selfId={profile?.id} />}

        {room === 'prayer' && <LiveAskForPrayer />}
      </div>
    </LiveAppShell>
  );
}

/**
 * THE GUIDE IS A PERSON, AND THE SCREEN HAS TO SAY SO.
 *
 * This card was a name on a line. An Explorer arriving at an app that pairs
 * them with a stranger has no way to tell, from a name alone, whether anybody
 * is on the other end — and the one thing this whole product rests on is that
 * they believe somebody is. A face, a city and what that person cares about
 * turn "your Guide" into someone they could recognise in a room.
 *
 * WHAT IT SHOWS IS WHAT THE GUIDE WROTE ABOUT THEMSELVES. Picture, city, work
 * and interests are all fields a Guide filled in on their own profile knowing
 * their church and the people they walk with would read them. No birthday, no
 * contact details, no journey stage, nothing anybody else recorded about them.
 * The short column list in `pairedProfile` is the enforcement; this component
 * could not render more than that if it tried.
 *
 * It draws the name first and fills the rest in when it arrives, so a slow
 * network shows a name instead of a spinner. If the profile read fails the
 * card stays exactly as it was before this existed — a name and the privacy
 * line — because a broken picture is worse than no picture.
 */
function GuideCard({ pairing }: { pairing: live.MyPairing }) {
  const [guide, setGuide] = useState<Profile | null>(null);
  const [photo, setPhoto] = useState('');

  useEffect(() => {
    let alive = true;
    void live
      .pairedProfile(pairing.dm_id)
      .then((found) => { if (alive) setGuide(found); })
      // Silent on purpose: the name above is already on the screen and is the
      // part that matters. An error banner here would be about our plumbing,
      // not about anything the Explorer can act on.
      .catch(() => {});
    return () => { alive = false; };
  }, [pairing.dm_id]);

  // Signed at render time, never stored — a stored signed URL expires and
  // becomes a broken picture with nothing to explain it.
  const photoPath = guide?.photo_path;
  useEffect(() => {
    let alive = true;
    void live.avatarUrl(photoPath).then((url) => { if (alive) setPhoto(url); }).catch(() => {});
    return () => { alive = false; };
  }, [photoPath]);

  const topics = (guide?.topics_of_interest ?? []).filter(Boolean).slice(0, 6);
  const place = [guide?.city_of_residence, guide?.work_industry].filter(Boolean).join(' \u00b7 ');

  return (
    <Card className="p-5">
      <p className="text-sm text-gray-500">Walking with you</p>
      {/* Wraps rather than shrinks: at 320px a 64px circle and a long name do
          not fit on one line, and a squashed face reads as a placeholder. */}
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Avatar
          name={pairing.dm_name}
          size={64}
          photo={photo || undefined}
          avatar={guide?.avatar}
        />
        <div className="min-w-0">
          <p className="text-xl font-bold text-navy">{pairing.dm_name}</p>
          <p className="text-sm text-gray-500">Your Guide{place && <> &middot; {place}</>}</p>
        </div>
      </div>

      {topics.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-500">Cares about</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <span key={topic} className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-navy">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-gray-500">Only you and your Guide can read this conversation.</p>
    </Card>
  );
}

/**
 * One thing in the conversation, whichever kind it is.
 *
 * ONE LIST, SORTED BY TIME — learned the hard way on the demo side, where
 * messages and attachments were two separate render passes and every file drew
 * at the bottom however long ago it was sent. The timestamps said one thing and
 * the order said another. Live never had attachments to get this wrong with; it
 * is built this way from the start so it never can.
 */
