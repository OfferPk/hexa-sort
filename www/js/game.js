/* Hexcairn - UI, canvas renderer (2.5D hex prisms), drag & drop, animations, persistence. Rules live in logic.js. */
(function () {
  'use strict';
  var L = window.HXLogic, SFX = window.SFX, THEMES = window.THEMES;
  var $ = function (id) { return document.getElementById(id); };
  var SAVE_KEY = 'hexcairn.save.v1';
  var native = window.Ads && window.Ads.isNative();
  document.body.classList.add(native ? 'native' : 'web');
  var SQ3 = Math.sqrt(3), TILT = 0.78;

  // ---------------- persistence ----------------
  function defaults() {
    return { level: 1, coins: 0, owned: ['basalt'], theme: 'basalt', settings: { sound: true, haptics: true, marks: false }, game: null, ad: {} };
  }
  function load() {
    var d = defaults();
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && typeof s === 'object') {
        Object.keys(d).forEach(function (k) { if (s[k] !== undefined) d[k] = s[k]; });
        d.settings = Object.assign(defaults().settings, s.settings || {});
      }
    } catch (e) {}
    return d;
  }
  var save = load();
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
  var gate = window.AdGate.create(window.ADS_CONFIG, save.ad);
  save.ad = gate.state;

  // ---------------- state ----------------
  var G = null;           // running level state (save.game)
  var busy = false;       // animating a drop
  var disp = null;        // display stacks while animating (null -> G.stacks)
  var flyers = [];        // tiles in flight {c, x, y, s, a, sq}
  var particles = [];
  var popups = [];
  var drag = null;        // {slot, x, y, id, type, target}
  var hammerMode = false;
  var hiddenSlots = {};   // tray slots hidden during the deal animation
  var trayAnim = null;    // {t0}
  var smashFx = null;
  function theme() { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === save.theme) return THEMES[i]; return THEMES[0]; }

  function validGame(g) {
    return g && Array.isArray(g.stacks) && Array.isArray(g.blocked) && Array.isArray(g.tray) && g.tray.length === 3 &&
      (g.R === 2 || g.R === 3) && g.stacks.length === L.makeLayout(g.R).size && typeof g.target === 'number';
  }
  function startLevel(n) {
    var lv = L.generateLevel(n);
    var g = L.newState(lv);
    g.awarded = 0;
    return g;
  }

  // ---------------- helpers ----------------
  function haptic(kind) {
    if (!save.settings.haptics || !native) return;
    var H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (!H) return;
    try {
      if (kind === 'success') H.notification({ type: 'SUCCESS' });
      else if (kind === 'error') H.notification({ type: 'WARNING' });
      else H.impact({ style: kind === 'medium' ? 'MEDIUM' : kind === 'heavy' ? 'HEAVY' : 'LIGHT' });
    } catch (e) {}
  }
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 2200);
  }
  function setCoins() { Array.prototype.forEach.call(document.querySelectorAll('.coins-val'), function (e) { e.textContent = save.coins; }); }
  function applyTheme() {
    var cl = document.body.classList;
    Array.prototype.slice.call(cl).forEach(function (c) { if (/^theme-/.test(c)) cl.remove(c); });
    cl.add('theme-' + save.theme);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', theme().plate[1]);
    shadeCache = {};
    requestRender();
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0 ? 0 : t > 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // colour utils
  var shadeCache = {};
  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(h, f) {
    var k = h + f; if (shadeCache[k]) return shadeCache[k];
    var c = hexToRgb(h).map(function (v) { return Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)); });
    return (shadeCache[k] = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')');
  }

  // ---------------- canvas + layout ----------------
  var cv = $('cv'), ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  var S = 28, T = 7, CX = 0, CY = 0, trayY = 0, trayS = 24, trayT = 6, boardBottom = 0;
  function layout() {
    var r = cv.getBoundingClientRect();
    DPR = Math.min(3, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    var R = G ? G.R : 3;
    var trayH = Math.min(150, Math.max(110, H * 0.24));
    var boardH = H - trayH;
    var sW = (W * 0.95) / ((2 * R + 1) * SQ3);
    var sH = boardH / (3 * R * TILT + 2 * TILT + 2.6);
    S = Math.max(14, Math.min(sW, sH, 46));
    T = S * 0.24;
    var halfH = R * 1.5 * TILT * S + S * TILT;
    var topRoom = 2.4 * S, botRoom = T + 6;
    var span = topRoom + 2 * halfH + botRoom;
    CX = W / 2;
    CY = Math.max(topRoom + halfH, (boardH - span) / 2 + topRoom + halfH);
    boardBottom = CY + halfH + botRoom;
    trayS = Math.min(S * 0.92, 30);
    trayT = trayS * 0.24;
    trayY = Math.min(H - 16, boardBottom + (H - boardBottom) * 0.62);
    requestRender();
  }
  function cellXY(i) {
    var c = L.makeLayout(G.R).cells[i];
    return { x: CX + S * SQ3 * (c.q + c.r / 2), y: CY + S * 1.5 * c.r * TILT };
  }
  function slotXY(i) { return { x: W * (i + 0.5) / 3, y: trayY }; }

  // ---------------- drawing primitives ----------------
  function hexPath(c, x, y, s) {
    c.beginPath();
    for (var k = 0; k < 6; k++) {
      var a = Math.PI / 180 * (60 * k + 30);
      var px = x + s * Math.cos(a), py = y + s * Math.sin(a) * TILT;
      if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }
  /** One hex prism tile. (x,y) = centre of its TOP face. */
  function drawTile(c, x, y, s, t, col, opts) {
    opts = opts || {};
    var th = theme();
    var hx = s * SQ3 / 2, hy = s * TILT;
    // side band (two visible faces)
    c.beginPath();
    c.moveTo(x - hx, y + hy / 2); c.lineTo(x, y + hy); c.lineTo(x, y + hy + t); c.lineTo(x - hx, y + hy / 2 + t); c.closePath();
    c.fillStyle = shade(col, -0.42); c.fill();
    c.beginPath();
    c.moveTo(x, y + hy); c.lineTo(x + hx, y + hy / 2); c.lineTo(x + hx, y + hy / 2 + t); c.lineTo(x, y + hy + t); c.closePath();
    c.fillStyle = shade(col, -0.28); c.fill();
    // separation line at the bottom of the band
    c.beginPath(); c.moveTo(x - hx, y + hy / 2 + t); c.lineTo(x, y + hy + t); c.lineTo(x + hx, y + hy / 2 + t);
    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1; c.stroke();
    // top face
    hexPath(c, x, y, s);
    var g = c.createLinearGradient(x - hx, y - hy, x + hx * 0.6, y + hy);
    g.addColorStop(0, shade(col, 0.28 * th.gloss + 0.05)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.12));
    c.fillStyle = g; c.fill();
    if (opts.top !== false) {
      // bevel highlight + inner facet
      hexPath(c, x, y, s * 0.99); c.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.3 * th.gloss) + ')'; c.lineWidth = Math.max(1, s * 0.05); c.stroke();
      hexPath(c, x, y - s * 0.02, s * 0.56);
      c.fillStyle = 'rgba(255,255,255,' + (0.08 + 0.12 * th.gloss) + ')'; c.fill();
      if (opts.mark && save.settings.marks) drawMark(c, x, y, s, opts.ci);
    }
  }
  function drawMark(c, x, y, s, ci) {
    var r = s * 0.28;
    c.save(); c.translate(x, y); c.scale(1, TILT);
    c.fillStyle = 'rgba(0,0,0,.42)'; c.strokeStyle = 'rgba(0,0,0,.42)'; c.lineWidth = s * 0.09;
    c.beginPath();
    switch (ci % 8) {
      case 0: c.arc(0, 0, r * 0.7, 0, Math.PI * 2); c.fill(); break;
      case 1: c.rect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2); c.fill(); break;
      case 2: c.moveTo(0, -r * 0.8); c.lineTo(r * 0.75, r * 0.6); c.lineTo(-r * 0.75, r * 0.6); c.closePath(); c.fill(); break;
      case 3: c.moveTo(-r * 0.7, 0); c.lineTo(r * 0.7, 0); c.moveTo(0, -r * 0.7); c.lineTo(0, r * 0.7); c.stroke(); break;
      case 4: c.moveTo(0, -r * 0.8); c.lineTo(r * 0.7, 0); c.lineTo(0, r * 0.8); c.lineTo(-r * 0.7, 0); c.closePath(); c.fill(); break;
      case 5: c.arc(0, 0, r * 0.62, 0, Math.PI * 2); c.stroke(); break;
      case 6: c.moveTo(-r * 0.6, -r * 0.6); c.lineTo(r * 0.6, r * 0.6); c.moveTo(r * 0.6, -r * 0.6); c.lineTo(-r * 0.6, r * 0.6); c.stroke(); break;
      default: c.moveTo(-r * 0.7, r * 0.4); c.lineTo(0, -r * 0.5); c.lineTo(r * 0.7, r * 0.4); c.stroke();
    }
    c.restore();
  }
  function drawShadow(c, x, y, s, h) {
    var g = c.createRadialGradient(x + s * 0.18, y + s * 0.3, s * 0.2, x + s * 0.18, y + s * 0.3, s * (1.05 + h * 0.02));
    g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(x + s * 0.18, y + s * 0.3, s * 1.15, s * 0.8, 0, 0, Math.PI * 2); c.fill();
  }
  /** A whole stack standing with its base (slot centre) at (x,y). */
  function drawStack(c, x, y, s, t, stack, opts) {
    opts = opts || {};
    if (!stack || !stack.length) return;
    var th = theme(), tiles = th.tiles;
    if (opts.shadow !== false) drawShadow(c, x, y, s, stack.length);
    var ts = s * 0.9;
    var n = stack.length - (opts.skipTop || 0);
    for (var k = 0; k < n; k++) {
      var ty = y - (k + 1) * t;
      var isTop = k === n - 1;
      drawTile(c, x, ty, ts, t, tiles[stack[k] % tiles.length], { top: isTop || stack[k] !== stack[k + 1] ? true : false, mark: isTop, ci: stack[k] });
    }
    if (opts.count && n > 0) {
      var ty2 = y - n * t;
      var run = L.topRun(stack.slice(0, n));
      if (run >= 3) {
        c.font = '800 ' + Math.round(s * 0.5) + 'px Roboto, system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = Math.max(2, s * 0.1); c.strokeStyle = 'rgba(0,0,0,.45)';
        c.strokeText(run, x, ty2 + 1); c.fillStyle = '#fff'; c.fillText(run, x, ty2 + 1);
      }
    }
  }
  function drawSlot(c, x, y, s, highlight) {
    var th = theme();
    hexPath(c, x, y, s * 0.94);
    c.fillStyle = highlight ? shade(th.slot, 0.25) : th.slot; c.fill();
    c.strokeStyle = highlight ? th.rim : th.slotEdge; c.lineWidth = highlight ? 2 : 1.2; c.stroke();
    hexPath(c, x, y + s * 0.05, s * 0.7);
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fill();
  }
  function drawBlocked(c, x, y, s) {
    var th = theme(), t2 = S * 0.36;
    drawShadow(c, x, y, s, 2);
    var hx = s * 0.88 * SQ3 / 2, hy = s * 0.88 * TILT, ty = y - t2;
    c.beginPath(); c.moveTo(x - hx, ty + hy / 2); c.lineTo(x, ty + hy); c.lineTo(x + hx, ty + hy / 2);
    c.lineTo(x + hx, ty + hy / 2 + t2); c.lineTo(x, ty + hy + t2); c.lineTo(x - hx, ty + hy / 2 + t2); c.closePath();
    c.fillStyle = th.stone[1]; c.fill();
    hexPath(c, x, ty, s * 0.88);
    var g = c.createLinearGradient(x, ty - hy, x, ty + hy); g.addColorStop(0, th.stone[0]); g.addColorStop(1, th.stone[1]);
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; c.stroke();
    // carved cairn mark
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = Math.max(1.5, s * 0.07);
    c.beginPath(); c.moveTo(x - s * 0.28, ty - s * 0.1); c.lineTo(x + s * 0.05, ty + s * 0.02); c.lineTo(x - s * 0.08, ty + s * 0.2); c.moveTo(x + s * 0.05, ty + s * 0.02); c.lineTo(x + s * 0.3, ty - s * 0.12); c.stroke();
  }
  function drawPlate(c) {
    var th = theme(), lay = L.makeLayout(G.R);
    // plate = union of slightly larger hexes, drawn as an outline stroke + fill
    c.save();
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 24; c.shadowOffsetY = 10;
    c.fillStyle = th.plate[1];
    lay.cells.forEach(function (_, i) { var p = cellXY(i); hexPath(c, p.x, p.y + T * 0.8, S * 1.16); c.fill(); });
    c.restore();
    c.fillStyle = th.rim;
    lay.cells.forEach(function (_, i) { var p = cellXY(i); hexPath(c, p.x, p.y + T * 0.8, S * 1.13); c.fill(); });
    var g = c.createLinearGradient(0, CY - S * 5, 0, CY + S * 5);
    g.addColorStop(0, th.plate[0]); g.addColorStop(1, th.plate[1]);
    c.fillStyle = g;
    lay.cells.forEach(function (_, i) { var p = cellXY(i); hexPath(c, p.x, p.y, S * 1.1); c.fill(); });
  }

  // ---------------- render ----------------
  var renderQueued = false;
  function requestRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(frame); } }
  function frame(now) {
    renderQueued = false;
    render(now || performance.now());
    if (flyers.length || particles.length || popups.length || trayAnim || smashFx || drag) requestRender();
  }
  function render(now) {
    if (!G || $('game').classList.contains('hidden')) return;
    var c = ctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, W, H);
    var lay = L.makeLayout(G.R), st = disp || G.stacks;
    drawPlate(c);
    var target = drag && drag.target != null ? drag.target : -1;
    var matchCol = drag && target >= 0 ? L.top(G.tray[drag.slot]) : -1;
    // slots (flat) first
    for (var i = 0; i < lay.size; i++) {
      if (G.blocked[i]) continue;
      var p = cellXY(i);
      drawSlot(c, p.x, p.y, S, i === target || (hammerMode && st[i].length));
    }
    // stacks in painter order (cells are sorted by r, then q)
    for (var j = 0; j < lay.size; j++) {
      var q = cellXY(j);
      if (G.blocked[j]) { drawBlocked(c, q.x, q.y, S); continue; }
      var s = st[j];
      var glow = matchCol >= 0 && lay.nbrs[target].indexOf(j) >= 0 && L.top(s) === matchCol;
      if (s.length) {
        drawStack(c, q.x, q.y, S, T, s, { count: true, skipTop: skipTopFor(j) });
        if (glow) { var ty = q.y - s.length * T; hexPath(c, q.x, ty, S * 0.98); c.strokeStyle = theme().rim; c.lineWidth = 3; c.stroke(); }
      }
      if (j === target && drag) {
        c.globalAlpha = 0.45; drawStack(c, q.x, q.y, S, T, G.tray[drag.slot], { shadow: false }); c.globalAlpha = 1;
      }
    }
    // smash effect
    if (smashFx) {
      var k = (now - smashFx.t0) / 380;
      if (k >= 1) smashFx = null;
      else { var sp = cellXY(smashFx.cell); c.globalAlpha = 1 - k; c.strokeStyle = '#fff'; c.lineWidth = 3; hexPath(c, sp.x, sp.y - T, S * (0.9 + k)); c.stroke(); c.globalAlpha = 1; }
    }
    // flyers
    flyers.forEach(function (f) {
      c.save(); c.translate(f.x, f.y); c.scale(1, f.sq || 1);
      drawTile(c, 0, 0, S * 0.9 * (f.sc || 1), T, theme().tiles[f.c % theme().tiles.length], {});
      c.restore();
    });
    // tray
    var tp = trayAnim ? ease((now - trayAnim.t0) / 420) : 1;
    if (trayAnim && tp >= 1) trayAnim = null;
    for (var t = 0; t < 3; t++) {
      var sp2 = slotXY(t);
      c.beginPath(); c.ellipse(sp2.x, sp2.y + 2, trayS * 1.25, trayS * 0.62, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fill();
      if (!G.tray[t] || hiddenSlots[t] || (drag && drag.slot === t)) continue;
      var dy = trayAnim ? (1 - ease((now - trayAnim.t0 - t * 70) / 380)) * 60 : 0;
      c.globalAlpha = trayAnim ? Math.max(0, Math.min(1, (now - trayAnim.t0 - t * 70) / 200)) : 1;
      drawStack(c, sp2.x, sp2.y + dy, trayS, trayT, G.tray[t], {});
      c.globalAlpha = 1;
    }
    // dragged stack
    if (drag) {
      var b = dragBase();
      drawStack(c, b.x, b.y, S, T, G.tray[drag.slot], {});
    }
    // particles
    particles = particles.filter(function (pt) {
      var a = (now - pt.t0) / pt.life; if (a >= 1) return false;
      var x = pt.x + pt.vx * a * pt.life / 1000, y = pt.y + pt.vy * a * pt.life / 1000 + 300 * Math.pow(a * pt.life / 1000, 2);
      c.globalAlpha = 1 - a; c.fillStyle = pt.col;
      c.save(); c.translate(x, y); c.rotate(a * 6 + pt.r); hexPath(c, 0, 0, pt.s); c.fill(); c.restore();
      return true;
    });
    c.globalAlpha = 1;
    popups = popups.filter(function (pp) {
      var a = (now - pp.t0) / 1000; if (a >= 1) return false;
      c.globalAlpha = a < 0.8 ? 1 : (1 - a) * 5;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 ' + Math.round(pp.size) + 'px Roboto, system-ui, sans-serif';
      var y = pp.y - ease(a) * 40;
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(pp.text, pp.x, y);
      c.fillStyle = pp.col || '#fff'; c.fillText(pp.text, pp.x, y);
      if (pp.sub) { c.font = '800 ' + Math.round(pp.size * 0.45) + 'px Roboto, system-ui, sans-serif'; c.strokeText(pp.sub, pp.x, y + pp.size * 0.75); c.fillStyle = theme().rim; c.fillText(pp.sub, pp.x, y + pp.size * 0.75); }
      return true;
    });
    c.globalAlpha = 1;
  }
  var skipTop = {};
  function skipTopFor(i) { return skipTop[i] || 0; }

  // ---------------- HUD ----------------
  function updateHud() {
    $('lvl').textContent = G.level;
    var pct = Math.min(100, Math.round(G.score / G.target * 100));
    $('prog-fill').style.width = pct + '%';
    $('prog-txt').textContent = Math.min(G.score, 99999) + ' / ' + G.target;
    $('btn-shuffle').disabled = !!G.shuffleUsed || G.won || G.lost;
    $('btn-hammer').classList.toggle('armed', hammerMode);
  }

  // ---------------- drag & drop ----------------
  function lift(type) { return type === 'touch' ? S * 1.9 : S * 0.6; }
  function dragBase() { return { x: drag.x, y: drag.y - lift(drag.type) + S * 0.6 }; }
  function canvasPoint(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function nearestEmpty(x, y) {
    var lay = L.makeLayout(G.R), best = -1, bd = S * 1.15;
    for (var i = 0; i < lay.size; i++) {
      if (G.blocked[i] || G.stacks[i].length) continue;
      var p = cellXY(i), d = Math.hypot(p.x - x, (p.y - y) / TILT);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function cellAt(x, y) {
    var lay = L.makeLayout(G.R), best = -1, bd = S * 1.0;
    for (var i = 0; i < lay.size; i++) {
      if (G.blocked[i]) continue;
      var p = cellXY(i), st = G.stacks[i];
      // accept taps on the base or anywhere on the stack body
      var topY = p.y - st.length * T;
      var yy = Math.max(topY, Math.min(p.y, y));
      var d = Math.hypot(p.x - x, (yy - y) / TILT);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function slotAt(x, y) {
    if (y < boardBottom - 4) return -1;
    var i = Math.max(0, Math.min(2, Math.floor(x / (W / 3))));
    return G.tray[i] ? i : -1;
  }
  function onDown(e) {
    if (!G || busy || G.won || G.lost || drag) return;
    var p = canvasPoint(e);
    if (hammerMode) { onHammerTap(p); return; }
    var slot = slotAt(p.x, p.y);
    if (slot < 0) return;
    SFX.unlock(); SFX.pick(); haptic('light');
    drag = { slot: slot, x: p.x, y: p.y, id: e.pointerId, type: e.pointerType === 'mouse' ? 'mouse' : 'touch', target: null };
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    updateDragTarget();
    requestRender();
    e.preventDefault();
  }
  function updateDragTarget() {
    var b = dragBase();
    var t = nearestEmpty(b.x, b.y);
    if (t !== drag.target && t >= 0) haptic('light');
    drag.target = t >= 0 ? t : null;
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var p = canvasPoint(e);
    drag.x = p.x; drag.y = p.y;
    updateDragTarget();
    requestRender();
    e.preventDefault();
  }
  function onUp(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    if (d.target != null) commit(d.slot, d.target, dragBaseOf(d));
    else { SFX.cancel(); requestRender(); }
  }
  function dragBaseOf(d) { return { x: d.x, y: d.y - lift(d.type) + S * 0.6 }; }

  /** Client coordinates where a drag for `slot` must be released so that it lands on `cell`. */
  function dropPointFor(slot, cell, type) {
    var r = cv.getBoundingClientRect(), p = cellXY(cell);
    return { x: r.left + p.x, y: r.top + p.y + lift(type || 'touch') - S * 0.6 };
  }
  function slotClientXY(i) { var r = cv.getBoundingClientRect(), p = slotXY(i); return { x: r.left + p.x, y: r.top + p.y - trayT * 2 }; }
  function cellClientXY(i) { var r = cv.getBoundingClientRect(), p = cellXY(i); return { x: r.left + p.x, y: r.top + p.y - (G.stacks[i].length ? G.stacks[i].length * T * 0.5 : 0) }; }

  // ---------------- move + animation ----------------
  function tween(ms, fn) {
    return new Promise(function (res) {
      var t0 = performance.now();
      (function step(now) {
        var k = Math.min(1, (now - t0) / ms);
        fn(k); requestRender();
        if (k < 1) requestAnimationFrame(step); else res();
      })(t0);
    });
  }
  async function commit(slot, cell, from) {
    busy = true;
    var before = L.cloneStacks(G.stacks);
    var stack = G.tray[slot].slice();
    var res = L.place(G, slot, cell);
    if (!res) { busy = false; SFX.error(); requestRender(); return; }
    persist();
    disp = before;
    // drop the stack into the cell
    var to = cellXY(cell);
    var fx = from ? from.x : to.x, fy = from ? from.y : to.y;
    disp[cell] = [];
    var drop = { stack: stack };
    hiddenSlots[slot] = true;
    await tween(110, function (k) {
      var e = ease(k);
      flyers = [];
      for (var t = 0; t < stack.length; t++) flyers.push({ c: stack[t], x: fx + (to.x - fx) * e, y: fy + (to.y - fy) * e - (t + 1) * T });
    });
    flyers = []; disp[cell] = stack.slice(); drop = null;
    SFX.drop(); haptic('light');
    delete hiddenSlots[slot];
    await playEvents(res.events);
    disp = null; skipTop = {};
    updateHud();
    if (res.dealt) { hiddenSlots = {}; trayAnim = { t0: performance.now() }; SFX.deal(); requestRender(); }
    busy = false;
    requestRender();
    if (G.won) { await wait(350); onWin(); }
    else if (G.lost) { await wait(350); onLose(); }
    persist();
  }
  async function playEvents(events) {
    var chainShown = 0;
    for (var e = 0; e < events.length; e++) {
      var ev = events[e];
      if (ev.t === 'move') await animMove(ev);
      else if (ev.t === 'clear') { await animClear(ev); chainShown = ev.chain; }
    }
    if (chainShown > 1) { $('chain').textContent = 'CHAIN ×' + chainShown; setTimeout(function () { $('chain').innerHTML = '&nbsp;'; }, 1600); }
  }
  async function animMove(ev) {
    var a = cellXY(ev.from), b = cellXY(ev.to);
    var n = ev.n, dur = 180, stagger = Math.max(28, 70 - n * 4);
    var launched = 0, landed = 0;
    var total = dur + stagger * (n - 1);
    var srcH = disp[ev.from].length;
    await tween(total, function (k) {
      var ms = k * total;
      flyers = [];
      var nl = Math.min(n, Math.floor(ms / stagger) + 1);
      while (launched < nl) { disp[ev.from].pop(); launched++; }
      for (var i = 0; i < launched; i++) {
        var p = (ms - i * stagger) / dur;
        if (p >= 1) { if (i >= landed) { disp[ev.to].push(ev.color); landed++; SFX.slide(landed); } continue; }
        var e = easeInOut(p);
        var y0 = a.y - (srcH - i) * T, y1 = b.y - (disp[ev.to].length + (i - landed) + 1) * T;
        var x = a.x + (b.x - a.x) * e, y = y0 + (y1 - y0) * e - Math.sin(Math.PI * e) * S * 1.1;
        flyers.push({ c: ev.color, x: x, y: y, sq: Math.abs(Math.cos(Math.PI * e)) * 0.7 + 0.3 });
      }
    });
    while (landed < n) { disp[ev.to].push(ev.color); landed++; }
    flyers = [];
    haptic('light');
  }
  async function animClear(ev) {
    var p = cellXY(ev.cell), st = disp[ev.cell];
    var h = st.length, col = theme().tiles[ev.color % theme().tiles.length];
    SFX.clear(ev.chain); haptic(ev.chain > 1 ? 'heavy' : 'medium');
    popups.push({ x: p.x, y: p.y - h * T - S * 0.6, text: '+' + ev.pts, sub: ev.chain > 1 ? 'CHAIN ×' + ev.chain : null, size: S * (ev.chain > 1 ? 1.0 : 0.85), t0: performance.now(), col: '#fff' });
    var removed = 0;
    await tween(360, function (k) {
      var nr = Math.min(ev.n, Math.floor(k * ev.n * 1.15));
      while (removed < nr) {
        var y = p.y - (h - removed) * T;
        disp[ev.cell].pop(); removed++;
        for (var q = 0; q < 3; q++) particles.push({ x: p.x + (Math.random() - 0.5) * S, y: y, vx: (Math.random() - 0.5) * 260, vy: -120 - Math.random() * 220, s: S * (0.12 + Math.random() * 0.12), col: col, t0: performance.now(), life: 650 + Math.random() * 300, r: Math.random() * 6 });
      }
    });
    while (removed < ev.n) { disp[ev.cell].pop(); removed++; }
    updateHud();
  }

  // ---------------- win / lose ----------------
  function onWin() {
    if (!G.awarded) {
      G.awarded = L.coinsForLevel(G.level);
      save.coins += G.awarded;
      gate.levelCompleted(G.level);
      save.level = Math.max(save.level, G.level + 1);
      persist();
    }
    SFX.win(); haptic('success');
    $('win-lvl').textContent = G.level;
    $('win-score').textContent = G.score;
    $('win-moves').textContent = G.placements;
    $('win-coins').textContent = '+' + G.awarded;
    setCoins();
    $('win').classList.remove('hidden');
    if (native && gate.state.maxCompleted >= gate.config.INTERSTITIAL_MIN_LEVEL - 1) window.Ads.prepareInterstitial();
  }
  function onLose() {
    SFX.lose(); haptic('error');
    $('lose-score').textContent = G.score;
    $('lose-target').textContent = G.target;
    $('btn-revive').classList.toggle('hidden', !!G.reviveUsed);
    $('lose').classList.remove('hidden');
  }
  var transitioning = false;
  async function nextLevel() {
    if (transitioning) return;
    transitioning = true;
    SFX.click();
    $('win').classList.add('hidden');
    // the ONLY place an interstitial may appear: between levels
    try { await window.Ads.maybeInterstitial(gate); } catch (e) {}
    G = save.game = startLevel(G.level + 1);
    persist();
    enterLevel();
    transitioning = false;
  }
  function restartLevel() {
    SFX.click();
    $('lose').classList.add('hidden'); $('confirm').classList.add('hidden');
    G = save.game = startLevel(G.level);
    persist();
    enterLevel();
  }
  function enterLevel() {
    hammerMode = false; disp = null; flyers = []; skipTop = {};
    layout(); updateHud();
    trayAnim = { t0: performance.now() };
    requestRender();
  }

  // ---------------- boosters (rewarded, on tap only) ----------------
  function toggleHammer() {
    if (busy || G.won || G.lost) return;
    SFX.click();
    var any = G.stacks.some(function (s) { return s.length; });
    if (!any && !hammerMode) { toast('No stacks to smash yet'); return; }
    hammerMode = !hammerMode;
    updateHud(); requestRender();
    if (hammerMode) toast('Tap a stack to smash it (watch an ad)', 2600);
  }
  function onHammerTap(p) {
    var cell = cellAt(p.x, p.y);
    if (cell < 0 || !G.stacks[cell].length) { hammerMode = false; updateHud(); requestRender(); SFX.cancel(); return; }
    window.Ads.showRewarded(function () {
      var pos = cellXY(cell), st = G.stacks[cell], col;
      for (var i = 0; i < st.length; i++) {
        col = theme().tiles[st[i] % theme().tiles.length];
        for (var q = 0; q < 2; q++) particles.push({ x: pos.x + (Math.random() - 0.5) * S, y: pos.y - i * T, vx: (Math.random() - 0.5) * 320, vy: -80 - Math.random() * 260, s: S * (0.12 + Math.random() * 0.14), col: col, t0: performance.now(), life: 700 + Math.random() * 300, r: Math.random() * 6 });
      }
      L.hammer(G, cell);
      smashFx = { cell: cell, t0: performance.now() };
      hammerMode = false;
      SFX.smash(); haptic('heavy');
      persist(); updateHud(); requestRender();
    }, function () { toast('No ad available right now. Try again in a moment.'); });
    hammerMode = false; updateHud(); requestRender();
  }
  function shuffle() {
    if (busy || G.won || G.lost) return;
    if (G.shuffleUsed) { toast('One shuffle per set of stacks'); return; }
    SFX.click();
    window.Ads.showRewarded(function () {
      L.shuffleTray(G); G.shuffleUsed = true;
      trayAnim = { t0: performance.now() }; SFX.deal();
      persist(); updateHud(); requestRender();
    }, function () { toast('No ad available right now. Try again in a moment.'); });
  }
  function revive() {
    if (!G.lost || G.reviveUsed) return;
    SFX.click();
    window.Ads.showRewarded(function () {
      var removed = L.revive(G);
      removed.forEach(function (cell) {
        var pos = cellXY(cell);
        for (var q = 0; q < 5; q++) particles.push({ x: pos.x + (Math.random() - 0.5) * S, y: pos.y - S * 0.5, vx: (Math.random() - 0.5) * 300, vy: -100 - Math.random() * 250, s: S * 0.18, col: theme().rim, t0: performance.now(), life: 800, r: Math.random() * 6 });
      });
      $('lose').classList.add('hidden');
      SFX.smash(); haptic('medium');
      persist(); updateHud(); requestRender();
      toast('Revived: ' + removed.length + ' stacks cleared');
    }, function () { toast('No ad available right now. Try again in a moment.'); });
  }

  // ---------------- screens ----------------
  function updateHome() {
    $('play-sub').textContent = 'Level ' + (G ? G.level : save.level);
    drawLogo();
  }
  function showHome() {
    $('game').classList.add('hidden'); $('home').classList.remove('hidden');
    updateHome();
    window.Ads.hideBanner();
  }
  function showGame() {
    $('home').classList.add('hidden'); $('game').classList.remove('hidden');
    enterLevel();
    if (G.won) onWin(); else if (G.lost) onLose();
    window.Ads.showBanner().then(function () { setTimeout(layout, 60); });
  }
  function drawLogo() {
    var lc = $('logo-cv'), c = lc.getContext('2d'), d = Math.min(3, window.devicePixelRatio || 1);
    lc.width = 220 * d; lc.height = 170 * d; c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, 220, 170);
    var s = 26, t = s * 0.24, tiles = theme().tiles;
    var cells = [[-1, 0, [0, 0, 0, 0, 0]], [0, 0, [6, 6, 5, 5, 5, 5, 5, 5]], [1, 0, [2, 2, 2]], [-1, 1, [3, 3, 3, 3]], [0, 1, [1, 1]], [0, -1, [4, 4, 4, 7, 7, 7]]];
    cells.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    cells.forEach(function (cc) {
      var x = 110 + s * SQ3 * (cc[0] + cc[1] / 2), y = 118 + s * 1.5 * cc[1] * TILT;
      drawStack(c, x, y, s, t, cc[2], {});
    });
    void tiles;
  }

  // ---------------- shop ----------------
  function renderShop() {
    setCoins();
    var grid = $('shop-grid'); grid.innerHTML = '';
    THEMES.forEach(function (th) {
      var owned = save.owned.indexOf(th.id) >= 0, sel = save.theme === th.id;
      var d = document.createElement('div'); d.className = 'item theme-' + th.id + (sel ? ' selected' : '');
      var prev = document.createElement('div'); prev.className = 'prev';
      var pc = document.createElement('canvas'); prev.appendChild(pc); d.appendChild(prev);
      drawPreview(pc, th);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = th.name; d.appendChild(nm);
      var b = document.createElement('button'); b.className = 'buy';
      if (sel) b.textContent = 'Equipped';
      else if (owned) { b.textContent = 'Equip'; b.classList.add('can'); }
      else { b.innerHTML = '<span class="coin-ico"></span>' + th.price; if (save.coins >= th.price) b.classList.add('can'); }
      b.addEventListener('click', function () {
        if (sel) return;
        if (!owned) {
          if (save.coins < th.price) { SFX.error(); toast('Complete more levels to earn ' + (th.price - save.coins) + ' more coins'); return; }
          save.coins -= th.price; save.owned.push(th.id); SFX.coin();
        } else SFX.click();
        save.theme = th.id; persist(); applyTheme(); renderShop(); drawLogo();
      });
      d.appendChild(b);
      grid.appendChild(d);
    });
  }
  function drawPreview(pc, th) {
    var d = Math.min(3, window.devicePixelRatio || 1);
    pc.width = 120 * d; pc.height = 80 * d;
    var c = pc.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
    var keep = save.theme; save.theme = th.id; shadeCache = {};
    var s = 15, t = s * 0.24;
    var g = c.createLinearGradient(0, 0, 0, 80); g.addColorStop(0, th.plate[0]); g.addColorStop(1, th.plate[1]);
    c.fillStyle = g; c.beginPath(); c.roundRect ? c.roundRect(0, 0, 120, 80, 10) : c.rect(0, 0, 120, 80); c.fill();
    [[-1, 0, [0, 0, 0]], [0, 0, [5, 5, 3, 3, 3]], [1, 0, [2, 2]], [0, 1, [6, 6, 6, 6]], [-1, 1, [1]], [1, -1, [4, 4]]]
      .sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; })
      .forEach(function (cc) {
        var x = 60 + s * SQ3 * (cc[0] + cc[1] / 2), y = 50 + s * 1.5 * cc[1] * TILT;
        hexPath(c, x, y, s * 0.94); c.fillStyle = th.slot; c.fill();
        drawStack(c, x, y, s, t, cc[2], {});
      });
    save.theme = keep; shadeCache = {};
  }
  function syncSettingsUI() {
    $('set-sound').checked = !!save.settings.sound;
    $('set-haptics').checked = !!save.settings.haptics;
    $('set-marks').checked = !!save.settings.marks;
    $('btn-privacy-options').classList.toggle('hidden', !(native && window.Ads.privacyOptionsRequired()));
  }

  // ---------------- wiring ----------------
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  $('btn-play').addEventListener('click', function () { SFX.unlock(); SFX.click(); showGame(); });
  $('btn-home').addEventListener('click', function () { SFX.click(); showHome(); });
  $('btn-restart').addEventListener('click', function () {
    if (busy) return;
    SFX.click();
    if (G.lost) { restartLevel(); return; }
    if (G.won || G.placements === 0) return;
    $('confirm').classList.remove('hidden');
  });
  $('confirm-no').addEventListener('click', function () { SFX.click(); $('confirm').classList.add('hidden'); });
  $('confirm-yes').addEventListener('click', restartLevel);
  $('btn-next').addEventListener('click', nextLevel);
  $('btn-retry').addEventListener('click', restartLevel);
  $('btn-revive').addEventListener('click', revive);
  $('btn-hammer').addEventListener('click', toggleHammer);
  $('btn-shuffle').addEventListener('click', shuffle);
  $('btn-shop').addEventListener('click', function () { SFX.unlock(); SFX.click(); renderShop(); $('shop').classList.remove('hidden'); });
  $('btn-settings-home').addEventListener('click', function () { SFX.unlock(); SFX.click(); syncSettingsUI(); $('settings').classList.remove('hidden'); });
  function syncMenuCard() {
    var b = $('btn-play');
    if (!b) return;
    document.documentElement.style.setProperty('--menu-w', b.offsetWidth + 'px');
    document.documentElement.style.setProperty('--menu-h', b.offsetHeight + 'px');
  }
  $('btn-howto').addEventListener('click', function () { SFX.unlock(); SFX.click(); syncMenuCard(); $('howto').classList.remove('hidden'); });
  window.addEventListener('resize', syncMenuCard);
  syncMenuCard();
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', function () { SFX.click(); $(b.dataset.close).classList.add('hidden'); });
  });
  $('set-sound').addEventListener('change', function (e) { save.settings.sound = e.target.checked; SFX.setEnabled(save.settings.sound); persist(); SFX.click(); });
  $('set-haptics').addEventListener('change', function (e) { save.settings.haptics = e.target.checked; persist(); haptic('light'); });
  $('set-marks').addEventListener('change', function (e) { save.settings.marks = e.target.checked; persist(); drawLogo(); requestRender(); });
  $('btn-privacy-options').addEventListener('click', function () { window.Ads.showPrivacyOptions(); });
  $('btn-reset').addEventListener('click', function () {
    if (!confirm('Reset level progress, coins, themes and the current board?')) return;
    var ad = save.ad; save = defaults(); save.ad = ad;
    G = save.game = startLevel(1); persist();
    applyTheme(); setCoins(); $('settings').classList.add('hidden'); updateHome();
  });
  window.addEventListener('resize', function () { if (!$('game').classList.contains('hidden')) layout(); });

  // play-time accounting for the ad gate (only while actually playing)
  var ticks = 0;
  setInterval(function () {
    if (document.visibilityState !== 'visible' || $('game').classList.contains('hidden') || !G || G.won || G.lost) return;
    gate.addPlayTime(1000);
    if (++ticks % 10 === 0) persist();
  }, 1000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') persist(); });

  // ---------------- boot ----------------
  SFX.setEnabled(save.settings.sound);
  if (validGame(save.game)) G = save.game;
  else { G = save.game = startLevel(Math.max(1, save.level | 0)); persist(); }
  applyTheme(); setCoins();
  updateHome();
  // consent + SDK init only: no ad is shown on launch
  if (window.Ads) window.Ads.init().then(syncSettingsUI);

  window.__hx = {
    get game() { return G; }, get save() { return save; }, logic: L, gate: gate,
    dropPointFor: dropPointFor, slotPoint: slotClientXY, cellPoint: cellClientXY,
    get busy() { return busy; }, layout: layout,
    loadLevel: function (n) { G = save.game = startLevel(n); persist(); enterLevel(); }
  };
})();
