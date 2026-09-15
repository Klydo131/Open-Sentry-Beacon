'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { InstallCard } from '@/components/InstallCard';
import { SourceCard } from '@/components/SourceCard';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveSettingsPage } from '@/components/LiveAccountPages';
import { useIsLive } from '@/lib/tutorial';
import { Card, Button } from '@/components/ui';
import { useLocale } from '@/lib/i18n';
import { ReadingSettings } from '@/components/ReadingSettings';
import { useDemo } from '@/lib/demo/store';
import { useNotificationPrefs } from '@/lib/notification-prefs';
import { useUpdateState, checkForUpdate, versionLabel, hardRefresh, BUILD_TIME, BUILD_ID } from '@/lib/app-update';
import { onCanonicalHost } from '@/lib/canonical';
import { isStandalone } from '@/components/InstallPrompt';
import { attemptsFor, MAX_ATTEMPTS, ATTEMPTS_KEY } from '@/lib/auto-update';
import { QuestPicker } from '@/components/QuestPicker';
import { TRACK_LABELS } from '@/lib/quest';
import { OnlineRow } from '@/components/OnlineStatus';
import { WhatsNewButton } from '@/components/WhatsNew';
import { WhichApp } from '@/components/WhichApp';
import { FeedbackButton } from '@/components/Feedback';
import { DataManager } from '@/components/DataManager';
import { pushSupported, permission as pushPermission, requestPermission, subscribeToPush, showLocalNotification } from '@/lib/push';
import type { Role } from '@/lib/types';

// Executives included.
//
// Every one of these lists omitted 'executive', so a church director could not
// open their own settings or their own profile: the shell bounced them to the
// login screen. Same fault as /admin, three routes deep, and invisible for the
// same reason — there was no executive persona to sign in as until now.
const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];


export default function SettingsPage() {
  // Live settings are their own screen. The tutorial's version manages sample
  // data — export it, wipe it, restore it — and none of those are things a
  // church's real database should offer behind a settings tab.
  if (useIsLive()) {
    return (
      <LiveAppShell allow={ALL}>
        <LiveSettingsPage />
      </LiveAppShell>
    );
  }
  return (
    <AppShell allow={ALL}>
      <Body />
    </AppShell>
  );
}

// Admins can name / rename the church.
function ChurchNameCard() {
  const { db, setChurchName } = useDemo();
  const { t } = useLocale();
  const [name, setName] = useState(db.church_name);
  const [saved, setSaved] = useState(false);
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">⛪ {t('churchName')}</h2>
      <p className="mb-4 text-sm text-gray-500">
        Name or rename your church. Everyone in the app sees this name.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          placeholder="Your church name"
          className="tap flex-1 rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
          aria-label="Church name"
        />
        <Button
          variant="gold"
          disabled={!name.trim()}
          onClick={() => {
            setChurchName(name);
            setSaved(true);
          }}
        >
          {t('save')}
        </Button>
      </div>
      {saved && <p className="mt-2 font-semibold text-green-600">✓ Saved</p>}
    </Card>
  );
}

// Replaying a tutorial has to be something you go and ask for.
//
// Finishing it must not trap you: nothing here touches your demo data, and the
// tutorial never restarts on its own — the only ways in are the front door and
// this card. There is now a walk per participant rather than one missionary
// walk for everybody, so the card asks WHICH before it starts anything. Picking
// somebody else's walk does sign you in as that sample account, and being moved
// without being told is exactly the surprise this card exists to avoid, so it
// says so before you tap.
function TutorialCard() {
  const { currentUser } = useDemo();
  const [picking, setPicking] = useState(false);
  const mine = currentUser?.role;
  return (
    // The anchor sits on a wrapper because Card takes no id. Clearing the sticky
    // header is `scroll-padding-top` in globals.css now, once for every anchor,
    // rather than a scroll-mt remembered per wrapper — six of them had it and
    // anything new would have needed somebody to remember.
    <div id="tutorial">
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">✦ Tutorial</h2>
      <p className="mb-4 text-sm text-gray-500">
        A guided walk through your own part of Beacon. There is one for each
        person in the church, and you can run any of them as many times as you
        like. It never changes your demo data.
      </p>

      {!picking ? (
        <>
          <Button variant="gold" onClick={() => setPicking(true)}>
            ✦ Start a tutorial
          </Button>
          {mine && (
            <p className="mt-2 text-sm text-gray-400">
              You are signed in as {TRACK_LABELS[mine]}. Starting a walk for a
              different person signs you in as that sample account, and you can
              switch back any time from the top-right menu.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 font-semibold text-navy">Which walk?</p>
          <QuestPicker onPicked={() => setPicking(false)} />
          <button
            onClick={() => setPicking(false)}
            className="tap mt-2 rounded-xl px-4 text-sm font-semibold text-gray-500"
          >
            Not now
          </button>
        </>
      )}
    </Card>
    </div>
  );
}

function NotificationCard() {
  const { prefs, update } = useNotificationPrefs();
  const [perm, setPerm] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );

  const enableAlerts = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') {
      update({ push: true });
      await subscribeToPush();
      showLocalNotification('Alerts are on', 'Beacon will notify you here and on this device.');
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">🔔 Notifications</h2>
      <p className="mb-4 text-sm text-gray-500">
        Choose what notifications you receive. These settings are saved on this
        device.
      </p>
      <div className="space-y-3">
        <SettingsToggle
          label="In-app notifications"
          hint="Show the badge count and notification feed in the bell."
          checked={prefs.inApp}
          onChange={(v) => update({ inApp: v })}
        />
        {pushSupported() && (
          <>
            {perm === 'granted' ? (
              <SettingsToggle
                label="Device alerts"
                hint="Show system notifications on your phone or desktop."
                checked={prefs.push}
                onChange={(v) => update({ push: v })}
              />
            ) : perm === 'denied' ? (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-500">Device alerts</p>
                <p className="text-sm text-gray-400">
                  Blocked in your browser settings. Open your browser's site
                  settings to allow notifications for this app.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="mb-2 text-sm font-semibold text-gray-500">Device alerts</p>
                <button
                  onClick={enableAlerts}
                  className="tap rounded-xl px-5 text-base font-semibold text-white"
                  style={{ backgroundColor: '#1E2A4A' }}
                >
                  Turn on device alerts
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function SettingsToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="compact-ui flex items-start justify-between gap-3 rounded-xl bg-gray-50 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-navy">{label}</p>
        <p className="text-sm text-gray-400">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-green-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// "Am I on the latest version?" — with an answer, a timestamp, and a button.
// Without this the auto-update is invisible, and an invisible update is one
// people don't trust, which is what sends them back to reinstalling.
function VersionCard() {
  // No `apply` here on purpose. Applying the update is the app's job now, not
  // the reader's — see components/AutoUpdate.
  const { state, checkedAt } = useUpdateState();
  const [checking, setChecking] = useState(false);

  // Did the app try to install a new version and fail?
  //
  // AutoUpdate gives up after a couple of reloads that land back on the same
  // build, because the alternative is a page that never stops reloading. When
  // that happens "A new version is installing" becomes a lie, and this screen
  // is the one place somebody comes to find out what is going on. Read after
  // mount: sessionStorage does not exist during the server render.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    try {
      setStalled(attemptsFor(sessionStorage.getItem(ATTEMPTS_KEY), BUILD_ID) >= MAX_ATTEMPTS);
    } catch {
      setStalled(false);
    }
  }, [state]);

  const pending = state === 'ready' || state === 'required';
  const stuck = pending && stalled;

  const label = stuck
    ? 'A new version could not install'
    : state === 'required'
      ? 'This version is out of date'
      : state === 'ready'
        ? 'A new version is installing'
        : state === 'unsupported'
          ? 'Updates run when the app is installed'
          : "You're on the latest version";

  const tone = stuck
    ? '#B91C1C'
    : state === 'required'
      ? '#B91C1C'
      : state === 'ready'
        ? '#B45309'
        : state === 'unsupported'
          ? '#6B7280'
          : '#16A34A';

  return (
    <Card className="p-5">
      <div id="whats-new" />
      <div id="feedback" />
      <WhichApp />

      <h2 className="mb-1 mt-5 text-xl font-bold text-navy">🔄 App version</h2>
      <p className="mb-4 text-sm text-gray-500">
        Beacon updates itself. There is nothing to press, and you never need to
        uninstall and reinstall. A new version installs on its own, and waits
        until you are not in the middle of writing something.
      </p>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 p-4">
        <div>
          <p className="text-sm font-semibold text-navy">Connection</p>
          <p className="text-sm text-gray-400">
            Beacon keeps working offline. Your saved files and this device&rsquo;s
            data are always available.
          </p>
        </div>
        <OnlineRow />
      </div>

      <div className="rounded-xl bg-gray-50 p-4">
        <p className="font-bold" style={{ color: tone }}>
          {stuck
            ? '⚠️'
            : state === 'required'
              ? '⚠️'
              : state === 'ready'
                ? '✨'
                : state === 'unsupported'
                  ? 'ℹ️'
                  : '✓'}{' '}
          {label}
        </p>
        {stuck && (
          <p className="mt-1 text-sm text-gray-500">
            Beacon tried twice and came back on the same version, so it has
            stopped trying rather than keep restarting the screen on you. Press
            <strong> Force a fresh copy</strong> below. Nothing you have saved is
            touched.
          </p>
        )}
        <p className="mt-1 text-sm text-gray-500">
          Version <span className="font-mono">{versionLabel()}</span>
        </p>
        {/* ONE LINE SOMEBODY CAN READ DOWN A PHONE.
            "A person has an old version and we cannot work out why" cost a lot
            of guessing, and the answer was knowable all along — it is which
            ADDRESS their copy is running from. A copy installed from a
            temporary deployment address can never update, and from the inside
            it looks identical to one that can. This says which. */}
        <InstallSource /> 
        {checkedAt && (
          <p className="text-sm text-gray-400">
            Last checked {new Date(checkedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {/* No "Restart" button. The app applies the update by itself as soon
              as doing so cannot interrupt anybody — see components/AutoUpdate.
              Offering a button here would put the decision back on the person,
              which is the thing that was removed. "Check for updates" stays,
              because "did it work?" is a fair question and this screen is where
              somebody comes to ask it. */}
          <button
            onClick={async () => {
              setChecking(true);
              await checkForUpdate();
              setChecking(false);
            }}
            disabled={checking || state === 'unsupported'}
            className="tap rounded-xl bg-white px-5 text-base font-semibold text-navy ring-1 ring-navy/20 disabled:opacity-40"
          >
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
          <WhatsNewButton className="tap" />
          <FeedbackButton className="tap" />
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Throw away this copy of the app and download it fresh?\n\nYour data stays. Saved files, sample data and settings are all kept.',
                )
              ) {
                void hardRefresh();
              }
            }}
            className="tap rounded-xl bg-white px-5 text-base font-semibold text-navy ring-1 ring-navy/20"
          >
            Force a fresh copy
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-400">
          If this screen keeps showing an old date after a new release, the app is
          stuck on a cached copy. &ldquo;Force a fresh copy&rdquo; clears it. Your
          saved files and data are not touched.
        </p>
      </div>
    </Card>
  );
}

/**
 * Where this copy came from, in words that can be read aloud.
 *
 * Deliberately plain rather than clever: when somebody rings to say the app
 * looks wrong, "Settings, read me the two grey lines" has to work for a person
 * in their sixties on a phone, with no screenshot and no patience.
 */
function InstallSource() {
  const [host, setHost] = useState('');
  const [canUpdate, setCanUpdate] = useState(true);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setHost(window.location.host);
    setCanUpdate(onCanonicalHost());
    setInstalled(isStandalone());
  }, []);

  if (!host) return null;

  return (
    <p className={`text-sm ${canUpdate ? 'text-gray-400' : 'font-semibold text-amber-700'}`}>
      {installed ? 'Installed from' : 'Running from'}{' '}
      <span className="font-mono">{host}</span>
      {canUpdate
        ? ' · updates reach this copy'
        : ' · THIS ADDRESS CANNOT UPDATE. Install from the church’s main address instead'}
    </p>
  );
}

function Body() {
  const { t, lang, setLang, scale, setScale } = useLocale();
  const { currentUser } = useDemo();
  // Renaming the church was shared with the Church Board. With the board gone
  // as an account, this is an admin power rather than something that quietly
  // disappeared with the role.
  const canRename = currentUser?.role === 'admin';
  const canManageData = currentUser?.role === 'admin';

  // FIVE SMALL FOLDERS RATHER THAN THREE BIG ONES. Three still left "This
  // device" holding installing, alerts, where the app came from, the version,
  // the language and the text size, which was five screens of the six the page
  // had. A folder that is still a scroll has not solved anything.
  const rooms: Room[] = [
    { id: 'device', label: '📱 Install' },
    { id: 'alerts', label: '🔔 Alerts' },
    { id: 'reading', label: '🔠 Language and size' },
    ...(canRename || canManageData ? [{ id: 'church', label: '⛪ Church' }] : []),
    { id: 'help', label: '❓ Help' },
  ];
  // The Install chip and the desk both point at a card by name. Translated, or
  // they arrive at a folder that is not drawing what they were sent for.
  const [room, chooseRoom] = useRoom(rooms, 'beacon:demo-settings-room', {
    install: 'device',
    tutorial: 'help',
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-navy">⚙️ {t('settings')}</h1>

      {/* The same card the live app shows. Installing is a browser thing, not a
          database thing, so it belongs in both modes — and somebody trying the
          tutorial on a tablet is exactly the person who wants it on their home
          screen. */}
      {/* Anchored so the header's Install chip can land ON it. Apple users are
          the ones who need this: Safari never fires beforeinstallprompt, so the
          chip cannot install for them and sends them here instead. Without an
          id that meant arriving at the top of a long page with the card they
          were sent for somewhere below the fold. */}
      <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

      {/* THE SAME FOLDERS THE LIVE SETTINGS HAS. Nine cards for a Director on
          one page is nearly seven screens of scrolling to change one thing. */}
      {room === 'device' && (
        <>
          {/* Anchored so the header's Install chip can land ON it. Apple users
              are the ones who need this: Safari never fires
              beforeinstallprompt, so the chip cannot install for them and
              sends them here instead. Without an id that meant arriving at the
              top of a long page with the card they were sent for below the
              fold; without the folder translation above it would now mean
              arriving at a folder that is not drawing the card at all. */}
          <div id="install">
            <InstallCard />
          </div>
          <SourceCard />
          <VersionCard />
        </>
      )}

      {room === 'alerts' && <NotificationCard />}

      {room === 'church' && (
        <>
          {canRename && <ChurchNameCard />}
          {canManageData && <DataManager />}
        </>
      )}

      {room === 'help' && (
        <div id="tutorial">
          <TutorialCard />
        </div>
      )}

      {/* Language and text size are how the app READS, so they belong with the
          device rather than with the church or the help. */}
      {/* Language and text size are how the app READS, so they belong with the
          device rather than with the church or the help.

          ONE COMPONENT, NOT A COPY EACH. These two cards used to be written out
          here in full, and the live settings page simply did not have them --
          so the app could make its text bigger for somebody practising in the
          tutorial and not for anybody actually using it. Two renderings of one
          product drifted because nothing compared them. Now both pages draw
          this, and tests/the-live-app-offers-what-the-tutorial-offers.mjs fails
          the build if either grows a folder the other lacks. */}
      {room === 'reading' && <ReadingSettings />}
    </div>
  );
}
