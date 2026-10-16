// Exercise the actual effect with both worker event orders. A first installation
// must not look like an update when WebKit claims the page early.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

let source = fs.readFileSync('components/ServiceWorker.tsx', 'utf8');
if (process.argv.includes('--negative-control')) {
  source = source.replace('const controlledOnLoad = Boolean(navigator.serviceWorker.controller);', 'const controlledOnLoad = true;');
}
const code = transformSync(source, { loader: 'tsx', format: 'cjs' }).code;

async function install(controlled, claimBeforeInstalled) {
  const states = [];
  let updateFound, stateChanged, effect;
  const worker = { state: 'installing', addEventListener: (_, fn) => { stateChanged = fn; } };
  const reg = {
    installing: worker, waiting: null,
    update: async () => {},
    addEventListener: (_, fn) => { updateFound = fn; }, removeEventListener() {},
  };
  const sw = {
    controller: controlled ? {} : null,
    register: async () => reg, addEventListener() {}, removeEventListener() {},
  };
  const module = { exports: {} };
  // The component also asks for the address (to offer each screen's person
  // links to the worker) and tells the worker to keep the app for no signal
  // (lib/offline-ready.ts, 16 October 2026). Neither bears on the install
  // order this checks, so they are quiet stand-ins.
  const updates = { BUILD_ID: 'test', setUpdateState: (s) => states.push(s.state),
    setChecker() {}, setRegistration() {}, isApplying: () => false, applyUpdate() {} };
  const offline = { askWorker() {}, keepPeopleOnScreen() {}, setKept() {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, window: { addEventListener() {}, removeEventListener() {} },
    navigator: { serviceWorker: sw },
    process: { env: { NODE_ENV: 'production' } },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    require: (id) => id === 'react'
      ? { useEffect: (fn) => { effect = fn; } }
      : id === 'next/navigation'
        ? { usePathname: () => '/' }
        : id === '@/lib/offline-ready' ? offline : updates,
  });
  module.exports.ServiceWorker();
  const teardown = effect();
  await Promise.resolve();
  updateFound();
  if (claimBeforeInstalled) sw.controller = {};
  worker.state = 'installed';
  stateChanged();
  teardown();
  return states;
}

assert.ok(!(await install(false, true)).includes('ready'), 'first install with an early claim stays on the page');
assert.ok(!(await install(false, false)).includes('ready'), 'first install with a late claim stays on the page');
assert.ok((await install(true, false)).includes('ready'), 'an existing controlled page still receives a real update');
console.log('OK first-install event order and real updates');
