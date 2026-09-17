// Talking to a real database.
//
// This is the live twin of lib/demo/store.tsx. The demo keeps everything in the
// browser and can afford to be relaxed, because the only data it can damage is
// sample data in your own tab. This file talks to a database with real people
// in it, so the rules are different and worth stating before the code.
//
// ---------------------------------------------------------------------------
// THE FOUR RULES THIS FILE IS BUILT ON
// ---------------------------------------------------------------------------
//
// 1. THE DATABASE DECIDES, NOT THIS FILE. Every function below asks for what it
//    wants and lets row level security return what the caller is entitled to.
//    None of them filters "for security" in JavaScript. A check in this file
//    protects nobody: the browser can call PostgREST directly with the same
//    key, and anything only this file enforces is enforced nowhere. Where you
//    see a filter here it is for correctness or for fewer rows, never for
//    access — and it is commented as such.
//
// 2. NOTHING HERE SETS role, church_id, is_approved OR is_head_executive ON
//    YOURSELF. There is deliberately no setMyRole() in this file, though the
//    demo store has one. In the demo it is a toy for exploring the app; here it
//    would be a privilege escalation, and the only reason it would fail is a
//    database trigger. Do not add one. If you need to change somebody's role,
//    that is setMemberRole() and it is somebody else's row.
//
// 3. THE SERVICE ROLE KEY IS NEVER IMPORTED HERE. This file runs in the
//    browser. Anything needing to bypass RLS belongs in an Edge Function, on
//    the server, holding a secret this file cannot see.
//
// 4. AN EXPLORER IS NEVER HANDED THEIR OWN STAGE. Not "not shown it" — not
//    handed it. getMyPairing() selects the columns an Explorer may have and
//    journey_stage is not among them, so it is absent from the response rather
//    than present and undrawn. The difference matters: a field that arrives and
//    is not rendered is one careless change away from being rendered.

import {
  clearBrowserSession,
  readBrowserSession,
  saveBrowserSession,
  supabase,
  supabaseAuth,
} from '@/lib/supabase/client';
import { uuid } from '@/lib/uuid';
import { shrinkImage } from '@/lib/live/shrink-image';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Pairing, Message, Stage, Track, Role, JourneyEvent, MeetingMode } from '@/lib/types';
import { STAGE_ORDER } from '@/lib/brand';

/** Thrown when a live call is made with no database configured. */
class NotLive extends Error {
  constructor() {
    super('This build has no database configured.');
    this.name = 'NotLive';
  }
}

// Exported for lib/live/my-data.ts, which assembles a person's own copy of
// their data and must read it through the ordinary rules as that person, not
// through a privileged path of its own. Sharing these two is what keeps that
// true: there is only one way into the database in this app.
export function db() {
  const client = supabase();
  if (!client) throw new NotLive();
  return client;
}

/**
 * Who is signed in, from the session this app already verified.
 *
 * USE THIS, NEVER the Auth client's own getUser. Eleven calls in this file
 * drifted onto it while features were being added, and each one is a second
 * network round trip to the Auth server before the query the caller actually
 * wanted. That is not just slow — a browser with tracking protection on
 * (Safari, Brave, Firefox in strict mode) can fail that request while the
 * session itself is perfectly good, so the feature reports "not signed in" to
 * somebody who is signed in, on their phone, in the middle of a conversation.
 *
 * The session in local storage was verified server-side by /api/auth/sign-in
 * before it was ever written. Reading the id out of it asks nobody anything.
 * lib/supabase/client.ts takes the access token from the same place, for the
 * same reason.
 */
export async function uid(): Promise<string> {
  const id = readBrowserSession()?.user.id;
  if (!id) throw new Error('You are not signed in.');
  return id;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SignInResult {
  role: Role;
  is_approved: boolean;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  let response: Response;
  try {
    response = await fetch('/api/auth/sign-in', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
  } catch {
    throw new Error('Could not reach live sign-in. Please try again.');
  }

  const payload = await response.json().catch(() => null);
  if (
    !response.ok ||
    !payload?.profile ||
    typeof payload?.session?.access_token !== 'string' ||
    typeof payload?.session?.refresh_token !== 'string'
  ) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Could not reach live sign-in. Please try again.',
    );
  }

  try {
    saveBrowserSession(payload.session as Session);
  } catch {
    throw new Error('Your account signed in, but the app could not save the session.');
  }
  const mine = payload.profile as SignInResult;

  // CLAIM THE INVITATION HERE, NOT ONLY ON THE JOIN LINK.
  //
  // Sending an invitation creates the account; the church and the invited role
  // are attached separately, by claim_my_pending_invitation(). The join flow
  // calls it. Signing in did not -- so anybody who reached the app through
  // /login instead of finishing their join link kept a profile with NO CHURCH,
  // and a church-less profile is invisible to every Director, because every
  // approval list is scoped by church. They sat on "waiting for a Director to
  // approve" while the Director's screen read "Nobody is waiting". Neither side
  // could see the other and neither had anything to act on. Reported from both
  // ends at once, which is the only reason it was findable.
  //
  // Gated on approval so it costs an approved member nothing, and safe when it
  // does run: the claim only touches a profile that has no church AND is not
  // approved, and it only ever writes what a still-valid invitation already
  // says. For anybody else it is a no-op.
  if (!mine.is_approved) {
    try {
      if (await claimMyPendingInvitation()) {
        const claimed = await getMyProfile();
        if (claimed) return { role: claimed.role, is_approved: claimed.is_approved };
      }
    } catch {
      // A failed claim must never turn a correct password into a sign-in
      // error. The person still reaches the waiting room; they are just still
      // waiting, which is where they already were.
    }
  }
  return mine;
}

export async function signUp(email: string, password: string, fullName: string): Promise<void> {
  if (password.length < 10) throw new Error('Use at least 10 characters.');
  const client = supabaseAuth();
  if (!client) throw new NotLive();
  const { error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    // full_name only. A client cannot ask to be created as an admin: the
    // profile trigger reads this metadata and writes nothing but the name, and
    // is_approved defaults to false regardless of what is sent.
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  clearBrowserSession();
}

/**
 * Change your own password.
 *
 * WHY THIS SCREEN EXISTS NOW AND DID NOT BEFORE. The invitation used to carry a
 * one-time link, and the only place anybody ever set a password was the sign-up
 * form at the end of that link. Once you were in, there was NOWHERE in the app
 * to change it -- the only route was signing out and using "Forgot your
 * password", which is a strange thing to ask of somebody who has not forgotten
 * anything.
 *
 * That was survivable while everybody chose their own password. It is not
 * survivable now: the invitation e-mails a temporary one, the message tells
 * people to change it, and telling somebody to do a thing the app cannot do is
 * worse than not mentioning it.
 *
 * THE FLAG IS CLEARED HERE AND ITS FAILURE IS SWALLOWED, deliberately. The
 * password change is the part that matters; the reminder flag is a convenience.
 * If clearing it fails the person has still changed their password
 * successfully, and reporting an error would tell them the opposite of what
 * happened. The reminder simply appears once more.
 */
export async function changeMyPassword(next: string): Promise<void> {
  if (next.length < 10) throw new Error('Use at least 10 characters.');
  const client = supabaseAuth();
  if (!client) throw new NotLive();

  const { data, error } = await client.auth.updateUser({ password: next });
  if (error) throw new Error(error.message);

  // updateUser rotates the tokens, so the saved session has to be replaced or
  // the next request goes out with the old one. Same reason the join screen
  // re-publishes after setting a password.
  try {
    const { data: fresh } = await client.auth.getSession();
    if (fresh?.session) saveBrowserSession(fresh.session as Session);
  } catch { /* the change stands; the session refreshes on its own */ }

  const me = data?.user?.id;
  if (me) {
    try {
      await db().from('profiles').update({ password_is_temporary: false }).eq('id', me);
    } catch { /* see above: the password changed, which is the point */ }
  }
}

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

export async function getMyProfile(): Promise<Profile | null> {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('id', await uid())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

/**
 * Update your own profile.
 *
 * The patch is REBUILT rather than spread, so a caller that passes
 * `{ role: 'admin' }` — by mistake or on purpose — sends nothing of the sort.
 * The database would refuse it anyway (lock_privileged_profile_columns raises),
 * but a request that never carries the field cannot be the request that gets
 * through when somebody edits that trigger.
 */
export async function updateMyProfile(patch: Partial<Profile>): Promise<void> {
  const safe = {
    full_name: patch.full_name,
    preferred_contact: patch.preferred_contact,
    preferred_language: patch.preferred_language,
    topics_of_interest: patch.topics_of_interest,
    // The sign-up fields added in 0013. Listed one by one for the same reason
    // the four above are: this object is an allow-list, and the moment it
    // becomes a spread it stops being one.
    birthday: patch.birthday,
    gender: patch.gender,
    life_status: patch.life_status,
    city_of_residence: patch.city_of_residence,
    work_industry: patch.work_industry,
    consent_at: patch.consent_at,
    // A face. Not privileged: unlike role or guardian consent these are yours
    // to change, and a member editing their own picture is the whole point.
    avatar: patch.avatar,
    photo_path: patch.photo_path,
  };
  for (const k of Object.keys(safe) as (keyof typeof safe)[]) {
    if (safe[k] === undefined) delete safe[k];
  }
  if (Object.keys(safe).length === 0) return;

  const { error } = await db().from('profiles').update(safe).eq('id', await uid());
  if (error) throw new Error(error.message);
}

/**
 * What this person has changed about their own details, newest first.
 *
 * Readable by that member, by the Guide currently paired with them, and by
 * their church's leadership -- migration 0035 sets those three policies and
 * nothing else, so this call needs no role check of its own. Asking for
 * somebody you are not walking with returns an empty list rather than an
 * error, which is what a row level security refusal looks like from here and
 * is the right shape: absence of permission should not confirm existence.
 */
export interface ProfileChange {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

/** The field names, in words a Guide would use rather than column names. */
export const PROFILE_FIELD_LABEL: Record<string, string> = {
  full_name: 'Name',
  preferred_contact: 'Contact',
  preferred_language: 'Language',
  birthday: 'Birthday',
  gender: 'Gender',
  life_status: 'Status',
  city_of_residence: 'City',
  work_industry: 'Work',
};

export async function listProfileChanges(personId: string, limit = 20): Promise<ProfileChange[]> {
  const { data, error } = await db()
    .from('profile_changes')
    .select('id, field, old_value, new_value, changed_at')
    .eq('profile_id', personId)
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileChange[];
}

// Security audit events are deliberately served by an RPC rather than by a
// table query. The database returns only the role-scoped, content-free summary
// a Director or Executive Director is allowed to review.
export interface SecurityAuditEvent {
  id: string;
  subject_name: string;
  subject_role: Role;
  event_type:
    | 'profile_change'
    | 'identity_change'
    | 'safeguarding_report'
    | 'account_suspended'
    | 'account_restored'
    | 'account_removed'
    | 'approval_changed';
  severity: 'info' | 'review' | 'urgent';
  summary: string;
  actor_label: string;
  occurred_at: string;
}

export async function securityAuditFeed(limit = 100): Promise<SecurityAuditEvent[]> {
  const { data, error } = await db().rpc('security_audit_feed', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as SecurityAuditEvent[];
}

// withdrawMyConsent() was here, and is gone on purpose. It called
// withdraw_my_consent(), which migration 0035 drops.
//
// A member now keeps their details accurate rather than being able to erase
// them, and every edit is recorded for their Guide and Director to see. Leaving
// the function behind an unused screen would have left a SECURITY DEFINER route
// to clearing somebody's details reachable by anything holding a session --
// which is not a dead function, it is an undocumented one.

// ---------------------------------------------------------------------------
// Who has been invited, and who has not arrived yet
// ---------------------------------------------------------------------------

export interface OpenInvite {
  id: string;
  email: string;
  role: Role;
  full_name: string | null;
  created_at: string;
  expires_at: string;
  /**
   * An auth account exists for this address. NOT the same as having joined —
   * sending an invitation creates the account, so this is true for nearly
   * every row here. Its ABSENCE is the useful half: no account means the send
   * never got far enough to make one, so no message can have arrived.
   */
  has_account: boolean;
  /**
   * When the invitation link was last opened — by somebody. Not proof it was
   * the invited person: a Director who copies the link and opens it to check
   * it works stamps this too.
   */
  opened_at: string | null;
  /**
   * When they finished the sign-up form and chose their own password.
   *
   * THIS IS WHAT "ACCEPTED" MEANS, and two earlier answers were wrong.
   * invites.redeemed_at is stamped when the auth row is created, which is the
   * moment the invitation is SENT — so it read "joined today" for people who
   * had never opened their email. last_sign_in_at is stamped by opening the
   * link, which a Director testing one does on their own device — so it read
   * "joined" for people who had never touched anything. Submitting the form is
   * the only step that cannot happen by accident.
   */
  joined_at: string | null;
  /**
   * When the invitation was spent -- stamped as the auth row is created, which
   * is the moment Send is pressed.
   *
   * ON ITS OWN THIS MEANS ALMOST NOTHING, and twice it was read as "they have
   * joined", which it is not: it is stamped before the person has seen
   * anything. That is why joined_at above exists and why this must never be
   * substituted for it.
   *
   * PAIRED WITH has_account IT IS EXACT, because the two absences it separates
   * are otherwise identical on screen:
   *   null + no account     the send never got as far as making one. Nothing
   *                         happened; Re-send is the right offer.
   *   present + no account  an account WAS made and is gone. Somebody removed
   *                         this person, and Re-send would rebuild them.
   */
  redeemed_at: string | null;
}

/**
 * Invitations this church has sent.
 *
 * The point of this list is the ones that have NOT been accepted. An invitation
 * that silently failed to send looks exactly like one the person has not got
 * round to opening, and until this existed there was nowhere at all to see the
 * difference — a Director pressed Invite, got a confirmation, and that was the
 * last anybody heard of it.
 */
export async function listInvites(): Promise<OpenInvite[]> {
  // Through a definer function rather than a plain select, because whether a
  // link was ever opened lives in auth.users and no browser-side policy can
  // read it. church_invitations() checks the caller leads this church before
  // it returns a single row.
  const { data, error } = await db().rpc('church_invitations');
  if (error) throw new Error(error.message);
  return (data ?? []) as OpenInvite[];
}

/**
 * Mark this person's sign-up finished.
 *
 * Called once, by the join form, after the password has actually been set.
 * Nothing else may stand in for it: the account row is created when the
 * invitation is sent, and the sign-in stamp is set by opening the link, so
 * both of those are true for somebody who has done nothing at all. Choosing a
 * password is the first step that requires the invited person to be present.
 *
 * A definer that writes one column of the caller's own row, rather than an
 * ordinary update: the way profiles' no-self-promotion rule dies is somebody
 * widening the set of columns a browser may write and taking `role` along.
 */
export async function finishMySignup(): Promise<void> {
  const { error } = await db().rpc('finish_my_signup');
  if (error) throw new Error(error.message);
}

/**
 * Attach an invitation that was sent after this account already existed.
 *
 * `inviteUserByEmail` creates a new auth row, which normally lets
 * `handle_new_user` copy the invitation's church and role into the profile.
 * An already-created, unassigned account follows the recovery-email path
 * instead, so that trigger does not run again. The database function is
 * deliberately narrower than a general profile update: it can only fill the
 * current caller's unassigned, still-unapproved profile from an active invite
 * to that caller's verified account email.
 */
export async function claimMyPendingInvitation(): Promise<boolean> {
  const { data, error } = await db().rpc('claim_my_pending_invitation');
  if (error) throw new Error(error.message);
  return data === true;
}

/**
 * Withdraw an invitation that has not been accepted.
 *
 * There was no way to take one back. An invitation sent to the wrong address,
 * or with the wrong role chosen, simply stayed in the list for ever — and
 * because the one-open-invite-per-address index then blocked a corrected one,
 * a single slip made that person un-invitable until somebody went into the
 * database.
 *
 * THE FIRST VERSION OF THIS NEVER DELETED ANYTHING. It was a plain delete
 * filtered on `redeemed_at is null`, matching the invites_revoke policy — and
 * that column is stamped when the account row is created, which is the moment
 * the invitation is SENT. The condition was false for every row that has ever
 * existed. A delete that matches nothing is not an error, so the button said
 * "withdrawn" and the invitation stayed exactly where it was.
 *
 * Now a definer that checks the caller leads that church, refuses to touch
 * anybody who has finished signing up, and returns whether it deleted a row —
 * so a refusal can be shown rather than swallowed.
 */
export async function cancelInvite(id: string): Promise<void> {
  const { data, error } = await db().rpc('cancel_invitation', { p_id: id });
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new Error('That invitation could not be withdrawn. It may already have been accepted.');
  }
}

/** The address each member was invited at. Leadership of that church only. */
export async function memberContact(): Promise<Record<string, { email: string; joined_at: string }>> {
  const { data, error } = await db().rpc('church_member_contact');
  if (error) throw new Error(error.message);
  const out: Record<string, { email: string; joined_at: string }> = {};
  for (const row of (data ?? []) as { id: string; email: string; joined_at: string }[]) {
    out[row.id] = { email: row.email, joined_at: row.joined_at };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The church and its people
// ---------------------------------------------------------------------------

export interface Church {
  id: string;
  name: string;
  /**
   * How many Explorers one Guide of this church may carry.
   *
   * A CHURCH'S OWN NUMBER, NOT THE APP'S. It was five for a long time and the
   * whole discipleship shape was built on it; the owner has raised it to a
   * hundred. What has not changed is that the database enforces it, so a Guide
   * cannot give themselves more people than their church agreed to.
   */
  guide_cap: number;
}

export async function myChurch(): Promise<Church | null> {
  // THE CAP COMES WITH THE CHURCH, because the screen that shows a Guide's load
  // has to show it against the number this congregation actually agreed to. It
  // used to print "/5" from a literal, which was a lie the day the cap moved.
  const { data, error } = await db()
    .from('churches').select('id, name, guide_cap').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Church) ?? null;
}

export async function renameChurch(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A church needs a name.');
  const { error } = await db().from('churches').update({ name: trimmed }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createChurch(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A church needs a name.');
  const { data, error } = await db().rpc('create_church', { p_name: trimmed });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Everyone this caller may see.
 *
 * No church filter, deliberately. `profiles_read_church` already scopes this to
 * churches the caller manages, and adding `.eq('church_id', mine)` here would
 * be a second, weaker copy of that rule which an Executive Director overseeing
 * two churches would then have to fight.
 */
/**
 * One person's profile, if the caller is allowed it.
 *
 * NO ROLE CHECK HERE, and that is deliberate rather than an omission. Three
 * policies decide it: profiles_read_self, profiles_read_paired — the profile of
 * somebody you are actually walking with — and profiles_read_church for
 * leadership. A Guide asking for somebody they are not paired with gets no row
 * rather than an error, which is the right answer and not one this function
 * could improve on.
 */
export async function memberProfile(id: string): Promise<Profile | null> {
  const { data, error } = await db().from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

export async function listMembers(): Promise<Profile[]> {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

/**
 * Who the app would put with whom, for everybody still waiting.
 *
 * A PROPOSAL. IT WRITES NOTHING. The screen shows the list and the Director
 * confirms, and only then are the pairings created -- one at a time, through
 * `createPairing`, so every trigger and policy applies to each and a failure on
 * one cannot take the others with it.
 *
 * Minors are deliberately absent: see the migration. An Explorer under eighteen
 * being assigned to an adult by an algorithm is the one pairing in this app
 * that should never happen without a person deciding.
 */
export interface SuggestedPairing {
  dm_id: string;
  dm_name: string;
  ds_id: string;
  ds_name: string;
  /** How many that Guide is already carrying, before this one. */
  dm_load_now: number;
}

export async function suggestPairings(): Promise<SuggestedPairing[]> {
  const { data, error } = await db().rpc('suggest_pairings');
  if (error) throw new Error(error.message);
  return (data ?? []) as SuggestedPairing[];
}

/** Approve somebody, and give them the role they were approved as. */
export async function approveMember(userId: string, role: Role): Promise<void> {
  if (userId === (await uid())) throw new Error('Somebody else has to approve you.');
  const { error } = await db()
    .from('profiles')
    .update({ is_approved: true, role })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

/** Suspend somebody's workspace access without deleting their account. */
export async function disapproveMember(userId: string): Promise<void> {
  if (userId === (await uid())) throw new Error('You cannot disapprove your own account.');
  const { error } = await db()
    .from('profiles')
    .update({ is_approved: false })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function setMemberRole(userId: string, role: Role): Promise<void> {
  // Not a security control — the trigger raises on a self-edit regardless. It
  // is here so the person gets "somebody else has to do that" instead of a
  // database error they cannot act on.
  if (userId === (await uid())) throw new Error('You cannot change your own role.');
  const { error } = await db().from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(error.message);
}

// removeMember USED TO LIVE HERE, AND DELETING IT IS THE FIX.
//
// It deleted the profiles row and nothing else. profiles.id references
// auth.users on delete cascade, and a cascade only runs in that direction, so
// the auth account survived every use of it -- invisible to every screen, since
// only the service role can read auth.users.
//
// Two things followed, both reported as bugs before the cause was found. The
// removed person still held a working login that resolved to no profile. And
// their address could never be invited again: member_by_email joins auth.users
// to profiles, the row was still there, and a fresh invitation was refused as
// already registered.
//
// removeMemberByLeader below is the whole act: it checks authority, writes the
// discipline log, clears messages and pairings, and deletes the auth user,
// which cascades everything else away and frees the address.

// ---------------------------------------------------------------------------
// Pairings
// ---------------------------------------------------------------------------

export interface PairingView extends Pairing {
  dm_name: string;
  ds_name: string;
  /** When the Explorer finished signing up, for the "New" badge. */
  ds_signup_completed_at?: string | null;
  // Carried so the MINOR badge can be drawn wherever a Guide or Director sees
  // this Explorer. Both are already readable here: RLS is row-level, and a
  // Guide may read the whole row of the person they are paired with, as may
  // leadership for their own church. Nothing new is exposed by asking for them.
  ds_birthday: string | null;
  ds_guardian_consent_at: string | null;
}

/** What an Explorer is allowed to know about their own pairing. */
export interface MyPairing {
  id: string;
  dm_id: string;
  dm_name: string;
  track: Track;
  status: string;
}

export async function listPairings(): Promise<PairingView[]> {
  const client = db();
  const [{ data: pairs, error }, { data: people }] = await Promise.all([
    client.from('pairings').select('*').order('created_at', { ascending: false }),
    // signup_completed_at rides along for the "New" badge on a Guide's cards.
    client.from('profiles').select('id, full_name, birthday, guardian_consent_at, signup_completed_at'),
  ]);
  if (error) throw new Error(error.message);
  type Row = { id: string; full_name: string | null; birthday: string | null; guardian_consent_at: string | null; signup_completed_at: string | null };
  const by = new Map((people ?? []).map((p: Row) => [p.id, p]));
  return (pairs ?? []).map((p: Pairing) => ({
    ...p,
    dm_name: by.get(p.dm_id)?.full_name ?? 'Someone',
    ds_name: by.get(p.ds_id)?.full_name ?? 'Someone',
    ds_birthday: by.get(p.ds_id)?.birthday ?? null,
    ds_guardian_consent_at: by.get(p.ds_id)?.guardian_consent_at ?? null,
    ds_signup_completed_at: by.get(p.ds_id)?.signup_completed_at ?? null,
  }));
}

/**
 * The Explorer's own pairing, WITHOUT the stage.
 *
 * The column list is the access control. `select('*')` here would put
 * journey_stage in the browser of the person the stage is about, and the only
 * thing standing between that and a screen would be somebody remembering not
 * to render it. The type has no stage either, so a future edit reaching for one
 * fails to compile.
 */
export async function getMyPairing(): Promise<MyPairing | null> {
  const me = await uid();
  const client = db();
  // NEWEST FIRST AND TAKE ONE, RATHER THAN maybeSingle().
  //
  // This was `.maybeSingle()`, which RAISES when it finds more than one row —
  // and nothing in the database ever said an Explorer has one Guide. The only
  // trigger on pairings caps a GUIDE at the church's own figure, the other side of the
  // relationship, so pairing an Explorer who already had a Guide was simply
  // allowed. Four of them ended up with two.
  //
  // The result was not a quietly wrong Guide. It was an exception on the one
  // screen an Explorer has: My Guide failed to load at all, which is the whole
  // app as far as they are concerned, and it failed for a reason no Director
  // could have guessed from their side.
  //
  // The trigger added in migration 20260902100000 stops it happening again.
  // This makes the reading survive the rows already there, because an Explorer
  // should not be staring at an error while a Director decides which pairing
  // was the mistake. Newest wins, which is the one a Director most recently
  // meant.
  const { data: rows, error } = await client
    .from('pairings')
    .select('id, dm_id, track, status')
    .eq('ds_id', me)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const data = rows?.[0];
  if (!data) return null;

  const { data: guide } = await client
    .from('profiles')
    .select('full_name')
    .eq('id', (data as { dm_id: string }).dm_id)
    .maybeSingle();

  return {
    ...(data as Omit<MyPairing, 'dm_name'>),
    dm_name: (guide as { full_name: string | null } | null)?.full_name ?? 'your Guide',
  };
}

/** How far along the journey somebody is, as a position and nothing else. */
export interface JourneyProgress {
  /** 1-based position along the journey. */
  step: number;
  /** How many positions there are. */
  total: number;
}

/**
 * The Explorer's own place on the journey, as a NUMBER, never as a name.
 *
 * ---------------------------------------------------------------------------
 * THE ASK: "There must be a progressive bar that the Explorers can see too that
 * is aligned with the Journey that the Guide sees, so when the Guide progresses
 * the Explorer, the Explorer can appreciate and affirm that he/she progresses
 * in the Journey with the Guide (no labels yet for the Explorer to see)."
 *
 * WHY THIS IS ITS OWN FUNCTION AND NOT A COLUMN ADDED TO getMyPairing(). Rule 4
 * at the top of this file says an Explorer is never HANDED their own stage, and
 * getMyPairing() enforces it by listing the columns rather than selecting all
 * of them, so a future edit reaching for the stage fails to compile. That rule
 * is worth keeping exactly as it is. This is a separate, named, deliberate
 * channel with a different job, so the old guarantee is not quietly widened by
 * a feature request landing on top of it.
 *
 * WHAT IT DOES AND DOES NOT PROTECT, stated plainly rather than implied.
 *
 * The stage NAME never leaves the database through here. What does leave is the
 * POSITION, because a bar cannot be drawn without one, and a position in a
 * six-step journey is convertible to a name by anybody who reads the public
 * source. So this is not a secret; it is an interface decision. The screen shows
 * movement rather than a category, which is the thing that was actually asked
 * for and the thing that matters to the person looking at it.
 *
 * IT ALSO TAKES NOTHING AWAY THAT WAS BEING WITHHELD. Checked against the live
 * policies rather than assumed: `pairings_read` already lets an Explorer select
 * their own pairing row, journey_stage included. The column restriction in
 * getMyPairing() is a choice this app makes about what to LOOK at, not a wall
 * the database holds up. So drawing this bar widens no permission at all.
 *
 * THE STAGE NAME STILL MAY NOT BE RENDERED. tests/e2e/seeker-no-stage.js walks
 * every screen an Explorer can reach and fails if any of the six words appears.
 * That rule is untouched and this bar carries no label, by request and because
 * it is right: a person is not a category, and "a relationship, not a score" is
 * written on the same screen.
 * ---------------------------------------------------------------------------
 */
export async function myJourneyProgress(): Promise<JourneyProgress | null> {
  const me = await uid();
  const client = db();

  // NEWEST ACTIVE ONE, not maybeSingle(). Same reasoning as getMyPairing above:
  // an Explorer with two pairings is a state the database has allowed before,
  // and an exception here would take out the whole screen rather than one bar.
  const { data: rows, error } = await client
    .from('pairings')
    .select('journey_stage')
    .eq('ds_id', me)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const row = rows?.[0] as { journey_stage: Stage } | undefined;
  if (!row) return null;

  const at = STAGE_ORDER.indexOf(row.journey_stage);
  // An unknown stage means the journey grew and this did not. Showing the
  // start is wrong and showing nothing is honest.
  if (at < 0) return null;

  return { step: at + 1, total: STAGE_ORDER.length };
}

export async function createPairing(dmId: string, dsId: string, track: Track): Promise<void> {
  if (dmId === dsId) throw new Error('Somebody cannot be paired with themselves.');
  const { error } = await db()
    .from('pairings')
    // An Explorer is never at Create. By the time an account is paired, the
    // church has already made contact; the shared relationship starts here.
    .insert({
      dm_id: dmId,
      ds_id: dsId,
      track,
      journey_stage: 'connect',
      created_by: await uid(),
    });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/**
 * What the invite function actually reports back.
 *
 * `delivery` is the honest bit: 'email' means it left, 'link' means it did not
 * and the URL below is the only way that person is getting in. A church with no
 * mail provider configured yet is a normal state, not an error — but it has to
 * be a VISIBLE state, or invitations quietly go nowhere.
 */
export interface InviteResult {
  ok?: boolean;
  delivery?: 'email' | 'link';
  /**
   * Where to sign in. Present on every reply now, and that used to be forbidden.
   *
   * While the invitation carried a one-time token, producing this link MINTED
   * one -- and auth.users stores exactly one token per purpose, so generating
   * it after a successful send overwrote the token already in the recipient's
   * inbox and their link came back "expired or already used". Every invitation
   * this app ever sent, broken by the reply to the request that sent it.
   *
   * No token is minted anywhere any more. This is the ordinary sign-in page
   * with the person's own address in the query string, so returning it is
   * returning a fact rather than spending a credential.
   */
  link?: string;
  /**
   * The address and the password the invitation e-mailed, handed back so a
   * Director can read them out to somebody who says nothing arrived.
   *
   * THIS IS NOT A LEAK. The Director created the invitation a second ago; under
   * the old flow they were handed a link that would sign them in AS that person,
   * which is strictly more than this. What it buys is the phone call that used
   * to end in "I'll send another one" -- which, under the old flow, killed the
   * message already sitting in the inbox.
   */
  signInEmail?: string;
  tempPassword?: string;
  /** Why it could not be emailed, in words a person can act on. */
  mailNote?: string;
  /**
   * Set when the ONLY thing wrong is a per-address cooldown. A number here
   * means "this will work, shortly" — a very different thing from a fault, and
   * the screen must not draw them the same way.
   */
  waitSeconds?: number;
  /** Which route carried it: the church's provider, or Supabase's own mailer. */
  via?: 'provider' | 'supabase';
  /** True when this refreshed an invitation that already existed. */
  resent?: boolean;
}

export async function inviteMember({
  email,
  role,
  fullName,
  recommendedBy,
  deliver,
}: {
  email: string;
  role: Role;
  fullName: string;
  recommendedBy?: string;
  /**
   * `'link'` sends no email at all and returns a join link to pass on by hand.
   *
   * For a church whose email is unreliable, or a congregation that lives on a
   * messaging app rather than in an inbox. It is also the only route that
   * cannot be broken by a mail scanner opening the link first, because nothing
   * is emailed for a scanner to find.
   */
  deliver?: 'email' | 'link';
}): Promise<InviteResult> {
  const client = db();
  const { data, error } = await client.functions.invoke('invite', {
    body: {
      email: email.trim().toLowerCase(),
      role,
      full_name: fullName.trim(),
      recommended_by: recommendedBy,
      deliver,
    },
  });

  if (error) {
    // functions-js exposes the response on context for non-2xx results. Read
    // the function's useful reason instead of showing "non-2xx status code".
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      let reason = '';
      try {
        const body = (await response.clone().json()) as { error?: string };
        reason = body.error ?? '';
      } catch {
        // If the response was not JSON, fall back to the SDK message below.
      }
      if (reason) throw new Error(reason);
    }
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  // RETURN IT. This used to be Promise<void>, so the Director's screen said
  // "Invitation e-mail sent" whatever came back — including when the function
  // had plainly reported that it could not send anything and had handed back a
  // link to pass on by hand. The owner sent invitations for a day and was told
  // each time that they had gone.
  return (data ?? {}) as InviteResult;
}

const ORDER: Stage[] = ['create', 'connect', 'care', 'call', 'cultivate', 'commission'];

/**
 * Move a pairing one step along, and record who moved it.
 *
 * Reads the stage first rather than trusting a stage passed in: two Guides on
 * two devices would otherwise both write "connect → care" from the same stale
 * view, and the journey would show one step where two happened.
 */
/**
 * Move an Explorer BACK one stage, because Advance is one tap and a mistake.
 *
 * WHY THIS EXISTS. Advance was the only control. A Guide who tapped it on the
 * wrong person, or twice, had no way to put it right: the stage is on the
 * Explorer's own journey, and the only remaining fix was to ask a Director to
 * edit the database. So the app quietly recorded a decision nobody had made
 * about somebody's faith.
 *
 * IT IS A CORRECTION, NOT A DEMOTION, and the difference matters to the person
 * it is about. Nothing is deleted: the step back is written to journey_events
 * exactly like a step forward, with who did it and when, so the record shows
 * what actually happened rather than pretending the mistake never occurred.
 * That also means an Explorer's history stays honest if anybody ever reads it.
 *
 * The Explorer is never shown their stage at all, here or anywhere, so a
 * correction is invisible to them. That is deliberate: see myPairing.
 */
export async function stepBackStage(pairingId: string): Promise<Stage | null> {
  const client = db();
  const { data, error } = await client
    .from('pairings')
    .select('journey_stage')
    .eq('id', pairingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const from = (data as { journey_stage: Stage }).journey_stage;
  const back = ORDER[ORDER.indexOf(from) - 1];
  // Already at the first stage. Returning null rather than throwing: the
  // button is disabled there, and a race is not worth an error message.
  if (!back) return null;

  const { error: upErr } = await client
    .from('pairings')
    .update({ journey_stage: back, updated_at: new Date().toISOString() })
    .eq('id', pairingId);
  if (upErr) throw new Error(upErr.message);

  await client
    .from('journey_events')
    .insert({ pairing_id: pairingId, from_stage: from, to_stage: back, changed_by: await uid() });
  return back;
}

export async function advanceStage(pairingId: string): Promise<Stage | null> {
  const client = db();
  const { data, error } = await client
    .from('pairings')
    .select('journey_stage')
    .eq('id', pairingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const from = (data as { journey_stage: Stage }).journey_stage;
  const next = ORDER[ORDER.indexOf(from) + 1];
  if (!next) return null;

  const { error: upErr } = await client
    .from('pairings')
    .update({ journey_stage: next, updated_at: new Date().toISOString() })
    .eq('id', pairingId);
  if (upErr) throw new Error(upErr.message);

  await client
    .from('journey_events')
    .insert({ pairing_id: pairingId, from_stage: from, to_stage: next, changed_by: await uid() });
  return next;
}

export async function endPairing(id: string): Promise<void> {
  const { error } = await db().from('pairings').update({ status: 'archived' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Every stage change this caller may see, for the analytics screen.
 *
 * NO PAIRING FILTER, on purpose: the policy on journey_events already decides
 * who sees what, so a Director gets their church and a Guide gets their own
 * people. Reading the real events rather than approximating from a pairing's
 * updated_at matters here, because updated_at moves for reasons that are not a
 * journey step and the chart would quietly count them.
 */
/**
 * Per role: how many are on the roll, how many did something in the window, how
 * many did not, and how many are suspended.
 *
 * "ACTIVE" MEANS A RECORDED ACTION, NOT A SIGN-IN, and the screen has to say so.
 * Beacon does not log sign-ins — there is no last_seen_at and nothing writes
 * one — so a number claiming to be visits would be invented. What is real is
 * whether the app recorded this person doing something: a message, a journey
 * step on their pairing, a meeting, a post, a lesson. See migration 0043.
 *
 * Counts only. The function is SECURITY DEFINER so it can see messages a
 * Director may not read, and it returns four integers per role and never a
 * name, which is the same posture as the blog's reader count.
 */
export interface RoleActivity {
  role: Role;
  approved: number;
  active: number;
  inactive: number;
  suspended: number;
}

export async function churchActivity(days: number): Promise<RoleActivity[]> {
  const { data, error } = await db().rpc('church_activity', { p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []) as RoleActivity[];
}

// ---------------------------------------------------------------------------
// A Guide asks to walk with somebody, and the Guides talk to each other.
// See migration 0046.
// ---------------------------------------------------------------------------

/** An Explorer nobody is walking with yet, for the Guide who has room. */
export interface UnpairedExplorer {
  id: string;
  full_name: string;
  signup_completed_at: string | null;
  created_at: string;
}

/**
 * Who is waiting.
 *
 * AN RPC, AND THE FIRST VERSION OF THIS WAS WRONG. It computed the answer here
 * from listMembers() and listPairings(), on the assumption that a Guide could
 * already read both. A Guide can read exactly TWO profiles: their own and the
 * Explorer they walk with. So this returned an empty list to the only people it
 * was built for, and the panel would have shipped looking like a feature that
 * does nothing.
 *
 * Migration 0047 answers it in the database instead, returning a name and an id
 * and nothing else. That does widen what a Guide can see, deliberately: you
 * cannot ask to walk with somebody you cannot name.
 */
export async function unpairedExplorers(): Promise<UnpairedExplorer[]> {
  const { data, error } = await db().rpc('unpaired_explorers');
  if (error) throw new Error(error.message);
  return (data ?? []) as UnpairedExplorer[];
}

export interface PairingRequest {
  id: string;
  guide_id: string;
  ds_id: string;
  note: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

/**
 * The Guide's own asks, or every ask in the church for a Director.
 *
 * One query for both, because the policy already decides which rows come back
 * and a second query filtered in the app would be a second answer that can
 * disagree with the first.
 */
export async function listPairingRequests(): Promise<PairingRequest[]> {
  const { data, error } = await db()
    .from('pairing_requests')
    .select('id, guide_id, ds_id, note, status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PairingRequest[];
}

/** Ask a Director to pair you with this Explorer. Never creates the pairing. */
export async function askToWalkWith(dsId: string, note = ''): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { error } = await supabase.from('pairing_requests').insert({
    church_id: me.church_id,
    guide_id: me_id,
    ds_id: dsId,
    note: note.trim(),
  });
  if (error) throw new Error(error.message);
}

/** A Guide takes back their own ask. */
export async function withdrawPairingRequest(id: string): Promise<void> {
  const { error } = await db().from('pairing_requests').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * A Director answers.
 *
 * Answering "yes" does NOT create the pairing. The Director still makes it on
 * the pairings screen, where the cap of five is enforced, and where they are
 * looking at everything else about that Guide. A button that silently created
 * a relationship from a list of requests is how somebody ends up with six.
 */
export async function decidePairingRequest(
  id: string,
  status: 'accepted' | 'declined',
): Promise<void> {
  const me_id = await uid();
  const { error } = await db().from('pairing_requests')
    .update({ status, decided_by: me_id, decided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Names for the Guides' room and the pairing requests, for people in the room. */
export interface GuideRoomPerson { id: string; full_name: string; role: Role }

export async function guideRoomPeople(): Promise<GuideRoomPerson[]> {
  const { data, error } = await db().rpc('guide_room_people');
  if (error) throw new Error(error.message);
  return (data ?? []) as GuideRoomPerson[];
}

export interface GuideRoomMessage {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  /** Set when the author corrected the wording. The previous wording is kept. */
  edited_at?: string | null;
  /**
   * Set when the message was taken back -- by its author, or by leadership of
   * that church. `body` is emptied when this is set, so a deleted message must
   * never be rendered as an empty bubble.
   */
  deleted_at?: string | null;
  deleted_by?: string | null;
}

/**
 * Every conversation this person is in, with what is waiting in each.
 *
 * ONE CALL, AND NOT A COUNT DONE IN THE BROWSER. The obvious version of this is
 * "read every message in my pairings and count the unread ones in JavaScript",
 * which downloads every word of every conversation to display a number. It
 * works at this church's size and stops working quietly.
 *
 * Ordered with the waiting ones first, then by when somebody last spoke, which
 * is the order a person opening the chat is actually looking for.
 */
export interface Thread {
  pairing_id: string;
  other_id: string;
  other_name: string;
  unread: number;
  last_at: string | null;
  last_preview: string | null;
  last_is_mine: boolean | null;
}

export async function listMyThreads(): Promise<Thread[]> {
  const { data, error } = await db().rpc('my_threads');
  if (error) throw new Error(error.message);
  return (data ?? []) as Thread[];
}

/** What the badge shows. Zero when nothing is waiting, never a stale number. */
export async function unreadTotal(): Promise<number> {
  const threads = await listMyThreads().catch(() => [] as Thread[]);
  return threads.reduce((sum, t) => sum + (Number(t.unread) || 0), 0);
}

/** The Guides' room, oldest last so it reads like a conversation. */
export async function listGuideRoom(limit = 200): Promise<GuideRoomMessage[]> {
  const { data, error } = await db()
    .from('guide_room_messages')
    .select('id, author_id, body, created_at, edited_at, deleted_at, deleted_by')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as GuideRoomMessage[]).reverse();
}

export async function postToGuideRoom(body: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { error } = await supabase.from('guide_room_messages').insert({
    church_id: me.church_id,
    author_id: me_id,
    body: body.trim(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Correct your own message in the Guides' room. Only the author, ever.
 *
 * LEADERSHIP CAN REMOVE A MESSAGE HERE AND DELIBERATELY CANNOT REWRITE ONE.
 * Removing something somebody said and putting different words in their mouth
 * are not the same power, and only the first belongs to a moderator.
 */
export async function editGuideRoomMessage(id: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error('A message has to say something.');
  if (text.length > 4000) throw new Error('That message is too long.');
  const { error } = await db().rpc('edit_guide_room_message', {
    p_message: id,
    p_body: text,
  });
  if (error) throw new Error(error.message);
}

/**
 * Take a message back: the author, or leadership of that church.
 *
 * THIS USED TO BE A REAL DELETE, and that was the wrong shape for this room.
 * Guides say the hard parts of carrying people out loud in here and leadership
 * is in the room. If a safeguarding question is ever asked about something said
 * here, "it was deleted" has to mean removed from the screen, not removed from
 * existence. The words move to `guide_room_revisions`, which no browser can
 * read, and the row keeps who took it back so the thread can say so instead of
 * quietly changing shape between visits.
 */
export async function deleteGuideRoomMessage(id: string): Promise<void> {
  const { error } = await db().rpc('delete_guide_room_message', { p_message: id });
  if (error) throw new Error(error.message);
}

export async function listJourneyEvents(limit = 2000): Promise<JourneyEvent[]> {
  const { data, error } = await db()
    .from('journey_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as JourneyEvent[];
}

export async function listJourney(pairingId: string): Promise<JourneyEvent[]> {
  const { data, error } = await db()
    .from('journey_events')
    .select('*')
    .eq('pairing_id', pairingId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as JourneyEvent[];
}

// ---------------------------------------------------------------------------
// The conversation
//
// Read by exactly two people, enforced by one policy with no leadership branch.
// If you are here to add "so a Director can review a conversation", that is a
// change to what this app is, not a feature.
// ---------------------------------------------------------------------------

export async function listMessages(pairingId: string): Promise<Message[]> {
  const { data, error } = await db()
    .from('messages')
    .select('*')
    .eq('pairing_id', pairingId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function sendMessage(pairingId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;
  if (text.length > 4000) throw new Error('That message is too long.');
  const { error } = await db()
    .from('messages')
    .insert({ pairing_id: pairingId, sender_id: await uid(), body: text });
  if (error) throw new Error(error.message);
}

/**
 * Change the wording of your own message.
 *
 * THROUGH A FUNCTION, NOT AN UPDATE, and the reason is a fault this replaced.
 * `messages_mark` is an UPDATE policy that exists so the RECIPIENT can stamp
 * `read_at`. RLS is row level and says nothing about columns, so until today it
 * also let EITHER PERSON REWRITE THE OTHER'S WORDS, silently. The browser can
 * now only change `read_at` -- a column grant, not a policy -- and editing goes
 * through a definer function that checks you are the author.
 *
 * The previous wording is kept in `message_revisions` first. Editing is for
 * fixing a typo, not for changing what you said after being challenged on it.
 */
export async function editMessage(messageId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error('A message has to say something.');
  if (text.length > 4000) throw new Error('That message is too long.');
  const { error } = await db().rpc('edit_message', {
    p_message: messageId,
    p_body: text,
  });
  if (error) throw new Error(error.message);
}

/**
 * Take your own message back.
 *
 * NOT A DELETE. The words are moved into `message_revisions` and the row's
 * `body` is emptied, so they leave the reach of every browser while the record
 * survives for safeguarding -- the same reason `report_guild_post` copies a
 * post's words into the report before anybody can remove it. `deleted_at` and
 * `deleted_by` stay on the row so the conversation can say plainly that a
 * message was taken back, and by whom.
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await db().rpc('delete_message', { p_message: messageId });
  if (error) throw new Error(error.message);
}

/** Mark the other person's messages as read. Never your own. */
export async function markRead(pairingId: string): Promise<void> {
  const me = await uid();
  const { error } = await db()
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('pairing_id', pairingId)
    .neq('sender_id', me)
    .is('read_at', null);
  if (error) throw new Error(error.message);
}

/**
 * Live updates for one conversation.
 *
 * Realtime respects RLS, but only if the publication is configured for it —
 * see docs/BUILD-YOUR-OWN.md. The filter here is for traffic, not for privacy:
 * a subscription without it would still deliver only rows the caller may read,
 * it would just deliver more of them.
 */
export function subscribeToMessages(pairingId: string, onChange: () => void) {
  const client = supabase();
  if (!client) return () => {};
  const channel = client
    // A RANDOM SUFFIX, like every other channel here. A fixed name means two
    // components watching the same conversation ask one client for the same
    // channel, and the second one does not get its own.
    .channel(`messages:${pairingId}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `pairing_id=eq.${pairingId}` },
      onChange,
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

// `subscribeToMyMessages` USED TO LIVE HERE and was deliberately removed.
//
// It was an unfiltered channel that called its callback on every row event with
// no settling, and its only caller was the chat dock. That made one insert by
// anybody into N recounts, where N is however many people have the app open. A
// helper shaped like that is a trap for whoever needs the next one: it reads as
// the obvious tool and it is the expensive one. Watch a table through
// `useKeepUp`, which debounces, or filter to a single row set as the function
// below does.

// ---------------------------------------------------------------------------
// Blog.
//
// A Guide writes once, to the people they walk with. See migration 0006.
//
// As everywhere else in this file, nothing here filters by who may see what —
// row level security does that, and the queries are deliberately identical for
// every caller. A Guide asking for their posts gets their own; an Explorer
// asking for the feed gets what was published to them. The one exception is the
// reader count, which cannot be a policy because it is an aggregate: it comes
// from a SECURITY DEFINER function that returns a number and never the names
// behind it.
// ---------------------------------------------------------------------------

export type BlogVisibility = 'private' | 'published';
/**
 * Who a post is for.
 *
 *   church   — everybody in the writer's church. Community Blogs.
 *   all      — the people the writer walks with. For a Guide that is their
 *              Explorers; for an Explorer it is their Guide. Leaders' `all`
 *              posts also reach their whole church, which is how the board
 *              worked before `church` existed and is left alone so nothing
 *              already published changes audience.
 *   selected — named people, and nobody else.
 */
export type BlogAudienceKind = 'all' | 'church' | 'selected';

/** A post as its author sees it: with the count, and who it was addressed to. */
export interface MyBlogPost {
  id: string;
  title: string;
  body: string;
  visibility: BlogVisibility;
  audience: BlogAudienceKind;
  created_at: string;
  updated_at: string | null;
  reader_count: number;
  audience_ids: string[];
}

/**
 * A post as a reader sees it, with a name on it.
 *
 * The reader count stays out: that is the writer's, and a reader knowing how
 * many others have read a post changes what the post is. Who wrote it does
 * belong here — a blog anyone may post to is unreadable without it.
 */
export interface FeedPost {
  id: string;
  author_id: string;
  author_name: string;
  author_role: Role;
  title: string;
  body: string;
  audience: BlogAudienceKind;
  created_at: string;
  /** Held at the top of the church's feed by a Director. */
  pinned?: boolean;
}

/** The caller's own posts, drafts included, each with its reader count. */
export async function listMyBlogPosts(): Promise<MyBlogPost[]> {
  const { data, error } = await db().rpc('my_blog_posts');
  if (error) throw new Error(error.message);
  return (data ?? []) as MyBlogPost[];
}

/**
 * What this caller may read, newest first, with the writer's name on each.
 *
 * `can_read_post` decides — the same function the table's own SELECT policy
 * uses — so this asks for everything and gets back exactly what it is allowed.
 *
 * The caller's own posts come back here too. That used to be filtered out on
 * the grounds that a Guide should see what was written FOR them; on a church
 * shared blog it is the opposite, because a post you wrote is part of the list
 * everybody else is reading and leaving it out makes the board look wrong to
 * its own author.
 */
export async function listBlogFeed(limit = 100): Promise<FeedPost[]> {
  const { data, error } = await db().rpc('blog_feed', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedPost[];
}

/**
 * Write one. `church_id` is pinned to the caller's own church by the policy, so
 * sending a different one is rejected by the database rather than by this code.
 */
export async function createBlogPost(m: {
  title: string;
  body: string;
  visibility: BlogVisibility;
  audience: BlogAudienceKind;
  dsIds?: string[];
}): Promise<string> {
  const supabase = db();
  const me_id = await uid();

  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');

  const { data, error } = await supabase
    .from('blog_posts')
    .insert({
      author_id: me_id,
      church_id: me.church_id,
      title: m.title.trim(),
      body: m.body.trim(),
      visibility: m.visibility,
      audience: m.audience,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  // Named recipients only when the post is addressed to some rather than all.
  // Writing them for an 'all' post would leave rows that quietly become wrong
  // the moment the Guide is paired with somebody new.
  if (m.audience === 'selected' && m.dsIds?.length) {
    const { error: audErr } = await supabase
      .from('blog_audience')
      .insert(m.dsIds.map((ds) => ({ post_id: data.id as string, ds_id: ds })));
    if (audErr) throw new Error(audErr.message);
  }
  return data.id as string;
}

/** Publish a draft, or take a post off the front page without losing it. */
export async function setBlogVisibility(id: string, visibility: BlogVisibility): Promise<void> {
  const { error } = await db()
    .from('blog_posts')
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Delete. The audience rows and the views go with it, by foreign key cascade. */
/**
 * Hold a post at the top of the church's feed, or let it fall back into order.
 *
 * WHY A FUNCTION RATHER THAN AN UPDATE. `blog_edit` lets an author change their
 * own post and nobody else's, and that is exactly what makes pinning impossible
 * through it: the point is that a Director decides what the church leads with,
 * including on a post somebody else wrote. Widening that policy would also hand
 * leadership the power to rewrite anybody's words, which is a far larger thing
 * than choosing an order. The function touches one column and can do nothing
 * else, and it takes the church from the POST rather than from an argument, so
 * a Director of one church cannot arrange another's feed.
 */
export async function setPostPinned(id: string, pinned: boolean): Promise<void> {
  const { error } = await db().rpc('set_post_pinned', { p_post: id, p_pinned: pinned });
  if (error) throw new Error(error.message);
}

export async function deleteBlogPost(id: string): Promise<void> {
  const { error } = await db().from('blog_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Record that the caller read a post.
 *
 * Deliberately never throws. A view that fails to record is not worth showing
 * anybody an error about, and certainly not worth interrupting their reading
 * for. The function is idempotent per person, so calling it on every page load
 * is correct rather than merely harmless.
 */
export async function recordBlogView(id: string): Promise<void> {
  try {
    await db().rpc('record_blog_view', { p: id });
  } catch {
    // Counting is a convenience for the writer, never a gate for the reader.
  }
}

// ---------------------------------------------------------------------------
// Prayer.
//
// Two audiences given deliberately different things (migration 0007). A Guide
// sees their own Explorers' requests WITH the name, because praying for someone
// you walk with is the point. The congregation sees shared ones with NO name,
// served by prayer_wall() rather than by a policy — a policy grants whole rows,
// and the row carries ds_id, so "leaders see the request but not who wrote it"
// would be a promise the network tab disproves in one click.
// ---------------------------------------------------------------------------

export type PrayerStatus = 'open' | 'praying' | 'answered';

/** A request as its author or their Guide sees it: with the person attached. */
export interface PrayerRequestRow {
  id: string;
  ds_id: string;
  body: string;
  share_with_church: boolean;
  status: PrayerStatus;
  created_at: string;
  /** When a Guide said they were praying for this. Null until one does. */
  praying_at: string | null;
}

/** A request as the congregation sees it. No name, no id of the person. */
export interface WallEntry {
  id: string;
  body: string;
  status: PrayerStatus;
  created_at: string;
}

/** Raise a request. church_id is pinned by the policy, not trusted from here. */
export async function addPrayerRequest(body: string, shareWithChurch: boolean): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const text = body.trim();
  if (!text) throw new Error('Write something first.');

  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');

  const { error } = await supabase.from('prayer_requests').insert({
    ds_id: me_id,
    church_id: me.church_id,
    body: text,
    share_with_church: shareWithChurch,
  });
  if (error) throw new Error(error.message);
}

/**
 * The requests this caller may see WITH a name: their own if they are an
 * Explorer, their Explorers' if they are a Guide. A Director gets nothing here
 * and that is correct — they are shown the wall instead.
 */
export async function listPrayerRequests(): Promise<PrayerRequestRow[]> {
  const { data, error } = await db()
    .from('prayer_requests')
    .select('id, ds_id, body, share_with_church, status, created_at, praying_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PrayerRequestRow[];
}

/** The church wall. Anonymous by construction — see migration 0007. */
export async function listPrayerWall(): Promise<WallEntry[]> {
  const { data, error } = await db().rpc('prayer_wall');
  if (error) throw new Error(error.message);
  return (data ?? []) as WallEntry[];
}

/** Either side may move the status; only the author owns the words. */
export async function setPrayerStatus(id: string, status: PrayerStatus): Promise<void> {
  const { error } = await db().from('prayer_requests').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * A Guide says they are praying for this, and the Explorer is told.
 *
 * ONE CALL, AND IT DOES NOT SEND THE MESSAGE. The message is sent by a trigger
 * on the row (migration 0049), because a client that updates and then notifies
 * is a client that can forget the second half — or a second client, added
 * later, that never knew there was one. Telling the person is not a step
 * somebody remembers here; it is what changing the status means.
 *
 * Pressing it more than once is harmless: the trigger only fires on the move
 * INTO praying, so a Guide who taps twice does not send two messages. Proved
 * against the live database rather than assumed.
 */
export async function markPrayingFor(id: string): Promise<void> {
  const { error } = await db()
    .from('prayer_requests')
    .update({ status: 'praying' })
    .eq('id', id)
    .neq('status', 'praying');
  if (error) throw new Error(error.message);
}

/** Withdraw a request. Only the author may; a Guide cannot delete a confidence. */
export async function deletePrayerRequest(id: string): Promise<void> {
  const { error } = await db().from('prayer_requests').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Library.
//
// A resource is a title and a LINK (migration 0008). The app also has an
// on-device library that keeps files in the browser that added them — a real
// privacy property, and one that cannot move a file between two people. A link
// travels on its own; a blob in IndexedDB does not. Uploading files to object
// storage is a later, deliberate decision with a quota attached.
// ---------------------------------------------------------------------------

export type MaterialKind = 'link' | 'video' | 'audio' | 'pdf' | 'image';

export interface Material {
  id: string;
  church_id: string;
  added_by: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  external_url: string;
  is_published: boolean;
  created_at: string;
}

export interface MaterialShare {
  id: string;
  material_id: string;
  pairing_id: string;
  shared_by: string;
  note: string | null;
  created_at: string;
}

/**
 * Everything this caller may see. For a Guide that is their church's library;
 * for an Explorer it is only what was shared with them. Same query either way —
 * the policy decides, not this function.
 */
/**
 * The shelf as THIS person has it, which is not the same shelf for everybody.
 *
 * Anything they have taken off their own shelf is left out. Filtered here and
 * not in a policy on purpose: the row is genuinely readable by them -- the
 * church published it -- so this is a question of what to SHOW, and a policy
 * that hid a church resource from one member would be a much larger claim.
 */
export async function listMaterials(): Promise<Material[]> {
  const supabase = db();
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Material[];

  // Only this person's own rows come back: mh_read allows no others.
  const { data: hidden } = await supabase.from('material_hides').select('material_id');
  const off = new Set(((hidden ?? []) as { material_id: string }[]).map((h) => h.material_id));
  return off.size ? rows.filter((m) => !off.has(m.id)) : rows;
}

/** Add one to the church library. Guides and leaders only, by policy. */
/**
 * The record of who shared what, for church leadership.
 *
 * THERE IS NO ADDRESS IN HERE, AND THAT IS THE POINT OF THE WHOLE RECORD.
 * "Head ED, ED, and Directors can detect the activities (Except for chat) of
 * Guide and Explorer, but ... can't see the references." So a row says what was
 * done and what KIND of thing it was done with, and the address itself is not
 * hidden from this type -- it is not in the database. See migration
 * 20260917140000: the column was dropped rather than narrowed, because a column
 * that exists and is not selected today is one somebody selects next year.
 *
 * WHO SEES WHOM. A Director reads this for the Guides and Explorers of a church
 * they lead. An Executive Director, head or otherwise, reads those too, and
 * Directors as well. Nobody reads their own row. The database decides that, not
 * this file.
 *
 * Rows older than 30 days are gone. A record kept forever is a different
 * product from a record kept to answer "what happened last month".
 */
export interface LibraryActivity {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: 'dm' | 'ds' | 'admin' | 'executive';
  action: 'added' | 'shared' | 'pocketed';
  /** Where it happened: the library, or somebody's pocket of web apps. */
  source: 'library' | 'pocket';
  title: string;
  with_name: string | null;
  /** How the database judged the shape of the address. Never the address. */
  concern: 'ordinary' | 'questionable' | 'harmful';
  /** That judgement in words, written to name a kind and never a site. */
  label: string;
  /**
   * A one-way mark for the site, per church.
   *
   * WHAT IT IS FOR AND WHAT IT CANNOT DO. Two rows with the same mark are the
   * same site, so "this is the fourth time" can be said out loud. It cannot be
   * turned back into an address by anybody, including us, and the salt is per
   * church so it cannot be compared against another congregation's.
   */
  host_mark: string | null;
  /** How many times this person has been to that same site. */
  seen_before: number;
  blocked: boolean;
  occurred_at: string;
}

export async function listLibraryActivity(limit = 100): Promise<LibraryActivity[]> {
  const { data, error } = await db().rpc('library_activity_feed', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as LibraryActivity[];
}

/**
 * Turn one line of the record into a case somebody has to answer.
 *
 * ASKED FOR: "Once those inappropriate things happen, Head ED, ED, and
 * Directors can file an open case."
 *
 * IT GOES THROUGH THE REPORT PATH THAT ALREADY EXISTS rather than writing a
 * report row of its own, so who may read it, who may claim it and the record
 * that outlives the account all come free, and the church has one kind of case
 * rather than two. The detail it writes carries the label and not the address,
 * because leadership cannot see the address to put there.
 */
export async function openCaseFromActivity(activityId: string, note?: string): Promise<string> {
  const { data, error } = await db().rpc('open_case_from_activity', {
    p_activity: activityId,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Stop somebody sharing, or let them start again.
 *
 * A Director reaches Guides and Explorers; an Executive Director reaches
 * Directors. Nobody reaches sideways, upward, or themselves, and all of that
 * is enforced in the function rather than by hiding a button.
 */
export async function setLibraryBlock(personId: string, blocked: boolean, reason?: string): Promise<void> {
  const { error } = await db().rpc('set_library_block', {
    p_person: personId,
    p_blocked: blocked,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function addMaterial(m: {
  title: string;
  url: string;
  kind: MaterialKind;
  description?: string;
}): Promise<string> {
  const supabase = db();
  const me_id = await uid();

  const url = m.url.trim();
  // Checked here so the person gets a sentence rather than a constraint
  // violation. The database checks it too, which is the one that counts.
  if (!/^https?:\/\//i.test(url)) throw new Error('The address needs to start with http:// or https://');

  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');

  const { data, error } = await supabase
    .from('materials')
    .insert({
      church_id: me.church_id,
      added_by: me_id,
      title: m.title.trim(),
      description: m.description?.trim() || null,
      kind: m.kind,
      external_url: url,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** One resource somebody handed to you, and who handed it over. */
export interface SharedWithMe {
  share_id: string;
  material: Material;
  shared_by: string;
  shared_by_name: string;
  note: string | null;
  created_at: string;
}

/**
 * What OTHER PEOPLE have put in front of you.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, reported as "the shared sources for Explorer also appears
 * in its shared sources location which is weird to look and not helpful".
 *
 * The card headed "Shared with you -- from your Guide" called listMaterials(),
 * which is everything the caller may READ. For an Explorer the policy makes
 * that their own additions plus whatever was shared into their pairings, so
 * that card showed an Explorer their OWN resources under a heading saying their
 * Guide had sent them. It also showed exactly the same rows as the shelf card
 * sitting directly above it, because on that screen both were the same query.
 *
 * The share rows were there the whole time -- twenty of them across twelve
 * pairings -- and no screen had ever read one. Sharing wrote a row that nothing
 * displayed, so it looked like sharing did nothing.
 *
 * `shares_read` is `in_pairing(pairing_id)`, so the database returns only
 * pairings this person is actually in. The one thing left to do here is drop
 * what they shared themselves: a Guide and an Explorer share into the SAME
 * pairing row, so without this every share comes back to the person who sent
 * it, which is the duplicate all over again from the other end.
 *
 * `pairingId` NARROWS THE ANSWER TO ONE RELATIONSHIP, and it is not a security
 * filter -- see rule 1 at the top of this file. The database has already
 * decided which pairings this person may read. A Guide walks with up to five
 * people and their screen is one Explorer at a time, so a card headed "what
 * Esperanza has shared with you" must not quietly list what somebody else did.
 * ---------------------------------------------------------------------------
 */
/**
 * Put a resource in front of the whole church, or take it back off.
 *
 * ---------------------------------------------------------------------------
 * THE SHELF IS A DECISION NOW. `materials.is_published` defaulted to true and
 * no screen ever set it, so every resource anybody added was readable by every
 * Guide and every Director in the church -- including an Explorer's own
 * addition and another Guide's private bookmark. Nobody chose that; the column
 * was designed for a decision the app never asked anybody to make.
 *
 * Migration 20260908120000 makes the default false and refuses a promotion from
 * anybody who does not manage the church. This function is the door for the
 * people who may; for everybody else the database says no, which is the only
 * place saying it would mean anything.
 *
 * ASKS FOR THE ROW BACK, for the same reason updateLessonSeries does: an UPDATE
 * matching no rows is not an error, so without this a refusal would look
 * exactly like success and the screen would say "Saved" over nothing.
 * ---------------------------------------------------------------------------
 */
export async function setMaterialPublished(id: string, next: boolean): Promise<void> {
  const { data, error } = await db()
    .from('materials').update({ is_published: next }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('That did not save. Only a Director can put a resource on the church shelf.');
  }
}

export async function listSharedWithMe(pairingId?: string): Promise<SharedWithMe[]> {
  const supabase = db();
  const me = await uid();

  const { data, error } = await supabase
    .from('material_shares')
    .select('id, material_id, pairing_id, shared_by, note, created_at, materials(*)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as (MaterialShare & { materials: Material | null })[];
  const theirs = rows.filter((r) => r.shared_by !== me && r.materials
    && (!pairingId || r.pairing_id === pairingId));

  // NAMES ARE A SEPARATE QUERY AND A SOFT ONE. A missing name is a worse
  // sentence, not a broken card, so a failure here leaves "Someone" rather
  // than taking the whole shelf down.
  const names = new Map<string, string>();
  const ids = [...new Set(theirs.map((r) => r.shared_by))];
  if (ids.length) {
    const { data: people } = await supabase
      .from('profiles').select('id, full_name').in('id', ids);
    for (const p of (people ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name?.trim()) names.set(p.id, p.full_name.trim());
    }
  }

  return theirs.map((r) => ({
    share_id: r.id,
    material: r.materials as Material,
    shared_by: r.shared_by,
    shared_by_name: names.get(r.shared_by) ?? 'Someone',
    note: r.note,
    created_at: r.created_at,
  }));
}

/** What has been shared into one pairing. Both people in it may read this. */
export async function listShares(pairingId: string): Promise<MaterialShare[]> {
  const { data, error } = await db()
    .from('material_shares')
    .select('*')
    .eq('pairing_id', pairingId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MaterialShare[];
}

/** Share one into a pairing. Either person in it may, by policy. */
/**
 * Take a resource off the church shelf.
 *
 * WHY THIS WAS MISSING AND WHY THAT MATTERED. The library could be added to and
 * shared from, and never tidied. A link pasted with a typo, a resource that
 * turned out to be the wrong one, a video a church decided against — all of it
 * stayed on the shelf for good, because the only screen that listed them
 * offered one control and it was Share. The shelf could only ever grow.
 *
 * `materials_drop` has permitted this the whole time: the person who added it,
 * or anybody who manages the church. Only the app was missing, which is the
 * kind of gap nothing reports — no error, no refusal, just an absent button.
 *
 * SHARES GO WITH IT, and that is the database's doing rather than a loop here:
 * `material_shares.material_id` is ON DELETE CASCADE, so removing a resource
 * removes the record of it having been shared in the same statement. Nobody is
 * left with a share pointing at a row that no longer exists.
 *
 * The library ACTIVITY record is deliberately untouched. It says what somebody
 * did at the time they did it, and a record that quietly rewrites itself when
 * the thing it describes is deleted is not a record.
 */
/**
 * Correct a resource that is already on the shelf.
 *
 * THE GAP: `materials_edit` has been in the database since migration 0008 and
 * NOTHING has ever called it. The library could be added to and taken from and
 * not corrected, so a link with a typo in it, or a title nobody recognises, had
 * exactly one remedy: delete it and type the whole thing again. On the church's
 * starter links -- which are the ones most likely to need a correction, because
 * nobody chose them for this congregation -- that meant losing the entry to fix
 * a character.
 *
 * The address is validated here for the same reason `addMaterial` does it: so a
 * person gets a sentence instead of a constraint violation. The database checks
 * it too, and that is the check that counts.
 *
 * Who may do this is not decided here. The policy allows the person who added
 * it and anybody who manages the church, and refuses everyone else whatever
 * this function is asked to do.
 */
export async function updateMaterial(id: string, m: {
  title: string;
  url: string;
  kind: MaterialKind;
  description?: string;
}): Promise<void> {
  const url = m.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('The address needs to start with http:// or https://');
  if (!m.title.trim()) throw new Error('Give it a name so people know what it is.');

  const { error } = await db()
    .from('materials')
    .update({
      title: m.title.trim(),
      description: m.description?.trim() || null,
      kind: m.kind,
      external_url: url,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Take a resource off the shelf.
 *
 * YOURS IS DELETED. One somebody else added is taken off YOUR shelf and left on
 * everybody else's, because the library is one shared shelf and a Guide
 * pressing Remove on the church's link would otherwise take it from sixteen
 * other people without knowing they had.
 *
 * Leadership deletes outright, which is the moderation the policy already
 * grants them and the only way a genuinely bad link ever leaves the church.
 */
export async function deleteMaterial(id: string): Promise<'deleted' | 'hidden'> {
  const supabase = db();
  const me_id = await uid();

  const { data: row } = await supabase
    .from('materials').select('added_by').eq('id', id).maybeSingle();
  const { data: me } = await supabase
    .from('profiles').select('role').eq('id', me_id).maybeSingle();
  const mine = (row as { added_by: string } | null)?.added_by === me_id;
  const leads = ['admin', 'executive'].includes(String((me as { role?: string } | null)?.role ?? ''));

  if (mine || leads) {
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return 'deleted';
  }

  // Pressing it twice is not an error, it is the same wish expressed again.
  const { error } = await supabase
    .from('material_hides').upsert({ material_id: id, user_id: me_id });
  if (error) throw new Error(error.message);
  return 'hidden';
}

/**
 * What you have taken off your own shelf.
 *
 * WHY THIS EXISTS AT ALL. Remove is offered to everybody now, and for anybody
 * who is not the owner or leadership it hides rather than deletes. A hide with
 * no way back is a trap: one mis-tap on the church's starter link and that
 * person never sees it again, on any device, with nothing on screen to suggest
 * anything is missing. This is what makes the undo reachable tomorrow and not
 * only in the seconds after the tap.
 */
export async function listHiddenMaterials(): Promise<Material[]> {
  const supabase = db();
  // mh_read returns this person's rows and nobody else's, so no filter here.
  const { data: hidden, error: hidErr } = await supabase
    .from('material_hides').select('material_id');
  if (hidErr) throw new Error(hidErr.message);
  const ids = ((hidden ?? []) as { material_id: string }[]).map((h) => h.material_id);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('materials').select('*').in('id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Material[];
}

/** Put back something taken off your own shelf. The undo for the above. */
export async function restoreMaterial(id: string): Promise<void> {
  const me_id = await uid();
  const { error } = await db().from('material_hides')
    .delete().eq('material_id', id).eq('user_id', me_id);
  if (error) throw new Error(error.message);
}

export async function shareMaterial(materialId: string, pairingId: string, note?: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();

  const { error } = await supabase.from('material_shares').insert({
    material_id: materialId,
    pairing_id: pairingId,
    shared_by: me_id,
    note: note?.trim() || null,
  });
  if (!error) return;

  // The unique index is the one somebody will hit, so it gets words rather
  // than a constraint name.
  if (error.code === '23505') throw new Error('That is already shared with them.');

  // WHY, NOT JUST NO. Found by probing the live database: a Guide sharing with
  // their own Explorer was refused because an open case pauses sharing for that
  // pairing. All they saw was a row-level-security violation, which humanError
  // turns into "you do not have permission, ask your Director" -- wrong three
  // times over. They DO have permission; it is paused rather than withheld; and
  // it sends them to a Director, a tier this church has none of.
  //
  // So when the rules refuse, ask the rules why. The answer comes from the same
  // function the policy itself is defined in terms of, so it cannot claim
  // nothing is wrong while the insert is being refused.
  if (/row-level security/i.test(error.message)) {
    const { data: why } = await supabase.rpc('why_library_sharing_is_paused', {
      p_pairing: pairingId,
    });
    if (typeof why === 'string' && why) throw new Error(why);
  }

  throw new Error(error.message);
}

/** Unshare. Only whoever shared it may take it back. */
export async function unshareMaterial(shareId: string): Promise<void> {
  const { error } = await db().from('material_shares').delete().eq('id', shareId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// The apps a church already uses.
// ---------------------------------------------------------------------------
//
// A room of links to things that live outside this app: a Bible, a hymnal, the
// study guide. Leadership curates it; everybody in the church opens it.
//
// PLAIN HTTPS, AND THAT IS THE WHOLE TRICK. An https link to an app's own
// domain is opened by the installed app on both iOS and Android -- Universal
// Links and App Links -- and by the browser when the app is not installed. A
// custom scheme like `myapp://` does the opposite: it fails with an error page
// for everybody who has not installed it. Nothing here needs to know what a
// phone is.

export interface ChurchApp {
  id: string;
  church_id: string;
  name: string;
  blurb: string | null;
  url: string;
  icon: string | null;
  sort_order: number;
  added_by: string;
}

/** Everything in the room, in the order leadership put it. */
export async function listChurchApps(): Promise<ChurchApp[]> {
  const { data, error } = await db()
    .from('church_apps')
    .select('id, church_id, name, blurb, url, icon, sort_order, added_by')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChurchApp[];
}

/**
 * Add one. Leadership only -- the policy decides, this is just the call.
 *
 * THE ADDRESS IS CHECKED HERE AS WELL AS IN THE COLUMN, so somebody pasting a
 * `http://` or a bare domain is told what is wrong while the form is still open
 * rather than by a constraint violation after they press the button.
 */
export async function addChurchApp(app: {
  name: string; url: string; blurb?: string; icon?: string; sortOrder?: number;
}): Promise<void> {
  const me = await uid();
  const { data: profile } = await db()
    .from('profiles').select('church_id').eq('id', me).maybeSingle();
  const church = (profile as { church_id?: string } | null)?.church_id;
  if (!church) throw new Error('You are not in a church yet.');

  const url = app.url.trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error('The address has to start with https:// so it opens safely on a phone.');
  }

  const { error } = await db().from('church_apps').insert({
    church_id: church,
    name: app.name.trim(),
    blurb: app.blurb?.trim() || null,
    url,
    icon: app.icon?.trim() || null,
    sort_order: app.sortOrder ?? 0,
    added_by: me,
  });
  if (error) throw new Error(error.message);
}

/** Take one out of the room. */
export async function removeChurchApp(id: string): Promise<void> {
  const { error } = await db().from('church_apps').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Church announcements.
// ---------------------------------------------------------------------------
//
// Notices the whole church reads and only leadership writes. Kept apart from
// Community Blogs because they are different things: a blog post belongs to
// whoever wrote it and carries their name; an announcement belongs to the
// church and speaks for it.

export interface Announcement {
  id: string;
  icon: string;
  title: string;
  body: string;
  when_text: string;
  is_pinned: boolean;
  /**
   * Kept so a card can offer "take it down" to whoever wrote it, not to decide
   * who reads it. Every notice goes to the whole church; see migration 0045.
   */
  author_id: string | null;
  created_at: string;
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await db().from('announcements')
    .select('id, icon, title, body, when_text, is_pinned, author_id, created_at')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Announcement[];
}

export async function addAnnouncement(
  a: { icon?: string; title: string; body?: string; whenText?: string },
): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { error } = await supabase.from('announcements').insert({
    church_id: me.church_id,
    author_id: me_id,
    icon: (a.icon || '📌').slice(0, 8),
    title: a.title.trim(),
    body: (a.body || '').trim(),
    when_text: (a.whenText || '').trim(),
  });
  if (error) throw new Error(error.message);
}

/** Take a notice down without deleting it, so it can go back up. */
export async function pinAnnouncement(id: string, pinned: boolean): Promise<void> {
  const { error } = await db().from('announcements').update({ is_pinned: pinned }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await db().from('announcements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// A face to put to the name.
// ---------------------------------------------------------------------------
//
// The bucket is the one conversation attachments already use, under an
// avatars/ prefix with its own policies: anybody signed in may READ a face
// (a Director reading a roster needs to), and you may only ever WRITE inside
// your own folder.
//
// THE PATH IS STORED, NEVER A URL. A signed URL expires, so a stored one is a
// picture that stops working after an hour with nothing to say why.

const AVATAR_BUCKET = 'pairing-media';

/** Upload a picture and return the path to store on the profile. */
export async function uploadAvatar(chosen: File): Promise<string> {
  // The same treatment as a conversation photo, and for the same two reasons:
  // an avatar is shown at most 72 pixels across, and a picture somebody takes
  // of themselves is the one most likely to be carrying their home
  // coordinates.
  const file = await shrinkImage(chosen);
  if (!file.type.startsWith('image/')) throw new Error('That is not a picture.');
  if (file.size > 5 * 1024 * 1024) throw new Error('That picture is over 5 MB. Try a smaller one.');
  const me = await uid();
  // The extension is taken from the MIME type, never from the filename, which
  // is attacker-controlled text that happens to be shown to people.
  const ext = file.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const path = `avatars/${me}/${Date.now()}.${ext}`;
  const { error } = await db().storage.from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);

  // A new picture used to JOIN the old one rather than replace it. The name
  // carries a timestamp, so `upsert` never had an existing key to overwrite,
  // and every profile picture anybody had ever set was still stored and still
  // readable by their church. One member was keeping three.
  //
  // Cleared here, after the upload has succeeded, so a failed upload can never
  // cost somebody the picture they already had. Failing to tidy is not worth
  // failing the upload over, so this never throws: the caller's picture is
  // changed either way, and the worst case is the leftover we already had.
  await removeOtherAvatars(me, path);

  return path;
}

/**
 * Delete a person's earlier avatars, keeping the one just uploaded.
 *
 * Deleting through the Storage API rather than the `storage.objects` table is
 * not a preference. Supabase refuses direct deletes from that table, because
 * the row is only metadata — removing it strands the image itself in object
 * storage, unreachable and undeletable, since every route to a file goes
 * through the metadata that was just thrown away.
 */
async function removeOtherAvatars(person: string, keep: string): Promise<void> {
  try {
    const { data, error } = await db().storage.from(AVATAR_BUCKET).list(`avatars/${person}`);
    if (error || !data) return;
    const stale = data
      .map((f) => `avatars/${person}/${f.name}`)
      .filter((p) => p !== keep);
    if (stale.length) await db().storage.from(AVATAR_BUCKET).remove(stale);
  } catch {
    // Tidying is best-effort by design. See above.
  }
}

/**
 * The person you walk with, so they can be seen rather than only named.
 *
 * THE ASK: "Explorer must see the Guide's profile and image so that the
 * Explorer is aware the Guide is not a robot but a real person."
 *
 * The Explorer's screen showed the Guide's NAME and nothing else. Everything
 * else about that screen says the journey is a relationship; the one place the
 * other person appeared was a line of text, which is what a system sounds like
 * rather than somebody who agreed to walk with you.
 *
 * THE COLUMN LIST IS THE ACCESS CONTROL, and it is deliberately short. The
 * policy (profiles_read_paired, migration 0001) would return the whole row: an
 * Explorer may read their Guide's profile and the Guide may read theirs. That
 * is the right rule and it is not a reason to put every field on a screen.
 * Named here are only things a person chose to say about themselves. Not their
 * birthday, not their contact details, nothing the church recorded ABOUT them
 * rather than something they wrote.
 *
 * Returns null rather than throwing when there is nobody: an Explorer waiting
 * to be paired is an ordinary state, not an error.
 */
export async function pairedProfile(id: string | null | undefined): Promise<Profile | null> {
  if (!id) return null;
  const { data, error } = await db()
    .from('profiles')
    .select('id, role, full_name, avatar, photo_path, topics_of_interest, city_of_residence, work_industry, preferred_language')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

/**
 * A URL that will load for the next hour, or '' when there is no picture.
 * Called at render time rather than stored, for the reason above.
 */
export async function avatarUrl(path: string | null | undefined): Promise<string> {
  if (!path) return '';
  const { data } = await db().storage.from(AVATAR_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}

// ---------------------------------------------------------------------------
// Meetings, for the two people in a pairing.
// ---------------------------------------------------------------------------
//
// THE TABLE HAS BEEN IN THE LIVE DATABASE SINCE MIGRATION 0009 AND NOTHING EVER
// CALLED IT. The tutorial has had a booking card the whole time; the live app
// shipped with a private checklist instead, which is a different thing
// answering a different need. A Guide could remind themselves to call somebody
// and could not agree a time with them.
//
// Nothing new is needed in the database. The policies were already written for
// exactly this: both people in the pairing may read, create, edit and cancel,
// and nobody else can see any of it. `in_pairing` is what enforces that, so
// the Explorer is a full participant here rather than a spectator.

export type { MeetingMode };
export type MeetingStatus = 'proposed' | 'confirmed' | 'declined' | 'cancelled' | 'done';

export interface Meeting {
  id: string;
  pairing_id: string;
  title: string;
  starts_at: string;
  mode: MeetingMode;
  location: string | null;
  notes: string | null;
  status: MeetingStatus;
  created_by: string;
  /**
   * Who answered it, and what they said when they did.
   *
   * DECLINED AND CANCELLED ARE DIFFERENT THINGS and both are kept. Declined is
   * "I cannot make the time you proposed"; cancelled is "the time we agreed is
   * off". Collapsing them loses the one fact the other person actually wants,
   * which is whether there was ever an agreement to break.
   *
   * `answer_name` is the name as it was at the moment of answering, so the
   * record still reads properly after an account is deleted.
   */
  answered_by: string | null;
  answered_at: string | null;
  answer_name: string | null;
  answer_note: string | null;
}

/** Everything arranged for this pairing, soonest first. */
export async function listMeetings(pairingId: string): Promise<Meeting[]> {
  const { data, error } = await db()
    .from('meetings')
    .select('id, pairing_id, title, starts_at, mode, location, notes, status, created_by, answered_by, answered_at, answer_name, answer_note')
    .eq('pairing_id', pairingId)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Meeting[];
}

/**
 * Propose a time. Either person may, which is the point: an Explorer who can
 * only ever be summoned is not walking alongside anybody.
 *
 * church_id is read from the caller's own profile rather than passed in, because
 * the insert policy checks it against my_church_id() and a value from the
 * browser would only ever be a way to get it wrong.
 */
export async function scheduleMeeting(
  pairingId: string,
  meeting: { title: string; startsAt: string; mode: MeetingMode; location?: string; notes?: string },
): Promise<void> {
  const me = await uid();
  const { data: profile } = await db()
    .from('profiles').select('church_id').eq('id', me).maybeSingle();
  const church = (profile as { church_id?: string } | null)?.church_id;
  if (!church) throw new Error('You are not in a church yet.');

  const { error } = await db().from('meetings').insert({
    pairing_id: pairingId,
    church_id: church,
    title: meeting.title.trim() || 'Study time',
    starts_at: meeting.startsAt,
    mode: meeting.mode,
    // KEPT FOR BOTH KINDS OF MEETING, which is what the column was always for:
    // 0009 documents it as "a place for in person, or a joining address for
    // online". This line said otherwise and threw the value away whenever the
    // meeting was online, so an online meeting could never carry the one thing
    // it needs — the link to join it. Somebody arranged a Zoom call and then
    // had to send the link separately, in a message, which is exactly the
    // errand arranging it on a shared card was meant to remove.
    //
    // An empty string is still not a place. Stored as null so the join button,
    // the map link and the "where" line can all simply test for absence.
    location: (meeting.location || '').trim() || null,
    notes: (meeting.notes || '').trim() || null,
    created_by: me,
  });
  if (error) throw new Error(error.message);
}

/**
 * Every meeting ahead of this caller, across all their pairings.
 *
 * ONE QUERY, NO PAIRING FILTER, and that is not laziness. The policy on
 * `meetings` is in_pairing(pairing_id), so an unfiltered read already returns
 * exactly the meetings this person is part of and nothing else. Adding a
 * client-side filter would protect nobody and would go wrong the first time
 * somebody forgot it.
 */
export async function myUpcomingMeetings(limit = 5): Promise<Meeting[]> {
  const { data, error } = await db()
    .from('meetings')
    .select('id, pairing_id, title, starts_at, mode, location, notes, status, created_by, answered_by, answered_at, answer_name, answer_note')
    // ANSWERED ONES STAY ON THE LIST. Filtering cancelled out is what made a
    // refusal look like the card silently disappearing: the person who arranged
    // their afternoon around it saw nothing at all. They are drawn differently
    // and they are still there.
    // An hour's grace, so something starting right now is still "ahead".
    .gte('starts_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Meeting[];
}

/**
 * Answer a proposed time, or call off one that was agreed.
 *
 * ASKED FOR: "If there is a record for acceptance in appointment, there must be
 * a record for cancel too so that Guides and Explorers are informed who accepted
 * and who declined."
 *
 * WHAT WAS WRONG, AND IT WAS WORSE THAN A MISSING BUTTON. Confirming wrote
 * `status = 'confirmed'` and cancelling wrote `status = 'cancelled'`, and the
 * list then filtered cancelled ones out. So a Guide who proposed a time and had
 * it called off did not see a refusal: they saw the card VANISH, which reads as
 * a bug rather than an answer. Nobody was told anything either way.
 *
 * ONE FUNCTION IN THE DATABASE INSTEAD OF THREE TABLE WRITES, because the
 * record and the telling have to happen together or neither is reliable. It
 * writes who answered, their name as it was at the time, when, and why; it
 * notifies the other person; and it refuses the two answers that mean nothing:
 * accepting your own proposal, and answering something already answered.
 */
export async function answerMeeting(
  id: string,
  answer: 'confirmed' | 'declined' | 'cancelled',
  note?: string,
): Promise<void> {
  const { error } = await db().rpc('answer_meeting', {
    p_meeting: id,
    p_answer: answer,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

/** Confirm a proposed time. The other person agreeing is what makes it real. */
export async function confirmMeeting(id: string): Promise<void> {
  await answerMeeting(id, 'confirmed');
}

/** Say no to a proposed time, with a reason if there is one worth giving. */
export async function declineMeeting(id: string, note?: string): Promise<void> {
  await answerMeeting(id, 'declined', note);
}

/**
 * Cancel rather than delete. Somebody who arranged their afternoon around this
 * should see that it was called off, not find that it silently never existed.
 */
export async function cancelMeeting(id: string, note?: string): Promise<void> {
  await answerMeeting(id, 'cancelled', note);
}

/**
 * Meetings across the church, as a leader may know them: when, online or in
 * person, and what state they are in. No title, no location, no notes.
 *
 * A separate function rather than a filtered read of `meetings`, because a
 * policy grants whole ROWS and a row carries the notes. "Leaders see that a
 * meeting is happening, not what was said in it" has to be true of the result
 * that crosses the wire, not of the screen that renders it.
 */
export interface ChurchMeeting {
  starts_at: string;
  mode: 'online' | 'in_person';
  status: 'proposed' | 'confirmed' | 'cancelled' | 'done';
}

export async function listChurchMeetings(): Promise<ChurchMeeting[]> {
  const { data, error } = await db().rpc('church_meeting_summary');
  if (error) throw new Error(error.message);
  return (data ?? []) as ChurchMeeting[];
}

// ---------------------------------------------------------------------------
// Recommendations, a Guide's private tools, and lesson series.
// ---------------------------------------------------------------------------

export interface Recommendation {
  id: string; church_id: string; dm_id: string;
  full_name: string; email: string; note: string | null;
  status: 'pending' | 'invited' | 'declined';
  decided_by: string | null; decided_at: string | null; created_at: string;
}

export async function listRecommendations(): Promise<Recommendation[]> {
  const { data, error } = await db().from('recommendations').select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Recommendation[];
}

/** A Guide puts a name forward. They cannot invite; a Director decides. */
export async function recommendSomeone(m: { full_name: string; email: string; note?: string }): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { error } = await supabase.from('recommendations').insert({
    church_id: me.church_id, dm_id: me_id,
    full_name: m.full_name.trim(), email: m.email.trim().toLowerCase(),
    note: m.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function decideRecommendation(
  id: string,
  status: 'invited' | 'declined',
  /** The row being decided. Required to invite; a decline needs only the id. */
  row?: Recommendation,
): Promise<void> {
  const supabase = db();
  const me_id = await uid();

  // "INVITE THEM" HAS TO ACTUALLY INVITE THEM.
  //
  // It used to set this column and stop. The row then read INVITED, the Guide
  // who put the name forward saw INVITED, and NOTHING HAD BEEN SENT: no
  // invitation row, no account, no email. Reported as "does it automatically
  // send a letter? How come there was no confirm in my mailbox" -- and the
  // answer was that there was nothing to confirm. Checked against the live
  // database: the only invitation on file for that address had been created
  // sixteen days earlier and had expired two days before the button was
  // pressed.
  //
  // The invitation is sent FIRST and the status written only if it succeeded,
  // so a refusal -- the hourly email allowance is the common one -- leaves the
  // row pending and the Director able to try again. Writing the status first
  // would strand the person permanently behind a label saying they had been
  // dealt with.
  //
  // recommended_by carries the Guide who put the name forward, which is what
  // pairs the two of them automatically once the person is approved.
  if (status === 'invited') {
    if (!row) throw new Error('Nothing to invite.');
    await inviteMember({
      email: row.email,
      role: 'ds',
      fullName: row.full_name,
      recommendedBy: row.dm_id,
    });
  }

  const { error } = await supabase.from('recommendations')
    .update({ status, decided_by: me_id, decided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export interface SeekerNote {
  id: string; pairing_id: string; author_id: string; body: string; created_at: string;
}

/** Private to the author. A leader cannot read these — see migration 0011. */
export async function listNotes(pairingId: string): Promise<SeekerNote[]> {
  const { data, error } = await db().from('seeker_notes').select('*')
    .eq('pairing_id', pairingId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SeekerNote[];
}

export async function addNote(pairingId: string, body: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('seeker_notes')
    .insert({ pairing_id: pairingId, author_id: me_id, body: body.trim() });
  if (error) throw new Error(error.message);
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await db().from('seeker_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface FollowUp {
  id: string; pairing_id: string; owner_id: string;
  title: string; due_on: string | null; done_at: string | null; created_at: string;
}

export async function listFollowUps(): Promise<FollowUp[]> {
  const { data, error } = await db().from('follow_ups').select('*')
    .order('due_on', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FollowUp[];
}

export async function addFollowUp(pairingId: string, title: string, dueOn?: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('follow_ups')
    .insert({ pairing_id: pairingId, owner_id: me_id, title: title.trim(), due_on: dueOn || null });
  if (error) throw new Error(error.message);
}

export async function toggleFollowUp(id: string, done: boolean): Promise<void> {
  const { error } = await db().from('follow_ups')
    .update({ done_at: done ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteFollowUp(id: string): Promise<void> {
  const { error } = await db().from('follow_ups').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface LessonSeries {
  id: string; church_id: string; title: string;
  description: string | null; topic: string; is_published: boolean; created_at: string;
  /** Who wrote it. Null on series made before Guides could write their own. */
  author_id: string | null;
  /** The shared study this replaces, for its author alone. See migration 20260904090000. */
  copied_from: string | null;
  /** A copy that exists only to say its author does not want the template. */
  is_hidden: boolean;
}

/** One study inside a series. The body is the lesson; files hang off it. */
export interface Lesson {
  id: string; series_id: string | null; church_id: string; author_id: string;
  title: string; body: string; position: number; created_at: string;
}

export interface LessonFile {
  id: string; lesson_id: string; name: string; path: string;
  mime: string | null; size_bytes: number | null; added_by: string;
}

export interface LessonAssignment {
  id: string; pairing_id: string; series_id: string;
  assigned_by: string; completed_at: string | null; created_at: string;
}

/**
 * The studies this person should see, which is not the same list for everybody.
 *
 * A shared study is a TEMPLATE. Once somebody has taken their own copy of one,
 * they should see theirs and not the original, or the shelf shows them the same
 * study twice and only one of them answers to their edits. And a template they
 * have put away should not come back.
 *
 * Filtered here rather than in a policy on purpose. The rows are all genuinely
 * readable by this person -- the original is published to the church and the
 * copy is their own -- so this is a question of what to SHOW, and a policy that
 * hid a published study from one member would be a much larger claim than the
 * one being made.
 */
export async function listLessonSeries(): Promise<LessonSeries[]> {
  const { data, error } = await db().from('lesson_series').select('*')
    .order('topic', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LessonSeries[];
  const me_id = await uid();

  const replaced = new Set(
    rows.filter((r) => r.author_id === me_id && r.copied_from).map((r) => r.copied_from as string),
  );
  return rows.filter((r) => !r.is_hidden && !replaced.has(r.id));
}

/**
 * The id of THIS PERSON'S version of a study, making one if they have none.
 *
 * The whole of "edit it privately" is this function. A study somebody wrote is
 * theirs and is returned unchanged. A shared study is copied -- the series and
 * every lesson in it, positions kept -- and from then on their edits land on
 * their copy while the original stays exactly as the church published it.
 *
 * The copy is not published. It is visible to its author through ls_read and to
 * nobody else, which is what "privately" has to mean to be worth saying.
 */
export async function myVersionOf(seriesId: string): Promise<string> {
  const supabase = db();
  const me_id = await uid();

  const { data: series, error } = await supabase
    .from('lesson_series').select('*').eq('id', seriesId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!series) throw new Error('That study is no longer there.');
  const original = series as LessonSeries;
  if (original.author_id === me_id) return original.id;

  // Already taken one? The unique index makes this at most one row, so a second
  // press cannot leave somebody with two versions and no way to tell them apart.
  const { data: had } = await supabase
    .from('lesson_series').select('id')
    .eq('copied_from', seriesId).eq('author_id', me_id).maybeSingle();
  if (had) return (had as { id: string }).id;

  const { data: made, error: makeErr } = await supabase.from('lesson_series').insert({
    church_id: original.church_id,
    title: original.title,
    topic: original.topic,
    description: original.description,
    author_id: me_id,
    is_published: false,
    copied_from: original.id,
  }).select('id').single();
  if (makeErr) throw new Error(makeErr.message);
  const mineId = (made as { id: string }).id;

  // The lessons come with it, or the copy is an empty shelf with a familiar
  // name on it. Positions are kept so "the third study" is still the third.
  const { data: lessons } = await supabase
    .from('lessons').select('title, body, position')
    .eq('series_id', seriesId).order('position', { ascending: true });
  const rows = (lessons ?? []) as { title: string; body: string; position: number }[];
  if (rows.length) {
    const { error: copyErr } = await supabase.from('lessons').insert(
      rows.map((l) => ({
        series_id: mineId,
        church_id: original.church_id,
        author_id: me_id,
        title: l.title,
        body: l.body,
        position: l.position,
      })),
    );
    // A copy with no lessons is worse than none: it looks finished and is not.
    if (copyErr) {
      await supabase.from('lesson_series').delete().eq('id', mineId);
      throw new Error(copyErr.message);
    }
  }
  return mineId;
}

export async function addLessonSeries(
  m: { title: string; topic: string; description?: string; publish?: boolean },
): Promise<string> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { data, error } = await supabase.from('lesson_series').insert({
    church_id: me.church_id, title: m.title.trim(),
    topic: m.topic.trim() || 'General', description: m.description?.trim() || null,
    // Stamped so a Guide owns what they wrote. The write policy checks it
    // against the caller, so this cannot be used to write as somebody else.
    author_id: me_id,
    is_published: m.publish ?? false,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Publish or unpublish. Unpublished is visible to its author and Directors. */
export async function setSeriesPublished(id: string, published: boolean): Promise<void> {
  const { error } = await db().from('lesson_series').update({ is_published: published }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Rename a series, or move it to another topic.
 *
 * WHY THIS WAS MISSING AND WHY THAT MATTERED. A Guide could write a series,
 * publish it and delete it, but never correct it. A typo in a title, or a
 * series filed under the wrong topic, could only be fixed by deleting the whole
 * thing and writing every study inside it again — so in practice it was not
 * fixed, and the shelf carried the mistake.
 *
 * The database has allowed this the whole time: `ls_edit` permits an UPDATE
 * from the author or anybody who manages the church, and pins `church_id` to
 * the caller's own. Only the app was missing. Nothing here loosens that — the
 * policy still decides, and a Guide editing somebody else's series gets no rows
 * back rather than a change.
 */
/**
 * Rename a study. Yours if it is yours, your copy of it if it is not.
 *
 * Returns the id that was actually written, which the screen needs: after the
 * first edit of a shared study the person is looking at a different row, and a
 * screen still pointing at the original would show their change vanish.
 */
export async function updateLessonSeries(
  id: string, m: { title: string; topic: string; description?: string | null },
): Promise<string> {
  const title = m.title.trim();
  if (!title) throw new Error('A series needs a title.');
  const mineId = await myVersionOf(id);
  // ASK FOR THE ROW BACK, AND SAY SO IF NOTHING CHANGED.
  //
  // Without `.select()`, an UPDATE that matches NO ROWS is not an error --
  // PostgREST returns success and the screen says "Saved". So any policy that
  // filters the row out produces the worst possible outcome: a person presses
  // Save, sees no error, and nothing has changed. From their side that is not
  // a permission problem, it is "this app does not work", and there is nothing
  // on screen for them to report.
  //
  // Reported as exactly that: "Explorers can't edit any Lesson studies." The
  // database turned out to allow it for all forty-four of them, which is
  // precisely why a silent no-op is so expensive to diagnose -- it looks
  // identical whether the cause is permissions, a stale build, or a bug here.
  // ONLY WRITE THE LINE WHEN A LINE WAS OFFERED. This wrote
  // `description: null` whenever the caller left it out, and the Rename form
  // left it out -- so renaming one of the seeded series silently erased the
  // sentence underneath it, and nothing on screen said a word about it.
  const patch: Record<string, string | null> = {
    title,
    topic: m.topic.trim() || 'General',
  };
  if (m.description !== undefined) patch.description = m.description?.trim() || null;

  const { data, error } = await db().from('lesson_series').update(patch)
    .eq('id', mineId).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('That did not save. Close the series, open it again, and retry.');
  }
  return mineId;
}

/**
 * Put a study away.
 *
 * YOURS IS DELETED. A shared one is not, because it is not yours to take off
 * seventeen other people's shelves -- it is hidden for you, by way of a copy
 * that holds nothing but that fact. The church's version stays exactly where it
 * was for everybody who has not made the same choice.
 */
export async function deleteLessonSeries(id: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();

  const { data: series } = await supabase
    .from('lesson_series').select('id, church_id, title, topic, author_id').eq('id', id).maybeSingle();
  const row = series as { id: string; church_id: string; title: string; topic: string; author_id: string | null } | null;
  if (!row) return;

  if (row.author_id === me_id) {
    const { error } = await supabase.from('lesson_series').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  // Already have a copy of it? Then hiding it is a flag on the copy rather than
  // a second row, or the unique index would refuse the insert.
  const { data: had } = await supabase
    .from('lesson_series').select('id').eq('copied_from', id).eq('author_id', me_id).maybeSingle();
  if (had) {
    const { error } = await supabase.from('lesson_series')
      .update({ is_hidden: true }).eq('id', (had as { id: string }).id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('lesson_series').insert({
    church_id: row.church_id,
    title: row.title,
    topic: row.topic,
    author_id: me_id,
    is_published: false,
    copied_from: row.id,
    is_hidden: true,
  });
  if (error) throw new Error(error.message);
}

/** Put back a study that was hidden, which is the whole undo for the above. */
export async function restoreLessonSeries(originalId: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { data: had } = await supabase
    .from('lesson_series').select('id').eq('copied_from', originalId)
    .eq('author_id', me_id).eq('is_hidden', true).maybeSingle();
  if (!had) return;
  const { error } = await supabase.from('lesson_series').delete().eq('id', (had as { id: string }).id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Feedback, which for months went to the sender's own browser and nowhere else.
// ---------------------------------------------------------------------------

export interface Feedback {
  id: string;
  category: string;
  message: string;
  contact: string | null;
  page: string | null;
  build: string | null;
  created_at: string;
  handled_at: string | null;
  author_id: string | null;
  author_name?: string | null;
}

/**
 * What people have sent, newest first.
 *
 * Leadership sees everything; anybody else sees only what they sent
 * themselves, which is what the policy says and is not re-decided here.
 */
export async function listFeedback(): Promise<Feedback[]> {
  const { data, error } = await db()
    .from('feedback')
    .select('id, category, message, contact, page, build, created_at, handled_at, author_id, profiles!feedback_author_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    category: String(r.category),
    message: String(r.message),
    contact: (r.contact as string) ?? null,
    page: (r.page as string) ?? null,
    build: (r.build as string) ?? null,
    created_at: String(r.created_at),
    handled_at: (r.handled_at as string) ?? null,
    author_id: (r.author_id as string) ?? null,
    author_name: (r.profiles as { full_name?: string } | null)?.full_name ?? null,
  }));
}

/**
 * Mark one as dealt with, so the list is a queue rather than a wall.
 *
 * There is deliberately no way to delete feedback. A message a leader can
 * quietly remove is a message nobody can rely on having been heard.
 */
export async function markFeedbackHandled(id: string, handled: boolean): Promise<void> {
  const me_id = await uid();
  const { error } = await db().from('feedback').update({
    handled_at: handled ? new Date().toISOString() : null,
    handled_by: handled ? me_id : null,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Lessons inside a series, and the handouts attached to them.
// ---------------------------------------------------------------------------

export async function listLessons(seriesId: string): Promise<Lesson[]> {
  const { data, error } = await db().from('lessons')
    .select('id, series_id, church_id, author_id, title, body, position, created_at')
    .eq('series_id', seriesId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lesson[];
}

/**
 * Add a study to a series. To YOUR version of it, if the series is shared.
 *
 * Without this the series could be edited privately and added to universally,
 * which is the worst of both: somebody tidying their own copy would post a new
 * study into seventeen other people's shelves without being told they had.
 */
export async function addLesson(
  seriesId: string, m: { title: string; body: string; position?: number },
): Promise<string> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const mineSeries = await myVersionOf(seriesId);
  const { data, error } = await supabase.from('lessons').insert({
    series_id: mineSeries, church_id: me.church_id, author_id: me_id,
    title: m.title.trim(), body: m.body.trim(), position: m.position ?? 0,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/**
 * Correct a study that is already written.
 *
 * Same gap as `updateLessonSeries` above, one level down, and the one people
 * hit first: the study itself is the thing being taught from, so it is the
 * thing most likely to need a word changed the night before it is used. Delete
 * and rewrite loses every handout attached to it, because the files hang off
 * the lesson row.
 *
 * `lessons_edit` has always permitted this for the author and for anybody
 * managing the church. The empty-title guard is here rather than in the
 * component so it holds for every caller.
 */
/**
 * The lesson in THIS PERSON'S version of whatever series a lesson belongs to.
 *
 * Matched by `position`, which is the only thing that survives a copy and means
 * the same on both sides: the third study is still the third study. Ids cannot
 * be used because the copy's rows are new rows, and titles cannot because the
 * point of the exercise is that somebody is about to change one.
 *
 * Returns the id to write, having made the copy if this is the first edit.
 */
async function myVersionOfLesson(lessonId: string): Promise<string> {
  const supabase = db();
  const me_id = await uid();

  const { data: lesson, error } = await supabase
    .from('lessons').select('id, series_id, position, author_id').eq('id', lessonId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lesson) throw new Error('That study is no longer there.');
  const row = lesson as { id: string; series_id: string | null; position: number; author_id: string };
  if (row.author_id === me_id) return row.id;

  // A lesson with no series cannot be copied anywhere sensible, and one that is
  // not yours is then not yours to change.
  if (!row.series_id) throw new Error('That study belongs to somebody else.');

  const mineSeries = await myVersionOf(row.series_id);
  const { data: twin } = await supabase
    .from('lessons').select('id').eq('series_id', mineSeries).eq('position', row.position).maybeSingle();
  if (!twin) throw new Error('That study could not be copied. Try opening the series again.');
  return (twin as { id: string }).id;
}

/** Correct a study. Yours, or your copy of a shared one. */
export async function updateLesson(
  id: string, m: { title: string; body: string },
): Promise<void> {
  const title = m.title.trim();
  if (!title) throw new Error('A study needs a title.');
  const mineId = await myVersionOfLesson(id);
  // Same reason as updateLessonSeries: a zero-row update is a silent success,
  // and a silent success is indistinguishable from a broken app.
  const { data, error } = await db().from('lessons').update({
    title, body: m.body.trim(),
  }).eq('id', mineId).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('That did not save. Close the series, open it again, and retry.');
  }
}

/**
 * Remove a study from a series.
 *
 * On a shared series this copies it first and deletes from the copy, so the
 * church's version keeps all of its studies and this person's version does not.
 */
export async function deleteLesson(id: string): Promise<void> {
  const mineId = await myVersionOfLesson(id);
  const { error } = await db().from('lessons').delete().eq('id', mineId);
  if (error) throw new Error(error.message);
}

/** Every handout on these lessons, keyed by lesson id. */
export async function listLessonFiles(lessonIds: string[]): Promise<Record<string, LessonFile[]>> {
  if (lessonIds.length === 0) return {};
  const { data, error } = await db().from('lesson_files')
    .select('id, lesson_id, name, path, mime, size_bytes, added_by')
    .in('lesson_id', lessonIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const out: Record<string, LessonFile[]> = {};
  for (const row of (data ?? []) as LessonFile[]) (out[row.lesson_id] ??= []).push(row);
  return out;
}

export async function attachLessonFile(lessonId: string, file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB.');
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  // The stored name is what a reader sees; the PATH never contains it, because
  // a filename is text somebody chose and a path is used to build URLs.
  const ext = (file.name.split('.').pop() || '').replace(/[^a-z0-9]/gi, '').slice(0, 6);
  const path = `lessons/${me_id}/${lessonId}-${Date.now()}${ext ? '.' + ext : ''}`;
  const up = await supabase.storage.from('pairing-media')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase.from('lesson_files').insert({
    lesson_id: lessonId, church_id: me.church_id, added_by: me_id,
    name: file.name.slice(0, 200), path, mime: file.type || null, size_bytes: file.size,
  });
  if (error) throw new Error(error.message);
}

export async function lessonFileUrl(path: string): Promise<string> {
  const { data } = await db().storage.from('pairing-media').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}

export async function removeLessonFile(id: string): Promise<void> {
  const { error } = await db().from('lesson_files').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listAssignments(): Promise<LessonAssignment[]> {
  const { data, error } = await db().from('lesson_assignments').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as LessonAssignment[];
}

export async function assignSeries(pairingId: string, seriesId: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('lesson_assignments')
    .insert({ pairing_id: pairingId, series_id: seriesId, assigned_by: me_id });
  if (error) throw new Error(error.code === '23505' ? 'Already assigned.' : error.message);
}

export async function completeAssignment(id: string, done: boolean): Promise<void> {
  const { error } = await db().from('lesson_assignments')
    .update({ completed_at: done ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Reading, and how far through somebody is.
// ---------------------------------------------------------------------------
//
// A read is recorded by the person doing the reading and by nobody else. The
// database enforces that (`lr_write` checks `user_id = auth.uid()`), so a
// Director cannot tick lessons off on an Explorer's behalf even by calling the
// API directly -- which is the only reason the number on the bar means
// anything.

/** How far through a set of lessons somebody has got. */
export interface Reading {
  done: number;
  total: number;
}

/**
 * Every lesson, as an id and the series it sits in.
 *
 * ONE QUERY, NOT ONE PER SERIES. A Director opening a member's card wants the
 * denominator for the whole shelf; asking `listLessons` per series turned that
 * into a dozen round trips on a phone connection.
 */
export async function listLessonIndex(): Promise<{ id: string; series_id: string }[]> {
  const { data, error } = await db().from('lessons')
    .select('id, series_id')
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; series_id: string }[];
}

/**
 * The lessons a member has marked as read.
 *
 * Returns an empty list rather than throwing when the reader is not entitled to
 * see them: `lr_read` simply matches no rows, which is a legitimate answer and
 * not an error. The caller draws "nothing read yet", which is also what a
 * genuinely empty history looks like -- and the two being indistinguishable is
 * the point, because the alternative leaks who has a Guide.
 */
export async function listReadsFor(userId: string): Promise<string[]> {
  const { data, error } = await db().from('lesson_reads')
    .select('lesson_id')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { lesson_id: string }).lesson_id);
}

/** What I have read. */
export async function listMyReads(): Promise<string[]> {
  return listReadsFor(await uid());
}

export async function markLessonRead(lessonId: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('lesson_reads')
    .insert({ lesson_id: lessonId, user_id: me_id });
  // MARKING SOMETHING TWICE IS NOT A MISTAKE WORTH REPORTING. Two taps, or a
  // tap on a phone that had already saved it, both land here; the row exists
  // either way, which is what the person asked for.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function unmarkLessonRead(lessonId: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('lesson_reads')
    .delete().eq('lesson_id', lessonId).eq('user_id', me_id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Lessons and notifications.
// ---------------------------------------------------------------------------

// Lesson and addLesson used to be declared here as well, unused and
// church-wide. They are gone: the series-scoped pair above replaced them, and
// two functions with the same name doing nearly the same thing is how the
// wrong one gets called later.

export interface AppNotification {
  id: string; user_id: string; type: string;
  title: string; body: string; read_at: string | null; created_at: string;
}

/** Only ever this caller's own — enforced by policy, not by this query. */
export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await db().from('notifications').select('*')
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await db().from('notifications')
    .update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await db().from('notifications')
    .update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Safeguarding
// ---------------------------------------------------------------------------

/** The five reasons offered. Kept in step with the database's CHECK constraint. */
export type ReportReason = 'inappropriate' | 'harassment' | 'unsafe' | 'spam' | 'other';

export interface LiveReport {
  id: string;
  reporter_id: string;
  subject_id: string;
  pairing_id: string | null;
  reason: ReportReason;
  detail: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  outcome: string | null;
  /** Set when the report is about a post on a guild board. */
  guild_post_id: string | null;
  /** What that post said when it was reported, kept even if the post is gone. */
  guild_post_body: string | null;
}

/**
 * Raise a report about another member.
 *
 * Through a definer function rather than an insert, and the reason is worth
 * stating: the church is taken from the caller's own profile, not from an
 * argument. A browser that could name its own church_id could file a report
 * into a church it does not belong to. The function also refuses a subject
 * outside your church — which, done as an error rather than a silent success,
 * would otherwise be a way to discover that a stranger exists.
 *
 * The person reported is NOT notified. Every Director of the church is.
 */
export async function reportPerson(args: {
  subjectId: string;
  reason: ReportReason;
  detail?: string;
  pairingId?: string;
  /** Evidence, attached after the report exists. See attachReportEvidence. */
  evidence?: File[];
}): Promise<string> {
  const { data, error } = await db().rpc('report_person', {
    p_subject: args.subjectId,
    p_reason: args.reason,
    p_detail: args.detail ?? null,
    p_pairing: args.pairingId ?? null,
  });
  if (error) throw new Error(error.message);
  const reportId = String(data ?? '');

  // THE REPORT IS FILED FIRST AND THE FILES FOLLOW, and if a file fails the
  // report still stands. The alternative — upload everything, then file —
  // means a dropped connection halfway through loses the report itself, and a
  // safeguarding report that vanished because a photo did not upload is the
  // worst possible trade. Whatever arrives is attached; the Director sees the
  // written account either way.
  if (reportId && args.evidence?.length) {
    for (const file of args.evidence) {
      try { await attachReportEvidence(reportId, file); } catch { /* the report stands */ }
    }
  }
  return reportId;
}

/**
 * Attach one file to a report you raised.
 *
 * THE PATH IS `reports/<you>/…` AND THAT IS LOAD-BEARING. The storage policy
 * only lets somebody write into their own folder, and the definer function
 * refuses a row whose path is not in the caller's folder — so a reporter cannot
 * attach a row pointing at somebody else's object and read it back through a
 * Director's screen. Two checks for one rule, on purpose: the storage one stops
 * the upload, the database one stops the reference.
 */
export async function attachReportEvidence(reportId: string, file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB.');
  const supabase = db();
  const me_id = await uid();
  const ext = (file.name.split('.').pop() || '').replace(/[^a-z0-9]/gi, '').slice(0, 6);
  const path = `reports/${me_id}/${reportId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? '.' + ext : ''}`;
  const up = await supabase.storage.from('pairing-media')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase.rpc('attach_report_evidence', {
    p_report: reportId,
    p_name: file.name.slice(0, 200),
    p_path: path,
    p_mime: file.type || null,
    p_size: file.size,
  });
  if (error) throw new Error(error.message);
}

export interface ReportFile {
  id: string;
  report_id: string;
  name: string;
  path: string;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
}

/** The evidence on a church's reports, keyed by report. Leadership only. */
export async function listReportFiles(reportIds: string[]): Promise<Record<string, ReportFile[]>> {
  if (reportIds.length === 0) return {};
  const { data, error } = await db().from('report_files')
    .select('id, report_id, name, path, mime, size_bytes, created_at')
    .in('report_id', reportIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const out: Record<string, ReportFile[]> = {};
  for (const row of (data ?? []) as ReportFile[]) (out[row.report_id] ??= []).push(row);
  return out;
}

/** A short-lived link to one piece of evidence. Never stored. */
export async function reportFileUrl(path: string): Promise<string> {
  const { data } = await db().storage.from('pairing-media').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}

/**
 * The church's reports. Directors and Executive Directors only.
 *
 * There is no "my reports" view for the person who raised one, deliberately.
 * They are told it went through at the time; every extra read path is another
 * way for the wrong person to end up holding this.
 */
export async function listReports(): Promise<LiveReport[]> {
  const { data, error } = await db()
    .from('reports')
    .select('id, reporter_id, subject_id, pairing_id, reason, detail, status, created_at, decided_by, decided_at, outcome, guild_post_id, guild_post_body')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LiveReport[];
}

/**
 * Close a report.
 *
 * `dismissed` — a Director looked and judged there was nothing to answer — is
 * a real outcome and deliberately as easy to record as the other. Making the
 * innocent finding harder to file pushes Directors towards punishing somebody
 * to clear a queue.
 *
 * There is no delete. The table has no delete policy at all, so this is not a
 * convention that a future change could quietly drop.
 */
export async function resolveReport(
  id: string,
  status: 'actioned' | 'dismissed',
  outcome?: string,
): Promise<void> {
  const { data, error } = await db().rpc('resolve_report', {
    p_id: id,
    p_status: status,
    p_outcome: outcome ?? null,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error('That report could not be updated.');
}

// ---------------------------------------------------------------------------
// Files in a conversation
// ---------------------------------------------------------------------------
//
// The note further up this file said object storage was "a later, deliberate
// decision with a quota attached". This is that decision. The demo keeps
// attachments in the sender's own IndexedDB — a real privacy property, and
// also the reason the bytes never travel: the row syncs and the file does not.
// A Guide sending an Explorer a study sheet needs the file to arrive.
//
// Private bucket, 10 MB a file, a fixed list of types. Both the row and the
// object are guarded by membership of the pairing (migration 0022) — a row
// anyone could read leaks filenames, and an object anyone could fetch leaks
// the file, a storage path being guessable in a way a row id is not.

export interface PairingFile {
  id: string;
  pairing_id: string;
  owner_id: string;
  title: string;
  mime: string;
  size: number;
  path: string;
  created_at: string;
}

const MEDIA_BUCKET = 'pairing-media';
/** Kept in step with the bucket's own file_size_limit in migration 0022. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export async function listPairingFiles(pairingId: string): Promise<PairingFile[]> {
  const { data, error } = await db()
    .from('pairing_media')
    .select('id, pairing_id, owner_id, title, mime, size, path, created_at')
    .eq('pairing_id', pairingId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PairingFile[];
}

/**
 * Send a file.
 *
 * THE UPLOAD HAPPENS FIRST AND THE ROW SECOND, and if the row fails the object
 * is removed again. The other order leaves a row pointing at nothing, which
 * renders as a broken attachment for ever — worse than a failure the sender
 * can see and retry.
 *
 * The path is `<pairing_id>/<uuid>` and never the person's filename. Filenames
 * carry spaces, accents and occasionally somebody's full name; the title is
 * kept in the row, where it belongs.
 */
export async function sendPairingFile(pairingId: string, original: File): Promise<PairingFile> {
  const client = db();

  // SHRUNK BEFORE IT IS MEASURED, so a 4 MB photo from a phone camera is not
  // refused for being over a limit it does not need to be over. Fifteen of the
  // sixteen files a real church had sent each other were photographs averaging
  // 2.3 MB, and a conversation shows them a few hundred pixels wide.
  //
  // It also drops the EXIF, which is where a phone writes the coordinates the
  // picture was taken at. Sending a photo of a Bible page to your Guide should
  // not tell them where you live.
  const file = await shrinkImage(original);
  // uid() reads the session this app verified server-side and stored itself.
  // Asking Supabase Auth again would be a second round trip for something
  // already known, and tests/security-invariants.mjs forbids it by name — it
  // caught this exact line on the first attempt.
  const me = await uid();

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is 10 MB. `
      + 'Try a photo rather than a video, or share a link instead.',
    );
  }

  // uuid(), not crypto.randomUUID(). The latter is a SECURE-CONTEXT api: it is
  // undefined over plain http on a LAN address, and absent in Safari before
  // 15.4. Unguarded it throws rather than degrading, so sending a photo failed
  // outright with nothing the person could act on. lib/uuid.ts exists for this
  // and lib/localMedia.ts already used it; this one call site did not, which is
  // exactly the shape of bug a helper is supposed to prevent.
  const path = `${pairingId}/${uuid()}`;
  const { error: upErr } = await client.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await client
    .from('pairing_media')
    .insert({
      pairing_id: pairingId,
      owner_id: me,
      title: file.name || 'Attachment',
      mime: file.type || '',
      size: file.size,
      path,
    })
    .select('id, pairing_id, owner_id, title, mime, size, path, created_at')
    .single();

  if (error) {
    // Do not leave bytes nobody can reach.
    await client.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {});
    throw new Error(error.message);
  }
  return data as PairingFile;
}

/**
 * A URL the browser can actually open.
 *
 * Signed and short-lived, because the bucket is private. One hour: long enough
 * to read a PDF on a slow connection, short enough that a URL pasted into a
 * group chat stops working.
 */
export async function pairingFileUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Take back something you sent. Only the sender; see migration 0022. */
export async function removePairingFile(file: PairingFile): Promise<void> {
  const client = db();
  const { error } = await client.from('pairing_media').delete().eq('id', file.id);
  if (error) throw new Error(error.message);
  // The row is what the screen reads, so its removal is what matters and is
  // done first. An orphaned object is invisible and costs a few kilobytes; an
  // orphaned row is a broken attachment on somebody's screen.
  await client.storage.from(MEDIA_BUCKET).remove([file.path]).catch(() => {});
}

// ---------------------------------------------------------------------------
// The trial room: suspending a member, and removing one
// ---------------------------------------------------------------------------
//
// A church running this has no other lever. If somebody sends an Explorer
// something they should not have, the leadership must be able to act tonight,
// from a phone, without a developer. Reports gave them the evidence; this is
// the response.
//
// JAIL and KICK are different acts and are kept different:
//
//   suspendMember   the account is switched OFF. They stay in the church and
//                   keep their history, and cannot sign in at all -- migration
//                   0026 bans the auth account and deletes their live sessions,
//                   so somebody already signed in is out at once rather than at
//                   token expiry. Reversible: restoreMember switches it back on.
//                   This is both "we are looking into it" and "you are out
//                   until we talk".
//   removeMember    they are gone.
//
// WHO MAY DO WHAT IS DECIDED IN THE DATABASE (migration 0023), never here. An
// Executive Director may act on anyone in a church they oversee; a Director on
// Guides and Explorers only; nobody on themselves; and nobody at all on the
// Head Executive Director, who is the root of authority and the one account
// that can appoint executives again afterwards (migration 0025). Each call
// returns 'ok' or the reason it was refused, because a leader trying to stop
// something deserves a sentence, not a button that does nothing.

/** Suspend ("jail"). Returns 'ok', or the reason it was refused. */
export async function suspendMember(userId: string, reason?: string): Promise<string> {
  const { data, error } = await db().rpc('suspend_member', {
    p_target: userId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** Lift a suspension ("unjail"). Pairings are NOT restored — see 0023. */
export async function restoreMember(userId: string): Promise<string> {
  const { data, error } = await db().rpc('restore_member', { p_target: userId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** Remove from the church entirely ("kick"), under the same authority rules. */
export async function removeMemberByLeader(userId: string): Promise<string> {
  // Their files go FIRST, and the order is not a preference. This call deletes
  // the account, `profiles` goes with it by cascade, and from that moment no
  // rule can say which church the leftover files belonged to — so nobody can
  // ever delete them again. Three such photographs are already stranded that
  // way, left by removals that happened before this existed.
  //
  // It cannot be done in a database trigger: Supabase refuses direct deletes
  // from `storage.objects`, and a row deleted there strands the image rather
  // than removing it. Only the Storage API deletes both halves.
  await removeStoredFilesFor(userId);

  const { data, error } = await db().rpc('remove_member_by_leader', { p_target: userId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/**
 * Clear everything a member has stored, before the account that owns it goes.
 *
 * Best-effort on purpose. A leftover picture is a privacy problem worth
 * chasing; it is not a reason to refuse to remove somebody who needs removing
 * today, which is what throwing here would mean.
 */
async function removeStoredFilesFor(person: string): Promise<void> {
  for (const prefix of ['avatars', 'lessons']) {
    try {
      const { data, error } = await db().storage.from(AVATAR_BUCKET).list(`${prefix}/${person}`);
      if (error || !data?.length) continue;
      await db().storage.from(AVATAR_BUCKET)
        .remove(data.map((f) => `${prefix}/${person}/${f.name}`));
    } catch {
      // See above.
    }
  }
}

/**
 * Who this caller may act on, and how it would be refused if not.
 *
 * Asked per person so the screen can hide what would fail rather than offering
 * a Director a button that refuses. The database still decides; this only
 * spares somebody the experience of being told no.
 */
export async function disciplineCheck(userId: string): Promise<string> {
  const { data, error } = await db().rpc('discipline_check', { p_target: userId });
  if (error) return 'unavailable';
  return String(data ?? 'unavailable');
}

// ---------------------------------------------------------------------------
// The trial room, as a court
// ---------------------------------------------------------------------------
//
// Reports say what one person believes happened. A trial is where both sides
// say it in their own words, in one place, before anybody is suspended or
// removed -- and where what was said survives the decision.
//
// THE JUDGE RULE, because it is the one that surprises people: the Director who
// opens a case is head judge from the first moment. Calling for an Executive
// Director does not vacate the seat; it only offers it. If no Executive ever
// answers, the Director decides the case. There is no countdown anywhere.

export interface Trial {
  id: string;
  summary: string;
  subject_id: string;
  subject_name: string;
  opened_by: string;
  opener_name: string;
  head_judge_id: string;
  judge_name: string;
  escalation: 'none' | 'requested' | 'accepted';
  status: 'open' | 'closed';
  verdict: 'dismissed' | 'suspended' | 'removed' | null;
  verdict_note: string | null;
  opened_at: string;
  closed_at: string | null;
  my_part: 'accused' | 'reporter' | 'witness' | null;
  am_judge: boolean;
}

export interface TrialStatement {
  id: string;
  trial_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

/** Every case this person is party to or, as a leader, responsible for. */
export async function listTrials(): Promise<Trial[]> {
  const { data, error } = await db().rpc('my_trials');
  if (error) throw new Error(error.message);
  return (data ?? []) as Trial[];
}

/**
 * Open a case against someone, and summon the other side with them.
 *
 * `otherId` names the other party directly; `reportId` takes them from the
 * report that prompted it. Either way both sides end up able to read the case
 * and answer it, which is the entire point of holding one.
 */
export async function openTrial(args: {
  subjectId: string;
  summary: string;
  reportId?: string;
  otherId?: string;
}): Promise<string> {
  const { data, error } = await db().rpc('open_trial', {
    p_subject: args.subjectId,
    p_summary: args.summary,
    p_report: args.reportId ?? null,
    p_other: args.otherId ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Ask an Executive Director to take the seat. The Director keeps it until one does. */
export async function callHeadJudge(trialId: string): Promise<string> {
  const { data, error } = await db().rpc('call_head_judge', { p_trial: trialId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** An Executive Director answers the call. */
export async function takeHeadJudge(trialId: string): Promise<string> {
  const { data, error } = await db().rpc('take_head_judge', { p_trial: trialId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/**
 * Decide the case. Only the head judge, and the verdict is carried out by the
 * same functions the member list uses, so a court cannot reach past the
 * authority its judge already has.
 */
export async function closeTrial(
  trialId: string,
  verdict: 'dismissed' | 'suspended' | 'removed',
  note?: string,
): Promise<string> {
  const { data, error } = await db().rpc('close_trial', {
    p_trial: trialId,
    p_verdict: verdict,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** What has been said in a case, oldest first. */
export async function listStatements(trialId: string): Promise<TrialStatement[]> {
  const { data, error } = await db()
    .from('trial_statements')
    .select('*')
    .eq('trial_id', trialId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TrialStatement[];
}

/**
 * Say something in a case.
 *
 * A SUSPENDED PERSON MAY STILL DO THIS. Suspension stops them messaging, and
 * if it also silenced them here then suspending somebody pending a hearing
 * would take away their defence -- so every trial after a precautionary
 * suspension would be one-sided by construction. The policy in 0024
 * deliberately does not consult suspended_at.
 */
export async function speakInTrial(trialId: string, body: string): Promise<void> {
  const me = await uid();
  const { error } = await db()
    .from('trial_statements')
    .insert({ trial_id: trialId, author_id: me, body });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------
//
// A pairing is one Guide and one Explorer. A guild is the group a Director
// wants to name -- a campus, a cohort, a Sabbath team -- and naming it is the
// part that matters to the people in it.
//
// An Explorer is never handed the roll. They can see the guild they are in and
// how many are in it; the names come back as an empty list for them, because a
// group feature that quietly published a roster of everybody being discipled
// at this church would undo the privacy the one-to-one conversations exist for.

export interface GuildMember {
  id: string;
  name: string;
  role: Role;
}

export interface Guild {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  guides: number;
  explorers: number;
  members: GuildMember[];
  i_am_in_it: boolean;
}

export async function listGuilds(): Promise<Guild[]> {
  const { data, error } = await db().rpc('list_guilds');
  if (error) throw new Error(error.message);
  return (data ?? []) as Guild[];
}

export async function createGuild(name: string, description?: string): Promise<string> {
  const { data, error } = await db().rpc('create_guild', {
    p_name: name,
    p_description: description ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function renameGuild(guildId: string, name: string): Promise<string> {
  const { data, error } = await db().rpc('rename_guild', { p_guild: guildId, p_name: name });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

export async function deleteGuild(guildId: string): Promise<string> {
  const { data, error } = await db().rpc('delete_guild', { p_guild: guildId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

export async function addToGuild(guildId: string, personId: string): Promise<string> {
  const { data, error } = await db().rpc('add_to_guild', { p_guild: guildId, p_person: personId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

export async function removeFromGuild(guildId: string, personId: string): Promise<string> {
  const { data, error } = await db().rpc('remove_from_guild', {
    p_guild: guildId,
    p_person: personId,
  });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

export type GuildActivityKind = 'encouragement' | 'study' | 'prayer' | 'care';

export interface GuildActivityPost {
  id: string;
  kind: GuildActivityKind;
  body: string;
  author_label: string;
  is_mine: boolean;
  amen_count: number;
  i_amen: boolean;
  created_at: string;
  /** Set when the author corrected it. The previous wording is kept. */
  edited_at?: string | null;
  /**
   * Set when the post was taken down. `body` is empty when this is set.
   *
   * THERE IS NO `deleted_by` HERE ON PURPOSE. The wall is pseudonymous -- the
   * feed returns a label and never an author id -- so a note built from an id
   * would undo that. `removed_by_leader` says whether it was the author or
   * leadership, which is all the screen needs and all it may know.
   */
  deleted_at?: string | null;
  removed_by_leader?: boolean;
}

/** A Guild board contains no roster or member identifiers. */
export async function listGuildActivity(guildId: string, limit = 100): Promise<GuildActivityPost[]> {
  const { data, error } = await db().rpc('list_guild_activity', {
    p_guild: guildId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as GuildActivityPost[];
}

/**
 * Correct your own post on the Guild wall. The author, and only ever the author.
 *
 * Leadership can take a post DOWN and deliberately cannot rewrite one: removing
 * something somebody said and putting different words in their mouth are not
 * the same power. The previous wording is kept where no browser can read it.
 */
export async function editGuildPost(postId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error('Write something first.');
  if (text.length > 1000) throw new Error('Write between 1 and 1000 characters.');
  const { error } = await db().rpc('edit_guild_post', { p_post: postId, p_body: text });
  if (error) throw new Error(error.message);
}

export async function postToGuild(
  guildId: string,
  kind: GuildActivityKind,
  body: string,
): Promise<string> {
  const { data, error } = await db().rpc('post_to_guild', {
    p_guild: guildId,
    p_kind: kind,
    p_body: body,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function toggleGuildAmen(postId: string): Promise<boolean> {
  const { data, error } = await db().rpc('toggle_guild_amen', { p_post: postId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function deleteMyGuildPost(postId: string): Promise<boolean> {
  const { data, error } = await db().rpc('delete_my_guild_post', { p_post: postId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Report a post on the guild board.
 *
 * NO SUBJECT ARGUMENT, and that is the point. The board shows "A Guide" and
 * "A fellow Explorer" rather than names, so the person reporting genuinely
 * does not know whose post it is and must not be asked to name them. The post
 * id is all the browser sends; the function resolves the author, files it into
 * the same `reports` table the pairing conversation uses, and never returns
 * the name.
 *
 * It also copies the post's text into the report. A post can be deleted by its
 * author a moment after it is reported, and without the copy a Director would
 * open a report about nothing.
 */
export async function reportGuildPost(
  postId: string,
  reason: ReportReason,
  detail?: string,
): Promise<string> {
  const { data, error } = await db().rpc('report_guild_post', {
    p_post: postId,
    p_reason: reason,
    p_detail: detail?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/**
 * Take a guild post down. Church leadership only.
 *
 * The board itself stays closed to leadership — a group talking honestly is
 * what the room is for. This reaches one post, the one somebody reported, and
 * writes a `guild_post_removed` row into the security audit ledger before the
 * delete rather than after it.
 */
export async function removeGuildPost(postId: string): Promise<boolean> {
  const { data, error } = await db().rpc('remove_guild_post', { p_post: postId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
//
// Every word in `health` is defined in guild_metrics() (migration 0029), not
// here and not in the component, so the badge and the rule that produced it
// cannot drift apart.

export interface GuildMetric {
  id: string;
  name: string;
  members: number;
  guides: number;
  explorers: number;
  unpaired_explorers: number;
  suspended: number;
  removed_ever: number;
  messages_30d: number;
  last_activity_at: string | null;
  state: 'empty' | 'active' | 'quiet' | 'stagnant';
  health: 'thriving' | 'steady' | 'watch' | 'stagnant';
}

export interface ChurchPulse {
  church_id: string;
  church_name: string;
  directors: number;
  guides: number;
  explorers: number;
  awaiting_approval: number;
  active_pairings: number;
  unpaired_explorers: number;
  guilds_total: number;
  guilds_active: number;
  guilds_stagnant: number;
  suspended_now: number;
  removed_ever: number;
  open_reports: number;
  open_trials: number;
  messages_7d: number;
  messages_30d: number;
}

/**
 * One entry in the church's record of who was let in, switched off or removed.
 *
 * `approved` and `disapproved` joined the older three in migration 0041. Before
 * that a disapproval left no trace at all, so "how many did we turn away this
 * quarter" had no answer — the profile simply carried a false flag and nothing
 * said when, or who by. Approvals are recorded alongside the refusals on
 * purpose: a log that keeps only the punishments reads like a charge sheet
 * rather than a record of decisions.
 */
export interface DisciplineEntry {
  id: string;
  person_name: string;
  person_role: string;
  action: 'suspended' | 'released' | 'removed' | 'approved' | 'disapproved';
  reason: string | null;
  by_name: string;
  guild_names: string[];
  at: string;
}

export async function guildMetrics(): Promise<GuildMetric[]> {
  const { data, error } = await db().rpc('guild_metrics');
  if (error) throw new Error(error.message);
  return (data ?? []) as GuildMetric[];
}

/** One row per church this leader is responsible for. */
export async function churchPulse(): Promise<ChurchPulse[]> {
  const { data, error } = await db().rpc('church_pulse');
  if (error) throw new Error(error.message);
  return (data ?? []) as ChurchPulse[];
}

/**
 * Every member under 18, for the Director who is responsible for them.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE BADGE. The badge (components/MinorBadge)
 * marks a minor wherever somebody already happens to be looking at them, which
 * is right when you are looking and useless for the question a Director has to
 * answer: who are all of them, and is anybody missing a consent letter? A
 * safeguard you can only see by visiting every profile in turn is a safeguard
 * nobody performs.
 *
 * The guardian comes back as a real account when the guardian is also a member,
 * which is most often a Guide. It is NEVER inferred from a shared surname: a
 * Director records the link once from the signed letter in front of them, and
 * a wrong guess here links a child to a stranger.
 *
 * Rows with no consent recorded sort first, because those are the ones that
 * need doing.
 */
export interface MinorRow {
  member_id: string;
  full_name: string;
  role: Role;
  birthday: string | null;
  consent_recorded: boolean;
  guardian_name: string | null;
  guardian_member_id: string | null;
  guardian_full_name: string | null;
  guardian_role: Role | null;
  guardian_is_member: boolean;
}

export async function minorsInChurch(churchId?: string): Promise<MinorRow[]> {
  const { data, error } = await db().rpc('minors_in_church', {
    p_church: churchId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MinorRow[];
}

/** A Director records the signed letter, and who signed it. */
export async function recordGuardianConsent(
  memberId: string,
  guardianName: string,
  guardianMemberId?: string,
): Promise<void> {
  const { error } = await db().rpc('record_guardian_consent', {
    p_member: memberId,
    p_guardian_name: guardianName,
    p_guardian_member: guardianMemberId ?? null,
  });
  if (error) throw new Error(error.message);
}

/** A parent can change their mind, so this has to exist. */
export async function withdrawGuardianConsent(memberId: string): Promise<void> {
  const { error } = await db().rpc('withdraw_guardian_consent', { p_member: memberId });
  if (error) throw new Error(error.message);
}

/**
 * The discipline record, which outlives the people in it.
 *
 * Names and roles are copied onto the log at the time of the act (migration
 * 0028), because removing somebody deletes their profile — and the first
 * version of this lost the record of the removal along with the person.
 */
export async function disciplineHistory(): Promise<DisciplineEntry[]> {
  const { data, error } = await db().rpc('discipline_history');
  if (error) throw new Error(error.message);
  return (data ?? []) as DisciplineEntry[];
}

// ---------------------------------------------------------------------------
// Admin Reports
// ---------------------------------------------------------------------------
//
// Every rule that matters here lives in migration
// 20260915120000_a_report_is_answered_by_one_person.sql, not in this file and
// not in the component. Who may see a report, who may pick one up, and who may
// speak in it are decided by the database, so a mistake in the screen cannot
// widen any of them. In particular: nobody may handle a report they are the
// subject of, and a report about a Director or an Executive Director is for
// Executive Directors only.

export type AdminReport = {
  id: string;
  reason: string;
  detail: string | null;
  status: string;
  created_at: string;
  /** I am the person who raised this. */
  mine: boolean;
  claimed_by: string | null;
  claimed_name: string | null;
  subject_name: string | null;
  /** I am entitled to pick this up and answer it. */
  can_handle: boolean;
  messages: number;
};

export type ReportMessage = {
  id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
};

export async function myReports(): Promise<AdminReport[]> {
  const { data, error } = await db().rpc('my_reports');
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminReport[];
}

export async function reportThread(reportId: string): Promise<ReportMessage[]> {
  const { data, error } = await db().rpc('report_thread', { p_report: reportId });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportMessage[];
}

/** Pick up a report. First one there holds it; nobody else can speak in it. */
export async function claimReport(reportId: string): Promise<void> {
  const { error } = await db().rpc('claim_report', { p_report: reportId });
  if (error) throw new Error(error.message);
}

/** Hand it back, so a case is never stuck with somebody who should not hold it. */
export async function releaseReport(reportId: string): Promise<void> {
  const { error } = await db().rpc('release_report', { p_report: reportId });
  if (error) throw new Error(error.message);
}

export async function sayInReport(reportId: string, body: string): Promise<void> {
  const { error } = await db().rpc('say_in_report', { p_report: reportId, p_body: body });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// The pocket
// ---------------------------------------------------------------------------
//
// Personal shortcuts, private to the person who saved them. The policy on
// pocket_apps is `owner_id = auth.uid()` on every verb -- not their Guide, not
// a Director, not the Head ED -- so nothing here needs to filter by hand.

export type PocketApp = { id: string; url: string; label: string; created_at: string };

export async function myPocket(): Promise<PocketApp[]> {
  const { data, error } = await db()
    .from('pocket_apps')
    .select('id,url,label,created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PocketApp[];
}

export async function addPocketApp(url: string, label: string): Promise<void> {
  // NO owner_id, AND NO getUser(). The column defaults to auth.uid() and the
  // insert policy checks it, so the row cannot be written in anybody else's
  // name whatever the browser sends. Asking Auth who this is would be a second
  // round trip and a second source of truth; the app already holds a verified
  // first-party session, and tests/security-invariants.mjs fails the build for
  // reaching past it.
  const { error } = await db().from('pocket_apps').insert({ url, label });
  if (error) throw new Error(error.message);
}

export async function removePocketApp(id: string): Promise<void> {
  const { error } = await db().from('pocket_apps').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// The Hall of Justice
// ---------------------------------------------------------------------------
//
// Who may take a seat is decided by private.may_sit_on_trial in migration
// 20260916120000, never here: leadership of that church, but never on a case
// about themselves, and never on a case about a Director unless they are an
// Executive Director. The screen draws what the database already allowed.

export type SeatableTrial = {
  id: string;
  summary: string;
  status: string;
  verdict: string | null;
  opened_at: string;
  accused_name: string | null;
  accused_role: string;
  /** How many of leadership are watching. Watching carries no voice. */
  watching: number;
  i_am_watching: boolean;
  /** The one who accepted the case, and the only one who runs or ends it. */
  i_am_judge: boolean;
};

export async function trialsIMaySitOn(): Promise<SeatableTrial[]> {
  const { data, error } = await db().rpc('trials_i_may_sit_on');
  if (error) throw new Error(error.message);
  return (data ?? []) as SeatableTrial[];
}

/**
 * Watch a hearing, on the record.
 *
 * WATCHING IS SILENT. `trial_statements_speak` admits the person who accepted
 * the case and anybody actually called to it -- the accused, the reporter, a
 * witness -- and nobody else. An observer reads and cannot write, so a member
 * answering something said about them never finds a Director in the transcript
 * who was never called to the case.
 */
export async function joinTrial(trialId: string): Promise<void> {
  const { error } = await db().rpc('join_trial', { p_trial: trialId });
  if (error) throw new Error(error.message);
}

// SUMMONING IS ALREADY HERE. `openTrial` above does exactly this and has
// since the trial room was written -- LiveTrialRoom's "Open a case" button
// calls it, and open_trial notifies the person it summons. A second wrapper
// was written here before checking, which is the mistake the clipboard and
// lib/url.ts guards both exist to prevent: two ways to do one thing, and one
// of them eventually wrong. Deleted rather than kept for symmetry.

// ---------------------------------------------------------------------------
// The next thing to read
// ---------------------------------------------------------------------------
//
// Deliberately NOT the journey stage. The stage is a note the church keeps about
// a person and a seeker never sees it -- lib/types.ts says so, and it is a
// safeguarding decision rather than an oversight. This is the other truth: what
// the Explorer has actually done. Before it, somebody could read every study in
// the church and watch nothing move until their Guide changed their mind.

export type StudyProgress = {
  read_count: number;
  total_count: number;
  next_id: string | null;
  next_title: string | null;
  next_series: string | null;
  next_series_id: string | null;
};

export async function myStudyProgress(): Promise<StudyProgress | null> {
  const { data, error } = await db().rpc('my_study_progress');
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as StudyProgress | undefined;
  return row ?? null;
}
