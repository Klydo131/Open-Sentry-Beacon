'use client';

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_GUILDS, KEEP_UP_GUILD } from '@/lib/live/keep-up';
import * as live from '@/lib/live/data';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';
import { ReportDialog } from '@/components/ReportDialog';
import type { ReportReason } from '@/lib/types';

const KIND: Record<live.GuildActivityKind, { label: string; icon: string; prompt: string }> = {
  encouragement: { label: 'Encouragement', icon: '💛', prompt: 'Share an encouragement with the guild.' },
  study: { label: 'Study note', icon: '📖', prompt: 'Share a thought or question from your study.' },
  prayer: { label: 'Prayer', icon: '🙏', prompt: 'Share a prayer or a prayer request.' },
  care: { label: 'Care', icon: '🤝', prompt: 'Share a practical way the guild can care for someone.' },
};

function when(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * A group board, not a second direct-message system. The API deliberately
 * returns labels and reaction counts only; Explorer membership and profile IDs
 * never reach the browser through this feature.
 */
export function LiveGuildActivity() {
  const [guilds, setGuilds] = useState<live.Guild[] | null>(null);
  const [guildId, setGuildId] = useState('');
  const [posts, setPosts] = useState<live.GuildActivityPost[] | null>(null);
  const [kind, setKind] = useState<live.GuildActivityKind>('encouragement');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // The id of the post whose report dialog is open, or ''. One at a time: this
  // is not a control anybody should be halfway through twice.
  const [reporting, setReporting] = useState('');

  const loadGuilds = useCallback(async () => {
    try {
      const rows = (await live.listGuilds()).filter((guild) => guild.i_am_in_it);
      setGuilds(rows);
      setGuildId((current) => rows.some((guild) => guild.id === current) ? current : (rows[0]?.id ?? ''));
      setError('');
    } catch (cause) {
      setGuilds([]);
      setError(humanError(cause, 'Could not load your guilds.'));
    }
  }, []);

  const loadPosts = useCallback(async () => {
    if (!guildId) {
      setPosts([]);
      return;
    }
    try {
      setPosts(await live.listGuildActivity(guildId));
      setError('');
    } catch (cause) {
      setPosts([]);
      setError(humanError(cause, 'Could not load the guild activity.'));
    }
  }, [guildId]);

  useEffect(() => { void loadGuilds(); }, [loadGuilds]);
  useEffect(() => { void loadPosts(); }, [loadPosts]);
  // The Guild Room is the one room where several people are looking at the
  // same wall at once, so it is the one where a stale screen is most obvious.
  useKeepUp(KEEP_UP_GUILDS, loadGuilds);
  // AND THE WALL ITSELF, which was the last room in the app still needing a
  // manual refresh. It does NOT subscribe to the posts: those carry `author_id`
  // and the feed deliberately shows a label instead, so putting them on the
  // wire would undo the pseudonymity. It watches `guild_wall_pulse`, one row
  // per guild that says a wall changed and nothing about who changed it, and
  // then re-asks `list_guild_activity` -- which redacts exactly as before.
  // Readable only by a member of that guild. See lib/live/keep-up.ts.
  useKeepUp(KEEP_UP_GUILD, loadPosts);

  const post = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!guildId || !body.trim() || busy) return;
    setBusy('post');
    setError('');
    try {
      await live.postToGuild(guildId, kind, body.trim());
      setBody('');
      await loadPosts();
    } catch (cause) {
      setError(humanError(cause, 'That could not be shared with your guild.'));
    } finally {
      setBusy('');
    }
  };

  const toggleAmen = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      await live.toggleGuildAmen(id);
      await loadPosts();
    } catch (cause) {
      setError(humanError(cause, 'That response could not be saved.'));
    } finally {
      setBusy('');
    }
  };

  const report = (id: string, reason: ReportReason, detail: string) => {
    // Not awaited, for the same reason the conversation's report control does
    // not await: the dialog has already said it is done, and a spinner after
    // the hardest button in the app is a cruelty. A failure surfaces above.
    void live
      .reportGuildPost(id, reason, detail)
      .catch((cause) => setError(humanError(cause, 'That report could not be sent.')));
  };

  // CORRECTING A POST. One editor at a time, and a confirm before a take-down:
  // "Delete my post" was a single tap that destroyed a post for a whole guild.
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState('');

  const saveEdit = async (id: string) => {
    const text = draft.trim();
    if (!text) { setError('Write something first.'); return; }
    setBusy(id);
    setError('');
    try {
      await live.editGuildPost(id, text);
      setEditing(''); setDraft('');
      await loadPosts();
    } catch (cause) {
      setError(humanError(cause, 'That post could not be changed.'));
    } finally {
      setBusy('');
    }
  };

  const deleteMine = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      await live.deleteMyGuildPost(id);
      setConfirming('');
      await loadPosts();
    } catch (cause) {
      setError(humanError(cause, 'That activity could not be removed.'));
    } finally {
      setBusy('');
    }
  };

  const selected = (guilds ?? []).find((guild) => guild.id === guildId);
  const currentKind = KIND[kind];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-room">🧩 Guild Room</h1>
        {/* SAID ON THE PAGE AS WELL AS IN THE RAIL. The chip beside the room's
            name is a reminder for somebody choosing where to go; this is for
            somebody already here, deciding whether to rely on what they find.
            Both were asked for, and the rail alone is easy to walk past. */}
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          Still on beta. This room is being built, so expect it to change and do
          not rely on it for anything you cannot repeat elsewhere.
        </p>

        <p className="mt-1 text-room-soft">
          Your Guild activity: encourage, study, pray, and care together without turning your guild into a public church roster.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy">Your guild board</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              This is group activity, not a private conversation. Other members see what you post,
              but the board never shows an Explorer roster or profile identifiers.
            </p>
          </div>
          <Button variant="ghost" onClick={() => { void loadGuilds(); void loadPosts(); }}>
            Refresh
          </Button>
        </div>

        {error && <p className="mt-3 break-words rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}

        {guilds === null ? (
          <BeaconSpinner inline label="Finding your guilds" className="mt-4" />
        ) : guilds.length === 0 ? (
          <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            You are not in a guild yet. Ask a Director to add you to one.
          </p>
        ) : (
          <>
            <label className="mt-4 block max-w-md">
              <span className="text-sm font-semibold text-navy">Guild</span>
              <select
                value={guildId}
                onChange={(event) => setGuildId(event.target.value)}
                className="tap mt-1 w-full rounded-xl bg-white px-3 py-2 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
              >
                {guilds.map((guild) => (
                  <option key={guild.id} value={guild.id}>{guild.name}</option>
                ))}
              </select>
            </label>

            {selected?.description && <p className="mt-2 break-words text-sm text-gray-600">{selected.description}</p>}

            <form onSubmit={post} className="mt-5 rounded-xl bg-gray-50 p-4 ring-1 ring-black/5">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of activity">
                {(Object.keys(KIND) as live.GuildActivityKind[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={kind === key}
                    onClick={() => setKind(key)}
                    className={`tap-sm rounded-full px-3 py-2 text-sm font-bold ring-1 ${
                      kind === key ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {KIND[key].icon} {KIND[key].label}
                  </button>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="text-sm font-semibold text-navy">{currentKind.label}</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder={currentKind.prompt}
                  className="mt-1 w-full rounded-xl bg-white p-3 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
                />
                <span className="mt-1 block text-right text-xs text-gray-500">{body.length}/1000</span>
              </label>
              <div className="mt-2">
                <Button type="submit" variant="gold" disabled={busy === 'post' || !body.trim()}>
                  {busy === 'post' ? 'Sharing…' : 'Share with the guild'}
                </Button>
              </div>
            </form>

            {posts === null ? (
              <BeaconSpinner inline label="Loading activity" className="mt-5" />
            ) : posts.length === 0 ? (
              <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                Nothing has been shared yet. An encouragement or a study thought is a good first step.
              </p>
            ) : (
              <ul className="mt-5 space-y-3">
                {posts.map((entry) => (
                  <li key={entry.id} className="rounded-xl bg-white p-4 ring-1 ring-black/10">
                    <div className="flex flex-wrap items-start gap-2">
                      <span aria-hidden className="text-lg">{KIND[entry.kind].icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-navy">
                          {KIND[entry.kind].label} <span className="font-normal text-gray-500">· {entry.author_label}</span>
                        </p>
                        {entry.deleted_at ? (
                          /* THE NOTE, AND IT NAMES NOBODY. Every other room in
                             this app names the person who deleted something.
                             This wall is pseudonymous by design -- the feed
                             returns "You", "A Guide" or "A fellow Explorer" and
                             never an id -- so the note is built from THAT SAME
                             LABEL and reveals nothing the wall did not already
                             say. A leadership take-down says so without naming
                             the leader: a Director is not a member of this room,
                             and that is the honest description of what happened. */
                          <p className="mt-1 text-[15px] italic leading-relaxed text-gray-500">
                            {entry.removed_by_leader
                              ? 'This post was removed by church leadership'
                              : entry.is_mine
                                ? 'You deleted this post'
                                : `${entry.author_label} deleted a post`}
                          </p>
                        ) : editing === entry.id ? (
                          <div className="mt-1 space-y-2">
                            <textarea
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              rows={3}
                              maxLength={1000}
                              autoFocus
                              aria-label="Change your post"
                              className="w-full rounded-xl bg-white p-3 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <Button variant="gold" disabled={busy === entry.id}
                                      onClick={() => void saveEdit(entry.id)}>
                                {busy === entry.id ? 'Saving…' : 'Save the change'}
                              </Button>
                              <Button variant="ghost"
                                      onClick={() => { setEditing(''); setDraft(''); }}>
                                Leave it as it was
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="mt-1 break-words whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">{entry.body}</p>
                            {entry.edited_at && (
                              <p className="mt-0.5 text-xs italic text-gray-500">edited</p>
                            )}
                          </>
                        )}
                        <p className="mt-2 text-xs text-gray-500">{when(entry.created_at)}</p>
                      </div>
                    </div>
                    {/* NOTHING TO DO TO A POST THAT IS GONE. No amen on words
                        nobody can read, no edit, no second delete, and no report
                        -- reporting is still possible before a take-down, and
                        the report keeps the words even if the author deletes
                        afterwards, which is the case it exists for. */}
                    {!entry.deleted_at && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        disabled={busy === entry.id}
                        onClick={() => void toggleAmen(entry.id)}
                      >
                        {entry.i_amen ? '🙏 Remove amen' : '🙏 Amen'} {entry.amen_count > 0 ? `· ${entry.amen_count}` : ''}
                      </Button>
                      {entry.is_mine ? (
                        <>
                          {editing !== entry.id && (
                            <Button variant="ghost" disabled={busy === entry.id}
                                    onClick={() => { setEditing(entry.id); setDraft(entry.body); setError(''); }}>
                              Edit
                            </Button>
                          )}
                          {/* IT ASKS NOW. This was one tap that destroyed a post
                              for a whole guild, with no confirmation. */}
                          {confirming === entry.id ? (
                            <>
                              <Button variant="danger" disabled={busy === entry.id}
                                      onClick={() => void deleteMine(entry.id)}>
                                {busy === entry.id ? 'Deleting…' : 'Yes, delete it'}
                              </Button>
                              <Button variant="ghost" onClick={() => setConfirming('')}>
                                Keep it
                              </Button>
                            </>
                          ) : (
                            <Button variant="danger" disabled={busy === entry.id}
                                    onClick={() => { setConfirming(entry.id); setError(''); }}>
                              Delete my post
                            </Button>
                          )}
                        </>
                      ) : (
                        /* THE WAY OUT OF THIS ROOM. A board where one person
                           can reach a whole group, some of whom are children,
                           had no way to say a post was wrong: only its author
                           could remove it, and leadership cannot see in here
                           at all. Every other place in Beacon where somebody
                           can be hurt has this control on the same screen as
                           the thing that hurt them, and so does this one now.

                           A plain link rather than a button, and away from
                           Amen, so it is findable without hunting and never
                           hit by a thumb aiming at something else. */
                        <button
                          type="button"
                          onClick={() => setReporting(reporting === entry.id ? '' : entry.id)}
                          className="tap-sm px-2 text-sm text-gray-500 underline underline-offset-2 hover:text-red-600"
                        >
                          Report this post
                        </button>
                      )}
                    </div>
                    )}
                    {reporting === entry.id && (
                      <div className="mt-3">
                        <ReportDialog
                          subjectName="this post"
                          hiddenSubject
                          onCancel={() => setReporting('')}
                          onSubmit={(reason, detail) => report(entry.id, reason, detail)}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
