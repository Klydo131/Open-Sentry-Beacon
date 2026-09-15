'use client';

// Your profile, and your settings — on the LIVE app.
//
// Both of these existed only in the tutorial. /profile and /settings were
// written against the in-browser demo store and never given a live version, so
// on a church's real deployment they fell through to AppShell's placeholder —
// the grey "This live screen is being connected" card. A signed-in member could
// not change their own name, and nobody could turn notifications on.
//
// Not a policy and not a decision anybody made. Just two screens that were
// never finished, behind a card that made it look deliberate.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_ACCOUNT } from '@/lib/live/keep-up';
import Link from 'next/link';
import { Avatar, Button, Card } from '@/components/ui';
import { InstallCard } from '@/components/InstallCard';
import { SourceCard } from '@/components/SourceCard';
import { NAVY, roleNoun, APP_SHORT_NAME } from '@/lib/brand';
import * as live from '@/lib/live/data';
import { useLiveSession, homeFor } from '@/lib/live/session';
import { useTutorialMode } from '@/lib/tutorial';
import type { Role } from '@/lib/types';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { showLocalNotification } from '@/lib/push';
import { LiveMyData } from '@/components/LiveMyData';
import { WhatsNewButton } from '@/components/WhatsNew';
import { FeedbackButton } from '@/components/Feedback';
import { humanError } from '@/lib/live/errors';
import { GENDER_OPTIONS, LIFE_STATUS_OPTIONS, optionsFor, selectedValue } from '@/lib/about-you';
import { appleKind, addChip, type AppleKind } from '@/lib/apple-install';
import { ReadingSettings } from '@/components/ReadingSettings';

const message = (cause: unknown) =>
  humanError(cause, 'Something went wrong. Please try again.');

// A distinct look per role, so a Director's profile reads differently from an
// Explorer's at a glance.
const ROLE_STYLE: Record<Role, { bg: string; icon: string; blurb: string }> = {
  executive: { bg: '#0F172A', icon: '⭐', blurb: 'Oversees every church.' },
  admin: { bg: '#1E2A4A', icon: '🛡️', blurb: 'Keeps the church running.' },
  dm: { bg: '#2F80ED', icon: '🤝', blurb: 'Walking with people, one at a time.' },
  ds: { bg: '#7FB03A', icon: '🌱', blurb: 'Exploring faith at your own pace.' },
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function LiveProfilePage() {
  const { profile, session, refreshProfile } = useLiveSession();
  const [f, setF] = useState({
    full_name: '', preferred_contact: '', birthday: '', gender: '',
    life_status: '', topics: '', city_of_residence: '', work_industry: '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  // The banner drew initials even for somebody who had uploaded a photo, with
  // that same photo showing in the picker directly beneath it. Signed at
  // render time, never stored, for the reason given on the picker below.
  const [face, setFace] = useState('');
  const photoPath = profile?.photo_path;
  useEffect(() => {
    let alive = true;
    void live.avatarUrl(photoPath).then((u) => { if (alive) setFace(u); }).catch(() => {});
    return () => { alive = false; };
  }, [photoPath]);

  // Filled once the profile arrives. Without the guard an empty form renders
  // first and then jumps, and anything typed in that moment is lost.
  useEffect(() => {
    if (!profile) return;
    setF({
      full_name: profile.full_name ?? '',
      preferred_contact: profile.preferred_contact ?? '',
      birthday: profile.birthday ?? '',
      gender: profile.gender ?? '',
      life_status: profile.life_status ?? '',
      topics: (profile.topics_of_interest ?? []).join(', '),
      city_of_residence: profile.city_of_residence ?? '',
      work_industry: profile.work_industry ?? '',
    });
  }, [profile]);

  if (!profile) return <p className="text-gray-500">Loading your profile…</p>;

  const style = ROLE_STYLE[profile.role] ?? ROLE_STYLE.ds;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setSaved(false);
  };

  // The same thing for a control that hands back a value rather than an event.
  const setValue = (k: keyof typeof f) => (value: string) => {
    setF((p) => ({ ...p, [k]: value }));
    setSaved(false);
  };

  const save = async () => {
    if (f.birthday && f.birthday > new Date().toISOString().slice(0, 10)) {
      setError('That birthday is in the future.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await live.updateMyProfile({
        full_name: f.full_name.trim() || undefined,
        preferred_contact: f.preferred_contact.trim() || undefined,
        birthday: f.birthday || undefined,
        gender: f.gender.trim() || undefined,
        life_status: f.life_status.trim() || undefined,
        city_of_residence: f.city_of_residence.trim() || undefined,
        work_industry: f.work_industry.trim() || undefined,
        topics_of_interest: f.topics.split(',').map((t) => t.trim()).filter(Boolean),
      });
      await refreshProfile();
      setSaved(true);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 text-white" style={{ backgroundColor: style.bg }}>
        <div className="flex items-center gap-4">
          {/* onDark: the fallback circle is navy, which all but vanishes
              against the navy banner an Executive Director sees. */}
          <Avatar
            name={profile.full_name || 'You'}
            size={72}
            photo={face || undefined}
            avatar={profile.avatar}
            onDark
          />
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-extrabold">
              {profile.full_name || session?.user.email || 'You'}
            </h1>
            <p className="mt-1 font-semibold text-white/90">
              <span aria-hidden>{style.icon}</span> {roleNoun(profile.role)}
            </p>
            <p className="mt-1 text-white/70">{style.blurb}</p>
          </div>
        </div>
      </div>

      {/* A FACE. The live app had no picture and no icon at all: every member
          in a real church was a pair of initials, including on the card their
          Guide opens every week. The tutorial has had both from the start. */}
      <LiveFacePicker />

      {/* ON THE PROFILE SCREEN, which is where somebody goes when they are
          thinking about their own account, rather than in Settings among the
          switches. Asking for your own information is not a setting. */}
      <LiveMyData />

      <Card className="p-5">
        <h2 className="mb-1 text-xl font-bold text-navy">Profile details</h2>
        <p className="mb-4 text-sm text-gray-500">
          Only your church&rsquo;s team can see this. Leave anything blank that you
          would rather not share.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={f.full_name} onChange={set('full_name')} />
          <Field
            label="Preferred contact" value={f.preferred_contact}
            onChange={set('preferred_contact')}
            hint="How you would rather be reached: a phone number, an app."
          />
          <Field label="Birthday" type="date" value={f.birthday} onChange={set('birthday')} />
          <SelectField
            label="Gender"
            value={selectedValue(GENDER_OPTIONS, f.gender)}
            options={optionsFor(GENDER_OPTIONS, f.gender)}
            onChange={setValue('gender')}
          />
          <SelectField
            label="Status"
            value={selectedValue(LIFE_STATUS_OPTIONS, f.life_status)}
            options={optionsFor(LIFE_STATUS_OPTIONS, f.life_status)}
            onChange={setValue('life_status')}
          />
          <Field label="City" value={f.city_of_residence} onChange={set('city_of_residence')} />
          <Field label="Work or industry" value={f.work_industry} onChange={set('work_industry')} />
          <Field
            label="Topics you care about" value={f.topics} onChange={set('topics')}
            hint="Separate them with commas."
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button variant="gold" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {saved && <p className="font-semibold text-green-600">✓ Saved</p>}
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200">{error}</p>
        )}

        {/* WHAT IS DELIBERATELY NOT ON THIS FORM: role, church, approval.
            Those are somebody else's to change, and the database enforces it —
            lock_privileged_profile_columns resets them for an unprivileged
            caller. A form that cannot even express them is one less thing
            leaning on that wall. */}
        <p className="mt-4 text-sm text-gray-400">
          Your role and your church are set by your church&rsquo;s team, not here.
        </p>
      </Card>

    </div>
  );
}

// THERE IS NO SELF-SERVICE WITHDRAWAL, AND THAT IS A DECISION RATHER THAN AN
// OMISSION.
//
// This file used to carry a "Withdraw permission" card that cleared a member's
// birthday, contact, city, work and topics. The owner's rule replaces it: a
// member may change those details whenever they like, as long as what they put
// there is true, and their Guide and Director see that they changed. Using the
// app is the undertaking to keep it truthful.
//
// The sign-up wording moved with it, in the same commit. A promise of a button
// that no longer exists is worse than never having offered one.
//
// LEAVING IS STILL POSSIBLE. remove_member_by_leader deletes the profile
// outright, so the route out is a conversation with a Director rather than a
// button -- which for a church is the more honest shape, because somebody
// notices that a person has gone.

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function LiveSettingsPage() {
  const { profile } = useLiveSession();
  const leads = profile?.role === 'admin' || profile?.role === 'executive';
  const temporaryPassword = profile?.password_is_temporary === true;

  // THREE FOLDERS. Settings was seven cards for a member and nine for a
  // Director, at nearly seven screens on a phone: installing, where the app
  // came from, alerts, the church's name, the tutorial, help and about, one
  // below the other. Almost nobody opens this room to read all of it; they
  // open it to change one thing.
  // FOUR SMALL FOLDERS RATHER THAN THREE, for the same reason the sample side
  // has five: "This device" was still holding installing, alerts and where the
  // app came from, which is most of the page it was meant to shorten.
  // Read after mount, because the user agent does not exist during the server
  // render and reading it while rendering makes the first paint disagree with
  // the second.
  const [deviceKind, setDeviceKind] = useState<AppleKind>(null);
  useEffect(() => { setDeviceKind(appleKind()); }, []);

  const rooms: Room[] = [
    // NOT "Install" ON AN APPLE DEVICE. Nothing in an iPhone, iPad or Mac menu
    // is called that, so a chip labelled Install sends somebody hunting a Share
    // sheet for a word that is not in it. `addChip` says what the device says.
    { id: 'device', label: `📱 ${addChip(deviceKind)}` },
    // FIRST FOR SOMEBODY WHO ARRIVED ON AN EMAILED PASSWORD, because the
    // invitation tells them to come here and change it, and a person following
    // an instruction should not have to hunt for the folder it named.
    { id: 'account', label: '🔑 Password' },
    { id: 'alerts', label: '🔔 Alerts' },
    // FOR EVERYBODY, WITH NO ROLE TEST. The demo settings had this folder and
    // the live one did not, so the only people who could make the text bigger
    // were the people pretending. Reading the screen is not a rank.
    { id: 'reading', label: '🔠 Language and size' },
    ...(leads ? [{ id: 'church', label: '⛪ Church' }] : []),
    { id: 'help', label: '❓ Help' },
  ];

  // THE TWO ANCHORS THAT ALREADY EXISTED. The header's Install chip points at
  // `/settings#install` and the desk points at `/settings#tutorial`. Both name
  // a card, and a card inside a folder nobody has opened is not on the page for
  // a hash to find. Apple users are sent to the install card precisely because
  // Safari cannot install for them, so this one failing would fail exactly the
  // people it exists for.
  const [room, chooseRoom] = useRoom(rooms, `beacon:settings-room:${profile?.role ?? 'none'}`, {
    install: 'device',
    tutorial: 'help',
    // The invitation e-mail and the reminder card both send people to
    // /settings#password. Without this they would land on the Install folder.
    password: 'account',
  });

  if (!profile) return <BeaconSpinner inline label="Loading your account" />;

  return (
    <div className="space-y-6">
      <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

      {room === 'device' && (
        <>
          {/* First, because it is the first thing somebody does on a new
              device, and because device alerts below are far more useful once
              the app is installed.

              The id stays even though the folder now does the arriving: a hash
              that lands in the right folder should still put the card itself in
              front of the person rather than the top of it. */}
          <div id="install">
            <InstallCard />
          </div>
          <SourceCard />
        </>
      )}

      {room === 'account' && (
        <div id="password">
          {/* A SIGNPOST, NOT THE FORM ITSELF.
              REPORTED: "The change your password should have their own page,
              users get confuse why there isn't a dedicated page for new
              password and it's the same page for home."

              That is right, and the reason is worth naming. Changing a
              password is a task somebody is SENT to -- by an e-mail, by a
              reminder, by a person on the phone telling them to do it. A task
              you are sent to needs an address. It was a card inside a folder
              inside Settings, reachable only by a hash that had to be
              translated into a folder name, so "go and change your password"
              could not be said as a place; it had to be said as directions.

              The form now lives at /password and this is the way in from
              Settings, so the old route still arrives somewhere sensible
              rather than at a page that no longer holds what it promised. */}
          <Card className="p-5">
            <h2 className="text-xl font-bold text-navy">Your password</h2>
            {temporaryPassword ? (
              <p className="mt-1 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-900 ring-1 ring-amber-200">
                You are still using the password from your invitation e-mail.
                Anybody who can read that e-mail can sign in as you.
              </p>
            ) : (
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                Change the password you use to sign in.
              </p>
            )}
            <Link
              href="/password"
              className="tap mt-4 inline-flex items-center rounded-xl px-5 text-base font-semibold text-white"
              style={{ backgroundColor: NAVY }}
            >
              Change my password
            </Link>
          </Card>
        </div>
      )}

      {room === 'alerts' && <NotificationCard />}

      {room === 'reading' && <ReadingSettings />}

      {room === 'church' && leads && <ChurchNameCard />}

      {room === 'help' && (
        <>
          <div id="tutorial">
            <TutorialCard />
          </div>
          {/* WHAT'S NEW AND FEEDBACK LIVE HERE NOW, and on the live app they
              did not live anywhere. They were taken out of the rail and only
              the tutorial made the journey, so on a real church deployment the
              two buttons simply ceased to exist. */}
          <HelpCard />
          <AboutCard />
        </>
      )}
    </div>
  );
}

/**
 * The password page, at /password.
 *
 * WHY IT IS A PAGE AND NOT A CARD. Changing a password is a task somebody is
 * SENT to: by the invitation e-mail, by the reminder in the app, by a Director
 * on the phone saying "go and change it". A task you are sent to needs an
 * ADDRESS, and this one did not have one -- it was a card, inside a folder,
 * inside Settings, reachable only through a hash that had to be translated
 * into a folder name before the card was even on the page. So the instruction
 * could never be a place; it had to be directions, and directions are what
 * people get lost in.
 *
 * IT IS DELIBERATELY THE ONLY THING HERE. No tabs, no neighbouring cards,
 * nothing else to read. Somebody arriving from an e-mail that just told them
 * their password is temporary should see one heading and one form.
 */
export function LivePasswordPage() {
  const { profile } = useLiveSession();
  const home = profile ? homeFor(profile.role) : '/';

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* BACK IS ON THE LEFT, and it goes to the person's own home rather than
          to Settings. Most people arrive here from an e-mail, never having
          been in Settings at all, so "back to settings" would send them
          somewhere they have not been. */}
      <Link href={home} className="tap inline-flex items-center text-base font-semibold text-room">
        &larr; Back to the app
      </Link>

      <div>
        {/* text-room, NOT text-navy. This heading and the link above sit on the
            page itself rather than inside a Card, and the page is painted by
            whichever room theme the person chose -- navy text on a navy ground
            is invisible, which is a bug that has already been reported once on
            the Announcements heading. `themes-are-readable` caught this one
            before it shipped; the link is the same mistake in a tag that check
            does not look at, so it is fixed here rather than left for the day
            somebody widens the rule. */}
        <h1 className="text-2xl font-extrabold text-room">Change your password</h1>
        <p className="mt-1 text-sm text-room-soft">
          This is the only place you need. Once it is changed, use the new one
          whenever you sign in.
        </p>
      </div>

      <PasswordCard />
    </div>
  );
}

/**
 * Change your password.
 *
 * WHY THERE WAS NOWHERE TO DO THIS. The only place anybody ever set a password
 * was the sign-up form at the end of a one-time invitation link. Once you were
 * in, the only route to a new one was signing out and pressing "Forgot your
 * password" -- a strange thing to ask of somebody who has forgotten nothing,
 * and the reason nobody ever did it.
 *
 * The invitation now e-mails a temporary password and tells people to change
 * it. Telling somebody to do a thing the app cannot do is worse than never
 * mentioning it, so this card is not a nicety; it is the other half of that
 * sentence.
 */
function PasswordCard() {
  const { profile, refreshProfile } = useLiveSession();
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const temporary = profile?.password_is_temporary === true;
  // Checked here so somebody is told before they press, rather than after. The
  // same rule is enforced in lib/live/data.ts, which is the one that counts.
  const tooShort = next.length > 0 && next.length < 10;
  const mismatch = again.length > 0 && next !== again;
  const ready = next.length >= 10 && next === again && !busy;

  const save = async () => {
    if (!ready) return;
    setBusy(true); setError(''); setDone(false);
    try {
      await live.changeMyPassword(next);
      setNext(''); setAgain(''); setDone(true);
      await refreshProfile();
    } catch (cause) {
      setError(humanError(cause, 'Could not change your password.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">Change your password</h2>

      {temporary ? (
        <p className="mt-1 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-900 ring-1 ring-amber-200">
          You are still using the password from your invitation e-mail. Anybody who
          can read that e-mail can sign in as you, so it is worth changing to one
          only you know.
        </p>
      ) : (
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          Choose something you will remember. You will need it the next time you
          sign in on a new device.
        </p>
      )}

      <label className="mt-4 block text-sm font-semibold text-navy" htmlFor="pw-new">
        New password
      </label>
      <input
        id="pw-new"
        type={show ? 'text' : 'password'}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold"
      />

      <label className="mt-3 block text-sm font-semibold text-navy" htmlFor="pw-again">
        Type it again
      </label>
      <input
        id="pw-again"
        type={show ? 'text' : 'password'}
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        autoComplete="new-password"
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold"
      />

      {/* SHOWING IT IS THE ACCESSIBLE OPTION, not the careless one. Typing a
          password you cannot see, twice, on a phone keyboard is where older
          members give up. */}
      <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
          className="h-4 w-4"
        />
        Show what I am typing
      </label>

      <p className="mt-2 text-xs text-gray-500">At least 10 characters.</p>
      {tooShort && (
        <p className="mt-2 text-sm font-semibold text-amber-800">
          That is {next.length} characters. Ten or more, please.
        </p>
      )}
      {mismatch && (
        <p className="mt-2 text-sm font-semibold text-amber-800">
          The two do not match yet.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      {done && (
        <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          Your password is changed. Use the new one from now on.
        </p>
      )}

      <div className="mt-4">
        <Button onClick={save} disabled={!ready}>
          {busy ? 'Saving\u2026' : 'Change my password'}
        </Button>
      </div>
    </Card>
  );
}

/**
 * The two buttons that came out of the rail: what changed, and how to say
 * something about it.
 *
 * Both open a panel over the page rather than navigating, so they are anchored
 * on this card — a link to `#whats-new` lands here and the button is the next
 * thing your eye reaches.
 */
function HelpCard() {
  return (
    <Card className="p-5">
      <div id="whats-new" />
      <div id="feedback" />
      <h2 className="mb-1 text-xl font-bold text-navy">Help and feedback</h2>
      <p className="mb-4 text-sm text-gray-500">
        What changed in the app recently, and a way to tell us when something is
        wrong or missing.
      </p>
      <div className="flex flex-wrap gap-2">
        <WhatsNewButton className="tap" />
        <FeedbackButton className="tap" />
      </div>
    </Card>
  );
}

// Turning alerts on and off, on this device.
//
// Two switches and they are genuinely different, which is why they are not one:
// the BROWSER's permission is per-device and can only be granted by the person,
// once, in response to a tap — and once denied, no button here can ask again.
// The app's own preference is per-person and can be flipped freely. Merging
// them into a single toggle produces a switch that silently does nothing.
function NotificationCard() {
  const [perm, setPerm] = useState<NotificationPermission>('default');
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
    try { setEnabled(localStorage.getItem('hb-alerts') !== 'off'); } catch { /* private mode */ }
  }, []);

  const supported = typeof window !== 'undefined' && 'Notification' in window;

  const ask = async () => {
    if (!supported) return;
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result === 'granted') {
      setNote('Alerts are on for this device.');
      // THROUGH THE SERVICE WORKER, NEVER `new Notification()`.
      //
      // REPORTED FROM A REAL ANDROID PHONE: alerts were turned on, the card
      // said "✓ On", and nothing ever appeared. Chrome on Android refuses the
      // Notification constructor outright -- it throws `Illegal constructor`
      // and only ServiceWorkerRegistration.showNotification() is permitted --
      // so the confirmation threw inside this handler and the person was left
      // with a screen claiming success and a phone that had shown them
      // nothing. On a desktop it worked, which is how it survived review.
      //
      // showLocalNotification goes through the registration and keeps the
      // constructor only as a last-resort fallback in a try/catch. The demo
      // settings screen has always called it; this one was the copy that
      // reached for the raw API.
      await showLocalNotification(APP_SHORT_NAME, 'Alerts are on for this device.', '/settings');
    } else {
      setNote('Your browser refused. You can change it in the site settings for this page.');
    }
  };

  const flip = (on: boolean) => {
    setEnabled(on);
    try { localStorage.setItem('hb-alerts', on ? 'on' : 'off'); } catch { /* private mode */ }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">🔔 Notifications</h2>
      <p className="mb-4 text-sm text-gray-500">
        A new message, a prayer request, somebody waiting to be approved.
      </p>
      {/* SAYING WHAT THIS IS, BECAUSE THE OTHER KIND IS WHAT PEOPLE EXPECT.
          Alerts are raised by the app while it is open or in the background on
          this device. Beacon has no push server, so a phone with the app fully
          closed is not woken -- see lib/push.ts. Somebody who turns this on
          expecting their phone to buzz overnight and finds it silent will
          reasonably call that broken, so the card says which kind it is
          rather than letting them find out by being missed. */}
      <p className="mb-4 rounded-xl bg-sky-50 p-3 text-sm text-gray-600">
        These reach you while {APP_SHORT_NAME} is open or running in the background.
        Your phone is not woken when the app is fully closed.
      </p>

      <label className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 p-4">
        <span>
          <span className="block font-semibold text-navy">Show me alerts in the app</span>
          <span className="block text-sm text-gray-500">The bell in the header.</span>
        </span>
        <input
          type="checkbox" role="switch" checked={enabled}
          onChange={(e) => flip(e.target.checked)}
          className="h-6 w-6 shrink-0"
        />
      </label>

      <div className="mt-3 rounded-xl bg-gray-50 p-4">
        <p className="font-semibold text-navy">Alerts on this device</p>
        {!supported ? (
          <p className="mt-1 text-sm text-gray-500">
            This browser cannot show device notifications.
          </p>
        ) : perm === 'granted' ? (
          <p className="mt-1 text-sm text-green-700">
            ✓ On. Turn them off in your browser&rsquo;s settings for this site.
          </p>
        ) : perm === 'denied' ? (
          // Being honest about a door that is closed from the other side. A
          // button here would do nothing at all: once denied, the browser will
          // not show the prompt again however many times it is asked.
          <p className="mt-1 text-sm text-gray-600">
            Blocked by your browser. Open the padlock beside the address and
            allow notifications for this site. This page cannot ask again.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-500">
              Your browser will ask once. You can change it later.
            </p>
            <Button variant="ghost" className="mt-3" onClick={ask}>Turn on device alerts</Button>
          </>
        )}
        {note && <p className="mt-2 text-sm text-gray-600">{note}</p>}
      </div>
    </Card>
  );
}

function ChurchNameCard() {
  const [church, setChurch] = useState<live.Church | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const mine = await live.myChurch();
      setChurch(mine);
      setName(mine?.name ?? '');
    } catch (cause) { setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_ACCOUNT, load);

  if (!church) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">⛪ Church name</h2>
      <p className="mb-4 text-sm text-gray-500">
        This is the name on every invitation your church sends.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          className="tap min-w-0 flex-1 rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
        />
        <Button
          variant="gold" disabled={busy || !name.trim() || name.trim() === church.name}
          onClick={async () => {
            setBusy(true); setError('');
            try { await live.renameChurch(church.id, name.trim()); await load(); setSaved(true); }
            catch (cause) { setError(message(cause)); }
            finally { setBusy(false); }
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {saved && <p className="mt-2 font-semibold text-green-600">✓ Saved</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </Card>
  );
}

function TutorialCard() {
  const { enterTutorial, hasDatabase } = useTutorialMode();
  if (!hasDatabase) return null;
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">🧪 The tutorial</h2>
      <p className="mb-4 text-sm text-gray-500">
        A complete practice church with sample people in it. Useful for training
        someone new without touching anybody&rsquo;s real details. It runs in
        this browser and cannot reach your church&rsquo;s database.
      </p>
      <Button variant="ghost" onClick={enterTutorial}>Open the tutorial</Button>
    </Card>
  );
}

function AboutCard() {
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">About</h2>
      <p className="text-sm text-gray-600">
        {APP_SHORT_NAME} is free and open source. The code that runs this church is
        readable by anyone, which is the point: nothing about how your data is
        handled is hidden from you.
      </p>
      <a
        href="https://github.com/klydo131/open-sentry-beacon"
        target="_blank" rel="noopener noreferrer"
        className="mt-3 inline-block font-semibold text-navy underline"
      >
        View the source on GitHub ↗
      </a>
      <p className="mt-4 text-xs text-gray-400">
        Signed in on this device. <Link href="/login" className="underline">Switch account</Link>
      </p>
    </Card>
  );
}

/**
 * Field, but the answer comes from a list.
 *
 * `options` arrives already widened by `optionsFor`, so an answer given before
 * this was a list is still in it. A `select` holding a value that is not among
 * its options renders as the FIRST one, and the next save would rewrite that
 * person's answer to something they never picked.
 */
function SelectField({
  label, value, options, onChange, hint,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-navy">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tap w-full min-w-0 rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
      >
        {/* Everything on this screen is optional, and a list must not make one
            question the exception by having no way to leave it alone. */}
        <option value="">Prefer not to say</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-sm text-gray-400">{hint}</span>}
    </label>
  );
}

function Field({
  label, value, onChange, type = 'text', hint,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-navy">{label}</span>
      <input
        type={type} value={value} onChange={onChange}
        className="tap w-full min-w-0 rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
      />
      {hint && <span className="mt-1 block text-sm text-gray-400">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Your picture, or an icon instead of one.
// ---------------------------------------------------------------------------
//
// BOTH, BECAUSE PEOPLE DIFFER. Somebody exploring faith quietly may not want a
// photograph of themselves in an app their church can see, and initials on a
// coloured circle is not a choice, it is the absence of one. An icon is a way
// to be recognisable without being photographed.
//
// A photo wins when both are set. Removing the photo falls back to the icon
// rather than to nothing, so choosing an icon first is never wasted.
const FACES = ['🙂', '😊', '🧑', '👩', '👨', '🧕', '👵', '👴', '🌱', '✝️', '📖', '🕊️', '🙏', '⭐'];

export function LiveFacePicker() {
  const { profile, refreshProfile } = useLiveSession();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Signed at render time, never stored: a stored signed URL expires and
  // becomes a broken picture with nothing to explain it.
  useEffect(() => {
    let alive = true;
    void live.avatarUrl(profile?.photo_path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [profile?.photo_path]);

  if (!profile) return null;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); await refreshProfile(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">Your picture</h2>
      <p className="mb-4 text-sm text-gray-500">
        Your Guide and your church&rsquo;s leadership see this. A picture is
        optional, and an icon is a fine answer.
      </p>

      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <Avatar
          name={profile.full_name || 'Member'}
          size={72}
          photo={url || undefined}
          avatar={profile.avatar}
        />
        <div className="flex flex-wrap gap-2">
          <label className={`tap-sm cursor-pointer rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-navy ${busy ? 'opacity-50' : 'hover:bg-gray-200'}`}>
            📷 Upload photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const input = event.target;
                const file = input.files?.[0];
                if (!file) return;
                // THE RESET COMES AFTER THE UPLOAD, NOT BEFORE IT.
                //
                // Clearing the input is what lets somebody pick the same file
                // twice, and doing it on the line after taking the File aborts
                // the read on WebKit: Safari and every iPhone browser tie the
                // File's readable lifetime to the input it came from. It fails
                // silently, so it looks like the upload button does nothing on
                // an iPhone and works everywhere else. tests/security-
                // invariants.mjs fails the build if this order is reversed.
                void act(async () => {
                  try {
                    const path = await live.uploadAvatar(file);
                    await live.updateMyProfile({ photo_path: path });
                  } finally {
                    input.value = '';
                  }
                });
              }}
            />
          </label>
          {profile.photo_path && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => live.updateMyProfile({ photo_path: null }))}
              className="tap-sm rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 underline"
            >
              Use my icon instead
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-500">…or choose an icon</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {FACES.map((face) => (
          <button
            key={face}
            type="button"
            disabled={busy}
            aria-label={`Use ${face} as your icon`}
            aria-pressed={profile.avatar === face}
            onClick={() => void act(() => live.updateMyProfile({ avatar: face }))}
            className={`grid h-11 w-11 place-items-center rounded-full text-xl ring-1 transition ${
              profile.avatar === face
                ? 'bg-navy/10 ring-navy'
                : 'bg-gray-50 ring-black/10 hover:bg-gray-100'
            }`}
          >
            {face}
          </button>
        ))}
      </div>
    </Card>
  );
}
