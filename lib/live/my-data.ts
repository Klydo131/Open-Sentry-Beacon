// Everything this app holds about you, in one file you can take away.
//
// THE RIGHT THIS ANSWERS. RA 10173 §16(c) gives a person the right to a copy of
// their own personal data; GDPR Art. 15 gives the same right and Art. 20 adds
// that it must arrive in a structured, machine-readable form somebody could
// carry to another service. Until now this app could not answer either, which
// docs/DATA-PROTECTION.md listed as the largest gap that was engineering's to
// close rather than a lawyer's.
//
// THE PROPERTY THAT MAKES IT SAFE, and it is the whole design:
//
//   EVERY QUERY BELOW RUNS AS THE PERSON ASKING, THROUGH THE ORDINARY RULES.
//
// There is no `security definer` function here and no service key. If the
// database would not let this person read a row on any other screen, it does
// not appear in their export either. An export built the other way — a
// privileged function assembling "everything about user X" — is one bug away
// from handing somebody else's conversation to whoever asks, and the bug would
// be invisible because the output looks the same.
//
// WHAT IS DELIBERATELY NOT IN IT, and why the file says so out loud:
//
//   * SAFEGUARDING REPORTS about this person. A report names the person who
//     raised it, and this app promises them that the person they reported is
//     never told. Handing over the report would break that promise and could
//     put somebody in danger. Both laws allow this: an access request does not
//     extend to information that would identify another individual who has not
//     consented.
//   * A GUIDE'S PRIVATE NOTES about them, for the same reason in a milder form:
//     they are one person's candid working notes about another, and whether
//     they should be handed over is a judgement about two people that a
//     Director has to make rather than a button.
//   * THE DISCIPLINE LOG, which exists precisely so that a record of what a
//     church decided survives the person it describes.
//
// Silence about those would be the dishonest part. The export names each one,
// says why, and says who to ask — which is what turns an omission into a
// disclosure.

// `db` and `uid` from the data layer rather than the Supabase client directly.
// data.ts says it in capitals and a check enforces it: never ask Supabase Auth
// who is signed in, because this app has already verified and stored that, and
// a second answer is a second thing that can disagree.
import { db, uid } from '@/lib/live/data';

export interface MyDataFile {
  what_this_is: string;
  made_at: string;
  about: unknown;
  not_included: { what: string; why: string; how_to_ask: string }[];
  [section: string]: unknown;
}

/** One table, read as the person asking. A failure is recorded, never fatal. */
async function section(
  name: string,
  run: () => Promise<unknown>,
  into: Record<string, unknown>,
) {
  try {
    into[name] = await run();
  } catch (cause) {
    // A section that cannot be read is worth saying so about. An export that
    // silently drops a table looks complete and is not.
    into[name] = { could_not_be_read: cause instanceof Error ? cause.message : String(cause) };
  }
}

/**
 * Gather it. Returns the object that becomes the file.
 *
 * Deliberately not parallel: this runs once, by hand, and a dozen queries at
 * once from a phone on a bad connection is how a free-tier database starts
 * refusing things.
 */
export async function collectMyData(): Promise<MyDataFile> {
  const client = db();
  const me = await uid();

  const out: Record<string, unknown> = {};

  await section('my_profile', async () => {
    const { data } = await client.from('profiles').select('*').eq('id', me).maybeSingle();
    return data ?? null;
  }, out);

  await section('my_pairings', async () => {
    const { data } = await client.from('pairings').select('*')
      .or(`dm_id.eq.${me},ds_id.eq.${me}`);
    return data ?? [];
  }, out);

  // The conversation, both halves of it. What somebody said to you is as much
  // your record of the relationship as what you said to them, and the rules
  // already let you read it because you are in the pairing.
  await section('my_conversations', async () => {
    const { data } = await client.from('messages')
      .select('id, pairing_id, sender_id, body, created_at, read_at')
      .order('created_at', { ascending: true });
    return data ?? [];
  }, out);

  await section('files_in_my_conversations', async () => {
    const { data } = await client.from('pairing_media')
      .select('id, pairing_id, owner_id, title, mime, size, created_at');
    return data ?? [];
  }, out);

  await section('my_prayer_requests', async () => {
    // Written by me, or written to me: a Guide's own asks live with the
    // Explorer they asked, so `ds_id` alone would leave a Guide's words out of
    // a Guide's own copy.
    const { data } = await client.from('prayer_requests').select('*')
      .or(`ds_id.eq.${me},author_id.eq.${me}`);
    return data ?? [];
  }, out);

  await section('my_meetings', async () => {
    const { data } = await client.from('meetings').select('*');
    return data ?? [];
  }, out);

  await section('what_i_wrote_publicly', async () => {
    const { data } = await client.from('posts').select('*').eq('author_id', me);
    return data ?? [];
  }, out);

  await section('what_i_shared_from_the_library', async () => {
    const { data } = await client.from('material_shares').select('*').eq('shared_by', me);
    return data ?? [];
  }, out);

  await section('what_i_added_to_the_library', async () => {
    const { data } = await client.from('materials').select('*').eq('added_by', me);
    return data ?? [];
  }, out);

  await section('my_notifications', async () => {
    const { data } = await client.from('notifications')
      .select('id, type, title, body, read_at, created_at').eq('user_id', me);
    return data ?? [];
  }, out);

  await section('changes_to_my_details', async () => {
    const { data } = await client.from('profile_changes').select('*').eq('profile_id', me);
    return data ?? [];
  }, out);

  await section('my_follow_ups', async () => {
    const { data } = await client.from('follow_ups').select('*').eq('owner_id', me);
    return data ?? [];
  }, out);

  return {
    what_this_is:
      'Everything Open Sentry Beacon holds about you that can be handed over automatically. '
      + 'Read not_included below: some things are deliberately left out, and it says why and who to ask.',
    made_at: new Date().toISOString(),
    about: out.my_profile ?? null,
    not_included: [
      {
        what: 'Safeguarding reports about you',
        why: 'A report names the person who raised it, and this app promises them that '
          + 'the person they reported is never told. Handing it over would break that '
          + 'promise and could put somebody at risk. Both the Data Privacy Act and the '
          + 'GDPR allow an access request to be limited where answering it would '
          + 'identify another person who has not agreed.',
        how_to_ask: 'Write to your church’s Data Protection Officer. They can weigh it case by case.',
      },
      {
        what: 'A Guide’s private notes about you',
        why: 'They are one person’s working notes about another, and whether they should '
          + 'be handed over is a judgement about two people rather than something a button '
          + 'should decide.',
        how_to_ask: 'Write to your church’s Data Protection Officer.',
      },
      {
        what: 'The record of approvals, suspensions and removals',
        why: 'A church has to be able to show what it decided and when, and that record is '
          + 'kept even after an account is deleted.',
        how_to_ask: 'Write to your church’s Data Protection Officer.',
      },
      {
        what: 'The files themselves',
        why: 'They are listed here with their names, types and dates, but the bytes are not '
          + 'in this file: putting them in would make it too large to open on a phone.',
        how_to_ask: 'Open the conversation and save each one, or ask your Data Protection Officer.',
      },
    ],
    ...out,
  };
}

/** The filename somebody sees in their downloads folder a year from now. */
export function myDataFilename(name?: string | null): string {
  const who = (name ?? 'my').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my';
  return `open-sentry-beacon-${who}-data-${new Date().toISOString().slice(0, 10)}.json`;
}
