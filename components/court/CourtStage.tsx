'use client';

// The live session: the court room drawn as a scene, with everybody in it as
// a game-like avatar in their place.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 20 October 2026: "I want the UI to be some kind of a game
// avatar for live session court."
//
// WHAT IT SHOWS, all of it from what court_case already returned, so it never
// shows anybody more than the database let them read:
//   * the judge at the bench, the person the case is about and the one who
//     raised it at their stands, the one who brought it at their table, the
//     witnesses in the box, and (for the bench only, as everywhere else) the
//     gallery;
//   * who is in the room now: lit, with a green light, when their screen has
//     said so in the last minute and a bit (court_here); dimmed, "away",
//     when not;
//   * a speech bubble over whoever spoke in the last three minutes, with the
//     start of what they said. The whole of it is in the record below.
// Nothing here is written anywhere. The avatars are worked out from account
// ids (lib/court/avatar.ts); a deleted account is a plain grey figure.
// Movement (a gentle idle bob, a bounce while speaking) stops for anybody who
// asked their device for less motion (court.css).
// ---------------------------------------------------------------------------

import { lookFor, PART_WORDS, type AvatarPart } from '@/lib/court/avatar';
import type { CourtCaseFull } from '@/lib/live/court';

const BUBBLE_MS = 3 * 60_000;

interface Seat {
  id: string | null;
  name: string;
  part: AvatarPart;
  here: boolean;
  deleted: boolean;
}

export function CourtStage({ full, meId, now = Date.now() }: { full: CourtCaseFull; meId: string; now?: number }) {
  const c = full.case;

  // The newest thing each person said in the last few minutes. Words the judge
  // wrote down for somebody are that person's.
  const said = new Map<string, string>();
  for (const s of full.statements) {
    const who = s.for_id ?? s.author_id;
    if (!who || now - new Date(s.at).getTime() > BUBBLE_MS) continue;
    said.set(who, s.body);
  }

  const judge: Seat | null = c.judge_id
    ? { id: c.judge_id, name: c.judge_name, part: 'judge', here: Boolean(c.judge_here) || c.judge_id === meId, deleted: false }
    : null;
  const opener: Seat | null = c.opener_id && c.opener_id !== c.judge_id
    ? { id: c.opener_id, name: c.opener_name, part: 'opener', here: Boolean(c.opener_here) || c.opener_id === meId, deleted: false }
    : null;
  const seat = (p: CourtCaseFull['people'][number]): Seat => ({
    id: p.id, name: p.name, part: p.part, deleted: Boolean(p.deleted),
    here: !p.deleted && (Boolean(p.here) || p.id === meId),
  });
  const about = full.people.filter((p) => p.part === 'accused').map(seat);
  const raised = full.people.filter((p) => p.part === 'reporter').map(seat);
  const witnesses = full.people.filter((p) => p.part === 'witness').map(seat);
  const gallery = full.people.filter((p) => p.part === 'observer').map(seat);

  const everyone = [judge, opener, ...about, ...raised, ...witnesses, ...gallery].filter(Boolean) as Seat[];
  const inRoom = everyone.filter((s) => s.here).length;
  const status = c.status === 'open'
    ? 'Live session'
    : c.status === 'with_board' ? 'Hearing closed · with the Church Board' : 'Ruled by the Church Board';

  const figure = (s: Seat | null, empty?: string) => s
    ? <Figure key={`${s.part}-${s.id}`} seat={s} me={s.id === meId} bubble={s.id ? said.get(s.id) : undefined} live={c.status === 'open'} />
    : empty ? <EmptySeat label={empty} /> : null;

  return (
    <section className="ct-scene" data-court-stage aria-label="The court room, live">
      <div className="ct-scene-hud">
        <span className="ct-live" data-live={c.status === 'open'}>
          <span className="ct-live-dot" aria-hidden /> {status}
        </span>
        <span className="ct-hud-count" data-court-in-room={inRoom}>
          {inRoom} of {everyone.length} in the room
        </span>
      </div>

      <div className="ct-scene-room">
        <div className="ct-scene-bench" role="list" aria-label="The bench">
          {figure(judge, 'Waiting for a judge')}
          <div className="ct-bench-desk" aria-hidden>
            <span>The bench</span>
          </div>
        </div>

        <div className="ct-scene-row">
          <Group label="The case is about" seats={about.map((s) => figure(s))} />
          {opener && <Group label="Brought the case" seats={[figure(opener)]} />}
          {raised.length > 0 && <Group label="Raised it" seats={raised.map((s) => figure(s))} />}
        </div>

        {witnesses.length > 0 && (
          <Group label="The witness box" className="ct-scene-witnesses" seats={witnesses.map((s) => figure(s))} />
        )}

        {gallery.length > 0 && (
          <Group label="The gallery" className="ct-scene-gallery" seats={gallery.map((s) => figure(s))} />
        )}
      </div>
    </section>
  );
}

function Group({ label, seats, className = '' }: { label: string; seats: React.ReactNode[]; className?: string }) {
  return (
    <div className={`ct-scene-group ${className}`}>
      <p className="ct-scene-label">{label}</p>
      <div className="ct-scene-seats" role="list" aria-label={label}>{seats}</div>
    </div>
  );
}

function EmptySeat({ label }: { label: string }) {
  return (
    <div className="ct-seat ct-seat-empty" role="listitem" data-court-seat="empty">
      <svg viewBox="0 0 64 80" className="ct-figure" aria-hidden>
        <rect x="16" y="40" width="32" height="30" rx="6" fill="#6b4226" opacity="0.5" />
        <rect x="20" y="22" width="24" height="22" rx="5" fill="#6b4226" opacity="0.35" />
      </svg>
      <span className="ct-plate"><span className="ct-plate-name">{label}</span></span>
    </div>
  );
}

function Figure({ seat, me, bubble, live }: { seat: Seat; me: boolean; bubble?: string; live: boolean }) {
  const words = `${seat.name}, ${PART_WORDS[seat.part]}${seat.deleted ? '' : seat.here ? ', in the room now' : ', away'}${me ? ' (you)' : ''}`;
  return (
    <div
      className="ct-seat"
      role="listitem"
      aria-label={words}
      data-court-seat={seat.part}
      data-here={seat.here}
      data-me={me}
      data-speaking={Boolean(bubble) && live}
    >
      {bubble && (
        <span className="ct-bubble" aria-hidden>
          {bubble.length > 90 ? `${bubble.slice(0, 88)}…` : bubble}
        </span>
      )}
      <Avatar id={seat.id ?? seat.name} part={seat.part} deleted={seat.deleted} />
      {seat.here && <span className="ct-here-light" aria-hidden />}
      <span className="ct-plate">
        <span className="ct-plate-name">{me ? 'You' : seat.name}</span>
        <span className="ct-plate-part">{seat.deleted ? 'account deleted' : seat.here ? PART_WORDS[seat.part] : `${PART_WORDS[seat.part]} · away`}</span>
      </span>
    </div>
  );
}

/** One figure, drawn from the account id and dressed for the part. */
export function Avatar({ id, part, deleted = false }: { id: string; part: AvatarPart; deleted?: boolean }) {
  if (deleted) {
    return (
      <svg viewBox="0 0 64 80" className="ct-figure" aria-hidden data-avatar="deleted">
        <ellipse cx="32" cy="76" rx="16" ry="3" fill="rgba(0,0,0,0.18)" />
        <path d="M14 76 C14 58 20 48 32 48 C44 48 50 58 50 76 Z" fill="#9a958c" />
        <circle cx="32" cy="30" r="15" fill="#b9b4aa" />
      </svg>
    );
  }
  const look = lookFor(id);
  const body = part === 'judge' ? '#1d1b26' : part === 'opener' ? '#22335c' : look.shirt;
  return (
    <svg viewBox="0 0 64 80" className="ct-figure" aria-hidden data-avatar={part}>
      <ellipse cx="32" cy="76" rx="16" ry="3" fill="rgba(0,0,0,0.18)" />
      {look.hairStyle === 2 && <circle cx="32" cy="24" r="18" fill={look.hair} />}
      <path d="M14 76 C14 58 20 48 32 48 C44 48 50 58 50 76 Z" fill={body} />
      {part === 'judge' && (
        <>
          <path d="M26 48 L32 58 L38 48 Z" fill="#f7f3ea" />
          <rect x="29.5" y="56" width="2" height="7" fill="#f7f3ea" />
          <rect x="32.5" y="56" width="2" height="7" fill="#f7f3ea" />
        </>
      )}
      {part === 'opener' && (
        <>
          <path d="M27 48 L32 56 L37 48 Z" fill="#f7f3ea" />
          <path d="M31 54 L33 54 L34.5 66 L32 69 L29.5 66 Z" fill="#e8b84b" />
        </>
      )}
      <rect x="28" y="40" width="8" height="9" rx="3" fill={look.skin} />
      <circle cx="32" cy="30" r="15" fill={look.skin} />
      {look.hairStyle === 0 && <path d="M17 28 C17 13 47 13 47 28 C44 21 38 18 32 18 C26 18 20 21 17 28 Z" fill={look.hair} />}
      {look.hairStyle === 1 && <path d="M16 31 C14 11 50 11 48 31 L48 43 C46 41 45 34 45 27 C40 21 24 21 19 27 C19 34 18 41 16 43 Z" fill={look.hair} />}
      {look.hairStyle === 2 && <path d="M18 26 C20 16 44 16 46 26 C40 21 24 21 18 26 Z" fill={look.hair} />}
      {look.hairStyle === 3 && (
        <>
          <circle cx="32" cy="12" r="6" fill={look.hair} />
          <path d="M17 28 C17 14 47 14 47 28 C43 21 21 21 17 28 Z" fill={look.hair} />
        </>
      )}
      {look.hairStyle === 4 && <path d="M18 24 C22 15 40 14 46 22 C38 19 30 20 24 26 Z" fill={look.hair} />}
      <circle cx="26" cy="31" r="1.9" fill="#1b1b1b" />
      <circle cx="38" cy="31" r="1.9" fill="#1b1b1b" />
      <circle cx="22.5" cy="35.5" r="2.2" fill="#e88f8f" opacity="0.35" />
      <circle cx="41.5" cy="35.5" r="2.2" fill="#e88f8f" opacity="0.35" />
      <path d="M27.5 37 Q32 41 36.5 37" stroke="#5a2e1f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {look.glasses && (
        <g stroke="#1b1b1b" strokeWidth="1.3" fill="none">
          <circle cx="26" cy="31" r="4.4" />
          <circle cx="38" cy="31" r="4.4" />
          <path d="M30.4 31 L33.6 31" />
        </g>
      )}
    </svg>
  );
}
