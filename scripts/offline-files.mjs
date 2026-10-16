// Writes the list of files the app needs to work with no signal, once per
// build, for the service worker to keep (app/sw.js/route.ts).
//
// WHY THIS FILE EXISTS. The worker used to keep the pages and nothing else.
// The code those pages run was kept only once something had asked for it, so
// a phone kept exactly what its owner happened to open while online. Measured
// on 16 October 2026 with the server stopped, after opening Home and the
// Church online: 10 of 27 screens opened. Three showed "Beacon needs a fresh
// copy" because a piece of their code had never been fetched, fourteen showed
// "You're offline" or nothing, and the Tuner, the Conductor, Pieces and Play
// all failed, because each is loaded only when its folder is opened. An app
// that says it works offline has to keep its code before it is asked for.
//
// Nobody can write that list by hand: the bundler names the files and splits
// them differently on every build. So the bundler writes it, from what it
// knows about every chunk:
//
//   pages  every file a screen needs to open (each entry point's chunks);
//   tools  every file loaded later, with import(), grouped by what loads it:
//          the Tuner, the drawing board, the PDF reader, the study room's
//          editor, and the pieces those libraries load for themselves;
//   extras files the app serves from public/ that a tool fetches (the drawing
//          board's fonts, the looks' pictures).
//
// EVERYTHING IS KEPT BY DEFAULT, so a new tool works with no signal without
// anybody remembering to add it. The first version kept only what OUR code
// loads and left every library's own later loads out; the walk with the
// signal cut (tests/e2e/the-app-works-with-no-signal.js) showed that was
// wrong. The drawing board loads its English words that way, and the study
// room its two code colour themes, as they open.
//
// LEFT OUT, BY NAME, and only these (OPTIONAL below): a library's extras that
// cost megabytes and that this app does not need to open anything. They are
// still kept the first time somebody uses them, with a signal.
//
// The list is written to /_next/static/offline/<build>.json. The build id is
// read from lib/build-info.ts, which scripts/stamp-build.mjs writes before
// every build and the worker itself imports, so the two cannot disagree.
import fs from 'node:fs';
import path from 'node:path';

const NAME = 'BeaconOfflineFiles';

/** What is left out, why, and how to recognise it. Everything else is kept. */
export const OPTIONAL = [
  // The study room's code block colours code in the language it is written
  // in. Three hundred languages' rules come to about 9 MB; with no signal
  // code is still shown and edited, in one colour.
  // The two themes the study room opens with (light-plus, dark-plus) are kept.
  {
    why: 'colours for code in 300 programming languages',
    test: /\/node_modules\/@shikijs\/(langs\/|themes\/dist\/(?!(light|dark)-plus\.))/,
  },
  // Drawing a diagram from text, in the drawing board and the study room:
  // about 3 MB, for a feature this app does not offer in its own menus. Only
  // mermaid and the packages nothing but mermaid uses: KaTeX was on this
  // list once, and the study room's editor loads it as it opens (the walk
  // with the signal cut found it).
  {
    why: 'diagrams drawn from text',
    test: /\/node_modules\/(mermaid|@mermaid-js|@excalidraw\/mermaid-to-excalidraw|cytoscape[^/]*|dagre-d3-es|khroma)\//,
  },
  // components/draw/DrawingBoard.tsx always opens the board in English.
  {
    why: "the drawing board's 57 other languages (it is always in English)",
    test: /\/@excalidraw\/excalidraw\/dist\/prod\/locales\/(?!en-|percentages-)/,
  },
];

/** The one build id, read from the file both the app and the worker import. */
export function stampedBuild(root) {
  const text = fs.readFileSync(path.join(root, 'lib', 'build-info.ts'), 'utf8');
  const m = text.match(/export const BUILD_ID = "([^"]+)"/);
  if (!m) throw new Error('lib/build-info.ts has no BUILD_ID; run scripts/stamp-build.mjs');
  return m[1];
}

const slashes = (p) => p.split(path.sep).join('/');

/** Who loads a group: our own file by its path, a library by its name. */
function loader(resource, root) {
  if (!resource) return null;
  const p = slashes(resource);
  const at = p.lastIndexOf('/node_modules/');
  if (at < 0) return slashes(path.relative(root, resource));
  const rest = p.slice(at + '/node_modules/'.length).split('/');
  return rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
}

/** public/ files a tool fetches at run time. Not the licence text, not icons twice. */
function publicExtras(root) {
  const dir = path.join(root, 'public');
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push('/' + slashes(path.relative(dir, full)));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  // The third-party notices are a 1.4 MB text file read by people checking
  // licences, not by anybody using the app; icons are kept by the worker's
  // own list.
  return out.filter((f) => f !== '/third-party-notices.txt' && !f.startsWith('/icons/')).sort();
}

export class OfflineFilesPlugin {
  constructor({ root, build }) {
    this.root = root;
    this.build = build;
  }

  apply(compiler) {
    const { Compilation, sources } = compiler.webpack;
    compiler.hooks.thisCompilation.tap(NAME, (compilation) => {
      compilation.hooks.processAssets.tap(
        // After every other plugin has added or renamed its files.
        { name: NAME, stage: Compilation.PROCESS_ASSETS_STAGE_REPORT },
        () => {
          const base = (() => {
            const p = compilation.outputOptions.publicPath;
            return typeof p === 'string' && p !== 'auto' && p ? p : '/_next/';
          })();
          // As the browser will ask for it: a page under app/dm/[id]/ is
          // requested as %5Bid%5D, and a copy kept under the bare brackets
          // was never found (the walk caught it on an Explorer's page).
          const url = (file) => base + file.split('/').map(encodeURIComponent).join('/');
          const wanted = (file) =>
            file.startsWith('static/') && !file.endsWith('.map') && !file.endsWith('.txt');
          const size = (f) => compilation.getAsset(f)?.source.size() ?? 0;
          const bytes = (files) => [...files].reduce((n, f) => n + size(f), 0);
          const filesOf = (chunks) => {
            const out = new Set();
            for (const chunk of chunks) {
              for (const f of chunk.files) if (wanted(f)) out.add(f);
              for (const f of chunk.auxiliaryFiles) if (wanted(f)) out.add(f);
            }
            return out;
          };
          /** Why a chunk is left out, or null when it is kept. */
          const optional = (chunk) => {
            let why = null;
            for (const m of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
              const r = m.nameForCondition?.();
              const hit = r ? OPTIONAL.find((o) => o.test.test(slashes(r))) : null;
              if (!hit) return null;
              why = hit.why;
            }
            return why;
          };

          const pages = new Set();
          for (const group of compilation.chunkGroups) {
            if (group.isInitial()) for (const f of filesOf(group.chunks)) pages.add(f);
          }

          // Each file goes to the first tool that needs it, so none is
          // counted or fetched twice.
          const tools = new Map();
          const leftOut = new Map();
          const placed = new Set(pages);
          const groups = compilation.chunkGroups
            .filter((g) => !g.isInitial())
            .map((g) => {
              const from = g.origins.map((o) => loader(o.module?.nameForCondition?.(), this.root)).filter(Boolean).sort();
              return { g, name: from.find((f) => f.includes('/') && !f.startsWith('@')) ?? from[0] ?? '(webpack)' };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
          for (const { g, name } of groups) {
            for (const chunk of g.chunks) {
              const why = optional(chunk);
              const into = why ? leftOut : tools;
              const set = into.get(why ?? name) ?? new Set();
              for (const f of filesOf([chunk])) {
                if (placed.has(f)) continue;
                set.add(f);
                if (!why) placed.add(f);
              }
              if (set.size) into.set(why ?? name, set);
            }
          }
          for (const set of leftOut.values()) for (const f of [...set]) if (placed.has(f)) set.delete(f);

          const json = {
            build: this.build,
            pages: [...pages].sort().map(url),
            pageBytes: bytes(pages),
            tools: [...tools]
              .map(([from, files]) => ({ from, bytes: bytes(files), files: [...files].sort().map(url) }))
              .sort((a, b) => a.from.localeCompare(b.from)),
            extras: publicExtras(this.root),
            leftOut: [...leftOut]
              .filter(([, files]) => files.size)
              .map(([why, files]) => ({ why, files: files.size, bytes: bytes(files) })),
          };
          compilation.emitAsset(
            `static/offline/${this.build}.json`,
            new sources.RawSource(JSON.stringify(json)),
          );
        },
      );
    });
  }
}
