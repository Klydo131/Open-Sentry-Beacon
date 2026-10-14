// Leaving a screen must cancel its pending online probe.
const assert = require('node:assert/strict');
const { browser, launchOptions } = require('./_playwright');
const { build } = require('esbuild');
const path = require('node:path');
const BASE = `http://localhost:${process.argv[2] || '4001'}`;

(async () => {
  const compiled = await build({
    absWorkingDir: path.resolve(__dirname, '../..'),
    stdin: { contents: `
      import { createElement } from 'react';
      import { createRoot } from 'react-dom/client';
      import { useOnline } from './lib/online';
      function Check() { useOnline(); return null; }
      const root = createRoot(document.body.appendChild(document.createElement('div')));
      root.render(createElement(Check));
      window.unmountProbe = () => root.unmount();
    `, resolveDir: path.resolve(__dirname, '../..') },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const b = await browser.launch(launchOptions);
  try {
    const page = await b.newPage();
    await page.goto(`${BASE}/privacy`);
    await page.evaluate(() => {
      const fetch = window.fetch;
      window.fetch = (url, options) => {
        if (!String(url).startsWith('/icons/icon.svg?ping=') || options?.method !== 'HEAD') {
          return fetch(url, options);
        }
        return new Promise((resolve, reject) => {
          window.pendingProbe = { signalled: !!options.signal, aborted: false };
          options.signal?.addEventListener('abort', () => {
            window.pendingProbe.aborted = true;
            reject(new DOMException('Cancelled', 'AbortError'));
          }, { once: true });
        });
      };
    });
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await page.waitForFunction(() => window.pendingProbe);
    const result = await page.evaluate(() => { window.unmountProbe(); return window.pendingProbe; });
    assert.deepEqual(result, { signalled: true, aborted: true });
    console.log('OK  leaving the screen aborts its pending HEAD probe');
  } finally { await b.close(); }
})().catch(error => { console.error(error); process.exit(1); });