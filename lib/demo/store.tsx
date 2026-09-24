'use client';

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
} from '../types';
import { nextStage, roleLabel, canKick } from '../brand';

// What an approval notice says. An Explorer is welcomed by name and not told
// what category they have been filed under; everybody else is told the job they
// now hold, because for them it is genuinely useful information.
//
// The reader IS the subject here, so the viewer argument is the same role —
// which is exactly what makes roleLabel() withhold 'Explorer'.
function welcomeLine(role: string): string {
  const label = roleLabel(role, role);
  return label ? `Welcome! You are now a ${label}.` : 'Welcome! Your account is ready.';
}
import { publishDb, subscribeDb } from '../realtime';
import { deleteMedia, newMediaId, putMedia, typeFromMime } from '../localMedia';
import { makeSeed } from './seed';
import { prayerAuthor } from '../types';

// -------------------------------------------------------------------------
// Demo store. A self-contained, in-browser backend so the app runs and
// demonstrates with zero configuration. Everything lives in localStorage and
// nothing here talks to a network. The shapes it stores are the app's real
// domain types (see lib/types.ts), so the screens are unchanged from a build
// backed by a database.
// -------------------------------------------------------------------------

const DB_KEY = 'beacon-demo-v1';
const PERSONA_KEY = 'beacon-persona';
const TUTORIAL_KEY = 'beacon-tutorial';
// Where the person's own demo data waits while the tutorial borrows the app.
const PRETUTORIAL_KEY = 'beacon-demo-pretutorial';
// WHAT GETS WRITTEN WHEN THERE WAS NOTHING TO PARK.
//
// "No saved demo" is a state to put back, and treating it as "nothing to do"
// is the bug this exists for. Somebody opening the demo for the first time has
// no `beacon-demo-v1` at all. Starting the tutorial saved nothing, because
// there was nothing to save; finishing restored nothing, for the same reason;
// and the tutorial's own database was simply left sitting there as theirs,
// with whatever they changed during the walk still in it. Their first
// impression of the demo was the leftovers of a tutorial.
//
// It survived because the check for it was written the same way round as the
// code: "snapshot cleaned up after finishing" passes when no snapshot was ever
// taken. WebKit is where it finally showed, and it is not a WebKit bug; that
// engine just happened to reach the tutorial with empty storage.
//
// Deliberately not valid JSON, so a restore path that forgets to check for it
// throws rather than quietly loading a database made of the word none.
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

// One place that writes the database to localStorage.
//
// Why this exists: localStorage holds roughly 5 MB, the whole DB is re-serialised
// on every action, and profile photos are stored as data URLs. Once the quota is
// hit, setItem throws — and every call site used to swallow that in an empty
// catch, so saves failed SILENTLY and the user lost everything on refresh. Now a
// failed write prunes the largest growable collection and retries once, so the
// app degrades by forgetting old analytics instead of losing the user's data.
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
    // Out of room: drop all but the most recent analytics and try once more.
    const lean: DB = { ...trimmed, analytics: trimmed.analytics.slice(-50) };
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(lean));
      publishDb(lean);
      return lean;
    } catch {
      // Still no room (or storage blocked entirely) — keep working in memory.
      return trimmed;
    }
  }
}

// Bring a saved database up to the shape the code now expects.
//
// This exists because of a specific outage, and the shape of the fix is the
// lesson. There used to be a hand-written list here — `if (!parsed.meetings)
// parsed.meetings = []`, once per collection — which meant every new collection
// needed a second edit in a second place, by memory. `lesson_series` shipped
// without that second edit. Every device holding saved demo data then loaded a
// database where `db.lesson_series` was undefined, the first `.filter()` on it
// threw during render, and the app fell to the "Beacon needs a fresh copy"
// screen. That screen cannot fix it: the bad value is in localStorage and the
// repair only clears service workers and caches, deliberately never storage. So
// refreshing, however hard, did nothing at all.
//
// Now the shape comes from the seed. Add a collection to makeSeed() and old
// saves pick it up on the next load; there is no list to keep in step.
//
// A key can only be missing if the save predates the collection, which means
// there is no user data in it to protect — so a missing collection takes the
// seed's own value and the feature is simply there. A key that is present, even
// as an empty array, is the person's and is left alone.
export function normalizeDb(parsed: unknown): DB {
  const seed = makeSeed() as unknown as Record<string, unknown>;
  const saved = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(seed)) {
    const want = seed[key];
    const have = saved[key];
    if (Array.isArray(want)) {
      // Wrong type counts as missing: a null or an object here would throw at
      // the first .filter() exactly the way undefined did.
      out[key] = Array.isArray(have) ? have : want;
    } else {
      out[key] = have === undefined || have === null ? want : have;
    }
  }
  // Keep anything the save has that the seed does not, so an older build
  // reading a newer save does not quietly delete the newer build's data.
  for (const key of Object.keys(saved)) {
    if (!(key in out)) out[key] = saved[key];
  }

  return out as unknown as DB;
}

// Build one analytics (behaviour) event. Kept local; only aggregated later.
function ev(user_id: string, type: AnalyticsEvent['type'], meta?: string): AnalyticsEvent {
  return { id: uid(), user_id, type, meta, at: nowIso() };
}

// Build the message the app would have emailed. Captured in db.emails and
// shown in the admin Outbox instead of vanishing into a mail server that does
// not exist in this build.
function mail(m: Omit<DemoEmail, 'id' | 'created_at'>): DemoEmail {
  return { ...m, id: uid(), created_at: nowIso() };
}

/**
 * THE BACKEND CONTRACT.
 *
 * Everything the app can do is on this interface, and nothing reaches past it —
 * no component fetches, no screen knows where anything is stored. So anything
 * that satisfies these functions can be the backend, and every screen keeps
 * working unchanged. That is what makes this app platform-agnostic: not an
 * abstraction bolted on top, but the fact that there has only ever been one
 * place data comes from.
 *
 * Exported so a real implementation can be typed against it — TypeScript then
 * lists exactly what you still have to write. See docs/BACKENDS.md.
 */
export interface Ctx {
  db: DB;
  userId: string | null;
  currentUser: Profile | null;
  signInAs: (id: string) => void;
  signOut: () => void;
  resetDemo: () => void;
  advanceStage: (pairingId: string) => void;
  sendMessage: (pairingId: string, body: string) => void;
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
  /**
   * The author may move a request anywhere; the other side may only move it
   * from open to praying. The same rule the live database enforces.
   */
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
  }) => string;
  /** Library: show it to missionaries, or take it back off the shelf. */
  setSeriesPublished: (seriesId: string, published: boolean) => void;
  /** Missionary: push a whole series to one seeker, in order. */
  startSeries: (pairingId: string, seriesId: string) => void;

  setChurchName: (name: string) => void;
  scheduleMeeting: (
    pairingId: string,
    m: { title: string; when: string; mode: Meeting['mode']; location?: string },
  ) => void;
  cancelMeeting: (id: string) => void;
  importData: (next: DB) => void;
  markMessagesRead: (pairingId: string) => void;
  markEmailOpened: (id: string) => void;
  sendRecommendation: (fullName: string, email: string, note: string) => void;
  // The admin's two answers to a recommendation. Inviting carries the
  // recommending missionary through to the invite, which is what makes the
  // pairing happen on acceptance.
  inviteRecommended: (recommendationId: string) => void;
  declineRecommendation: (recommendationId: string) => void;
  actOnEmail: (emailId: string, action: 'approve' | 'disapprove') => void;
  clearEmails: () => void;
  /**
   * Attach a file to a conversation. Returns the new media id immediately and
   * writes the bytes in the background, so the attachment appears the instant
   * it is chosen rather than after the disk finishes — the same optimistic rule
   * every other write in this store follows. Returns null when the caller is
   * not in the pairing.
   */
  attachMedia: (pairingId: string, file: File) => string | null;
  /** Remove an attachment and its bytes. The owner only. */
  removeMedia: (id: string) => void;
  /**
   * Media the SIGNED-IN person may see in this pairing. Screens must call this
   * rather than filtering db.pairing_media themselves — the rule belongs in one
   * place, and in a real deployment that place is a database policy.
   */
  mediaFor: (pairingId: string) => PairingMedia[];
  addNote: (pairingId: string, body: string) => void;
  deleteNote: (id: string) => void;
  addFollowUp: (pairingId: string, title: string, dueOn?: string) => void;
  toggleFollowUp: (id: string) => void;
  deleteFollowUp: (id: string) => void;
  // Blog. A Guide writes; the Explorers they walk with read.
  addBlogPost: (m: {
    title: string;
    body: string;
    visibility: BlogVisibility;
    audience: BlogAudienceKind;
    dsIds?: string[];
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
 *
 * Every screen goes on reading from useDemo() and none of them notice.
 */
export const DemoContext = createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(makeSeed);
  const [userId, setUserId] = useState<string | null>(null);
  const [tutorialActive, setTutorialActive] = useState(false);
  // Read from storage on mount rather than during render, so a reload mid-walk
  // resumes the walk you were on instead of dropping you into the missionary's.
  const [tutorialTrack, setTutorialTrack] = useState<QuestTrack>('dm');
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once, on the client, to avoid SSR mismatch.
  useEffect(() => {
    try {
      const savedDb = localStorage.getItem(DB_KEY);
      if (savedDb) {
        // Older saves predate newer collections. normalizeDb fills them in from
        // the seed, so a save written before a feature existed still loads.
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
      /* ignore corrupt storage — fall back to seed */
    }
    setReady(true);
  }, []);

  // Live sync between every open window of the app on this device.
  //
  // Applied with setDb and NOT with saveDb, and that is load-bearing. saveDb
  // publishes; publishing what we just received would send it straight back and
  // two windows would volley the database at each other forever. The window
  // that made the change has already written localStorage, and it is the same
  // storage, so there is nothing left for this side to save.
  //
  // Note what deliberately does NOT sync: who you are signed in as. Each window
  // keeps its own userId, which is the entire point — one window is the
  // missionary and the other is the seeker.
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
        if (!to) return prev; // already at Commission
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
          // The seeker used to be told "You advanced to care" — the raw stage
          // key, addressed to the one person the client asked never to see it.
          // The advance is real and worth marking, so it is still marked; it is
          // just no longer a label the church put on them.
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
    (pairingId: string, body: string) => {
      const text = body.trim();
      if (!text || !userId) return;
      setDb((prev) => {
        const pairing = prev.pairings.find((p) => p.id === pairingId);
        if (!pairing) return prev;
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
        // Tell the approved person what happened — admin → user transparency.
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
        // One active DM per seeker: guard against a duplicate active pairing.
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
          // Notify BOTH sides so the connection is transparent to each of them.
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

  // Create a local account that lives only on this device. Starts as an
  // unapproved seeker — the admin's approval gate still applies.
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

  // The tutorial gets its own space, and gives the demo back afterwards.
  //
  // The tutorial is a script: open THIS seeker, advance them, share with them.
  // It ran against the same data the person explores freely in, and every run
  // consumed a little of it — each pass advanced John one stage, so by the fifth
  // run he had reached the end of the journey, the Advance button no longer
  // existed, and the step could never be completed. That is what "it doesn't
  // repeat the same route, sometimes it doesn't respond" was: the script slowly
  // outgrowing the data it was written for.
  //
  // So starting the tutorial parks the person's demo data to one side and lays
  // out a fresh copy of the sample. Finishing puts their data back exactly as it
  // was. The tutorial therefore always begins from the same known state — which
  // is what makes it repeatable — and nothing it does leaks into the demo.
  // Which walk, and therefore who you become for it.
  //
  // This used to sign everybody in as 'dm-maria', which is why a church director
  // opening the demo was handed a missionary's job. The track is now the
  // argument, and it decides both the steps and the persona.
  const startTutorial = useCallback(
    (track: QuestTrack = 'dm') => {
      try {
        // Only snapshot on the way IN, or replaying mid-tutorial would overwrite
        // the person's real data with the tutorial's own leftovers.
        if (localStorage.getItem(TUTORIAL_KEY) !== '1') {
          // The absence is recorded too. See NOTHING_BEFORE.
          localStorage.setItem(PRETUTORIAL_KEY, localStorage.getItem(DB_KEY) ?? NOTHING_BEFORE);
        }
        localStorage.setItem(TUTORIAL_KEY, '1');
        localStorage.setItem(TRACK_KEY, track);
        // Replay this walk from its first step. Only this one: the other walks
        // keep their own progress under their own keys.
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
      // `!== null` rather than truthiness. An empty string is a value that was
      // there, and reading it as "nothing was saved" is how the tutorial's data
      // is left behind.
      if (saved !== null) {
        localStorage.removeItem(PRETUTORIAL_KEY);
        if (saved === NOTHING_BEFORE) {
          // Put back the nothing. Removing the key rather than writing a seed
          // leaves the demo exactly as a first-time visitor finds it, which is
          // what "as I left it" means when they left it untouched.
          localStorage.removeItem(DB_KEY);
          setDb(makeSeed());
        } else {
          localStorage.setItem(DB_KEY, saved);
          // Through the normaliser too. This snapshot was taken before the walk
          // began and can be as old as any other save, so restoring it raw is
          // the same crash by a slower route.
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

  // Edit your own profile. Identity/role/approval are never editable here (that
  // is admin-only), matching the backend's column locks.
  // DEMO ONLY — switch your own account between roles.
  //
  // This does not exist in the real app, and must not. There, your role is
  // given to you by an admin and `updateProfile` below deliberately refuses to
  // change it (a member who could promote themselves is the whole security
  // model gone). But this build exists so church admins can
  // try the app before they commit to it, and nobody can evaluate an admin
  // screen they are not allowed to open. So here, and only here, you may look
  // through any role's eyes with your own account.
  const setMyRole = useCallback((role: Role) => {
    if (!userId) return;
    persistUpdate((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        // is_approved comes along for the ride: a role you switched into
        // yourself would otherwise sit at the approval gate forever.
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

  // A missionary assigns a built-in lesson to their seeker's pairing.
  // ---------------------------------------------------------------- series --
  //
  // The library builds a course; a missionary pushes the whole thing at a
  // seeker; the seeker walks it in order. Three actions, and the ordering lives
  // in the data rather than in any screen.

  const createSeries = useCallback(
    ({
      title,
      topic,
      description,
      lessonIds,
    }: {
      title: string;
      topic: string;
      description?: string;
      lessonIds: string[];
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
            // De-duplicated but order preserved: picking the same lesson twice
            // is a slip, and a course that repeats a lesson reads as a bug.
            lesson_ids: Array.from(new Set(lessonIds)),
            is_published: true,
            created_at: nowIso(),
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

  const startSeries = useCallback(
    (pairingId: string, seriesId: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const series = prev.lesson_series.find((s) => s.id === seriesId);
        const pairing = prev.pairings.find((p) => p.id === pairingId);
        if (!series || !pairing) return prev;

        // Anything already assigned stays as it is, including its progress. A
        // missionary who assigned two of these by hand last month should not
        // have that work undone by starting the course they belong to.
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

        // Already-assigned lessons join the series too, so the count on the
        // seeker's screen matches the course rather than only the new part.
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

  // A seeker marks an assigned lesson complete. Their missionary is notified,
  // and nudged to advance the journey once every assigned lesson is done.
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

  // Schedule a meeting (call or in-person study) on a pairing; notify the other.
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

  // Mark the other side's messages in a conversation as read. Called when a
  // chat is opened. Without this `read_at` is never written outside the seed,
  // so the unread dot on the seeker list stays lit forever and the "unread"
  // triage count is meaningless.
  const markMessagesRead = useCallback(
    (pairingId: string) => {
      if (!userId) return;
      persistUpdate((prev) => {
        const stale = prev.messages.some(
          (m) => m.pairing_id === pairingId && m.sender_id !== userId && !m.read_at,
        );
        if (!stale) return prev; // nothing to do — avoid a pointless write
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

  // ---- Media: files shared inside one pairing ----
  //
  // The rule is the one from docs/examples/schema.sql (2b): media follows its
  // PAIRING. Both people in the pairing may see it; nobody else may, and there
  // is no admin exception, exactly as with messages. The bytes go to IndexedDB
  // and never into this database — see PairingMedia in lib/types.ts for why
  // that is not a preference.

  const attachMedia = useCallback(
    (pairingId: string, file: File): string | null => {
      if (!userId || !file) return null;
      // Upload as self, into a pairing you are in. The same two conditions as
      // the "upload as self" policy in the example schema.
      const p = db.pairings.find((x) => x.id === pairingId);
      if (!p || (p.dm_id !== userId && p.ds_id !== userId)) return null;

      const id = newMediaId();
      const kind = typeFromMime(file.type);
      const row: PairingMedia = {
        id,
        pairing_id: pairingId,
        owner_id: userId,
        kind,
        title: file.name || 'Attachment',
        mime: file.type || undefined,
        size: file.size,
        created_at: nowIso(),
      };

      // Show it immediately — the same optimistic rule as every other write.
      persistUpdate((prev) => ({
        ...prev,
        pairing_media: [...prev.pairing_media, row],
        analytics: [...prev.analytics, ev(userId, 'media_upload')],
      }));

      // Then write the bytes. If the disk refuses — quota exceeded, private
      // browsing, storage blocked — take the row back out. An attachment whose
      // file does not exist is worse than no attachment: it is a permanent
      // broken thumbnail that nobody can explain or remove.
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
        // SAY SOMETHING. This catch used to be empty apart from the rollback,
        // so a failed write removed the attachment and told nobody: not the
        // person, who watched their photo appear and vanish, and not a
        // developer, who had no error to search for. WebKit fails here where
        // Chromium does not, and the whole investigation started from a test
        // saying only that the file "did not appear".
        //
        // The rollback is still right -- an attachment whose bytes are missing
        // is a permanent broken thumbnail -- but it must leave a trace.
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
      // Only the person who attached it. A missionary cannot delete a seeker's
      // photo, and a seeker cannot delete a missionary's.
      if (!row || row.owner_id !== userId) return;
      persistUpdate((prev) => ({
        ...prev,
        pairing_media: prev.pairing_media.filter((m) => m.id !== id),
      }));
      void deleteMedia(id).catch(() => {
        // The row is gone from the app either way; an orphaned blob is a
        // storage cost, not a correctness or privacy problem.
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

  // ---- A missionary's private workspace: notes and follow-ups ----
  // Both are visible only to the person who wrote them. The seeker never sees
  // them, and neither does an admin — that is what makes them useful.

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
        // The author check is the demo's stand-in for the RLS policy.
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

  // -------------------------------------------------------------------------
  // Blog.
  //
  // A post belongs to its author and nobody else can touch it — every mutation
  // below re-checks author_id against the signed-in user rather than trusting
  // the id it was handed. In the demo store that is belt and braces; in the
  // live backend the same rule is a row level security policy, and writing them
  // the same way here keeps the two from drifting.
  // -------------------------------------------------------------------------
  const addBlogPost = useCallback(
    (m: {
      title: string;
      body: string;
      visibility: BlogVisibility;
      audience: BlogAudienceKind;
      dsIds?: string[];
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
          },
          ...prev.blog_posts,
        ],
        // Named Explorers are only meaningful for a 'selected' post. Writing
        // them for an 'all' post would leave rows that quietly become wrong the
        // moment the Guide is paired with somebody new.
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
        // The views and the audience rows go with it. Leaving them behind would
        // keep counting readers for something nobody can read.
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
        // One row per person, not per open. A number that climbs every time
        // somebody scrolls past tells the writer nothing about whether anyone
        // actually read it.
        const already = prev.blog_views.some((v) => v.post_id === id && v.viewer_id === userId);
        // A Guide re-reading their own post is not a reader.
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

  // A missionary writes to the church's admins about someone waiting at the
  // approval gate. The message carries the sign-up it is about, so the admin can
  // decide from inside it, and the profile is stamped so the same vouching shows
  // on the Approvals card without opening the mail.
  // A missionary puts a name forward. The person has no account yet — that is
  // the whole point of the change. The old version offered a dropdown of people
  // who had already signed up, which meant the seeker the client described
  // (someone the DM knows, who has never heard of the app) could not be
  // recommended at all: the dropdown was simply empty.
  //
  // The DM still cannot invite. They recommend; the admin decides. The security
  // boundary is exactly where it was.
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

  // The admin decides from inside the message. Approving does exactly what the
  // Approvals tab does; declining removes the sign-up. Either way the message
  // records what happened so the thread is not ambiguous later.
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
            // Every admin got a copy; resolving one resolves the question.
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

  // Admins name / rename the church.
  const setChurchName = useCallback((name: string) => {
    persistUpdate((prev) => ({
      ...prev,
      church_name: name.trim() || prev.church_name,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A seeker sends a prayer request. Always goes to their missionary; if shared
  // it also lands on the church-wide prayer wall (anonymised there).
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
          // No prayer text in the notification, as on the live app, where it
          // becomes a pop-up on a locked phone.
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

  // Either side says "I am praying for this" and whoever asked is told -- a
  // Guide answering an Explorer, or an Explorer answering their Guide. Only the
  // author may do anything else with the status, which is the rule the live
  // database enforces (20260924100000).
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

  // A Guide asks the Explorers they walk with to pray for them: one request per
  // Explorer, so each "I am praying" answers exactly one ask and nobody learns
  // who else was asked. Never on the church wall.
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

  // The seeker accepts the privacy notice. The timestamp is the consent record.
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

  // A seeker adds their own study note / media. Their missionary is notified so
  // they can study together; admins can monitor it.
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

  // Restore a full backup: replace all data and sign out so the restored
  // church's people are re-selected fresh. Destructive by design — the UI
  // confirms first (see components/DataManager.tsx).
  const importData = useCallback(
    (next: DB) => {
      persist(next);
      signOut();
    },
    [persist, signOut],
  );

  // --- Safeguarding: reporting a person ----------------------------------
  //
  // A Guide and an Explorer talk privately, and nobody else can read it. That
  // is right for the conversation and it is also the reason this has to exist:
  // if one of them sends something inappropriate, there was no third party to
  // tell short of leaving the church.
  //
  // Three rules the shape of this enforces:
  //
  //   * EITHER SIDE MAY REPORT. Not only the Explorer. A Guide receiving
  //     something they should not have received has the same route out, and a
  //     tool only the "junior" party can use is one nobody uses.
  //   * THE OTHER PERSON IS NOT TOLD. No notification, no read receipt, no
  //     change they could notice. Somebody who fears being found out reporting
  //     does not report.
  //   * IT GOES TO PEOPLE, NOT TO A QUEUE. Every Director and Executive
  //     Director of the church is notified by name, because a report that
  //     nobody is looking at is worse than no report — it teaches the person
  //     who raised it that speaking up achieves nothing.

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
        // Reporting yourself is a mis-tap, not a report.
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
              // The reporter IS named to the Directors. Anonymous reporting
              // sounds kinder and is not: a Director cannot ask what happened,
              // cannot support the person, and cannot tell a grudge from a
              // genuine concern. What is protected is that the SUBJECT is
              // never told — which is the part that actually deters people.
              body: `${reporter.full_name} reported ${subject.full_name}.`,
              created_at: nowIso(),
            })),
            ...prev.notifications,
          ],
          // The subject's id is deliberately not the analytics subject here;
          // the event records that a report happened, not who it was about.
          analytics: [...prev.analytics, ev(userId, 'report_raised', args.reason)],
        });
      });
    },
    [userId],
  );

  /**
   * A Director closes a report.
   *
   * Closing is not the same as acting: `dismissed` says a Director looked and
   * judged there was nothing to answer, which is a real and common outcome and
   * must be as easy to record as the other. What is NOT offered is deleting
   * it — a safeguarding record that can be made to disappear is not a record.
   */
  // Report a prayer request somebody wrote TO you. The words go into the
  // report, as the live function copies them, so it still reads after the
  // request is withdrawn. The author is worked out here, never passed in.
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
      // Written to me: the Explorer it lives with, or the Guide of an Explorer
      // who asked.
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

  // --- Kick / Disapprove -------------------------------------------------

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
        // Once someone leaves the church, the private notes and reminders kept
        // about them go too — they are personal notes about a person who is no
        // longer here, and nothing in the app can reach them again anyway.
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

  // --- Invite-only onboarding -------------------------------------------
  // The app is private: seekers cannot self-register. An admin creates an
  // invite (name + email), which yields a secure token. In production the
  // backend emails the link (see docs/BACKEND-EMAIL-INVITES.md); in the demo
  // the admin copies it. The invited person opens /join?token=… and completes
  // their sign-up — only then does an account exist.

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
        token: uid() + uid() + uid(), // long, unguessable token for the link
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

  // The admin's two answers to a recommendation.
  //
  // Inviting reuses createInvite exactly as it already worked, and adds one
  // thing: the recommending missionary rides along on the invite, so accepting
  // it creates the pairing. Declining closes the recommendation and says so,
  // because a missionary who hears nothing back assumes the app ate it.
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

  // Complete an invited sign-up: create the seeker's account (pre-approved,
  // because an admin already vetted them by inviting), mark the invite used,
  // and notify the admin. Returns the new profile id (to sign them in), or null
  // if the token is missing/used/revoked.
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
            // Recorded at the moment it was given. A consent nobody wrote down
            // is not a consent — if the church is ever asked when this person
            // agreed to their details being held, the answer has to exist.
            consent_at: profile.consent_at,
            is_approved: true, // admin-invited → approved, ready to be paired
            created_at: nowIso(),
          },
        ],
        invites: prev.invites.map((i) =>
          i.id === invite.id
            ? { ...i, status: 'accepted' as const, accepted_at: nowIso() }
            : i,
        ),
        // "The app begins on Create for DM and Connect for DS (initiated by
        // DM)." The seeker did not walk in off the street: a missionary named
        // them and an admin invited them, so the relationship exists before the
        // account does. Creating the pairing here at Connect is what makes that
        // true in the data rather than only in the story — before this, an
        // invited seeker landed with nobody attached and waited for an admin to
        // pick two names out of dropdowns.
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
          // The missionary who put the name forward hears about it too. They
          // started this; being told it worked is the least the app owes them.
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
    startSeries,
    assignLesson,
    completeLesson,
    setChurchName,
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

  // Hold render until hydration so persisted state doesn't flash-replace seed.
  if (!ready) return null;

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): Ctx {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used inside <DemoProvider>');
  return ctx;
}
