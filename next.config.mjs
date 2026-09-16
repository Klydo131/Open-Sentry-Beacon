/** @type {import('next').NextConfig} */
import { createVanillaExtractPlugin } from '@vanilla-extract/next-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocksuiteAliases, NEEDS_LOADERS } from './scripts/blocksuite-aliases.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// THE STUDY ROOM'S EDITOR NEEDS BOTH OF THESE, and both were found by building
// rather than by reading. BlockSuite styles three of its packages with
// vanilla-extract, which generates CSS at BUILD time from .css.ts files and
// throws at runtime without its plugin -- the failure reads like a Lit styling
// error and sends you looking in the wrong place for an hour. And every
// @blocksuite package resolves to its own TypeScript source unless pointed at
// dist; see scripts/blocksuite-aliases.mjs for what that costs otherwise.
const withVanillaExtract = createVanillaExtractPlugin();

// Security headers.
//
// As shipped there is no backend, so there is nothing here to steal — but the
// headers are set anyway, because these are what a fork inherits on the day it
// does connect one, and nobody adds them later. No clickjacking, no MIME
// sniffing, a tight referrer policy, and a Content-Security-Policy that allows
// this origin and nothing else.
//
// IF YOU CONNECT A BACKEND: add its origin to `connect-src` and nowhere else.
// Widening `default-src` is the usual shortcut and it gives away every other
// directive at the same time.
// Next.js's development server compiles and hot-reloads through `eval`, so a
// Content-Security-Policy without 'unsafe-eval' stops React from ever starting.
// The page returns HTTP 200, the title is right, and the body is BLANK — which
// is what `npm run dev` did until 2026-08-12, i.e. exactly what the README's
// "try it in two minutes" tells a newcomer to run first.
//
// It survived because nothing tested it: `npm run verify` builds for production
// and runs every end-to-end walk against `next start`, where eval is not used
// and the strict policy is correct. A green suite and a broken front door, for
// the second time in this project, because the suite was answering a narrower
// question than anyone thought.
//
// So: development gets 'unsafe-eval' and NOTHING ELSE does. `next build` never
// sets NODE_ENV=development, so a production deployment cannot pick this up by
// accident, and tests/security-invariants.mjs asserts the relaxation is inside
// this conditional rather than in the shipped list.
const DEV = process.env.NODE_ENV === 'development';

// The backend origin, when this deployment has one.
//
// "IF YOU CONNECT A BACKEND: add its origin to connect-src" is the instruction
// written above, and it was never followed — including here, by us. The result
// is not a subtle degradation: lib/mode.ts decides IS_LIVE from these two
// variables and lib/supabase/client.ts then makes every data call FROM THE
// BROWSER, so a deployment with keys set had all of them refused by its own
// Content-Security-Policy. Signing in, loading a dashboard, sharing anything —
// all dead, and dead in the console only, where a server log will never show it.
//
// Deriving the origin here rather than asking a deployer to paste it means the
// instruction cannot be missed again: configure the backend and the policy
// follows. Demo deployments set nothing and stay locked to 'self'.
//
// media-src and img-src get it too. Files still live on the device today, so
// blob: is what plays — but the moment a fork serves a shared file from Storage
// it arrives on a signed, cross-origin URL, and a player that renders, sits at
// 0:00 and never says why is exactly the bug this same policy caused in the
// sibling app. Naming the origin now costs nothing and removes the trap.
const connectSources = ["'self'"];
const mediaSources = ["'self'", 'blob:', 'data:'];
const imageSources = ["'self'", 'data:', 'blob:'];
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  try {
    const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (backend.protocol === 'https:') {
      connectSources.push(backend.origin, `wss://${backend.host}`);
      mediaSources.push(backend.origin);
      imageSources.push(backend.origin);
    }
  } catch {
    // A malformed URL fails closed to same-origin rather than widening.
  }
}

const csp = [
  "default-src 'self'",
  `img-src ${imageSources.join(' ')}`,
  "font-src 'self' data:",
  // Next.js injects small inline bootstrap scripts; 'unsafe-inline' is scoped to
  // scripts we ship. No third-party script origins are allowed.
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `connect-src ${connectSources.join(' ')}`,
  // Files the person saved to their own device play from a blob: URL. Without
  // this, media-src falls back to default-src 'self', blob: is not 'self', and
  // every local audio/video file fails to play with no visible error.
  `media-src ${mediaSources.join(' ')}`,
  // THE STUDY ROOM'S EDITOR RUNS WORKERS, and builds them from a blob rather
  // than a URL. Without this directive worker-src falls back to default-src
  // 'self', blob: is not 'self', and the worker is refused -- in production
  // only, silently, on the one screen that needs it. This widens workers and
  // nothing else: default-src stays exactly as tight as it was.
  "worker-src 'self' blob:",
  // The only third-party frames allowed, and only these: the YouTube and
  // Facebook video players. frame-src otherwise falls back to default-src
  // 'self' and every embed is blocked. Scripts, XHR and everything else stay
  // first-party — this permits an embedded player and nothing more.
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://www.facebook.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Search visibility, decided in one place. Kept in step with app/robots.ts and
// the `robots` metadata in app/layout.tsx, which read the same variable through
// lib/site-visibility.ts — this file cannot import that module (a .mjs config is
// evaluated before TypeScript exists), so it reads the variable directly and
// tests/security-invariants.mjs asserts the three never drift apart.
//
// Default: no. A church deployment holds real people's names, and a shared deep
// link that gets indexed is the cheapest possible leak, so being findable is
// opted into on purpose. The public showcase is the deployment that sets it.
const indexable = process.env.BEACON_PUBLIC_SITE === '1';

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(indexable ? [] : [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }]),
];

// The build identity deliberately does NOT live here any more.
//
// It used to be `Date.now().toString(36)` in this file, exposed through `env`.
// Next.js evaluates this config more than once, so the browser bundle and the
// server route ended up holding ids from different evaluations. They disagreed
// permanently, the app compared them, and it announced "A new version is ready"
// on every single check, forever, on a perfectly current build.
//
// scripts/stamp-build.mjs now writes lib/build-info.ts once per build and both
// sides import that one constant. See the note in that script.

const nextConfig = {
  // Where the build lands. Normally `.next`; overridable so a test can boot the
  // DEV server without destroying the PRODUCTION build sitting beside it.
  //
  // tests/dev-server.mjs runs `next dev`, which rewrites the build directory.
  // With both sharing `.next` that test wiped the production build and the
  // end-to-end phase that runs next, failing with "Could not find a production
  // build" — a failure caused entirely by the test that ran before it. Separate
  // directories remove the ordering dependency instead of documenting it.
  // THREE PACKAGES STYLE THEMSELVES WITH VANILLA-EXTRACT, and Next excludes
  // node_modules from its loaders by default, so the plugin never sees their
  // .css files and webpack meets a bare `style()` call it cannot parse. Naming
  // them here is what lets the loaders run over them. Only these three: the
  // list is small on purpose, because transpiling all seventy would be slow and
  // would undo the point of resolving to compiled output.
  // EVERY @blocksuite PACKAGE, and both halves of that are needed.
  //
  // Next excludes node_modules from its loaders, and BlockSuite's compiled
  // output needs two of them. Three packages style themselves with
  // vanilla-extract, whose `style()` calls are meaningless until its plugin has
  // run. And twenty-five ship the `accessor` keyword from the decorators
  // proposal, which webpack's own parser cannot read -- it reports a syntax
  // error against whichever filename module concatenation happened to be
  // holding, which is how this looked like a CSS problem for an hour.
  //
  // Naming them all is slower than naming a few, and it is the only list that
  // does not have to be revisited every time a dependency of a dependency picks
  // up a decorator.
  // PRODUCTION ONLY, and the reason is React Fast Refresh. Next injects its
  // refresh runtime into everything named here, and these are Lit and plain
  // modules rather than React ones, so in `next dev` every page 500s with
  // "$RefreshReg$ is not defined" -- including pages that have nothing to do
  // with the study room, because the module graph still gets compiled.
  //
  // In development the accessor loader below still makes these files parse, so
  // the app compiles and runs; what is missing is the vanilla-extract pass, so
  // opening the study room itself under `next dev` will fail at runtime. That
  // is a worse experience for somebody developing than for anybody using the
  // app, and it is written down rather than left to be discovered.
  ...(DEV ? {} : { transpilePackages: NEEDS_LOADERS }),
  distDir: process.env.BEACON_DIST_DIR || '.next',
  reactStrictMode: true,
  // The image optimizer is disabled, and that is a security decision as much as
  // a cost one.
  //
  // Next ships /_next/image whether or not the app uses it, and this app does
  // not: every picture here is a plain <img> or a blob from the device. Leaving
  // the endpoint reachable kept us exposed to GHSA-q8wf-6r8g-63ch (denial of
  // service in the Image Optimization API using SVGs) for a feature nobody
  // calls. Turning it off removes the route and, with it, the runtime need for
  // sharp, which carries its own inherited libvips CVEs.
  //
  // If you do need the optimizer, turn it back on deliberately and read that
  // advisory first — do not flip it because an image looked soft.
  images: { unoptimized: true },
  // Lint is not allowed to fail a build. It runs in CI where a human reads it;
  // here it would mean a stylistic warning could stop a church deploying.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  webpack(config) {
    // Resolve @blocksuite to compiled output rather than its TypeScript source.
    // Without this the build dies on raw Lit decorators and the `accessor`
    // keyword, neither of which is a bundler's job to guess at.
    //
    // EVERY KEY ENDS IN `$`, WHICH IS LOAD-BEARING. A webpack alias without it
    // matches as a PREFIX, so `@blocksuite/affine` also swallows
    // `@blocksuite/affine/effects` and rewrites it to a path inside a file.
    // The build then reports "Can't resolve '@blocksuite/affine/effects'",
    // which reads like a missing package and is actually this. Every subpath is
    // mapped explicitly, so every match should be exact.
    const exact = Object.fromEntries(
      Object.entries(blocksuiteAliases(HERE)).map(([spec, file]) => [`${spec}$`, file]),
    );
    config.resolve.alias = { ...config.resolve.alias, ...exact };

    // The three packages resolved from source write `./block-type.js` and mean
    // `./block-type.ts` -- TypeScript's own convention for ESM specifiers,
    // which webpack's resolver does not know. Without this the build reports a
    // missing .js file that was never supposed to exist.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };

    // See scripts/accessor-loader.cjs. Scoped to @blocksuite's compiled output
    // and nothing else, so the app's own code still goes through Next's
    // compiler untouched.
    config.module.rules.push({
      test: /\.js$/,
      include: /node_modules[\\/]@blocksuite[\\/].*[\\/]dist[\\/]/,
      // NOT the vanilla-extract files. They parse perfectly well on their own --
      // it is `accessor` elsewhere that webpack chokes on -- and putting them
      // through a loader here drags them into Next's client transform, where
      // React Fast Refresh then injects $RefreshReg$ into modules that are Lit
      // rather than React. Every page in the app 500s in `next dev` when that
      // happens, including pages with nothing to do with the study room.
      exclude: /\.css\.js$/,
      use: [{ loader: path.join(HERE, 'scripts', 'accessor-loader.cjs') }],
    });
    return config;
  },
};

// PRODUCTION ONLY, and this is a real limitation rather than a tidy-up.
//
// The plugin adds a webpack rule for vanilla-extract's `.css.js` files, and in
// development Next then injects React Fast Refresh into whatever that rule
// touches. Those files are Lit and plain modules, not React, so $RefreshReg$ is
// undefined and EVERY page in the app 500s under `next dev` -- the landing
// page included, which has nothing to do with the study room.
//
// So in development the plugin is left off. The .css.js files parse on their
// own, the app compiles and runs normally, and the one thing that does not work
// is the study room's editor, which needs the styles the plugin generates.
// Developing that screen means `npm run build && npm run start` rather than
// `npm run dev`.
export default DEV ? nextConfig : withVanillaExtract(nextConfig);
