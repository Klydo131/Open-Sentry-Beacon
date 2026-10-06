'use client';

// What a Director sees when they open somebody.
//
// THE TWO QUESTIONS THIS ANSWERS, both asked by the person running a church:
// "is this a real person I meant to let in?", and "does this pairing make any
// sense?" Neither could be answered from the roster, which showed a name, a
// role and a stage — everything the app knows about somebody was collected on
// sign-up and then only ever shown back to them.
//
// IT IS A READ, NOT A FILE. No notes, no assessment, nothing a Director writes
// here. The moment a screen like this becomes somewhere to record an opinion
// about a member, it is a personnel file that the member cannot see and did not
// agree to. The one place a judgement is written down is the safeguarding
// record, where it is deliberately permanent and deliberately reviewable.
//
// AND IT SHOWS ONLY WHAT THEY CHOSE TO GIVE. Every field below is optional on
// the sign-up form; a blank is a person who declined, and it is drawn as
// "not given" rather than left as an empty row, because a Director should be
// able to tell "did not answer" from "the screen is broken".

import { useFaces, faceOf } from '@/components/live/Face';
import { useEffect, useState } from 'react';
import { Avatar, Button, Card } from '@/components/ui';
import { roleNoun } from '@/lib/brand';
import { isMinor } from '@/lib/minor';
import * as live from '@/lib/live/data';
import { humanError } from '@/lib/live/errors';
import type { Profile } from '@/lib/types';
import { MemberReading } from '@/components/live/ReadingProgress';

/** Whole years, or null when there is no birthday to count from. */
function age(birthday?: string): number | null {
  if (!birthday) return null;
  const born = new Date(birthday);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years < 130 ? years : null;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {value ? (
        <p className="break-words font-semibold text-navy">{value}</p>
      ) : (
        // Said, not blank. "Not given" is a fact about the person; an empty row
        // is a fact about the screen, and a Director cannot tell them apart.
        <p className="text-gray-500">Not given</p>
      )}
    </div>
  );
}

export function MemberProfile({
  person,
  email,
  joinedAt,
  pairedWith,
  members = [],
  canManage = false,
  onChanged,
  onClose,
}: {
  person: Profile;
  email?: string;
  joinedAt?: string;
  /** The other half of this pairing, when there is one. */
  pairedWith?: Profile | null;
  /** Everybody in the church, so a guardian who is also a member can be linked. */
  members?: Profile[];
  /**
   * Is the viewer leadership of this person's church?
   *
   * A GUIDE OPENS THE SAME PANEL AND SEES LESS, and the difference is not
   * decoration. The address somebody was invited at and the day they arrived
   * come from church_member_contact, which the database serves to Directors
   * only — a Guide asking for it gets nothing, and rendering the rows anyway
   * would print "Not given" over a fact the app knows perfectly well and is
   * deliberately not telling them. Recording a guardian's permission is
   * refused by the database for the same reason.
   *
   * A Guide still SEES whether a minor has permission, because they are the
   * person actually sitting with them and that is exactly who needs to know.
   */
  canManage?: boolean;
  /** Called after a consent is recorded or withdrawn, so the roster reloads. */
  onChanged?: () => void;
  onClose: () => void;
}) {
  const years = age(person.birthday);
  const theirYears = pairedWith ? age(pairedWith.birthday) : null;
  // THEIR FACE, LARGE. The panel drew initials for somebody who had chosen a
  // photo, which is most of what "seeing somebody's profile" means to the
  // person opening it. Asked for on 30 September 2026.
  const faces = useFaces([person.photo_path]);
  const face = faceOf(faces, person.photo_path);

  // Escape closes it. A panel that can only be dismissed by finding a small
  // button is one people leave open and then read the wrong person from.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // WHAT THE TWO HAVE IN COMMON, worked out here rather than left for somebody
  // to spot by reading two lists side by side. This is the whole point of
  // opening a pairing: a Guide and an Explorer who share a town, a language or
  // an interest have somewhere to start, and one who share nothing may still be
  // a fine pairing but the Director should be deciding that knowingly.
  const shared: string[] = [];
  if (pairedWith) {
    const mine = new Set((person.topics_of_interest ?? []).map((t) => t.toLowerCase()));
    for (const topic of pairedWith.topics_of_interest ?? []) {
      if (mine.has(topic.toLowerCase())) shared.push(topic);
    }
  }
  const sameCity = !!pairedWith?.city_of_residence && !!person.city_of_residence
    && pairedWith.city_of_residence.trim().toLowerCase() === person.city_of_residence.trim().toLowerCase();
  const sameLanguage = !!pairedWith?.preferred_language && !!person.preferred_language
    && pairedWith.preferred_language.trim().toLowerCase() === person.preferred_language.trim().toLowerCase();

  return (
    // Folds down under what opened it: globals.css .fold-in.
    <Card className="fold-in p-5 ring-2 ring-navy/15">
      <div className="flex items-start gap-3">
        <Avatar name={person.full_name} size={72} photo={face} avatar={person.avatar ?? undefined} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-extrabold text-navy">{person.full_name || 'No name given'}</h3>
          <p className="text-sm text-gray-500">
            {roleNoun(person.role)}
            {!person.is_approved && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                Waiting to be approved
              </span>
            )}
            {person.suspended_at && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                Suspended
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>

      {/* IS THIS A REAL PERSON I MEANT TO LET IN? The address they were invited
          at and the day they arrived answer that better than anything else on
          the screen, so they come first. */}
      <div className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
        {canManage && <Row label="Email" value={email} />}
        {canManage && (
          <Row label="Joined" value={joinedAt ? new Date(joinedAt).toLocaleDateString() : undefined} />
        )}
        <Row label="Best way to reach them" value={person.preferred_contact} />
        <Row label="Language" value={person.preferred_language} />
      </div>

      <div className="mt-3 grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
        <Row label="Age" value={years === null ? undefined : `${years}`} />
        <Row label="Gender" value={person.gender} />
        <Row label="Status" value={person.life_status ?? person.status} />
        <Row label="Town or city" value={person.city_of_residence} />
        <Row label="Work" value={person.work_industry} />
      </div>

      {/* HOW FAR THROUGH THE STUDIES THEY ARE.
          THE ASK: a bar Directors and Executive Directors can look at to see
          whether an Explorer is really reading -- the seeded samples and
          whatever their Guide wrote alike.

          IT IS A READ, LIKE EVERYTHING ELSE ON THIS CARD. The header rule for
          this file is that a Director looks and does not annotate, and reading
          progress belongs here precisely because it is the Explorer's own fact
          rather than a leader's opinion of them. There is deliberately no
          control to tick a lesson off from this side; `lr_write` would refuse
          it anyway, and a button that always failed would be worse than none.

          ONLY FOR EXPLORERS. A Director's own reading is not what this card is
          for, and a bar on every colleague's profile turns a pastoral number
          into a scoreboard. */}
      {person.role === 'ds' && (
        <div className="mt-3">
          <MemberReading memberId={person.id} />
        </div>
      )}

      {(person.topics_of_interest ?? []).length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Interested in</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {person.topics_of_interest.map((topic) => (
              <span key={topic} className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* THE CONSENT, WHERE THE WARNING IS.
          Every piece of this existed except the part that answers it: the
          columns, the database functions, the Directors' roster of minors and
          the red "MINOR · consent missing" badge were all built, and no screen
          ever called record_guardian_consent. So every Explorer under eighteen
          sat permanently at "consent missing" with no way to clear it — which
          is worse than no warning at all, because a flag nobody can answer is
          one everybody learns to scroll past.

          IT RECORDS THAT PERMISSION WAS SEEN. It is not the permission itself:
          the letter or the conversation with the parent happens outside this
          app and the church keeps it. This is the church's dated note that it
          happened and who gave it, which is the part that has to survive people
          leaving. */}
      {isMinor(person.birthday) && (
        <GuardianConsent
          person={person}
          members={members}
          canManage={canManage}
          onChanged={onChanged}
        />
      )}

      {pairedWith && (
        <div className="mt-4 rounded-xl bg-sky-50 p-4 ring-1 ring-sky-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
            Walking with {pairedWith.full_name}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sameCity && (
              <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-navy ring-1 ring-black/10">
                Same town
              </span>
            )}
            {sameLanguage && (
              <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-navy ring-1 ring-black/10">
                Same language
              </span>
            )}
            {shared.map((topic) => (
              <span key={topic} className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-navy ring-1 ring-black/10">
                Both: {topic}
              </span>
            ))}
            {!sameCity && !sameLanguage && shared.length === 0 && (
              // NOT A WARNING. Two people with nothing written down in common
              // are very often the right pairing, and a red flag here would
              // push Directors to break up pairings that are working. It says
              // what it knows and stops.
              <span className="text-sm text-gray-600">
                Nothing obvious in common from what they have filled in. That is
                not a problem on its own.
              </span>
            )}
          </div>
          {theirYears !== null && years !== null && (
            <p className="mt-2 text-sm text-gray-600">
              {pairedWith.full_name.split(' ')[0]} is {theirYears}, {person.full_name.split(' ')[0] || 'they'} is {years}.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Recording a parent or guardian's permission for somebody under eighteen.
 *
 * WHY THE NAME IS TYPED AND THE LINK IS OPTIONAL. Most guardians are not
 * members of the church's app, so a typed name is the honest record in the
 * ordinary case. When the guardian IS a member, linking them means a Director
 * can open them; migration 0034 explains why that link is worth having as well
 * as the name rather than instead of it.
 */
function GuardianConsent({
  person,
  members,
  canManage,
  onChanged,
}: {
  person: Profile;
  members: Profile[];
  canManage: boolean;
  onChanged?: () => void;
}) {
  const [name, setName] = useState(person.guardian_name ?? '');
  const [memberId, setMemberId] = useState(person.guardian_member_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const given = !!person.guardian_consent_at;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged?.();
    } catch (cause) {
      setError(humanError(cause, 'That did not save.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`mt-4 rounded-xl p-4 ring-1 ${
        given ? 'bg-green-50 ring-green-200' : 'bg-amber-50 ring-amber-300'
      }`}
    >
      <p className="text-sm font-bold text-navy">
        {given ? '✓ A parent or guardian has given permission' : '⚠ Under 18, and no permission recorded'}
      </p>

      {!canManage ? (
        // A Guide is told, and told what to do about it, because they are the
        // one sitting with this person. Recording it is a Director's job and
        // the database refuses them anyway, so offering the form would be a
        // button that always fails.
        <p className="mt-1 text-sm text-gray-700">
          {given
            ? `Recorded${person.guardian_name ? `, by ${person.guardian_name}` : ''}.`
            : 'Ask a Director to record a parent or guardian’s permission before you go further.'}
        </p>
      ) : given ? (
        <>
          <p className="mt-1 text-sm text-gray-700">
            Recorded {new Date(person.guardian_consent_at as string).toLocaleDateString()}
            {person.guardian_name ? `, by ${person.guardian_name}` : ''}.
          </p>
          {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
          {/* A parent can change their mind, so taking it back has to be as
              possible as giving it. The NAME stays on the record: a blank where
              a guardian used to be reads as "never had one", and a church needs
              to tell a withdrawn consent from one nobody ever collected. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => live.withdrawGuardianConsent(person.id))}
            className="mt-2 text-xs font-semibold text-red-700 underline"
          >
            {busy ? 'Saving…' : 'Withdraw this permission'}
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-700">
            Speak to their parent or guardian first. Record it here once you have
            their permission, so the church has a dated note of who gave it.
          </p>

          <label className="mt-3 block">
            <span className="text-sm font-semibold text-navy">Parent or guardian’s name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their full name"
              className="tap mt-1 w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-gold"
            />
          </label>

          <label className="mt-2 block">
            <span className="text-sm font-semibold text-navy">
              Are they in this church? <span className="font-normal text-gray-500">(optional)</span>
            </span>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="tap mt-1 w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="">Not a member here</option>
              {members
                .filter((m) => m.id !== person.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name || 'A member'}</option>
                ))}
            </select>
          </label>

          {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}

          <Button
            className="mt-3"
            disabled={busy || !name.trim()}
            onClick={() => void act(() =>
              live.recordGuardianConsent(person.id, name.trim(), memberId || undefined))}
          >
            {busy ? 'Saving…' : 'Record their permission'}
          </Button>
        </>
      )}
    </div>
  );
}
