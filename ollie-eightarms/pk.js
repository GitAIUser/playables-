/* © 2026 Randomness. All rights reserved. Unauthorized copying or redistribution is prohibited. */
/* PK4: shared YouTube Playables runtime for batch 4 (level-based puzzle games). Plain readable JS.
   Covers SDK glue, canvas/DPR, board fitting, fixed-step loop, input (with a lead cursor ahead of the finger for touch),
   WebAudio synth that follows YouTube's audio setting, and save/load through the SDK (loadData awaited before any save).
   Also: level flow (Level N / total, 3-star goals, worlds, map, daily remix, end-of-content), coins and cosmetics shop,
   hint ladder, rewind, skip, and ads (interstitial only on level clear, every 3 clears, >=30 s apart; rewarded is opt-in only
   and granted only when requestRewardedAd resolves true). */
'use strict';
const PK = (() => {
  const yt = (typeof ytgame !== 'undefined') ? ytgame : null;
  const inEnv = !!(yt && yt.IN_PLAYABLES_ENV);
  const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };
  // ytgame.health.logError on uncaught errors (recommended integration; the API is best-effort and rate-limited, capped here too).
  let nErr = 0; const logErr = () => { if (yt && nErr++ < 20) safe(() => yt.health.logError()); };
  window.addEventListener('error', logErr); window.addEventListener('unhandledrejection', logErr);
  // PK.later(fn, ms): pause-aware timer for game code (integration requirement 6: the game MUST pause all execution after
  // ytgame.system.onPause). A callback that comes due while the SDK has the game paused is held and runs on onResume.
  const heldT = []; let tPaused = false;
  function later(fn, ms) { return setTimeout(() => { if (tPaused) heldT.push(fn); else fn(); }, ms); }
  function flushHeld() { tPaused = false; for (const f of heldT.splice(0)) { try { f(); } catch (e) { console.error(e); logErr(); } } }

  // ---------------- canvas ----------------
  const cv = document.createElement('canvas'); cv.setAttribute('aria-label', 'game canvas'); cv.tabIndex = 0;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const E = { cv, ctx, W: 1, H: 1, DPR: 1, S: 16, t: 0, state: 'boot', data: {}, inEnv, cur: 0, daily: false };
  let game = null;
  const B = { x: 0, y: 0, s: 1, w: 100, h: 150, top: 60 }; // board transform (board units -> css px)
  const bakes = {};
  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    E.DPR = Math.min(window.devicePixelRatio || 1, 2);
    E.W = w; E.H = h; E.S = Math.max(12, Math.min(24, Math.min(w, h) / 24));
    cv.width = Math.round(w * E.DPR); cv.height = Math.round(h * E.DPR); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    fitBoard(); for (const k in bakes) delete bakes[k];
    if (game && game.resize) safe(() => game.resize(w, h));
  }
  function fitBoard() {
    const bd = (game && game.board) ? (typeof game.board === 'function' ? game.board() : game.board) : { w: 100, h: 150 };
    B.w = bd.w; B.h = bd.h;
    const top = Math.round(E.S * 4.1), pad = Math.round(E.S * .6);
    B.top = top;
    const aw = E.W - pad * 2, ah = E.H - top - pad;
    B.s = Math.max(.05, Math.min(aw / B.w, ah / B.h));
    B.x = Math.round((E.W - B.w * B.s) / 2); B.y = Math.round(top + (ah - B.h * B.s) / 2);
  }
  const toBoard = (x, y) => [(x - B.x) / B.s, (y - B.y) / B.s];
  const toScreen = (x, y) => [B.x + x * B.s, B.y + y * B.s];

  // ---------------- math ----------------
  const M = {
    clamp: (v, a, b) => v < a ? a : v > b ? b : v,
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    easeBack: (t) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    elastic: (t) => t <= 0 || t >= 1 ? M.clamp(t, 0, 1) : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * 2.0944) + 1,
    approach: (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt)),
    /** deterministic PRNG (mulberry32) -> function returning [0,1) */
    rng(seed) { let a = (seed >>> 0) || 0x9e3779b9; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    hash(...v) { let h = 2166136261 >>> 0; for (const x of v) { const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= 0x5bd1e995; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; },
    ri: (r, a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (r, arr) => arr[Math.floor(r() * arr.length)],
    shuffle(r, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
    /** distance from point to segment */
    segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - ax - dx * t, py - ay - dy * t); },
    segInter(ax, ay, bx, by, cx, cy, dx, dy) { const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return null; const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d; return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? [ax + (bx - ax) * t, ay + (by - ay) * t, t, u] : null; },
    /** segment vs axis-aligned rect {x,y,w,h} (with padding) */
    segRect(ax, ay, bx, by, r, pad = 0) {
      const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad;
      let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
      const clip = (p, q) => { if (Math.abs(p) < 1e-12) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
      return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay);
    },
    inPoly(x, y, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; },
    polyLen(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; },
    clone: (o) => JSON.parse(JSON.stringify(o)),
  };
  // value noise (seeded, deterministic) for textures and organic wobble
  const PERM = new Uint8Array(512); { const r = M.rng(1234); const p = [...Array(256).keys()]; M.shuffle(r, p); for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
  const fade = (t) => t * t * (3 - 2 * t);
  function noise2(x, y, per = 256) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, m = (v) => ((v % per) + per) % per;
    const h = (a, b) => PERM[(PERM[m(a) & 255] + m(b)) & 511] / 255;
    const u = fade(xf), v = fade(yf);
    return M.lerp(M.lerp(h(xi, yi), h(xi + 1, yi), u), M.lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
  }
  function fbm(x, y, oct = 4, per = 256) { let s = 0, a = .5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f, per * f); n += a; f *= 2; a *= .5; } return s / n; }
  M.noise = noise2; M.fbm = fbm;

  // ---------------- drawing helpers ----------------
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  const texCache = {};
  /** pixel-shaded tileable texture canvas (cached); fn(nx, ny, x, y) -> [r,g,b,a] */
  function texture(key, size, fn) {
    if (texCache[key]) return texCache[key];
    const c = makeCanvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const col = fn(x / size, y / size, x, y), i = (y * size + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3] === undefined ? 255 : col[3]; }
    g.putImageData(img, 0, 0); texCache[key] = c; return c;
  }
  /** a few shared surface textures (tileable, alpha overlays) */
  const TEX = {
    grain: () => texture('grain', 128, (nx, ny) => { const v = fbm(nx * 32, ny * 32, 2, 32); return [v * 255, v * 255, v * 255, 40]; }),
    paper: () => texture('paper', 192, (nx, ny) => { const v = fbm(nx * 24, ny * 24, 4, 24), f = fbm(nx * 96, ny * 6, 2, 96); const k = 235 + (v - .5) * 30 + (f - .5) * 10; return [k, k - 4, k - 14, 255]; }),
    clay: () => texture('clay', 128, (nx, ny) => { const v = fbm(nx * 8, ny * 8, 3, 8), r = Math.sin((fbm(nx * 6, ny * 6, 2, 6) * 30)) * .5 + .5; const a = 18 + r * 26 + (v - .5) * 40; return [0, 0, 0, Math.max(0, a)]; }),
    fuzz: () => texture('fuzz', 128, (nx, ny, x, y) => { const v = fbm(nx * 64, ny * 64, 2, 64); const s = ((x + y * 3) % 6 < 3) ? 12 : 0; return [255, 255, 255, Math.max(0, (v - .45) * 160 + s)]; }),
    halftone: () => texture('half', 16, (nx, ny, x, y) => { const d = Math.hypot((x % 8) - 4, (y % 8) - 4); return [0, 0, 0, d < 1.8 ? 60 : 0]; }),
    wood: () => texture('wood', 128, (nx, ny) => { const v = fbm(nx * 2, ny * 16, 3, 2), r = Math.sin((nx * 40 + v * 12) * Math.PI) * .5 + .5; return [0, 0, 0, 14 + r * 30]; }),
    speck: () => texture('speck', 96, (nx, ny) => { const v = fbm(nx * 48, ny * 48, 1, 48); return v > .72 ? [40, 30, 20, 90] : v < .2 ? [255, 255, 255, 50] : [0, 0, 0, 0]; }),
  };
  const patCache = {};
  function pat(name) { if (!patCache[name]) patCache[name] = ctx.createPattern(TEX[name](), 'repeat'); return patCache[name]; }
  function rrect(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  /** wobbly blob path (deterministic per seed) */
  function blob(g, x, y, r, wob = .1, seed = 0, pts = 16) {
    g.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = i / pts * Math.PI * 2, n = noise2(Math.cos(a) * 1.5 + seed * 7.1, Math.sin(a) * 1.5 + seed * 3.3), rr = r * (1 + (n - .5) * 2 * wob);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  }
  const FONT = '"Avenir Next","Segoe UI","Nunito","Trebuchet MS",system-ui,-apple-system,sans-serif';
  const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
  const COMIC = '"Comic Sans MS","Chalkboard SE","Comic Neue","Marker Felt",' + FONT;
  function text(str, x, y, size, o = {}) {
    const g = o.g || ctx; g.save();
    const fnt = (sz) => `${o.italic ? 'italic ' : ''}${o.weight || 800} ${Math.max(o.g ? .5 : 6, sz)}px ${o.font || FONT}`; g.font = fnt(size);
    if (o.max) { const w = g.measureText(str).width; if (w > o.max) { size *= o.max / w; g.font = fnt(size); } }
    g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle'; g.globalAlpha *= (o.alpha === undefined ? 1 : o.alpha);
    if (o.stroke) { g.lineWidth = o.sw || size * .18; g.strokeStyle = o.stroke; g.lineJoin = 'round'; g.strokeText(str, x, y); }
    else if (o.shadow !== false) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(str, x, y + Math.max(1, size * .07)); }
    g.fillStyle = o.color || '#fff'; g.fillText(str, x, y); g.restore();
  }
  function star(g, x, y, r, fill, stroke) {
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath();
    g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = r * .14; g.strokeStyle = stroke; g.lineJoin = 'round'; g.stroke(); }
  }
  /** cartoon face with expressions. mood: idle|happy|joy|shock|sad|smug|dizzy|sleep|sour|blush|angry|wink */
  function face(g, x, y, r, mood = 'idle', t = 0, o = {}) {
    const ink = o.ink || '#1b1420', eyeW = o.eyeWhite !== false; g.save(); g.translate(x, y);
    const blink = (mood === 'idle' || mood === 'smug') && ((t * .7) % 3.2) < .12;
    const ex = r * .38, ey = -r * .12, er = r * .24;
    const eyes = (fn) => { fn(-ex, ey); fn(ex, ey); };
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = Math.max(.6, r * .1);
    if (mood === 'sleep' || blink) eyes((ax, ay) => { g.beginPath(); g.arc(ax, ay, er * .8, .2, Math.PI - .2); g.stroke(); });
    else if (mood === 'dizzy') eyes((ax, ay) => { g.beginPath(); g.moveTo(ax - er * .7, ay - er * .7); g.lineTo(ax + er * .7, ay + er * .7); g.moveTo(ax + er * .7, ay - er * .7); g.lineTo(ax - er * .7, ay + er * .7); g.stroke(); });
    else if (mood === 'happy' || mood === 'joy') eyes((ax, ay) => { g.beginPath(); g.arc(ax, ay + er * .3, er * .8, Math.PI + .3, -.3); g.stroke(); });
    else if (mood === 'wink') { g.beginPath(); g.arc(-ex, ey + er * .3, er * .8, Math.PI + .3, -.3); g.stroke(); g.beginPath(); g.arc(ex, ey, er * .55, 0, 7); g.fill(); }
    else {
      const sc = mood === 'shock' ? 1.25 : 1;
      eyes((ax, ay) => {
        if (eyeW) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ax, ay, er * sc, er * 1.15 * sc, 0, 0, 7); g.fill(); g.lineWidth = Math.max(.5, r * .06); g.stroke(); }
        g.fillStyle = ink; const look = o.look || 0; g.beginPath(); g.arc(ax + look * er * .35, ay + er * .1, er * (mood === 'shock' ? .35 : .55), 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(ax + look * er * .35 - er * .18, ay - er * .15, er * .16, 0, 7); g.fill();
      });
      g.lineWidth = Math.max(.6, r * .09);
      if (mood === 'angry' || mood === 'sour') { g.beginPath(); g.moveTo(-ex - er, ey - er * 1.5); g.lineTo(-ex + er, ey - er * .9); g.moveTo(ex + er, ey - er * 1.5); g.lineTo(ex - er, ey - er * .9); g.stroke(); }
      if (mood === 'sad') { g.beginPath(); g.moveTo(-ex - er, ey - er * .9); g.lineTo(-ex + er, ey - er * 1.5); g.moveTo(ex + er, ey - er * .9); g.lineTo(ex - er, ey - er * 1.5); g.stroke(); }
      if (mood === 'smug') { g.beginPath(); g.moveTo(-ex - er, ey - er * 1.2); g.lineTo(-ex + er, ey - er * 1.2); g.moveTo(ex - er, ey - er * 1.2); g.lineTo(ex + er, ey - er * 1.2); g.stroke(); }
    }
    g.lineWidth = Math.max(.6, r * .1); const my = r * .38;
    if (mood === 'happy' || mood === 'wink' || mood === 'smug') { g.beginPath(); g.arc(0, my - r * .12, r * .26, .25, Math.PI - .25); g.stroke(); }
    else if (mood === 'joy') { g.fillStyle = '#5a1a26'; g.beginPath(); g.arc(0, my - r * .1, r * .3, 0, Math.PI); g.closePath(); g.fill(); g.fillStyle = '#ff7a8a'; g.beginPath(); g.arc(0, my + r * .08, r * .14, 0, Math.PI); g.fill(); }
    else if (mood === 'shock') { g.fillStyle = '#3a0f18'; g.beginPath(); g.ellipse(0, my, r * .16, r * .22, 0, 0, 7); g.fill(); }
    else if (mood === 'sad' || mood === 'angry') { g.beginPath(); g.arc(0, my + r * .18, r * .22, Math.PI + .4, -.4); g.stroke(); }
    else if (mood === 'sour') { g.beginPath(); g.moveTo(-r * .25, my); for (let i = 1; i <= 6; i++) g.lineTo(-r * .25 + i * r * .083, my + (i % 2 ? -1 : 1) * r * .06); g.stroke(); }
    else if (mood === 'dizzy') { g.beginPath(); g.moveTo(-r * .2, my); g.quadraticCurveTo(0, my + r * .2, r * .2, my - r * .05); g.stroke(); }
    else if (mood === 'sleep') { g.beginPath(); g.ellipse(0, my, r * .08, r * .1, 0, 0, 7); g.stroke(); }
    else { g.beginPath(); g.moveTo(-r * .14, my); g.quadraticCurveTo(0, my + r * .1, r * .14, my); g.stroke(); }
    if (mood === 'blush' || mood === 'joy' || mood === 'happy') { g.fillStyle = 'rgba(255,90,110,.35)'; g.beginPath(); g.ellipse(-ex - er * .3, my - r * .05, er * .7, er * .4, 0, 0, 7); g.ellipse(ex + er * .3, my - r * .05, er * .7, er * .4, 0, 0, 7); g.fill(); }
    g.restore();
  }

  /** baked layer in board units: rendered at device resolution, invalidated on resize or unbake(key) */
  function baked(key, fn, w, h) {
    const bw = w || B.w, bh = h || B.h, k = key + '|' + bw + 'x' + bh;
    let c = bakes[k]; if (c) return c;
    const sc = B.s * E.DPR; c = makeCanvas(bw * sc, bh * sc); const g = c.getContext('2d'); g.setTransform(sc, 0, 0, sc, 0, 0); fn(g, bw, bh); c.bw = bw; c.bh = bh; bakes[k] = c; return c;
  }
  function unbake(prefix) { for (const k in bakes) if (k.startsWith(prefix + '|')) delete bakes[k]; }
  /** sprite: cached drawing of w x h board units, origin at center */
  function sprite(key, w, h, fn) { return baked('spr:' + key, (g) => { g.translate(w / 2, h / 2); fn(g, w, h); }, w, h); }
  function blit(g, c, x, y) { g.drawImage(c, x, y, c.bw, c.bh); }
  function blitC(g, c, x, y) { g.drawImage(c, x - c.bw / 2, y - c.bh / 2, c.bw, c.bh); }
  /** full-screen background cache (css px) */
  let bgCache = null, bgKey = '';
  function screenBg(key, fn) {
    const k = key + E.W + 'x' + E.H + E.DPR; if (bgCache && bgKey === k) return bgCache;
    bgCache = makeCanvas(E.W * E.DPR, E.H * E.DPR); const g = bgCache.getContext('2d'); g.setTransform(E.DPR, 0, 0, E.DPR, 0, 0); fn(g, E.W, E.H); bgKey = k; return bgCache;
  }

  // ---------------- particles (board units) ----------------
  const parts = []; let shake = 0;
  const fx = {
    burst(x, y, n, o = {}) {
      for (let i = 0; i < n; i++) {
        const a = (o.dir === undefined ? Math.random() * 6.283 : o.dir + (Math.random() - .5) * (o.spread || 1.2)), sp = (o.speed || 30) * (.4 + Math.random() * .8);
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), g: o.grav === undefined ? 60 : o.grav, life: (o.life || .8) * (.6 + Math.random() * .6), t: 0, r: (o.size || 2) * (.6 + Math.random() * .8), col: Array.isArray(o.col) ? o.col[(Math.random() * o.col.length) | 0] : (o.col || '#fff'), shape: o.shape || 'dot', rot: Math.random() * 6, vr: (Math.random() - .5) * 10, txt: o.txt });
      }
    },
    confetti(x, y, n = 40, cols) { fx.burst(x, y, n, { speed: 70, up: 40, grav: 90, life: 1.6, size: 1.8, col: cols || ['#ff5a6e', '#ffd34d', '#4fd1ff', '#7dff8a', '#c58bff', '#fff'], shape: 'rect' }); },
    puff(x, y, n = 10, col = 'rgba(255,255,255,.8)') { fx.burst(x, y, n, { speed: 18, grav: -8, life: .7, size: 4, col, shape: 'puff' }); },
    word(x, y, txt, col = '#fff', size = 7) { parts.push({ x, y, vx: 0, vy: -14, g: 0, life: 1.1, t: 0, r: size, col, shape: 'word', txt, rot: 0, vr: 0 }); },
    shake(a = 3) { shake = Math.max(shake, a); },
    clear() { parts.length = 0; shake = 0; },
    update(dt) { for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += dt; if (p.t > p.life) { parts.splice(i, 1); continue; } p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.rot += p.vr * dt; } shake *= Math.pow(.02, dt); if (shake < .05) shake = 0; },
    draw(g) {
      for (const p of parts) {
        const k = 1 - p.t / p.life; g.globalAlpha = Math.min(1, k * 1.6); g.fillStyle = p.col;
        if (p.shape === 'rect') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.r, -p.r * .5, p.r * 2, p.r); g.restore(); }
        else if (p.shape === 'puff') { g.beginPath(); g.arc(p.x, p.y, p.r * (1.6 - k * .6), 0, 7); g.fill(); }
        else if (p.shape === 'word') { g.globalAlpha = Math.min(1, k * 2); text(p.txt, p.x, p.y, p.r, { g, color: p.col, stroke: '#1b1420', font: COMIC }); }
        else { g.beginPath(); g.arc(p.x, p.y, p.r * (.5 + k * .5), 0, 7); g.fill(); }
      }
      g.globalAlpha = 1;
    },
  };

  // ---------------- audio (follows YouTube's audio setting, no in-game mute button) ----------------
  const A = { ctx: null, master: null, music: null, sfx: null, ytOn: true, next: 0, step: 0 };
  const ADS = { busy: false, lastI: -1e12, clears: 0, playSince: 0 };
  if (yt) { safe(() => { A.ytOn = yt.system.isAudioEnabled() !== false; }); safe(() => yt.system.onAudioEnabledChange((on) => { A.ytOn = !!on; gain(); })); }
  function gain() { if (!A.master) return; const on = A.ytOn && !E.sdkPaused && !ADS.busy; A.master.gain.setTargetAtTime(on ? 1 : 0, A.ctx.currentTime, .03); }
  function initAudio() {
    if (A.ctx) { if (A.ctx.state === 'suspended' && !E.sdkPaused) safe(() => A.ctx.resume()); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    A.ctx = new AC(); A.master = A.ctx.createGain(); A.master.gain.value = 0;
    const comp = A.ctx.createDynamicsCompressor(); A.master.connect(comp); comp.connect(A.ctx.destination);
    A.sfx = A.ctx.createGain(); A.sfx.gain.value = .55; A.sfx.connect(A.master);
    A.music = A.ctx.createGain(); A.music.gain.value = .2; A.music.connect(A.master);
    A.delay = A.ctx.createDelay(1); A.delay.delayTime.value = .26; const fb = A.ctx.createGain(); fb.gain.value = .3; const wet = A.ctx.createGain(); wet.gain.value = .3;
    A.delay.connect(fb); fb.connect(A.delay); A.delay.connect(wet); wet.connect(A.master); gain();
  }
  const aOK = () => A.ctx && A.ctx.state === 'running' && A.ytOn && !E.sdkPaused && !ADS.busy;
  function tone(o) {
    if (!aOK()) return; const c = A.ctx, t = c.currentTime + (o.at || 0), d = o.d || .2, osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f || 440, t); if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + d);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(o.v || .25, t + (o.a || .008)); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    let n = osc; if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); n = f; }
    n.connect(g); g.connect(o.dest || A.sfx); if (o.echo) g.connect(A.delay); osc.start(t); osc.stop(t + d + .05);
  }
  let nbuf = null;
  function noise(o) {
    if (!aOK()) return; const c = A.ctx, t = c.currentTime + (o.at || 0), d = o.d || .2;
    if (!nbuf) { nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const ch = nbuf.getChannelData(0); const r = M.rng(7); for (let i = 0; i < ch.length; i++) ch[i] = r() * 2 - 1; }
    const s = c.createBufferSource(); s.buffer = nbuf; s.loop = true; const f = c.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + d); f.Q.value = o.q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(o.v || .2, t + (o.a || .01)); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    s.connect(f); f.connect(g); g.connect(o.dest || A.sfx); s.start(t); s.stop(t + d + .05);
  }
  const sfx = {
    tone, noise,
    pop(p = 1) { tone({ f: 500 * p, f2: 900 * p, d: .08, v: .22 }); },
    tick(p = 1) { tone({ f: 1400 * p, d: .03, type: 'square', v: .05, lp: 3000 }); },
    click() { tone({ f: 700, f2: 500, d: .05, type: 'triangle', v: .12 }); },
    chime(f = 880) { tone({ f, d: .8, v: .16, echo: true }); tone({ f: f * 2.01, d: .4, v: .05 }); },
    pluck(f = 440, v = .18) { tone({ f, d: .3, type: 'triangle', v, lp: 2400 }); },
    boing() { tone({ f: 180, f2: 520, d: .25, type: 'triangle', v: .2 }); tone({ f: 520, f2: 260, d: .2, type: 'sine', v: .1, at: .18 }); },
    squish() { noise({ f: 600, f2: 200, d: .18, v: .2, q: 2 }); tone({ f: 220, f2: 90, d: .18, v: .15 }); },
    whoosh(v = .14) { noise({ f: 400, f2: 2200, d: .3, v, q: .7 }); },
    thud(v = .35) { tone({ f: 130, f2: 45, d: .25, v }); noise({ f: 260, d: .12, v: v * .4, ft: 'lowpass' }); },
    rip() { noise({ f: 2400, f2: 900, d: .22, v: .2, q: 3 }); },
    gulp() { tone({ f: 260, f2: 120, d: .12, type: 'sine', v: .25 }); tone({ f: 200, f2: 90, d: .12, v: .2, at: .12 }); },
    fail() { tone({ f: 392, f2: 370, d: .2, type: 'triangle', v: .2 }); tone({ f: 330, f2: 300, d: .2, type: 'triangle', v: .2, at: .2 }); tone({ f: 262, f2: 160, d: .55, type: 'triangle', v: .22, at: .4, lp: 1600 }); },
    win() { [0, 4, 7, 12, 16].forEach((n, i) => tone({ f: 523 * Math.pow(2, n / 12), d: .45, type: 'triangle', v: .14, at: i * .07, echo: true })); },
    coin() { tone({ f: 1320, d: .07, type: 'square', v: .05, lp: 4000 }); tone({ f: 1760, d: .18, type: 'square', v: .05, lp: 4000, at: .06 }); },
    star(i = 0) { tone({ f: 880 * Math.pow(2, i * 4 / 12), d: .4, v: .15, echo: true }); },
  };
  function musicTick() {
    if (!aOK() || !game || !game.music) return; const cfg = Object.assign({ root: 196, scale: [0, 2, 4, 7, 9, 12], bpm: 88, voice: 'pluck', density: .45 }, game.music);
    const c = A.ctx, spb = 60 / cfg.bpm / 2; if (A.next < c.currentTime) A.next = c.currentTime + .05;
    while (A.next < c.currentTime + .25) {
      const at = A.next - c.currentTime, s = A.step++;
      if (s % 16 === 0) { const deg = [0, 3, 4, 2][(s / 16 | 0) % 4], f = cfg.root / 2 * Math.pow(2, cfg.scale[deg % cfg.scale.length] / 12); tone({ f, d: spb * 14, v: .1, at, a: .3, dest: A.music }); }
      if (s % 4 === 2 && cfg.bass !== false) tone({ f: cfg.root / 4 * Math.pow(2, cfg.scale[[0, 3, 4, 2][(s / 16 | 0) % 4] % cfg.scale.length] / 12), d: .2, type: 'triangle', v: .07, at, lp: 600, dest: A.music });
      const pr = M.hash(s, 'm') / 4294967296;
      if (pr < cfg.density * (s % 2 === 0 ? 1 : .4)) {
        const n = cfg.scale[(M.hash(s, 'n') % cfg.scale.length)] + (M.hash(s, 'o') % 4 === 0 ? 12 : 0), f = cfg.root * Math.pow(2, n / 12);
        if (cfg.voice === 'pad') tone({ f, d: 1.3, v: .045, at, a: .2, dest: A.music });
        else if (cfg.voice === 'bell') tone({ f, d: 1, v: .05, at, dest: A.music });
        else tone({ f, d: .35, type: 'triangle', v: .06, at, lp: 2200, dest: A.music });
      }
      A.next += spb;
    }
  }

  // ---------------- save / load (SDK; localStorage only outside Playables) ----------------
  let loadDone = false; const LKEY = 'pk4_' + location.pathname;
  function sanitize(d) {
    if (!d || typeof d !== 'object') d = {};
    const o = { v: 1 };
    o.u = Math.max(0, Math.floor(+d.u || 0)); o.st = typeof d.st === 'string' ? d.st.replace(/[^0-3]/g, '0') : ''; o.sk = typeof d.sk === 'string' ? d.sk.replace(/[^01]/g, '0') : '';
    o.c = Math.max(0, Math.floor(+d.c || 0)); o.own = Array.isArray(d.own) ? d.own.filter((x) => Number.isInteger(x) && x >= 0 && x < 64) : [0]; if (!o.own.includes(0)) o.own.push(0);
    o.sel = o.own.includes(d.sel | 0) ? d.sel | 0 : 0; o.fh = (d.fh && typeof d.fh === 'object') ? d.fh : {}; o.dd = typeof d.dd === 'string' ? d.dd : ''; o.tut = d.tut | 0; o.plays = d.plays | 0; o.done = d.done | 0;
    return o;
  }
  function merge(a, b) { // keep the best of both (late-arriving load vs progress made meanwhile)
    const o = sanitize(a), p = sanitize(b); o.u = Math.max(o.u, p.u); let st = ''; for (let i = 0; i < Math.max(o.st.length, p.st.length); i++) st += Math.max(+(o.st[i] || 0), +(p.st[i] || 0)); o.st = st;
    o.c = Math.max(o.c, p.c); o.own = [...new Set([...o.own, ...p.own])]; Object.assign(o.fh, p.fh); return o;
  }
  async function loadSave() {
    let raw = null;
    try { if (inEnv) raw = await yt.game.loadData(); else raw = safe(() => window.localStorage.getItem(LKEY)); } catch (e) { safe(() => yt.health.logWarning()); }
    let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (e) { d = {}; }
    E.data = E.started ? merge(E.data, d) : sanitize(d); loadDone = true;
  }
  function save() {
    if (!loadDone) return; const s = JSON.stringify(E.data); if (s.length > 500000) return;
    if (inEnv) safe(() => { const p = yt.game.saveData(s); if (p && p.catch) p.catch(() => {}); }); else safe(() => window.localStorage.setItem(LKEY, s));
  }
  const starsOf = (i) => +(E.data.st[i] || 0);
  function setStars(i, s) { let st = E.data.st; while (st.length <= i) st += '0'; E.data.st = st.slice(0, i) + Math.max(s, starsOf(i)) + st.slice(i + 1); }
  const skipped = (i) => E.data.sk[i] === '1';
  function setSkip(i, v) { let s = E.data.sk; while (s.length <= i) s += '0'; E.data.sk = s.slice(0, i) + (v ? '1' : '0') + s.slice(i + 1); }
  const totalStars = () => { let n = 0; for (const ch of E.data.st) n += +ch; return n; };
  const dayStr = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

  // ---------------- ads ----------------
  const adsOK = () => !!(inEnv && yt && yt.ads);
  function interstitialThen(fn) {
    const now = performance.now();
    if (ADS.clears >= 3 && now - ADS.lastI >= 30000 && ADS.playSince >= 30 && adsOK() && !ADS.busy) {
      ADS.busy = true; ADS.lastI = now; ADS.clears = 0; ADS.playSince = 0; gain(); cancelInput();
      let done = false; const fin = () => { if (done) return; done = true; ADS.busy = false; gain(); fn(); };
      try { Promise.resolve(yt.ads.requestInterstitialAd()).then(fin, fin); } catch (e) { fin(); }
      setTimeout(fin, 45000);
    } else fn();
  }
  /** rewarded: reward ONLY when the SDK resolves true. Outside Playables (local preview) it's granted as a demo. */
  function rewarded(id, onReward, onNo) {
    if (ADS.busy) return;
    if (!inEnv) { onReward(); return; }
    if (!adsOK()) { toast('Ads unavailable right now'); if (onNo) onNo(); return; }
    ADS.busy = true; gain(); cancelInput();
    let done = false; const fin = (ok) => { if (done) return; done = true; ADS.busy = false; gain(); if (ok === true) onReward(); else { toast('No reward this time'); if (onNo) onNo(); } };
    try { Promise.resolve(yt.ads.requestRewardedAd(id)).then(fin, () => fin(false)); } catch (e) { fin(false); }
    setTimeout(() => fin(false), 90000);
  }

  // ---------------- level flow ----------------
  const L = { fails: 0, rewindUsed: false, hint: 0, idle: 0, tries: 0, t: 0, endT: 0, coins: 0, doubled: false, newStars: 0, stars: 0, msg: '', offer: true, confirm: null, tut: '', tutT: 0, firstClear: false };
  const total = () => game.total;
  const wsz = () => game.worldSize || 20;
  const worldOf = (i) => Math.floor(i / wsz());
  const worldName = (w) => (game.worlds && game.worlds[w % game.worlds.length]) || ('World ' + (w + 1));
  let mapWorld = 0, shopPage = 0, toastS = '', toastT = 9;
  function toast(s) { toastS = s; toastT = 0; }
  function startLevel(i, daily) {
    initAudio(); fx.clear(); cancelInput();
    E.daily = !!daily; E.cur = M.clamp(i, 0, total() - 1);
    const seed = daily ? (M.hash(dayStr(), game.id) | 1) : 0;
    Object.assign(L, { fails: 0, rewindUsed: false, hint: 0, idle: 0, tries: 1, t: 0, offer: true, confirm: null });
    game.load(E.cur, seed); fitBoard(); for (const k in bakes) delete bakes[k];
    const tu = !daily && game.tutorial ? game.tutorial(E.cur) : null; L.tut = tu || ''; L.tutT = tu ? 0 : 99;
    E.state = 'play'; sfx.tone({ f: 330, f2: 660, d: .15, type: 'triangle', v: .12 });
  }
  function retry() { if (!game) return; fx.clear(); cancelInput(); game.load(E.cur, E.daily ? (M.hash(dayStr(), game.id) | 1) : 0); L.tries++; L.hint = Math.min(L.hint, 3); E.state = 'play'; L.offer = true; L.confirm = null; }
  function win(stars) {
    if (E.state !== 'play') return; stars = M.clamp(stars | 0, 1, 3); L.stars = stars; L.endT = 0; E.state = 'won';
    const i = E.cur; let coins = 0;
    if (E.daily) { if (E.data.dd !== dayStr()) { coins = 40; E.data.dd = dayStr(); } else coins = 3; L.firstClear = false; L.newStars = 0; }
    else {
      const prev = starsOf(i); L.firstClear = prev === 0 && !skipped(i); L.newStars = Math.max(0, stars - prev);
      coins = L.firstClear ? 10 + 5 * stars : (L.newStars ? 5 * L.newStars : 2);
      setStars(i, stars); if (skipped(i)) setSkip(i, false); E.data.u = Math.max(E.data.u, Math.min(total() - 1, i + 1)); if (i + 1 >= total()) E.data.done = 1;
    }
    E.data.c += coins; L.coins = coins; L.doubled = false; ADS.clears++; E.data.plays++; save(); sfx.win();
  }
  function fail(msg) { if (E.state !== 'play') return; L.fails++; L.msg = msg || 'Oops!'; L.endT = 0; E.state = 'failing'; sfx.fail(); fx.shake(2.5); }
  function next() {
    interstitialThen(() => {
      if (E.daily) { E.state = 'title'; return; }
      if (E.cur + 1 >= total()) { E.state = 'ending'; save(); return; }
      startLevel(E.cur + 1);
    });
  }
  function doHint() {
    if (E.state !== 'play' || !game.hint || L.hint >= 3) return;
    const w = worldOf(E.cur), free = !E.data.fh[w];
    const give = () => { L.hint++; L.idle = 0; L.confirm = null; sfx.chime(1046); };
    if (free) { E.data.fh[w] = 1; save(); give(); toast('Free hint for this world!'); return; }
    L.confirm = { title: 'Need a hint?', body: L.hint === 0 ? 'Highlights the key move' : L.hint === 1 ? 'Shows the whole route' : 'Plays the full solution', ok: '▶ Watch ad for a hint', act: () => rewarded('hint', give, () => { L.confirm = null; }) };
  }
  function doRewind() { if (L.rewindUsed || !game.rewind) return; rewarded('rewind', () => { L.rewindUsed = true; if (game.rewind()) { E.state = 'play'; L.offer = true; sfx.whoosh(); toast('Rewound!'); } else retry(); }); }
  function doSkip() { rewarded('skip-level', () => { setSkip(E.cur, true); E.data.u = Math.max(E.data.u, Math.min(total() - 1, E.cur + 1)); save(); toast('Level skipped. Replay it any time for stars'); if (E.cur + 1 >= total()) E.state = 'ending'; else startLevel(E.cur + 1); }); }
  function doDouble() { if (L.doubled) return; rewarded('double-coins', () => { L.doubled = true; E.data.c += L.coins; L.coins *= 2; save(); sfx.coin(); }); }
  const canRewind = () => !L.rewindUsed && game.rewind && (!game.canRewind || game.canRewind());

  // ---------------- input ----------------
  const ptr = { down: false, id: -1, sx: 0, sy: 0, x: 0, y: 0, touch: false, kb: false };
  const LEAD = () => Math.round(E.S * 3.4);
  let buttons = [], prevButtons = [];
  function btn(id, x, y, w, h, label, o = {}) { buttons.push({ id, x, y, w, h, act: o.act }); drawBtn(x, y, w, h, label, o); }
  function drawBtn(x, y, w, h, label, o) {
    const g = ctx, hot = hover && hover.x >= x && hover.x <= x + w && hover.y >= y && hover.y <= y + h;
    g.save(); const col = o.col || (game && game.accent) || '#ffb84d';
    rrect(g, x, y + 3, w, h, h * .32); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
    rrect(g, x, y, w, h, h * .32); g.fillStyle = o.ghost ? 'rgba(255,255,255,.12)' : col; g.fill();
    if (!o.ghost) { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(.5, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fill(); }
    g.lineWidth = hot ? 3 : 1.5; g.strokeStyle = o.ghost ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.35)'; g.stroke();
    if (o.pulse) { g.globalAlpha = .5 + .5 * Math.sin(E.t * 6); g.lineWidth = 3; g.strokeStyle = '#fff'; rrect(g, x - 3, y - 3, w + 6, h + 6, h * .36); g.stroke(); g.globalAlpha = 1; }
    text(label, x + w / 2, y + h / 2 + 1, o.size || Math.min(h * .42, E.S * 1.05), { color: o.tc || (o.ghost ? '#fff' : '#26150a'), shadow: false, max: w - 10, weight: 800 });
    g.restore();
  }
  let hover = null;
  function hit(x, y) { for (let i = prevButtons.length - 1; i >= 0; i--) { const b = prevButtons[i]; if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) return b; } return null; }
  function press(b) { if (!b || ADS.busy) return; initAudio(); sfx.click(); if (b.act) b.act(); }
  function effPoint(e) { let x = e.clientX, y = e.clientY; if (ptr.touch && game && game.lead) y -= LEAD(); return [x, y]; }
  cv.addEventListener('pointerdown', (e) => {
    if (E.sdkPaused || ADS.busy) return; initAudio(); safe(() => cv.focus({ preventScroll: true }));
    const b = hit(e.clientX, e.clientY); if (b) { press(b); return; }
    if (E.state === 'title') { startLevel(Math.min(E.data.u, total() - 1)); return; }
    if (E.state === 'clear' && L.endT > .8 && !L.confirm) { return; }
    if (E.state === 'paused') { E.state = 'play'; return; }
    if (E.state !== 'play' || L.confirm || ptr.down) return;
    ptr.touch = e.pointerType !== 'mouse'; ptr.down = true; ptr.id = e.pointerId; ptr.kb = false; ptr.sx = e.clientX; ptr.sy = e.clientY;
    const [x, y] = effPoint(e); ptr.x = x; ptr.y = y; L.idle = 0; L.tutT = Math.max(L.tutT, 3.5);
    safe(() => cv.setPointerCapture(e.pointerId));
    if (game.down) { const [bx, by] = toBoard(x, y); safe2(() => game.down(bx, by)); }
  });
  cv.addEventListener('pointermove', (e) => {
    hover = { x: e.clientX, y: e.clientY }; if (!ptr.down || e.pointerId !== ptr.id || E.sdkPaused) return;
    ptr.sx = e.clientX; ptr.sy = e.clientY; const [x, y] = effPoint(e); ptr.x = x; ptr.y = y; L.idle = 0;
    if (E.state === 'play' && game.move) { const [bx, by] = toBoard(x, y); safe2(() => game.move(bx, by)); }
  });
  const upH = (e) => {
    if (!ptr.down || e.pointerId !== ptr.id) return; ptr.down = false;
    if (E.state === 'play' && game.up) { const [x, y] = effPoint(e); const [bx, by] = toBoard(x, y); safe2(() => game.up(bx, by)); }
  };
  cv.addEventListener('pointerup', upH); cv.addEventListener('pointercancel', (e) => { if (ptr.down && e.pointerId === ptr.id) cancelInput(); });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  function cancelInput() { if (ptr.down) { ptr.down = false; if (game && game.cancel) safe2(() => game.cancel()); } }
  function safe2(fn) { try { fn(); } catch (err) { console.error(err); logErr(); } }
  // keyboard: Esc/P pause (never preventDefault on Esc), H hint, R retry, Enter/Space = primary button; arrows -> game.key or a virtual cursor
  const kcur = { x: 50, y: 75, on: false };
  window.addEventListener('keydown', (e) => {
    if (E.sdkPaused || ADS.busy) return; initAudio(); const k = e.key;
    if (k === 'Escape' || k === 'p' || k === 'P') { if (L.confirm) L.confirm = null; else if (E.state === 'play') E.state = 'paused'; else if (E.state === 'paused') E.state = 'play'; else if (E.state === 'map' || E.state === 'shop') E.state = 'title'; return; }
    if (k === 'Enter' || k === ' ') {
      if (E.state === 'play' && !L.confirm && game.key && game.key(k) === true) { e.preventDefault(); return; }
      if (E.state === 'play' && !L.confirm && kcur.on) { e.preventDefault(); kbDown(); return; }
      const pr = prevButtons.find((b) => b.id === 'primary'); if (pr) { e.preventDefault(); press(pr); } else if (E.state === 'title') startLevel(Math.min(E.data.u, total() - 1)); return;
    }
    if (E.state !== 'play' || L.confirm) return;
    if (k === 'h' || k === 'H') { doHint(); return; }
    if (k === 'r' || k === 'R') { retry(); return; }
    if (game.key && game.key(k) === true) { if (k.startsWith('Arrow')) e.preventDefault(); return; }
    const st = 3.5, d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[k];
    if (d) { e.preventDefault(); if (!kcur.on) { kcur.on = true; if (game.cursorStart) { const c = game.cursorStart(); kcur.x = c[0]; kcur.y = c[1]; } } kcur.x = M.clamp(kcur.x + d[0], 0, B.w); kcur.y = M.clamp(kcur.y + d[1], 0, B.h); L.idle = 0; if (ptr.kb && ptr.down && game.move) safe2(() => game.move(kcur.x, kcur.y)); }
  });
  function kbDown() { // Space toggles a held press at the keyboard cursor
    if (!ptr.down) { ptr.down = true; ptr.kb = true; ptr.touch = false; if (game.down) safe2(() => game.down(kcur.x, kcur.y)); }
    else if (ptr.kb) { ptr.down = false; if (game.up) safe2(() => game.up(kcur.x, kcur.y)); }
  }
  window.addEventListener('blur', () => cancelInput());

  // ---------------- SDK pause / resume ----------------
  let raf = 0, last = 0, acc = 0;
  if (yt) {
    safe(() => yt.system.onPause(() => { E.sdkPaused = true; tPaused = true; cancelAnimationFrame(raf); raf = 0; cancelInput(); if (E.state === 'play') E.state = 'paused'; save(); if (A.ctx) { gain(); safe(() => A.ctx.suspend()); } }));
    safe(() => yt.system.onResume(() => { E.sdkPaused = false; if (A.ctx) { safe(() => A.ctx.resume()); gain(); } last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); flushHeld(); }));
  }

  // ---------------- UI screens ----------------
  function panel(x, y, w, h, o = {}) {
    const g = ctx; g.save(); rrect(g, x, y + 6, w, h, 22); g.fillStyle = 'rgba(0,0,0,.3)'; g.fill();
    rrect(g, x, y, w, h, 22); g.fillStyle = o.col || 'rgba(255,248,236,.97)'; g.fill(); g.lineWidth = 3; g.strokeStyle = o.edge || 'rgba(60,40,30,.5)'; g.stroke(); g.restore();
  }
  function coinPill(x, y) {
    const s = E.S, w = s * 5.6; rrect(ctx, x - w, y, w, s * 2, s); ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x - w + s, y + s, s * .62, 0, 7); ctx.fill(); ctx.strokeStyle = '#b07a10'; ctx.lineWidth = 2; ctx.stroke();
    text(String(E.data.c), x - w / 2 + s * .7, y + s, s * .95, { color: '#fff' });
  }
  function drawTitle() {
    const s = E.S, W = E.W, H = E.H, ty = H * .2;
    { let by = H < s * 26 ? H * .45 : H * .56; const top = ty + s * 3.8, bot = by - s * .4; E.hero = { x: W * .1, y: top, w: W * .8, h: Math.max(s * 4, bot - top) }; }
    if (game.drawTitle) safe2(() => game.drawTitle(ctx, W, H, E.t, E.hero)); text(game.title, W / 2, ty, Math.min(W * .11, s * 3.6), { font: game.titleFont || FONT, color: game.titleCol || '#fff6e0', stroke: game.titleStroke || '#2a1a10', sw: s * .5, max: W * .9 });
    text(game.tagline, W / 2, ty + s * 2.8, s * 1.05, { color: '#fff', stroke: 'rgba(0,0,0,.6)', sw: s * .3, weight: 700, max: W * .9 });
    coinPill(W - s * .6, s * .6);
    const bw = Math.min(W * .78, s * 18), bh = Math.max(48, s * 3), bx = (W - bw) / 2; let y = H * .56;
    if (H < s * 26) y = H * .45;
    const lv = Math.min(E.data.u, total() - 1);
    btn('primary', bx, y, bw, bh, E.data.done ? '▶ Play (all levels done!)' : `▶ Play · Level ${lv + 1} / ${total()}`, { act: () => startLevel(lv), size: s * 1.25 });
    const hw = (bw - s * .6) / 2, y2 = y + bh + s * .6, sh = Math.max(48, s * 2.6);
    btn('map', bx, y2, hw, sh, '☰ Levels', { ghost: true, act: () => { mapWorld = worldOf(Math.min(E.data.u, total() - 1)); E.state = 'map'; } });
    btn('shop', bx + hw + s * .6, y2, hw, sh, '🎨 Styles', { ghost: true, act: () => { E.state = 'shop'; } });
    const canDaily = E.data.u > 0 || totalStars() > 0, done = E.data.dd === dayStr();
    if (canDaily) btn('daily', bx, y2 + sh + s * .6, bw, sh, done ? '★ Daily Remix (done today, replay)' : '★ Daily Remix · +40 coins', { col: '#7ee0ff', act: () => startLevel(M.hash(dayStr(), 'd') % Math.max(1, E.data.u + 1), true) });
    text(`★ ${totalStars()} / ${total() * 3}`, W / 2, H - s * 1.4, s * .9, { color: 'rgba(255,255,255,.85)', weight: 700 });
  }
  function drawMap() {
    const s = E.S, W = E.W, H = E.H; ctx.fillStyle = 'rgba(10,8,20,.72)'; ctx.fillRect(0, 0, W, H);
    const nw = Math.ceil(total() / wsz()); mapWorld = M.clamp(mapWorld, 0, nw - 1);
    text(`${worldName(mapWorld)}`, W / 2, s * 2, s * 1.5, { color: '#fff', max: W * .6 });
    text(`World ${mapWorld + 1} / ${nw}`, W / 2, s * 3.5, s * .85, { color: 'rgba(255,255,255,.75)', weight: 600 });
    const bs = Math.max(48, s * 2.6);
    if (mapWorld > 0) btn('wprev', s * .6, s * .8, bs, bs, '‹', { ghost: true, act: () => mapWorld-- });
    if (mapWorld < nw - 1) btn('wnext', W - s * .6 - bs, s * .8, bs, bs, '›', { ghost: true, act: () => mapWorld++ });
    const n0 = mapWorld * wsz(), n = Math.min(wsz(), total() - n0), cols = W > H * 1.2 ? 10 : 5, rows = Math.ceil(n / cols);
    const top = s * 5, avH = H - top - s * 4.2, cell = Math.max(44, Math.min((W - s * 2) / cols, avH / rows, s * 4.2)), gx = (W - cell * cols) / 2;
    for (let k = 0; k < n; k++) {
      const i = n0 + k, x = gx + (k % cols) * cell, y = top + Math.floor(k / cols) * cell, lock = i > E.data.u, st = starsOf(i);
      btn('lv' + i, x + 3, y + 3, cell - 6, cell - 6, lock ? '🔒' : String(i + 1), { ghost: lock, col: skipped(i) ? '#c9b8ff' : (st === 3 ? '#ffd34d' : '#ffe7c2'), size: cell * .3, act: lock ? () => toast('Clear earlier levels first') : () => startLevel(i) });
      if (!lock) for (let j = 0; j < 3; j++) star(ctx, x + cell / 2 + (j - 1) * cell * .2, y + cell - cell * .2, cell * .085, j < st ? '#ffb000' : 'rgba(0,0,0,.25)');
      if (skipped(i)) text('⤳', x + cell - cell * .22, y + cell * .22, cell * .22, { color: '#5a3ab0', shadow: false });
    }
    btn('primary', W / 2 - s * 5, H - s * 3.6, s * 10, Math.max(48, s * 2.6), '‹ Back', { ghost: true, act: () => E.state = 'title' });
  }
  function drawShop() {
    const s = E.S, W = E.W, H = E.H; ctx.fillStyle = 'rgba(10,8,20,.75)'; ctx.fillRect(0, 0, W, H);
    text('Styles', W / 2, s * 2, s * 1.6, { color: '#fff' }); coinPill(W - s * .6, s * .6);
    const list = game.skins || [], cols = W > H * 1.2 ? 4 : 2, per = cols * 2, pages = Math.ceil(list.length / per); shopPage = M.clamp(shopPage, 0, pages - 1);
    const top = s * 4, cw = Math.min((W - s * 2) / cols, s * 9), ch = Math.min((H - top - s * 5) / 2, s * 10), gx = (W - cw * cols) / 2;
    for (let k = 0; k < per; k++) {
      const i = shopPage * per + k; if (i >= list.length) break; const sk = list[i], x = gx + (k % cols) * cw + s * .3, y = top + Math.floor(k / cols) * ch + s * .3, w = cw - s * .6, h = ch - s * .6;
      const own = E.data.own.includes(i), sel = E.data.sel === i;
      rrect(ctx, x, y, w, h, s); ctx.fillStyle = sel ? 'rgba(255,214,120,.95)' : 'rgba(255,248,236,.92)'; ctx.fill(); ctx.lineWidth = sel ? 4 : 2; ctx.strokeStyle = sel ? '#ff9a00' : 'rgba(0,0,0,.3)'; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h - s * 3); ctx.clip();
      if (game.drawSkin) safe2(() => game.drawSkin(ctx, i, x + w / 2, y + (h - s * 3) / 2 + s * .3, Math.min(w, h - s * 3) * .42));
      else { ctx.fillStyle = sk.col || '#888'; ctx.beginPath(); ctx.arc(x + w / 2, y + (h - s * 3) / 2, Math.min(w, h) * .2, 0, 7); ctx.fill(); }
      ctx.restore();
      text(sk.name, x + w / 2, y + h - s * 2.3, s * .9, { color: '#2a1a10', shadow: false, max: w - 8 });
      const cost = sk.cost !== undefined ? sk.cost : [0, 60, 120, 200, 300, 420, 560, 750, 900, 1100][i] || 999;
      btn('sk' + i, x + s * .4, y + h - s * 1.6, w - s * .8, Math.max(30, s * 1.4), sel ? 'Equipped' : own ? 'Equip' : `${cost} coins`, { col: own ? '#9be37a' : (E.data.c >= cost ? '#ffd34d' : '#d8cfc4'), size: s * .8, act: () => {
        if (own) { E.data.sel = i; save(); return; }
        if (E.data.c >= cost) { E.data.c -= cost; E.data.own.push(i); E.data.sel = i; sfx.coin(); toast(`Unlocked ${sk.name}!`); save(); } else { toast(`Need ${cost - E.data.c} more coins. Clear levels to earn them`); }
      } });
    }
    const bs = Math.max(48, s * 2.6);
    if (shopPage > 0) btn('sp', s * .6, H - s * 3.6, bs, bs, '‹', { ghost: true, act: () => shopPage-- });
    if (shopPage < pages - 1) btn('sn', W - s * .6 - bs, H - s * 3.6, bs, bs, '›', { ghost: true, act: () => shopPage++ });
    btn('primary', W / 2 - s * 5, H - s * 3.6, s * 10, bs, '‹ Back', { ghost: true, act: () => E.state = 'title' });
  }
  function drawHUD() {
    const s = E.S, W = E.W, bs = Math.max(48, s * 2.6), y = s * .5;
    btn('menu', s * .5, y, bs, bs, '☰', { ghost: true, act: () => { if (E.state === 'play') E.state = 'paused'; } });
    const pulse = L.hint < 3 && (L.idle > 30 || L.fails >= 2), hx = W - s * .5 - bs;
    if (game.hint) btn('hint', hx, y, bs, bs, L.hint >= 3 ? '💡✓' : '💡', { col: '#fff1a8', pulse, act: doHint });
    btn('retry', hx - bs - s * .4, y, bs, bs, '↺', { ghost: true, act: retry });
    const cx = W / 2, avail = W - (bs * 3 + s * 3) * 2 + bs * 2;
    text(E.daily ? 'Daily Remix' : `Level ${E.cur + 1} / ${total()}`, cx, y + s * .95, s * 1.15, { color: '#fff', stroke: 'rgba(0,0,0,.55)', sw: s * .3, max: Math.max(80, avail) });
    const goal = game.goal ? game.goal() : ''; text((E.daily ? '' : worldName(worldOf(E.cur)) + ' · ') + goal, cx, y + s * 2.35, s * .72, { color: '#fff8e0', stroke: 'rgba(0,0,0,.55)', sw: s * .25, weight: 700, max: Math.max(80, W - s * 1.5 - (game.hint ? bs * 2 : bs) * 2) });
    if (L.hint > 0) text(`Hint ${L.hint}/3`, hx + bs / 2, y + bs + s * .5, s * .6, { color: '#fff1a8', stroke: '#000', sw: 3 });
  }
  function confirmBox() {
    const c = L.confirm; if (!c) return; const s = E.S, W = E.W, H = E.H; ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
    const w = Math.min(W * .86, s * 20), h = s * 11.5, x = (W - w) / 2, y = (H - h) / 2; panel(x, y, w, h);
    text(c.title, W / 2, y + s * 1.8, s * 1.4, { color: '#2a1a10', shadow: false }); text(c.body, W / 2, y + s * 3.6, s * .9, { color: '#5a4030', shadow: false, weight: 600, max: w - s * 2 });
    btn('primary', x + s, y + s * 5, w - s * 2, Math.max(48, s * 2.6), c.ok, { col: '#7ee0ff', act: c.act });
    btn('nothanks', x + s, y + s * 8.2, w - s * 2, Math.max(44, s * 2.2), 'No thanks', { ghost: true, tc: '#5a4030', act: () => { L.confirm = null; } });
  }
  function endPanel(kind) {
    const s = E.S, W = E.W, H = E.H, k = M.easeBack(M.clamp((L.endT - (kind === 'clear' ? 0 : 0)) / .45, 0, 1));
    const w = Math.min(W * .9, s * 21), bh = Math.max(48, s * 2.6), offers = kind === 'fail' ? ((canRewind() ? 1 : 0) + (L.fails >= 2 ? 1 : 0)) : 1;
    const h = s * 7 + bh * (1 + (L.offer ? offers : 0)) + s * .7 * (offers + 1) + (L.offer && offers ? bh : 0);
    const x = (W - w) / 2, y = H - h - s * .8 + (1 - k) * (h + s * 2); panel(x, y, w, h);
    let cy = y + s * 1.8;
    if (kind === 'clear') {
      text(E.daily ? 'Daily Remix done!' : (game.clearLines ? game.clearLines[M.hash(E.cur, 'c') % game.clearLines.length] : 'Level clear!'), W / 2, cy, s * 1.5, { color: '#2a1a10', shadow: false, max: w - s * 2 }); cy += s * 2.2;
      for (let j = 0; j < 3; j++) { const tt = M.clamp((L.endT - .3 - j * .22) / .3, 0, 1), on = j < L.stars, sc = on ? M.easeBack(tt) : 1; star(ctx, W / 2 + (j - 1) * s * 2.6, cy, s * 1.05 * (on ? sc : 1), on && tt > 0 ? '#ffb000' : '#d9cbb8', '#6a4a20'); }
      cy += s * 1.9; text(`+${L.coins} coins${L.doubled ? ' (2×)' : ''}${L.newStars && !L.firstClear ? ' · new stars!' : ''}`, W / 2, cy, s * .95, { color: '#7a4a00', shadow: false });
      cy += s * 1.3;
      if (L.offer && !L.doubled && L.coins > 0) {
        btn('double', x + s, cy, w - s * 2, bh, `▶ Watch ad: 2× coins (+${L.coins})`, { col: '#7ee0ff', act: doDouble }); cy += bh + s * .5;
        btn('nothanks', x + s, cy, w - s * 2, bh * .85, 'No thanks', { ghost: true, tc: '#5a4030', act: () => { L.offer = false; } }); cy += bh * .85 + s * .5;
      }
      const last = !E.daily && E.cur + 1 >= total();
      const hw = (w - s * 2.5) / 2; btn('replay', x + s, cy, hw * .7, bh, '↺', { ghost: true, tc: '#5a4030', act: () => startLevel(E.cur, E.daily) });
      btn('primary', x + s * 1.5 + hw * .7, cy, w - s * 2.5 - hw * .7, bh, E.daily ? 'Done ▶' : last ? 'Finish ▶' : 'Next level ▶', { act: next });
    } else {
      text(L.msg, W / 2, cy, s * 1.35, { color: '#a02020', shadow: false, max: w - s * 2, font: COMIC }); cy += s * 2.1;
      text(L.fails >= 2 ? `Tries: ${L.fails}. Use 💡 for a hint` : 'Give it another go!', W / 2, cy, s * .85, { color: '#5a4030', shadow: false, weight: 600 }); cy += s * 1.6;
      if (L.offer && offers) {
        if (canRewind()) { btn('rewind', x + s, cy, w - s * 2, bh, '▶ Watch ad: rewind before the mistake', { col: '#7ee0ff', act: doRewind }); cy += bh + s * .5; }
        if (L.fails >= 2) { btn('skip', x + s, cy, w - s * 2, bh, '▶ Watch ad: skip this level', { col: '#c9b8ff', act: doSkip }); cy += bh + s * .5; }
        btn('nothanks', x + s, cy, w - s * 2, bh * .85, 'No thanks', { ghost: true, tc: '#5a4030', act: () => { L.offer = false; } }); cy += bh * .85 + s * .5;
      }
      btn('primary', x + s, cy, w - s * 2, bh, '↺ Try again', { act: retry });
    }
  }
  function drawPause() {
    const s = E.S, W = E.W, H = E.H; ctx.fillStyle = 'rgba(8,6,16,.62)'; ctx.fillRect(0, 0, W, H);
    const w = Math.min(W * .8, s * 17), bh = Math.max(48, s * 2.7), h = s * 4 + bh * 3 + s * 1.6, x = (W - w) / 2, y = (H - h) / 2; panel(x, y, w, h);
    text('Paused', W / 2, y + s * 2, s * 1.7, { color: '#2a1a10', shadow: false }); let cy = y + s * 3.6;
    btn('primary', x + s, cy, w - s * 2, bh, '▶ Resume', { act: () => { E.state = 'play'; } }); cy += bh + s * .8;
    btn('pr', x + s, cy, w - s * 2, bh, '↺ Restart level', { ghost: true, tc: '#5a4030', act: retry }); cy += bh + s * .8;
    btn('pm', x + s, cy, w - s * 2, bh, '☰ Levels', { ghost: true, tc: '#5a4030', act: () => { mapWorld = worldOf(E.cur); E.state = 'map'; } });
  }
  function drawEnding() {
    const s = E.S, W = E.W, H = E.H; ctx.fillStyle = 'rgba(8,6,16,.6)'; ctx.fillRect(0, 0, W, H); fx.confetti(B.w / 2, B.h * .3, 1);
    const w = Math.min(W * .9, s * 21), h = s * 15, x = (W - w) / 2, y = (H - h) / 2; panel(x, y, w, h);
    text('You finished every level!', W / 2, y + s * 2.2, s * 1.4, { color: '#2a1a10', shadow: false, max: w - s * 2 });
    text(`All ${total()} levels done · ★ ${totalStars()} / ${total() * 3}`, W / 2, y + s * 4.4, s * .95, { color: '#5a4030', shadow: false, weight: 700 });
    text('There are no more new levels.', W / 2, y + s * 6, s * .9, { color: '#5a4030', shadow: false, weight: 600 });
    text('Come back for a fresh Daily Remix every day.', W / 2, y + s * 7.3, s * .9, { color: '#5a4030', shadow: false, weight: 600, max: w - s * 2 });
    btn('primary', x + s, y + s * 9, w - s * 2, Math.max(48, s * 2.6), '☰ Levels (collect missing stars)', { act: () => { E.state = 'map'; } });
    btn('et', x + s, y + s * 12, w - s * 2, Math.max(44, s * 2.2), 'Title screen', { ghost: true, tc: '#5a4030', act: () => { E.state = 'title'; } });
  }

  // ---------------- main loop ----------------
  const STEP = 1 / 60;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = (now - last) / 1000; last = now; if (!(dt > 0)) dt = 0; if (dt > .1) dt = .1;
    if (E.sdkPaused) return;
    if (!ADS.busy && E.state !== 'paused') {
      E.t += dt; musicTick();
      if (E.state === 'play') { L.t += dt; L.idle += dt; L.tutT += dt; ADS.playSince += dt; }
      if (E.state === 'won' || E.state === 'failing' || E.state === 'clear' || E.state === 'fail') L.endT += dt;
      if (E.state === 'won' && L.endT > (game.winDelay || 1.5)) { E.state = 'clear'; L.endT = 0; L.offer = true; }
      if (E.state === 'failing' && L.endT > (game.failDelay || 1.3)) { E.state = 'fail'; L.endT = 0; L.offer = true; }
      if (['play', 'won', 'failing', 'clear', 'fail'].includes(E.state)) { acc += dt; let n = 0; while (acc >= STEP && n < 6) { safe2(() => game.step(STEP)); acc -= STEP; n++; } if (n >= 6) acc = 0; }
      else if (game.stepTitle) safe2(() => game.stepTitle(dt));
      fx.update(dt); toastT += dt;
    }
    render();
  }
  function render() {
    const g = ctx; g.setTransform(E.DPR, 0, 0, E.DPR, 0, 0); prevButtons = buttons; buttons = [];
    safe2(() => game.drawBg(g, E.W, E.H, E.t));
    const inLevel = ['play', 'won', 'failing', 'clear', 'fail', 'paused'].includes(E.state) || (E.state === 'map' && game._loaded) || (E.state === 'ending');
    if (inLevel && game._loaded) {
      g.save(); const sx = shake ? (Math.random() - .5) * shake * 2 : 0, sy = shake ? (Math.random() - .5) * shake * 2 : 0;
      g.translate(B.x + sx * B.s, B.y + sy * B.s); g.scale(B.s, B.s);
      safe2(() => game.draw(g, E.t, E.state)); fx.draw(g);
      if (E.state === 'play' && L.hint > 0 && game.hint) safe2(() => game.hint(g, L.hint, L.t));
      g.restore();
      // lead cursor (ahead of finger) for touch drags, and keyboard cursor
      if (E.state === 'play' && ptr.down && ptr.touch && game.lead) {
        g.save(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(ptr.sx, ptr.sy - 8); g.lineTo(ptr.x, ptr.y + 10); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(ptr.x, ptr.y, 10, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,.25)'; g.fill(); g.restore();
      }
      if (E.state === 'play' && kcur.on) { const [x, y] = toScreen(kcur.x, kcur.y); g.save(); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 9, 0, 7); g.moveTo(x - 14, y); g.lineTo(x - 5, y); g.moveTo(x + 5, y); g.lineTo(x + 14, y); g.stroke(); if (ptr.down && ptr.kb) { g.fillStyle = 'rgba(255,255,255,.5)'; g.fill(); } g.restore(); }
    }
    if (E.state === 'title') drawTitle();
    else if (E.state === 'map') drawMap();
    else if (E.state === 'shop') drawShop();
    else if (E.state === 'ending') drawEnding();
    else if (game._loaded) {
      drawHUD();
      if (E.state === 'play' && L.tut && L.tutT < 7) { const s = E.S, a = M.clamp(Math.min(L.tutT * 3, 7 - L.tutT), 0, 1), w = Math.min(E.W * .92, s * 24), x = (E.W - w) / 2, y = E.H - s * 4.2; g.save(); g.globalAlpha = a; rrect(g, x, y, w, s * 3.2, s); g.fillStyle = 'rgba(20,14,30,.82)'; g.fill(); text(L.tut, E.W / 2, y + s * 1.6, s * .95, { color: '#fff', max: w - s * 1.5, weight: 700 }); g.restore(); }
      if (E.state === 'clear') endPanel('clear'); else if (E.state === 'fail') endPanel('fail'); else if (E.state === 'paused') drawPause();
      if (E.state === 'play' || E.state === 'fail' || E.state === 'clear') confirmBox();
    }
    if (toastT < 2.6) { const s = E.S, a = M.clamp(Math.min(toastT * 4, (2.6 - toastT) * 3), 0, 1); g.save(); g.globalAlpha = a; g.font = `800 ${s * .9}px ${FONT}`; const w = Math.min(E.W * .92, g.measureText(toastS).width + s * 2); rrect(g, (E.W - w) / 2, s * 4.6, w, s * 2, s); g.fillStyle = 'rgba(20,14,30,.88)'; g.fill(); text(toastS, E.W / 2, s * 5.6, s * .9, { color: '#fff', max: w - s }); g.restore(); }
    if (ADS.busy) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, E.W, E.H); text('Ad break…', E.W / 2, E.H / 2, E.S * 1.2, { color: '#fff' }); }
  }
  function splash() {
    ctx.setTransform(E.DPR, 0, 0, E.DPR, 0, 0); const gr = ctx.createLinearGradient(0, 0, 0, E.H); gr.addColorStop(0, game.bg0 || '#2a1d3a'); gr.addColorStop(1, game.bg1 || '#0b0712');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, E.W, E.H); text(game.title, E.W / 2, E.H / 2 - E.S * 1.5, E.S * 2.4, { color: '#fff6e0', max: E.W * .9 }); text('Loading…', E.W / 2, E.H / 2 + E.S * 1.5, E.S, { color: 'rgba(255,255,255,.7)' });
  }
  async function run(g) {
    game = g; window.addEventListener('resize', resize); resize(); splash(); safe(() => yt.game.firstFrameReady()); if (inEnv) safe(() => initAudio()); // starts muted-by-gain until isAudioEnabled allows; resumes on first gesture if the browser kept it suspended
    const lp = loadSave(); await Promise.race([lp, new Promise((r) => setTimeout(r, 4000))]);
    if (!loadDone) E.data = sanitize({}); // saves stay blocked until loadData resolves, then progress is merged
    E.started = true; if (game.init) safe2(() => game.init());
    const ld = game.load; game.load = (i, seed) => { ld.call(game, i, seed); game._loaded = true; };
    safe2(() => game.load(Math.min(E.data.u, total() - 1), 0));
    E.state = 'title'; last = performance.now(); raf = requestAnimationFrame((t) => { loop(t); safe(() => yt.game.gameReady()); });
  }
  Object.assign(E, {
    later, run, M, fx, sfx, text, rrect, blob, star, face, baked, unbake, sprite, blit, blitC, screenBg, makeCanvas, texture, pat, TEX, FONT, SERIF, COMIC,
    win, fail, toast, save, startLevel, retry, next, B, toBoard, toScreen, rewarded, doHint, doSkip, doRewind, doDouble,
    skin: () => E.data.sel | 0, starsOf, skipped, total: () => total(), worldOf, worldName,
  });
  Object.defineProperties(E, {
    game: { get: () => game }, L: { get: () => L }, ADS: { get: () => ADS }, ptr: { get: () => ptr },
    hintStep: { get: () => L.hint }, _btns: { get: () => prevButtons }, fails: { get: () => L.fails }, tries: { get: () => L.tries }, loadDone: { get: () => loadDone },
  });
  return E;
})();
