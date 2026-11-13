import type { Stage } from './types';

// A light, built-in discipleship curriculum: a few short lessons per journey
// stage. A missionary assigns these to a seeker; the seeker reads them and marks
// them done. This is intentionally simple content the church can expand later.
export interface Lesson {
  id: string;
  stage: Stage;
  title: string;
  description: string;
  link?: string;
}

export const LESSONS: Lesson[] = [
  // Create — first contact
  { id: 'l-create-1', stage: 'create', title: 'Who is Jesus?', description: 'A gentle first look at the person at the centre of it all.', link: 'https://www.bibleinfo.com/' },
  { id: 'l-create-2', stage: 'create', title: 'The Bible: God’s message to you', description: 'What this book is, and how to begin reading it.' },

  // Connect — building rapport
  { id: 'l-connect-1', stage: 'connect', title: 'God’s love for you', description: 'The heart of the good news, in plain words.' },
  { id: 'l-connect-2', stage: 'connect', title: 'Prayer: talking with God', description: 'You don’t need special words, just an honest heart.' },

  // Care — walking alongside
  { id: 'l-care-1', stage: 'care', title: 'Finding rest and peace', description: 'Rest for a weary heart, and where it comes from.' },
  { id: 'l-care-2', stage: 'care', title: 'The great hope', description: 'The promise that steadies us through hard times.', link: 'https://www.hopechannel.com/' },

  // Call — the point of decision
  { id: 'l-call-1', stage: 'call', title: 'Choosing to follow Jesus', description: 'What it means to say yes, and why it’s worth it.' },
  { id: 'l-call-2', stage: 'call', title: 'Baptism: a new beginning', description: 'A fresh start, and what baptism is and isn’t.' },

  // Cultivate — growing in faith
  { id: 'l-cult-1', stage: 'cultivate', title: 'Growing every day', description: 'Simple habits that keep faith alive and green.' },
  { id: 'l-cult-2', stage: 'cultivate', title: 'The Sabbath: a gift of rest', description: 'A weekly gift of time to be still and known.' },

  // Commission — sent to disciple
  { id: 'l-comm-1', stage: 'commission', title: 'Sharing your story', description: 'Your own story is the most powerful thing you can give.' },
  { id: 'l-comm-2', stage: 'commission', title: 'Serving others', description: 'Faith that reaches out, in small acts and big love.' },
];

export function lessonsForStage(stage: Stage): Lesson[] {
  return LESSONS.filter((l) => l.stage === stage);
}
export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

// ---------------------------------------------------------------- series ----
//
// The pure half of "walked through with them until they finish". Everything
// here takes what it needs as arguments and returns a plain answer, so a screen
// can ask "how far along are they?" without knowing where the data lives, and
// so it can be tested without a browser.

import type { LessonAssignment, LessonSeries } from './types';

export interface SeriesProgress {
  total: number;
  done: number;
  /** The next lesson to do, or null when the series is finished. */
  next: Lesson | null;
  finished: boolean;
  /** The assignments for this series on this pairing, in series order. */
  steps: { lesson: Lesson; assignment?: LessonAssignment }[];
}

/**
 * How far one pairing has got through one series.
 *
 * Counts against the SERIES, not against what happens to be assigned. A lesson
 * the missionary has not pushed yet still counts towards the total, because the
 * seeker is being walked through a course of a known length and "3 of 6" has to
 * mean the same thing on both their screens.
 */
export function seriesProgress(
  series: LessonSeries,
  assignments: LessonAssignment[],
  pairingId: string,
): SeriesProgress {
  const mine = assignments.filter((a) => a.pairing_id === pairingId);
  const steps = series.lesson_ids
    .map((id) => ({
      lesson: lessonById(id),
      assignment: mine.find((a) => a.lesson_id === id),
    }))
    // A series can outlive a lesson being renamed out of the catalogue. Drop the
    // gap rather than rendering an empty row nobody can act on.
    .filter(
      (s): s is { lesson: Lesson; assignment: LessonAssignment | undefined } => !!s.lesson,
    );

  const done = steps.filter((s) => s.assignment?.status === 'completed').length;
  const nextStep = steps.find((s) => s.assignment?.status !== 'completed');
  return {
    total: steps.length,
    done,
    next: nextStep?.lesson ?? null,
    finished: steps.length > 0 && done === steps.length,
    steps,
  };
}

/** Series a missionary may offer: published, and with at least one lesson. */
export function offerableSeries(all: LessonSeries[]): LessonSeries[] {
  return all
    .filter((s) => s.is_published && s.lesson_ids.length > 0)
    .sort((a, b) => a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title));
}

