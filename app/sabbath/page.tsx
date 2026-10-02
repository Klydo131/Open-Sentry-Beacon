'use client';

// This Sabbath, for every member: the program the church shared, and a
// leader's own programs, readable and editable with no signal.
//
// WHY THIS PAGE DOES NOT WAIT FOR THE DATABASE. Every other signed-in page
// asks the database who the person is before it draws anything, so opened
// with no signal it can only say it could not load the account. This one has
// nothing it needs from the database to be useful: the programs are on the
// phone. So when the person cannot be looked up, it draws from the device for
// the account this browser is signed in as, says so, and catches up the
// moment the church can be reached.
//
// That fallback reads only this device's own storage, under this browser's
// own signed-in account. It unlocks nothing on the server, and the remembered
// role it uses decides only which of the device's own lists to show.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { BeaconSplash } from '@/components/BeaconLoader';
import { ThisSabbath } from '@/components/ThisSabbath';
import { postsVisibleTo } from '@/components/Blog';
import { useLiveSession } from '@/lib/live/session';
import { KEEP_UP_BLOG, useKeepUp } from '@/lib/live/keep-up';
import { useIsLive } from '@/lib/tutorial';
import { useDemo } from '@/lib/demo/store';
import * as live from '@/lib/live/data';
import { readBrowserSession } from '@/lib/supabase/client';
import {
  isSharedProgram, loadReceived, rememberRole, rememberedRole, saveReceived, type ReceivedProgram,
} from '@/lib/sabbath-program';
import {
  byNewest, isSharedMeeting, loadReceivedMeetings, saveReceivedMeetings,
} from '@/lib/evangelistic-meeting';
import type { Role } from '@/lib/types';

const EVERYONE: Role[] = ['executive', 'admin', 'dm', 'ds'];

function LiveSabbath() {
  const { profile, loading } = useLiveSession();
  const [stored, setStored] = useState<string | null>(null);
  const owner = profile?.id ?? stored;
  const [received, setReceived] = useState<ReceivedProgram[] | null>(null);
  const [meetings, setMeetings] = useState<ReceivedProgram[] | null>(null);
  const [status, setStatus] = useState('');
  const [churchName, setChurchName] = useState<string>();

  // Read after mount: storage does not exist while the page is being built.
  useEffect(() => { setStored(readBrowserSession()?.user?.id ?? null); }, []);

  // The device's copy, at once.
  useEffect(() => {
    if (!owner) return;
    setReceived(loadReceived(owner));
    setMeetings(loadReceivedMeetings(owner));
  }, [owner]);

  // Then the church's, when it can be asked, and again whenever a post
  // changes: a program posted while somebody has the page open arrives
  // without a reload, and is kept on the phone at once.
  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const posts = (await live.listBlogFeed(100))
        .map((p) => ({ id: p.id, title: p.title, body: p.body, from: p.author_name, at: p.created_at }));
      const shared = posts.filter((p) => isSharedProgram(p.title));
      const series = posts.filter((p) => isSharedMeeting(p.title)).sort(byNewest);
      setReceived(shared);
      setMeetings(series);
      const kept = saveReceived(profile.id, shared) && saveReceivedMeetings(profile.id, series);
      setStatus(kept ? '' : 'This browser would not keep a copy, so this will need a signal next time.');
    } catch {
      setStatus('Your church could not be reached. This is what this phone saved last time.');
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    rememberRole(profile.id, profile.role);
    void load();
    let alive = true;
    live.myChurch().then((c) => { if (alive) setChurchName(c?.name ?? undefined); }).catch(() => {});
    return () => { alive = false; };
  }, [profile, load]);
  useKeepUp(KEEP_UP_BLOG, load);

  const share = async (post: { title: string; body: string; audience: 'all' | 'church' }) => {
    await live.createBlogPost({ ...post, visibility: 'published' });
  };

  if (loading) return <BeaconSplash label="Opening This Sabbath…" />;

  if (profile) {
    return (
      <LiveAppShell allow={EVERYONE}>
        <ThisSabbath
          owner={profile.id}
          role={profile.role}
          churchName={churchName}
          received={received}
          meetings={meetings}
          status={status}
          share={share}
        />
      </LiveAppShell>
    );
  }

  // No profile, but this browser is signed in: almost always no signal.
  if (owner) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6" data-offline-sabbath>
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">
          Your church cannot be reached just now, so this is what this phone has saved. It catches up
          by itself when there is a signal.
        </p>
        <ThisSabbath owner={owner} role={rememberedRole(owner)} received={received} meetings={meetings} />
        <a href="/" className="tap-sm inline-flex items-center font-semibold text-navy underline">Home</a>
      </main>
    );
  }

  // Not signed in on this browser: the shell sends them to sign in.
  return <LiveAppShell allow={EVERYONE}><span /></LiveAppShell>;
}

function DemoSabbath() {
  const { db, currentUser, addBlogPost } = useDemo();
  const owner = `sample:${currentUser?.id ?? 'nobody'}`;

  // What this sample person may read, by the same rule as the sample feed, and
  // their own shared programs too, as a church's own app returns them.
  const readable = useMemo<ReceivedProgram[]>(() => {
    if (!currentUser) return [];
    const nameOf = (id: string) => db.profiles.find((x) => x.id === id)?.full_name ?? 'Someone';
    const mine = db.blog_posts.filter((p) => p.author_id === currentUser.id && p.visibility === 'published');
    const seen = new Map([...postsVisibleTo(db, currentUser.id), ...mine].map((p) => [p.id, p]));
    return [...seen.values()]
      .map((p) => ({ id: p.id, title: p.title, body: p.body, from: nameOf(p.author_id), at: p.created_at }));
  }, [db, currentUser]);
  const received = useMemo(() => readable.filter((p) => isSharedProgram(p.title)), [readable]);
  const meetings = useMemo(() => readable.filter((p) => isSharedMeeting(p.title)).sort(byNewest), [readable]);

  // Kept on the device the same way, so the two halves behave alike offline.
  useEffect(() => {
    if (!currentUser) return;
    saveReceived(owner, received);
    saveReceivedMeetings(owner, meetings);
  }, [owner, received, meetings, currentUser]);

  const share = async (post: { title: string; body: string; audience: 'all' | 'church' }) => {
    addBlogPost({ ...post, visibility: 'published' });
  };

  return (
    <ThisSabbath
      owner={owner}
      role={currentUser?.role ?? null}
      churchName={db.church_name}
      received={received}
      meetings={meetings}
      share={share}
    />
  );
}

export default function SabbathPage() {
  if (useIsLive()) return <LiveSabbath />;
  return <AppShell allow={EVERYONE}><DemoSabbath /></AppShell>;
}
