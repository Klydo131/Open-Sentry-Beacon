'use client';

// The blog, against a real database. The live twin of components/Blog.tsx.
//
// The demo version keeps posts in the browser and can decide for itself who
// sees what. This one decides nothing: it asks for posts and shows what comes
// back, because row level security already returned only what this person is
// entitled to (migration 0006). A filter here would protect nobody — the
// browser can call PostgREST directly with the same public key.
//
// The one thing that could not be a policy is the reader count, because it is
// an aggregate rather than a row. It comes from a SECURITY DEFINER function
// that returns a NUMBER and never the names behind it. The Guide learns that
// four people read the post and never which four, for the same reason an
// Explorer is never shown their own journey stage: somebody exploring faith
// should be able to read quietly without being watched doing it.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as live from '@/lib/live/data';
import { Button, Card } from '@/components/ui';
import { useFocusOnWrite } from '@/components/WritePost';
import { Linked } from '@/components/Linked';
import { roleLabel, roleNoun } from '@/lib/brand';
import { useLiveSession } from '@/lib/live/session';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';
import { useKeepUp, KEEP_UP_BLOG } from '@/lib/live/keep-up';

function when(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const message = (cause: unknown) =>
  humanError(cause, 'Something went wrong.');

/** Paragraphs from a plain textarea. No markdown, no HTML, nothing to escape. */
function Body({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">
          <Linked text={para} />
        </p>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The writer's desk. Anybody approved in a church has one.
// ---------------------------------------------------------------------------
export function LiveBlogDesk() {
  const [posts, setPosts] = useState<live.MyBlogPost[] | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [advanced, setAdvanced] = useState(false);
  // What just happened, said where the person is looking. Cleared as soon as
  // they start the next post.
  const [done, setDone] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  // From Home's "Write a post": the cursor goes straight into Title.
  useFocusOnWrite(titleRef);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<live.BlogAudienceKind>('church');
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setPosts(await live.listMyBlogPosts());
      setError('');
    } catch (cause) {
      // Not a silent setPosts([]). An empty list and a failed read look
      // identical to a reader, and the second is the one somebody must act on.
      setPosts([]);
      setError(message(cause));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_BLOG, load);

  useEffect(() => {
    let alive = true;
    live.listPairings()
      .then((rows) => {
        if (!alive) return;
        setPeople(rows.filter((r) => r.status === 'active').map((r) => ({ id: r.ds_id, name: r.ds_name })));
      })
      .catch(() => { /* the picker degrades to "everyone"; not worth an error */ });
    return () => { alive = false; };
  }, []);

  const canPost = Boolean(
    title.trim() && body.trim() && (audience !== 'selected' || picked.length > 0),
  );

  const submit = async (visibility: live.BlogVisibility) => {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await live.createBlogPost({ title, body, visibility, audience, dsIds: picked });
      setTitle(''); setBody(''); setAudience('church'); setPicked([]);
      setDone(visibility === 'private'
        ? 'Saved as a draft. Only you can see it, below.'
        : audience === 'church'
          ? 'Published. Everyone in the church can read it now.'
          : 'Published, to the people you chose.');
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      {/* ONE HEADING AND ONE LINE, AND NO CLOSE BUTTON. The owner, 4 October
          2026: "I would love writing the Blog to be simple". The box used to
          carry a Close/Write switch as its largest button, dark beside a grey
          Publish that waits for words: the first thing the eye found on a
          writing screen was the way to stop writing. It is always open now,
          and Publish is the one strong button. */}
      <h2 className="text-xl font-bold text-navy">✍️ Write a post</h2>
      <p className="text-sm text-gray-500">For your church to read, in their own time.</p>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="mt-4 rounded-xl bg-navy/5 p-4">
          <label className="block text-sm font-semibold text-navy" htmlFor="lblog-title">Title</label>
          <input
            id="lblog-title" ref={titleRef} value={title} onChange={(e) => { setTitle(e.target.value); setDone(''); }}
            placeholder="What I keep coming back to in Psalm 23"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />
          <label className="mt-3 block text-sm font-semibold text-navy" htmlFor="lblog-body">Post</label>
          <textarea
            id="lblog-body" value={body} onChange={(e) => { setBody(e.target.value); setDone(''); }} rows={7}
            placeholder="Leave a blank line between paragraphs."
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />

          {advanced && (<>
          {/* THE NOTICEBOARD IS FIRST because it is what most people mean by
              publishing. The two narrower audiences are still here, and a post
              addressed to one of them is not on the board at all. */}
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold text-navy">Who sees it</legend>
            <label className="mt-1 flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="lblog-aud" checked={audience === 'church'} onChange={() => setAudience('church')} />
              Everyone in the church
              <span className="text-gray-400">(it goes on the church home screen)</span>
            </label>
            {/* SAID BEFORE THEY PRESS PUBLISH, not discovered afterwards. A
                church-wide post is signed with the writer's name and role, and
                somebody choosing that audience is entitled to know they are
                choosing to be identified. */}
            {audience === 'church' && (
              <p className="mt-1 pl-6 text-xs text-gray-500">
                Your name and role are shown on it, so the church can see who
                said what.
              </p>
            )}
            <label className="mt-1 flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="lblog-aud" checked={audience === 'all'} onChange={() => setAudience('all')} />
              Only the people I walk with
              <span className="text-gray-400">
                {people.length === 0
                  ? '(whoever you are paired with)'
                  : `(${people.length} ${people.length === 1 ? 'person' : 'people'}, and anyone paired with me later)`}
              </span>
            </label>
            {/* Hidden when there is nobody to choose from. An Explorer walks
                with one Guide, so a picker with nothing in it is an option that
                cannot be completed, sitting under a button that stays
                disabled. */}
            {people.length > 0 && (
              <label className="mt-1 flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" name="lblog-aud" checked={audience === 'selected'} onChange={() => setAudience('selected')} />
                Only the people I choose
              </label>
            )}
          </fieldset>

          {audience === 'selected' && (
            <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-black/5">
              {people.length === 0 ? (
                <p className="text-sm text-gray-500">You are not walking with anyone yet.</p>
              ) : people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                  <input
                    type="checkbox" checked={picked.includes(p.id)}
                    onChange={() => setPicked((v) => v.includes(p.id) ? v.filter((x) => x !== p.id) : [...v, p.id])}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )}

          </>)}

          {!advanced && (
            <p className="mt-2 text-xs text-gray-500">Everyone in the church sees it, with your name and role on it.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => submit('published')} disabled={!canPost || busy}>Publish</Button>
            {advanced && (
              <Button variant="ghost" onClick={() => submit('private')} disabled={!title.trim() || !body.trim() || busy}>
                Save as draft
              </Button>
            )}
          </div>
          {done && (
            <p role="status" data-blog-done className="mt-3 text-sm font-semibold text-green-800">
              {done}
            </p>
          )}
          {/* SIMPLE FIRST, ADVANCED WHEN WANTED. The owner, 3 October 2026,
              moving writing into Home: "make it simple with advance settings
              too", and again on 4 October: "advance settings too but that's
              optional". Simple is a title, the post and Publish, to everybody
              in the church. The switch for the rest sits BELOW Publish, so
              nobody has to read past it to finish; what it adds (who sees it,
              a draft) appears above the buttons it changes. */}
          <label className="mt-4 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-navy">
            <input
              type="checkbox"
              data-blog-advanced
              checked={advanced}
              onChange={(e) => {
                setAdvanced(e.target.checked);
                if (!e.target.checked) {
                  setAudience('church');
                  setPicked([]);
                }
              }}
            />
            Advanced settings
            <span className="font-normal text-gray-500">(choose who sees it, or save as a draft)</span>
          </label>

      </div>

      <div className="mt-4 space-y-3">
        {posts === null && <BeaconSpinner inline label="Loading your posts" className="mt-2" />}
        {posts?.length === 0 && !error && (
          <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
            Nothing written yet. Your first post can be three sentences.
          </p>
        )}
        {posts?.map((p) => (
          <article key={p.id} className="rounded-xl bg-white p-4 ring-1 ring-black/5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex-1 text-lg font-bold text-navy">{p.title}</h3>
              {p.visibility === 'private' ? (
                <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[11px] font-bold text-gray-700">DRAFT</span>
              ) : (
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-bold text-green-800">
                  {p.audience === 'church'
                    ? 'THE WHOLE CHURCH'
                    : p.audience === 'all'
                      ? 'THE PEOPLE I WALK WITH'
                      : 'CHOSEN PEOPLE'}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-gray-400">{when(p.created_at)}</p>
            <Body text={p.body} />
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              {/* A draft has no readers, and "0 readers" about something nobody
                  could open reads like failure rather than a choice. */}
              {p.visibility === 'published' && (
                <span className="text-sm text-gray-500" title="People who opened this. Names are never shown.">
                  👁️ {p.reader_count} {p.reader_count === 1 ? 'reader' : 'readers'}
                </span>
              )}
              <span className="flex-1" />
              <Button
                variant="ghost" disabled={busy}
                onClick={() => act(() => live.setBlogVisibility(p.id, p.visibility === 'published' ? 'private' : 'published'))}
              >
                {p.visibility === 'published' ? 'Make private' : 'Publish'}
              </Button>
              {confirming === p.id ? (
                <>
                  <Button variant="danger" disabled={busy} onClick={() => { setConfirming(''); void act(() => live.deleteBlogPost(p.id)); }}>
                    Delete for good
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming('')}>Keep</Button>
                </>
              ) : (
                // Two steps: deleting takes the post and its readers with it and
                // there is no undo.
                <Button variant="danger" onClick={() => setConfirming(p.id)}>Delete</Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The Explorer's feed.
// ---------------------------------------------------------------------------
/**
 * Community Blogs.
 *
 * WHAT CHANGED AND WHY. This was headed "From your Guide" and quietly dropped
 * the reader's own posts, both of which were right while a Guide was the only
 * person who could write. Now anybody in the church can, so the heading names
 * the thing rather than one relationship, every post carries its writer, and
 * your own posts stay in the list: a board that hides your contribution from
 * you looks broken to the one person who knows exactly what should be on it.
 *
 * IT SCROLLS, AND IT FOLDS AWAY. This sits near the top of every home screen,
 * so left alone it grows until it is the whole page and everything a person
 * came to do is below it. Past three posts it gets a scroll box of its own, and
 * the heading folds it shut entirely. Both are per device and remembered, so
 * somebody who does not want to read the blogs today shuts them once rather
 * than scrolling past them every time.
 *
 * SHUT STILL SAYS HOW MANY. A folded panel with no count is indistinguishable
 * from an empty one, and then nobody ever opens it again.
 *
 * It renders nothing at all when there is nothing to read and nothing failed.
 * An empty card at the top of Home is worse than no card: it is a permanent
 * reminder of a thing not happening.
 */
const OPEN_KEY = 'beacon.blogs.open';

export function LiveBlogFeed({ selfId }: { selfId?: string }) {
  // The viewer's own role, because naming somebody's role is not unconditional:
  // lib/brand.ts hides "Explorer" from viewers who have no business knowing who
  // is at which stage. Passing the viewer through keeps the blogs inside that
  // rule instead of quietly working around it.
  const { profile } = useLiveSession();
  const [posts, setPosts] = useState<live.FeedPost[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);
  const [pinning, setPinning] = useState('');

  // Read once on mount rather than during render: the server has no
  // localStorage, and reading it inline is how a hydration mismatch starts.
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(OPEN_KEY) !== '0');
    } catch { /* private mode, or storage switched off. Open is fine. */ }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { window.localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* fine */ }
  };

  // Re-read after pinning rather than reordering the list here: the ORDER is
  // the database's decision, and a second copy of it in the component is one
  // that can disagree with what everybody else sees.
  const pin = async (id: string, next: boolean) => {
    setPinning(id);
    setError('');
    try {
      await live.setPostPinned(id, next);
      setPosts(await live.listBlogFeed());
    } catch (cause) {
      setError(message(cause));
    } finally {
      setPinning('');
    }
  };

  useEffect(() => {
    let alive = true;
    live.listBlogFeed()
      .then((rows) => {
        if (!alive) return;
        setPosts(rows);
        // Opening the page is reading it. No button to forget to press, and the
        // database ignores a second view from the same person. Your own post is
        // not a read of it, so those are left out of the count.
        rows.filter((r) => r.author_id !== selfId)
          .forEach((r) => void live.recordBlogView(r.id));
      })
      .catch((cause) => { if (alive) { setPosts([]); setError(message(cause)); } });
    return () => { alive = false; };
  }, [selfId]);

  if (posts === null) return null;
  if (posts.length === 0 && !error) return null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-navy">📣 Community Blogs</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {open
              ? 'What people in your church have published, newest first.'
              : `${posts.length} ${posts.length === 1 ? 'post' : 'posts'} from your church.`}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="tap-sm shrink-0 rounded-xl bg-gray-100 px-3 py-1.5 text-sm font-bold text-navy hover:bg-gray-200"
        >
          {open ? 'Hide' : `Show (${posts.length})`}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {open && (
        <div
          className={`mt-3 space-y-4 ${
            posts.length > 3
              ? 'beacon-scroll max-h-[32rem] overflow-y-auto overscroll-contain pr-1'
              : ''
          }`}
        >
          {posts.map((p) => (
            <article
              key={p.id}
              className={`rounded-xl p-4 ${p.pinned ? 'bg-gold/10 ring-1 ring-gold/40' : 'bg-navy/5'}`}
            >
              {/* SAID, NOT JUST ORDERED. A post silently sitting first looks
                  like the newest one, so somebody wonders why a welcome from
                  last month is above this morning's notice. The label is what
                  turns an odd order into a deliberate one. */}
              {p.pinned && (
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                  📌 Start here
                </p>
              )}
              <h3 className="text-lg font-bold text-navy">{p.title}</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {p.author_id === selfId ? 'You' : p.author_name}
                {/* THE ROLE IS ALWAYS SHOWN ON A CHURCH-WIDE POST, on purpose.
                    lib/brand's roleLabel hides "Explorer" from viewers who have
                    no business knowing who is at which stage, and that rule is
                    right everywhere it applies, but it does not apply here.
                    Publishing to the whole church is the writer's own decision
                    to be identified, and a board where some posts are signed
                    and others are anonymous is one nobody can hold to account.
                    Narrower audiences keep the ordinary rule. */}
                {p.author_id !== selfId
                  ? (() => {
                      if (p.audience === 'church') return ` · ${roleNoun(p.author_role)}`;
                      const label = profile ? roleLabel(p.author_role, profile.role) : null;
                      return label ? ` · ${label}` : '';
                    })()
                  : ''}
                {' · '}
                {when(p.created_at)}
                {/* Said plainly, because "published" means two different sizes
                    of audience and the writer should be able to see which one
                    they actually chose. */}
                {p.author_id === selfId && p.audience !== 'church' && (
                  <span className="text-gray-400">
                    {p.audience === 'all' ? ' · only the people you walk with' : ' · chosen people'}
                  </span>
                )}
              </p>
              <Body text={p.body} />

              {/* ONLY A DIRECTOR SEES THIS, and it is a convenience rather than
                  the control: set_post_pinned refuses anybody who is not
                  leadership of that post's own church, whatever this draws. */}
              {(profile?.role === 'admin' || profile?.role === 'executive') && (
                <button
                  type="button"
                  disabled={pinning === p.id}
                  onClick={() => void pin(p.id, !p.pinned)}
                  className="mt-3 text-xs font-semibold text-navy underline underline-offset-2"
                >
                  {pinning === p.id
                    ? 'Saving…'
                    : p.pinned
                      ? 'Unpin from the top'
                      : 'Pin to the top for new members'}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
