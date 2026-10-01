'use client';

// The sample app's conversation: the sample store's rows, handed to the one
// chat both halves draw (components/talk/ChatView.tsx).
//
// ---------------------------------------------------------------------------
// A ONE-TO-ONE COPY OF THE LIVE CHAT, by the owner's rule for the sample half.
// Until 1 October 2026 this file drew its own thread -- a name and a time under
// every bubble, a word "Send", no way to change or take back a message, no
// days -- and the two had drifted into different chats. Now it only turns the
// store's messages, attachments and reactions into what ChatView draws, and
// passes the writes back to the store. Replies, reactions, voice messages,
// editing and taking back all behave as they do live, under the same rules.
//
// A THREAD IS A SEQUENCE OF EVENTS, NOT TWO LISTS. Messages and attachments go
// in together and ChatView orders them by time, so a file sits next to the
// message it belongs to rather than at the bottom.
//
// FILES LIVE ON THIS DEVICE in the sample app (lib/localMedia.ts), so a picture
// is drawn from its bytes and the URL made for it is freed when it leaves.
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { useDemo } from '@/lib/demo/store';
import { emitQuest } from '@/lib/quest';
import { useDraft, clearDraft } from '@/lib/drafts';
import { getBlob } from '@/lib/localMedia';
import { ChatView, type ChatEntry } from '@/components/talk/ChatView';

export function Chat({ pairingId }: { pairingId: string }) {
  const {
    db, userId, sendMessage, editMessage, deleteMessage, reactTo,
    markMessagesRead, attachMedia, removeMedia, mediaFor,
  } = useDemo();
  const [text, setText] = useDraft(pairingId);

  const messages = db.messages.filter((m) => m.pairing_id === pairingId);
  const media = mediaFor(pairingId);
  const reactions = db.message_reactions.filter((r) => r.pairing_id === pairingId);

  // Reading the thread is what marks it read -- on open, and again whenever a
  // new message arrives while it is open.
  useEffect(() => {
    markMessagesRead(pairingId);
  }, [pairingId, messages.length, markMessagesRead]);

  const otherId = (() => {
    const p = db.pairings.find((x) => x.id === pairingId);
    return p ? (p.dm_id === userId ? p.ds_id : p.dm_id) : '';
  })();
  const nameOf = (id: string) => db.profiles.find((p) => p.id === id)?.full_name;

  const entries: ChatEntry[] = [
    ...messages.map((m): ChatEntry => ({
      kind: 'message',
      id: m.id,
      at: m.created_at,
      who: m.sender_id,
      body: m.body,
      editedAt: m.edited_at,
      deletedAt: m.deleted_at,
      readAt: m.read_at,
      replyTo: m.reply_to,
    })),
    ...media.map((m): ChatEntry => ({
      kind: 'file',
      id: m.id,
      at: m.created_at,
      who: m.owner_id,
      title: m.title,
      mime: m.mime || (m.kind === 'image' ? 'image/*' : m.kind === 'audio' ? 'audio/*' : m.kind === 'video' ? 'video/*' : ''),
      size: m.size,
      load: async () => {
        const blob = await getBlob(m.id);
        if (!blob) throw new Error('That file is not on this device.');
        return URL.createObjectURL(blob);
      },
      release: (url) => URL.revokeObjectURL(url),
    })),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <ChatView
        entries={entries}
        me={userId ?? ''}
        myName={userId ? nameOf(userId) : undefined}
        theirName={nameOf(otherId)}
        emptyLine="No messages yet. Say hello."
        reactions={reactions}
        draft={text}
        setDraft={setText}
        onSend={(body, replyTo) => {
          sendMessage(pairingId, body, replyTo);
          emitQuest('beacon:message');
          clearDraft(pairingId);
          setText('');
        }}
        onEdit={(id, body) => editMessage(id, body)}
        onDelete={(id) => deleteMessage(id)}
        onReact={(target, emoji) => reactTo(target, emoji)}
        onAttach={(file) => { attachMedia(pairingId, file); }}
        onRemoveFile={(id) => removeMedia(id)}
        voice
      />
    </div>
  );
}
