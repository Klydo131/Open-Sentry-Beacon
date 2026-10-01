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
import type { Reaction, ReactionTarget } from '@/lib/talk/reactions';
import { useLiveSession } from '@/lib/live/session';
import { useKeepUp, KEEP_UP_MY_PAIRING, KEEP_UP_REACTIONS, KEEP_UP_TALK } from '@/lib/live/keep-up';
import { useDraft, clearDraft } from '@/lib/drafts';
import { Conversation, Notice, errorText } from '@/components/live/shared';
import { LiveReportForm } from '@/components/LiveSafeguarding';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { TalkHeader, TalkView, ThreadList } from '@/components/talk/Dock';

// The list, the header and the sliding between them are drawn by
// components/talk/Dock.tsx, which the sample app's bubble draws too.

export function TalkSurface({
  openWith,
  onOpenWith,
  onExit,
  onFull,
  compact = false,
}: {
  /** Which conversation to show. Undefined means "decide from the list". */
  openWith?: string;
  onOpenWith?: (pairingId: string) => void;
  /** Drawn only when given, because a surface with no way out is a trap. */
  onExit?: () => void;
  /** "Open full", from the bubble on a desktop. */
  onFull?: () => void;
  compact?: boolean;
}) {
  const { profile } = useLiveSession();
  // REPORTING TAKES THE PANEL, and the header stays: the person can see who
  // they are reporting and go back to the conversation from the same place.
  const [reporting, setReporting] = useState(false);
  // Which way the last move went, so the next view slides in from that side.
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [threads, setThreads] = useState<live.Thread[] | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<live.PairingFile[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  // Whether this database has replies, reactions and voice (migration
  // 20261001120000). Unknown until the first reaction list is read, and off
  // until then, so nothing is offered that the database would refuse.
  const [extras, setExtras] = useState(false);
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
    if (!id) { setMessages([]); setFiles([]); setReactions([]); return; }
    try {
      setMessages(await live.listMessages(id));
      setFiles(await live.listPairingFiles(id).catch(() => [] as live.PairingFile[]));
      // Reactions are decoration on a conversation, never a reason for one not
      // to open: if they cannot be read, the thread still is. Reading them is
      // also how the app learns whether this database has replies, reactions
      // and voice at all (lib/live/data.ts, NotOnThisDatabaseYet).
      try {
        setReactions(await live.listReactions(id));
        setExtras(true);
      } catch (cause) {
        setReactions([]);
        if (cause instanceof live.NotOnThisDatabaseYet) setExtras(false);
      }
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
  useKeepUp(KEEP_UP_REACTIONS, loadThread, extras);

  // Throws on failure, so the chat keeps the words and what they answered.
  const send = async (text: string, replyTo: string | null) => {
    if (!active || !text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await live.sendMessage(active, text, replyTo);
      clearDraft(active);
      setBody('');
      await loadThread();
      await loadThreads();
    } catch (cause) {
      setError(errorText(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const react = async (target: ReactionTarget, emoji: string | null) => {
    await live.reactTo(target, emoji);
    await loadThread();
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
    setDirection('forward');
    setReporting(false);
    setActive(id);
    onOpenWith?.(id);
  };

  const backToList = () => {
    setDirection('back');
    setReporting(false);
    setActive('');
    onOpenWith?.('');
  };

  if (threads === null) {
    return <div className={compact ? 'p-6' : 'p-10'}><BeaconSpinner inline label="Loading" /></div>;
  }

  const current = threads.find((t) => t.pairing_id === active);
  const several = threads.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* THE ONE BAR: back to the list when there is one, who you are
          talking to, Report, and the way out. components/talk/Dock.tsx. */}
      <TalkHeader
        title={current ? current.other_name : 'Talk'}
        avatarName={current?.other_name}
        onBack={several && active ? backToList : undefined}
        // IT TRAVELS WITH THE CONVERSATION. The Explorer's way out of a
        // relationship has always had to be on the same screen as the
        // relationship, and the bubble is that screen now. In the header, in
        // words, at every size: the part of a chat furthest from Send.
        onReport={current ? () => { setDirection(reporting ? 'back' : 'forward'); setReporting((was) => !was); } : undefined}
        reporting={reporting}
        onFull={onFull}
        onClose={onExit}
      />

      {error && <div className="px-3 pt-2"><Notice tone="error">{error}</Notice></div>}

      {/* ONE SCROLLPORT WHEN A CONVERSATION IS OPEN, AND IT IS THE MESSAGES.
          This used to scroll unconditionally, so in the bubble the composer and
          the photo note travelled up and down with the thread while the thread
          scrolled inside itself -- two scrollbars on one small panel. A
          conversation manages its own height (globals.css gives the thread the
          space left after the heading and composer have theirs), so here it is
          given a definite height and told not to scroll. The LIST still scrolls,
          because a list of threads is exactly the thing that should, and so
          does the report form, which is a page of questions. */}
      {!active ? (
        <TalkView view="list" direction={direction} scroll>
          <ThreadList threads={threads} onOpen={openThread} compact={compact} />
        </TalkView>
      ) : reporting && current ? (
        <TalkView view={`report-${active}`} direction={direction} scroll>
          <div className="p-3">
            <LiveReportForm
              subjectId={current.other_id}
              subjectName={current.other_name}
              pairingId={current.pairing_id}
              onDone={() => { setDirection('back'); setReporting(false); }}
            />
          </div>
        </TalkView>
      ) : (
        <TalkView view={active} direction={direction}>
          <div className={compact
            ? 'flex min-h-0 flex-1 flex-col'
            : 'min-h-0 flex-1 space-y-3 overflow-y-auto p-3'}>
            <Conversation
              // THE WAITING LINE CAME WITH THE CHAT. On an Explorer's home the
              // empty thread said the true thing -- nothing is wrong, their
              // Guide will write, and they may go first -- instead of "start
              // with a welcome", which is the Guide's job. It is the bubble's
              // job now.
              emptyLine={profile?.role === 'ds'
                ? 'No messages yet. Your Guide will write, and you can write first if you would like to.'
                : undefined}
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
              reactions={reactions}
              // Offered once this database is known to have them; until then
              // the conversation is the words and the files, as it was.
              onReact={extras ? react : undefined}
              extras={extras}
              onEditMessage={async (id, text) => { await live.editMessage(id, text); await loadThread(); }}
              onDeleteMessage={async (id) => { await live.deleteMessage(id); await loadThread(); }}
            />
          </div>
        </TalkView>
      )}
    </div>
  );
}
