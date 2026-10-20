'use client';

// The live profile, settings and password pages.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_ACCOUNT } from '@/lib/live/keep-up';
import Link from 'next/link';
import { Avatar, Button, Card } from '@/components/ui';
import { InstallCard } from '@/components/InstallCard';
import { SourceCard } from '@/components/SourceCard';
import { NoSignalCard } from '@/components/KeptForNoSignal';
import { NAVY, roleNoun, APP_SHORT_NAME } from '@/lib/brand';
import * as live from '@/lib/live/data';
import { useLiveSession, homeFor } from '@/lib/live/session';
import { useTutorialMode } from '@/lib/tutorial';
import type { Role } from '@/lib/types';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { showLocalNotification } from '@/lib/push';
import { BeaconSoundSetting } from '@/components/BeaconSoundSetting';
import { LiveMyData } from '@/components/LiveMyData';
import { FaqCard } from '@/components/Faq';
import { WhatsNewButton } from '@/components/WhatsNew';
import { FeedbackButton } from '@/components/Feedback';
import { humanError } from '@/lib/live/errors';
import { GENDER_OPTIONS, LIFE_STATUS_OPTIONS, optionsFor, selectedValue } from '@/lib/about-you';
import { appleKind, addChip, type AppleKind } from '@/lib/apple-install';
import { ReadingSettings } from '@/components/ReadingSettings';
import { CourtOrCases } from '@/components/court/CourtOrCases';
import { LiveAdminReports } from '@/components/LiveAdminReports';
import { TwoStepCard } from '@/components/live/TwoStep';

const message = (cause: unknown) =>
  humanError(cause, 'Something went wrong. Please try again.');

// A look per role. The green and blue are dark enough for white text (5.5:1 and 5.7:1).
const ROLE_STYLE: Record<Role, { bg: string; icon: string; blurb: string }> = {
  executive: { bg: '#0F172A', icon: '⭐', blurb: 'Oversees every church.' },
  admin: { bg: '#1E2A4A', icon: '🛡️', blurb: 'Keeps the church running.' },
  dm: { bg: '#1F5FD6', icon: '🤝', blurb: 'Walking with people, one at a time.' },
  ds: { bg: '#47741A', icon: '🌱', blurb: 'Exploring faith at your own pace.' },
};

// --- Profile ---

export function LiveProfilePage() {
  const { profile, session, refreshProfile } = useLiveSession();
  const [f, setF] = useState({
    full_name: '', preferred_contact: '', birthday: '', gender: '',
    life_status: '', topics: '', city_of_residence: '', work_industry: '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  // The banner shows the photo too; signed when drawn, never stored.
  const [face, setFace] = useState('');
  const photoPath = profile?.photo_path;
  useEffect(() => {
    let alive = true;
    void live.avatarUrl(photoPath).then((u) => { if (alive) setFace(u); }).catch(() => {});
    return () => { alive = false; };
  }, [photoPath]);

  // Filled once the profile arrives, so the form does not jump while typed in.
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
          {/* onDark: the navy fallback would vanish on an Executive Director's navy banner. */}
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
            <p className="mt-1 text-white/85">{style.blurb}</p>
          </div>
        </div>
      </div>

      <LiveFacePicker />

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

        {/* Role, church and approval are not on this form; the database refuses them anyway. */}
        <p className="mt-4 text-sm text-gray-500">
          Your role and your church are set by your church&rsquo;s team, not here.
        </p>
      </Card>

    </div>
  );
}

// There is no self-service withdrawal: members keep their details true and
// their Guide and Director see changes. Leaving goes through a Director.

// --- Settings ---

export function LiveSettingsPage() {
  const { profile } = useLiveSession();
  const leads = profile?.role === 'admin' || profile?.role === 'executive';
  const temporaryPassword = profile?.password_is_temporary === true;

  // Read after mount: the user agent does not exist during server rendering.
  const [deviceKind, setDeviceKind] = useState<AppleKind>(null);
  useEffect(() => { setDeviceKind(appleKind()); }, []);

  const rooms: Room[] = [
    // One General folder for device settings (install, alerts, language, text
    // size). Password, Admin Reports and Help keep their own folders.
    { id: 'general', label: `⚙️ General` },
    // First for someone arriving with an emailed password.
    { id: 'account', label: '🔑 Password' },
    { id: 'reports', label: '⚖️ Admin Reports' },
    ...(leads ? [{ id: 'church', label: '⛪ Church' }] : []),
    { id: 'help', label: '❓ Help' },
  ];

  // Hashes that name a card (#install, #tutorial, #password, #reports) open its folder first.
  const [room, chooseRoom] = useRoom(rooms, `beacon:settings-room:${profile?.role ?? 'none'}`, {
    install: 'general',
    tutorial: 'help',
    faq: 'help',
    password: 'account',
    reports: 'reports',
  });

  if (!profile) return <BeaconSpinner inline label="Loading your account" />;

  return (
    <div className="space-y-6">
      <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

      {room === 'general' && (
        <>
          {/* First: installing comes before device alerts are useful. The id lets a hash land on the card. */}
          <div id="install">
            <InstallCard />
          </div>
          <NoSignalCard />
          <SourceCard />
        </>
      )}

      {room === 'account' && (
        <div id="password">
          {/* A way to /password, which has its own page so an email can send people straight there. */}
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
          <div className="mt-4">
            <TwoStepCard />
          </div>
        </div>
      )}

      {room === 'general' && <NotificationCard />}

      {room === 'general' && <ReadingSettings />}

      {room === 'reports' && (
        <>
          <Card className="p-5">
            <h2 className="mb-1 text-xl font-bold text-navy">⚖️ Admin Reports</h2>
            <p className="text-sm text-gray-500">
              Anything you have been called to answer. Say what happened in your
              own words. Only the people in a case can read it.
            </p>
          </Card>
          {/* Reports first, then the trial room. */}
          <LiveAdminReports me={profile.id} />

          <CourtOrCases
            me={profile}
            emptyState={
              <Card className="p-6 text-center">
                <p className="text-lg font-bold text-navy">Nothing open</p>
                <p className="mt-1 text-sm text-gray-500">
                  You have not been called to anything. If you are, it appears
                  here and you will be told.
                </p>
              </Card>
            }
          />
        </>
      )}

      {room === 'church' && leads && <ChurchNameCard />}

      {room === 'help' && (
        <>
          <div id="tutorial">
            <TutorialCard />
          </div>
          {/* What's New and Feedback. */}
          <HelpCard />
          <FaqCard />
          <AboutCard />
        </>
      )}
    </div>
  );
}

/**
 * The password page, at /password: an address an email or a reminder can send
 * people to, with nothing else on it.
 */
export function LivePasswordPage() {
  const { profile } = useLiveSession();
  const home = profile ? homeFor(profile.role) : '/';

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Back goes to the person's home: most arrive from an email, not Settings. */}
      <Link href={home} className="tap inline-flex items-center text-base font-semibold text-room">
        &larr; Back to the app
      </Link>

      <div>
        {/* text-room, not text-navy: this sits on the room's own background, which can be navy. */}
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

/** Change your password. */
function PasswordCard() {
  const { profile, refreshProfile } = useLiveSession();
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const temporary = profile?.password_is_temporary === true;
  // When the invitation's password stops working; null if they chose their own.
  const [ends, setEnds] = useState<string | null>(null);
  useEffect(() => {
    if (!temporary) { setEnds(null); return; }
    let current = true;
    live.myTemporaryPasswordEnds().then((at) => { if (current) setEnds(at); }).catch(() => undefined);
    return () => { current = false; };
  }, [temporary]);
  // "Sign out everywhere else", on request.
  const [elsewhere, setElsewhere] = useState<'' | 'busy' | 'done' | 'failed'>('');
  // A friendly early warning; lib/live/data.ts enforces the rule.
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
          {ends && (
            <>
              {' '}It stops working on{' '}
              <span className="whitespace-nowrap">
                {new Date(ends).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              ; after that, sign in with &ldquo;Forgot your password&rdquo;.
            </>
          )}
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

      {/* Showing the password helps people typing on a phone. */}
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
          Your password is changed, and every other phone or computer signed in as
          you has been signed out. Use the new password from now on.
        </p>
      )}

      <div className="mt-4">
        <Button onClick={save} disabled={!ready}>
          {busy ? 'Saving\u2026' : 'Change my password'}
        </Button>
      </div>

      {/* Sign out every other device: one button, no password needed. */}
      <div className="mt-5 border-t border-black/5 pt-4">
        <p className="text-sm font-semibold text-navy">Signed in somewhere you do not recognise?</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          This signs you out on every other phone and computer. You stay signed in here.
        </p>
        <button
          type="button"
          disabled={elsewhere === 'busy'}
          onClick={async () => {
            setElsewhere('busy');
            try { await live.signOutOtherDevices(); setElsewhere('done'); }
            catch { setElsewhere('failed'); }
          }}
          className="tap-sm mt-2 rounded-full bg-white px-4 text-sm font-bold text-navy ring-1 ring-navy/20 disabled:opacity-50"
        >
          {elsewhere === 'busy' ? 'Signing out\u2026' : 'Sign out everywhere else'}
        </button>
        {elsewhere === 'done' && (
          <p className="mt-2 text-sm font-semibold text-green-800">Done. Every other device is signed out.</p>
        )}
        {elsewhere === 'failed' && (
          <p className="mt-2 text-sm font-semibold text-red-700">That did not work. Check the connection and try again.</p>
        )}
      </div>
    </Card>
  );
}

/** What's New and Feedback, opening panels over the page. */
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

// Two separate switches: the browser's permission (per device, asked once,
// and never again once denied) and the app's own preference (per person).
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
      // Through the service worker: Chrome on Android refuses `new Notification()`.
      await showLocalNotification(APP_SHORT_NAME, 'Alerts are on for this device.', '/settings',
        { tag: 'beacon-test', renotify: true });
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
      {/* Alerts come from the app while it is open or in the background; with the
         app fully closed the phone is not woken (lib/push.ts). */}
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
          // Once denied, the browser will not ask again, so no button is offered.
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

      <div className="mt-3">
        <BeaconSoundSetting />
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
      <p className="mt-4 text-xs text-gray-500">
        Signed in on this device. <Link href="/login" className="underline">Switch account</Link>
      </p>
    </Card>
  );
}

/**
 * A select whose options include any earlier free-text answer (optionsFor),
 * because a select showing a value it lacks would save the first option instead.
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
        {/* Every question is optional, lists included. */}
        <option value="">Prefer not to say</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-sm text-gray-500">{hint}</span>}
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
      {hint && <span className="mt-1 block text-sm text-gray-500">{hint}</span>}
    </label>
  );
}

// --- Your picture, or an icon ---
// A photo wins when both are set; removing it falls back to the icon.
const FACES = ['🙂', '😊', '🧑', '👩', '👨', '🧕', '👵', '👴', '🌱', '✝️', '📖', '🕊️', '🙏', '⭐'];

export function LiveFacePicker() {
  const { profile, refreshProfile } = useLiveSession();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Signed when drawn, never stored (signed URLs expire).
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
                // Reset the input only after the upload: on WebKit the File becomes unreadable
                // once its input is cleared (tests/security-invariants.mjs).
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
