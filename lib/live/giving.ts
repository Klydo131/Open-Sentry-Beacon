'use client';

// Members' gifts that keep a hub running.
//
// ---------------------------------------------------------------------------
// WHAT IT IS. Each church pays its own Supabase bill (the owner's standard:
// Pro, $25 a month plus 12% GST) from members' gifts to its own treasury.
// The app shows how to give and how close the month is; it never moves money.
// Gifts go to the church's GCash or bank account, and a treasurer named by a
// Director records each one here. Every rule is the database's
// (supabase/migrations/20261026120000_a_hub_is_kept_running_by_gifts.sql):
// members see the goal and the month's total and never a gift or a giver; only
// treasurers see each gift.
//
// OPTIONAL, AND OFF UNTIL A PROJECT SWITCHES IT ON (HUB_GIVING = 'on' in
// app_settings, 20261026200000_giving_is_a_choice). Switched off, or on a
// database without the update, there is simply no giving: the card is not
// drawn and the Settings folder not offered (lib/live/not-yet.ts).
// ---------------------------------------------------------------------------

import { db } from '@/lib/live/data';
import { isMissingFromDatabase } from '@/lib/live/not-yet';

/** What everybody in the church sees. */
export interface GivingCard {
  /** False when this project has not switched giving on. Absent before 20261026200000. */
  enabled?: boolean;
  set_up: boolean;
  i_lead: boolean;
  i_keep_the_books: boolean;
  currency?: string;
  monthly_goal?: number;
  purpose?: string;
  gcash_name?: string | null;
  gcash_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  qr_image?: string | null;
  /** 'YYYY-MM', in Philippine time. */
  month?: string;
  given_this_month?: number;
  given_last_month?: number;
}

/** How a Director sets it up. */
export interface GivingDetails {
  currency: string;
  monthly_goal: number;
  purpose: string;
  gcash_name: string;
  gcash_number: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  qr_image: string | null;
}

export interface Treasurer { id: string; name: string; role: string }

export type GiftMethod = 'gcash' | 'maya' | 'bank' | 'cash' | 'other';

export const METHODS: { id: GiftMethod; label: string }[] = [
  { id: 'gcash', label: 'GCash' },
  { id: 'maya', label: 'Maya' },
  { id: 'bank', label: 'Bank transfer' },
  { id: 'cash', label: 'Cash' },
  { id: 'other', label: 'Other' },
];

export interface Gift {
  id: string;
  amount: number;
  received_on: string;
  method: GiftMethod;
  note: string | null;
  recorded_by: string;
}

function fail(error: { message?: string } | null): never {
  throw new Error(error?.message || 'Something went wrong. Please try again.');
}

/**
 * The church's card, or null when there is no giving here: this project has
 * not switched it on, or its database does not have it yet.
 */
export async function givingCard(): Promise<GivingCard | null> {
  const { data, error } = await db().rpc('hub_giving_card');
  if (error) {
    if (isMissingFromDatabase(error)) return null;
    fail(error);
  }
  const card = data as GivingCard;
  if (card?.enabled === false) return null;
  // numeric arrives as a number or a string, depending on the data API.
  for (const key of ['monthly_goal', 'given_this_month', 'given_last_month'] as const) {
    if (card[key] !== undefined) card[key] = Number(card[key]);
  }
  return card;
}

export async function saveGiving(details: GivingDetails): Promise<void> {
  const { error } = await db().rpc('hub_giving_save', {
    p_currency: details.currency,
    p_monthly_goal: details.monthly_goal,
    p_purpose: details.purpose,
    p_gcash_name: details.gcash_name,
    p_gcash_number: details.gcash_number,
    p_bank_name: details.bank_name,
    p_bank_account_name: details.bank_account_name,
    p_bank_account_number: details.bank_account_number,
    p_qr_image: details.qr_image ?? '',
  });
  if (error) fail(error);
}

export async function treasurers(): Promise<{ treasurers: Treasurer[]; candidates: Treasurer[] }> {
  const { data, error } = await db().rpc('hub_treasurers_list');
  if (error) fail(error);
  return data as { treasurers: Treasurer[]; candidates: Treasurer[] };
}

export async function nameTreasurer(personId: string): Promise<void> {
  const { error } = await db().rpc('hub_treasurer_name', { p_person: personId });
  if (error) fail(error);
}

export async function removeTreasurer(personId: string): Promise<void> {
  const { error } = await db().rpc('hub_treasurer_remove', { p_person: personId });
  if (error) fail(error);
}

export async function recordGift(gift: { amount: number; received_on: string; method: GiftMethod; note: string }): Promise<void> {
  const { error } = await db().rpc('hub_gift_record', {
    p_amount: gift.amount,
    p_received_on: gift.received_on,
    p_method: gift.method,
    p_note: gift.note,
  });
  if (error) fail(error);
}

export async function removeGift(id: string): Promise<void> {
  const { error } = await db().rpc('hub_gift_remove', { p_gift: id });
  if (error) fail(error);
}

/** One month's gifts ('YYYY-MM'; empty for this month). Treasurers only. */
export async function giftsOf(month: string): Promise<{ month: string; total: number; gifts: Gift[] }> {
  const { data, error } = await db().rpc('hub_gifts_list', { p_month: month });
  if (error) fail(error);
  const out = data as { month: string; total: number; gifts: Gift[] };
  return {
    month: out.month,
    total: Number(out.total),
    gifts: (out.gifts ?? []).map((g) => ({ ...g, amount: Number(g.amount) })),
  };
}

/** ₱1,710.00 for PHP; other currencies in their own form. */
export function money(amount: number, currency = 'PHP'): string {
  try {
    return new Intl.NumberFormat(currency === 'PHP' ? 'en-PH' : 'en', {
      style: 'currency', currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** "October 2026" for '2026-10'. */
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Today in Philippine time, as the database counts it: 'YYYY-MM-DD'. */
export function todayInManila(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
}

/**
 * A picture shrunk to fit in the row: the QR code at most 480px across, as
 * PNG (sharp edges stay scannable). Returns a data: address.
 */
export async function shrinkPicture(file: File, max = 480): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP picture of the QR code.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That picture could not be read.'));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('That picture could not be read.');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/png');
    if (out.length > 400_000) throw new Error('That picture is too detailed. Crop it to just the QR code and try again.');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
