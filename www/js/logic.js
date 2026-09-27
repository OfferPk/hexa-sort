/*
 * Hexcairn - pure game rules (no DOM). Works in the browser (window.HXLogic) and in Node (module.exports).
 *
 * Board: a hexagon of hex cells (axial coords q,r), radius 2 (19 cells) or 3 (37 cells), some cells blocked.
 * A stack is an array of color indices, bottom -> top. The player drops a tray stack on an EMPTY cell, then
 * resolve() runs the chain reaction:
 *   - the top same-color run of neighbouring stacks slides together onto one "hub" stack
 *     (the stack with the most same-color neighbours, preferring single-color stacks);
 *   - stacks that lost tiles expose new tops and are re-checked (chain reaction);
 *   - a stack whose top single-color run reaches CLEAR (10) tiles merges and clears for points;
 *     the n-th clear of the same drop scores n x tiles (chain multiplier).
 * A level is won when the score reaches the target; it is lost when no empty cell is left.
 * Levels are generated from their number (seeded), and every level's target is set from a greedy
 * simulation of that very level, so each level is verified winnable within MAX placements.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HXLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CLEAR = 10;
  var MAX_COLORS = 8;
  var DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  // ---------- RNG (mulberry32, serializable state) ----------
  function makeRng(seed) {
    var s = seed >>> 0;
    return {
      get s() { return s; }, set s(v) { s = v >>> 0; },
      next: function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      int: function (n) { return Math.floor(this.next() * n); }
    };
  }
  function hashSeed(a, b) {
    var h = (Math.imul(a | 0, 2654435761) ^ Math.imul((b | 0) + 0x9E3779B9, 1597334677)) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13;
    return h >>> 0;
  }

  // ---------- board geometry ----------
  var layoutCache = {};
  function makeLayout(R) {
    if (layoutCache[R]) return layoutCache[R];
    var cells = [], index = {};
    for (var r = -R; r <= R; r++) for (var q = -R; q <= R; q++) {
      if (Math.abs(q + r) > R) continue;
      index[q + ',' + r] = cells.length; cells.push({ q: q, r: r });
    }
    var nbrs = cells.map(function (c) {
      var out = [];
      DIRS.forEach(function (d) { var k = (c.q + d[0]) + ',' + (c.r + d[1]); if (index[k] !== undefined) out.push(index[k]); });
      return out;
    });
    return (layoutCache[R] = { R: R, cells: cells, nbrs: nbrs, size: cells.length });
  }

  // ---------- stack helpers ----------
  function top(s) { return s && s.length ? s[s.length - 1] : -1; }
  function topRun(s) {
    if (!s || !s.length) return 0;
    var c = s[s.length - 1], n = 0;
    for (var i = s.length - 1; i >= 0 && s[i] === c; i--) n++;
    return n;
  }
  function runs(s) { var n = 0; for (var i = 0; i < s.length; i++) if (i === 0 || s[i] !== s[i - 1]) n++; return n; }
  function isPure(s) { return s && s.length > 0 && runs(s) === 1; }
  function cloneStacks(st) { return st.map(function (s) { return s ? s.slice() : s; }); }
  function emptyCells(st, blocked) {
    var out = [];
    for (var i = 0; i < st.length; i++) if (!blocked[i] && st[i].length === 0) out.push(i);
    return out;
  }

  // ---------- the chain reaction ----------
  /**
   * Resolve merges/clears after a change at `start`. Mutates `st`.
   * Returns { events:[{t:'move',from,to,color,n} | {t:'clear',cell,color,n,chain,pts}], score, clears }.
   */
  function resolve(layout, st, start) {
    var ev = [], dirty = [start], score = 0, chain = 0, guard = 0;
    var nb = layout.nbrs;
    function matching(x, col) { return nb[x].filter(function (n) { return top(st[n]) === col; }); }
    while (dirty.length && guard++ < 2000) {
      var c = dirty.shift();
      var s = st[c];
      if (!s || !s.length) continue;
      var col = top(s);
      var m = matching(c, col);
      if (!m.length) {
        var run = topRun(s);
        if (run >= CLEAR) {
          s.splice(s.length - run, run);
          chain++;
          var pts = run * chain;
          score += pts;
          ev.push({ t: 'clear', cell: c, color: col, n: run, chain: chain, pts: pts });
          dirty.push(c);
          nb[c].forEach(function (n) { dirty.push(n); });
        }
        continue;
      }
      // pick the hub: most same-color neighbours, then prefer a single-color stack, then the current cell
      var cands = [c].concat(m), best = c, bestScore = -1;
      cands.forEach(function (x) {
        var sc = matching(x, col).length + (isPure(st[x]) ? 0.5 : 0) + st[x].length * 0.001;
        if (sc > bestScore) { bestScore = sc; best = x; }
      });
      matching(best, col).forEach(function (src) {
        var k = topRun(st[src]);
        var moved = st[src].splice(st[src].length - k, k);
        for (var j = 0; j < moved.length; j++) st[best].push(moved[j]);
        ev.push({ t: 'move', from: src, to: best, color: col, n: k });
        dirty.push(src);
      });
      dirty.unshift(best);
    }
    return { events: ev, score: score, clears: chain };
  }

  // ---------- levels ----------
  function levelParams(n) {
    n = Math.max(1, n | 0);
    var R = n <= 3 ? 2 : 3;
    return {
      level: n,
      R: R,
      colors: Math.min(MAX_COLORS, 3 + Math.floor((n - 1) / 6)),
      blocked: R === 2 ? 0 : Math.min(9, Math.floor((n - 2) / 4)),
      preset: n < 5 ? 0 : Math.min(6, 1 + Math.floor((n - 5) / 6)),
      maxH: Math.min(7, 4 + Math.floor(n / 12)),
      maxRuns: Math.min(3, 1 + Math.floor((n + 2) / 5)),
      baseTarget: n <= 3 ? 20 + 10 * n : Math.min(300, 45 + 8 * n),
      maxPlacements: Math.min(70, 24 + 2 * n)
    };
  }

  /** Generate a tray stack. `tops` = board top colors next to an empty cell (for the fairness bias). */
  function makeStack(rng, p, tops) {
    var h = 2 + rng.int(p.maxH - 1);
    var nr = 1 + rng.int(Math.min(p.maxRuns, h));
    var cols = [];
    var topCol = (tops && tops.length && rng.next() < 0.55) ? tops[rng.int(tops.length)] : rng.int(p.colors);
    cols.push(topCol);
    while (cols.length < nr) {
      var c = rng.int(p.colors);
      if (c !== cols[cols.length - 1]) cols.push(c);
    }
    // split h into nr parts (each >= 1); the top run gets the biggest share
    var parts = [], left = h;
    for (var i = 0; i < nr; i++) {
      var remain = nr - i - 1;
      var k = i === nr - 1 ? left : 1 + rng.int(Math.max(1, left - remain));
      parts.push(k); left -= k;
    }
    parts.sort(function (a, b) { return a - b; });
    var s = [];
    for (var j = nr - 1; j >= 0; j--) for (var t = 0; t < parts[nr - 1 - j]; t++) s.push(cols[j]);
    return s; // bottom ... top (top color = cols[0], largest run)
  }
  function usefulTops(layout, st, blocked) {
    var set = {};
    for (var i = 0; i < st.length; i++) {
      if (blocked[i] || st[i].length) continue;
      layout.nbrs[i].forEach(function (n) { if (st[n].length) set[top(st[n])] = 1; });
    }
    return Object.keys(set).map(Number);
  }
  /** Fair tray: 3 stacks; when the board has stacks next to empty cells, at least one tray stack
   *  can merge right away, and the 3 top colors are never all identical. */
  function dealTray(rng, p, layout, st, blocked) {
    var tops = usefulTops(layout, st, blocked);
    var tray;
    for (var a = 0; a < 12; a++) {
      tray = [makeStack(rng, p, tops), makeStack(rng, p, tops), makeStack(rng, p, tops)];
      var t = tray.map(top);
      var helpful = !tops.length || t.some(function (c) { return tops.indexOf(c) >= 0; });
      var varied = !(t[0] === t[1] && t[1] === t[2]);
      if (helpful && varied) break;
    }
    return tray;
  }

  /** Initial board for a level (without target). Deterministic from (level, variant). */
  function buildLevel(n, variant) {
    var p = levelParams(n);
    var layout = makeLayout(p.R);
    var rng = makeRng(hashSeed(n, variant || 0));
    var st = layout.cells.map(function () { return []; });
    var blocked = layout.cells.map(function () { return false; });
    // blocked cells: never the centre, never two blocked neighbours in a row of 3+ (keeps the board open)
    var tries = 0, placed = 0;
    while (placed < p.blocked && tries++ < 500) {
      var i = rng.int(layout.size);
      if (i === (layout.size - 1) / 2 || blocked[i]) continue;
      var bn = layout.nbrs[i].filter(function (x) { return blocked[x]; }).length;
      if (bn > 1) continue;
      blocked[i] = true; placed++;
    }
    // preset stacks with no same-color neighbours (so nothing merges before the first move)
    tries = 0; placed = 0;
    while (placed < p.preset && tries++ < 500) {
      var j = rng.int(layout.size);
      if (blocked[j] || st[j].length) continue;
      var s = makeStack(rng, { colors: p.colors, maxH: Math.min(6, p.maxH), maxRuns: Math.min(3, p.maxRuns + 1) }, null);
      var clash = layout.nbrs[j].some(function (x) { return top(st[x]) === top(s); });
      if (clash) continue;
      st[j] = s; placed++;
    }
    return { p: p, layout: layout, stacks: st, blocked: blocked, rngState: rng.s };
  }

  // ---------- state ----------
  function newState(lv) {
    var g = {
      level: lv.p.level, R: lv.p.R, stacks: cloneStacks(lv.stacks), blocked: lv.blocked.slice(),
      tray: [null, null, null], score: 0, target: lv.target, placements: 0,
      reviveUsed: false, shuffleUsed: false, hammers: 0, won: false, lost: false, rng: lv.rngState
    };
    var rng = makeRng(g.rng);
    g.tray = dealTray(rng, lv.p, lv.layout, g.stacks, g.blocked);
    g.rng = rng.s;
    return g;
  }
  function trayEmpty(g) { return g.tray.every(function (x) { return !x; }); }
  function isLost(g) { return emptyCells(g.stacks, g.blocked).length === 0; }

  /** Place tray slot `slot` on `cell`. Mutates g. Returns the resolve result or null if illegal. */
  function place(g, slot, cell) {
    var layout = makeLayout(g.R), p = levelParams(g.level);
    if (g.won || g.lost || !g.tray[slot] || g.blocked[cell] || g.stacks[cell].length) return null;
    g.stacks[cell] = g.tray[slot].slice();
    g.tray[slot] = null;
    g.placements++;
    var res = resolve(layout, g.stacks, cell);
    g.score += res.score;
    if (g.score >= g.target) g.won = true;
    if (trayEmpty(g)) {
      var rng = makeRng(g.rng);
      g.tray = dealTray(rng, p, layout, g.stacks, g.blocked);
      g.rng = rng.s;
      g.shuffleUsed = false;
      res.dealt = true;
    }
    if (!g.won && isLost(g)) g.lost = true;
    return res;
  }

  // ---------- boosters ----------
  function hammer(g, cell) {
    if (!g.stacks[cell] || !g.stacks[cell].length) return false;
    g.stacks[cell] = []; g.hammers++;
    if (g.lost && !isLost(g)) g.lost = false;
    return true;
  }
  function shuffleTray(g) {
    var layout = makeLayout(g.R), p = levelParams(g.level), rng = makeRng(g.rng);
    var fresh = dealTray(rng, p, layout, g.stacks, g.blocked);
    g.tray = g.tray.map(function (s, i) { return s ? fresh[i] : null; });
    g.rng = rng.s;
  }
  /** Revive: remove the messiest ~35% of stacks (most color runs, then tallest). Returns removed cells. */
  function revive(g) {
    var occ = [];
    g.stacks.forEach(function (s, i) { if (s.length) occ.push(i); });
    occ.sort(function (a, b) { return (runs(g.stacks[b]) - runs(g.stacks[a])) || (g.stacks[b].length - g.stacks[a].length) || (a - b); });
    var k = Math.max(3, Math.ceil(occ.length * 0.35));
    var removed = occ.slice(0, k);
    removed.forEach(function (i) { g.stacks[i] = []; });
    g.reviveUsed = true; g.lost = false;
    return removed;
  }

  // ---------- simulator (greedy player) ----------
  function evaluate(layout, st, blocked, gained) {
    var empties = 0, runScore = 0, clash = 0;
    for (var i = 0; i < st.length; i++) {
      if (blocked[i]) continue;
      var s = st[i];
      if (!s.length) { empties++; continue; }
      var tr = topRun(s);
      runScore += tr * tr;
      runScore -= (runs(s) - 1) * 3;
      var t = top(s);
      layout.nbrs[i].forEach(function (n) { if (st[n].length && top(st[n]) !== t) clash++; });
    }
    return gained * 60 + empties * 6 + runScore * 0.4 - clash * 0.3;
  }
  function bestMove(g) {
    var layout = makeLayout(g.R), empt = emptyCells(g.stacks, g.blocked), best = null;
    for (var slot = 0; slot < 3; slot++) {
      if (!g.tray[slot]) continue;
      for (var k = 0; k < empt.length; k++) {
        var st = cloneStacks(g.stacks);
        st[empt[k]] = g.tray[slot].slice();
        var res = resolve(layout, st, empt[k]);
        var v = evaluate(layout, st, g.blocked, res.score);
        if (!best || v > best.v) best = { slot: slot, cell: empt[k], v: v };
      }
    }
    return best;
  }
  /** Play a level greedily. Returns {won, placements, score}. `target` overrides the state's target. */
  function simulate(lv, maxPlacements, target) {
    var g = newState(lv);
    g.target = target != null ? target : lv.target;
    var scoreAt = [];
    while (!g.won && !g.lost && g.placements < maxPlacements) {
      var m = bestMove(g);
      if (!m) break;
      place(g, m.slot, m.cell);
      scoreAt.push(g.score);
    }
    return { won: g.won, lost: g.lost, placements: g.placements, score: g.score, scoreAt: scoreAt };
  }

  /**
   * Full level: board + target. The target is min(baseTarget, 85% of what the greedy simulator scores
   * within maxPlacements on this exact level), rounded down to 5. If the board turns out too harsh
   * (target < 60% of base), another seed variant is tried.
   */
  var levelCache = {};
  function generateLevel(n) {
    if (levelCache[n]) return levelCache[n];
    var p = levelParams(n), best = null;
    for (var variant = 0; variant < 6; variant++) {
      var lv = buildLevel(n, variant);
      lv.target = 1e9;
      var sim = simulate(lv, p.maxPlacements, 1e9);
      var t = Math.min(p.baseTarget, Math.floor(sim.score * 0.85 / 5) * 5);
      lv.target = Math.max(10, t);
      lv.variant = variant;
      if (!best || lv.target > best.target) best = lv;
      if (t >= p.baseTarget * 0.6) break;
    }
    levelCache[n] = best;
    return best;
  }
  function coinsForLevel(n) { return 10 + 2 * Math.floor(n / 5); }

  return {
    CLEAR: CLEAR, MAX_COLORS: MAX_COLORS, makeRng: makeRng, hashSeed: hashSeed, makeLayout: makeLayout,
    top: top, topRun: topRun, runs: runs, isPure: isPure, cloneStacks: cloneStacks, emptyCells: emptyCells,
    resolve: resolve, levelParams: levelParams, makeStack: makeStack, dealTray: dealTray, usefulTops: usefulTops,
    buildLevel: buildLevel, generateLevel: generateLevel, newState: newState, place: place, isLost: isLost,
    trayEmpty: trayEmpty, hammer: hammer, shuffleTray: shuffleTray, revive: revive, simulate: simulate,
    bestMove: bestMove, coinsForLevel: coinsForLevel
  };
});
