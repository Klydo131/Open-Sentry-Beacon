'use client';

// The court room's calls to the church's database.
//
// Every rule lives in supabase/migrations/20261020160000_the_court_room.sql.
// This file only asks: who may enter, read, speak, present or decide is the
// database's answer, and a refusal comes back as a sentence to show as it is.
//
// TWO DATABASES, ONE SCREEN. A church's database gets the court room's update
// when whoever looks after it applies that migration, which may be after this
// screen is deployed. courtEdition() asks for the door: a database that has
// never heard of it answers "no such function", and the page keeps the room
// it had before, working, until the update is applied.

import { useEffect, useState } from 'react';
import { db } from '@/lib/live/data';
import type { RecordEntry } from '@/lib/court/forensics';

export const COURT_BUCKET = 'court-exhibits';

export interface CourtDoor {
  open: boolean;
  until: string | null;
  minutes: number;
  leader: boolean;
  two_step: boolean;
  /** What the door needs next: a code, a password, two-step sign-in set up, or nothing. */
  needs: 'code' | 'password' | 'two_step' | 'sign_in' | null;
}

export type CourtPlace = 'judge' | 'opener' | 'accused' | 'reporter' | 'witness' | 'observer' | null;

export interface CourtCaseRow {
  id: string;
  summary: string;
  status: 'open' | 'closed';
  verdict: 'dismissed' | 'suspended' | 'removed' | null;
  verdict_note: string | null;
  opened_at: string;
  closed_at: string | null;
  subject_name: string;
  subject_role: string | null;
  opener_name: string;
  judge_name: string;
  escalation: 'none' | 'requested' | 'accepted' | null;
  gallery_open: boolean;
  seal_hash: string | null;
  my_place: CourtPlace;
  may_watch: boolean;
  watching: number | null;
  exhibits: number;
  statements: number;
  touched_at: string;
}

export interface CourtPerson {
  id: string;
  name: string;
  part: 'accused' | 'reporter' | 'witness' | 'observer';
  since: string;
}

export interface CourtStatement {
  id: string;
  author_id: string | null;
  author_name: string;
  for_name: string | null;
  body: string;
  sha256: string;
  at: string;
}

export interface CourtExhibit {
  id: string;
  label: string;
  kind: 'file' | 'writing';
  title: string;
  note: string | null;
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  writing: string | null;
  sha256: string;
  path: string | null;
  shown_to: 'everyone' | 'bench';
  entered_name: string;
  entered_at: string;
}

export interface CourtCaseFull {
  case: {
    id: string;
    summary: string;
    status: 'open' | 'closed';
    verdict: 'dismissed' | 'suspended' | 'removed' | null;
    verdict_note: string | null;
    opened_at: string;
    closed_at: string | null;
    subject_id: string | null;
    subject_name: string;
    opener_name: string;
    judge_id: string | null;
    judge_name: string;
    escalation: 'none' | 'requested' | 'accepted' | null;
    gallery_open: boolean;
    seal_hash: string | null;
    sealed_at: string | null;
    my_place: Exclude<CourtPlace, null>;
    i_lead: boolean;
    may_speak: boolean;
    may_present: boolean;
    may_decide: boolean;
  };
  people: CourtPerson[];
  statements: CourtStatement[];
  exhibits: CourtExhibit[];
  /** The whole chain, for the bench only; null for everybody else. */
  record: RecordEntry[] | null;
}

export interface RecordCheck {
  holds: boolean;
  entries: number;
  head: string;
  broken_at: number | null;
  statements_differing: number;
  exhibits_differing: number;
  seal: string | null;
  seal_holds: boolean;
}

/** The database's refusal, as the sentence it was written in. */
function fail(error: { message?: string; code?: string } | null): never {
  throw Object.assign(new Error(error?.message || 'Something went wrong. Please try again.'), {
    code: error?.code,
  });
}

/** The door is shut: the pass ran out while the room was open. */
export function isCourtLocked(cause: unknown): boolean {
  return cause instanceof Error && /court room is locked/i.test(cause.message);
}

/** A database that has not had the court room's update yet. */
function isMissing(error: { message?: string; code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
    || /could not find the function|function public\.court_door\(\) does not exist/i.test(error?.message ?? '');
}

/**
 * Which court room this church's database has: 'court' after the update,
 * 'cases' before it. null when the question could not be asked (no signal).
 */
export async function courtEdition(): Promise<{ edition: 'court' | 'cases'; door: CourtDoor | null } | null> {
  try {
    const { data, error } = await db().rpc('court_door');
    if (error) {
      if (isMissing(error)) return { edition: 'cases', door: null };
      return null;
    }
    return { edition: 'court', door: data as CourtDoor };
  } catch {
    return null;
  }
}

/**
 * The same question as a hook, for the screens that point at the court room.
 * Unreachable counts as the room before the update, which works everywhere.
 */
export function useCourtEdition(): 'court' | 'cases' | null {
  const [edition, setEdition] = useState<'court' | 'cases' | null>(null);
  useEffect(() => {
    let gone = false;
    void courtEdition().then((found) => { if (!gone) setEdition(found?.edition ?? 'cases'); });
    return () => { gone = true; };
  }, []);
  return edition;
}

export async function courtDoor(): Promise<CourtDoor> {
  const { data, error } = await db().rpc('court_door');
  if (error) fail(error);
  return data as CourtDoor;
}

export async function courtCases(): Promise<CourtCaseRow[]> {
  const { data, error } = await db().rpc('court_cases');
  if (error) fail(error);
  return (data ?? []) as CourtCaseRow[];
}

export async function courtCase(id: string): Promise<CourtCaseFull> {
  const { data, error } = await db().rpc('court_case', { p_trial: id });
  if (error) fail(error);
  return data as CourtCaseFull;
}

export async function courtSay(id: string, body: string): Promise<void> {
  const { error } = await db().rpc('court_say', { p_trial: id, p_body: body });
  if (error) fail(error);
}

export async function courtRecordFor(id: string, person: string, body: string): Promise<void> {
  const { error } = await db().rpc('court_record_for', { p_trial: id, p_person: person, p_body: body });
  if (error) fail(error);
}

/** Functions that answer 'ok' or the reason they refused. */
async function sentence(fn: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await db().rpc(fn, args);
  if (error) fail(error);
  return String(data ?? 'Something went wrong. Please try again.');
}

export const courtSummon = (id: string, person: string) =>
  sentence('court_summon', { p_trial: id, p_person: person });
export const courtGallery = (id: string, open: boolean) =>
  sentence('court_gallery', { p_trial: id, p_open: open });
export const courtCallJudge = (id: string) => sentence('call_head_judge', { p_trial: id });
export const courtTakeSeat = (id: string) => sentence('take_head_judge', { p_trial: id });
export const courtDecide = (id: string, verdict: 'dismissed' | 'suspended' | 'removed', note: string) =>
  sentence('close_trial', { p_trial: id, p_verdict: verdict, p_note: note.trim() || null });

/** Take a seat in the gallery. Written on the record. */
export async function courtWatch(id: string): Promise<void> {
  const { error } = await db().rpc('join_trial', { p_trial: id });
  if (error) fail(error);
}

/** Open a case about somebody, with the person who raised it if there is one. */
export async function courtOpen(args: { subjectId: string; summary: string; otherId?: string | null }): Promise<string> {
  const { data, error } = await db().rpc('open_trial', {
    p_subject: args.subjectId,
    p_summary: args.summary.trim(),
    p_report: null,
    p_other: args.otherId || null,
  });
  if (error) fail(error);
  return String(data);
}

export async function courtCheckRecord(id: string): Promise<RecordCheck> {
  const { data, error } = await db().rpc('court_check_record', { p_trial: id });
  if (error) fail(error);
  return data as RecordCheck;
}

export async function courtExported(id: string): Promise<void> {
  const { error } = await db().rpc('court_exported', { p_trial: id });
  if (error) fail(error);
}

/** Somebody opened an exhibit, or their device checked its fingerprint. */
export async function courtExhibitHandled(id: string, what: 'viewed' | 'matched' | 'differed'): Promise<void> {
  const { error } = await db().rpc('court_exhibit_handled', { p_exhibit: id, p_what: what });
  if (error) fail(error);
}

/** Enter something written as an exhibit. Returns its letter. */
export async function courtEnterWriting(args: {
  trialId: string;
  title: string;
  writing: string;
  note?: string;
  benchOnly?: boolean;
}): Promise<string> {
  const { data, error } = await db().rpc('court_exhibit_write', {
    p_trial: args.trialId,
    p_title: args.title.trim(),
    p_writing: args.writing,
    p_note: args.note?.trim() || null,
    p_shown_to: args.benchOnly ? 'bench' : 'everyone',
  });
  if (error) fail(error);
  return String(data);
}

/**
 * Enter a file as an exhibit: its fingerprint first, then the file, then the
 * letter. The fingerprint is taken by the caller on this device and is on the
 * record before the upload starts.
 */
export async function courtEnterFile(args: {
  trialId: string;
  file: Blob;
  fileName: string;
  mime: string;
  sha256: string;
  title: string;
  note?: string;
  benchOnly?: boolean;
}): Promise<string> {
  const client = db();
  const { data: begun, error: beginError } = await client.rpc('court_exhibit_begin', {
    p_trial: args.trialId,
    p_title: args.title.trim(),
    p_file_name: args.fileName,
    p_mime: args.mime,
    p_size: args.file.size,
    p_sha256: args.sha256,
    p_note: args.note?.trim() || null,
    p_shown_to: args.benchOnly ? 'bench' : 'everyone',
  });
  if (beginError) fail(beginError);
  const { id, path } = begun as { id: string; path: string };
  const { error: upError } = await client.storage
    .from(COURT_BUCKET)
    .upload(path, args.file, { contentType: args.mime, upsert: false });
  if (upError) fail(upError);
  const { data: letter, error: sealError } = await client.rpc('court_exhibit_seal', { p_exhibit: id });
  if (sealError) fail(sealError);
  return String(letter);
}

/** An exhibit's bytes, read through the same rules as everything else. */
export async function courtExhibitBytes(path: string): Promise<Blob> {
  const { data, error } = await db().storage.from(COURT_BUCKET).download(path);
  if (error || !data) fail(error as { message?: string } | null);
  return data;
}
