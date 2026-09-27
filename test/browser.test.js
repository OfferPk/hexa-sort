// Headless Chrome phone-size play test for Hexcairn (run against the live site in CI docs / release checks).
// Drags stacks with real touch (and mouse) events and checks: placement, merge + clear + scoring, level win,
// next level, board-full loss, revive, hammer, shuffle, invalid drop, reload persistence, no console errors.
// Usage: PUPPETEER=puppeteer-core node test/browser.test.js <url> [outdir]   (Chrome at /usr/bin/google-chrome or CHROME=...)
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const L = require('../www/js/logic.js');
const URL = (process.argv[2] || 'http://localhost:8779/').replace(/\/?$/, '/');
const OUT = process.argv[3] || '/tmp';
const KEY = 'hexcairn.save.v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok -', m); };
const lay2 = L.makeLayout(2);
const cellOf = (q, r) => lay2.cells.findIndex(c => c.q === q && c.r === r);
const C = cellOf(0, 0), E = cellOf(1, 0);

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Mobile Safari/537.36' });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  const game = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__hx.game)));
  const idle = () => page.waitForFunction(() => !window.__hx.busy, { timeout: 15000 });
  const visible = sel => page.$eval(sel, e => !e.classList.contains('hidden'));
  async function dragTouch(slot, cell) {
    const from = await page.evaluate(s => window.__hx.slotPoint(s), slot);
    const to = await page.evaluate((s, c) => window.__hx.dropPointFor(s, c, 'touch'), slot, cell);
    await page.touchscreen.touchStart(from.x, from.y);
    for (let k = 1; k <= 8; k++) { await page.touchscreen.touchMove(from.x + (to.x - from.x) * k / 8, from.y + (to.y - from.y) * k / 8); await sleep(16); }
    await page.touchscreen.touchEnd();
    await sleep(150); await idle();
  }
  async function dragMouse(slot, cell) {
    const from = await page.evaluate(s => window.__hx.slotPoint(s), slot);
    const to = await page.evaluate((s, c) => window.__hx.dropPointFor(s, c, 'mouse'), slot, cell);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
    await sleep(150); await idle();
  }
  async function inject(g, extra) {
    await page.goto(URL + 'privacy.html', { waitUntil: 'networkidle0' });
    await page.evaluate((k, g, extra) => {
      const s = Object.assign({ level: g.level, coins: 0, owned: ['basalt'], theme: 'basalt', settings: { sound: false, haptics: true, marks: false }, ad: {}, game: g }, extra || {});
      localStorage.setItem(k, JSON.stringify(s));
    }, KEY, g, extra);
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(200);
    await page.tap('#btn-play'); await sleep(600);
  }
  const level1 = () => { const g = L.newState(L.generateLevel(1)); g.awarded = 0; return g; };

  console.log('Testing', URL);
  // ---- fresh start ----
  await page.goto(URL + 'privacy.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(300);
  assert(await visible('#home'), 'home screen on launch');
  assert((await page.$eval('#play-sub', e => e.textContent)) === 'Level 1', 'home shows Level 1');
  await page.screenshot({ path: `${OUT}/hx-home.png` });
  await page.tap('#btn-play'); await sleep(600);
  assert(await visible('#game'), 'game screen opens');
  let g = await game();
  assert(g.level === 1 && g.stacks.length === 19 && g.tray.every(s => s && s.length >= 2), 'level 1: 19-cell hex board and 3 tray stacks');

  // ---- place by touch, then by mouse ----
  {
    const cell = L.emptyCells(g.stacks, g.blocked)[0];
    await dragTouch(0, cell);
    const a = await game();
    assert(a.placements === 1 && a.tray[0] === null && a.stacks.some(s => s.length), `stack dropped by touch drag on cell ${cell}`);
    const cell2 = L.emptyCells(a.stacks, a.blocked).slice(-1)[0];
    await dragMouse(1, cell2);
    const b = await game();
    assert(b.placements === 2 && b.tray[1] === null, `stack dropped by mouse drag on cell ${cell2}`);
  }
  // ---- invalid drop returns the stack ----
  {
    const before = await game();
    const from = await page.evaluate(() => window.__hx.slotPoint(2));
    await page.touchscreen.touchStart(from.x, from.y); await page.touchscreen.touchMove(from.x, from.y - 4); await page.touchscreen.touchEnd();
    await sleep(300); await idle();
    const after = await game();
    assert(after.placements === before.placements && JSON.stringify(after.tray) === JSON.stringify(before.tray), 'dropping outside the board returns the stack to the tray');
  }
  // ---- shuffle (rewarded; granted immediately on web) ----
  {
    const before = await game();
    await page.tap('#btn-shuffle'); await sleep(500);
    const after = await game();
    assert(after.shuffleUsed && after.tray[2] && JSON.stringify(after.tray) !== JSON.stringify(before.tray), 'shuffle dealt new tray stacks');
    assert(await page.$eval('#btn-shuffle', e => e.disabled), 'shuffle disabled until the next tray');
  }
  // ---- reload persistence ----
  {
    const before = await game();
    await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
    await page.tap('#btn-play'); await sleep(500);
    const after = await game();
    assert(JSON.stringify(after.stacks) === JSON.stringify(before.stacks) && JSON.stringify(after.tray) === JSON.stringify(before.tray) && after.score === before.score && after.placements === before.placements,
      'board, tray, score and drops restored after reload');
  }

  // ---- merge + clear + scoring ----
  {
    const st = level1(); st.target = 999;
    st.stacks = st.stacks.map(() => []); st.stacks[E] = [2, 1, 1, 1, 1, 1, 1]; st.stacks[cellOf(-2, 2)] = [0];
    st.tray = [[3, 1, 1, 1, 1], [0, 0], [2, 2]];
    await inject(st);
    await dragTouch(0, C);
    const a = await game();
    assert(a.score === 10, 'six + four matching tiles slid together, merged 10 and cleared: +10 (score ' + a.score + ')');
    assert(a.stacks[E].join() === '2' || a.stacks[C].join() === '3', 'the colours under the cleared run are exposed');
    await page.screenshot({ path: `${OUT}/hx-merged.png` });
    assert((await page.$eval('#prog-txt', e => e.textContent)).startsWith('10 /'), 'progress bar shows the score');
  }
  // ---- chain: two clears in one drop (x2 on the second) ----
  {
    const st = level1(); st.target = 999;
    const W = cellOf(-1, 0);
    st.stacks = st.stacks.map(() => []); st.stacks[E] = [3, 3, 3, 3, 3]; st.stacks[W] = [4, 4, 4, 4]; st.stacks[cellOf(2, -2)] = [0];
    st.tray = [[4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3], [0, 1], [1, 2]];
    await inject(st);
    await dragTouch(0, C);
    const a = await game();
    assert(a.score === 30, 'chain reaction: 10 (x1) + 10 (x2) = 30 (score ' + a.score + ')');
  }
  // ---- win -> coins -> next level ----
  {
    const st = level1(); st.target = 10;
    st.stacks = st.stacks.map(() => []); st.stacks[E] = [1, 1, 1, 1, 1, 1];
    st.tray = [[1, 1, 1, 1], [0, 2], [2, 0]];
    await inject(st);
    await dragTouch(0, C); await sleep(700);
    assert(await visible('#win'), 'reaching the target shows Level complete');
    const coins = await page.evaluate(() => window.__hx.save.coins);
    assert(coins === 10, 'cosmetic coins awarded (+10)');
    await page.screenshot({ path: `${OUT}/hx-win.png` });
    await page.tap('#btn-next'); await sleep(900);
    const a = await game();
    const mc = await page.evaluate(() => window.__hx.gate.state.maxCompleted);
    assert(a.level === 2 && a.score === 0 && !(await visible('#win')) && mc === 1, 'Next opens level 2; ad gate counted 1 completed level');
    assert(await page.evaluate(() => window.__hx.gate.canShow(Date.now())) === false, 'no interstitial allowed before level 5 + 3 min');
  }
  // ---- loss -> revive ----
  {
    const st = level1(); st.target = 999;
    st.stacks = st.stacks.map((s, i) => [i % 3, 3 + (i % 4)]);
    const last = cellOf(2, -2); st.stacks[last] = [];
    st.tray = [[7, 7], [0, 1], [1, 0]];
    await inject(st);
    await dragTouch(0, last); await sleep(700);
    const a = await game();
    assert(a.lost && await visible('#lose'), 'board full: loss detected and shown');
    await page.screenshot({ path: `${OUT}/hx-lose.png` });
    await page.tap('#btn-revive'); await sleep(600);
    const b = await game();
    assert(!b.lost && b.reviveUsed && !(await visible('#lose')) && L.emptyCells(b.stacks, b.blocked).length >= 3, 'revive cleared stacks and resumed play');
  }
  // ---- hammer ----
  {
    const before = await game();
    const target = before.stacks.findIndex(s => s.length);
    await page.tap('#btn-hammer'); await sleep(200);
    const pt = await page.evaluate(c => window.__hx.cellPoint(c), target);
    await page.touchscreen.tap(pt.x, pt.y); await sleep(600);
    const after = await game();
    assert(after.stacks[target].length === 0 && after.hammers === 1, 'hammer smashed the tapped stack');
  }

  await sleep(300);
  assert(errors.length === 0, 'no console errors / failed requests' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('BROWSER TEST PASSED');
})().catch(e => { console.error('BROWSER TEST FAILED:', e.message); process.exit(1); });
