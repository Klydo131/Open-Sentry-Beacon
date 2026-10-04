'use client';

// The Guide's blog, and the Explorer's reading of it.
//
// WHY THIS EXISTS AS WELL AS THE CHAT. A conversation is one-to-one and expects
// a reply; that is its strength and also its cost. Some things a Guide wants to
// say are said once, to everybody, and should sit somewhere an Explorer can
// read them at midnight without owing an answer by morning. Sermon notes, a
// thought for the week, what is happening on Sabbath.
//
// TWO SWITCHES, DELIBERATELY. `visibility` decides whether a post exists for
// anyone but its author — a draft is private until it is ready. `audience`
// decides who receives it once published. One flag would have meant the only
// way to take a post off the front page is to delete it, and a Guide should be
// able to retire last month's note without destroying it.
//
// THE COUNTER SHOWS A NUMBER AND NEVER A NAME. It counts people rather than
// opens, so re-reading does not inflate it, and the author is excluded from
// their own count. Who read what is recorded only so the number can mean
// "readers"; it is never displayed. An Explorer should be able to read quietly,
// for the same reason they are never shown their own journey stage and the
// prayer wall carries no names.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { Button, Card, EmptyState } from '@/components/ui';
import { useFocusOnWrite } from '@/components/WritePost';
import type { BlogAudienceKind, BlogPost, DB } from '@/lib/types';

function when(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Paragraphs, from a plain textarea. No markdown, no HTML, nothing to escape. */
function Body({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">
          {para}
        </p>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The Guide's side: write, publish, hide, delete.
// ---------------------------------------------------------------------------
export function BlogDesk({ userId }: { userId: string }) {
  const { db, addBlogPost, setBlogVisibility, deleteBlogPost } = useDemo();
  const [advanced, setAdvanced] = useState(false);
  // What just happened, said where the person is looking. Cleared as soon as
  // they start the next post.
  const [done, setDone] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  // From Home's "Write a post": the cursor goes straight into Title.
  useFocusOnWrite(titleRef);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<BlogAudienceKind>('church');
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState('');

  const mine = db.blog_posts.filter((p) => p.author_id === userId);

  // Everyone this Guide currently walks with.
  const explorers = useMemo(
    () =>
      db.pairings
        .filter((p) => p.dm_id === userId && p.status === 'active')
        .map((p) => ({
          id: p.ds_id,
          name: db.profiles.find((x) => x.id === p.ds_id)?.full_name ?? 'An Explorer',
        })),
    [db.pairings, db.profiles, userId],
  );

  const readers = (postId: string) =>
    db.blog_views.filter((v) => v.post_id === postId).length;

  const canPost = title.trim().length > 0 && body.trim().length > 0
    && (audience !== 'selected' || picked.length > 0);

  const submit = () => {
    if (!canPost) return;
    addBlogPost({ title, body, visibility: 'published', audience, dsIds: picked });
    setTitle('');
    setBody('');
    setAudience('church');
    setPicked([]);
    setDone(audience === 'church'
      ? 'Published. Everyone in the church can read it now.'
      : 'Published, to the people you chose.');
  };

  const saveDraft = () => {
    if (!title.trim() || !body.trim()) return;
    addBlogPost({ title, body, visibility: 'private', audience, dsIds: picked });
    setTitle('');
    setBody('');
    setPicked([]);
    setDone('Saved as a draft. Only you can see it, below.');
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

      <div className="mt-4 rounded-xl bg-navy/5 p-4">
          <label className="block text-sm font-semibold text-navy" htmlFor="blog-title">
            Title
          </label>
          <input
            id="blog-title"
            ref={titleRef}
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDone(''); }}
            placeholder="What I keep coming back to in Psalm 23"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />

          <label className="mt-3 block text-sm font-semibold text-navy" htmlFor="blog-body">
            Post
          </label>
          <textarea
            id="blog-body"
            value={body}
            onChange={(e) => { setBody(e.target.value); setDone(''); }}
            rows={7}
            placeholder="Leave a blank line between paragraphs."
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />

          {advanced && (<>
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold text-navy">Who sees it</legend>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="blog-audience"
                checked={audience === 'church'}
                onChange={() => setAudience('church')}
              />
              Everyone in the church
              <span className="text-gray-400">(it goes on the church home screen)</span>
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="blog-audience"
                checked={audience === 'all'}
                onChange={() => setAudience('all')}
              />
              Only the people I walk with
              <span className="text-gray-400">
                ({explorers.length} {explorers.length === 1 ? 'person' : 'people'}, and anyone paired with me later)
              </span>
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="blog-audience"
                checked={audience === 'selected'}
                onChange={() => setAudience('selected')}
              />
              Only the people I choose
            </label>
          </fieldset>

          {audience === 'selected' && (
            <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-black/5">
              {explorers.length === 0 ? (
                <p className="text-sm text-gray-500">
                  You are not walking with anyone yet, so there is nobody to choose.
                </p>
              ) : (
                explorers.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={picked.includes(e.id)}
                      onChange={() =>
                        setPicked((p) =>
                          p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id],
                        )
                      }
                    />
                    {e.name}
                  </label>
                ))
              )}
            </div>
          )}
          </>)}

          {!advanced && (
            <p className="mt-2 text-xs text-gray-500">Everyone in the church sees it, with your name on it.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={submit} disabled={!canPost}>
              Publish
            </Button>
            {advanced && (
              <Button variant="ghost" onClick={saveDraft} disabled={!title.trim() || !body.trim()}>
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
        {mine.length === 0 && (
          <EmptyState title="Nothing written yet" hint="Your first post can be three sentences." />
        )}
        {mine.map((p) => (
          <article key={p.id} className="rounded-xl bg-white p-4 ring-1 ring-black/5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex-1 text-lg font-bold text-navy">{p.title}</h3>
              {p.visibility === 'private' ? (
                <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[11px] font-bold text-gray-700">
                  DRAFT
                </span>
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
              {/* A draft has no readers and saying "0 readers" about something
                  nobody could open reads like failure rather than a choice. */}
              {p.visibility === 'published' && (
                <span className="text-sm text-gray-500" title="People who opened this. Names are never shown.">
                  👁️ {readers(p.id)} {readers(p.id) === 1 ? 'reader' : 'readers'}
                </span>
              )}
              <span className="flex-1" />
              <Button
                variant="ghost"
                onClick={() =>
                  setBlogVisibility(p.id, p.visibility === 'published' ? 'private' : 'published')
                }
              >
                {p.visibility === 'published' ? 'Make private' : 'Publish'}
              </Button>
              {confirming === p.id ? (
                <>
                  <Button
                    variant="danger"
                    onClick={() => {
                      deleteBlogPost(p.id);
                      setConfirming('');
                    }}
                  >
                    Delete for good
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming('')}>
                    Keep
                  </Button>
                </>
              ) : (
                // Two steps, because deleting takes the post and its readers
                // with it and there is no undo.
                <Button variant="danger" onClick={() => setConfirming(p.id)}>
                  Delete
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The reader's side: Community Blogs, plus anything written for them
// personally. Named for what it is now rather than for the Guide-only version
// it started as.
// ---------------------------------------------------------------------------
/**
 * The sample church's posts one person may read. The rule BlogFeed draws, kept
 * in one place so This Sabbath (components/ThisSabbath.tsx) reads exactly the
 * same posts and the two cannot drift. A church's own app asks the database,
 * whose `can_read_post` is the real rule.
 */
export function postsVisibleTo(db: Pick<DB, 'blog_posts' | 'blog_audience' | 'pairings'>, userId: string): BlogPost[] {
  // The Guides this person is actually walking with. A post from anybody else
  // is not theirs to read, whatever its audience says.
  const myGuides = new Set(
    db.pairings.filter((p) => p.ds_id === userId && p.status === 'active').map((p) => p.dm_id),
  );
  return db.blog_posts.filter((p) => {
    if (p.visibility !== 'published') return false;
    // THE NOTICEBOARD REACHES EVERYBODY, whoever wrote it. This used to
    // require the author be one of your Guides, which is right for the two
    // narrower audiences and wrong for the board.
    if (p.audience === 'church') return true;
    if (p.audience === 'all') return myGuides.has(p.author_id);
    return db.blog_audience.some((a) => a.post_id === p.id && a.ds_id === userId);
  });
}

export function BlogFeed({ userId }: { userId: string }) {
  const { db, recordBlogView } = useDemo();
  const [open, setOpen] = useState(true);

  const posts = useMemo(
    () => postsVisibleTo(db, userId),
    [db.blog_posts, db.blog_audience, db.pairings, userId],
  );

  // Opening the page is reading it. There is no "mark as read" button to forget
  // to press, and the store ignores a second view from the same person.
  useEffect(() => {
    posts.forEach((p) => recordBlogView(p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.map((p) => p.id).join(',')]);

  if (posts.length === 0) return null;

  const nameOf = (id: string) =>
    db.profiles.find((x) => x.id === id)?.full_name ?? 'Someone';

  return (
    <Card className="p-5">
      {/* Same fold-away and scroll box as the live one. A tutorial that teaches
          a panel which cannot be shut, when the real one can, is the kind of
          small gap that stops the demo being a demo of anything. */}
      <div className="mb-0 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-navy">📣 Community Blogs</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="tap-sm shrink-0 rounded-xl bg-gray-100 px-3 py-1.5 text-sm font-bold text-navy hover:bg-gray-200"
        >
          {open ? 'Hide' : `Show (${posts.length})`}
        </button>
      </div>
      <p className="mt-0.5 text-sm text-gray-500">
        {open
          ? 'What people in your church have published, newest first.'
          : `${posts.length} ${posts.length === 1 ? 'post' : 'posts'} from your church.`}
      </p>
      {open && (
        <div
          className={`mt-3 space-y-4 ${
            posts.length > 3
              ? 'beacon-scroll max-h-[32rem] overflow-y-auto overscroll-contain pr-1'
              : ''
          }`}
        >
          {posts.map((p: BlogPost) => (
            <article key={p.id} className="rounded-xl bg-navy/5 p-4">
              <h3 className="text-lg font-bold text-navy">{p.title}</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {nameOf(p.author_id)} · {when(p.created_at)}
              </p>
              <Body text={p.body} />
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
