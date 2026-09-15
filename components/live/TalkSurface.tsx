'use client';

// Talk: the conversation as a place you go, not a card you scroll past.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS FOR.
//
// Reported: "most users want always the present chat that doesn't need to
// scroll down for other features, specially for Explorers. For guides... they
// want the Chat to be exclusive only because it's their main connection to the
// Explorers."
//
// Before this, an Explorer's conversation was a card on a page with a journey
// bar above it and a library below, and a Guide's was one tab of five inside
// one Explorer's page — so a Guide with five Explorers had five places to look
// and no way to see who was waiting.
//
// WHAT IT DELIBERATELY IS NOT. This is not a rebuild of anybody's messenger.
// The shapes a chat needs — a list that puts the waiting ones first, a thread,
// a count on the way in — are older than any of those products, and everything
// here is built out of this app's own pieces: the same `Conversation` the two
// pages already used, the same pairing rules, the same report control that must
// travel with a conversation wherever it goes. There is no presence, no typing
// indicator, no receipts beyond the one this app already had, and no channel
// that is not a pairing two people are already in.
//
// A ROOM, AND A ROUTE. It is reached at /talk rather than only as a panel, so
// the back button works, a reload keeps you where you were, and a notification
// can point at a conversation instead of at the app in general. The panel on a
// wide screen is the same component with `compact` set.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as live from '@/lib/live/data';
import type { Message } from '@/lib/types';
import { useLiveSession } from '@/lib/live/session';
import { useKeepUp, KEEP_UP_MY_PAIRING, KEEP_UP_TALK } from '@/lib/live/keep-up';
import { useDraft, clearDraft } from '@/lib/drafts';
import { Conversation, Notice, errorText } from '@/components/live/shared';
import { LiveReportControl } from '@/components/LiveSafeguarding';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { Avatar, Button } from '@/components/ui';

function shortWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/**
 * The list of conversations. Only drawn when there is more than one, because a
 * list of one is a screen somebody has to get past to reach the only thing on
 * it — which is exactly the complaint this whole change is about.
 */
function ThreadList({
  threads, onOpen, compact,
}: {
  threads: live.Thread[];
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <ul className="divide-y divide-black/5">
      {threads.map((t) => (
        <li key={t.pairing_id}>
          <button
            type="button"
            onClick={() => onOpen(t.pairing_id)}
            className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-black/[0.03]"
          >
            <Avatar name={t.other_name} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate font-bold text-navy">{t.other_name}</span>
                <span className="ml-auto shrink-0 text-xs text-gray-400">{shortWhen(t.last_at)}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className={`min-w-0 flex-1 truncate text-sm ${
                  t.unread > 0 ? 'font-semibold text-navy' : 'text-gray-500'}`}
                >
                  {t.last_preview
                    ? `${t.last_is_mine ? 'You: ' : ''}${t.last_preview}`
                    : 'No messages yet'}
                </span>
                {/* THE COUNT, and it is the reason the list is worth having.
                    A Guide with five Explorers could not previously tell which
                    of them was waiting without opening all five. */}
                {t.unread > 0 && (
                  <span
                    className="shrink-0 rounded-full bg-[#1F7A8C] px-2 py-0.5 text-xs font-bold text-white"
                    aria-label={`${t.unread} waiting`}
                  >
                    {t.unread > 99 ? '99+' : t.unread}
                  </span>
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
      {threads.length === 0 && (
        <li className={`text-center text-sm text-gray-500 ${compact ? 'p-4' : 'p-8'}`}>
          You have no conversations yet. Your church arranges those.
        </li>
      )}
    </ul>
  );
}

export function TalkSurface({
  openWith,
  onOpenWith,
  onExit,
  compact = false,
}: {
  /** Which conversation to show. Undefined means "decide from the list". */
  openWith?: string;
  onOpenWith?: (pairingId: string) => void;
  /** Drawn only when given, because a surface with no way out is a trap. */
  onExit?: () => void;
  compact?: boolean;
}) {
  const { profile } = useLiveSession();
  const [threads, setThreads] = useState<live.Thread[] | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<live.PairingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attachError, setAttachError] = useState('');

  // WHICH THREAD IS OPEN, and it is deliberately not derived from `openWith`
  // alone: an Explorer with exactly one conversation must land IN it, never on
  // a list of one.
  const [active, setActive] = useState<string>(openWith ?? '');
  const activeRef = useRef<string>('');
  const [body, setBody] = useDraft(active || null);

  const loadThreads = useCallback(async () => {
    try {
      const rows = await live.listMyThreads();
      setThreads(rows);
      setError('');
      setActive((current) => {
        if (current && rows.some((t) => t.pairing_id === current)) return current;
        if (openWith && rows.some((t) => t.pairing_id === openWith)) return openWith;
        return rows.length === 1 ? rows[0].pairing_id : '';
      });
    } catch (cause) {
      setThreads([]);
      setError(errorText(cause));
    }
  }, [openWith]);

  // NO ARGUMENT, deliberately: it reads the open thread from the ref. A loader
  // that takes the id makes every caller responsible for passing the right one,
  // and a subscription firing with a stale id reloads the wrong conversation.
  const loadThread = useCallback(async () => {
    const id = activeRef.current;
    if (!id) { setMessages([]); setFiles([]); return; }
    try {
      setMessages(await live.listMessages(id));
      setFiles(await live.listPairingFiles(id).catch(() => [] as live.PairingFile[]));
      // OPENING IT IS READING IT. The badge has to fall the moment somebody
      // looks, or it becomes a number people learn to ignore.
      await live.markRead(id);
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  useEffect(() => { void loadThreads(); }, [loadThreads]);
  useEffect(() => { if (openWith) setActive(openWith); }, [openWith]);
  useEffect(() => { activeRef.current = active; void loadThread(); }, [active, loadThread]);
  useKeepUp(KEEP_UP_MY_PAIRING, loadThreads);

  // The open thread, live -- and the list with it, so the counts and previews
  // move rather than going stale behind the conversation being read.
  useKeepUp(KEEP_UP_TALK, loadThread);
  useKeepUp(KEEP_UP_TALK, loadThreads);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!active || !body.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await live.sendMessage(active, body);
      clearDraft(active);
      setBody('');
      await loadThread();
      await loadThreads();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const attach = async (chosen: File) => {
    const id = activeRef.current;
    if (!id) return;
    setAttachError('');
    setBusy(true);
    try {
      await live.sendPairingFile(id, chosen);
      await loadThread();
    } catch (cause) {
      setAttachError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const dropFile = async (file: live.PairingFile) => {
    setAttachError('');
    try {
      await live.removePairingFile(file);
      await loadThread();
    } catch (cause) {
      setAttachError(errorText(cause));
    }
  };

  const openThread = (id: string) => {
    setActive(id);
    onOpenWith?.(id);
  };

  if (threads === null) {
    return <div className={compact ? 'p-6' : 'p-10'}><BeaconSpinner inline label="Loading" /></div>;
  }

  const current = threads.find((t) => t.pairing_id === active);
  const several = threads.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* THE BAR. It carries who you are talking to, the way back to the list
          when there is one, and the way out. */}
      <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2">
        {several && active && (
          <button
            type="button"
            onClick={() => { setActive(''); onOpenWith?.(''); }}
            className="tap-sm px-1 text-sm font-semibold text-gray-500"
            aria-label="Back to your conversations"
          >
            ‹ All
          </button>
        )}
        <p className="min-w-0 flex-1 truncate font-bold text-navy">
          {current ? current.other_name : 'Talk'}
        </p>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="tap-sm px-2 text-sm font-semibold text-gray-500"
            aria-label="Close the chat"
          >
            Exit
          </button>
        )}
      </div>

      {error && <div className="px-3 pt-2"><Notice tone="error">{error}</Notice></div>}

      {/* ONE SCROLLPORT WHEN A CONVERSATION IS OPEN, AND IT IS THE MESSAGES.
          This used to scroll unconditionally, so in the bubble the composer and
          the photo note travelled up and down with the thread while the thread
          scrolled inside itself -- two scrollbars on one small panel. A
          conversation manages its own height (globals.css gives the thread the
          space left after the heading and composer have theirs), so here it is
          given a definite height and told not to scroll. The LIST still scrolls,
          because a list of threads is exactly the thing that should. */}
      <div className={`min-h-0 flex-1 ${
        active ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'
      }`}>
        {!active ? (
          <ThreadList threads={threads} onOpen={openThread} compact={compact} />
        ) : (
          <div className={compact
            ? 'flex min-h-0 flex-1 flex-col'
            : 'space-y-3 overflow-y-auto p-3'}>
            <Conversation
              messages={messages}
              files={files}
              myId={profile?.id ?? ''}
              myName={profile?.full_name}
              theirName={current?.other_name}
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
            {/* IT TRAVELS WITH THE CONVERSATION. The Explorer's way out of a
                relationship has always had to be on the same screen as the
                relationship, and moving the conversation to its own room is
                exactly the change that could have quietly left it behind. */}
            {current && !compact && (
              <LiveReportControl
                subjectId={current.other_id}
                subjectName={current.other_name}
                pairingId={current.pairing_id}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
