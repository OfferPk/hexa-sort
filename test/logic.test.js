// Unit tests for Hexcairn's pure rules (no DOM). Run: node test/logic.test.js
const assert = require('assert');
const L = require('../www/js/logic.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n   ', e.message); } }
const lay2 = L.makeLayout(2), lay3 = L.makeLayout(3);
const idx = (lay, q, r) => lay.cells.findIndex(c => c.q === q && c.r === r);
const empty = lay => lay.cells.map(() => []);
const C = idx(lay2, 0, 0), E = idx(lay2, 1, 0), W = idx(lay2, -1, 0), NE = idx(lay2, 1, -1), FAR = idx(lay2, 2, 0);

console.log('logic.test.js');
// ---- geometry ----
t('hexagon boards: radius 2 = 19 cells, radius 3 = 37 cells', () => { assert.strictEqual(lay2.size, 19); assert.strictEqual(lay3.size, 37); });
t('centre has 6 neighbours, corners have 3, neighbour relation is symmetric', () => {
  assert.strictEqual(lay2.nbrs[C].length, 6); assert.strictEqual(lay2.nbrs[idx(lay2, 2, -2)].length, 3);
  lay3.nbrs.forEach((ns, i) => ns.forEach(n => assert.ok(lay3.nbrs[n].includes(i))));
});
t('cells are in painter order (row by row)', () => { for (let i = 1; i < lay3.size; i++) assert.ok(lay3.cells[i].r >= lay3.cells[i - 1].r); });

// ---- stack helpers ----
t('top / topRun / runs / isPure', () => {
  assert.strictEqual(L.top([1, 2, 2]), 2); assert.strictEqual(L.top([]), -1);
  assert.strictEqual(L.topRun([1, 2, 2]), 2); assert.strictEqual(L.runs([1, 1, 2, 1]), 3);
  assert.ok(L.isPure([3, 3])); assert.ok(!L.isPure([3, 1])); assert.ok(!L.isPure([]));
});

// ---- merge / chain logic ----
t('no merge when neighbour tops differ', () => {
  const st = empty(lay2); st[C] = [1, 1]; st[E] = [2, 2];
  const r = L.resolve(lay2, st, C);
  assert.deepStrictEqual(r.events, []); assert.deepStrictEqual(st[C], [1, 1]); assert.deepStrictEqual(st[E], [2, 2]);
});
t('top same-color run slides onto the neighbour (whole run, not just one tile)', () => {
  const st = empty(lay2); st[E] = [0, 3]; st[C] = [2, 3, 3];
  const r = L.resolve(lay2, st, C);
  assert.strictEqual(r.events.length, 1); assert.strictEqual(r.events[0].t, 'move');
  // hub rule: E is pure? no ([0,3]); C has more tiles -> tie on matches, C preferred as the placed cell
  const total = st[C].length + st[E].length; assert.strictEqual(total, 5);
  const hub = st[C].length > st[E].length ? st[C] : st[E];
  assert.strictEqual(L.topRun(hub), 3);
});
t('prefers a single-color hub: mixed stack gives its top away and exposes the colour below', () => {
  const st = empty(lay2); st[E] = [4, 4]; st[C] = [1, 4];
  L.resolve(lay2, st, C);
  assert.deepStrictEqual(st[E], [4, 4, 4]); assert.deepStrictEqual(st[C], [1]);
});
t('hub = the stack with most same-colour neighbours; all of them slide onto it', () => {
  const st = empty(lay2); st[W] = [5, 5]; st[E] = [5]; st[NE] = [5, 5, 5]; st[C] = [2, 5];
  const r = L.resolve(lay2, st, C);
  assert.deepStrictEqual(st[C], [2, 5, 5, 5, 5, 5, 5, 5]);
  assert.deepStrictEqual(st[W], []); assert.deepStrictEqual(st[E], []); assert.deepStrictEqual(st[NE], []);
  assert.strictEqual(r.events.filter(e => e.t === 'move').length, 3);
});
t('chain reaction: exposed colour merges with the next neighbour', () => {
  // placed [6, 1] next to [1] (pure hub) -> C exposes 6 -> merges with [6,6] on the west
  const st = empty(lay2); st[E] = [1]; st[W] = [6, 6]; st[C] = [6, 1];
  const r = L.resolve(lay2, st, C);
  assert.deepStrictEqual(st[E], [1, 1]);
  assert.strictEqual(L.topRun(st[W]) + L.topRun(st[C]), 3);
  assert.strictEqual(r.events.filter(e => e.t === 'move').length, 2);
});
t('a single-colour run of 10+ merges and clears, scoring its tiles', () => {
  const st = empty(lay2); st[E] = [3, 3, 3, 3, 3, 3]; st[C] = [2, 3, 3, 3, 3];
  const r = L.resolve(lay2, st, C);
  const cl = r.events.filter(e => e.t === 'clear');
  assert.strictEqual(cl.length, 1); assert.strictEqual(cl[0].n, 10); assert.strictEqual(r.score, 10);
  assert.strictEqual(st[E].length + st[C].length, 1);
});
t('9 tiles do not clear', () => {
  const st = empty(lay2); st[E] = [3, 3, 3, 3, 3]; st[C] = [3, 3, 3, 3];
  const r = L.resolve(lay2, st, C);
  assert.strictEqual(r.score, 0); assert.strictEqual(r.events.filter(e => e.t === 'clear').length, 0);
});
t('chain multiplier: 2nd clear in the same drop scores x2', () => {
  // C: [7 x6, 3 x5] placed; E: [3 x5] -> clear 10 of colour 3 (x1); then C tops 7 x6 meets W [7 x4] -> clear 10 (x2)
  const st = empty(lay2); st[E] = [3, 3, 3, 3, 3]; st[W] = [7, 7, 7, 7];
  st[C] = [7, 7, 7, 7, 7, 7, 3, 3, 3, 3, 3];
  const r = L.resolve(lay2, st, C);
  const cl = r.events.filter(e => e.t === 'clear');
  assert.strictEqual(cl.length, 2); assert.strictEqual(cl[0].chain, 1); assert.strictEqual(cl[1].chain, 2);
  assert.strictEqual(r.score, 10 * 1 + 10 * 2); assert.strictEqual(r.clears, 2);
  assert.ok(st.every(s => s.length === 0), 'board empty after double clear');
});
t('a clear of 12 scores 12', () => {
  const st = empty(lay2); st[E] = [2, 2, 2, 2, 2, 2]; st[C] = [2, 2, 2, 2, 2, 2];
  assert.strictEqual(L.resolve(lay2, st, C).score, 12);
});
t('resolve terminates on crowded random boards and conserves tiles', () => {
  const rng = L.makeRng(99);
  for (let k = 0; k < 300; k++) {
    const st = lay3.cells.map(() => { const n = rng.int(6); const s = []; for (let i = 0; i < n; i++) s.push(rng.int(4)); return s; });
    const before = st.reduce((a, s) => a + s.length, 0);
    const r = L.resolve(lay3, st, rng.int(37));
    const after = st.reduce((a, s) => a + s.length, 0);
    const cleared = r.events.filter(e => e.t === 'clear').reduce((a, e) => a + e.n, 0);
    assert.strictEqual(before, after + cleared);
    st.forEach(s => assert.ok(L.topRun(s) < 10, 'a 10+ run was left standing'));
  }
});

// ---- placement, scoring, loss ----
const lvl = n => L.generateLevel(n);
t('place: only on an empty, unblocked cell; tray slot is consumed', () => {
  const g = L.newState(lvl(1));
  const cell = L.emptyCells(g.stacks, g.blocked)[0];
  const stack = g.tray[0].slice();
  assert.ok(L.place(g, 0, cell));
  assert.deepStrictEqual(g.stacks[cell].length > 0 || g.score > 0, true);
  assert.strictEqual(g.tray[0], null);
  assert.strictEqual(L.place(g, 0, L.emptyCells(g.stacks, g.blocked)[0]), null, 'used slot');
  assert.strictEqual(L.place(g, 1, cell) === null || g.stacks[cell].length === 0, true, 'occupied cell');
  void stack;
});
t('place: blocked cells are rejected', () => {
  const lv = lvl(20); const g = L.newState(lv);
  const b = g.blocked.indexOf(true); assert.ok(b >= 0); assert.strictEqual(L.place(g, 0, b), null);
});
t('tray refills with 3 stacks after the third drop', () => {
  const g = L.newState(lvl(2));
  for (let i = 0; i < 3; i++) L.place(g, i, L.emptyCells(g.stacks, g.blocked)[0]);
  assert.ok(g.tray.every(s => s && s.length >= 2));
});
t('score accumulates and the level is won at the target', () => {
  const g = L.newState(lvl(1)); g.target = 10;
  const E2 = idx(lay2, 1, 0), C2 = idx(lay2, 0, 0);
  g.stacks[E2] = [1, 1, 1, 1, 1, 1]; g.tray[0] = [1, 1, 1, 1];
  const r = L.place(g, 0, C2);
  assert.strictEqual(r.score, 10); assert.strictEqual(g.score, 10); assert.ok(g.won);
});
t('loss: board full -> lost; one empty cell -> not lost', () => {
  const g = L.newState(lvl(1));
  g.stacks = g.stacks.map((s, i) => [i % 7, (i + 3) % 7]);
  assert.ok(L.isLost(g));
  g.stacks[5] = []; assert.ok(!L.isLost(g));
});
t('loss is detected by place() when the last empty cell is filled without a clear', () => {
  const g = L.newState(lvl(1));
  g.stacks = g.stacks.map((s, i) => [i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2, 5]);
  g.stacks[3] = [];
  g.tray = [[6, 7], [6], [7]];
  L.place(g, 0, 3);
  assert.ok(g.lost && !g.won);
});

// ---- boosters ----
t('hammer removes one stack', () => { const g = L.newState(lvl(6)); const i = g.stacks.findIndex(s => s.length); assert.ok(L.hammer(g, i)); assert.strictEqual(g.stacks[i].length, 0); });
t('shuffle replaces only the remaining tray stacks', () => { const g = L.newState(lvl(6)); g.tray[1] = null; L.shuffleTray(g); assert.strictEqual(g.tray[1], null); assert.ok(g.tray[0] && g.tray[2]); });
t('revive clears the messiest stacks and un-loses the level', () => {
  const g = L.newState(lvl(10)); g.stacks = g.stacks.map((s, i) => g.blocked[i] ? [] : [i % 5, (i + 1) % 5, i % 5]); g.lost = true;
  const removed = L.revive(g); assert.ok(removed.length >= 3); assert.ok(!g.lost && g.reviveUsed); assert.ok(!L.isLost(g));
});

// ---- generator ----
t('level params ramp: more colours and blocked cells as levels rise', () => {
  const a = L.levelParams(1), b = L.levelParams(20), c = L.levelParams(60);
  assert.strictEqual(a.colors, 3); assert.ok(b.colors > a.colors && c.colors >= b.colors && c.colors <= 8);
  assert.strictEqual(a.blocked, 0); assert.ok(c.blocked > b.blocked - 1 && c.blocked > 0);
});
t('levels are deterministic (same seed -> same board, tray and target)', () => {
  const a = L.buildLevel(37, 0), b = L.buildLevel(37, 0);
  assert.deepStrictEqual(a.stacks, b.stacks); assert.deepStrictEqual(a.blocked, b.blocked);
  const g1 = L.newState(L.generateLevel(37)), g2 = L.newState(L.generateLevel(37)); assert.deepStrictEqual(g1.tray, g2.tray);
});
t('preset stacks never start with a same-colour neighbour', () => {
  for (let n = 5; n <= 120; n++) {
    const lv = L.generateLevel(n);
    lv.stacks.forEach((s, i) => { if (s.length) lv.layout.nbrs[i].forEach(j => assert.notStrictEqual(L.top(lv.stacks[j]), L.top(s), 'level ' + n)); });
  }
});
t('tray stacks: 2..maxH tiles, colours within the level palette, top run is the largest', () => {
  for (let n = 1; n <= 200; n += 7) {
    const p = L.levelParams(n), rng = L.makeRng(n);
    for (let k = 0; k < 50; k++) {
      const s = L.makeStack(rng, p, null);
      assert.ok(s.length >= 2 && s.length <= p.maxH); assert.ok(s.every(c => c >= 0 && c < p.colors)); assert.ok(L.runs(s) <= p.maxRuns);
    }
  }
});
t('fair tray: when stacks border empty cells, at least one tray stack can merge immediately', () => {
  let checked = 0;
  for (let n = 5; n <= 200; n += 3) {
    const lv = L.generateLevel(n); const g = L.newState(lv); const tops = L.usefulTops(lv.layout, g.stacks, g.blocked);
    if (!tops.length) continue; checked++;
    assert.ok(g.tray.some(s => tops.includes(L.top(s))), 'level ' + n);
    assert.ok(!(L.top(g.tray[0]) === L.top(g.tray[1]) && L.top(g.tray[1]) === L.top(g.tray[2])));
  }
  assert.ok(checked > 20);
});
t('levels 1-500: every level is won by the greedy simulator within its placement budget', () => {
  const t0 = Date.now(); let maxPl = 0;
  for (let n = 1; n <= 500; n++) {
    const lv = L.generateLevel(n);
    assert.ok(lv.target >= 10 && lv.target <= lv.p.baseTarget, 'target range at ' + n);
    const r = L.simulate(lv, lv.p.maxPlacements);
    assert.ok(r.won, `level ${n} not won: ${r.score}/${lv.target} in ${r.placements}`);
    assert.ok(r.placements <= lv.p.maxPlacements);
    maxPl = Math.max(maxPl, r.placements);
  }
  console.log(`    (500 levels simulated in ${Date.now() - t0} ms, max ${maxPl} placements)`);
});
t('targets grow: later levels ask for more than the first ones', () => {
  const avg = (a, b) => { let s = 0; for (let n = a; n <= b; n++) s += L.generateLevel(n).target; return s / (b - a + 1); };
  assert.ok(avg(1, 5) < avg(20, 30)); assert.ok(avg(20, 30) < avg(100, 120));
});
t('coins per level (cosmetic)', () => { assert.strictEqual(L.coinsForLevel(1), 10); assert.strictEqual(L.coinsForLevel(25), 20); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
