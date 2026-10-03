import type { Metadata, Viewport } from 'next';
import './globals.css';
// The looks other than Classic, each scoped to itself (lib/ui-themes.ts).
import './themes/desktop.css';
import { DemoProvider } from '@/lib/demo/store';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SelfHeal } from '@/components/SelfHeal';
import { StrayFileDrops } from '@/components/StrayFileDrops';
import { InstallPrompt } from '@/components/InstallPrompt';

import { AutoUpdate } from '@/components/AutoUpdate';
import { VersionWatch } from '@/components/VersionWatch';
import { FrozenCopy } from '@/components/FrozenCopy';
import { OnlineStatus } from '@/components/OnlineStatus';
import { LocaleProvider } from '@/lib/i18n';
import { BUILD_ID } from '@/lib/build-info';
import { APP_NAME, APP_SHORT_NAME, APP_DESCRIPTION } from '@/lib/brand';
import { INDEXABLE } from '@/lib/site-visibility';
import { LiveSessionProvider } from '@/lib/live/session';
import { TutorialModeProvider } from '@/lib/tutorial';
import { TutorialExtras } from '@/components/TutorialExtras';
import { PlayerProvider } from '@/lib/player';
import { UiTheme } from '@/components/UiTheme';

export const metadata: Metadata = {
  // The name comes from lib/brand.ts so a fork changes it in one place. It also
  // has to be distinct from any other Beacon you can install: an installed app
  // shows no address bar, so an ambiguous title is what leaves two identical
  // icons in a dock with no way to tell which is which.
  title: APP_NAME,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: APP_SHORT_NAME },
  // THE ONE TAG THAT DECIDES WHETHER AN IPHONE INSTALL IS AN APP OR A BOOKMARK.
  //
  // `appleWebApp.capable: true` above no longer emits what its name says. Next
  // emits the STANDARDISED `mobile-web-app-capable` instead, and Safari has
  // never read that name -- it reads `apple-mobile-web-app-capable` and nothing
  // else. Verified against the built HTML rather than the docs: the head
  // carried `mobile-web-app-capable` and not one Apple-prefixed capable tag.
  //
  // WHAT THAT COSTS, and why it reads as "install is broken" rather than as a
  // missing tag. Without it, Add to Home Screen on an iPhone produces a
  // BOOKMARK: tapping the icon opens Safari, address bar and all. Nothing
  // errors. The person did everything right, got an icon, tapped it, and landed
  // in a browser -- so they report that the install does not work, and they are
  // describing it accurately.
  //
  // Safari 17.4+ reads `display: standalone` from the manifest and behaves
  // without this. Every iPhone below that -- which on a congregation's phones is
  // a great many of them -- needs the tag. Emitting both costs nothing.
  // NOINDEX BY DEFAULT, AND THIS IS DELIBERATE.
  //
  // A church deployment holds real people's names and conversations, and a
  // shared deep link that gets indexed is the cheapest possible data leak. So
  // the default is to stay out of every search engine, and a deployment that
  // genuinely wants to be found has to say so on purpose — BEACON_PUBLIC_SITE=1,
  // which is the showcase's case and almost never a church's.
  //
  // This emits <meta name="robots" content="…"> on every page, the most reliable
  // signal and the one independent of hosting. It is reinforced by app/robots.ts
  // and by the X-Robots-Tag header in next.config.mjs. All three used to be
  // changed by hand and told you so in a comment; they now read the same switch
  // from lib/site-visibility.ts, because "remember to change three files" is a
  // rule that gets followed twice out of three times.
  robots: {
    index: INDEXABLE,
    follow: INDEXABLE,
    nocache: !INDEXABLE,
    googleBot: { index: INDEXABLE, follow: INDEXABLE, noimageindex: !INDEXABLE },
  },
  // The build this page was rendered from, readable without opening Settings.
  // When someone reports "it did not update", the first question is which build
  // they are actually running, and asking a person to read a version string off
  // a settings screen is a slow way to find out.
  other: {
    'beacon-build': BUILD_ID,
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#1E2A4A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-ui-theme: the look, Classic unless this device chose another.
    // Classic is the app as it is, matched by no rule (lib/ui-themes.ts).
    <html lang="en" data-ui-theme="classic">
      <body>
        {/* First thing in the document: it has to be listening before any
            bundle is requested, because a bundle failing to load is the signal
            it exists to catch. */}
        <SelfHeal />
        {/* A file let go where nothing takes files is ignored, rather than
            opened by the browser in place of the app. */}
        <StrayFileDrops />
        <LocaleProvider>
          <TutorialModeProvider>
            <DemoProvider>
              <LiveSessionProvider>
                {/* THE PLAYER LIVES HERE, ABOVE THE ROUTES, and that placement
                    is the whole feature rather than tidiness.

                    The small player in the right rail and the full one on the
                    library page are two views of one thing. Held inside the
                    app shell, as it was, the library page sat on a different
                    route with a different provider — so starting rainfall in
                    the rail and opening the library gave you a second, silent
                    player, and walking back cut the sound off. A layout above
                    both survives navigation between them, so the track keeps
                    running while you move around the app. */}
                <PlayerProvider>
                  {children}
                  <TutorialExtras />
                  <InstallPrompt />
                </PlayerProvider>
              </LiveSessionProvider>
            </DemoProvider>
          </TutorialModeProvider>

          <AutoUpdate />
          <VersionWatch />
          {/* Renders nothing at all unless this is an INSTALLED copy running on
              an address that can never receive an update — the one state the
              update system cannot fix by itself. */}
          <FrozenCopy />
          <OnlineStatus />
          <UiTheme />
        </LocaleProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
