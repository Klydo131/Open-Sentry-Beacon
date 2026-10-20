// Data access for a church's real database.
//
// Row-level security in the database decides what each caller may read or
// write; nothing here filters for access. This file runs in the browser, so it
// never imports a server key, never sets role, church_id, is_approved or
// is_head_executive on the caller's own profile, and never selects an
// Explorer's own journey_stage. Changing somebody's role is setMemberRole(),
// on somebody else's row; there is no setMyRole() here, and must never be.

import {
  endBrowserSession,
  readBrowserSession,
  saveBrowserSession,
  supabase,
  supabaseAuth,
} from '@/lib/supabase/client';
import { uuid } from '@/lib/uuid';
import { shrinkImage } from '@/lib/live/shrink-image';
import { isSafeStoragePath, safeStoragePath } from '@/lib/live/storage-path';
import { NotOnThisDatabaseYet, isMissingFromDatabase } from '@/lib/live/not-yet';
import type { PlaceSuggestion } from '@/lib/live/place-pin';
import { SecondStepNeeded, enterCode, isSecondStepRefusal } from '@/lib/live/two-step';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Pairing, Message, Stage, Track, Role, JourneyEvent, MeetingMode, PostMedia } from '@/lib/types';
import { forgetPostFile, readPostFile } from '@/lib/post-media';
import type { Reaction, ReactionTarget } from '@/lib/talk/reactions';
import { plainTitle } from '@/lib/talk/thread';
import { STAGE_ORDER } from '@/lib/brand';

class NotLive extends Error {
  constructor() {
    super('This build has no database configured.');
    this.name = 'NotLive';
  }
}

// Also used by lib/live/my-data.ts, so a member's data export reads through
// the same rules as everything else.
export function db() {
  const client = supabase();
  if (!client) throw new NotLive();
  return client;
}

/**
 * The signed-in user's id, read from the stored session. Use this rather than
 * the auth client's getUser(), which makes a network call that privacy
 * settings in Safari, Brave and Firefox can block.
 */
export async function uid(): Promise<string> {
  const id = readBrowserSession()?.user.id;
  if (!id) throw new Error('You are not signed in.');
  return id;
}

// --- Session ---

export interface SignInResult {
  role: Role;
  is_approved: boolean;
  second_step?: false;
}

/** The password was right and the account has two-step sign-in: the code comes next. */
export interface SecondStepNext {
  second_step: true;
}

/**
 * The account is suspended, and a judge has let it in to answer one case:
 * the court room is all it can open (app/answer).
 */
export interface CourtLeaveNext {
  court_leave: true;
  second_step?: false;
}

export async function signIn(email: string, password: string): Promise<SignInResult | SecondStepNext | CourtLeaveNext> {
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

  // The password was accepted and two-step sign-in is on: the code comes next.
  if (
    response.ok &&
    payload?.second_step === true &&
    typeof payload?.session?.access_token === 'string' &&
    typeof payload?.session?.refresh_token === 'string'
  ) {
    try {
      saveBrowserSession(payload.session as Session);
    } catch {
      throw new Error('Your account signed in, but the app could not save the session.');
    }
    return { second_step: true };
  }

  // Suspended, and answering a case on leave: the court room is all it opens.
  if (
    response.ok &&
    payload?.court_leave === true &&
    typeof payload?.session?.access_token === 'string' &&
    typeof payload?.session?.refresh_token === 'string'
  ) {
    try {
      saveBrowserSession(payload.session as Session);
    } catch {
      throw new Error('Your account signed in, but the app could not save the session.');
    }
    return { court_leave: true };
  }

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
  return afterSignIn(payload.profile as SignInResult);
}

/**
 * Finish a two-step sign-in with the code from the authenticator app, then do
 * what an ordinary sign-in does next.
 */
export async function finishSignInWithCode(code: string): Promise<SignInResult> {
  await enterCode(code);
  const me = await getMyProfile();
  if (!me || !['executive', 'admin', 'dm', 'ds'].includes(me.role)) {
    throw new Error('Your account profile is not ready yet.');
  }
  return afterSignIn({ role: me.role, is_approved: me.is_approved });
}

async function afterSignIn(mine: SignInResult): Promise<SignInResult> {
  // Claim a pending invitation on every sign-in, not only on the join link, or
  // a member who signs in through /login is left without a church.
  if (!mine.is_approved) {
    try {
      if (await claimMyPendingInvitation()) {
        const claimed = await getMyProfile();
        if (claimed) return { role: claimed.role, is_approved: claimed.is_approved };
      }
    } catch {
      // A failed claim must not turn a correct password into a sign-in error.
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
    // Only the name is sent; role and approval are set by the server.
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) throw new Error(error.message);
}

/** Sign out: the server ends this session, then this device forgets it (lib/supabase/client.ts). */
export async function signOut(): Promise<void> {
  await endBrowserSession();
}

/**
 * Change your own password, then sign out every other device. Clearing the
 * temporary-password reminder is best effort, so its failure is not reported.
 */
export async function changeMyPassword(next: string): Promise<void> {
  if (next.length < 10) throw new Error('Use at least 10 characters.');
  const client = supabaseAuth();
  if (!client) throw new NotLive();

  const { data, error } = await client.auth.updateUser({ password: next });
  if (error) throw new Error(error.message);

  // updateUser rotates the tokens, so the saved session must be replaced.
  try {
    const { data: fresh } = await client.auth.getSession();
    if (fresh?.session) saveBrowserSession(fresh.session as Session);
  } catch { }

  // A new password ends every other session. A failure is ignored: the password
  // still changed, and "Sign out everywhere else" can be pressed again.
  await signOutOtherDevices().catch(() => undefined);

  const me = data?.user?.id;
  if (me) {
    try {
      await db().from('profiles').update({ password_is_temporary: false }).eq('id', me);
    } catch { }
  }
}

export async function clearTemporaryPasswordReminder(): Promise<void> {
  const me = await uid();
  await db().from('profiles').update({ password_is_temporary: false }).eq('id', me);
}

export async function signOutOtherDevices(): Promise<void> {
  const client = supabaseAuth();
  if (!client) throw new NotLive();
  const { error } = await client.auth.signOut({ scope: 'others' });
  if (error) throw new Error(error.message);
}

/**
 * When the password an invitation e-mailed stops working, or null once the
 * person has chosen their own (by any door) or was never given one.
 */
export async function myTemporaryPasswordEnds(): Promise<string | null> {
  const { data, error } = await db().rpc('my_temporary_password_ends');
  if (error) return null;
  return typeof data === 'string' && data ? data : null;
}

// --- Me ---

export async function getMyProfile(): Promise<Profile | null> {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('id', await uid())
    .maybeSingle();
  if (isSecondStepRefusal(error)) throw new SecondStepNeeded();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

/**
 * Update your own profile. The patch is rebuilt field by field, never spread,
 * so privileged columns such as `role` are never sent.
 */
export async function updateMyProfile(patch: Partial<Profile>): Promise<void> {
  const safe = {
    full_name: patch.full_name,
    preferred_contact: patch.preferred_contact,
    preferred_language: patch.preferred_language,
    topics_of_interest: patch.topics_of_interest,
    // An allow-list: add new fields one by one, never with a spread.
    birthday: patch.birthday,
    gender: patch.gender,
    life_status: patch.life_status,
    city_of_residence: patch.city_of_residence,
    work_industry: patch.work_industry,
    consent_at: patch.consent_at,
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

// Served by an RPC that returns only a role-scoped, content-free summary.
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

// --- Invitations sent, and who has not arrived yet ---

export interface OpenInvite {
  id: string;
  email: string;
  role: Role;
  full_name: string | null;
  created_at: string;
  expires_at: string;
  /** An auth account exists. False means the send never got far enough to make one. */
  has_account: boolean;
  /** When the invitation link was last opened, by anyone (a Director testing it counts). */
  opened_at: string | null;
  /**
   * When the person finished sign-up and chose a password: the only reliable
   * meaning of "accepted".
   */
  joined_at: string | null;
  /**
   * Stamped when the invitation is sent, so on its own it does not mean joined.
   * With has_account false: null means the send never made an account; a date
   * means the account was made and later removed.
   */
  redeemed_at: string | null;
}

/** Invitations this church has sent, so unaccepted ones can be seen and re-sent. */
export async function listInvites(): Promise<OpenInvite[]> {
  // A definer function, because whether a link was opened lives in auth.users.
  const { data, error } = await db().rpc('church_invitations');
  if (error) throw new Error(error.message);
  return (data ?? []) as OpenInvite[];
}

/** Mark sign-up finished. Called once by the join form, after the password is set. */
export async function finishMySignup(): Promise<void> {
  const { error } = await db().rpc('finish_my_signup');
  if (error) throw new Error(error.message);
}

/**
 * Attach an invitation sent after this account already existed (the
 * handle_new_user trigger does not run a second time).
 */
export async function claimMyPendingInvitation(): Promise<boolean> {
  const { data, error } = await db().rpc('claim_my_pending_invitation');
  if (error) throw new Error(error.message);
  return data === true;
}

/** Withdraw an invitation that has not been accepted. */
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

// --- The church and its people ---

export interface Church {
  id: string;
  name: string;
  /** How many Explorers one Guide of this church may carry; enforced by the database. */
  guide_cap: number;
}

export async function myChurch(): Promise<Church | null> {
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

/** One person's profile, or null if the caller may not see it. */
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
 * Proposed pairings for everybody still waiting. Writes nothing: a Director
 * confirms each one. Minors are never proposed.
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
  // A friendly message only; the database refuses a self-edit regardless.
  if (userId === (await uid())) throw new Error('You cannot change your own role.');
  const { error } = await db().from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(error.message);
}

// --- Pairings ---

export interface PairingView extends Pairing {
  dm_name: string;
  ds_name: string;
  /** When the Explorer finished signing up, for the "New" badge. */
  ds_signup_completed_at?: string | null;
  // For the minor badge wherever a Guide or Director sees this Explorer.
  ds_birthday: string | null;
  ds_guardian_consent_at: string | null;
  ds_photo_path?: string | null;
  ds_avatar?: string | null;
  dm_photo_path?: string | null;
  dm_avatar?: string | null;
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
    client.from('profiles').select('id, full_name, birthday, guardian_consent_at, signup_completed_at, photo_path, avatar'),
  ]);
  if (error) throw new Error(error.message);
  type Row = { id: string; full_name: string | null; birthday: string | null; guardian_consent_at: string | null; signup_completed_at: string | null; photo_path: string | null; avatar: string | null };
  const by = new Map((people ?? []).map((p: Row) => [p.id, p]));
  return (pairs ?? []).map((p: Pairing) => ({
    ...p,
    dm_name: by.get(p.dm_id)?.full_name ?? 'Someone',
    ds_name: by.get(p.ds_id)?.full_name ?? 'Someone',
    ds_birthday: by.get(p.ds_id)?.birthday ?? null,
    ds_guardian_consent_at: by.get(p.ds_id)?.guardian_consent_at ?? null,
    ds_signup_completed_at: by.get(p.ds_id)?.signup_completed_at ?? null,
    ds_photo_path: by.get(p.ds_id)?.photo_path ?? null,
    ds_avatar: by.get(p.ds_id)?.avatar ?? null,
    dm_photo_path: by.get(p.dm_id)?.photo_path ?? null,
    dm_avatar: by.get(p.dm_id)?.avatar ?? null,
  }));
}

/**
 * The Explorer's own pairing, without the journey stage. The column list is
 * deliberate: do not change it to select('*').
 */
export async function getMyPairing(): Promise<MyPairing | null> {
  const me = await uid();
  const client = db();
  // Newest row, not maybeSingle(): an Explorer may still have two pairings from
  // before the database prevented it, and that must not break their screen.
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
 * The Explorer's place on the journey as a position only, for the progress
 * bar. The stage name is never returned and must never be shown to them.
 */
export async function myJourneyProgress(): Promise<JourneyProgress | null> {
  const me = await uid();
  const client = db();

  // Newest active pairing, for the same reason as getMyPairing.
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
  // An unknown stage means the journey list changed; show nothing rather than guess.
  if (at < 0) return null;

  return { step: at + 1, total: STAGE_ORDER.length };
}

export async function createPairing(dmId: string, dsId: string, track: Track): Promise<void> {
  if (dmId === dsId) throw new Error('Somebody cannot be paired with themselves.');
  const { error } = await db()
    .from('pairings')
    .insert({
      dm_id: dmId,
      ds_id: dsId,
      track,
      journey_stage: 'connect',
      created_by: await uid(),
    });
  if (error) throw new Error(error.message);
}

// --- Invitations ---

/**
 * What the invite function reports. `delivery` is 'email' when it was sent, or
 * 'link' when it was not and the link below must be passed on by hand.
 */
export interface InviteResult {
  ok?: boolean;
  delivery?: 'email' | 'link';
  /** The ordinary sign-in page for this address. */
  link?: string;
  /** The address and temporary password the invitation emailed, for a Director to read out. */
  signInEmail?: string;
  tempPassword?: string;
  /** Why it could not be emailed, in words a person can act on. */
  mailNote?: string;
  /** Set when the only problem is a per-address cooldown: retry shortly. */
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
  /** `'link'` sends no email and returns a join link to pass on by hand. */
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
    // Non-2xx replies carry the function's own reason on `context`.
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      let reason = '';
      try {
        const body = (await response.clone().json()) as { error?: string };
        reason = body.error ?? '';
      } catch {
      }
      if (reason) throw new Error(reason);
    }
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return (data ?? {}) as InviteResult;
}

const ORDER: Stage[] = ['create', 'connect', 'care', 'call', 'cultivate', 'commission'];

/** Move a pairing one stage on. Reads the current stage first, so two stale screens cannot skip a step. */
/**
 * Move an Explorer back one stage, to correct a mistaken Advance. Recorded in
 * journey_events like any other step.
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
  // Already at the first stage; the button is disabled there.
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

/**
 * Give an Explorer a different Guide in one step: the old pairing ends and a
 * new one begins (change_guide()). The first conversation stays between the
 * Explorer and the first Guide.
 */
export async function changeGuide(pairingId: string, newGuideId: string): Promise<string> {
  const { data, error } = await db().rpc('change_guide', { p_pairing: pairingId, p_new_guide: newGuideId });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function endPairing(id: string): Promise<void> {
  const { error } = await db().from('pairings').update({ status: 'archived' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Every stage change this caller may see, for the analytics screen. */
/**
 * Per role: on the roll, active in the window, inactive, and suspended.
 * "Active" means a recorded action, not a sign-in; sign-ins are not logged.
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

// --- Pairing requests and the Guides' room ---

/** An Explorer nobody is walking with yet, for the Guide who has room. */
export interface UnpairedExplorer {
  id: string;
  full_name: string;
  signup_completed_at: string | null;
  created_at: string;
}

/** Explorers waiting for a Guide: a name and an id only. */
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

/** The caller's own requests, or every request in the church for a Director. */
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

/** A Director answers. "Yes" does not create the pairing; that is done on the pairings screen. */
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
   * Set when the message was taken back. `body` is emptied then, so never draw a
   * deleted message as an empty bubble.
   */
  deleted_at?: string | null;
  deleted_by?: string | null;
}

/** Every conversation this person is in, unread first, with counts from one call. */
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

/** Correct your own message in the Guides' room. Leaders can remove a message, never rewrite one. */
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

/** Take a message back (author or leadership). The words are kept in revisions, out of reach. */
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

// --- The conversation: readable only by its two people ---

/** The newest thousand messages, oldest first. */
export const THREAD_LIMIT = 1000;

export async function listMessages(pairingId: string): Promise<Message[]> {
  const { data, error } = await db()
    .from('messages')
    .select('*')
    .eq('pairing_id', pairingId)
    .order('created_at', { ascending: false })
    .limit(THREAD_LIMIT);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Message[]).reverse();
}

/** Send a message, optionally as a reply to an earlier one in the same conversation. */
export async function sendMessage(pairingId: string, body: string, replyTo?: string | null): Promise<void> {
  const text = body.trim();
  if (!text) return;
  if (text.length > 4000) throw new Error('That message is too long.');
  const { error } = await db()
    .from('messages')
    .insert({
      pairing_id: pairingId,
      sender_id: await uid(),
      body: text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    });
  if (error) throw new Error(error.message);
}

/** Every reaction in one conversation. */
// Replies, reactions and voice need a database update; see lib/live/not-yet.ts.
export { NotOnThisDatabaseYet } from '@/lib/live/not-yet';

export async function listReactions(pairingId: string): Promise<Reaction[]> {
  // A reaction taken back stays as a row with no emoji; skip those.
  const { data, error } = await db()
    .from('message_reactions')
    .select('id, pairing_id, message_id, media_id, person_id, emoji, created_at')
    .eq('pairing_id', pairingId)
    .not('emoji', 'is', null);
  if (error) throw isMissingFromDatabase(error) ? new NotOnThisDatabaseYet(error.message) : new Error(error.message);
  return (data ?? []) as Reaction[];
}

/** React to a message or attachment, change the reaction, or remove it (`emoji` null). */
export async function reactTo(target: ReactionTarget, emoji: string | null): Promise<void> {
  const { error } = await db().rpc('react_to', {
    p_message: 'message' in target ? target.message : null,
    p_media: 'media' in target ? target.media : null,
    p_emoji: emoji,
  });
  if (error) throw new Error(error.message);
}

/** Change the wording of your own message. The previous wording is kept in revisions. */
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

/** Take your own message back. The words leave the conversation but are kept for safeguarding. */
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

/** Live updates for one conversation. */
export function subscribeToMessages(pairingId: string, onChange: () => void) {
  const client = supabase();
  if (!client) return () => {};
  const channel = client
    // A random suffix, so two components watching one conversation get their own channels.
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

// --- Blog ---

export type BlogVisibility = 'private' | 'published';
/**
 * Who a post is for:
 *   church   everybody in the writer's church
 *   all      the people the writer walks with (a leader's `all` posts also reach their church)
 *   selected named people only
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

/** A post as a reader sees it, with the writer's name and without the reader count. */
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

/** What this caller may read, newest first, including their own posts. */
export async function listBlogFeed(limit = 100): Promise<FeedPost[]> {
  const { data, error } = await db().rpc('blog_feed', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedPost[];
}

/** Write a post. The database pins `church_id` to the caller's church. */
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

  // Named recipients only for 'selected', so an 'all' post follows future pairings.
  if (m.audience === 'selected' && m.dsIds?.length) {
    const { error: audErr } = await supabase
      .from('blog_audience')
      .insert(m.dsIds.map((ds) => ({ post_id: data.id as string, ds_id: ds })));
    if (audErr) throw new Error(audErr.message);
  }
  return data.id as string;
}

// --- Photos and a short clip on a post ---
// Stored privately under <church>/<post>/<uuid>.<ext> after the post exists.
// Until the database update is applied, postPhotosReady() is false and the
// writing box offers no photo buttons.

const POST_BUCKET = 'post-media';
const POST_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};

let photosReady: Promise<boolean> | null = null;
/** Whether this church's database takes photos on posts yet. Asked once per page load. */
export function postPhotosReady(): Promise<boolean> {
  photosReady ??= Promise.resolve(db().from('post_media').select('id').limit(1))
    .then(({ error }) => !error || !isMissingFromDatabase(error))
    .catch(() => false);
  return photosReady;
}

/**
 * Put a written post's photos and clip in the church's storage, in order.
 * Returns how many could not go, so the writer can be told; the post itself is
 * already published and is not taken back over a photo.
 */
export async function attachPostMedia(postId: string, media: PostMedia[]): Promise<number> {
  if (media.length === 0) return 0;
  const supabase = db();
  const me = await uid();
  const { data: mine } = await supabase.from('profiles').select('church_id').eq('id', me).maybeSingle();
  const church = mine?.church_id as string | undefined;
  if (!church) return media.length;
  let missed = 0;
  for (const [position, m] of media.entries()) {
    try {
      const kept = await readPostFile(m.src);
      // Shrink and strip location again here, whatever path the photo came by.
      const photo = kept && m.kind === 'image' ? new File([kept], 'photo', { type: kept.type }) : null;
      const blob = photo ? await shrinkImage(photo) : kept;
      const mime = blob?.type || '';
      const ext = (POST_EXT[mime] ?? '').replace(/[^a-z0-9]/gi, '');
      if (!blob || !ext) { missed++; continue; }
      const path = `${church}/${postId}/${uuid()}.${ext}`;
      const up = await supabase.storage.from(POST_BUCKET).upload(path, blob, { contentType: mime, upsert: false });
      if (up.error) { missed++; continue; }
      const { error } = await supabase.from('post_media').insert({
        church_id: church, post_id: postId, owner_id: me,
        kind: m.kind, mime, size: blob.size, path, alt: (m.alt ?? '').slice(0, 300), position,
      });
      if (error) {
        await supabase.storage.from(POST_BUCKET).remove([path]).catch(() => undefined);
        missed++;
        continue;
      }
      await forgetPostFile(m.src).catch(() => undefined);
    } catch {
      missed++;
    }
  }
  return missed;
}

/** Signed addresses (valid for an hour) for the photos and clips on these posts. */
export async function mediaForPosts(postIds: string[]): Promise<Map<string, PostMedia[]>> {
  const found = new Map<string, PostMedia[]>();
  if (postIds.length === 0 || !(await postPhotosReady())) return found;
  const supabase = db();
  const { data, error } = await supabase.from('post_media')
    .select('post_id, kind, path, alt, position')
    .in('post_id', postIds)
    .order('position', { ascending: true });
  if (error || !data?.length) return found;
  const rows = data as { post_id: string; kind: 'image' | 'video'; path: string; alt: string }[];
  const signed = await supabase.storage.from(POST_BUCKET).createSignedUrls(rows.map((r) => r.path), 60 * 60);
  const urlFor = new Map((signed.data ?? []).map((x) => [x.path, x.signedUrl] as const));
  for (const r of rows) {
    const src = urlFor.get(r.path);
    if (!src) continue;
    found.set(r.post_id, [...(found.get(r.post_id) ?? []), { kind: r.kind, src, alt: r.alt || undefined }]);
  }
  return found;
}

/** Publish a draft, or take a post off the front page without losing it. */
export async function setBlogVisibility(id: string, visibility: BlogVisibility): Promise<void> {
  const { error } = await db()
    .from('blog_posts')
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Delete. Audience rows and views go with it by cascade. */
/** Pin a post to the top of the church's feed, or unpin it. Leadership only. */
export async function setPostPinned(id: string, pinned: boolean): Promise<void> {
  const { error } = await db().rpc('set_post_pinned', { p_post: id, p_pinned: pinned });
  if (error) throw new Error(error.message);
}

export async function deleteBlogPost(id: string): Promise<void> {
  const { error } = await db().from('blog_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Record that the caller read a post. Never throws; safe to call on every load. */
export async function recordBlogView(id: string): Promise<void> {
  try {
    await db().rpc('record_blog_view', { p: id });
  } catch {
  }
}

// --- Prayer ---
// A Guide sees their own Explorers' requests with the name; the congregation
// sees shared requests without one, through prayer_wall(). `ds_id` is always the
// Explorer in the relationship; `author_id` is whoever wrote the request.

export type PrayerStatus = 'open' | 'praying' | 'answered';

/** A request as its author or their Guide sees it: with the person attached. */
export interface PrayerRequestRow {
  id: string;
  /** The Explorer this request lives with, whoever wrote it. */
  ds_id: string;
  /** Who wrote it: the Explorer themselves, or their Guide asking them. */
  author_id: string;
  body: string;
  share_with_church: boolean;
  status: PrayerStatus;
  created_at: string;
  /** When the other side said they were praying for this. Null until they do. */
  praying_at: string | null;
}

/** An Explorer's own request, as against one their Guide wrote to them. */
export function isExplorersOwn(r: Pick<PrayerRequestRow, 'ds_id' | 'author_id'>): boolean {
  return r.author_id === r.ds_id;
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
 * A Guide asks the Explorers they walk with to pray for them: one row per
 * Explorer. Returns how many were asked; stops at the first refusal.
 */
export async function askForPrayer(explorerIds: string[], body: string): Promise<number> {
  const supabase = db();
  const me_id = await uid();
  const text = body.trim();
  if (!text) throw new Error('Write something first.');
  if (explorerIds.length === 0) throw new Error('Choose who to ask.');

  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');

  let sent = 0;
  for (const ds_id of [...new Set(explorerIds)]) {
    const { error } = await supabase.from('prayer_requests').insert({
      ds_id,
      church_id: me.church_id,
      body: text,
      share_with_church: false,
    });
    if (error) throw new Error(error.message);
    sent += 1;
  }
  return sent;
}

/** Requests this caller may see with a name (an Explorer's own and their Guide's). */
export async function listPrayerRequests(): Promise<PrayerRequestRow[]> {
  const { data, error } = await db()
    .from('prayer_requests')
    .select('id, ds_id, author_id, body, share_with_church, status, created_at, praying_at')
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

/** The author may set any status; the other side may only move it from open to praying. */
export async function setPrayerStatus(id: string, status: PrayerStatus): Promise<void> {
  const { error } = await db().from('prayer_requests').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Say you are praying for this. A database trigger tells whoever asked. */
export async function markPrayingFor(id: string): Promise<void> {
  const { error } = await db()
    .from('prayer_requests')
    .update({ status: 'praying' })
    .eq('id', id)
    .neq('status', 'praying');
  if (error) throw new Error(error.message);
}

/** Withdraw a request. Only the author may; nobody can delete the other's confidence. */
export async function deletePrayerRequest(id: string): Promise<void> {
  const { error } = await db().from('prayer_requests').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Report a prayer request written to you. The words are copied into the report. */
export async function reportPrayerRequest(
  requestId: string,
  reason: ReportReason,
  detail?: string,
  evidence?: File[],
): Promise<string> {
  const { data, error } = await db().rpc('report_prayer_request', {
    p_request: requestId,
    p_reason: reason,
    p_detail: detail?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const reportId = String(data ?? '');
  // File the report first, then the evidence, so a failed upload cannot lose it.
  if (reportId && evidence?.length) {
    for (const file of evidence) {
      try { await attachReportEvidence(reportId, file); } catch { /* the report stands */ }
    }
  }
  return reportId;
}

// --- Library ---

export type MaterialKind = 'link' | 'video' | 'audio' | 'pdf' | 'image' | 'file';

/** A resource is a link or a file, never both. Sharing the resource shares the file. */
export interface Material {
  id: string;
  church_id: string;
  added_by: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  /** Null for a file. */
  external_url: string | null;
  /** Where the file is kept, for a file. Null for a link. */
  file_path?: string | null;
  /** What the file was called on the phone or computer it came from. */
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  is_published: boolean;
  created_at: string;
}

/** The biggest file the church's storage takes, the same as a study handout. */
export const MAX_RESOURCE_FILE = 10 * 1024 * 1024;

/** What a file IS, from its type, for the icon and the shelf's piles. */
export function kindFromFile(file: { type?: string | null; name?: string | null }): MaterialKind {
  const type = (file.type ?? '').toLowerCase();
  const name = (file.name ?? '').toLowerCase();
  if (type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/.test(name)) return 'image';
  if (type.startsWith('audio/') || /\.(mp3|m4a|ogg|wav)$/.test(name)) return 'audio';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'file';
}

/** Why storage refused a file, in words the person can act on (storage gives one message for every rule). */
function uploadRefused(raw: string, name: string): string {
  if (/mime|type/i.test(raw)) {
    return `\u201c${name}\u201d is not a kind of file the church keeps. Pictures, PDFs, documents and audio are.`;
  }
  if (/row-level security|policy|unauthorized|403/i.test(raw)) {
    return `The church could not keep \u201c${name}\u201d. Each person can keep up to 300 files `
      + 'or 200 MB of resources and handouts: delete some you no longer need and try again. '
      + 'If you are well under that, your Director may have paused your sharing.';
  }
  return raw;
}

/**
 * Upload a file, then write its row; the file is removed if the row fails.
 * The path uses ids only, never the typed name.
 */
export async function addMaterialFile(chosen: File, m: { title?: string; description?: string } = {}): Promise<string> {
  // Photos are resized and lose their location before upload (lib/shrink-image.ts).
  const file = await shrinkImage(chosen);
  if (file.size > MAX_RESOURCE_FILE) throw new Error(`\u201c${file.name}\u201d is over 10 MB. Share a link to it instead.`);
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');

  const ext = (file.name.split('.').pop() || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const path = `library/${me_id}/${uuid()}${ext ? '.' + ext : ''}`;
  const up = await supabase.storage.from('pairing-media')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (up.error) throw new Error(uploadRefused(up.error.message, file.name));

  const title = (m.title?.trim() || file.name.replace(/\.[a-z0-9]{1,8}$/i, '')).slice(0, 200) || 'A file';
  const { data, error } = await supabase
    .from('materials')
    .insert({
      church_id: me.church_id,
      added_by: me_id,
      title,
      description: m.description?.trim() || null,
      kind: kindFromFile(file),
      file_path: path,
      file_name: file.name.slice(0, 300),
      file_type: file.type || null,
      file_size: file.size,
    })
    .select('id')
    .single();
  if (error) {
    await supabase.storage.from('pairing-media').remove([path]);
    throw new Error(error.message);
  }
  return data.id as string;
}

/** A short-lived address to open a file; with `saveAs`, it downloads under that name. */
export async function materialFileUrl(path: string, saveAs?: string): Promise<string> {
  const { data, error } = await db().storage.from('pairing-media')
    .createSignedUrl(safeStoragePath(path), 60 * 60, saveAs ? { download: saveAs } : undefined);
  if (error || !data?.signedUrl) throw new Error('That file could not be opened. It may have been removed.');
  return data.signedUrl;
}

/** The file itself, for handing to the phone's share sheet. */
export async function materialFileForSharing(m: Material): Promise<File> {
  if (!m.file_path) throw new Error('This resource is a link, not a file.');
  const { data, error } = await db().storage.from('pairing-media').download(safeStoragePath(m.file_path));
  if (error || !data) throw new Error('That file could not be fetched to share.');
  return new File([data], m.file_name || m.title, { type: m.file_type || data.type });
}

export interface MaterialShare {
  id: string;
  material_id: string;
  pairing_id: string;
  shared_by: string;
  note: string | null;
  created_at: string;
}

/** This person's shelf: everything they may read, minus what they have hidden. */
export async function listMaterials(): Promise<Material[]> {
  const supabase = db();
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Material[];

  const { data: hidden } = await supabase.from('material_hides').select('material_id');
  const off = new Set(((hidden ?? []) as { material_id: string }[]).map((h) => h.material_id));
  return off.size ? rows.filter((m) => !off.has(m.id)) : rows;
}

/** Add one to the church library. Guides and leaders only. */
/**
 * Who shared what, for church leadership. Never carries the address; rows
 * older than 30 days are deleted.
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
  /** A one-way, per-church mark for the site, so repeat visits can be counted. */
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

/** File one line of the record as a case, through the ordinary report path. */
/** What each Guide and Explorer has been doing: counts and dates only. */
export interface ActivityAnalysis {
  person_id: string;
  person_name: string;
  person_role: 'dm' | 'ds' | 'admin';
  /** Who they walk with. Null for an Explorer is the row that matters most. */
  walks_with: string | null;
  explorers_carried: number;
  cap: number;
  appointments_proposed: number;
  appointments_confirmed: number;
  appointments_declined: number;
  appointments_kept: number;
  resources_shared: number;
  pocket_adds: number;
  /** Things they added or shared that the database labelled as needing a look. */
  flagged: number;
  last_seen: string;
  /** Days since the app last saw them do anything. */
  quiet_days: number;
}

export async function activityAnalysis(days = 30): Promise<ActivityAnalysis[]> {
  const { data, error } = await db().rpc('guide_and_explorer_activity', { p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []) as ActivityAnalysis[];
}

export async function openCaseFromActivity(activityId: string, note?: string): Promise<string> {
  const { data, error } = await db().rpc('open_case_from_activity', {
    p_activity: activityId,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Stop somebody sharing, or let them start again. Enforced by the database function. */
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
  // A friendly message only; the database checks it too.
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
 * Resources other people have shared with you (optionally in one pairing),
 * not counting what you shared yourself.
 */
/** Publish a resource to the whole church, or unpublish it. Leadership only. */
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

  // Names are a separate, best-effort query: a missing name shows "Someone".
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

/** Share one into a pairing. */
/** Delete a resource. Its shares go with it by cascade; the activity record stays. */
/** Correct a resource already on the shelf. */
export async function updateMaterial(id: string, m: {
  title: string;
  /** Left out for a file: a file has no link to change. */
  url?: string;
  kind: MaterialKind;
  description?: string;
}): Promise<void> {
  const url = m.url?.trim();
  if (url !== undefined && !/^https?:\/\//i.test(url)) throw new Error('The address needs to start with http:// or https://');
  if (!m.title.trim()) throw new Error('Give it a name so people know what it is.');

  const { error } = await db()
    .from('materials')
    .update({
      title: m.title.trim(),
      description: m.description?.trim() || null,
      kind: m.kind,
      ...(url !== undefined ? { external_url: url } : {}),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Remove a resource. Your own (or, for leaders, any) is deleted; anyone else's
 * is only hidden from your shelf.
 */
export async function deleteMaterial(id: string): Promise<'deleted' | 'hidden'> {
  const supabase = db();
  const me_id = await uid();

  const { data: row } = await supabase
    .from('materials').select('added_by, file_path').eq('id', id).maybeSingle();
  const { data: me } = await supabase
    .from('profiles').select('role').eq('id', me_id).maybeSingle();
  const found = row as { added_by: string; file_path: string | null } | null;
  const mine = found?.added_by === me_id;
  const leads = ['admin', 'executive'].includes(String((me as { role?: string } | null)?.role ?? ''));

  if (mine || leads) {
    // Delete the file first: leaders can remove it only while the row still points at it.
    if (found?.file_path) {
      await supabase.storage.from('pairing-media').remove([found.file_path]);
    }
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return 'deleted';
  }

  const { error } = await supabase
    .from('material_hides').upsert({ material_id: id, user_id: me_id });
  if (error) throw new Error(error.message);
  return 'hidden';
}

/** What you have hidden from your own shelf, so it can be restored. */
export async function listHiddenMaterials(): Promise<Material[]> {
  const supabase = db();
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

  // The unique index is the likely refusal; say it in words.
  if (error.code === '23505') throw new Error('That is already shared with them.');

  // When the rules refuse, ask the rules why (for example, sharing is paused
  // while a case is open), rather than showing a generic permission error.
  if (/row-level security/i.test(error.message)) {
    const { data: why } = await supabase.rpc('why_library_sharing_is_paused', {
      p_pairing: pairingId,
    });
    if (typeof why === 'string' && why) throw new Error(why);
  }

  throw new Error(error.message);
}

// --- The apps a church already uses ---
// Plain https links: an installed app opens its own domain's links (Universal
// Links / App Links), and the browser opens them otherwise.

// --- Church announcements: read by the whole church, written by leadership ---

export interface Announcement {
  id: string;
  icon: string;
  title: string;
  body: string;
  when_text: string;
  is_pinned: boolean;
  /** Kept so its writer can be offered "take it down"; it does not limit readers. */
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

// --- Profile pictures ---
// Stored under avatars/<person>/ in the conversation bucket. Store the path,
// never a signed URL, which expires.

const AVATAR_BUCKET = 'pairing-media';

/** Upload a picture and return the path to store on the profile. */
export async function uploadAvatar(chosen: File): Promise<string> {
  // Resized, and the location removed, like every photo.
  const file = await shrinkImage(chosen);
  if (!file.type.startsWith('image/')) throw new Error('That is not a picture.');
  if (file.size > 5 * 1024 * 1024) throw new Error('That picture is over 5 MB. Try a smaller one.');
  const me = await uid();
  // The extension comes from the MIME type, never from the file name.
  const ext = file.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const path = `avatars/${me}/${Date.now()}.${ext}`;
  const { error } = await db().storage.from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);

  // Remove earlier pictures only after the new one uploaded; best effort.
  await removeOtherAvatars(me, path);

  return path;
}

/**
 * Delete a person's earlier avatars, keeping the one just uploaded. Uses the
 * Storage API: deleting rows from storage.objects would strand the files.
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
  }
}

/**
 * The profile of the person you walk with: only what they chose to say about
 * themselves (the column list is deliberate). Null when there is nobody.
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

/** A URL valid for an hour, or '' when there is no picture. Never store it. */
export async function avatarUrl(path: string | null | undefined): Promise<string> {
  // An unsafe path means no picture; the initials stay (lib/live/storage-path.ts).
  if (!path || !isSafeStoragePath(path)) return '';
  const { data } = await db().storage.from(AVATAR_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}

/** Every face on a screen in one request, keyed by path. Unreadable paths are absent. */
export async function avatarUrls(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return {};
  const { data } = await db().storage.from(AVATAR_BUCKET).createSignedUrls(unique, 60 * 60);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

// --- Meetings: visible to the two people in a pairing ---

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
   * Who answered, and what they said. Declined (the proposed time does not work)
   * and cancelled (an agreed time is off) are kept apart. `answer_name` is the
   * name at the time, so the record survives a deleted account.
   */
  answered_by: string | null;
  answered_at: string | null;
  answer_name: string | null;
  answer_note: string | null;
}

/** When and how each visible meeting went, in one query, for the progress report. */
export async function listMeetingTimes(): Promise<Pick<Meeting, 'pairing_id' | 'starts_at' | 'status'>[]> {
  const { data, error } = await db().from('meetings').select('pairing_id, starts_at, status');
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Meeting, 'pairing_id' | 'starts_at' | 'status'>[];
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
 * Places to meet, suggested as somebody types, through the church's own
 * `places` function: only the words and a town-level point reach the map
 * service. Throws a readable sentence; typing an address by hand still works.
 */
export async function searchPlaces(
  q: string,
  near?: { lat: number; lon: number } | null,
): Promise<PlaceSuggestion[]> {
  const words = q.trim();
  if (words.length < 3) return [];
  const { data, error } = await db().functions.invoke('places', {
    body: { q: words, ...(near ? { near } : {}) },
  });
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      const said = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (said?.error) throw new Error(said.error);
    }
    throw new Error('Place search is not available right now.');
  }
  const places = (data as { places?: unknown } | null)?.places;
  return Array.isArray(places) ? (places as PlaceSuggestion[]) : [];
}

/** Propose a time. Either person may. church_id comes from the caller's profile. */
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
    // A place for in person, or the joining link for online; empty becomes null.
    location: (meeting.location || '').trim() || null,
    notes: (meeting.notes || '').trim() || null,
    created_by: me,
  });
  if (error) throw new Error(error.message);
}

/** Every meeting ahead of this caller, across all their pairings. */
/**
 * Proposed or agreed. A cancelled or declined meeting stays on the list as a
 * record but is not "coming up" and offers no Join link.
 */
export const isStillOn = (m: Pick<Meeting, 'status'>): boolean => m.status === 'proposed' || m.status === 'confirmed';

export async function myUpcomingMeetings(limit = 5): Promise<Meeting[]> {
  const { data, error } = await db()
    .from('meetings')
    .select('id, pairing_id, title, starts_at, mode, location, notes, status, created_by, answered_by, answered_at, answer_name, answer_note')
    // Answered meetings stay listed. An hour's grace keeps one starting now "ahead".
    .gte('starts_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Meeting[];
}

/**
 * Answer a proposed time, or call off an agreed one. One database function
 * records who answered and why and notifies the other person.
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

/** Cancel rather than delete, so the other person sees it was called off. */
export async function cancelMeeting(id: string, note?: string): Promise<void> {
  await answerMeeting(id, 'cancelled', note);
}

/**
 * Meetings across the church as a leader may know them: when, online or in
 * person, and status. No title, location or notes.
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

// --- Recommendations, a Guide's private notes, and lesson series ---

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

  // "Invite them" sends the invitation first and records the status only if it
  // succeeded, so a refusal leaves the row pending. recommended_by pairs the two
  // automatically once the person is approved.
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

/** Private to the author; leaders cannot read these. */
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
 * The studies this person should see: their own copy in place of a shared
 * template they copied, and not templates they have put away.
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
 * This person's own version of a study, copying a shared one (series and
 * lessons) the first time. The copy is private to its author.
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

  // The unique index allows at most one copy per person.
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

  // Copy the lessons too, keeping their positions.
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
    // A copy without its lessons would look finished and is not; undo it.
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
    // The write policy checks author_id against the caller.
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

/** Rename a series or move it to another topic. */
/**
 * Rename a study: yours directly, or your copy of a shared one. Returns the id
 * actually written, which differs after the first edit of a shared study.
 */
export async function updateLessonSeries(
  id: string, m: { title: string; topic: string; description?: string | null },
): Promise<string> {
  const title = m.title.trim();
  if (!title) throw new Error('A series needs a title.');
  const mineId = await myVersionOf(id);
  // Ask for the row back: an UPDATE matching no rows is not an error, and the
  // screen must not say "Saved" over nothing. Send description only if given.
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

/** Put a study away: yours is deleted; a shared one is hidden for you only. */
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

  // If a copy exists, hiding is a flag on it (the unique index allows one copy).
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

// --- Feedback ---

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

/** What people have sent, newest first: everything for leaders, your own for anyone else. */
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

/** Mark one as dealt with. There is deliberately no delete. */
export async function markFeedbackHandled(id: string, handled: boolean): Promise<void> {
  const me_id = await uid();
  const { error } = await db().from('feedback').update({
    handled_at: handled ? new Date().toISOString() : null,
    handled_by: handled ? me_id : null,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Lessons and their handouts ---

export async function listLessons(seriesId: string): Promise<Lesson[]> {
  const { data, error } = await db().from('lessons')
    .select('id, series_id, church_id, author_id, title, body, position, created_at')
    .eq('series_id', seriesId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lesson[];
}

/** Add a study to a series: to your own copy, if the series is shared. */
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

/** Correct a study. */
/**
 * The matching lesson in this person's copy of its series, matched by
 * position (copies get new ids). Makes the copy on the first edit.
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

  // A lesson outside a series cannot be copied, so it is not yours to change.
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
  // Ask for the row back: a zero-row update would otherwise look like success.
  const { data, error } = await db().from('lessons').update({
    title, body: m.body.trim(),
  }).eq('id', mineId).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('That did not save. Close the series, open it again, and retry.');
  }
}

/** Remove a study from a series; on a shared series, from your copy only. */
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

export async function attachLessonFile(lessonId: string, chosen: File): Promise<void> {
  // Photographed handouts lose their location like any photo.
  const file = await shrinkImage(chosen);
  if (file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB.');
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  // The path never contains the file name.
  const ext = (file.name.split('.').pop() || '').replace(/[^a-z0-9]/gi, '').slice(0, 6);
  const path = `lessons/${me_id}/${lessonId}-${Date.now()}${ext ? '.' + ext : ''}`;
  const up = await supabase.storage.from('pairing-media')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (up.error) throw new Error(uploadRefused(up.error.message, file.name));
  const { error } = await supabase.from('lesson_files').insert({
    lesson_id: lessonId, church_id: me.church_id, added_by: me_id,
    name: file.name.slice(0, 200), path, mime: file.type || null, size_bytes: file.size,
  });
  if (error) {
    // Remove the upload again if the row fails.
    await supabase.storage.from('pairing-media').remove([path]);
    throw new Error(error.message);
  }
}

export async function lessonFileUrl(path: string): Promise<string> {
  if (!isSafeStoragePath(path)) return '';
  const { data } = await db().storage.from('pairing-media').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}

/** Take a handout off a study and delete the file (file first, while the row proves ownership). */
export async function removeLessonFile(id: string): Promise<void> {
  const supabase = db();
  const { data: row } = await supabase.from('lesson_files').select('path').eq('id', id).maybeSingle();
  const path = (row as { path?: string } | null)?.path;
  if (path) await supabase.storage.from('pairing-media').remove([path]);
  const { error } = await supabase.from('lesson_files').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listAssignments(): Promise<LessonAssignment[]> {
  const { data, error } = await db().from('lesson_assignments').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as LessonAssignment[];
}

// --- Reading progress: each person records only their own reads ---

/** How far through a set of lessons somebody has got. */
export interface Reading {
  done: number;
  total: number;
}

/** Every lesson as an id and its series, in one query. */
export async function listLessonIndex(): Promise<{ id: string; series_id: string }[]> {
  const { data, error } = await db().from('lessons')
    .select('id, series_id')
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; series_id: string }[];
}

/** Lessons a member has marked as read; empty when the caller may not see them. */
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
  // Marking twice is fine: the row exists either way.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function unmarkLessonRead(lessonId: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('lesson_reads')
    .delete().eq('lesson_id', lessonId).eq('user_id', me_id);
  if (error) throw new Error(error.message);
}

// --- Notifications ---

export interface AppNotification {
  id: string; user_id: string; type: string;
  title: string; body: string; read_at: string | null; created_at: string;
}

/** Only the caller's own. */
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

// --- Safeguarding ---

/** The five reasons offered; keep in step with the database CHECK constraint. */
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
 * Report another member. The church comes from the caller's profile. The
 * person reported is not notified; every Director of the church is.
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

  // File the report first and attach evidence after, so a failed upload cannot lose it.
  if (reportId && args.evidence?.length) {
    for (const file of args.evidence) {
      try { await attachReportEvidence(reportId, file); } catch { /* the report stands */ }
    }
  }
  return reportId;
}

/** Attach one file to a report you raised. Files live under reports/<you>/. */
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
  if (!isSafeStoragePath(path)) return '';
  const { data } = await db().storage.from('pairing-media').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}

/** The church's reports. Directors and Executive Directors only. */
export async function listReports(): Promise<LiveReport[]> {
  const { data, error } = await db()
    .from('reports')
    .select('id, reporter_id, subject_id, pairing_id, reason, detail, status, created_at, decided_by, decided_at, outcome, guild_post_id, guild_post_body')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LiveReport[];
}

/** Close a report. "Dismissed" is as easy to record as any outcome. Reports cannot be deleted. */
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

// --- Files in a conversation ---
// Private bucket, 10 MB a file, a fixed list of types; readable only by the
// two people in the pairing.

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
/** Keep in step with the bucket's file_size_limit. */
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
 * Send a file: upload first, then the row (removing the upload if the row
 * fails). The path is <pairing_id>/<uuid>, never the file name.
 */
export async function sendPairingFile(pairingId: string, original: File): Promise<PairingFile> {
  const client = db();

  // Resize first, so phone photos fit the limit, and drop the location data.
  const file = await shrinkImage(original);
  const me = await uid();

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is 10 MB. `
      + 'Try a photo rather than a video, or share a link instead.',
    );
  }

  // uuid(), not crypto.randomUUID(): that needs a secure context and Safari 15.4+.
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
      // The database refuses titles over 200 characters or with direction-override characters.
      title: plainTitle(file.name) || 'Attachment',
      mime: file.type || '',
      size: file.size,
      path,
    })
    .select('id, pairing_id, owner_id, title, mime, size, path, created_at')
    .single();

  if (error) {
    await client.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {});
    throw new Error(error.message);
  }
  return data as PairingFile;
}

/** A signed URL valid for one hour (the bucket is private). */
export async function pairingFileUrl(path: string): Promise<string> {
  // The path was written by the other person; check it before signing (lib/live/storage-path.ts).
  const { data, error } = await db().storage.from(MEDIA_BUCKET).createSignedUrl(safeStoragePath(path), 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Take back something you sent. Only the sender may. */
export async function removePairingFile(file: PairingFile): Promise<void> {
  const client = db();
  const { error } = await client.from('pairing_media').delete().eq('id', file.id);
  if (error) throw new Error(error.message);
  // Remove the row first: an orphaned file is invisible; an orphaned row is a broken attachment.
  await client.storage.from(MEDIA_BUCKET).remove([file.path]).catch(() => {});
}

// --- Suspending and removing members ---
// suspendMember switches the account off at once (it keeps its history and can
// be restored); removeMemberByLeader deletes it. The database decides who may
// act on whom; each call returns 'ok' or the reason it was refused.

/** Suspend ("jail"). Returns 'ok', or the reason it was refused. */
export async function suspendMember(userId: string, reason?: string): Promise<string> {
  const { data, error } = await db().rpc('suspend_member', {
    p_target: userId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** Lift a suspension. Pairings are not restored. */
export async function restoreMember(userId: string): Promise<string> {
  const { data, error } = await db().rpc('restore_member', { p_target: userId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** Remove from the church entirely ("kick"), under the same authority rules. */
export async function removeMemberByLeader(userId: string): Promise<string> {
  // Delete their stored files first: once the account (and so the profile) is
  // gone, nothing can tell which church the files belonged to. Only the Storage
  // API removes both the file and its row.
  await removeStoredFilesFor(userId);

  const { data, error } = await db().rpc('remove_member_by_leader', { p_target: userId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** Clear everything a member has stored before their account goes. Best effort. */
async function removeStoredFilesFor(person: string): Promise<void> {
  for (const prefix of ['avatars', 'lessons']) {
    try {
      const { data, error } = await db().storage.from(AVATAR_BUCKET).list(`${prefix}/${person}`);
      if (error || !data?.length) continue;
      await db().storage.from(AVATAR_BUCKET)
        .remove(data.map((f) => `${prefix}/${person}/${f.name}`));
    } catch {
    }
  }
}

/** Whether the caller may act on this person, so the screen can hide what would fail. */
export async function disciplineCheck(userId: string): Promise<string> {
  const { data, error } = await db().rpc('discipline_check', { p_target: userId });
  if (error) return 'unavailable';
  return String(data ?? 'unavailable');
}

// --- Trials ---
// Both sides answer in their own words before a decision. The Director who
// opens a case is head judge until an Executive Director takes the seat.

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

/** Open a case and summon the other side (named directly or taken from a report). */
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

/** Decide the case. Only the head judge; the verdict uses the member-list functions. */
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

/** Say something in a case. A suspended person still may, so they can answer. */
export async function speakInTrial(trialId: string, body: string): Promise<void> {
  const me = await uid();
  const { error } = await db()
    .from('trial_statements')
    .insert({ trial_id: trialId, author_id: me, body });
  if (error) throw new Error(error.message);
}

// --- Guilds ---
// An Explorer sees their guild and its size, never the list of names.

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
  /** Set when the author corrected it. */
  edited_at?: string | null;
  /** Set when the post was taken down; `body` is then empty. */
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

/** Correct your own guild post. Leaders can take a post down, never rewrite it. */
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
 * Report a guild post. Only the post id is sent: the board is pseudonymous,
 * so the reporter cannot name the author. The text is copied into the report.
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

/** Take a guild post down. Church leadership only; logged before the delete. */
export async function removeGuildPost(postId: string): Promise<boolean> {
  const { data, error } = await db().rpc('remove_guild_post', { p_post: postId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// --- Guild metrics: every word in `health` comes from guild_metrics() ---

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

/** One entry in the church's record of who was let in, switched off or removed. */
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

/** Withdraw a guardian's consent. */
export async function withdrawGuardianConsent(memberId: string): Promise<void> {
  const { error } = await db().rpc('withdraw_guardian_consent', { p_member: memberId });
  if (error) throw new Error(error.message);
}

/** The discipline record. Names and roles are copied in, so it outlives the people. */
export async function disciplineHistory(): Promise<DisciplineEntry[]> {
  const { data, error } = await db().rpc('discipline_history');
  if (error) throw new Error(error.message);
  return (data ?? []) as DisciplineEntry[];
}

// --- Admin reports: who may see, claim and answer one is decided by the database ---

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

// --- The pocket: personal shortcuts, private to their owner ---

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
  // owner_id defaults to auth.uid() in the database; do not send it.
  const { error } = await db().from('pocket_apps').insert({ url, label });
  if (error) throw new Error(error.message);
}

export async function removePocketApp(id: string): Promise<void> {
  const { error } = await db().from('pocket_apps').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- The Hall of Justice: who may take a seat is decided by the database ---

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

/** Watch a hearing. Observers can read but never write. */
export async function joinTrial(trialId: string): Promise<void> {
  const { error } = await db().rpc('join_trial', { p_trial: trialId });
  if (error) throw new Error(error.message);
}

// --- The next thing to read ---
// What the Explorer has actually done, which is not their journey stage.

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
