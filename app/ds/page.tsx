'use client';

import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { emitQuest } from '@/lib/quest';
import { AppShell } from '@/components/AppShell';
import { StudyRoom } from '@/components/study/StudyRoom';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { Chat } from '@/components/Chat';
import { Avatar, Button, Card, EmptyState } from '@/components/ui';
import { NAVY } from '@/lib/brand';
import { safeExternalUrl } from '@/lib/url';
import { lessonById } from '@/lib/lessons';
import { Meetings } from '@/components/Meetings';
import { MySeries } from '@/components/MySeries';
import type { MaterialType } from '@/lib/types';
import { seekerPriorities, meetingWhen } from '@/lib/engagement';
import { useIsLive } from '@/lib/tutorial';
import { LiveExplorerPage } from '@/components/LiveCorePages';
import { BlogFeed } from '@/components/Blog';

const MATERIAL_ICON: Record<string, string> = {
  pdf: '📄',
  video: '🎬',
  audio: '🎧',
  image: '🖼️',
  link: '🔗',
};

const VERSES = [
  ['“Come to me, all who are weary… and I will give you rest.”', 'Matthew 11:28'],
  ['“Your word is a lamp to my feet and a light to my path.”', 'Psalm 119:105'],
  ['“Be still, and know that I am God.”', 'Psalm 46:10'],
  ['“I can do all things through Christ who strengthens me.”', 'Philippians 4:13'],
  ['“The Lord is my shepherd; I shall not want.”', 'Psalm 23:1'],
  ['“Cast all your anxiety on him because he cares for you.”', '1 Peter 5:7'],
  ['“Trust in the Lord with all your heart.”', 'Proverbs 3:5'],
];

// The seeker's home: a warm, quiet room to study the Word, keep their own study
// shelf, and talk with their missionary.
export default function DsHome() {
  if (useIsLive()) return <LiveExplorerPage />;
  return (
    <AppShell allow={['ds']}>
      <Home />
    </AppShell>
  );
}

function Home() {
  const { db, currentUser } = useDemo();
  const me = currentUser!;
  const pairing = db.pairings.find(
    (p) => p.ds_id === me.id && p.status === 'active',
  );
  const verse = VERSES[new Date().getDay() % VERSES.length];

  // THE CHURCH ROOM APPEARS ONLY WHEN THERE IS SOMETHING IN IT — the same rule
  // as the live Explorer, because the demo is what gets shown to a room and the
  // two must not disagree about how many tabs an Explorer has. The reasoning is
  // written out in components/live/ExplorerPage.tsx.
  const churchHasSomething = db.blog_posts.some((p) => p.visibility === 'published');
  const rooms: Room[] = [
    { id: 'guide', label: '🤝 My Guide' },
    { id: 'study', label: '📖 Study' },
    ...(churchHasSomething ? [{ id: 'church', label: '⛪ Church' }] : []),
    { id: 'prayer', label: '🙏 Prayer' },
  ];

  const [room, chooseRoom] = useRoom(rooms, 'beacon:demo-journey-room');

  return (
    <div className="space-y-6">
      {/* Warm welcome + verse */}
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: `linear-gradient(135deg, ${NAVY}, #2F80ED)` }}
      >
        <p className="text-white/70">Welcome home,</p>
        <h1 className="text-3xl font-extrabold">{me.full_name.split(' ')[0]}</h1>
        <div className="mt-4 rounded-xl bg-white/10 p-4">
          <p className="text-lg italic">{verse[0]}</p>
          <p className="mt-1 text-sm text-white/70">{verse[1]}</p>
        </div>
      </div>

      {!me.is_approved && (
        <Card className="p-5">
          <p className="font-semibold text-navy">Your account is being reviewed.</p>
          <p className="text-gray-500">
            A church admin will approve you and connect you with a Guide
            soon. You can still explore below.
          </p>
        </Card>
      )}

      {/* What is waiting for YOU, before anything else on the page. Every
          other role has had a dashboard since the beginning; the seeker had a
          content page and had to go looking to find out that their missionary
          had written to them. No stage appears here, and none ever should — a
          priority strip is exactly where "you are ready for the next step"
          would creep back in. */}
      <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

      {/* THE SAME FOUR FOLDERS THE LIVE JOURNEY HAS, in the same order, with
          the same one open first. Somebody learns the job here and then signs
          in; a tutorial that teaches one long page and a live app with folders
          teaches the shape of the app wrong, and every complaint in this area
          has ultimately been that gap. */}
      {room === 'guide' && (
        <>
          <Priorities />
          {pairing ? (
            <Paired pairingId={pairing.id} />
          ) : (
            <EmptyState
              title="A Guide will be connected with you soon"
              hint="Until then, start your own study shelf in Study."
            />
          )}
        </>
      )}

      {room === 'study' && (
        <>
          <MySeries />
          <MyLessons />
          <StudyShelf />
        </>
      )}

      {/* A Guide's post is a person speaking, so it is the church folder rather
          than something under a reading list. */}
      {room === 'church' && <BlogFeed userId={currentUser!.id} />}

      {room === 'prayer' && <PrayerCorner />}
    </div>
  );
}

// The seeker's assigned lessons — their study plan, with a progress bar.
function MyLessons() {
  const { db, currentUser, completeLesson } = useDemo();
  const me = currentUser!;
  const pairing = db.pairings.find(
    (p) => p.ds_id === me.id && p.status === 'active',
  );
  if (!pairing) return null;
  const items = db.lesson_assignments
    .filter((a) => a.pairing_id === pairing.id)
    .map((a) => ({ a, lesson: lessonById(a.lesson_id) }))
    .filter((x) => x.lesson)
    .sort((x, y) => x.a.created_at.localeCompare(y.a.created_at));
  if (items.length === 0) return null;
  const done = items.filter((x) => x.a.status === 'completed').length;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📖 My lessons</h2>
      <p className="mb-2 text-sm text-gray-500">
        {done} of {items.length} completed
      </p>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full"
          style={{
            width: `${(done / items.length) * 100}%`,
            backgroundColor: '#7FB03A',
          }}
        />
      </div>
      <div className="space-y-2">
        {items.map(({ a, lesson }) => {
          const url = safeExternalUrl(lesson!.link);
          const isDone = a.status === 'completed';
          return (
            <div key={a.id} className="rounded-xl bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>📖</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{lesson!.title}</p>
                  <p className="truncate text-sm text-gray-500">
                    {lesson!.description}
                  </p>
                </div>
                {isDone && (
                  <span className="text-sm font-semibold text-green-600">
                    ✓ Done
                  </span>
                )}
              </div>
              {!isDone && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-navy ring-1 ring-black/5"
                    >
                      Open
                    </a>
                  )}
                  <Button
                    variant="gold"
                    className="px-4 text-base"
                    data-quest="ds-lesson"
                    onClick={() => {
                      completeLesson(a.id);
                      emitQuest('beacon:ds-lesson');
                    }}
                  >
                    Mark done
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const PRAYER_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Shared', color: '#5B6675' },
  praying: { label: 'Being prayed for', color: '#2F80ED' },
  answered: { label: 'Answered 🙌', color: '#7FB03A' },
};

// A seeker's prayer corner: send a request to their missionary, optionally to
// the whole church anonymously, and see how each one is being held.
function PrayerCorner() {
  const { db, currentUser, addPrayerRequest } = useDemo();
  const me = currentUser!;
  const [body, setBody] = useState('');
  const [shareBoard, setShareBoard] = useState(false);

  const mine = db.prayer_requests
    .filter((r) => r.ds_id === me.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const send = () => {
    if (!body.trim()) return;
    addPrayerRequest(body, shareBoard);
    setBody('');
    setShareBoard(false);
  };

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🙏 Prayer</h2>
      <p className="mb-4 text-sm text-gray-500">
        Share a request with your Guide. You can also let the whole church
        pray for it. Your name is never shown when they do.
      </p>

      <div className="rounded-xl bg-gray-50 p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What can we pray with you about?"
          rows={3}
          className="w-full rounded-xl bg-white px-4 py-3 text-lg outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold"
        />
        <label className="mt-2 flex items-center gap-2 text-gray-600">
          <input
            type="checkbox"
            checked={shareBoard}
            onChange={(e) => setShareBoard(e.target.checked)}
            className="h-5 w-5"
          />
          Share with the whole church, anonymously
        </label>
        <div className="mt-3">
          <Button
            variant="gold"
            disabled={!body.trim()}
            data-quest="ds-prayer"
            onClick={() => {
              send();
              emitQuest('beacon:ds-prayer');
            }}
          >
            Send prayer request
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {mine.length === 0 ? (
          <p className="text-gray-400">Your requests will appear here.</p>
        ) : (
          mine.map((r) => {
            const st = PRAYER_STATUS[r.status];
            return (
              <div key={r.id} className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-navy">{r.body}</p>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="font-semibold" style={{ color: st.color }}>
                    {st.label}
                  </span>
                  {r.share_with_board && (
                    <span className="text-gray-400">· on the church prayer wall</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

// A quiet strip, not a scoreboard. It shows only the things that are actually
// waiting, and disappears entirely when nothing is — an empty dashboard that
// says "0 unread, 0 lessons" every day teaches people to stop reading it.
function Priorities() {
  const { db, currentUser } = useDemo();
  const me = currentUser!;
  const pairing = db.pairings.find(
    (p) => p.ds_id === me.id && p.status === 'active',
  );

  // Snapshot on arrival, not live.
  //
  // The conversation is on this same page, and Chat marks everything read the
  // moment it mounts (components/Chat.tsx). Recomputing on every render meant
  // the "a message from Maria" line appeared and vanished within the same
  // paint — the one thing the seeker most needed to see was the one thing this
  // strip could never show. Freezing it answers the honest question: what was
  // waiting for you when you got here.
  const [p] = useState(() => seekerPriorities(db, me.id, pairing));
  const dm = pairing
    ? db.profiles.find((x) => x.id === pairing.dm_id)
    : undefined;
  const firstName = dm?.full_name.split(' ')[0] ?? 'your Guide';

  const items: { icon: string; label: string; detail: string }[] = [];
  if (p.awaitingReply)
    items.push({
      icon: '💬',
      label: `${firstName} is waiting to hear from you`,
      detail:
        p.awaitingReply.body.length > 90
          ? `${p.awaitingReply.body.slice(0, 90)}…`
          : p.awaitingReply.body,
    });
  else if (p.unreadFromDm > 0)
    items.push({
      icon: '💬',
      label:
        p.unreadFromDm === 1
          ? `A message from ${firstName}`
          : `${p.unreadFromDm} messages from ${firstName}`,
      detail: 'Waiting in Talk, below.',
    });
  if (p.nextMeeting)
    items.push({
      icon: '📅',
      label: p.nextMeeting.title || `Meeting with ${firstName}`,
      detail: meetingWhen(p.nextMeeting.when),
    });
  if (p.lessonsOpen > 0)
    items.push({
      icon: '📖',
      label:
        p.lessonsOpen === 1 ? 'A lesson to finish' : `${p.lessonsOpen} lessons to finish`,
      detail: 'Take them at your own pace.',
    });
  if (p.latestShare) {
    const mat = db.materials.find((m) => m.id === p.latestShare!.material_id);
    if (mat)
      items.push({
        icon: '📚',
        label: `${firstName} shared "${mat.title}"`,
        detail: 'In Shared with me, below.',
      });
  }

  if (items.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-xl font-bold text-navy">Waiting for you</h2>
      <div className="space-y-2">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-start gap-3 rounded-xl bg-gray-50 p-3"
          >
            <span className="text-xl" aria-hidden>
              {it.icon}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-navy">{it.label}</p>
              <p className="text-sm text-gray-500">{it.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Paired({ pairingId }: { pairingId: string }) {
  const { db } = useDemo();
  const pairing = db.pairings.find((p) => p.id === pairingId)!;
  const dm = db.profiles.find((x) => x.id === pairing.dm_id)!;

  const shared = db.material_shares
    .filter((s) => s.pairing_id === pairing.id)
    .map((s) => ({ share: s, material: db.materials.find((m) => m.id === s.material_id)! }))
    .filter((x) => x.material)
    .sort((a, b) => b.share.created_at.localeCompare(a.share.created_at));

  return (
    <>
      {/* The six-stage ladder used to sit above this, telling the seeker which
          step of someone else's process they were on. The client asked for it
          to be hidden from them, and they were right: a stage is a note the
          church keeps about a person, not a thing that person is. What is
          left is who is walking with them and what they are studying. */}
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={dm.full_name} size={56} photo={dm.photo} avatar={dm.avatar} />
        <div className="flex-1">
          <p className="text-sm text-gray-500">Walking with you</p>
          <p className="text-xl font-bold text-navy">{dm.full_name}</p>
          <p className="text-sm text-gray-500">
            Message them any time. This conversation is only between the two of you.
          </p>
        </div>
      </Card>

      <Meetings pairingId={pairing.id} />

      <div>
        <h2 className="mb-3 text-xl font-bold text-navy">💬 Talk with {dm.full_name.split(' ')[0]}</h2>
        <Chat pairingId={pairing.id} />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-xl font-bold text-navy">📚 Shared with me</h2>
        {shared.length === 0 ? (
          <p className="text-gray-500">
            Your Guide will send readings and videos here.
          </p>
        ) : (
          <div className="space-y-2">
            {shared.map(({ share, material }) => {
              const url = safeExternalUrl(material.external_url);
              const inner = (
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                  <span className="text-2xl" aria-hidden>{MATERIAL_ICON[material.type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy">{material.title}</p>
                    {share.note && (
                      <p className="truncate text-sm text-gray-500">“{share.note}”</p>
                    )}
                  </div>
                  {url && <span className="text-navy underline">Open</span>}
                </div>
              );
              return url ? (
                <a key={share.id} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  {inner}
                </a>
              ) : (
                <div key={share.id}>{inner}</div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

// The seeker's own shelf: notes and media they add themselves.
function StudyShelf() {
  const { db, currentUser, addSeekerMedia } = useDemo();
  const me = currentUser!;
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MaterialType>('pdf');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');

  const mine = db.seeker_media
    .filter((m) => m.ds_id === me.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const add = () => {
    if (!title.trim()) return;
    addSeekerMedia({ title, type, note: note || undefined, external_url: link || undefined });
    setTitle('');
    setNote('');
    setLink('');
  };

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🗒️ My study shelf</h2>
      <p className="mb-4 text-sm text-gray-500">
        Keep your own notes and media here. Your Guide can study these with
        you.
      </p>

      <div className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. My notes on John 3)"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-lg outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold sm:col-span-2"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as MaterialType)}
          className="tap w-full min-w-0 rounded-xl bg-white px-3 text-base ring-1 ring-black/5"
        >
          <option value="pdf">Note / document</option>
          <option value="link">Link</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="image">Image</option>
        </select>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Link (optional)"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-black/5"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A short note (optional)"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-black/5 sm:col-span-2"
        />
        <div className="sm:col-span-2">
          <Button variant="gold" disabled={!title.trim()} onClick={add}>
            ➕ Add to my shelf
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {mine.length === 0 ? (
          <p className="text-gray-400">Nothing yet. Add your first note above.</p>
        ) : (
          mine.map((m) => {
            const url = safeExternalUrl(m.external_url);
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                <span className="text-2xl" aria-hidden>{MATERIAL_ICON[m.type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">{m.title}</p>
                  {m.note && <p className="truncate text-sm text-gray-500">{m.note}</p>}
                </div>
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-navy underline">
                    Open
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
