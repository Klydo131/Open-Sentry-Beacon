// Menu | People | My Files, along the bottom of every phone and pad.
//
// ---------------------------------------------------------------------------
// Asked for on 30 September 2026, with a sketch: "Can we have Menu | People |
// My Files as our bottom for our UI to make it simple in our Mobile and Pad?"
//
// What this holds, in the order a person meets it:
//   1. Where each tab goes, and which tab is lit, run rather than read
//      (lib/tab-bar.ts has no React in it for exactly this).
//   2. People opens each role's own home on its people, and the home table it
//      uses is the same one sign-in uses.
//   3. The bar is on every screen that has the app's navigation: both shells
//      and My Files, which runs outside them.
//   4. The page makes room for it, and everything that floats over the bottom
//      of a phone stands on top of it rather than behind it.
//   5. The tutorial can still reach Home on a phone, through the Menu.
//   6. The header stays short: brand and person, no rooms.
//
// The browser half is tests/e2e/the-rooms-fit-a-phone.js, which taps the bar
// at phone, pad and desktop sizes.
//
//   node tests/the-bottom-bar.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTs as strip } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---------------------------------------------------------------------------
// 1. WHERE THE TABS GO, AND WHICH ONE IS LIT
// ---------------------------------------------------------------------------
{
  const target = pathToFileURL(path.join(root, 'lib/tab-bar.ts')).href;
  let mod;
  try {
    mod = await import(target);
  } catch (err) {
    const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(String(err && (err.code || err.message)));
    if (!strippable || process.env.BOTTOM_BAR_RETRY === '1') {
      console.error('FAIL  could not load lib/tab-bar.ts on ' + process.version);
      process.exit(1);
    }
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
      { stdio: 'inherit', env: { ...process.env, BOTTOM_BAR_RETRY: '1' } });
    process.exit(r.status ?? 1);
  }
  const { tabFor, peopleHref, homeOf, MENU_HREF, FILES_HREF } = mod;

  ok(MENU_HREF === '/menu' && FILES_HREF === '/library', 'Menu opens /menu and My Files opens /library');
  ok(peopleHref('dm') === '/dm?room=people', `a Guide's People opens My Explorers (${peopleHref('dm')})`);
  ok(peopleHref('ds') === '/ds?room=guide', `an Explorer's People opens My Guide (${peopleHref('ds')})`);
  ok(peopleHref('admin') === '/admin' && peopleHref('executive') === '/admin',
     "a Director's People opens Admin");

  const cases = [
    ['/menu', 'dm', 'menu'],
    ['/church', 'dm', 'menu'],
    ['/settings', 'ds', 'menu'],
    ['/office', 'admin', 'menu'],
    ['/dm', 'dm', 'people'],
    ['/dm/', 'dm', 'people'],
    ['/dm/pair-john', 'dm', 'people'],
    ['/dm?room=week', 'dm', 'people'],
    ['/talk', 'ds', 'people'],
    ['/ds', 'ds', 'people'],
    ['/admin', 'executive', 'people'],
    ['/library', 'dm', 'files'],
    ['/library#mine', 'ds', 'files'],
    // Somebody else's home is not your People. A Director on /dm is in a room
    // they reached some other way.
    ['/dm', 'admin', 'menu'],
    // A prefix is not a room: /dmx is not inside /dm.
    ['/dmx', 'dm', 'menu'],
    ['/libraryx', 'dm', 'menu'],
  ];
  const wrong = cases.filter(([p, r, want]) => tabFor(p, r) !== want)
    .map(([p, r, want]) => `${r} on ${p}: ${tabFor(p, r)}, wanted ${want}`);
  ok(wrong.length === 0,
     wrong.length ? `the wrong tab is lit: ${wrong.join('; ')}` : `the right tab is lit on ${cases.length} screens`);

  // THE SAME HOMES AS SIGN-IN. Three tables name each role's home; if People
  // pointed somewhere sign-in does not, the tab would disagree with where the
  // app put you.
  const session = read('lib/live/session.tsx');
  const signIn = read('app/api/auth/sign-in/route.ts');
  const homes = { executive: homeOf('executive'), admin: homeOf('admin'), dm: homeOf('dm'), ds: homeOf('ds') };
  const agrees = (src) => Object.entries(homes).every(([role, href]) =>
    new RegExp(`${role}:\\s*'${href.replace('/', '\\/')}'`).test(src));
  ok(agrees(session) && agrees(signIn),
     `the bar's homes are sign-in's homes (${Object.values(homes).join(', ')})`);
}

// ---------------------------------------------------------------------------
// 2. PEOPLE OPENS ON PEOPLE, ON BOTH HALVES
// ---------------------------------------------------------------------------
// The subroom named in the address has to exist in the room it names, or the
// room ignores it and opens wherever it was last left.
{
  const pairs = [
    ['app/dm/page.tsx', 'people', 'the sample Guide home'],
    ['components/live/GuidePages.tsx', 'people', 'the live Guide home'],
    ['app/ds/page.tsx', 'guide', 'the sample Explorer home'],
    ['components/live/ExplorerPage.tsx', 'guide', 'the live Explorer home'],
  ];
  for (const [file, id, what] of pairs) {
    const src = read(file);
    ok(new RegExp(`\\{ id: '${id}', label: '[^']*'`).test(src), `${what} has a "${id}" subroom for People to open`);
  }
}

// ---------------------------------------------------------------------------
// 3. ON EVERY SCREEN WITH THE APP'S NAVIGATION, AND NOT ON A DESKTOP
// ---------------------------------------------------------------------------
{
  const bar = strip(read('components/TabBar.tsx'));
  const demo = strip(read('components/AppShell.tsx'));
  const live = strip(read('components/LiveAppShell.tsx'));
  const library = strip(read('app/library/page.tsx'));

  const demoSrc = strip(read('components/AppShell.tsx'));
  const liveSrc = strip(read('components/LiveAppShell.tsx'));
  const labels = [...bar.matchAll(/\{ key: '(\w+)', label: '([^']+)'/g)].map((m) => `${m[1]}:${m[2]}`);
  ok(labels.join(' | ') === 'menu:Menu | people:People | files:My Files',
     `three tabs, in the order asked for (${labels.join(' | ')})`);
  // AT EVERY WIDTH since "the same dropdown and UI with Desktops": no
  // breakpoint hides the bar, and neither shell mounts a left rail any more.
  ok(!/\b(sm|md|lg|xl|2xl):hidden\b/.test(bar) && !/className="[^"]*\bhidden\b/.test(bar),
     'the bar is on a desktop too; no breakpoint hides it');
  ok(!/LeftRail/.test(demoSrc) && !/LeftRail/.test(liveSrc) && !/export function LeftRail/.test(read('components/RoomRails.tsx')),
     'and there is no left rail drawing the rooms a second time');
  ok(/data-quest=\{`tab-\$\{key\}`\}/.test(bar), 'each tab carries a tutorial anchor (tab-menu, tab-people, tab-files)');
  ok(/aria-current=\{on \?/.test(bar), 'the lit tab is announced, not only coloured');
  ok(/import \{ FolderGlyph, MenuGlyph, PeopleGlyph \} from '@\/components\/Glyph'/.test(bar)
     && /Icon: MenuGlyph/.test(bar) && /Icon: PeopleGlyph/.test(bar) && /Icon: FolderGlyph/.test(bar)
     && /<Icon size=\{24\} \/>/.test(bar) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(bar),
     'the tab icons are drawn (Glyph.tsx), not emoji');

  ok((demo.match(/<TabBar role=\{currentUser\.role\} \/>/g) ?? []).length === 1, 'the sample shell draws the bar once');
  ok((live.match(/<TabBar role=\{profile\.role\} \/>/g) ?? []).length === 1, 'the live shell draws the bar once');
  ok(/<TabBar role=\{barRole\} \/>/.test(library), 'My Files draws it too, though it runs outside both shells');
  ok(/const barRole = live \? profile\?\.role : currentUser\?\.role/.test(library),
     'and My Files takes the role from the half that is running, not a sample person left in the browser');
}

// ---------------------------------------------------------------------------
// 4. THE PAGE MAKES ROOM, AND FLOATING THINGS STAND ON TOP OF IT
// ---------------------------------------------------------------------------
{
  const bar = read('components/TabBar.tsx');
  const css = read('app/globals.css');
  ok(/setProperty\('--tab-bar'/.test(bar) && /removeProperty\('--tab-bar'\)/.test(bar),
     'the bar publishes its measured height, and withdraws it when it goes');
  // Anchored to the start of the line: `scroll-padding-bottom` below contains
  // the same words, and matched in its place when this one was taken away.
  ok(/\n\s+padding-bottom:\s*calc\(var\(--install-bar, 0px\) \+ var\(--tab-bar, 0px\)\)/.test(css),
     'the page can scroll its last line clear of the bar and the install prompt on it');
  ok(/scroll-padding-bottom:\s*calc\(var\(--install-bar, 0px\) \+ var\(--tab-bar, 0px\)\)/.test(css),
     'and a control scrolled to comes to rest above it, not behind it');
  ok(/\.safe-bottom\s*\{[^}]*margin-bottom:\s*max\(env\(safe-area-inset-bottom, 0px\), var\(--tab-bar, 0px\)\)/.test(css),
     'everything floating (chat bubble, install bar, nudge, toasts) is lifted above the bar');
  ok((css.match(/- var\(--install-bar, 0px\) - var\(--tab-bar, 0px\) - 1rem\)/g) ?? []).length === 2,
     'a live conversation is sized to the screen above the bar');
  // THE INSTALL PROMPT STANDS ON THE BAR TOO, with a ceiling taken from the
  // height left ABOVE the bar. Covering the bar instead was tried and the full
  // gate showed the cost: the Menu could not be pressed while the prompt was
  // up, which the old header row never did to anybody.
  const prompt = read('components/InstallPrompt.tsx');
  // Other attributes may sit between the two (data-steps-aside-for-chat).
  const barLine = /data-install-prompt="bar"[^>]*?className="([^"]*)"/.exec(prompt)?.[1] ?? '';
  ok(/\bsafe-bottom\b/.test(barLine) && /className="install-bar-ceiling /.test(prompt)
     && !/max-h-\[50dvh\]/.test(prompt)
     && /\.install-bar-ceiling\s*\{[^}]*max-height:\s*calc\(\(100dvh - var\(--tab-bar, 0px\)\) \* 0\.5\)/.test(css),
     'the install prompt stands on the bar, and is at most half of what is left above it');
  ok(/\.tab-bar\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom/.test(css),
     'the bar clears the home indicator itself');
  // `display: none` is the one allowed, and only in the short-screen rule
  // below; any other display would beat `xl:hidden` (VISUAL-LANGUAGE.md).
  ok(!/\.tab-bar\s*\{[^}]*display\s*:(?!\s*none)/.test(css),
     'and sets no display of its own, so `xl:hidden` still wins (VISUAL-LANGUAGE.md)');
  const short = /@media \(max-height: 500px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  ok(/\.tab-bar-tab\s*\{[^}]*flex-direction:\s*row[^}]*min-height:\s*44px/.test(short),
     'on a phone held sideways the bar goes compact and stays a full-size target');
  ok(/body:has\(\[data-live-conversation\]\) \.tab-bar\s*\{\s*display:\s*none;\s*\}/.test(short),
     'and steps aside while a conversation is on that short screen');
  // The desk beside the page on a desktop scrolls itself; it must end above
  // the bar, or its last line (the player) is under the bar however far it is
  // scrolled.
  ok(/\.desk-rail\s*\{[^}]*max-height:\s*calc\(100dvh[^;]*- var\(--tab-bar, 0px\)\)/.test(css)
     && /className="desk-rail /.test(read('components/RoomRails.tsx')),
     'the desk beside the page on a desktop ends above the bar');
  // And it starts below the header (3 October 2026, "yes fix it in Classic
  // too"): it stuck a fixed 76px down, under a taller header, so its first
  // card slid underneath. The height it sticks below is measured by both
  // shells, so neither can forget to say how tall its header is.
  ok(/\.desk-rail\s*\{[^}]*top:\s*calc\(var\(--beacon-chrome-top, 0px\) \+ var\(--app-header, 60px\)/.test(css)
     && !/xl:top-\[/.test(read('components/RoomRails.tsx')),
     'the desk sticks below the measured header, not a fixed distance from the top');
  // Nothing may sit in a row below the page and the desk: the desk sticks
  // inside their row and cannot hang past it, so a row ending above the bottom
  // of the screen pushes the desk under the header at the end of every page.
  {
    const live = read('components/LiveAppShell.tsx');
    const main = live.slice(live.indexOf('<main'), live.indexOf('</main>'));
    ok(/<footer\b/.test(main) && (live.match(/<footer\b/g) || []).length === 1,
       'the live footer is inside the page column, so the desk\'s row reaches the bottom of the page');
  }
  for (const shell of ['components/AppShell.tsx', 'components/LiveAppShell.tsx']) {
    const src = read(shell);
    ok(/setProperty\(\s*'--app-header'/.test(src) && /ref=\{headerRef\}/.test(src), `${shell} measures its header for it`);
  }
  ok(/\.tab-bar-tab\s*\{[^}]*min-height:\s*60px[^}]*font-size:\s*15px/.test(css),
     'each tab is a tall target with a label no smaller than 15px');
}

// ---------------------------------------------------------------------------
// 5. THE TUTORIAL STILL REACHES HOME ON A PHONE
// ---------------------------------------------------------------------------
{
  const quest = read('lib/quest.ts');
  const panel = strip(read('components/Quest.tsx'));
  const menu = strip(read('components/MenuList.tsx'));
  const step = /id: 'x-church'[\s\S]*?events:/.exec(quest)?.[0] ?? '';
  ok(/\bfallbacks:\s*\[\s*\{ target: 'tab-menu'/.test(step),
     'the "journey chart" step falls back to the Menu tab when the header link is hidden');
  ok(/data-quest=\{home \? 'church-link' : undefined\}/.test(menu) && /emitQuest\('beacon:open-church'\)/.test(menu),
     'and Home in the Menu is the church link the step waits for');
  ok(/querySelectorAll\(`\[data-quest="\$\{name\}"\]`\)\)\.find\(isVisible\)/.test(panel),
     'the tutorial takes the first VISIBLE match, not the hidden desktop link');
  ok(/const vh = window\.innerHeight - tabBarHeight\(\)/.test(panel),
     'and measures the screen as ending where the bar begins');
  ok(/'quest-dock inset-x-0 rounded-t-2xl'/.test(panel) && /\.quest-dock\s*\{\s*bottom:\s*var\(--tab-bar, 0px\)/.test(read('app/globals.css')),
     'its panel stands on top of the bar, so the bar stays usable during the tutorial');
  ok(/if \(pinned\) next = r\.top > vh \/ 2 \? 'top' : 'bottom';/.test(panel),
     'and moves to the top when the step points AT the bar, so the ring and arrow are not under it');
  ok(/setRect\(null\);[^\n]*\n\s*setOffScreen\(null\);[\s\S]{0,700}?setPlace\('bottom'\);\s*return;/.test(panel),
     'and opens again when the next step is on another screen, so its "Go to ..." button can be seen');
}

// ---------------------------------------------------------------------------
// 6. THE HEADER IS THE BRAND AND THE PERSON
// ---------------------------------------------------------------------------
{
  const demo = read('components/AppShell.tsx');
  const live = strip(read('components/LiveAppShell.tsx'));
  const demoCode = strip(demo);
  ok(!/data-quest="church-link"/.test(demoCode) && !/overflow-x-auto/.test(demoCode)
     && !/href="\/(church|office|publish|cases|mail|settings|library)"/.test(demoCode),
     'the sample header has no row of rooms at any width');
  ok(!/<span>Switch<\/span>/.test(demoCode),
     'and Switch account is in the Menu, not the header');
  ok(/<BackButton home=\{homeFor\(profile\.role\)\} \/>/.test(live),
     'the live header has a Back button, as the sample one always has');
  ok(!/aria-label="Sections"/.test(live), 'the live header has no row of rooms at all');
  ok(/<Link\s+href="\/profile"[\s\S]{0,300}?aria-label="Your profile"/.test(live),
     'the live header picture opens the profile, as the sample one always has');

  // Hooks above the guard: Switch account on the Menu signs out on a screen
  // inside the shell, and a hook below the early return would then run one
  // render and not the next.
  const shell = demo.slice(demo.indexOf('function DemoAppShell'));
  const guard = shell.indexOf("if (!currentUser || !allow.includes(currentUser.role)) return null;");
  const afterGuard = strip(shell.slice(guard, shell.indexOf('return (', guard)));
  ok(guard > 0 && !/\buse[A-Z]\w*\(/.test(afterGuard),
     'no hook in the sample shell runs after its signed-out early return');

  const page = strip(read('app/menu/page.tsx'));
  ok(/Sign out/.test(page) && /Switch account/.test(page),
     'the Menu ends with the way out: Sign out live, Switch account in the sample');
}

// ---------------------------------------------------------------------------
// 7. INSIDE A CONVERSATION THE BAR STEPS ASIDE
// ---------------------------------------------------------------------------
// "Hide the bar inside conversations too." A screen that IS a conversation
// marks itself; the stylesheet hides the bar while one is on the page. The
// Explorer's home is deliberately not marked: the chat with their Guide is on
// it, but it is also their studies and what People opens, and a bar that went
// away the moment somebody pressed People would be a bar nobody trusts.
{
  const css = read('app/globals.css');
  const outside = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  ok(/body:has\(\[data-conversation-screen\]\) \.tab-bar\s*\{\s*display:\s*none;\s*\}/.test(outside),
     'the bar is hidden while a conversation screen is on the page, at every width');
  // THE ONE CONVERSATION SCREEN LEFT IS /talk. On 30 September 2026 the chat
  // left the Guide's Talk tab (now Appointments) and the Explorer's home for
  // the bubble, which covers the whole screen below 1280px and stands on the
  // bar above it. A page of appointments is not a conversation: it keeps the
  // bar, as every other page does.
  ok(/data-conversation-screen/.test(read('app/talk/page.tsx')), '/talk is marked as a conversation');
  for (const file of ['components/live/GuidePages.tsx', 'app/dm/[id]/page.tsx', 'components/live/ExplorerPage.tsx',
    'app/ds/page.tsx', 'components/live/TalkSurface.tsx', 'components/live/TalkDock.tsx', 'components/talk/Dock.tsx']) {
    ok(!/data-conversation-screen/.test(strip(read(file))),
       `${file} is not marked (appointments and homes keep the bar; the bubble covers it or stands on it)`);
  }
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
