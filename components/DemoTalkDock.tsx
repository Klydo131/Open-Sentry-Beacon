'use client';

// The chat bubble in the sample app: the live bubble's twin.
//
// ---------------------------------------------------------------------------
// WHY THE SAMPLE HAS ONE NOW. Until 30 September 2026 the sample app had no
// bubble: its conversations were cards on two pages, a Guide's Talk tab and an
// Explorer's home. The owner asked for the conversation to leave those pages
// for the bubble, and for the sample to stay a one-to-one copy of the live app
// ("Yes, keep it 1:1"), because the sample is what a church tries and what the
// tutorial teaches.
//
// SO EVERYTHING YOU SEE IS SHARED. The bubble, the sheet, the header with
// Report in it, the list and the sliding between them are
// components/talk/Dock.tsx, which the live bubble draws too. What is here is
// only the data: the sample store's pairings and messages instead of the live
// database's, shaped into the same thread rows.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { Chat } from '@/components/Chat';
import { ReportDialog } from '@/components/ReportDialog';
import {
  TalkBubble, TalkHeader, TalkSheet, TalkView, ThreadList, useTalkDock, type TalkThread,
} from '@/components/talk/Dock';

export function DemoTalkDock() {
  const { db, userId, reportPerson } = useDemo();
  const { open, leaving, target, show, close } = useTalkDock();
  const [active, setActive] = useState('');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [reporting, setReporting] = useState(false);

  const me = db.profiles.find((p) => p.id === userId);
  const role = me?.role;

  // THE SAME ROWS THE LIVE my_threads CALL RETURNS: who, how many are waiting,
  // and the last thing said. Waiting ones first, then the most recent.
  const threads: TalkThread[] = useMemo(() => {
    if (!userId || (role !== 'dm' && role !== 'ds')) return [];
    const mine = db.pairings.filter((p) => p.status === 'active'
      && (role === 'dm' ? p.dm_id === userId : p.ds_id === userId));
    return mine.map((p) => {
      const otherId = role === 'dm' ? p.ds_id : p.dm_id;
      const said = db.messages
        .filter((m) => m.pairing_id === p.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = said[said.length - 1];
      return {
        pairing_id: p.id,
        other_name: db.profiles.find((x) => x.id === otherId)?.full_name ?? 'Unknown',
        unread: said.filter((m) => m.sender_id === otherId && !m.read_at).length,
        last_at: last?.created_at ?? null,
        last_preview: last ? last.body.slice(0, 80) : null,
        last_is_mine: last ? last.sender_id === userId : null,
      };
    }).sort((a, b) => (Number(b.unread > 0) - Number(a.unread > 0))
      || (b.last_at ?? '').localeCompare(a.last_at ?? ''));
  }, [db.pairings, db.messages, db.profiles, userId, role]);

  const total = threads.reduce((sum, t) => sum + t.unread, 0);
  const several = threads.length > 1;

  // WHICH CONVERSATION IS OPEN, decided as the live one decides it: the one a
  // Message button named, else the only one, else the list. Somebody with one
  // conversation must land IN it, never on a list of one.
  useEffect(() => {
    if (!open) return;
    setReporting(false);
    setDirection('forward');
    setActive((current) => {
      if (target && threads.some((t) => t.pairing_id === target)) return target;
      if (current && threads.some((t) => t.pairing_id === current)) return current;
      return threads.length === 1 ? threads[0].pairing_id : '';
    });
    // `threads` is left out on purpose: a message arriving must not move the
    // person out of the conversation they are reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  // Only the two people who have conversations.
  if (!me || (role !== 'dm' && role !== 'ds')) return null;

  if (!open) return <TalkBubble total={total} onOpen={() => show()} />;

  const current = threads.find((t) => t.pairing_id === active);
  const pairing = db.pairings.find((p) => p.id === active);
  const otherId = pairing ? (role === 'dm' ? pairing.ds_id : pairing.dm_id) : '';

  const openThread = (id: string) => {
    setDirection('forward');
    setReporting(false);
    setActive(id);
  };

  return (
    <TalkSheet leaving={leaving}>
      <div className="flex h-full min-h-0 flex-col">
        <TalkHeader
          title={current ? current.other_name : 'Talk'}
          avatarName={current?.other_name}
          onBack={several && active ? () => { setDirection('back'); setReporting(false); setActive(''); } : undefined}
          // IT TRAVELS WITH THE CONVERSATION, as on the live side: in the
          // header, in words, never beside Send.
          onReport={current ? () => { setDirection(reporting ? 'back' : 'forward'); setReporting((was) => !was); } : undefined}
          reporting={reporting}
          onClose={close}
        />
        {!active || !current ? (
          <TalkView view="list" direction={direction} scroll>
            <ThreadList threads={threads} onOpen={openThread} compact />
          </TalkView>
        ) : reporting && otherId ? (
          <TalkView view={`report-${active}`} direction={direction} scroll>
            <div className="p-3">
              <ReportDialog
                subjectName={current.other_name}
                onCancel={() => { setDirection('back'); setReporting(false); }}
                onSubmit={(reason, detail) =>
                  reportPerson({ subjectId: otherId, reason, detail, pairingId: active })
                }
              />
            </div>
          </TalkView>
        ) : (
          <TalkView view={active} direction={direction}>
            <Chat pairingId={active} />
          </TalkView>
        )}
      </div>
    </TalkSheet>
  );
}
