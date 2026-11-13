import type { MetadataRoute } from 'next';
import { BUILD_ENV } from '@/lib/build-info';
import { APP_NAME, APP_SHORT_NAME, APP_DESCRIPTION, NAVY } from '@/lib/brand';

// Served at /manifest.webmanifest. This is what makes the app installable on
// iOS, Android, Windows and Mac straight from the browser, with no app store and
// no developer account. For most churches that is the whole distribution story:
// send a link, tap "Add to Home Screen", done.
//
// The name comes from lib/brand.ts. Change it there, not here.
//
// WHY `id` MATTERS, and why not to remove it. A browser identifies an installed
// app by its manifest `id`, and when `id` is absent it falls back to
// `start_url`. That fallback is how you end up with two copies of the same app
// in a launcher: change `start_url` in a later release and the browser no longer
// recognises the installed copy, so it offers a fresh install and the person now
// has the app twice, one of which will never update again. Pinning `id` to '/'
// fixes this deployment's identity permanently.
//
// `id` only settles identity WITHIN one origin, which is the part that surprises
// people. A preview deployment on its own hostname is a different origin, so it
// is a different app no matter what this file says — installing from a preview
// leaves an icon that production can never update. Previews are blocked from
// installing at all (components/InstallPrompt.tsx); should one be installed by
// other means, the name below at least says what it is.
export default function manifest(): MetadataRoute.Manifest {
  const preview = BUILD_ENV === 'preview';
  return {
    id: '/',
    name: preview ? `${APP_NAME} PREVIEW · do not install` : APP_NAME,
    short_name: preview ? `${APP_SHORT_NAME} PREVIEW` : APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: '/',
    scope: '/',
    // `standalone` hides the browser's own toolbar, which is what makes an
    // installed app feel like an app — and also what takes away Back and
    // Reload. People noticed: the controls they had while using the site in a
    // tab disappeared the moment they installed it.
    //
    // `minimal-ui` is the middle setting: no address bar, no tab strip, but the
    // browser keeps a slim Back and Reload. Declaring it in `display_override`
    // rather than in `display` means any browser that does not implement it
    // simply falls through to `standalone` and behaves exactly as before.
    //
    // iOS ignores both: Safari has never implemented `minimal-ui`, so an iPhone
    // home-screen app still shows no browser controls at all. That is why
    // components/BackButton.tsx exists — it is the only Back that works on
    // every platform, and the manifest alone would have left iPhone users with
    // the same complaint.
    display_override: ['minimal-ui'],
    display: 'standalone',
    background_color: NAVY,
    theme_color: NAVY,
    orientation: 'portrait',
    // PNG first, then SVG.
    //
    // SVG alone is why the installed icon never changed: a home-screen shortcut
    // on iOS uses apple-touch-icon and iOS does not accept SVG there at all, so
    // it fell back to a screenshot of the page. Several Android launchers and
    // the desktop shortcut paths also prefer a raster icon. The SVG entries stay
    // last, for anything that can use them and wants the sharper result.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      {
        src: '/icons/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
