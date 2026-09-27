// Captures raw 1080x1920 screenshots from the real game (360x640 CSS px @3x) for the store kit.
// Usage: PUPPETEER=puppeteer-core node store/capture_screens.js <url> <outdir>
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const L = require('../www/js/logic.js');
const URL = (process.argv[2] || 'http://localhost:8779/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'store/raw';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = 'hexcairn.save.v1';
const ALL = ['basalt', 'glacier', 'ember', 'jade', 'aurora'];

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile' });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
  async function load(save, play = true) {
    await page.goto(URL + 'privacy.html', { waitUntil: 'networkidle0' });
    await page.evaluate((k, s) => localStorage.setItem(k, JSON.stringify(s)), KEY, save);
    await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(300);
    if (play) { await page.tap('#btn-play'); await sleep(700); }
  }
  const base = (theme, game, extra) => Object.assign({ level: game ? game.level : 12, coins: 1340, owned: ALL, theme, settings: { sound: false, haptics: false, marks: false }, ad: {}, game }, extra || {});
  // play a level greedily (pure logic, off-page) for n placements
  function played(level, n) {
    const lv = L.generateLevel(level); const g = L.newState(lv); g.awarded = 0;
    for (let i = 0; i < n && !g.won && !g.lost; i++) { const m = L.bestMove(g); if (!m) break; L.place(g, m.slot, m.cell); }
    g.won = false; return g;
  }
  async function hold(slot, cell) {
    const from = await page.evaluate(s => window.__hx.slotPoint(s), slot);
    const to = await page.evaluate((s, c) => window.__hx.dropPointFor(s, c, 'touch'), slot, cell);
    await page.touchscreen.touchStart(from.x, from.y);
    for (let k = 1; k <= 10; k++) { await page.touchscreen.touchMove(from.x + (to.x - from.x) * k / 10, from.y + (to.y - from.y) * k / 10); await sleep(16); }
    await sleep(250);
  }
  const lay3 = L.makeLayout(3), cell = (q, r) => lay3.cells.findIndex(c => c.q === q && c.r === r);

  // 1) mid-game with a drop preview (basalt, level 12)
  {
    const g = played(12, 15); const m = L.bestMove(g);
    await load(base('basalt', g));
    await hold(m.slot, m.cell); await shot('1-preview'); await page.touchscreen.touchEnd(); await sleep(2500);
  }
  // 2) merge in flight + 3) the clear (crafted board, ember)
  {
    const g = played(9, 0); g.target = 400;
    g.stacks = g.stacks.map(() => []); g.blocked = g.blocked.map(() => false);
    const put = (q, r, s) => { g.stacks[cell(q, r)] = s; };
    put(1, 0, [2, 2, 5, 5, 5, 5]); put(0, 1, [0, 5, 5, 5]); put(-1, 0, [3, 3, 1, 1]); put(1, -1, [4, 4, 4, 2, 2, 2]);
    put(-2, 1, [6, 6, 6]); put(2, -2, [1, 1, 1, 1, 1]); put(-1, 2, [0, 0, 3, 3, 3]); put(2, 1, [4, 4]); put(-3, 2, [2]); put(0, -3, [6, 3, 3]);
    g.tray = [[1, 5, 5, 5], [3, 3, 0, 0], [6, 6, 2]]; g.score = 124;
    await load(base('ember', g));
    const from = await page.evaluate(() => window.__hx.slotPoint(0));
    const to = await page.evaluate(c => window.__hx.dropPointFor(0, c, 'touch'), cell(0, 0));
    await page.touchscreen.touchStart(from.x, from.y);
    for (let k = 1; k <= 8; k++) { await page.touchscreen.touchMove(from.x + (to.x - from.x) * k / 8, from.y + (to.y - from.y) * k / 8); await sleep(16); }
    await page.touchscreen.touchEnd();
    await sleep(330); await shot('2-merge');
    await page.waitForFunction(() => window.__hx.game.score > 124, { timeout: 8000 }).catch(() => {});
    await sleep(120); await shot('3-clear');
    await sleep(2500);
  }
  // 4) glacier, level 30 (more colours, blocked cells)
  { const g = played(30, 21); await load(base('glacier', g)); await shot('4-glacier'); }
  // 5) aurora, level 45
  { const g = played(45, 27); await load(base('aurora', g)); await shot('5-aurora'); }
  // 6) jade, level 20
  { const g = played(20, 18); await load(base('jade', g)); await shot('6-jade'); }
  // 7) themes shop
  { await load(base('basalt', played(8, 0), { coins: 640, owned: ['basalt', 'glacier'] }), false); await page.tap('#btn-shop'); await sleep(700); await shot('7-shop'); }
  // 8) home
  { await load(base('basalt', played(12, 0), { level: 12 }), false); await shot('8-home'); }
  // 9) level complete
  {
    const g = played(12, 30); g.target = g.score; g.won = true; g.awarded = 0;
    await load(base('basalt', g)); await sleep(800); await shot('9-win');
  }
  console.log('errors:', errors);
  await browser.close();
})();
