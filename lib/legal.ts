// The Terms of Use and the Privacy Notice: which version is current, and
// whether somebody has agreed to it.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 28 October 2026: "update our UI for agreeing on 'Terms' and
// 'Privacy Policy'. I want all of those to be handled professionally so that
// we won't face any legalities in the future."
//
// WHAT "PROFESSIONALLY" MEANS HERE, point by point:
//   * BOTH DOCUMENTS ARE ONE TAP AWAY FROM THE BOX, as links that open beside
//     the form, so nobody agrees to something they could not read.
//   * THE BOX STARTS UNTICKED and the button waits for it. A box that arrives
//     ticked is not agreement.
//   * AGREEING TO THE TERMS IS SEPARATE FROM THE PERMISSION TO KEEP SENSITIVE
//     INFORMATION (components/live/ConsentWording.tsx). The Data Privacy Act
//     wants that consent specific and on its own, not folded into terms.
//   * WHAT WAS AGREED IS RECORDED: the version of each document, and when,
//     stamped by the database's own clock (20261028120000_what_was_agreed_is_recorded).
//   * A CHANGED DOCUMENT IS ASKED ABOUT AGAIN. Raise a version below and
//     everybody meets the agreement step once more, with what changed, before
//     the app opens (components/live/ConsentStep.tsx, the sample's
//     components/ConsentHost.tsx).
//
// NOT LEGAL ADVICE. The documents are drafts written for a church in the
// Philippines and should be read by a lawyer before a church relies on them
// (docs/DATA-PROTECTION.md).
// ---------------------------------------------------------------------------

/** The Terms of Use now in force. Change it only when the terms change: everybody is asked again. */
export const TERMS_VERSION = '2026-10-28';
/** The Privacy Notice now in force. The same rule. */
export const PRIVACY_VERSION = '2026-10-28';

/** The date each version took effect, in words. */
export const LEGAL_EFFECTIVE = '28 October 2026';

/** What changed in the current versions, said to somebody asked to agree again. */
export const WHAT_CHANGED: string[] = [
  'There are now Terms of Use: what you and your church can expect of each other in this app.',
  'The Privacy Notice names your church and its Data Protection Officer, once your church has filled them in.',
];

export interface AgreementRecord {
  terms_version?: string | null;
  privacy_version?: string | null;
}

/** Whether this person has agreed to the documents now in force. */
export function hasAgreedToCurrent(record: AgreementRecord | null | undefined): boolean {
  return !!record && record.terms_version === TERMS_VERSION && record.privacy_version === PRIVACY_VERSION;
}

/** Whether they agreed to an earlier version: asked again, with what changed. */
export function agreedToEarlier(record: AgreementRecord | null | undefined): boolean {
  return !!record && !!(record.terms_version || record.privacy_version) && !hasAgreedToCurrent(record);
}

/**
 * Whether this database can record an agreement yet: the profile carries the
 * columns once 20261028120000_what_was_agreed_is_recorded is applied. Until
 * then nobody is asked, because an answer that cannot be saved would stop
 * every member at the door.
 */
export function canRecordAgreement(profile: object | null | undefined): boolean {
  return !!profile && 'terms_version' in profile;
}

/** A link to one of the documents, carrying the church when it is known so it can be named. */
export function legalHref(doc: 'terms' | 'privacy', churchId?: string | null): string {
  return churchId ? `/${doc}?church=${encodeURIComponent(churchId)}` : `/${doc}`;
}

/**
 * What a church's Director fills in for the documents to name: who is
 * responsible for the information and where, and who answers for privacy.
 */
export interface ChurchLegalDetails {
  legal_name: string | null;
  legal_address: string | null;
  dpo_name: string | null;
  dpo_email: string | null;
}

/** The same, as a form holds it: every field a string, empty when not given. */
export type ChurchLegalInput = { [K in keyof ChurchLegalDetails]: string };

/** The church's legal identity, as the documents show it. */
export interface ChurchLegal extends ChurchLegalDetails {
  name: string;
}

/** Whether a church has filled in what the Privacy Notice needs. */
export function legalComplete(c: ChurchLegal | null | undefined): boolean {
  return !!c && !!c.legal_name?.trim() && !!c.legal_address?.trim() && !!c.dpo_name?.trim() && !!c.dpo_email?.trim();
}
