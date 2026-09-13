// Domain types — the shape of everything the app stores. The demo store keeps
// to these exactly, so the screens don't care where the data comes from.

// The Church Board is deliberately NOT a role here.
//
// The client was explicit: "CB has no account in the system. Their approval
// of DMs is off the app." A board member who needs numbers gets them from an
// admin; they do not sign in. Removing the union member is what makes the
// compiler find every screen that still assumed otherwise.
export type Role = 'executive' | 'admin' | 'dm' | 'ds';

/**
 * Online or face to face.
 *
 * Moved here from lib/live/data.ts, which is where it happened to be needed
 * first. It is a domain type, and leaving it in the data-access module meant
 * anything that merely wanted to REASON about a meeting had to import the whole
 * Supabase client to do it.
 */
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
  // The live database's name for the same thing as `status` above. `status` is
  // already a column on pairings and on invites meaning something entirely
  // different, and a third meaning of one word on the table everything joins to
  // is how a wrong join gets written one day and nobody notices. The demo store
  // keeps `status`; the live schema uses `life_status`; both are declared here
  // because one Profile type serves both.
  life_status?: string;
  /**
   * The guardian set, for a member under eighteen. Written only by leadership
   * through record_guardian_consent; lock_privileged_profile_columns refuses
   * these columns to everybody else, including the member themselves, so
   * nobody can consent on their own behalf.
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
   * Set while this member is suspended — "jailed" in the trial room. They stay
   * in the church and keep their history; they cannot sign in, message or be
   * paired. NULL means active. Only leadership may set or lift it, and which
   * leadership may act on whom is decided in the database (migration 0023),
   * never on a screen.
   */
  suspended_at?: string | null;
  suspended_by?: string | null;
  suspended_reason?: string | null;
  avatar?: string; // chosen preset (emoji)
  photo?: string; // uploaded picture as a data URL (on-device in the demo)
  /**
   * LIVE ONLY: the object path of an uploaded picture, inside the shared
   * bucket under avatars/<user id>/. The demo keeps its picture in `photo` as
   * a data URL because it has no server; live stores a path and signs it at
   * render time, since a stored signed URL expires and becomes a broken face.
   */
  photo_path?: string | null;
  is_approved: boolean;
  // A missionary who vouched for this sign-up to the admin. It is a note on the
  // approval card, not a gate: the admin decides alone. (This used to be
  // endorsed_by, a Church Board member, and it was step 1 of a two-step gate.
  // The board has no account any more and approves missionaries off the app, so
  // the gate collapsed to the admin's single decision.)
  recommended_by?: string;
  recommended_at?: string;
  consent_at?: string; // when the seeker accepted the privacy notice
  /**
   * When they chose a password and actually arrived, which is what "new" means
   * to the people meeting them. `created_at` is when a Director typed their
   * address, and can be weeks earlier.
   */
  signup_completed_at?: string | null;
  /**
   * True while this person is still using the password their invitation
   * e-mailed them. A reminder flag, not a permission: nothing in the app is
   * withheld while it is true, and anybody can clear their own.
   */
  password_is_temporary?: boolean;
  created_at: string;
}

// A scheduled meeting between a missionary and their seeker — a call or an
// in-person study time. Both see it; either can schedule or cancel.
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

// A lesson the missionary assigned to a seeker's pairing, and whether it's done.
// The lesson content itself lives in lib/lessons.ts (a built-in curriculum).
export interface LessonAssignment {
  id: string;
  pairing_id: string;
  lesson_id: string;
  status: 'assigned' | 'completed';
  created_at: string;
  completed_at?: string;
  /** Set when this lesson came from a series rather than being picked alone. */
  series_id?: string;
  /** Position within that series, from 0. What makes "3 of 6" answerable. */
  series_order?: number;
}

// A course, on one area of interest, walked through in order.
//
// The client asked for it in their own words: "Can the library upload lesson
// series on specific areas of interest that can be pushed to seekers and walked
// through with them until they finish?" Every noun in that sentence is here.
//
// A series is grouped by TOPIC, not by journey stage. That distinction matters:
// a stage is a note the church keeps about a person and a seeker never sees it,
// whereas "Prayer" or "Understanding the Bible" is a thing somebody can say out
// loud that they are interested in. Series are the part of the curriculum a
// seeker is allowed to see the shape of.
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
}

// A prayer request from a seeker. Always visible to their missionary; if
// share_with_board is true it also appears — WITHOUT the seeker's name — on the
// church-wide prayer wall so the whole church can pray.
export interface PrayerRequest {
  id: string;
  ds_id: string;
  body: string;
  share_with_board: boolean;
  status: 'open' | 'praying' | 'answered';
  created_at: string;
}

// A study item a Digital Seeker keeps for themselves — their own notes and
// uploaded media. Visible to the seeker, their missionary, and (for monitoring)
// admins.
export interface SeekerMedia {
  id: string;
  ds_id: string;
  title: string;
  type: MaterialType;
  note?: string;
  external_url?: string;
  created_at: string;
}

// A file shared inside one pairing: a photo, a voice note, a video, a document.
//
// THE BYTES ARE NOT IN THIS ROW, and that is the whole design. This is metadata
// plus an id; the file itself lives in IndexedDB (lib/localMedia.ts) under that
// same id. It mirrors what a real deployment must do — bytes in object storage,
// a row in the database pointing at them — and it is not optional here either:
// this database is serialised into localStorage on every write, and localStorage
// holds about 5 MB. One phone photo inlined here would break saving for
// everything else in the app.
//
// Who may see it follows the PAIRING, never the file. See mediaFor() in
// lib/demo/store.tsx and the matching policy in docs/examples/schema.sql (2b).
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

// A missionary's private note about a seeker. The seeker never sees these, and
// neither does an admin — the whole point is a place to record
// what was actually said without it becoming a church record.
export interface SeekerNote {
  id: string;
  pairing_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

// A missionary's own reminder to follow something up — "check in with John
// before Sabbath". Private to the missionary, like the notes.
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
   * When the pairing was archived, set by a database trigger.
   *
   * NULL FOR TWO DIFFERENT REASONS, and a screen has to tell them apart: an
   * ACTIVE pairing has not ended, and a pairing archived before migration
   * 20260913100000 has an end date that was never captured and cannot be
   * recovered. Status says which.
   *
   * NEVER SUBSTITUTE `updated_at` FOR THIS. That column is written by stage
   * changes only, so it would put a confident wrong day in front of somebody
   * making a pastoral judgement.
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
   * Set when the author took the message back. `body` is emptied when this is
   * set -- the words are moved into `message_revisions`, which no browser can
   * read -- so a deleted message must never be rendered as an empty bubble.
   */
  deleted_at?: string | null;
  deleted_by?: string | null;
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

// ---------------------------------------------------------------------------
// Blog posts — a Guide writing to the people they walk with.
//
// A Guide already has conversations, which are private and one-to-one. This is
// the other thing they need: something said once to everybody, that an Explorer
// can read in their own time without being asked a question or owing a reply.
// Sermon notes, a thought for the week, what the church is doing on Sunday.
//
// TWO SWITCHES, NOT ONE. `visibility` is whether the post exists for anybody
// but its author — a draft stays private until it is ready. `audience` is who
// it reaches once published. Collapsing them into a single "public" flag would
// mean the only way to stop showing a post is to delete it, and a Guide who
// wants yesterday's note off the front page should not have to destroy it.
// ---------------------------------------------------------------------------
export type BlogVisibility = 'private' | 'published';
/**
 * Who a post is for. Mirrors the live enum (migration 0042) exactly, so the
 * tutorial teaches the choice people actually get.
 *
 *   church   — everybody in the church. Community Blogs.
 *   all      — the people the writer walks with.
 *   selected — named people, and nobody else.
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
  /** 'all' reaches every Explorer this Guide is paired with, today and later. */
  audience: BlogAudienceKind;
  created_at: string;
  updated_at?: string;
}

/** Only used when audience === 'selected'. One row per named Explorer. */
export interface BlogAudienceEntry {
  id: string;
  post_id: string;
  ds_id: string;
}

/**
 * One row the first time a person opens a post.
 *
 * The viewer is recorded so the count means "people", not "page loads" — a
 * counter that climbs every time somebody scrolls past tells the writer
 * nothing. The identity goes no further than that: the Guide is shown a
 * NUMBER, never a list of names.
 *
 * That restraint is deliberate and matches the rest of the product. An Explorer
 * is not shown their own journey stage and the prayer wall carries no names,
 * for the same reason: somebody exploring faith should be able to read quietly
 * without being watched doing it. A blog that reports "Marci opened this twice"
 * changes what the app is.
 */
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

// A behaviour event, logged locally. This is the "local data" the client keeps
// on-device: detailed, per-user, for an admin to analyze. Only an aggregated,
// name-free rollup of these ever becomes "global" data (see the Admin analytics
// view) — personal detail never leaves the device.
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
    // Safeguarding. The subject of the event is the REASON, never the person
    // reported — analytics is read by anyone who can see the church's trends,
    // and "who has been reported" is not a trend, it is an accusation.
    | 'report_raised'
    | 'report_resolved';
  meta?: string;
  at: string;
}

// An invitation for a new Digital Seeker. The app is invite-only: an admin
// creates an invite (name + email), which yields a secure token. The invited
// person opens /join?token=<token>, completes their sign-up, and only then does
// an account exist. In production the email is sent by the backend (see
// docs/BACKEND-EMAIL-INVITES.md); in the demo the admin copies the invite link.
export interface Invite {
  id: string;
  token: string;
  email: string;
  full_name: string;
  role: Role; // which role the invited person will have
  invited_by: string; // admin/executive profile id
  /** The missionary this invite came from, carried through the whole flow so
   *  that accepting it creates the pairing. This is the client's requirement in
   *  one field: "If the DS accepts the admin's invite, DS enters through the
   *  app with a new account paired to the recommending DM." Set only when the
   *  invite grew out of a recommendation. */
  pair_with_dm?: string;
  recommendation_id?: string;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
  accepted_at?: string;
}

// A message the app *would* have emailed. There is no mail server in this
// build, so instead of silently doing nothing, every send is captured here and
// shown in the admin's Outbox. It is how you demonstrate the invitation flow —
// and check the wording of what a real member receives — without one.
export interface DemoEmail {
  id: string;
  to: string;
  to_name: string;
  /** Set when the message is addressed to a person in this church, so their
   *  inbox can find it. Absent for mail to an outsider (an invitation). */
  to_user_id?: string;
  from: string;
  from_name: string;
  from_user_id?: string;
  subject: string;
  body: string; // plain text, rendered with a heading + button in the viewer
  kind: 'invite' | 'approved' | 'paired' | 'reset' | 'meeting' | 'recommendation';
  link?: string; // the call-to-action the real email would carry
  /** A recommendation carries the sign-up it is about, which is what lets the
   *  admin approve or disapprove from inside the message rather than going to
   *  find them. This is the flow the real app will implement with signed links
   *  in a genuine email. */
  about_profile_id?: string;
  suggested_role?: Role;
  /** A recommendation is now about a person with no account, so there is no
   *  profile id to point at — the recommendation record is the subject. */
  recommendation_id?: string;
  action_taken?: 'approved' | 'disapproved';
  acted_at?: string;
  created_at: string;
  opened_at?: string;
}

// A missionary putting a name forward to the admin. The person has NO account
// yet — that is the whole point, and it is what the old flow got wrong: it
// offered a dropdown of people who had already signed up, so the seeker the
// client described (someone the DM knows, who has never heard of the app)
// could not be recommended at all.
//
// The DM does not invite. They recommend; the admin decides and invites. That
// keeps the existing security boundary exactly where it was.
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

/**
 * Somebody said something that should not have been said.
 *
 * WHY THIS EXISTS. This app pairs a Guide with an Explorer in a private
 * conversation nobody else can read — which is the right design for a
 * spiritual conversation and exactly the design that needs a way out. An
 * Explorer sent something inappropriate to their Guide, or the other way
 * about, and until now the only options were to say nothing or to leave.
 *
 * A report is deliberately NOT a message to the other person, and it does not
 * warn them. It goes to the church's Directors, who are the people with the
 * standing to act.
 */
export interface Report {
  id: string;
  /** Who raised it. A Guide or an Explorer; both may report. */
  reporter_id: string;
  /** Who it is about. */
  subject_id: string;
  /** The conversation it came from, when it came from one. */
  pairing_id?: string;
  /**
   * The specific message, when one was named. Kept as an id rather than a copy
   * of the text: the Director reads it in place, in its own thread, with what
   * came before and after it. A quoted line with no context is how a
   * misunderstanding becomes a removal.
   */
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

/**
 * The reasons offered, in the order they are shown.
 *
 * A short list on purpose. A long one makes a person hunt for the exact label
 * and give up; "something else" catches everything and is not a lesser choice.
 */
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
