# Appendix F. Commands, packages and settings

## F.1 The commands in package.json

| Command | Runs |
|---|---|
| `npm run setup` | `node scripts/setup.mjs` |
| `npm run predev` | `node scripts/excalidraw-assets.mjs && node scripts/third-party-notices.mjs` |
| `npm run dev` | `node scripts/run-next.mjs dev` |
| `npm run build` | `node scripts/run-next.mjs build` |
| `npm run start` | `node scripts/run-next.mjs start` |
| `npm run test` | `node scripts/verify.mjs` |
| `npm run test:all` | `node scripts/verify.mjs --all` |
| `npm run icons` | `node scripts/gen-icons.mjs` |
| `npm run lint` | `node scripts/lint.mjs` |
| `npm run prebuild` | `node scripts/stamp-build.mjs && node scripts/excalidraw-assets.mjs && node scripts/third-party-notices.mjs` |
| `npm run verify` | `node scripts/verify.mjs` |
| `npm run verify:all` | `node scripts/verify.mjs --all` |

## F.2 Every runtime dependency, pinned

Exact versions, as `package.json` holds them. `tests/dependency-licences.mjs` fails the build if one arrives under a licence nobody here has read.

| Package | Version |
|---|---|
| `@blocksuite/affine` | ^0.22.4 |
| `@excalidraw/excalidraw` | 0.18.1 |
| `@supabase/ssr` | ^0.12.4 |
| `@supabase/supabase-js` | ^2.112.3 |
| `@vanilla-extract/next-plugin` | ^2.5.2 |
| `lit` | ^3.3.3 |
| `next` | ^15.5.20 |
| `pitchy` | 4.1.0 |
| `react` | 19.0.0 |
| `react-dom` | 19.0.0 |
| `yjs` | ^13.6.32 |

## F.3 Development dependencies

| Package | Version |
|---|---|
| `@types/node` | ^22.10.7 |
| `@types/react` | ^19.0.7 |
| `@types/react-dom` | ^19.0.3 |
| `autoprefixer` | ^10.4.20 |
| `esbuild` | ^0.28.2 |
| `playwright` | ^1.62.1 |
| `postcss` | ^8.5.10 |
| `tailwindcss` | ^3.4.17 |
| `typescript` | ^5.7.3 |

## F.4 Environment variables the code reads

Names only: values never go in the repository. `NEXT_PUBLIC_` ones are compiled into the browser bundle and must never be secrets.

| Variable | Read in |
|---|---|
| `BEACON_DIST_DIR` | `next.config.mjs` |
| `BEACON_MIN_BUILD_TIME` | `app/version.json/route.ts` |
| `BEACON_PUBLIC_SITE` | `lib/site-visibility.ts`, `next.config.mjs` |
| `NEXT_PUBLIC_PLAYER_CREDIT` | `lib/player.tsx` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `app/api/auth/sign-in/route.ts`, `lib/mode.ts`, `lib/supabase/client.ts`, `next.config.mjs` |
| `NEXT_PUBLIC_SUPABASE_URL` | `app/api/auth/sign-in/route.ts`, `lib/mode.ts`, `lib/supabase/client.ts`, `next.config.mjs` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `lib/push.ts` |
| `NODE_ENV` | `components/ServiceWorker.tsx`, `next.config.mjs` |
| `X` | `lib/supabase/client.ts` |
