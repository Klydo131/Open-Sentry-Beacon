// Feedback, sent to the church rather than kept on the phone.
//
// THE BUG THIS EXISTS FOR: 
//
// Nothing was stuck. `setFeedbackSink` was never called, anywhere, so every
// message went to the DEFAULT sink in lib/backend/feedback.ts -- which saves to
// the sender's own browser and says so honestly on screen. There was no
// feedback table to be stuck in. Each message is still sitting in
// `hope-beacon.feedback.local` on the phone of whoever wrote it and has never
// crossed the network.
//
// The default is right for the open-source build: a church cloning this has no
// server on the first run, and a demo that silently drops feedback teaches
// everybody that feedback is pointless. What was missing is this half -- the
// sink for a church that HAS a database.
//
// WHY NOT EMAIL, since email is what was expected. The built-in mailer sends
// about two messages an hour for the whole project, so feedback routed through
// it would be dropped on exactly the days worth hearing about. A row arrives
// instantly, cannot be rate limited, and is read by whoever can act on it.

import { readBrowserSession, supabase } from '@/lib/supabase/client';
import type { FeedbackMessage, FeedbackResult, FeedbackSink } from '@/lib/backend/feedback';
import { localFeedbackSink, readLocalFeedback } from '@/lib/backend/feedback';

/**
 * Send one message to the church's own table.
 *
 * FALLS BACK RATHER THAN FAILING. Somebody signed out, on a preview host, or
 * with no database configured still gets their message kept, because rule one
 * of a sink is that a message a person took trouble over is not lost to a
 * network. The note tells them which of the two happened.
 */
async function sendToChurch(message: FeedbackMessage): Promise<FeedbackResult> {
  // `supabase()` returns null off the live build rather than throwing, which is
  // the property the whole sample app rests on. `db()` in data.ts throws, so it
  // is deliberately not used here: feedback must never be the thing that breaks.
  const client = supabase();
  if (!client) return localFeedbackSink.send(message);

  try {
    // The session this app actually runs on. `auth.getUser()` would ask the
    // server through a client built with a fixed accessToken, which is a
    // different question from "who is signed in on this device".
    const me = readBrowserSession()?.user?.id;
    if (!me) return localFeedbackSink.send(message);

    const { data: profile } = await client
      .from('profiles').select('church_id').eq('id', me).maybeSingle();
    const church = (profile as { church_id: string | null } | null)?.church_id;
    if (!church) return localFeedbackSink.send(message);

    const { error } = await client.from('feedback').insert({
      church_id: church,
      // Attached, because a Director reading "this screen is confusing" can
      // almost never act on it without knowing who to ask. The contact field
      // stays theirs to fill in or leave empty, and the read policy keeps the
      // whole table to leadership.
      author_id: me,
      category: message.category,
      message: message.message,
      contact: message.contact || null,
      page: message.page || null,
      build: message.build || null,
      client_id: message.id,
    });

    // 23505 is the same message arriving twice, which is a success: the church
    // has it. A retry from a phone that lost signal must not read as a failure
    // and be queued for ever.
    if (error && error.code !== '23505') {
      return localFeedbackSink.send(message);
    }
    return { ok: true, note: 'Sent to your church.' };
  } catch {
    return localFeedbackSink.send(message);
  }
}

export const churchFeedbackSink: FeedbackSink = {
  describe: 'sent to the people who lead your church',
  send: sendToChurch,
};

/**
 * Send anything this device kept while there was nowhere to send it.
 *
 * Every message written before today is on the phone that wrote it and nowhere
 * else. This cannot reach the other twenty-six phones -- nothing can, the
 * messages are in their own browser storage -- but it rescues whatever is on
 * this one, and it runs whenever a signed-in person opens the app, so a Guide
 * who reported something last week has it delivered the next time they look.
 *
 * Quiet on purpose. Nobody asked for this to happen and nobody needs to be told
 * it did; a failure simply leaves the message where it already was.
 */
export async function flushKeptFeedback(): Promise<number> {
  const kept = readLocalFeedback();
  if (!kept.length) return 0;

  let sent = 0;
  for (const message of kept) {
    const result = await sendToChurch(message);
    // `ok` is also true when the local sink took it, so only count a real send:
    // the note is the only thing that distinguishes them.
    if (result.ok && result.note === 'Sent to your church.') sent += 1;
    else break; // No point walking the rest if the destination is not reachable.
  }
  return sent;
}
