import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const dist = '/home/user/decanter/dist';
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.woff2':'font/woff2', '.png':'image/png', '.webmanifest':'application/manifest+json' };

/* slow the fonts only: the page becomes interactive long before `load` fires */
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = join(dist, p);
  if (!existsSync(file) || statSync(file).isDirectory()){ res.writeHead(404); res.end('no'); return; }
  const delay = /\.woff2$/.test(p) ? 6000 : 0;
  if (delay) await new Promise(r => setTimeout(r, delay));
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(8099, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(m.text()));
await page.goto('http://localhost:8099/', { waitUntil: 'domcontentloaded' });

const snap = await page.evaluate(async () => {
  const first = [];
  for (let l = 1; l <= 40; l++) if (Levels.isBubble(l)) first.push(l);
  return {
    readyState: document.readyState,
    started: Deferred.started(),
    readyResolvesNow: await Promise.race([
      Deferred.ready('bubble').then(() => 'resolved'),
      new Promise(r => setTimeout(() => r('still waiting'), 300))
    ]),
    bubbleAppLoaded: typeof BubbleApp !== 'undefined',
    audioIsStub: Audio.ready === false && Audio.boom.toString().includes('=>'),
    bubbleLevels: first
  };
});
console.log(JSON.stringify(snap, null, 2));

/* now actually open a bubble level from the console, the way a medallion tap would */
const before = await page.evaluate(() => App._progress.gold);
await page.evaluate(() => { App._progress.raw.unlocked = 40; });
const res = await page.evaluate(async () => {
  const lvl = [...Array(40).keys()].map(i => i + 1).find(l => Levels.isBubble(l));
  App._progress.raw.stars = {};
  const goldBefore = App._progress.gold;
  /* the same entry point a medallion tap uses */
  const nodes = [...document.querySelectorAll('.mapCanvas *')];
  window.__lvl = lvl;
  App._state.level = 0;
  /* call through the public router the map uses */
  document.body.dataset.view = 'map';
  const ok = window.App && true;
  /* attempt() is private; drive it through the map node if we can find one */
  return { lvl, goldBefore, nodes: nodes.length, ok };
});
console.log(JSON.stringify(res, null, 2));
console.log('console:', logs.slice(0, 10));
await browser.close();
server.close();
