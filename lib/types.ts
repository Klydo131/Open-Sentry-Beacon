// The shape of everything the app stores. The sample church keeps to these
// exactly, so the screens do not care where the data comes from.

import type { Reaction } from '@/lib/talk/reactions';

// The Church Board has no account, so it is not a role.
export type Role = 'executive' | 'admin' | 'dm' | 'ds';

/** Online or face to face. */
export type MeetingMode = 'online' | 'in_person';
export type Stage =
  | 'create'
  | 'connect'
  | 'care'
  | 'call'
  | 'cultivate'
  | 'commission';
export type Track = 'traditional' | 'digital';
export type MaterialType = 'pdf' | 'video' | 'audio' | 'image' | 'link';
export type PairingStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  preferred_contact?: string;
  birthday?: string;
  gender?: string;
  status?: string;
  // The live schema's name for `status` above (`status` already means other things there).
  life_status?: string;
  /**
   * The guardian set, for a member under eighteen. Only leadership can write
   * these (record_guardian_consent); a member cannot consent for themselves.
   */
  guardian_name?: string | null;
  guardian_member_id?: string | null;
  guardian_consent_at?: string | null;
  guardian_consent_by?: string | null;
  topics_of_interest: string[];
  city_of_residence?: string;
  work_industry?: string;
  preferred_language: string;
  /**
   * Set while the member is suspended: they keep their place and history but
   * cannot sign in, message or be paired. NULL means active.
   */
  suspended_at?: string | null;
  suspended_by?: string | null;
  suspended_reason?: string | null;
  avatar?: string; // chosen preset (emoji)
  photo?: string; // uploaded picture as a data URL (on-device in the demo)
  /**
   * Live only: the uploaded picture's storage path (avatars/<user id>/). Signed
   * when drawn, because a stored signed URL expires.
   */
  photo_path?: string | null;
  is_approved: boolean;
  /**
   * When this person was approved. NULL when not yet approved, and also for
   * approvals made before the date was recorded; `is_approved` says which.
   */
  approved_at?: string | null;
  approved_by?: string | null;
  // A Guide who vouched for this sign-up; a note for the admin, not a gate.
  recommended_by?: string;
  recommended_at?: string;
  consent_at?: string; // when the seeker accepted the privacy notice
  /** When they chose a password and actually arrived (created_at is when they were invited). */
  signup_completed_at?: string | null;
  /** Still using the invitation's password. A reminder, not a permission. */
  password_is_temporary?: boolean;
  created_at: string;
}

// A meeting between a Guide and an Explorer; either can schedule or cancel.
export interface Meeting {
  id: string;
  pairing_id: string;
  title: string;
  when: string; // ISO datetime
  mode: 'online' | 'in_person';
  location?: string;
  created_by: string;
  status: 'scheduled' | 'cancelled';
  created_at: string;
}

// A lesson a Guide assigned to a pairing; the content lives in lib/lessons.ts.
export interface LessonAssignment {
  id: string;
  pairing_id: string;
  lesson_id: string;
  status: 'assigned' | 'completed';
  created_at: string;
  completed_at?: string;
  /** Set when this lesson came from a series rather than being picked alone. */
  series_id?: string;
  /** Position within that series, from 0. */
  series_order?: number;
}

// A course on one topic, walked through in order. Grouped by topic, not by
// journey stage: an Explorer may see a series, never their stage.
export interface LessonSeries {
  id: string;
  title: string;
  description?: string;
  /** The area of interest. Free text, so a church can use its own language. */
  topic: string;
  /** Ordered. Position in this array is the order they are walked through. */
  lesson_ids: string[];
  is_published: boolean;
  created_at: string;
  /**
   * A drawing for the series, by its id in lib/demo/drawings.ts. Sample app
   * only; the live app keeps a drawing as a file on its study.
   */
  drawing_id?: string;
}

// A prayer request. Always visible to the Guide; if shared, it also appears
// on the church's prayer wall without a name.
export interface PrayerRequest {
  id: string;
  /** The Explorer this request lives with, whoever wrote it. */
  ds_id: string;
  /** Who wrote it. Missing on older requests (all the Explorer's own); use prayerAuthor(). */
  author_id?: string;
  body: string;
  share_with_board: boolean;
  status: 'open' | 'praying' | 'answered';
  created_at: string;
}

/** Who wrote a prayer request. */
export function prayerAuthor(r: Pick<PrayerRequest, 'ds_id' | 'author_id'>): string {
  return r.author_id ?? r.ds_id;
}

// An Explorer's own study notes and files.
export interface SeekerMedia {
  id: string;
  ds_id: string;
  title: string;
  type: MaterialType;
  note?: string;
  external_url?: string;
  created_at: string;
}

// A file shared inside one pairing. The bytes live in IndexedDB
// (lib/localMedia.ts), never in this row, which is saved to localStorage.
// Visibility follows the pairing (mediaFor() in lib/demo/store.tsx).
export interface PairingMedia {
  id: string;
  pairing_id: string;
  owner_id: string;
  kind: MaterialType;
  title: string;
  mime?: string;
  size: number;
  created_at: string;
}

// A Guide's private note about an Explorer: never shown to the Explorer or to leaders.
export interface SeekerNote {
  id: string;
  pairing_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

// A Guide's private reminder.
export interface FollowUp {
  id: string;
  pairing_id: string;
  owner_id: string;
  title: string;
  due_on?: string; // YYYY-MM-DD, date only — the time of day never matters here
  done_at?: string;
  created_at: string;
}

export interface Pairing {
  id: string;
  dm_id: string;
  ds_id: string;
  track: Track;
  journey_stage: Stage;
  status: PairingStatus;
  /** When these two were connected. The start of the track record. */
  created_at: string;
  /**
   * When the pairing was archived. NULL for active pairings and for ones
   * archived before the date was recorded. Never use `updated_at` instead.
   */
  ended_at?: string | null;
}

export interface Message {
  id: string;
  pairing_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at?: string;
  /** Set when the author changed the wording. The previous wording is kept. */
  edited_at?: string | null;
  /**
   * Set when the author took the message back. `body` is then empty, so never
   * draw a deleted message as an empty bubble.
   */
  deleted_at?: string | null;
  deleted_by?: string | null;
  /** The earlier message, in the same conversation, that this one answers. */
  reply_to?: string | null;
}

export interface Material {
  id: string;
  title: string;
  description?: string;
  type: MaterialType;
  external_url?: string;
  topics: string[];
  is_published: boolean;
  created_at: string;
}

export interface MaterialShare {
  id: string;
  material_id: string;
  pairing_id: string;
  shared_by: string;
  note?: string;
  created_at: string;
}

// --- Blog posts ---
// `visibility` (draft or published) and `audience` (who it reaches) are
// separate, so a post can be taken off the front page without deleting it.
export type BlogVisibility = 'private' | 'published';
/**
 * Who a post is for (mirrors the live enum):
 *   church   everybody in the church
 *   all      the people the writer walks with
 *   selected named people only
 */
export type BlogAudienceKind = 'all' | 'church' | 'selected';

export interface BlogPost {
  id: string;
  /** The Guide who wrote it. Only they may edit, hide or delete it. */
  author_id: string;
  title: string;
  body: string;
  /** 'private' means a draft: nobody but the author sees it, ever. */
  visibility: BlogVisibility;
  /** 'all' reaches every Explorer this Guide is paired with, now and later. */
  audience: BlogAudienceKind;
  created_at: string;
  updated_at?: string;
  /** Photos and a short clip, shown on Home's billboard and in the post. */
  media?: PostMedia[];
}

/**
 * A photo or short clip on a post or notice. `src` is anything the browser
 * can show: a bundled picture, a blob: URL, or a signed link.
 */
export interface PostMedia {
  kind: 'image' | 'video';
  src: string;
  /** Said for a photo, for anybody who cannot see it. */
  alt?: string;
}

/** Only used when audience === 'selected'. One row per named Explorer. */
export interface BlogAudienceEntry {
  id: string;
  post_id: string;
  ds_id: string;
}

/** One row per person the first time they open a post; the writer sees a count, never names. */
export interface BlogView {
  id: string;
  post_id: string;
  viewer_id: string;
  created_at: string;
}

export interface JourneyEvent {
  id: string;
  pairing_id: string;
  from_stage?: Stage;
  to_stage: Stage;
  changed_by: string;
  note?: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  read_at?: string;
  created_at: string;
}

// A behaviour event, kept on the device; only name-free totals are shown.
export interface AnalyticsEvent {
  id: string;
  user_id: string;
  type:
    | 'signin'
    | 'message'
    | 'material_share'
    | 'material_open'
    | 'stage_advance'
    | 'approve'
    | 'tutorial_done'
    | 'media_upload'
    | 'profile_update'
    | 'recommend'
    | 'prayer_request'
    | 'lesson_assigned'
    | 'lesson_completed'
    | 'meeting_scheduled'
    | 'invite_sent'
    | 'invite_accepted'
    | 'member_kicked'
    | 'member_disapproved'
    | 'note_added'
    | 'followup_added'
    | 'followup_done'
    | 'blog_written'
    // Analytics records the reason for a report, never the person reported.
    | 'report_raised'
    | 'report_resolved';
  meta?: string;
  at: string;
}

// An invitation (sample app): the invited person opens /join?token=... and
// only then does an account exist.
export interface Invite {
  id: string;
  token: string;
  email: string;
  full_name: string;
  role: Role; // which role the invited person will have
  invited_by: string; // admin/executive profile id
  /** The Guide whose recommendation this came from; accepting creates the pairing. */
  pair_with_dm?: string;
  recommendation_id?: string;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
  accepted_at?: string;
}

// The email the app would have sent, shown in the admin's Outbox.
export interface DemoEmail {
  id: string;
  to: string;
  to_name: string;
  /** Set when addressed to someone in this church; absent for invitations. */
  to_user_id?: string;
  from: string;
  from_name: string;
  from_user_id?: string;
  subject: string;
  body: string; // plain text, rendered with a heading + button in the viewer
  kind: 'invite' | 'approved' | 'paired' | 'reset' | 'meeting' | 'recommendation';
  link?: string; // the call-to-action the real email would carry
  /** The sign-up a recommendation is about, so the admin can decide from the message. */
  about_profile_id?: string;
  suggested_role?: Role;
  /** The recommendation record, for a person with no account yet. */
  recommendation_id?: string;
  action_taken?: 'approved' | 'disapproved';
  acted_at?: string;
  created_at: string;
  opened_at?: string;
}

// A Guide puts forward a person who has no account yet; only an admin invites.
export interface Recommendation {
  id: string;
  dm_id: string;
  full_name: string;
  email: string;
  note?: string;
  status: 'pending' | 'invited' | 'declined';
  created_at: string;
  decided_by?: string;
  decided_at?: string;
  invite_id?: string;
}

/** A safeguarding report. It goes to the church's Directors and never warns the other person. */
export interface Report {
  id: string;
  /** Who raised it. A Guide or an Explorer; both may report. */
  reporter_id: string;
  /** Who it is about. */
  subject_id: string;
  /** The conversation it came from, when it came from one. */
  pairing_id?: string;
  /** The specific message, as an id, so it is read in its own thread. */
  message_id?: string;
  reason: ReportReason;
  /** The reporter's own words. Optional — some things are hard to write down. */
  detail?: string;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: string;
  decided_by?: string;
  decided_at?: string;
  /** What the Director did, in their words, so the record explains itself. */
  outcome?: string;
}

/** The reasons offered, in order. */
export type ReportReason =
  | 'inappropriate'
  | 'harassment'
  | 'unsafe'
  | 'spam'
  | 'other';

export interface DB {
  profiles: Profile[];
  pairings: Pairing[];
  messages: Message[];
  materials: Material[];
  material_shares: MaterialShare[];
  journey_events: JourneyEvent[];
  notifications: AppNotification[];
  analytics: AnalyticsEvent[];
  seeker_media: SeekerMedia[];
  pairing_media: PairingMedia[];
  /** Reactions in conversations: lib/talk/reactions.ts. */
  message_reactions: Reaction[];
  prayer_requests: PrayerRequest[];
  lesson_assignments: LessonAssignment[];
  lesson_series: LessonSeries[];
  meetings: Meeting[];
  invites: Invite[];
  recommendations: Recommendation[];
  emails: DemoEmail[];
  seeker_notes: SeekerNote[];
  follow_ups: FollowUp[];
  blog_posts: BlogPost[];
  blog_audience: BlogAudienceEntry[];
  blog_views: BlogView[];
  reports: Report[];
  church_name: string;
}
