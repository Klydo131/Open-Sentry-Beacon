'use client';

import { PRIVACY_VERSION, TERMS_VERSION, type ChurchLegalInput } from '@/lib/legal';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { QUEST_BY_TRACK, TRACK_PERSONA, type QuestTrack } from '@/lib/quest';
import type {
  AnalyticsEvent,
  AppNotification,
  DB,
  Invite,
  LessonAssignment,
  Material,
  MaterialType,
  DemoEmail,
  Meeting,
  Pairing,
  PrayerRequest,
  Recommendation,
  Report,
  ReportReason,
  PairingMedia,
  Profile,
  Role,
  Stage,
  Track,
  BlogVisibility,
  BlogAudienceKind,
  PostMedia,
} from '../types';
import { nextStage, roleLabel, canKick } from '../brand';

// An Explorer is welcomed by name, never told their category; other roles are
// told the job they now hold.
function welcomeLine(role: string): string {
  const label = roleLabel(role, role);
  return label ? `Welcome! You are now a ${label}.` : 'Welcome! Your account is ready.';
}
import { publishDb, subscribeDb } from '../realtime';
import { deleteMedia, newMediaId, putMedia, typeFromMime } from '../localMedia';
import { forgetPostFile } from '../post-media';
import { makeSeed } from './seed';
import { REACTIONS, type ReactionTarget } from '../talk/reactions';
import { plainTitle } from '../talk/thread';
import { prayerAuthor } from '../types';

// The sample church's in-browser backend: everything lives in localStorage and
// nothing touches the network. It stores the app's real types (lib/types.ts),
// so the screens are the same as with a database.

const DB_KEY = 'beacon-demo-v1';
const PERSONA_KEY = 'beacon-persona';
const TUTORIAL_KEY = 'beacon-tutorial';
// Where the person's own demo data waits while the tutorial borrows the app.
const PRETUTORIAL_KEY = 'beacon-demo-pretutorial';
// Written when there was no saved demo to park, so finishing the tutorial
// restores "nothing" instead of leaving the tutorial's data behind. Not valid
// JSON on purpose, so a restore that forgets to check for it fails loudly.
const NOTHING_BEFORE = 'none';
export const QUEST_KEY = 'beacon-quest-v1';
// Which walk is running, so a reload mid-tutorial resumes the right one.
const TRACK_KEY = 'beacon-tutorial-track';

const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();

// The analytics feed is append-only and every action adds to it, so it would
// grow without bound. Keep a generous recent window — the admin views only ever
// read the newest entries, and the global rollup is a count.
const MAX_ANALYTICS = 500;

// The only place that writes the database to localStorage. When the ~5 MB quota
// is hit, it drops old analytics and retries once instead of losing data.
function saveDb(next: DB): DB {
  const trimmed: DB =
    next.analytics.length > MAX_ANALYTICS
      ? { ...next, analytics: next.analytics.slice(-MAX_ANALYTICS) }
      : next;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(trimmed));
    publishDb(trimmed);
    return trimmed;
  } catch {
    const lean: DB = { ...trimmed, analytics: trimmed.analytics.slice(-50) };
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(lean));
      publishDb(lean);
      return lean;
    } catch {
      return trimmed;
    }
  }
}

// Bring a saved database up to the current shape: any collection missing from
// the save takes the seed's value, so a new collection in makeSeed() needs no
// migration here. Collections already present are left alone.
export function normalizeDb(parsed: unknown): DB {
  const seed = makeSeed() as unknown as Record<string, unknown>;
  const saved = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(seed)) {
    const want = seed[key];
    const have = saved[key];
    if (Array.isArray(want)) {
      // A wrong type counts as missing; it would throw at the first .filter().
      out[key] = Array.isArray(have) ? have : want;
    } else {
      out[key] = have === undefined || have === null ? want : have;
    }
  }
  // Keep keys the seed lacks, so an older build does not delete a newer build's data.
  for (const key of Object.keys(saved)) {
    if (!(key in out)) out[key] = saved[key];
  }

  return out as unknown as DB;
}

// Build one analytics (behaviour) event. Kept local; only aggregated later.
function ev(user_id: string, type: AnalyticsEvent['type'], meta?: string): AnalyticsEvent {
  return { id: uid(), user_id, type, meta, at: nowIso() };
}

// The email the app would have sent, kept in db.emails for the admin Outbox.
function mail(m: Omit<DemoEmail, 'id' | 'created_at'>): DemoEmail {
  return { ...m, id: uid(), created_at: nowIso() };
}

/**
 * The backend contract: everything the app can do goes through this
 * interface, so any implementation of it can be the backend. Exported so a
 * real one can be typed against it (docs/BACKENDS.md).
 */
export interface Ctx {
  db: DB;
  userId: string | null;
  currentUser: Profile | null;
  signInAs: (id: string) => void;
  signOut: () => void;
  resetDemo: () => void;
  advanceStage: (pairingId: string) => void;
  /** Send a message, optionally answering an earlier one in the same thread. */
  sendMessage: (pairingId: string, body: string, replyTo?: string | null) => void;
  /** Change or take back your own message. Taking back empties the words and marks it. */
  editMessage: (messageId: string, body: string) => void;
  deleteMessage: (messageId: string) => void;
  /** React to a message or attachment, change the reaction, or remove it (null). */
  reactTo: (target: ReactionTarget, emoji: string | null) => void;
  shareMaterial: (pairingId: string, materialId: string, note?: string) => void;
  approveUser: (userId: string, role: Role) => void;
  createPairing: (dmId: string, dsId: string, track: Track) => void;
  addMaterial: (m: {
    title: string;
    description?: string;
    type: MaterialType;
    external_url?: string;
  }) => void;
  createLocalAccount: (fullName: string) => string;
  track: (type: AnalyticsEvent['type'], meta?: string) => void;
  tutorialActive: boolean;
  /** Which walk is running. Decided when the tutorial starts. */
  tutorialTrack: QuestTrack;
  startTutorial: (track?: QuestTrack) => void;
  endTutorial: () => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  updateProfile: (patch: Partial<Profile>) => void;
  /** DEMO ONLY — look through another role's eyes with your own account. */
  setMyRole: (role: Role) => void;
  addSeekerMedia: (m: {
    title: string;
    type: MaterialType;
    note?: string;
    external_url?: string;
  }) => void;
  giveConsent: () => void;
  addPrayerRequest: (body: string, shareWithBoard: boolean) => void;
  /** The author may set any status; the other side may only move it from open to praying. */
  setPrayerStatus: (id: string, status: PrayerRequest['status']) => void;
  /** A Guide asks each chosen Explorer they walk with to pray for them. */
  askForPrayer: (dsIds: string[], body: string) => void;
  /** Only whoever wrote a request may withdraw it. */
  withdrawPrayerRequest: (id: string) => void;
  /** Report a request somebody wrote TO you; its words go into the report. */
  reportPrayerRequest: (id: string, reason: ReportReason, detail?: string) => void;
  assignLesson: (pairingId: string, lessonId: string) => void;
  completeLesson: (assignmentId: string) => void;
  /** Library: create a course on one area of interest. Returns its id. */
  createSeries: (s: {
    title: string;
    topic: string;
    description?: string;
    lessonIds: string[];
    /** A drawing for the series, by its id in lib/demo/drawings.ts. */
    drawingId?: string;
  }) => string;
  /** Library: show it to missionaries, or take it back off the shelf. */
  setSeriesPublished: (seriesId: string, published: boolean) => void;
  /** Library: point a series at a drawing (lib/demo/drawings.ts), or at none (undefined). */
  setSeriesDrawing: (seriesId: string, drawingId: string | undefined) => void;
  /** Missionary: push a whole series to one seeker, in order. */
  startSeries: (pairingId: string, seriesId: string) => void;

  setChurchName: (name: string) => void;
  /** The church's legal name and Data Protection Officer, as the documents name them. */
  setChurchLegal: (legal: ChurchLegalInput) => void;
  /** The signed-in person agrees to the Terms of Use and Privacy Notice now in force (lib/legal.ts). */
  agreeToCurrentTerms: () => void;
  scheduleMeeting: (
    pairingId: string,
    m: { title: string; when: string; mode: Meeting['mode']; location?: string },
  ) => void;
  cancelMeeting: (id: string) => void;
  importData: (next: DB) => void;
  markMessagesRead: (pairingId: string) => void;
  markEmailOpened: (id: string) => void;
  sendRecommendation: (fullName: string, email: string, note: string) => void;
  // Inviting a recommendation carries the recommending Guide through, which
  // pairs them on acceptance.
  inviteRecommended: (recommendationId: string) => void;
  declineRecommendation: (recommendationId: string) => void;
  actOnEmail: (emailId: string, action: 'approve' | 'disapprove') => void;
  clearEmails: () => void;
  /**
   * Attach a file to a conversation. Returns the new id at once and writes the
   * bytes in the background; null when the caller is not in the pairing.
   */
  attachMedia: (pairingId: string, file: File) => string | null;
  /** Remove an attachment and its bytes. The owner only. */
  removeMedia: (id: string) => void;
  /** Media the signed-in person may see in this pairing. Screens must use this, not filter themselves. */
  mediaFor: (pairingId: string) => PairingMedia[];
  addNote: (pairingId: string, body: string) => void;
  deleteNote: (id: string) => void;
  addFollowUp: (pairingId: string, title: string, dueOn?: string) => void;
  toggleFollowUp: (id: string) => void;
  deleteFollowUp: (id: string) => void;
  // Blog: a Guide writes; the Explorers they walk with read.
  addBlogPost: (m: {
    title: string;
    body: string;
    visibility: BlogVisibility;
    audience: BlogAudienceKind;
    dsIds?: string[];
    media?: PostMedia[];
  }) => void;
  setBlogVisibility: (id: string, visibility: BlogVisibility) => void;
  deleteBlogPost: (id: string) => void;
  recordBlogView: (id: string) => void;
  kickMember: (targetId: string) => void;
  /** Raise a safeguarding report about another member. Guide or Explorer. */
  reportPerson: (args: {
    subjectId: string;
    reason: ReportReason;
    detail?: string;
    pairingId?: string;
    messageId?: string;
  }) => void;
  /** A Director closes a report. Never deletes it. */
  resolveReport: (
    reportId: string,
    status: 'actioned' | 'dismissed',
    outcome?: string,
  ) => void;
  disapproveMember: (targetId: string) => void;
  createInvite: (m: {
    full_name: string;
    email: string;
    role?: Role;
    pair_with_dm?: string;
    recommendation_id?: string;
  }) => Invite;
  revokeInvite: (id: string) => void;
  inviteByToken: (token: string) => Invite | undefined;
  acceptInvite: (
    token: string,
    profile: {
      full_name: string;
      preferred_contact?: string;
      birthday?: string;
      gender?: string;
      status?: string;
      topics_of_interest?: string[];
      city_of_residence?: string;
      work_industry?: string;
      /** When they ticked the permission box. Absent means they did not. */
      consent_at?: string;
    },
  ) => string | null;
}

/**
 * Exported so a real backend can provide itself in place of DemoProvider:
 *
 *     <DemoContext.Provider value={yourCtx}>{children}</DemoContext.Provider>
 */
export const DemoContext = createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(makeSeed);
  const [userId, setUserId] = useState<string | null>(null);
  const [tutorialActive, setTutorialActive] = useState(false);
  // Read on mount, so a reload mid-tutorial resumes the right walk.
  const [tutorialTrack, setTutorialTrack] = useState<QuestTrack>('dm');
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once, on the client, to avoid an SSR mismatch.
  useEffect(() => {
    try {
      const savedDb = localStorage.getItem(DB_KEY);
      if (savedDb) {
        setDb(normalizeDb(JSON.parse(savedDb)));
      }
      const savedPersona = localStorage.getItem(PERSONA_KEY);
      if (savedPersona) setUserId(savedPersona);
      if (localStorage.getItem(TUTORIAL_KEY) === '1') {
        setTutorialActive(true);
        const saved = localStorage.getItem(TRACK_KEY);
        if (saved && saved in QUEST_BY_TRACK) setTutorialTrack(saved as QuestTrack);
      }
    } catch {
      /* corrupt storage: fall back to the seed */
    }
    setReady(true);
  }, []);

  // Sync with other open windows on this device. Uses setDb, not saveDb, or the
  // windows would echo the database back and forth. The signed-in person is not
  // synced: each window keeps its own.
  useEffect(() => subscribeDb((incoming) => setDb(normalizeDb(incoming))), []);

  const persist = useCallback((next: DB) => {
    setDb(saveDb(next));
  }, []);

  const signInAs = useCallback((id: string) => {
    setUserId(id);
    try {
      localStorage.setItem(PERSONA_KEY, id);
    } catch {}
    setDb((prev) => {
      const next: DB = { ...prev, analytics: [...prev.analytics, ev(id, 'signin')] };
      return saveDb(next);
    });
  }, []);

  const signOut = useCallback(() => {
    setUserId(null);
    try {
      localStorage.removeItem(PERSONA_KEY);
    } catch {}
  }, []);

  const resetDemo = useCallback(() => {
    const fresh = makeSeed();
    persist(fresh);
    signOut();
  }, [persist, signOut]);

  const advanceStage = useCallback(
    (pairingId: string) => {
      setDb((prev) => {
        const pairing = prev.pairings.find((p) => p.id === pairingId);
        if (!pairing) return prev;
        const to = nextStage(pairing.journey_stage);
        if (!to) return prev;
        const from = pairing.journey_stage;
        const dmName =
          prev.profiles.find((p) => p.id === pairing.dm_id)?.full_name ??
          'Your Guide';
        const next: DB = {
          ...prev,
          pairings: prev.pairings.map((p) =>
            p.id === pairingId ? { ...p, journey_stage: to } : p,
          ),
          journey_events: [
            ...prev.journey_events,
            {
              id: uid(),
              pairing_id: pairingId,
              from_stage: from,
              to_stage: to,
              changed_by: pairing.dm_id,
              created_at: nowIso(),
            },
          ],
          // Mark the advance without naming the stage to the Explorer.
          notifications: [
            {
              id: uid(),
              user_id: pairing.ds_id,
              type: 'journey',
              title: 'Another step on your journey',
              body: `${dmName} marked a step forward. Keep going.`,
              created_at: nowIso(),
            },
            ...prev.notifications,
          ],
          analytics: [...prev.analytics, ev(pairing.dm_id, 'stage_advance', to)],
        };
        return saveDb(next);
      });
    },
    [],
  );

  const sendMessage = useCallback(
    (pairingId: string, body: string, replyTo?: string | null) => {
      const text = body.trim();
      if (!text || !userId) return;
      setDb((prev) => {
        const pairing = prev.pairings.find((p) => p.id === pairingId);
        if (!pairing) return prev;
        // A reply stays in its own conversation.
        const answers = replyTo
          && prev.messages.some((m) => m.id === replyTo && m.pairing_id === pairingId)
          ? replyTo : undefined;
        const recipient =
          pairing.dm_id === userId ? pairing.ds_id : pairing.dm_id;
        const next: DB = {
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: uid(),
              pairing_id: pairingId,
              sender_id: userId,
              body: text,
              created_at: nowIso(),
              ...(answers ? { reply_to: answers } : {}),
            },
          ],
          notifications: [
            {
              id: uid(),
              user_id: recipient,
              type: 'message',
              title: 'New message',
              created_at: nowIso(),
            },
            ...prev.notifications,
          ],
          analytics: [...prev.analytics, ev(userId, 'message')],
        };
        return saveDb(next);
      });
    },
    [userId],
  );

  const shareMaterial = useCallback(
    (pairingId: string, materialId: string, note?: string) => {
      if (!userId) return;
      setDb((prev) => {
        const pairing = prev.pairings.find((p) => p.id === pairingId);
        if (!pairing) return prev;
        const next: DB = {
          ...prev,
          material_shares: [
            ...prev.material_shares,
            {
              id: uid(),
              material_id: materialId,
              pairing_id: pairingId,
              shared_by: userId,
              note,
              created_at: nowIso(),
            },
          ],
          notifications: [
            {
              id: uid(),
              user_id: pairing.ds_id,
              type: 'material',
              title: 'A new resource was shared with you',
              created_at: nowIso(),
            },
            ...prev.notifications,
          ],
          analytics: [...prev.analytics, ev(userId, 'material_share', materialId)],
        };
        return saveDb(next);
      });
    },
    [userId],
  );

  const approveUser = useCallback(
    (targetId: string, role: Role) => {
      persistUpdate((prev) => ({
        ...prev,
        profiles: prev.profiles.map((p) =>
          p.id === targetId ? { ...p, role, is_approved: true } : p,
        ),
        notifications: [
          {
            id: uid(),
            user_id: targetId,
            type: 'approval',
            title: 'Your account was approved',
            body: welcomeLine(role),
            created_at: nowIso(),
          },
          ...prev.notifications,
        ],
        emails: (() => {
          const who = prev.profiles.find((p) => p.id === targetId);
          if (!who) return prev.emails;
          return [
            mail({
              to: who.preferred_contact?.includes('@')
                ? who.preferred_contact
                : `${who.full_name.split(' ')[0].toLowerCase()}@example.com`,
              to_name: who.full_name,
              to_user_id: who.id,
              from: 'no-reply@beacon.app',
              from_name: prev.church_name,
              subject: `Your ${prev.church_name} account is ready`,
              kind: 'approved',
              link: '/login',
              body:
                `Hello ${who.full_name.split(' ')[0]},\n\n` +
                `Good news, your account has been approved. ` +
                `${roleLabel(role, role) ? `You are now a ${roleLabel(role, role)} at ` : `Welcome to `}` +
                `${prev.church_name}.\n\n` +
                `Sign in whenever you're ready. Someone from the church will be ` +
                `in touch shortly to walk alongside you.`,
            }),
            ...prev.emails,
          ];
        })(),
        analytics: [...prev.analytics, ev(userId ?? targetId, 'approve', targetId)],
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const createPairing = useCallback(
    (dmId: string, dsId: string, track: Track) => {
      persistUpdate((prev) => {
        // One active Guide per Explorer.
        const exists = prev.pairings.some(
          (p) => p.ds_id === dsId && p.status === 'active',
        );
        if (exists) return prev;
        const pairing: Pairing = {
          id: uid(),
          dm_id: dmId,
          ds_id: dsId,
          track,
          journey_stage: 'create',
          status: 'active',
          created_at: nowIso(),
        };
        const nameOf = (id: string) =>
          prev.profiles.find((p) => p.id === id)?.full_name ?? 'someone';
        return {
          ...prev,
          pairings: [...prev.pairings, pairing],
          notifications: [
            {
              id: uid(),
              user_id: dsId,
              type: 'journey',
              title: 'You’ve been connected with a Guide',
              body: `${nameOf(dmId)} will walk with you.`,
              created_at: nowIso(),
            },
            {
              id: uid(),
              user_id: dmId,
              type: 'journey',
              title: 'A new explorer was assigned to you',
              body: `You are now walking with ${nameOf(dsId)}.`,
              created_at: nowIso(),
            },
            ...prev.notifications,
          ],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const addMaterial = useCallback(
    (m: {
      title: string;
      description?: string;
      type: MaterialType;
      external_url?: string;
    }) => {
      persistUpdate((prev) => {
        const material: Material = {
          id: uid(),
          title: m.title,
          description: m.description,
          type: m.type,
          external_url: m.external_url,
          topics: [],
          is_published: true,
          created_at: nowIso(),
        };
        return { ...prev, materials: [material, ...prev.materials] };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const track = useCallback(
    (type: AnalyticsEvent['type'], meta?: string) => {
      if (!userId) return;
      persistUpdate((prev) => ({
        ...prev,
        analytics: [...prev.analytics, ev(userId, type, meta)],
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // A local account on this device only. It starts unapproved.
  const createLocalAccount = useCallback((fullName: string): string => {
    const id = 'local-' + uid();
    persistUpdate((prev) => ({
      ...prev,
      profiles: [
        ...prev.profiles,
        {
          id,
          role: 'ds',
          full_name: fullName.trim() || 'New explorer',
          topics_of_interest: [],
          preferred_language: 'en',
          is_approved: false,
          created_at: nowIso(),
        },
      ],
      notifications: [
        {
          id: uid(),
          user_id: 'admin-1',
          type: 'approval',
          title: 'New sign-up awaiting approval',
          body: fullName.trim() || 'New explorer',
          created_at: nowIso(),
        },
        ...prev.notifications,
      ],
    }));
    return id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start a tutorial walk: park the person's demo data, lay out a fresh sample
  // for the walk, and sign in as that walk's persona. Finishing restores the
  // parked data exactly, so every walk starts from the same state.
  const startTutorial = useCallback(
    (track: QuestTrack = 'dm') => {
      try {
        // Snapshot only on the way in, or a replay would overwrite the parked data.
        if (localStorage.getItem(TUTORIAL_KEY) !== '1') {
          // Record the absence too (see NOTHING_BEFORE).
          localStorage.setItem(PRETUTORIAL_KEY, localStorage.getItem(DB_KEY) ?? NOTHING_BEFORE);
        }
        localStorage.setItem(TUTORIAL_KEY, '1');
        localStorage.setItem(TRACK_KEY, track);
        // Replay this walk from its first step; other walks keep their progress.
        localStorage.removeItem(`${QUEST_KEY}-${track}`);
      } catch {}
      setTutorialTrack(track);
      setTutorialActive(true);
      persist(makeSeed());
      signInAs(TRACK_PERSONA[track]);
    },
    [persist, signInAs],
  );

  const endTutorial = useCallback(() => {
    setTutorialActive(false);
    try {
      localStorage.setItem(TUTORIAL_KEY, '0');
      const saved = localStorage.getItem(PRETUTORIAL_KEY);
      // `!== null`, not truthiness: an empty string was a saved value.
      if (saved !== null) {
        localStorage.removeItem(PRETUTORIAL_KEY);
        if (saved === NOTHING_BEFORE) {
          // Nothing was saved before: remove the key so the demo is as a first visit.
          localStorage.removeItem(DB_KEY);
          setDb(makeSeed());
        } else {
          localStorage.setItem(DB_KEY, saved);
          // The snapshot can be old, so it goes through the normaliser too.
          setDb(normalizeDb(JSON.parse(saved)));
        }
      }
    } catch {}
    track('tutorial_done');
  }, [track]);

  const markNotificationRead = useCallback((id: string) => {
    persistUpdate((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === id && !n.read_at ? { ...n, read_at: nowIso() } : n,
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    if (!userId) return;
    persistUpdate((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.user_id === userId && !n.read_at ? { ...n, read_at: nowIso() } : n,
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Sample church only: switch your own account between roles, to try every
  // screen. The real app has no equivalent and must never have one.
  const setMyRole = useCallback((role: Role) => {
    if (!userId) return;
    persistUpdate((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        // Approve too, or a switched role would wait at the approval gate.
        p.id === userId ? { ...p, role, is_approved: true } : p,
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    if (!userId) return;
    persistUpdate((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        p.id === userId
          ? { ...p, ...patch, id: p.id, role: p.role, is_approved: p.is_approved }
          : p,
      ),
      analytics: [...prev.analytics, ev(userId, 'profile_update')],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // --- Series: a course a Guide assigns to an Explorer, in order ---

  const createSeries = useCallback(
    ({
      title,
      topic,
      description,
      lessonIds,
      drawingId,
    }: {
      title: string;
      topic: string;
      description?: string;
      lessonIds: string[];
      drawingId?: string;
    }) => {
      const id = uid();
      persistUpdate((prev) => ({
        ...prev,
        lesson_series: [
          ...prev.lesson_series,
          {
            id,
            title: title.trim(),
            topic: topic.trim(),
            description: description?.trim() || undefined,
            // De-duplicated, order kept.
            lesson_ids: Array.from(new Set(lessonIds)),
            is_published: true,
            created_at: nowIso(),
            // An id only; the picture lives in lib/demo/drawings.ts.
            ...(drawingId ? { drawing_id: drawingId } : {}),
          },
        ],
      }));
      return id;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const setSeriesPublished = useCallback((seriesId: string, published: boolean) => {
    persistUpdate((prev) => ({
      ...prev,
      lesson_series: prev.lesson_series.map((s) =>
        s.id === seriesId ? { ...s, is_published: published } : s,
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSeriesDrawing = useCallback((seriesId: string, drawingId: string | undefined) => {
    persistUpdate((prev) => ({
      ...prev,
      lesson_series: prev.lesson_series.map((s) => {
        if (s.id !== seriesId) return s;
        const { drawing_id: _old, ...rest } = s;
        return drawingId ? { ...rest, drawing_id: drawingId } : rest;
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSeries = useCallback(
    (pairingId: string, seriesId: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const series = prev.lesson_series.find((s) => s.id === seriesId);
        const pairing = prev.pairings.find((p) => p.id === pairingId);
        if (!series || !pairing) return prev;

        // Lessons already assigned keep their progress.
        const already = new Set(
          prev.lesson_assignments
            .filter((a) => a.pairing_id === pairingId)
            .map((a) => a.lesson_id),
        );
        const fresh: LessonAssignment[] = series.lesson_ids
          .map((lessonId, i) => ({ lessonId, i }))
          .filter(({ lessonId }) => !already.has(lessonId))
          .map(({ lessonId, i }) => ({
            id: uid(),
            pairing_id: pairingId,
            lesson_id: lessonId,
            status: 'assigned' as const,
            created_at: nowIso(),
            series_id: series.id,
            series_order: i,
          }));

        // Already-assigned lessons join the series, so the count matches the course.
        const adopted = prev.lesson_assignments.map((a) =>
          a.pairing_id === pairingId && series.lesson_ids.includes(a.lesson_id)
            ? { ...a, series_id: series.id, series_order: series.lesson_ids.indexOf(a.lesson_id) }
            : a,
        );

        if (fresh.length === 0 && adopted === prev.lesson_assignments) return prev;

        return {
          ...prev,
          lesson_assignments: [...adopted, ...fresh],
          notifications: [
            ...prev.notifications,
            {
              id: uid(),
              user_id: pairing.ds_id,
              type: 'material' as const,
              title: `A new series for you: ${series.title}`,
              body: series.description,
              created_at: nowIso(),
            },
          ],
          analytics: [...prev.analytics, ev(userId, 'lesson_assigned', series.id)],
        };
      });
    },
    [userId],
  );

  const assignLesson = useCallback(
    (pairingId: string, lessonId: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        if (
          prev.lesson_assignments.some(
            (a) => a.pairing_id === pairingId && a.lesson_id === lessonId,
          )
        )
          return prev;
        const pairing = prev.pairings.find((p) => p.id === pairingId);
        const assignment: LessonAssignment = {
          id: uid(),
          pairing_id: pairingId,
          lesson_id: lessonId,
          status: 'assigned',
          created_at: nowIso(),
        };
        return {
          ...prev,
          lesson_assignments: [...prev.lesson_assignments, assignment],
          notifications: pairing
            ? [
                {
                  id: uid(),
                  user_id: pairing.ds_id,
                  type: 'material',
                  title: 'A new lesson was assigned to you',
                  created_at: nowIso(),
                },
                ...prev.notifications,
              ]
            : prev.notifications,
          analytics: [...prev.analytics, ev(userId, 'lesson_assigned', lessonId)],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // An Explorer completes a lesson; their Guide is told, and nudged to advance
  // the journey when every assigned lesson is done.
  const completeLesson = useCallback(
    (assignmentId: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const a = prev.lesson_assignments.find((x) => x.id === assignmentId);
        if (!a || a.status === 'completed') return prev;
        const pairing = prev.pairings.find((p) => p.id === a.pairing_id);
        const updated = prev.lesson_assignments.map((x) =>
          x.id === assignmentId
            ? { ...x, status: 'completed' as const, completed_at: nowIso() }
            : x,
        );
        const remaining = updated.filter(
          (x) => x.pairing_id === a.pairing_id && x.status !== 'completed',
        ).length;
        const dsName =
          prev.profiles.find((p) => p.id === pairing?.ds_id)?.full_name ??
          'Your explorer';
        const notifs: AppNotification[] = [];
        if (pairing) {
          notifs.push({
            id: uid(),
            user_id: pairing.dm_id,
            type: 'journey',
            title: `${dsName} finished a lesson`,
            created_at: nowIso(),
          });
          if (remaining === 0)
            notifs.push({
              id: uid(),
              user_id: pairing.dm_id,
              type: 'journey',
              title: `${dsName} completed all assigned lessons`,
              body: 'Consider advancing their journey.',
              created_at: nowIso(),
            });
        }
        return {
          ...prev,
          lesson_assignments: updated,
          notifications: [...notifs, ...prev.notifications],
          analytics: [...prev.analytics, ev(userId, 'lesson_completed', a.lesson_id)],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // Schedule a meeting on a pairing and notify the other person.
  const scheduleMeeting = useCallback(
    (
      pairingId: string,
      m: { title: string; when: string; mode: Meeting['mode']; location?: string },
    ) => {
      if (!userId || !m.when) return;
      persistUpdate((prev) => {
        const pairing = prev.pairings.find((p) => p.id === pairingId);
        if (!pairing) return prev;
        const other = pairing.dm_id === userId ? pairing.ds_id : pairing.dm_id;
        const meeting: Meeting = {
          id: uid(),
          pairing_id: pairingId,
          title: m.title.trim() || 'Meeting',
          when: m.when,
          mode: m.mode,
          location: m.location?.trim() || undefined,
          created_by: userId,
          status: 'scheduled',
          created_at: nowIso(),
        };
        return {
          ...prev,
          meetings: [...prev.meetings, meeting],
          notifications: [
            {
              id: uid(),
              user_id: other,
              type: 'meeting',
              title: 'A meeting was scheduled',
              body: `${meeting.title} · ${new Date(meeting.when).toLocaleString()}`,
              created_at: nowIso(),
            },
            ...prev.notifications,
          ],
          analytics: [...prev.analytics, ev(userId, 'meeting_scheduled')],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const cancelMeeting = useCallback(
    (id: string) => {
      persistUpdate((prev) => {
        const mtg = prev.meetings.find((x) => x.id === id);
        if (!mtg) return prev;
        const pairing = prev.pairings.find((p) => p.id === mtg.pairing_id);
        const other = pairing
          ? pairing.dm_id === userId
            ? pairing.ds_id
            : pairing.dm_id
          : null;
        return {
          ...prev,
          meetings: prev.meetings.map((x) =>
            x.id === id ? { ...x, status: 'cancelled' as const } : x,
          ),
          notifications: other
            ? [
                {
                  id: uid(),
                  user_id: other,
                  type: 'meeting',
                  title: 'A meeting was cancelled',
                  body: mtg.title,
                  created_at: nowIso(),
                },
                ...prev.notifications,
              ]
            : prev.notifications,
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // Change or take back your own message, as the live half does: author only,
  // never empty; a taken-back message keeps its place with no words.
  const editMessage = useCallback(
    (messageId: string, body: string) => {
      const text = body.trim();
      if (!userId || !text || text.length > 4000) return;
      persistUpdate((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === messageId && m.sender_id === userId && !m.deleted_at && m.body !== text
            ? { ...m, body: text, edited_at: nowIso() }
            : m,
        ),
      }));
    },
    [userId],
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!userId) return;
      persistUpdate((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === messageId && m.sender_id === userId && !m.deleted_at
            ? { ...m, body: '', deleted_at: nowIso(), deleted_by: userId }
            : m,
        ),
        message_reactions: prev.message_reactions.filter((r) => r.message_id !== messageId),
      }));
    },
    [userId],
  );

  // Reactions, under the live rules: your conversation, one per person per
  // thing, one of the six, never on a taken-back message.
  const reactTo = useCallback(
    (target: ReactionTarget, emoji: string | null) => {
      if (!userId) return;
      if (emoji !== null && !REACTIONS.some((r) => r.emoji === emoji)) return;
      persistUpdate((prev) => {
        const messageId = 'message' in target ? target.message : null;
        const mediaId = 'media' in target ? target.media : null;
        const pairingId = messageId
          ? prev.messages.find((m) => m.id === messageId && !m.deleted_at)?.pairing_id
          : prev.pairing_media.find((m) => m.id === mediaId)?.pairing_id;
        const pairing = prev.pairings.find((p) => p.id === pairingId);
        if (!pairing || (pairing.dm_id !== userId && pairing.ds_id !== userId)) return prev;
        const others = prev.message_reactions.filter((r) =>
          !(r.person_id === userId && r.message_id === messageId && r.media_id === mediaId));
        if (emoji === null) return { ...prev, message_reactions: others };
        return {
          ...prev,
          message_reactions: [
            ...others,
            {
              id: uid(),
              pairing_id: pairing.id,
              message_id: messageId,
              media_id: mediaId,
              person_id: userId,
              emoji,
              created_at: nowIso(),
            },
          ],
        };
      });
    },
    [userId],
  );

  const markMessagesRead = useCallback(
    (pairingId: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const stale = prev.messages.some(
          (m) => m.pairing_id === pairingId && m.sender_id !== userId && !m.read_at,
        );
        if (!stale) return prev; // nothing to do
        const at = nowIso();
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.pairing_id === pairingId && m.sender_id !== userId && !m.read_at
              ? { ...m, read_at: at }
              : m,
          ),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // --- Media shared inside one pairing ---
  // Visible to both people in the pairing and nobody else. The bytes go to
  // IndexedDB, never into this database.

  const attachMedia = useCallback(
    (pairingId: string, file: File): string | null => {
      if (!userId || !file) return null;
      // Only into a pairing you are in.
      const p = db.pairings.find((x) => x.id === pairingId);
      if (!p || (p.dm_id !== userId && p.ds_id !== userId)) return null;

      const id = newMediaId();
      const kind = typeFromMime(file.type);
      const row: PairingMedia = {
        id,
        pairing_id: pairingId,
        owner_id: userId,
        kind,
        title: plainTitle(file.name) || 'Attachment',
        mime: file.type || undefined,
        size: file.size,
        created_at: nowIso(),
      };

      persistUpdate((prev) => ({
        ...prev,
        pairing_media: [...prev.pairing_media, row],
        analytics: [...prev.analytics, ev(userId, 'media_upload')],
      }));

      // Then write the bytes; if that fails, take the row back out, so no attachment
      // ever points at a missing file.
      void putMedia(
        {
          id,
          title: row.title,
          type: kind,
          mime: row.mime,
          size: row.size,
          created_at: row.created_at,
        },
        file,
      ).catch((cause) => {
        // Log the failure so it can be diagnosed (WebKit fails here where Chromium does not).
        console.error('[beacon] attachment could not be saved to this device:', cause);
        persistUpdate((prev) => ({
          ...prev,
          pairing_media: prev.pairing_media.filter((m) => m.id !== id),
        }));
      });

      return id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.pairings, userId],
  );

  const removeMedia = useCallback(
    (id: string) => {
      if (!userId) return;
      const row = db.pairing_media.find((m) => m.id === id);
      // Only whoever attached it.
      if (!row || row.owner_id !== userId) return;
      persistUpdate((prev) => ({
        ...prev,
        pairing_media: prev.pairing_media.filter((m) => m.id !== id),
        message_reactions: prev.message_reactions.filter((r) => r.media_id !== id),
      }));
      void deleteMedia(id).catch(() => {
        // The row is gone either way; an orphaned blob only costs storage.
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.pairing_media, userId],
  );

  const mediaFor = useCallback(
    (pairingId: string): PairingMedia[] => {
      if (!userId) return [];
      const p = db.pairings.find((x) => x.id === pairingId);
      if (!p || (p.dm_id !== userId && p.ds_id !== userId)) return [];
      return db.pairing_media
        .filter((m) => m.pairing_id === pairingId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    [db.pairings, db.pairing_media, userId],
  );

  // --- A Guide's private notes and follow-ups: visible only to their author ---

  const addNote = useCallback(
    (pairingId: string, body: string) => {
      const text = body.trim();
      if (!userId || !text) return;
      persistUpdate((prev) => ({
        ...prev,
        seeker_notes: [
          ...prev.seeker_notes,
          {
            id: uid(),
            pairing_id: pairingId,
            author_id: userId,
            body: text,
            created_at: nowIso(),
          },
        ],
        analytics: [...prev.analytics, ev(userId, 'note_added')],
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const deleteNote = useCallback(
    (id: string) => {
      if (!userId) return;
      persistUpdate((prev) => ({
        ...prev,
        // Author only, as the live policy is.
        seeker_notes: prev.seeker_notes.filter(
          (n) => !(n.id === id && n.author_id === userId),
        ),
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const addFollowUp = useCallback(
    (pairingId: string, title: string, dueOn?: string) => {
      const text = title.trim();
      if (!userId || !text) return;
      persistUpdate((prev) => ({
        ...prev,
        follow_ups: [
          ...prev.follow_ups,
          {
            id: uid(),
            pairing_id: pairingId,
            owner_id: userId,
            title: text,
            due_on: dueOn || undefined,
            created_at: nowIso(),
          },
        ],
        analytics: [...prev.analytics, ev(userId, 'followup_added')],
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const toggleFollowUp = useCallback(
    (id: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const f = prev.follow_ups.find(
          (x) => x.id === id && x.owner_id === userId,
        );
        if (!f) return prev;
        const done = !f.done_at;
        return {
          ...prev,
          follow_ups: prev.follow_ups.map((x) =>
            x.id === id ? { ...x, done_at: done ? nowIso() : undefined } : x,
          ),
          analytics: done
            ? [...prev.analytics, ev(userId, 'followup_done')]
            : prev.analytics,
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // --- Blog: every change re-checks the author, as the live policy does ---
  const addBlogPost = useCallback(
    (m: {
      title: string;
      body: string;
      visibility: BlogVisibility;
      audience: BlogAudienceKind;
      dsIds?: string[];
      media?: PostMedia[];
    }) => {
      const title = m.title.trim();
      const body = m.body.trim();
      if (!userId || !title || !body) return;
      const id = uid();
      persistUpdate((prev) => ({
        ...prev,
        blog_posts: [
          {
            id,
            author_id: userId,
            title,
            body,
            visibility: m.visibility,
            audience: m.audience,
            created_at: nowIso(),
            ...(m.media?.length ? { media: m.media } : {}),
          },
          ...prev.blog_posts,
        ],
        // Named Explorers only for 'selected', so an 'all' post follows future pairings.
        blog_audience:
          m.audience === 'selected'
            ? [
                ...prev.blog_audience,
                ...(m.dsIds ?? []).map((ds) => ({ id: uid(), post_id: id, ds_id: ds })),
              ]
            : prev.blog_audience,
        analytics: [...prev.analytics, ev(userId, 'blog_written')],
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const setBlogVisibility = useCallback(
    (id: string, visibility: BlogVisibility) => {
      if (!userId) return;
      persistUpdate((prev) => ({
        ...prev,
        blog_posts: prev.blog_posts.map((p) =>
          p.id === id && p.author_id === userId
            ? { ...p, visibility, updated_at: nowIso() }
            : p,
        ),
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const deleteBlogPost = useCallback(
    (id: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const mine = prev.blog_posts.find((p) => p.id === id && p.author_id === userId);
        if (!mine) return prev;
        // Its photos and clip are deleted from this device too.
        for (const m of mine.media ?? []) void forgetPostFile(m.src).catch(() => {});
        // Views and audience rows go with it.
        return {
          ...prev,
          blog_posts: prev.blog_posts.filter((p) => p.id !== id),
          blog_audience: prev.blog_audience.filter((a) => a.post_id !== id),
          blog_views: prev.blog_views.filter((v) => v.post_id !== id),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const recordBlogView = useCallback(
    (id: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        // One view per person; the author's own reads do not count.
        const already = prev.blog_views.some((v) => v.post_id === id && v.viewer_id === userId);
        const post = prev.blog_posts.find((p) => p.id === id);
        if (already || !post || post.author_id === userId) return prev;
        return {
          ...prev,
          blog_views: [
            ...prev.blog_views,
            { id: uid(), post_id: id, viewer_id: userId, created_at: nowIso() },
          ],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const deleteFollowUp = useCallback(
    (id: string) => {
      if (!userId) return;
      persistUpdate((prev) => ({
        ...prev,
        follow_ups: prev.follow_ups.filter(
          (f) => !(f.id === id && f.owner_id === userId),
        ),
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const markEmailOpened = useCallback((id: string) => {
    persistUpdate((prev) => ({
      ...prev,
      emails: prev.emails.map((e) =>
        e.id === id && !e.opened_at ? { ...e, opened_at: nowIso() } : e,
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A Guide recommends a person who has no account yet; only an admin can invite.
  const sendRecommendation = useCallback(
    (fullName: string, email: string, note: string) => {
      if (!userId) return;
      const name = fullName.trim();
      const addr = email.trim();
      if (!name || !addr) return;
      persistUpdate((prev) => {
        const me = prev.profiles.find((p) => p.id === userId);
        const admins = prev.profiles.filter(
          (p) => p.role === 'admin' || p.role === 'executive',
        );
        if (!me || admins.length === 0) return prev;
        const rec: Recommendation = {
          id: uid(),
          dm_id: me.id,
          full_name: name,
          email: addr,
          note: note.trim() || undefined,
          status: 'pending',
          created_at: nowIso(),
        };
        const mails = admins.map((a) =>
          mail({
            to: a.preferred_contact?.includes('@')
              ? a.preferred_contact
              : `${a.full_name.split(' ')[0].toLowerCase()}@example.com`,
            to_name: a.full_name,
            to_user_id: a.id,
            from: me.preferred_contact?.includes('@')
              ? me.preferred_contact
              : `${me.full_name.split(' ')[0].toLowerCase()}@example.com`,
            from_name: me.full_name,
            from_user_id: me.id,
            subject: `${me.full_name} recommends ${name}`,
            kind: 'recommendation',
            recommendation_id: rec.id,
            body:
              `Hello ${a.full_name.split(' ')[0]},\n\n` +
              `${me.full_name} is recommending ${name} (${addr}) as someone to ` +
              `invite onto the journey.\n\n` +
              (note.trim() ? `"${note.trim()}"\n\n` : '') +
              `If you invite them, they will join already paired with ` +
              `${me.full_name.split(' ')[0]}. You can also decline.`,
          }),
        );
        return {
          ...prev,
          recommendations: [rec, ...prev.recommendations],
          emails: [...mails, ...prev.emails],
          notifications: [
            ...admins.map((a) => ({
              id: uid(),
              user_id: a.id,
              type: 'approval',
              title: `${me.full_name} recommends ${name}`,
              body: 'Invite them, or decline, from your admin desk.',
              created_at: nowIso(),
            })),
            ...prev.notifications,
          ],
          analytics: [...prev.analytics, ev(me.id, 'recommend', name)],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // The admin decides from inside the message; the message records the outcome.
  const actOnEmail = useCallback(
    (emailId: string, action: 'approve' | 'disapprove') => {
      if (!userId) return;
      persistUpdate((prev) => {
        const em = prev.emails.find((e) => e.id === emailId);
        if (!em || !em.about_profile_id || em.action_taken) return prev;
        const target = prev.profiles.find((p) => p.id === em.about_profile_id);
        if (!target) return prev;
        const stamp = (list: DemoEmail[]) =>
          list.map((e) =>
            // Every admin got a copy; resolving one resolves them all.
            e.about_profile_id === em.about_profile_id && !e.action_taken
              ? {
                  ...e,
                  action_taken:
                    action === 'approve'
                      ? ('approved' as const)
                      : ('disapproved' as const),
                  acted_at: nowIso(),
                }
              : e,
          );
        if (action === 'disapprove') {
          return {
            ...prev,
            profiles: prev.profiles.filter((p) => p.id !== target.id),
            emails: stamp(prev.emails),
            analytics: [
              ...prev.analytics,
              ev(userId, 'member_disapproved', target.id),
            ],
          };
        }
        const role = em.suggested_role ?? 'ds';
        return {
          ...prev,
          profiles: prev.profiles.map((p) =>
            p.id === target.id ? { ...p, role, is_approved: true } : p,
          ),
          emails: stamp(prev.emails),
          notifications: [
            {
              id: uid(),
              user_id: target.id,
              type: 'approval',
              title: 'Your account was approved',
              body: welcomeLine(role),
              created_at: nowIso(),
            },
            ...prev.notifications,
          ],
          analytics: [...prev.analytics, ev(userId, 'approve', target.id)],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const clearEmails = useCallback(() => {
    persistUpdate((prev) => ({ ...prev, emails: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setChurchName = useCallback((name: string) => {
    persistUpdate((prev) => ({
      ...prev,
      church_name: name.trim() || prev.church_name,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setChurchLegal = useCallback((legal: ChurchLegalInput) => {
    persistUpdate((prev) => ({
      ...prev,
      church_legal: {
        legal_name: legal.legal_name.trim(),
        legal_address: legal.legal_address.trim(),
        dpo_name: legal.dpo_name.trim(),
        dpo_email: legal.dpo_email.trim(),
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The same record the live database keeps: the versions, and when.
  const agreeToCurrentTerms = useCallback(() => {
    if (!userId) return;
    persistUpdate((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        p.id === userId
          ? { ...p, terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION, terms_agreed_at: nowIso() }
          : p,
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // An Explorer's prayer request goes to their Guide, and if shared, to the wall without a name.
  const addPrayerRequest = useCallback(
    (body: string, shareWithBoard: boolean) => {
      const text = body.trim();
      if (!userId || !text) return;
      persistUpdate((prev) => {
        const pairing = prev.pairings.find(
          (p) => p.ds_id === userId && p.status === 'active',
        );
        const dsName =
          prev.profiles.find((p) => p.id === userId)?.full_name ?? 'An Explorer';
        return {
          ...prev,
          prayer_requests: [
            {
              id: uid(),
              ds_id: userId,
              author_id: userId,
              body: text,
              share_with_board: shareWithBoard,
              status: 'open',
              created_at: nowIso(),
            },
            ...prev.prayer_requests,
          ],
          // No prayer text in the notification: it can appear on a locked phone.
          notifications: pairing
            ? [
                {
                  id: uid(),
                  user_id: pairing.dm_id,
                  type: 'prayer',
                  title: `${dsName.split(' ')[0]} asked for prayer`,
                  body: 'Open Prayer to read it.',
                  created_at: nowIso(),
                },
                ...prev.notifications,
              ]
            : prev.notifications,
          analytics: [...prev.analytics, ev(userId, 'prayer_request')],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // "I am praying" tells whoever asked; only the author may otherwise change the status.
  const setPrayerStatus = useCallback(
    (id: string, status: PrayerRequest['status']) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const pr = prev.prayer_requests.find((r) => r.id === id);
        if (!pr || pr.status === status) return prev;
        const author = prayerAuthor(pr);
        const mine = author === userId;
        if (!mine && !(pr.status === 'open' && status === 'praying')) return prev;
        const me = prev.profiles.find((p) => p.id === userId);
        const who = me?.full_name.split(' ')[0] || 'Someone you walk with';
        return {
          ...prev,
          prayer_requests: prev.prayer_requests.map((r) =>
            r.id === id ? { ...r, status } : r,
          ),
          notifications: !mine && status === 'praying'
            ? [
                {
                  id: uid(),
                  user_id: author,
                  type: 'prayer',
                  title: `${who} is praying with you 🙏`,
                  body: 'They have seen what you asked prayer for.',
                  created_at: nowIso(),
                },
                ...prev.notifications,
              ]
            : prev.notifications,
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // A Guide asks their Explorers to pray: one request per Explorer, never on the wall.
  const askForPrayer = useCallback(
    (dsIds: string[], body: string) => {
      const text = body.trim();
      if (!userId || !text) return;
      persistUpdate((prev) => {
        const walking = new Set(
          prev.pairings
            .filter((p) => p.dm_id === userId && p.status === 'active')
            .map((p) => p.ds_id),
        );
        const to = [...new Set(dsIds)].filter((id) => walking.has(id));
        if (to.length === 0) return prev;
        const who =
          prev.profiles.find((p) => p.id === userId)?.full_name.split(' ')[0] || 'Your Guide';
        const at = nowIso();
        return {
          ...prev,
          prayer_requests: [
            ...to.map((ds_id) => ({
              id: uid(),
              ds_id,
              author_id: userId,
              body: text,
              share_with_board: false,
              status: 'open' as const,
              created_at: at,
            })),
            ...prev.prayer_requests,
          ],
          notifications: [
            ...to.map((ds_id) => ({
              id: uid(),
              user_id: ds_id,
              type: 'prayer',
              title: `${who} asked you to pray for them`,
              body: 'Open Prayer to read it.',
              created_at: at,
            })),
            ...prev.notifications,
          ],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const withdrawPrayerRequest = useCallback(
    (id: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const pr = prev.prayer_requests.find((r) => r.id === id);
        if (!pr || prayerAuthor(pr) !== userId) return prev;
        return { ...prev, prayer_requests: prev.prayer_requests.filter((r) => r.id !== id) };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // Accepting the privacy notice; the timestamp is the consent record.
  const giveConsent = useCallback(() => {
    if (!userId) return;
    persistUpdate((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        p.id === userId && !p.consent_at ? { ...p, consent_at: nowIso() } : p,
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // An Explorer adds a study note or file; their Guide is notified.
  const addSeekerMedia = useCallback(
    (m: {
      title: string;
      type: MaterialType;
      note?: string;
      external_url?: string;
    }) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const pairing = prev.pairings.find(
          (p) => p.ds_id === userId && p.status === 'active',
        );
        const dsName =
          prev.profiles.find((p) => p.id === userId)?.full_name ?? 'An Explorer';
        return {
          ...prev,
          seeker_media: [
            {
              id: uid(),
              ds_id: userId,
              title: m.title.trim() || 'Untitled',
              type: m.type,
              note: m.note,
              external_url: m.external_url,
              created_at: nowIso(),
            },
            ...prev.seeker_media,
          ],
          analytics: [...prev.analytics, ev(userId, 'media_upload', m.title)],
          notifications: pairing
            ? [
                {
                  id: uid(),
                  user_id: pairing.dm_id,
                  type: 'material',
                  title: `${dsName} added a study note`,
                  body: m.title.trim() || 'Untitled',
                  created_at: nowIso(),
                },
                ...prev.notifications,
              ]
            : prev.notifications,
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // Restore a full backup and sign out. The screen confirms first.
  const importData = useCallback(
    (next: DB) => {
      persist(next);
      signOut();
    },
    [persist, signOut],
  );

  // --- Safeguarding reports ---
  // Either side may report. The person reported is never told; every Director
  // and Executive Director is notified by name.

  const reportPerson = useCallback(
    (args: {
      subjectId: string;
      reason: ReportReason;
      detail?: string;
      pairingId?: string;
      messageId?: string;
    }) => {
      if (!userId) return;
      setDb((prev) => {
        const reporter = prev.profiles.find((p) => p.id === userId);
        const subject = prev.profiles.find((p) => p.id === args.subjectId);
        // You cannot report yourself.
        if (!reporter || !subject || args.subjectId === userId) return prev;

        const leaders = prev.profiles.filter(
          (p) => p.role === 'admin' || p.role === 'executive',
        );

        const report: Report = {
          id: uid(),
          reporter_id: userId,
          subject_id: args.subjectId,
          pairing_id: args.pairingId,
          message_id: args.messageId,
          reason: args.reason,
          detail: args.detail?.trim() || undefined,
          status: 'open',
          created_at: nowIso(),
        };

        return saveDb({
          ...prev,
          reports: [report, ...prev.reports],
          notifications: [
            ...leaders.map((leader) => ({
              id: uid(),
              user_id: leader.id,
              type: 'report',
              title: 'A safeguarding report needs your attention',
              // The reporter is named to Directors; only the subject is never told.
              body: `${reporter.full_name} reported ${subject.full_name}.`,
              created_at: nowIso(),
            })),
            ...prev.notifications,
          ],
          // Analytics records that a report happened, not who it was about.
          analytics: [...prev.analytics, ev(userId, 'report_raised', args.reason)],
        });
      });
    },
    [userId],
  );

  // Report a prayer request written to you. Its words are copied into the report.
  const reportPrayerRequest = useCallback(
    (id: string, reason: ReportReason, detail?: string) => {
      if (!userId) return;
      const pr = db.prayer_requests.find((r) => r.id === id);
      if (!pr) return;
      const author = prayerAuthor(pr);
      if (author === userId) return;
      const pairing = db.pairings.find(
        (p) => p.status === 'active' &&
          ((p.dm_id === userId && p.ds_id === author) || (p.ds_id === userId && p.dm_id === author)),
      );
      // Written to me: I am the Explorer it lives with, or the Guide of the Explorer who asked.
      const toMe = pr.ds_id === userId || (author === pr.ds_id && pairing?.dm_id === userId);
      if (!pairing || !toMe) return;
      reportPerson({
        subjectId: author,
        reason,
        pairingId: pairing.id,
        detail: [
          detail?.trim(),
          `The prayer request, as it read when it was reported:\n"${pr.body}"`,
        ].filter(Boolean).join('\n\n'),
      });
    },
    [userId, db, reportPerson],
  );

  const resolveReport = useCallback(
    (reportId: string, status: 'actioned' | 'dismissed', outcome?: string) => {
      if (!userId) return;
      setDb((prev) => {
        const caller = prev.profiles.find((p) => p.id === userId);
        if (!caller || (caller.role !== 'admin' && caller.role !== 'executive')) return prev;
        return saveDb({
          ...prev,
          reports: prev.reports.map((r) =>
            r.id === reportId
              ? {
                  ...r,
                  status,
                  decided_by: userId,
                  decided_at: nowIso(),
                  outcome: outcome?.trim() || undefined,
                }
              : r,
          ),
          analytics: [...prev.analytics, ev(userId, 'report_resolved', status)],
        });
      });
    },
    [userId],
  );

  // --- Remove / disapprove ---

  const kickMember = useCallback(
    (targetId: string) => {
      if (!userId) return;
      setDb((prev) => {
        const caller = prev.profiles.find((p) => p.id === userId);
        const target = prev.profiles.find((p) => p.id === targetId);
        if (!caller || !target || targetId === userId) return prev;
        if (!canKick(caller.role, target.role)) return prev;
        const targetName = target.full_name;
        const admins = prev.profiles.filter(
          (p) => (p.role === 'admin' || p.role === 'executive') && p.id !== userId,
        );
        // A removed member's private notes and reminders go too.
        const touched = new Set(
          prev.pairings
            .filter((p) => p.dm_id === targetId || p.ds_id === targetId)
            .map((p) => p.id),
        );
        return saveDb({
          ...prev,
          profiles: prev.profiles.filter((p) => p.id !== targetId),
          pairings: prev.pairings.map((p) =>
            p.dm_id === targetId || p.ds_id === targetId
              ? { ...p, status: 'archived' as const }
              : p,
          ),
          seeker_notes: prev.seeker_notes.filter((n) => !touched.has(n.pairing_id)),
          follow_ups: prev.follow_ups.filter((f) => !touched.has(f.pairing_id)),
          notifications: [
            ...admins.map((a) => ({
              id: uid(),
              user_id: a.id,
              type: 'approval',
              title: `${targetName} was removed`,
              body: `Removed by ${caller.full_name}.`,
              created_at: nowIso(),
            })),
            ...prev.notifications,
          ],
          analytics: [...prev.analytics, ev(userId, 'member_kicked', targetId)],
        });
      });
    },
    [userId],
  );

  const disapproveMember = useCallback(
    (targetId: string) => {
      if (!userId) return;
      setDb((prev) => {
        const target = prev.profiles.find((p) => p.id === targetId);
        if (!target || target.is_approved) return prev;
        const targetName = target.full_name;
        return saveDb({
          ...prev,
          profiles: prev.profiles.filter((p) => p.id !== targetId),
          notifications: [
            {
              id: uid(),
              user_id: userId,
              type: 'approval',
              title: `${targetName} was disapproved`,
              created_at: nowIso(),
            },
            ...prev.notifications,
          ],
          analytics: [...prev.analytics, ev(userId, 'member_disapproved', targetId)],
        });
      });
    },
    [userId],
  );

  // --- Invitations: there is no self sign-up ---

  const inviteByToken = useCallback(
    (token: string) => db.invites.find((i) => i.token === token),
    [db.invites],
  );

  const createInvite = useCallback(
    (m: {
      full_name: string;
      email: string;
      role?: Role;
      pair_with_dm?: string;
      recommendation_id?: string;
    }): Invite => {
      const invite: Invite = {
        id: uid(),
        token: uid() + uid() + uid(), // long, unguessable token
        email: m.email.trim(),
        full_name: m.full_name.trim() || 'Invited member',
        role: m.role ?? 'ds',
        invited_by: userId ?? 'admin-1',
        pair_with_dm: m.pair_with_dm,
        recommendation_id: m.recommendation_id,
        status: 'pending',
        created_at: nowIso(),
      };
      const link =
        typeof window !== 'undefined'
          ? `${window.location.origin}/join?token=${invite.token}`
          : `/join?token=${invite.token}`;
      persistUpdate((prev) => ({
        ...prev,
        invites: [invite, ...prev.invites],
        emails: [
          mail({
            to: invite.email,
            to_name: invite.full_name,
            from: 'no-reply@beacon.app',
            from_name: prev.church_name,
            subject: `You're invited to join ${prev.church_name} on Beacon`,
            kind: 'invite',
            link,
            body:
              `Hello ${invite.full_name.split(' ')[0]},\n\n` +
              `${prev.church_name} has invited you to join Beacon` +
              `${roleLabel(invite.role, invite.role) ? ` as a ${roleLabel(invite.role, invite.role)}` : ''}.\n\n` +
              `Beacon is a private, invitation-only app that walks you through ` +
              `a journey of faith alongside someone from the church.\n\n` +
              `Tap the button below to set your password and finish signing up. ` +
              `This link is just for you, please don't forward it.`,
          }),
          ...prev.emails,
        ],
        analytics: [...prev.analytics, ev(invite.invited_by, 'invite_sent', invite.email)],
      }));
      return invite;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  // Inviting a recommendation carries the Guide through, so acceptance pairs
  // them; declining closes it and says so.
  const inviteRecommended = useCallback(
    (recommendationId: string) => {
      const rec = db.recommendations.find((r) => r.id === recommendationId);
      if (!rec || rec.status !== 'pending') return;
      const invite = createInvite({
        full_name: rec.full_name,
        email: rec.email,
        role: 'ds',
        pair_with_dm: rec.dm_id,
        recommendation_id: rec.id,
      });
      persistUpdate((prev) => ({
        ...prev,
        recommendations: prev.recommendations.map((r) =>
          r.id === rec.id
            ? {
                ...r,
                status: 'invited' as const,
                decided_by: userId ?? undefined,
                decided_at: nowIso(),
                invite_id: invite.id,
              }
            : r,
        ),
        notifications: [
          {
            id: uid(),
            user_id: rec.dm_id,
            type: 'approval',
            title: `${rec.full_name} has been invited`,
            body: 'They will be paired with you the moment they sign up.',
            created_at: nowIso(),
          },
          ...prev.notifications,
        ],
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.recommendations, userId, createInvite],
  );

  const declineRecommendation = useCallback(
    (recommendationId: string) => {
      persistUpdate((prev) => {
        const rec = prev.recommendations.find((r) => r.id === recommendationId);
        if (!rec || rec.status !== 'pending') return prev;
        return {
          ...prev,
          recommendations: prev.recommendations.map((r) =>
            r.id === recommendationId
              ? {
                  ...r,
                  status: 'declined' as const,
                  decided_by: userId ?? undefined,
                  decided_at: nowIso(),
                }
              : r,
          ),
          notifications: [
            {
              id: uid(),
              user_id: rec.dm_id,
              type: 'approval',
              title: `Not inviting ${rec.full_name} for now`,
              body: 'Your admin has this one. Ask them if you want the reason.',
              created_at: nowIso(),
            },
            ...prev.notifications,
          ],
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const revokeInvite = useCallback((id: string) => {
    persistUpdate((prev) => ({
      ...prev,
      invites: prev.invites.map((i) =>
        i.id === id && i.status === 'pending' ? { ...i, status: 'revoked' as const } : i,
      ),
    }));
  }, []);

  // Complete an invited sign-up: create the account (approved, since an admin
  // invited them), mark the invite used and notify the admin. Null if the token
  // is missing, used or revoked.
  const acceptInvite = useCallback(
    (
      token: string,
      profile: {
        full_name: string;
        preferred_contact?: string;
        birthday?: string;
        gender?: string;
        status?: string;
        topics_of_interest?: string[];
        city_of_residence?: string;
        work_industry?: string;
        consent_at?: string;
        terms_version?: string;
        privacy_version?: string;
      },
    ): string | null => {
      const invite = db.invites.find((i) => i.token === token);
      if (!invite || invite.status !== 'pending') return null;
      const id = invite.role + '-' + uid();
      persistUpdate((prev) => ({
        ...prev,
        profiles: [
          ...prev.profiles,
          {
            id,
            role: invite.role,
            full_name: profile.full_name.trim() || invite.full_name,
            preferred_contact: profile.preferred_contact,
            birthday: profile.birthday || undefined,
            gender: profile.gender,
            status: profile.status,
            topics_of_interest: profile.topics_of_interest ?? [],
            city_of_residence: profile.city_of_residence,
            work_industry: profile.work_industry,
            preferred_language: 'en',
            // The moment consent was given is recorded.
            consent_at: profile.consent_at,
            // And what was agreed to, and when (lib/legal.ts).
            terms_version: profile.terms_version,
            privacy_version: profile.privacy_version,
            terms_agreed_at: profile.terms_version ? nowIso() : undefined,
            is_approved: true,
            created_at: nowIso(),
          },
        ],
        invites: prev.invites.map((i) =>
          i.id === invite.id
            ? { ...i, status: 'accepted' as const, accepted_at: nowIso() }
            : i,
        ),
        // Pair them with the recommending Guide at Connect.
        pairings:
          invite.pair_with_dm && invite.role === 'ds'
            ? [
                {
                  id: uid(),
                  dm_id: invite.pair_with_dm,
                  ds_id: id,
                  track: 'digital' as const,
                  journey_stage: 'connect' as const,
                  status: 'active' as const,
                  created_at: nowIso(),
                },
                ...prev.pairings,
              ]
            : prev.pairings,
        recommendations: invite.recommendation_id
          ? prev.recommendations.map((r) =>
              r.id === invite.recommendation_id ? { ...r, status: 'invited' as const } : r,
            )
          : prev.recommendations,
        notifications: [
          {
            id: uid(),
            user_id: invite.invited_by,
            type: 'approval',
            title: 'An invited explorer joined',
            body: `${profile.full_name.trim() || invite.full_name} completed sign-up`,
            created_at: nowIso(),
          },
          // The recommending Guide is told too.
          ...(invite.pair_with_dm
            ? [
                {
                  id: uid(),
                  user_id: invite.pair_with_dm,
                  type: 'paired',
                  title: `${profile.full_name.trim() || invite.full_name} joined`,
                  body: 'They are now walking with you. Say hello.',
                  created_at: nowIso(),
                },
              ]
            : []),
          ...prev.notifications,
        ],
        analytics: [...prev.analytics, ev(id, 'invite_accepted')],
      }));
      return id;
    },
    [db.invites],
  );

  // Shared helper: apply a pure update and persist it.
  function persistUpdate(fn: (prev: DB) => DB) {
    setDb((prev) => {
      const next = fn(prev);
      return saveDb(next);
    });
  }

  const currentUser = useMemo(
    () => db.profiles.find((p) => p.id === userId) ?? null,
    [db.profiles, userId],
  );

  const value: Ctx = {
    db,
    userId,
    currentUser,
    signInAs,
    signOut,
    resetDemo,
    advanceStage,
    sendMessage,
    editMessage,
    deleteMessage,
    reactTo,
    shareMaterial,
    approveUser,
    createPairing,
    addMaterial,
    createLocalAccount,
    track,
    tutorialActive,
    tutorialTrack,
    startTutorial,
    endTutorial,
    markNotificationRead,
    markAllNotificationsRead,
    updateProfile,
    setMyRole,
    addSeekerMedia,
    giveConsent,
    addPrayerRequest,
    setPrayerStatus,
    askForPrayer,
    withdrawPrayerRequest,
    reportPrayerRequest,
    createSeries,
    setSeriesPublished,
    setSeriesDrawing,
    startSeries,
    assignLesson,
    completeLesson,
    setChurchName,
    setChurchLegal,
    agreeToCurrentTerms,
    scheduleMeeting,
    cancelMeeting,
    markMessagesRead,
    markEmailOpened,
    sendRecommendation,
    actOnEmail,
    clearEmails,
    attachMedia,
    removeMedia,
    mediaFor,
    addNote,
    deleteNote,
    addFollowUp,
    toggleFollowUp,
    deleteFollowUp,
    addBlogPost,
    setBlogVisibility,
    deleteBlogPost,
    recordBlogView,
    kickMember,
    reportPerson,
    resolveReport,
    disapproveMember,
    importData,
    createInvite,
    inviteRecommended,
    declineRecommendation,
    revokeInvite,
    inviteByToken,
    acceptInvite,
  };

  // Render nothing until hydrated, so stored data does not replace the seed on screen.
  if (!ready) return null;

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): Ctx {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used inside <DemoProvider>');
  return ctx;
}
