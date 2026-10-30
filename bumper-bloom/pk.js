/* PK3 — shared Playables runtime (batch 3, forked from pk2): SDK glue, canvas, input, audio, fx, meta-progression,
   ads at natural breaks only (interstitials >= 30 s apart, revive once per stage, 2x coins, opt-in pre-match boost).
   natural transition points only. Plain readable JS (no obfuscation). */
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

  // ---------- canvas ----------
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-label', 'game canvas');
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const E = { cv, ctx, W: 0, H: 0, DPR: 1, U: 1, t: 0, state: 'boot', data: {}, best: 0, inEnv, gl: null, glc: null, GDPR: 1 };
  const ADS = { busy: false, play: 0, last: -1e9, lastI: -1e9 };
  let glc = null;
  function setupGL() {
    glc = document.createElement('canvas'); glc.setAttribute('aria-hidden', 'true');
    glc.style.cssText = 'position:fixed;left:0;top:0;'; cv.style.position = 'fixed'; cv.style.left = '0'; cv.style.top = '0';
    document.body.insertBefore(glc, cv); E.glc = glc;
    E.gl = glc.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' }) || null;
    glc.addEventListener('webglcontextlost', (e) => e.preventDefault());
    glc.addEventListener('webglcontextrestored', () => { if (game && game.glRestore) safe(() => game.glRestore()); });
  }
  let game = null;

  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    E.DPR = Math.min(window.devicePixelRatio || 1, E.dprCap || 1.75);
    E.W = w; E.H = h; E.U = Math.min(w, h) / 100; E.S = Math.max(12, Math.min(28, Math.min(w, h) / 24));
    cv.width = Math.round(w * E.DPR); cv.height = Math.round(h * E.DPR);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    if (glc) { E.GDPR = Math.min(E.DPR, 2); glc.width = Math.round(w * E.GDPR); glc.height = Math.round(h * E.GDPR); glc.style.width = w + 'px'; glc.style.height = h + 'px'; }
    buildOverlays();
    if (game && game.resize && E.state !== 'boot') game.resize(w, h);
  }

  // ---------- math / utils ----------
  const M = {
    clamp: (v, a, b) => v < a ? a : v > b ? b : v,
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a),
    irand: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    easeBack: (t) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    elastic: (t) => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * 2.0944) + 1,
    approach: (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt)),
    rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; },
    hsl: (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`,
  };
  // smooth value noise (1D/2D) for organic motion & textures
  const P = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
  const fade = (t) => t * t * (3 - 2 * t);
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const h = (a, b) => P[(P[a & 255] + b) & 511] / 255;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    const u = fade(xf), v = fade(yf);
    return M.lerp(M.lerp(a, b, u), M.lerp(c, d, u), v);
  }
  function fbm(x, y, oct = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2; a *= .5; } return s / (1 - Math.pow(.5, oct)); }
  function pnoise2(x, y, p) { // periodic noise (tileable with period p)
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, m = (v) => ((v % p) + p) % p;
    const h = (a, b) => P[(P[m(a) & 255] + m(b)) & 511] / 255;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1), u = fade(xf), v = fade(yf);
    return M.lerp(M.lerp(a, b, u), M.lerp(c, d, u), v);
  }
  function pfbm(x, y, p, oct = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += a * pnoise2(x * f, y * f, p * f); f *= 2; a *= .5; } return s / (1 - Math.pow(.5, oct)); }
  M.noise2 = noise2; M.fbm = fbm; M.pfbm = pfbm;

  // ---------- procedural textures ----------
  const texCache = {};
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  /** texture(key, w, h, fn(x,y,nx,ny)->[r,g,b,a]) pixel shader into an offscreen canvas */
  function texture(key, w, h, fn) {
    if (key && texCache[key]) return texCache[key];
    const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const col = fn(x, y, x / c.width, y / c.height); const i = (y * c.width + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3] === undefined ? 255 : col[3];
    }
    g.putImageData(img, 0, 0); if (key) texCache[key] = c; return c;
  }
  /** tileable texture: fn(v, nx, ny, x, y) -> [r,g,b,a], v = periodic fbm in 0..1 */
  function tile(key, size, period, fn, oct = 4) { return texture(key, size, size, (x, y, nx, ny) => fn(pfbm(nx * period, ny * period, period, oct), nx, ny, x, y)); }
  function pattern(g, c) { return g.createPattern(c, 'repeat'); }
  function glowSprite(color, size = 64) {
    const key = 'glow' + color + size; if (texCache[key]) return texCache[key];
    const c = makeCanvas(size, size), g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, color); gr.addColorStop(.25, color.replace(/[\d.eE+-]+\)$/, '0.55)')); gr.addColorStop(1, color.replace(/[\d.eE+-]+\)$/, '0)')); // alpha may be in exponent form (e.g. 9e-5)
    g.fillStyle = gr; g.fillRect(0, 0, size, size); texCache[key] = c; return c;
  }
  function glow(g, x, y, r, color) { const s = glowSprite(color); g.drawImage(s, x - r, y - r, r * 2, r * 2); }
  let grainPat = null, vignetteC = null, vigFull = null;
  function buildOverlays() {
    if (!grainPat) {
      const n = texture('grain', 160, 160, () => { const v = Math.random() * 255; return [v, v, v, 255]; });
      grainPat = ctx.createPattern(n, 'repeat');
    }
    vignetteC = makeCanvas(256, 256); const g = vignetteC.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 182);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  function rrect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  /** blob path: organic wobbly circle */
  function blob(g, x, y, r, wob = .12, seed = 0, pts = 18, t = 0) {
    g.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = i / pts * Math.PI * 2, n = noise2(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3 + t);
      const rr = r * (1 + (n - .5) * 2 * wob), px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else { const pa = (i - .5) / pts * Math.PI * 2; g.quadraticCurveTo(x + Math.cos(pa) * rr * 1.02, y + Math.sin(pa) * rr * 1.02, px, py); }
    }
    g.closePath();
  }
  const FONT = '"Avenir Next","Segoe UI","Nunito","Trebuchet MS",system-ui,-apple-system,sans-serif';
  const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Book Antiqua",serif';
  function text(str, x, y, size, o = {}) {
    const g = o.g || ctx;
    g.save(); const fnt = (sz) => `${o.italic ? 'italic ' : ''}${o.weight || 700} ${Math.max(8, sz)}px ${o.font || FONT}`; g.font = fnt(size);
    if (o.max) { const w = g.measureText(str).width; if (w > o.max) { size *= o.max / w; g.font = fnt(size); } }
    g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
    if (o.spacing && 'letterSpacing' in g) g.letterSpacing = o.spacing + 'px';
    g.globalAlpha *= (o.alpha === undefined ? 1 : o.alpha);
    // pk3 perf: cheap offset shadow instead of shadowBlur (blur is very expensive per glyph)
    if (o.shadow !== false) { g.fillStyle = (o.shadow && o.shadow.length === 7 && o.shadow[0] === '#') ? hexA(o.shadow, .55) : 'rgba(0,0,0,0.45)'; g.fillText(str, x, y + Math.max(1, size * .07)); }
    if (o.stroke) { g.lineWidth = size * .14; g.strokeStyle = o.stroke; g.lineJoin = 'round'; g.strokeText(str, x, y); }
    g.fillStyle = o.color || '#fff'; g.fillText(str, x, y); g.restore();
  }

  // ---------- particles & juice ----------
  const parts = [], floaters = [];
  let shakeAmt = 0;
  const fx = {
    burst(x, y, o = {}) {
      const n = o.n || 16;
      for (let i = 0; i < n; i++) {
        const a = o.angle !== undefined ? o.angle + M.rand(-(o.spread || Math.PI), o.spread || Math.PI) : M.rand(Math.PI * 2);
        const sp = M.rand(.3, 1) * (o.speed || 200);
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: M.rand(.6, 1) * (o.life || .8), size: M.rand(.5, 1) * (o.size || 4), color: Array.isArray(o.color) ? M.pick(o.color) : (o.color || 'rgba(255,240,200,1)'), grav: o.grav || 0, drag: o.drag === undefined ? 2 : o.drag, glow: o.glow !== false, shape: o.shape || 'dot' });
      }
    },
    text(x, y, str, color = '#fff', size) { floaters.push({ x, y, str, color, life: 0, size: size || E.S * 1.1 }); },
    shake(a) { shakeAmt = Math.max(shakeAmt, a); },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; } p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt); p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life += dt; if (f.life > 1.1) floaters.splice(i, 1); }
      shakeAmt *= Math.exp(-8 * dt); if (shakeAmt < .2) shakeAmt = 0;
      if (parts.length > 900) parts.splice(0, parts.length - 900);
    },
    draw(g) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        const k = 1 - p.life / p.max, r = p.size * (.4 + .6 * k);
        g.globalAlpha = k;
        if (p.glow) glow(g, p.x, p.y, r * 3, p.color);
        g.fillStyle = p.color;
        if (p.shape === 'petal') { g.save(); g.translate(p.x, p.y); g.rotate(p.life * 6 + p.size); g.beginPath(); g.ellipse(0, 0, r * 1.4, r * .6, 0, 0, 7); g.fill(); g.restore(); }
        else { g.beginPath(); g.arc(p.x, p.y, r * .6, 0, 7); g.fill(); }
      }
      g.restore();
      for (const f of floaters) { const k = f.life / 1.1; text(f.str, f.x, f.y - M.easeOut(k) * E.U * 8, f.size * (1 + .3 * (1 - Math.min(1, k * 4))), { color: f.color, alpha: 1 - k * k, g }); }
    },
    clear() { parts.length = 0; floaters.length = 0; },
  };

  // ---------- audio (WebAudio synthesis, gated by YouTube audio setting) ----------
  const A = { ctx: null, master: null, music: null, sfx: null, ytEnabled: true, nextNote: 0, step: 0 };
  if (yt) { safe(() => { A.ytEnabled = yt.system.isAudioEnabled(); }); safe(() => yt.system.onAudioEnabledChange((on) => { A.ytEnabled = on; applyGain(); })); }
  function applyGain() { if (!A.master) return; const on = A.ytEnabled && !E.sdkPaused && !ADS.busy; A.master.gain.setTargetAtTime(on ? 1 : 0, A.ctx.currentTime, .03); }
  function initAudio() {
    if (A.ctx) { if (A.ctx.state === 'suspended' && !E.sdkPaused) A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    A.ctx = new AC(); A.master = A.ctx.createGain(); A.master.gain.value = 0;
    const comp = A.ctx.createDynamicsCompressor(); A.master.connect(comp); comp.connect(A.ctx.destination);
    A.sfx = A.ctx.createGain(); A.sfx.gain.value = .55; A.sfx.connect(A.master);
    A.music = A.ctx.createGain(); A.music.gain.value = .22; A.music.connect(A.master);
    // soft feedback delay for space
    A.delay = A.ctx.createDelay(1); A.delay.delayTime.value = .28; const fb = A.ctx.createGain(); fb.gain.value = .32; const wet = A.ctx.createGain(); wet.gain.value = .35;
    A.delay.connect(fb); fb.connect(A.delay); A.delay.connect(wet); wet.connect(A.master);
    applyGain();
  }
  const audioOK = () => A.ctx && A.ctx.state === 'running' && A.ytEnabled && !E.sdkPaused && !ADS.busy;
  /** tone: f freq, f2 slide target, d duration, type, v volume, at offset, echo */
  function tone(o) {
    if (!audioOK()) return; const c = A.ctx, t = c.currentTime + (o.at || 0), d = o.d || .2;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f || 440, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + d);
    const v = (o.v || .3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.a || .008)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let node = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.dest || A.sfx); if (o.echo) g.connect(A.delay);
    osc.start(t); osc.stop(t + d + .05);
  }
  let noiseBuf = null;
  function noise(o) {
    if (!audioOK()) return; const c = A.ctx, t = c.currentTime + (o.at || 0), d = o.d || .2;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + d); f.Q.value = o.q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.v || .2, t + (o.a || .01)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(o.dest || A.sfx); if (o.echo) g.connect(A.delay); s.start(t); s.stop(t + d + .05);
  }
  const sfx = {
    tone, noise,
    pop(p = 1) { tone({ f: 520 * p, f2: 900 * p, d: .09, type: 'sine', v: .25 }); },
    chime(f = 880, v = .18) { tone({ f, d: .9, type: 'sine', v, echo: true }); tone({ f: f * 2.01, d: .5, type: 'sine', v: v * .3 }); },
    pluck(f = 440, v = .2) { tone({ f, d: .35, type: 'triangle', v, lp: 2400, echo: true }); },
    thud(v = .4) { tone({ f: 140, f2: 50, d: .25, type: 'sine', v }); noise({ f: 300, d: .12, v: v * .4, ft: 'lowpass' }); },
    whoosh(v = .15) { noise({ f: 400, f2: 2400, d: .35, v, q: .7 }); },
    splash(v = .25) { noise({ f: 1800, f2: 400, d: .5, v, q: .5 }); },
    fail() { tone({ f: 330, f2: 110, d: .6, type: 'triangle', v: .25, lp: 1200 }); },
    win() { [0, 4, 7, 12].forEach((n, i) => tone({ f: 523 * Math.pow(2, n / 12), d: .5, type: 'triangle', v: .15, at: i * .08, echo: true })); },
  };
  /** gentle generative music: set PK.musicCfg = {root, scale:[semitones], bpm, voice:'pad'|'pluck'|'bell'} */
  const MUSIC_DEFAULT = { root: 196, scale: [0, 2, 4, 7, 9, 12], bpm: 84, voice: 'bell', density: .55 };
  function musicTick() {
    if (!audioOK() || !game || !game.music) return; const cfg = Object.assign({}, MUSIC_DEFAULT, game.music);
    const c = A.ctx, spb = 60 / cfg.bpm / 2;
    if (A.nextNote < c.currentTime) A.nextNote = c.currentTime + .05;
    while (A.nextNote < c.currentTime + .25) {
      const at = A.nextNote - c.currentTime, s = A.step++;
      if (s % 16 === 0) { // bass/pad
        const deg = [0, 3, 4, 2][(s / 16 | 0) % 4]; const f = cfg.root / 2 * Math.pow(2, cfg.scale[deg % cfg.scale.length] / 12);
        tone({ f, d: spb * 15, type: 'sine', v: .12, at, a: .4, dest: A.music }); tone({ f: f * 1.5, d: spb * 14, type: 'triangle', v: .04, at, a: .6, lp: 900, dest: A.music });
      }
      if (Math.random() < cfg.density * (s % 2 === 0 ? 1 : .45)) {
        const n = cfg.scale[(Math.random() * cfg.scale.length) | 0] + (Math.random() < .3 ? 12 : 0); const f = cfg.root * Math.pow(2, n / 12);
        if (cfg.voice === 'pluck') tone({ f, d: .4, type: 'triangle', v: .07, at, lp: 2000, dest: A.music });
        else if (cfg.voice === 'pad') tone({ f, d: 1.4, type: 'sine', v: .05, at, a: .25, dest: A.music });
        else tone({ f, d: 1.1, type: 'sine', v: .06, at, dest: A.music });
      }
      A.nextNote += spb;
    }
  }

  // ---------- save / load via SDK (localStorage only outside Playables) ----------
  let loadDone = false; const LKEY = 'pk_save_' + location.pathname;
  async function loadSave() {
    let raw = null;
    try {
      if (inEnv) raw = await yt.game.loadData();
      else raw = safe(() => window.localStorage.getItem(LKEY));
    } catch (e) { safe(() => yt.health.logWarning()); }
    loadDone = true;
    try { E.data = raw ? JSON.parse(raw) : {}; } catch (e) { E.data = {}; }
    if (!E.data || typeof E.data !== 'object') E.data = {};
    E.best = Number(E.data.best) || 0;
    initMeta();
  }
  function save() {
    if (!loadDone) return; // never save before loadData resolved
    E.data.v = 1; E.data.best = E.best;
    const s = JSON.stringify(E.data);
    if (inEnv) { safe(() => yt.game.saveData(s).catch(() => {})); }
    else safe(() => window.localStorage.setItem(LKEY, s));
  }
  function sendScore(v) { if (yt && yt.engagement) safe(() => yt.engagement.sendScore({ value: Math.floor(v) }).catch(() => {})); }

  // ---------- meta-progression: coins, upgrades, collection, daily streak, rank, levels ----------
  const META = { toast: null, toastT: 9, earned: 0, doubled: false, sel: 0, rankUp: false };
  const meta = () => (game && game.meta) || {};
  const cur = () => meta().currency || '✦';
  const dayKey = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  function initMeta() {
    const d = E.data; d.coins = Math.max(0, Math.floor(Number(d.coins) || 0)); d.xp = Math.max(0, Math.floor(Number(d.xp) || 0));
    if (!d.up || typeof d.up !== 'object') d.up = {}; if (!Array.isArray(d.skins)) d.skins = [0]; if (!d.skins.includes(0)) d.skins.push(0);
    d.skin = d.skins.includes(d.skin | 0) ? d.skin | 0 : 0; d.level = Math.max(0, d.level | 0); if (!d.stars || typeof d.stars !== 'object') d.stars = {}; d.plays = d.plays | 0;
    if (!d.col || typeof d.col !== 'object') d.col = {}; d.gems = Math.max(0, Math.floor(Number(d.gems) || 0)); d.freeAt = +d.freeAt || 0; d.gemAt = +d.gemAt || 0;
    if (!loadDone) return;
    const now = new Date(), tk = dayKey(now), yk = dayKey(new Date(now.getTime() - 864e5));
    if (d.lastDay !== tk) {
      d.streak = d.lastDay === yk ? (d.streak | 0) + 1 : 1; d.lastDay = tk;
      const gift = (meta().daily || 30) * Math.min(7, d.streak), gg = Math.min(10, 2 * d.streak); d.coins += gift; d.gems += gg;
      toast(`Daily gift · day ${d.streak} streak · +${gift} ${cur()} +${gg} 💎`); save();
    }
    META.sel = d.skin;
  }
  function toast(str) { META.toast = str; META.toastT = 0; }
  const rankOf = (xp) => Math.floor(Math.sqrt(xp / 60)) + 1;
  const rankXp = (r) => (r - 1) * (r - 1) * 60;
  const upLevel = (id) => (E.data.up && E.data.up[id]) | 0;
  function upCost(u) { const l = upLevel(u.id); return l >= (u.max || 5) ? Infinity : Math.round(u.cost * Math.pow(l + 1, 1.6)); }
  const nope = () => sfx.tone({ f: 180, f2: 150, d: .14, type: 'triangle', v: .1 });
  function buyUp(i) {
    const u = (meta().upgrades || [])[i]; if (!u) return; const c = upCost(u);
    if (c === Infinity) { toast(`${u.name} is maxed`); return; }
    if (E.data.coins >= c) { E.data.coins -= c; E.data.up[u.id] = upLevel(u.id) + 1; sfx.win(); toast(`${u.name} → Lv ${E.data.up[u.id]}`); save(); }
    else { nope(); toast(`Need ${c - E.data.coins} more ${cur()}`); }
  }
  function skinAct(i) {
    const list = meta().skins || []; const sk = list[i]; if (!sk) return; const d = E.data; META.sel = i;
    if (d.skins.includes(i)) { d.skin = i; sfx.pop(1.2); save(); }
    else if (d.gems >= gemCost(sk)) { d.gems -= gemCost(sk); d.skins.push(i); d.skin = i; sfx.win(); toast(`Unlocked ${sk.name}!`); save(); }
    else { nope(); toast(`${sk.name}: ${gemCost(sk)} 💎 (have ${d.gems})`); }
  }
  // pk3 economy: skins cost gems (second currency); free-coin and free-gem rewarded buttons with cooldowns
  const gemCost = (sk) => sk.gems !== undefined ? sk.gems | 0 : (sk.cost ? Math.max(5, Math.round(sk.cost / 40)) : 0);
  const FREE_CD = 150e3, GEM_CD = 120e3;
  const freeAmt = () => Math.round((120 + Math.min(60, E.data.level | 0) * 30) / 10) * 10;
  const freeLeft = () => Math.max(0, (E.data.freeAt || 0) + FREE_CD - Date.now()), gemLeft = () => Math.max(0, (E.data.gemAt || 0) + GEM_CD - Date.now());
  function freeCoins() { if (freeLeft() > 0) { nope(); return; } const n = freeAmt(); rewarded(meta().freeId || 'free-coins', () => { E.data.coins += n; E.data.freeAt = Date.now(); sfx.win(); toast(`+${n} ${cur()} free coins`); save(); }); }
  function freeGems() { if (gemLeft() > 0) { nope(); return; } rewarded(meta().gemId || 'free-gems', () => { E.data.gems += 5; E.data.gemAt = Date.now(); sfx.win(); toast('+5 💎 gems'); save(); }); }
  /** collection: mark item discovered (returns true if new) */
  function collect(id) { if (E.data.col[id]) { E.data.col[id]++; return false; } E.data.col[id] = 1; save(); return true; }

  // ---------- state flow ----------
  let overT = 0, lastScore = 0, newBest = false, titleT = 0, clearT = 0, adPending = false, clearInfo = null;
  function takeBoost() { const b = !!E.boostArmed; E.boostArmed = false; E.boosted = b; return b; }
  function start() { initAudio(); fx.clear(); cancelInput(); E.revived = false; E.state = 'play'; E.userPaused = false; E.data.plays = (E.data.plays | 0) + 1; game.start(takeBoost()); sfx.tone({ f: 392, f2: 784, d: .25, type: 'triangle', v: .12 }); }
  function award(coins) { coins = Math.max(0, Math.floor(coins || 0)); const r0 = rankOf(E.data.xp); META.earned = coins; META.doubled = false; META.mult = 1; META.wheelLock = 0; META.revSkip = false; META.gemsEarned = 0; E.data.coins += coins; E.data.xp += coins; META.rankUp = rankOf(E.data.xp) > r0; }
  function gameOver(score, msg, coins) {
    if (E.state !== 'play') return; lastScore = Math.floor(score); newBest = lastScore > E.best;
    if (newBest) { E.best = lastScore; sendScore(E.best); }
    award(coins === undefined ? lastScore / (meta().coinDiv || 10) : coins);
    save(); E.state = 'over'; overT = 0; E.overMsg = msg || ''; adPending = true;
    if (newBest) sfx.win(); else sfx.fail();
  }
  /** level complete → results screen (a natural break point) → tap → game.nextLevel(level) */
  function levelClear(o = {}) {
    if (E.state !== 'play') return; const d = E.data, lv = d.level | 0, stars = M.clamp(o.stars | 0, 0, 3);
    d.stars[lv] = Math.max(d.stars[lv] | 0, stars); d.level = lv + 1;
    award(o.coins === undefined ? 10 + stars * 10 : o.coins);
    if (o.score !== undefined) { const v = Math.floor(o.score); if (v > E.best) { E.best = v; sendScore(v); } }
    META.gemsEarned = 1 + (stars >= 3 ? 1 : 0); d.gems = (d.gems | 0) + META.gemsEarned;
    clearInfo = { stars, msg: o.msg || 'Level clear!', lv: lv + 1, sub: o.sub || '' }; save(); E.state = 'clear'; clearT = 0; adPending = true; sfx.win();
  }
  function nextLevel() { E.state = 'play'; E.userPaused = false; E.revived = false; fx.clear(); cancelInput(); const b = takeBoost(); if (game.nextLevel) game.nextLevel(E.data.level | 0, b); else game.start(b); }
  function setBest(v) { v = Math.floor(v); if (v > E.best) { E.best = v; sendScore(v); save(); return true; } return false; }
  function setPaused(p) { if (E.state !== 'play') return; E.userPaused = p; if (p) save(); }
  const pauseBtn = () => ({ x: 10, y: 10, r: 24 });

  // ---------- ads: YouTube-provided functions only ----------
  // Interstitials: requested at EVERY level clear and game over, at the moment the player leaves the results
  // screen ("Next level" / "Play again"), i.e. at the natural transition between two different screens, never
  // during active play. While the request is pending the game stays on the results screen, input is blocked and
  // audio is muted; when it resolves (or fails, or 45 s pass) the next stage starts. Without the SDK it's a no-op.
  // Rewarded ads are opt-in via a clearly labelled button; "Play again" is always available without watching.
  const adsOK = () => !!(inEnv && yt && yt.ads);
  function maybeInterstitial(then) {
    adPending = false; if (!adsOK() || ADS.busy) { if (then) then(); return; }
    // pk3: interstitials at least meta.adGap seconds apart (default 30 s); a skipped one just proceeds
    const gap = (meta().adGap === undefined ? 30 : meta().adGap) * 1000; if (performance.now() - ADS.lastI < gap) { if (then) then(); return; }
    ADS.busy = true; ADS.play = 0; ADS.last = ADS.lastI = performance.now(); applyGain();
    let done = false; const fin = () => { if (done) return; done = true; ADS.busy = false; applyGain(); resetKeys(); if (then) then(); };
    try { Promise.resolve(yt.ads.requestInterstitialAd()).then(fin, fin); } catch (e) { fin(); }
    setTimeout(fin, 45000);
  }
  function rewarded(id, onReward, onFail) {
    if (!adsOK() || ADS.busy) { if (onFail) onFail(); return; } ADS.busy = true; applyGain();
    let done = false; const fin = (ok) => { if (done) return; done = true; ADS.busy = false; applyGain(); resetKeys(); if (ok === true) onReward(); else if (onFail) onFail(); };
    try { Promise.resolve(yt.ads.requestRewardedAd(id)).then(fin, () => fin(false)); } catch (e) { fin(false); }
    setTimeout(() => fin(false), 90000);
  }
  function proceed(fn) { if (adPending) maybeInterstitial(fn); else fn(); }
  // Optional rewarded "continue": only if the game implements revive(); once per run; opt-in button.
  // drop any held drag/aim state in the game (pointer released while not playing, or a new run/level begins)
  // pk3 input hygiene: a keyup can be swallowed (interstitial/rewarded overlay takes focus, window blur, state change).
  // Clear the runtime's held-key map AND tell the game every key is up, so no key stays "held" or "dead" afterwards.
  function resetKeys() { for (const k in keys) { if (keys[k] && game && game.key) try { game.key(k, false); } catch (e) { console.error(e); } keys[k] = false; } }
  function cancelInput() { pointers.clear(); resetKeys(); if (game && game.cancel) try { game.cancel(); } catch (e) { console.error(e); } }
  const canRev = () => !!game.revive && !E.revived && (!game.canRevive || game.canRevive());
  function boostAd() {
    if (!game.boostLabel || E.boostArmed) return;
    rewarded(meta().boostId || 'prematch-boost', () => { E.boostArmed = true; sfx.win(); toast(`Boost ready: ${game.boostLabel}`); });
  }
  function reviveRun() {
    if (!canRev() || E.state !== 'over') return;
    rewarded(meta().reviveId || 'continue-run', () => { E.revived = true; adPending = false; cancelInput(); E.state = 'play'; E.userPaused = false; fx.clear(); game.revive(); toast('Second chance!'); sfx.win(); });
  }
  // post-match multiplier wheel: the needle swings over x2 x3 x4 x3 x2; tapping the ad button locks the shown
  // multiplier and requests a rewarded ad; the bonus is paid only if the ad resolves true. "No thanks" just continues.
  const WSEG = [2, 3, 4, 3, 2];
  function doubleCoins() {
    if (META.doubled || META.earned <= 0 || META.wheelLock) return;
    const m = META.wheelMult || 2; META.wheelLock = m;
    rewarded(meta().rewardId || 'double-run-coins', () => { const bonus = META.earned * (m - 1); E.data.coins += bonus; META.doubled = true; META.mult = m; sfx.win(); toast(`×${m}! +${bonus} ${cur()}`); save(); }, () => { META.wheelLock = 0; });
  }
  function wheel(cx, cy, R) {
    const a0 = Math.PI * 1.1, a1 = Math.PI * 1.9, n = WSEG.length, sa = (a1 - a0) / n, cols = { 2: ['#3f7cff', '#2a4fb0'], 3: ['#36c977', '#1f8a4f'], 4: ['#ffb02e', '#c0700a'] };
    for (let i = 0; i < n; i++) { const m = WSEG[i]; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 + i * sa, a0 + (i + 1) * sa); ctx.closePath(); ctx.fillStyle = cols[m][i % 2 ? 1 : 0]; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.stroke();
      const am = a0 + (i + .5) * sa; text('×' + m, cx + Math.cos(am) * R * .68, cy + Math.sin(am) * R * .68, R * .2, { weight: 900, color: '#fff' }); }
    if (!META.wheelLock && !META.doubled) META.wheelAng = a0 + (a1 - a0) * (.5 + .5 * Math.sin(E.t * 2.6));
    const ang = META.wheelAng || (a0 + a1) / 2, idx = Math.max(0, Math.min(n - 1, Math.floor((ang - a0) / sa))); META.wheelMult = WSEG[idx];
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, R * .06); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * R * .96, cy + Math.sin(ang) * R * .96); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, R * .1, 0, 7); ctx.fill(); ctx.fillStyle = '#1b1230'; ctx.beginPath(); ctx.arc(cx, cy, R * .05, 0, 7); ctx.fill(); ctx.restore();
    return META.doubled ? META.mult : (META.wheelLock || META.wheelMult);
  }
  /** wheel + claim button + visible "No thanks"; returns height used */
  function rewardBlock(cx, y, w, onNo) {
    const s = E.S; if (!(adsOK() && !META.doubled && META.earned > 0)) return 0;
    const R = Math.min(w * .42, s * 5.2), m = wheel(cx, y + R, R), by = y + R + s * .6, bw = Math.min(w, s * 15), bh = s * 2.2;
    ctx.save(); rrect(ctx, cx - bw / 2, by, bw, bh, bh / 2); const gr = ctx.createLinearGradient(0, by, 0, by + bh); gr.addColorStop(0, '#5dffa0'); gr.addColorStop(1, '#1fae5c'); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
    text(META.wheelLock ? 'Loading ad…' : `▶ Claim ×${m}   +${META.earned * m} ${cur()}`, cx, by + bh / 2, s * .85, { weight: 900, color: '#0c2a18', shadow: false, max: bw * .9 }); btn(cx - bw / 2, by, bw, bh, doubleCoins);
    const ny = by + bh + s * 1.05; text('No thanks', cx, ny, s * .85, { weight: 700, color: 'rgba(255,255,255,.9)' }); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(cx - s * 2.6, ny + s * .55, s * 5.2, 1.5);
    btn(cx - s * 4, ny - s * .9, s * 8, s * 1.8, onNo); return R + s * 5.1;
  }
  function freeBtn(x, y) {
    const s = E.S; if (!adsOK()) return; const left = freeLeft(), w = s * 7.4, h = s * 1.9; ctx.save(); rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = left ? 'rgba(10,6,22,.55)' : 'rgba(40,170,90,.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke(); ctx.restore();
    text(left ? `⏱ ${Math.floor(left / 6e4)}:${String(Math.floor(left / 1e3) % 60).padStart(2, '0')}` : `▶ +${freeAmt()} ${cur()}`, x + w / 2, y + h / 2, s * .75, { weight: 800, color: '#fff', max: w * .9 }); if (!left) btn(x, y, w, h, freeCoins);
  }

  // ---------- UI buttons for title / results screens ----------
  let ui = [];
  const btn = (x, y, w, h, fn) => ui.push({ x, y, w, h, fn });
  function hitUI(x, y) { for (let i = ui.length - 1; i >= 0; i--) { const b = ui[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return true; } } return false; }

  // ---------- input ----------
  const pointers = new Map();
  function pos(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', (e) => {
    if (E.sdkPaused || E.state === 'boot' || ADS.busy) return; e.preventDefault(); safe(() => cv.setPointerCapture(e.pointerId)); initAudio();
    const [x, y] = pos(e); pointers.set(e.pointerId, true);
    if (E.state === 'title') { if (!hitUI(x, y)) start(); return; }
    if (E.state === 'over') { if (overT > .7 && !hitUI(x, y)) proceed(start); return; }
    if (E.state === 'clear') { if (clearT > .6 && !hitUI(x, y)) proceed(nextLevel); return; }
    if (E.userPaused) { E.userPaused = false; return; }
    const b = pauseBtn(); if (!game.noPause && Math.hypot(x - b.x - b.r, y - b.y - b.r) < b.r + 8) { setPaused(true); return; }
    game.down && game.down(x, y, e.pointerId);
  }, { passive: false });
  cv.addEventListener('pointermove', (e) => { if (E.sdkPaused || E.state !== 'play' || E.userPaused) return; const [x, y] = pos(e); game.move && game.move(x, y, e.pointerId, pointers.has(e.pointerId)); });
  const up = (e) => { if (!pointers.has(e.pointerId)) return; pointers.delete(e.pointerId); if (E.sdkPaused || E.state !== 'play' || E.userPaused) { cancelInput(); return; } const [x, y] = pos(e); game.up && game.up(x, y, e.pointerId); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (E.sdkPaused || E.state === 'boot' || ADS.busy) return;
    const k = e.key; // NOTE: never preventDefault on Escape (Playables requirement)
    if (k !== 'Escape' && (k.startsWith('Arrow') || k === ' ')) e.preventDefault();
    if (e.repeat && keys[k]) return; keys[k] = true; initAudio();
    if (k === 'Escape' || k === 'p' || k === 'P') { if (E.state === 'play' && !game.noPause) setPaused(!E.userPaused); return; }
    if (E.state === 'clear' && (k === 'r' || k === 'R')) { doubleCoins(); return; }
    if ((E.state === 'title' || E.state === 'clear') && (k === 'g' || k === 'G')) { boostAd(); return; }
    if (E.state === 'title' || E.state === 'over') {
      if ('123'.includes(k) && k.length === 1) { buyUp(+k - 1); return; }
      const n = (meta().skins || []).length;
      if (n && (k === 'ArrowLeft' || k === 'ArrowRight')) { META.sel = (META.sel + (k === 'ArrowLeft' ? n - 1 : 1)) % n; if (E.data.skins.includes(META.sel)) skinAct(META.sel); return; }
      if (n && (k === 'b' || k === 'B')) { skinAct(META.sel); return; }
      if (E.state === 'over' && (k === 'r' || k === 'R')) { doubleCoins(); return; }
      if (E.state === 'over' && (k === 'c' || k === 'C')) { reviveRun(); return; }
      if (E.state === 'over' && (k === 'n' || k === 'N')) { META.revSkip = true; return; }
      if ((k === 'f' || k === 'F')) { freeCoins(); return; }
      if (game.modes && (k === 'm' || k === 'M')) { E.data.mode = ((E.data.mode | 0) + 1) % game.modes.length; sfx.pop(1.1); save(); return; }
    }
    if (E.state === 'title' && (k === ' ' || k === 'Enter')) { start(); return; }
    if (E.state === 'over' && (k === ' ' || k === 'Enter') && overT > .7) { proceed(start); return; }
    if (E.state === 'clear' && (k === ' ' || k === 'Enter') && clearT > .6) { proceed(nextLevel); return; }
    if (E.userPaused) { if (k === ' ' || k === 'Enter') E.userPaused = false; return; }
    if (E.state === 'play' && game.key) game.key(k, true);
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; if (game && game.key) safe(() => game.key(e.key, false)); });
  window.addEventListener('blur', () => cancelInput());

  // ---------- SDK pause / resume ----------
  let raf = 0, last = 0;
  if (yt) {
    safe(() => yt.system.onPause(() => { E.sdkPaused = true; tPaused = true; cancelAnimationFrame(raf); raf = 0; if (E.state === 'play') E.userPaused = true; save(); if (A.ctx) { applyGain(); safe(() => A.ctx.suspend()); } }));
    safe(() => yt.system.onResume(() => { E.sdkPaused = false; if (A.ctx) { safe(() => A.ctx.resume()); applyGain(); } last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); flushHeld(); }));
  }

  // ---------- overlays ----------
  function panel(x, y, w, h, a = .55) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    rrect(ctx, x, y, w, h, Math.min(28, h * .2)); const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, `rgba(20,16,36,${a})`); gr.addColorStop(1, `rgba(8,6,18,${a + .1})`); ctx.fillStyle = gr; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  function pill(label, cx, cy, s, pulse) {
    const w = Math.max(s * 9, label.length * s * .62 + s * 2.4), h = s * 2.4; const k = 1 + Math.sin(E.t * 4) * .03 * pulse;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
    const acc = (game && game.accent) || '#ffcf6b';
    ctx.shadowColor = acc; ctx.shadowBlur = s * 1.4; rrect(ctx, -w / 2, -h / 2, w, h, h / 2);
    const gr = ctx.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.12, acc); gr.addColorStop(1, shade(acc)); ctx.fillStyle = gr; ctx.fill();
    ctx.restore(); text(label, cx, cy + s * .05, s, { color: '#1b1230', shadow: false, weight: 800 });
  }
  function shade(hex) { return hex.length === 7 ? '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.substr(i, 2), 16) * .62).toString(16).padStart(2, '0')).join('') : hex; }
  function star(g, x, y, r, fill, glowc) {
    g.save(); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath();
    if (glowc) { g.shadowColor = glowc; g.shadowBlur = r * .8; } g.fillStyle = fill; g.fill(); g.shadowBlur = 0; g.lineWidth = Math.max(1, r * .08); g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke(); g.restore();
  }
  function coinChip(x, y, s, align) {
    const label = `${cur()} ${E.data.coins | 0}`; ctx.save(); ctx.font = `800 ${s}px ${FONT}`; const w = ctx.measureText(label).width + s * 1.6, h = s * 1.9; ctx.restore();
    const bx = align === 'right' ? x - w : x; ctx.save(); rrect(ctx, bx, y, w, h, h / 2); ctx.fillStyle = 'rgba(10,6,22,.55)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.stroke(); ctx.restore();
    text(label, bx + w / 2, y + h / 2, s, { color: game.coinColor || '#ffe08a', weight: 800 });
  }
  function rankChip(x, y, s) {
    const xp = E.data.xp | 0, r = rankOf(xp), a = rankXp(r), b = rankXp(r + 1), k = (xp - a) / Math.max(1, b - a), w = s * 7, h = s * 1.9;
    ctx.save(); rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(10,6,22,.55)'; ctx.fill(); rrect(ctx, x + 3, y + h - 6, (w - 6) * k, 3, 1.5); ctx.fillStyle = game.accent || '#ffcf6b'; ctx.fill(); ctx.restore();
    text(`Rank ${r}`, x + w / 2, y + h * .44, s * .85, { weight: 800 });
  }
  function drawToast(dt) {
    if (!META.toast) return; META.toastT += dt; const t = META.toastT; if (t > 4) { META.toast = null; return; }
    const s = E.S, k = M.easeBack(Math.min(1, t * 3)) * (t > 3.6 ? 1 - (t - 3.6) / .4 : 1), y = E.H - s * 3.2 + (1 - k) * s * 3;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, k)); ctx.font = `700 ${s * .85}px ${FONT}`; const w = Math.min(E.W * .94, ctx.measureText(META.toast).width + s * 3);
    rrect(ctx, E.W / 2 - w / 2, y - s * 1.1, w, s * 2.2, s * 1.1); const gr = ctx.createLinearGradient(0, y - s, 0, y + s); gr.addColorStop(0, 'rgba(60,40,90,.92)'); gr.addColorStop(1, 'rgba(25,15,45,.92)'); ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = game.accent || '#ffcf6b'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    text(META.toast, E.W / 2, y, s * .85, { alpha: Math.max(0, Math.min(1, k)), max: w - s, color: '#fff7e0' });
  }
  /** upgrades row + collection row */
  function drawShop(x, y, w, h, upgradesOnly) {
    const s = E.S, ups = meta().upgrades || [], skins = upgradesOnly ? [] : (meta().skins || []);
    const rowsN = (ups.length ? 1 : 0) + (skins.length ? 1 : 0); if (!rowsN) return; const rh = h / rowsN; let ry = y;
    if (ups.length) {
      const gap = s * .5, cw = (w - gap * (ups.length - 1)) / ups.length, ch = Math.min(rh * .92, s * 5.2);
      ups.forEach((u, i) => {
        const cx = x + i * (cw + gap), cy = ry + (rh - ch) / 2, c = upCost(u), ok = E.data.coins >= c, lv = upLevel(u.id);
        ctx.save(); rrect(ctx, cx, cy, cw, ch, s * .7); const gr = ctx.createLinearGradient(0, cy, 0, cy + ch); gr.addColorStop(0, ok ? 'rgba(90,70,140,.75)' : 'rgba(50,40,70,.6)'); gr.addColorStop(1, 'rgba(20,14,36,.8)'); ctx.fillStyle = gr; ctx.fill();
        ctx.strokeStyle = ok ? (game.accent || '#ffcf6b') : 'rgba(255,255,255,.15)'; ctx.lineWidth = ok ? 2 : 1; ctx.stroke(); ctx.restore();
        const fs = Math.min(s * .78, ch * .2);
        text(u.name, cx + cw / 2, cy + ch * .22, fs, { weight: 800, max: cw * .9 });
        text(u.desc || '', cx + cw / 2, cy + ch * .44, fs * .72, { color: 'rgba(255,255,255,.7)', weight: 600, max: cw * .92 });
        for (let p = 0; p < (u.max || 5); p++) { const px = cx + cw / 2 + (p - ((u.max || 5) - 1) / 2) * fs * .8; ctx.fillStyle = p < lv ? (game.accent || '#ffcf6b') : 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(px, cy + ch * .62, fs * .22, 0, 7); ctx.fill(); }
        text(c === Infinity ? 'MAX' : `${c} ${cur()}`, cx + cw / 2, cy + ch * .82, fs * .9, { color: c === Infinity ? '#9fe6a0' : ok ? '#ffe08a' : 'rgba(255,255,255,.45)', weight: 800, max: cw * .9 });
        if (!('ontouchstart' in window)) text(String(i + 1), cx + s * .55, cy + s * .55, s * .5, { color: 'rgba(255,255,255,.35)' });
        btn(cx, cy, cw, ch, () => buyUp(i));
      });
      ry += rh;
    }
    if (skins.length) {
      const n = skins.length, vis = Math.min(n, 6), first = Math.max(0, Math.min(n - vis, META.sel - 2)), aw = s * 1.6, iw = w - aw * 2;
      const r = Math.min(rh * .28, (iw / vis) * .36, s * 1.6), step = iw / vis, x0 = x + aw + step / 2, cy = ry + rh * .38;
      for (const [dx, lab, d] of [[x + aw / 2, '‹', -1], [x + w - aw / 2, '›', 1]]) { text(lab, dx, cy, s * 1.6, { weight: 900, color: 'rgba(255,255,255,.85)' }); btn(dx - aw / 2, cy - r - 4, aw, r * 2 + 8, () => { META.sel = (META.sel + d + n) % n; if (E.data.skins.includes(META.sel)) skinAct(META.sel); sfx.pop(1.1); }); }
      for (let j = 0; j < vis; j++) { const i = first + j, sk = skins[i];
        const cx = x0 + j * step, owned = E.data.skins.includes(i), eq = E.data.skin === i, sel = META.sel === i;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = eq ? 'rgba(60,40,90,.95)' : 'rgba(15,10,30,.8)'; ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * .92, 0, 7); ctx.clip(); if (!owned) ctx.globalAlpha = .45;
        if (meta().skinIcon) meta().skinIcon(ctx, cx, cy, r * .85, i); else { ctx.fillStyle = sk.color || '#888'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); }
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.lineWidth = eq ? 3 : sel ? 2 : 1; ctx.strokeStyle = eq ? (game.accent || '#fff') : sel ? '#fff' : 'rgba(255,255,255,.25)'; ctx.stroke();
        if (!owned) text(`🔒${gemCost(sk)}💎`, cx, cy + r + s * .6, s * .5, { color: E.data.gems >= gemCost(sk) ? '#bfe8ff' : 'rgba(255,255,255,.6)', weight: 800 });
        else if (eq) text('✓', cx, cy + r + s * .6, s * .65, { color: game.accent || '#fff' });
        btn(cx - step / 2, cy - r - 4, step, r * 2 + s * 1.3, () => skinAct(i));
      }
      const owned = E.data.skins.length, ly = ry + rh * .88; text(`Skins ${owned}/${n}${skins[META.sel] ? ' · ' + skins[META.sel].name : ''}`, x + w * (adsOK() ? .34 : .5), ly, s * .58, { color: 'rgba(255,255,255,.75)', max: w * (adsOK() ? .62 : 1) });
      if (adsOK()) { const gl = gemLeft(), bw = Math.min(w * .32, s * 6.2), bh = s * 1.4, bx = x + w - bw, by = ly - bh / 2; ctx.save(); rrect(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = gl ? 'rgba(255,255,255,.08)' : 'rgba(60,140,220,.85)'; ctx.fill(); ctx.restore();
        text(gl ? `⏱ ${Math.ceil(gl / 1e3)}s` : '▶ +5 💎', bx + bw / 2, by + bh / 2, s * .6, { weight: 800, max: bw * .9 }); if (!gl) btn(bx, by, bw, bh, freeGems); }
    }
  }
  function adBtn(label, cx, by, bw, bh, col, fn) {
    const s = E.S, bx = cx - bw / 2; ctx.save(); rrect(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    text(label, cx, by + bh / 2, s * .72, { max: bw * .9, weight: 700 }); if (fn) btn(bx, by, bw, bh, fn);
  }
  function boostRow(cx, by, bw) {
    if (!game.boostLabel) return 0; const s = E.S;
    if (E.boostArmed) { text(`✓ Boost ready: ${game.boostLabel}`, cx, by + s, s * .78, { color: '#8affc0', weight: 800, max: bw }); return s * 2.4; }
    if (!adsOK()) return 0; adBtn(`▶ Watch an ad: ${game.boostLabel}`, cx, by, bw, s * 2, '#8fd3ff', boostAd); return s * 2.4;
  }
  function drawTitle() {
    const { W, H } = E, s = E.S, cx = W / 2; titleT += 1 / 60; ui = [];
    ctx.save(); ctx.fillStyle = 'rgba(5,3,12,.25)'; ctx.fillRect(0, 0, W, H); ctx.restore();
    const wide = W > H * 1.25 && H < s * 36;
    const pw = Math.min(W * .94, s * (wide ? 46 : 30)), ph = Math.min(H * .9, s * (wide ? 24 : 36)), px = cx - pw / 2, py = (H - ph) / 2;
    panel(px, py, pw, ph, .5);
    const colW = wide ? pw * .5 : pw, lx = wide ? px + colW / 2 : cx;
    const tsz = Math.min(s * 3.4, colW / Math.max(6, game.title.length * .62));
    const f = wide ? [.16, .28, .4, .55, .76, .9] : [.08, .15, .22, .5, .58, .94];
    text(game.title, lx, py + ph * f[0], tsz, { font: game.titleFont || SERIF, weight: 700, color: game.titleColor || '#fff6e0', shadow: game.accent, spacing: 1, max: colW * .9 });
    text(game.tagline, lx, py + ph * f[1], s * .95, { color: 'rgba(255,255,255,.88)', weight: 600, italic: true, max: colW * .9 });
    const extra = game.titleExtra ? game.titleExtra() : '';
    const lines = (game.howto || []).slice(); const hs = Math.min(s * .74, ph * (wide ? .05 : .03));
    if (extra) text(extra, lx, py + ph * (f[1] + (wide ? .06 : .035)), s * .8, { color: game.accent || '#ffcf6b', weight: 800, max: colW * .9 });
    lines.forEach((l, i) => text(l, lx, py + ph * (f[2] + (wide ? .02 : .025)) + i * hs * 1.8, hs, { color: '#efeaff', weight: 600, max: colW * .9 }));
    pill(game.playLabel ? game.playLabel() : 'Tap to play', lx, py + ph * f[3], s * 1.0, 1);
    let shopY = py + ph * f[4], shopH = ph * .3;
    if (game.modes) {
      const n = game.modes.length, tw = Math.min(colW * .8, s * 14), th = s * 1.5, tx = lx - tw / 2, ty = py + ph * f[3] + s * 1.9, cw = tw / n;
      game.modes.forEach((m, i) => { const on = (E.data.mode | 0) === i; ctx.save(); rrect(ctx, tx + i * cw + 2, ty, cw - 4, th, th / 2); ctx.fillStyle = on ? (game.accent || '#ffcf6b') : 'rgba(255,255,255,.1)'; ctx.fill(); ctx.restore();
        text(m, tx + i * cw + cw / 2, ty + th / 2, s * .7, { color: on ? '#1b1230' : '#fff', shadow: false, weight: 800, max: cw * .9 }); btn(tx + i * cw, ty - 4, cw, th + 8, () => { E.data.mode = i; sfx.pop(1.1); save(); }); });
      if (!wide) { shopY += s * 1.6; shopH -= s * 1.6; }
    }
    if (game.boostLabel && (adsOK() || E.boostArmed)) { const by = py + ph * f[3] + s * (game.modes ? 3.6 : 1.9), used = boostRow(lx, by, Math.min(colW * .86, s * 16)); if (!wide) { shopY += used; shopH -= used; } }
    if (wide) drawShop(px + colW + s * .5, py + ph * .14, colW - s * 1.5, ph * .78);
    else drawShop(px + s, shopY, pw - s * 2, shopH);
    const bl = [E.best > 0 ? `Best ${E.best}${game.unit || ''}` : '', E.data.streak > 1 ? `🔥 ${E.data.streak}-day streak` : ''].filter(Boolean).join('   ·   ');
    if (bl) text(bl, lx, py + ph * f[5], s * .8, { color: game.accent || '#ffcf6b', max: colW * .9 });
    coinChip(W - s * .6, s * .6, s * .85, 'right'); gemChip(W - s * .6, s * 2.8, s * .85); rankChip(s * .6, s * .6, s * .85); freeBtn(s * .6, s * 2.8);
  }
  function drawOver() {
    const { W, H } = E, s = E.S, cx = W / 2, k = M.easeBack(Math.min(1, overT * 2.5)); ui = [];
    ctx.save(); ctx.fillStyle = `rgba(5,3,12,${.35 * Math.min(1, overT * 3)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
    const pw = Math.min(W * .92, s * 25), ph = Math.min(H * .94, s * 34), py = (H - ph) / 2, px = cx - pw / 2;
    ctx.save(); ctx.translate(cx, H / 2); ctx.scale(k, k); ctx.translate(-cx, -H / 2);
    panel(px, py, pw, ph, .6);
    text(E.overMsg || (game.overTitle || 'Run complete'), cx, py + ph * .07, s * 1.3, { font: game.titleFont || SERIF, color: '#fff6e0', max: pw * .9 });
    text(`${lastScore}${game.unit || ''}`, cx, py + ph * .17, Math.min(s * 3.2, ph * .1), { color: '#fff', weight: 800, shadow: game.accent });
    text(newBest ? '✦ New best! ✦' : `Best  ${E.best}${game.unit || ''}`, cx, py + ph * .255, s * .9, { color: game.accent || '#ffcf6b' });
    const ec = META.earned * (META.doubled ? META.mult : 1);
    text(`+${ec} ${cur()}${META.rankUp ? '   ·   Rank up!' : ''}`, cx, py + ph * .32, s * 1.0, { color: game.coinColor || '#ffe08a', weight: 800, max: pw * .9 });
    const stage1 = adsOK() && canRev() && !META.revSkip;
    if (stage1 && overT > 8) META.revSkip = true;
    if (stage1) { // revive offer first (opt-in), with a visible "No thanks"
      const bw = Math.min(pw * .86, s * 16), bh = s * 2.8, bx = cx - bw / 2, by = py + ph * .42, left = Math.max(0, 8 - overT);
      ctx.save(); rrect(ctx, bx, by, bw, bh, bh / 2); const gr = ctx.createLinearGradient(0, by, 0, by + bh); gr.addColorStop(0, '#5dffa0'); gr.addColorStop(1, '#1fae5c'); ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx + bh / 2, by + bh / 2, bh * .32, -Math.PI / 2, -Math.PI / 2 + 6.283 * left / 8); ctx.stroke(); ctx.restore();
      text(Math.ceil(left) + '', bx + bh / 2, by + bh / 2, s * .8, { weight: 900, color: '#0c2a18', shadow: false });
      text(`▶ Revive: ${game.reviveLabel || 'continue'}`, cx + bh * .25, by + bh / 2, s * .85, { max: bw - bh * 1.4, weight: 900, color: '#0c2a18', shadow: false }); btn(bx, by, bw, bh, reviveRun);
      const ny = by + bh + s * 1.4; text('No thanks', cx, ny, s * .9, { weight: 700, color: 'rgba(255,255,255,.92)' }); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(cx - s * 2.7, ny + s * .6, s * 5.4, 1.5);
      btn(cx - s * 4.5, ny - s, s * 9, s * 2, () => { META.revSkip = true; });
    } else {
      const used = rewardBlock(cx, py + ph * .37, pw * .9, () => proceed(start));
      const sy = py + ph * .37 + (used || 0) + s * .3, sh = Math.max(s * 3.6, py + ph * .84 - sy);
      drawShop(px + s * .8, sy, pw - s * 1.6, Math.min(sh, s * 5.4), true);
      if (overT > .7) pill('Play again', cx, py + ph * .925, s * 1.0, 1);
    }
    ctx.restore();
    coinChip(W - s * .6, s * .6, s * .85, 'right'); gemChip(W - s * .6, s * 2.8, s * .85); freeBtn(s * .6, s * .6);
    if (newBest && Math.random() < .3) fx.burst(M.rand(W), M.rand(H * .2, H * .5), { n: 3, color: game.accent ? hexA(game.accent) : 'rgba(255,220,120,1)', speed: 80, life: 1.2 });
  }
  function drawClear() {
    const { W, H } = E, s = E.S, cx = W / 2, k = M.easeBack(Math.min(1, clearT * 2.5)); ui = [];
    ctx.save(); ctx.fillStyle = `rgba(5,3,12,${.3 * Math.min(1, clearT * 3)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
    const pw = Math.min(W * .92, s * 23), ph = Math.min(H * .94, s * 32), py = (H - ph) / 2, bw = Math.min(pw * .86, s * 16);
    ctx.save(); ctx.translate(cx, H / 2); ctx.scale(k, k); ctx.translate(-cx, -H / 2);
    panel(cx - pw / 2, py, pw, ph, .6);
    text(clearInfo.msg, cx, py + ph * .07, s * 1.4, { font: game.titleFont || SERIF, color: '#fff6e0', max: pw * .9 });
    text(`${game.levelWord || 'Level'} ${clearInfo.lv}`, cx, py + ph * .135, s * .85, { color: 'rgba(255,255,255,.75)' });
    for (let i = 0; i < 3; i++) { const t = M.clamp((clearT - .25 - i * .22) * 4, 0, 1), on = i < clearInfo.stars, sz = s * 1.6 * (on ? M.easeBack(t) : 1); star(ctx, cx + (i - 1) * s * 3.6, py + ph * .22 - (i === 1 ? s * .5 : 0), Math.max(1, sz), on ? '#ffd54a' : 'rgba(255,255,255,.15)', null); }
    if (clearInfo.sub) text(clearInfo.sub, cx, py + ph * .3, s * .75, { color: '#efeaff', max: pw * .9 });
    const ec = META.earned * (META.doubled ? META.mult : 1);
    text(`+${ec} ${cur()}${META.gemsEarned ? `  +${META.gemsEarned} 💎` : ''}${META.rankUp ? '  ·  Rank up!' : ''}`, cx, py + ph * .36, s * .95, { color: game.coinColor || '#ffe08a', weight: 800, max: pw * .9 });
    let by = py + ph * .4;
    if (clearT > .4) by += rewardBlock(cx, by, pw * .9, () => proceed(nextLevel));
    if (clearT > .5) boostRow(cx, by + s * .3, bw);
    if (clearT > .6) pill(game.nextLabel || 'Next level', cx, py + ph * .925, s * 1.0, 1);
    ctx.restore(); coinChip(W - s * .6, s * .6, s * .85, 'right'); gemChip(W - s * .6, s * 2.8, s * .85); freeBtn(s * .6, s * .6);
  }
  function gemChip(x, y, s) {
    const label = `💎 ${E.data.gems | 0}`; ctx.save(); ctx.font = `800 ${s}px ${FONT}`; const w = ctx.measureText(label).width + s * 1.6, h = s * 1.9; ctx.restore();
    const bx = x - w; ctx.save(); rrect(ctx, bx, y, w, h, h / 2); ctx.fillStyle = 'rgba(10,6,22,.55)'; ctx.fill(); ctx.strokeStyle = 'rgba(160,220,255,.35)'; ctx.stroke(); ctx.restore();
    text(label, bx + w / 2, y + h / 2, s, { color: '#bfe8ff', weight: 800 });
  }
  function hexA(hex, a = 1) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, +a || 0)).toFixed(3)})`; }
  function drawPauseBtn() {
    if (game.noPause) return; const b = pauseBtn();
    ctx.save(); ctx.globalAlpha = .7; ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(b.x + b.r, b.y + b.r, b.r * .8, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; rrect(ctx, b.x + b.r - 7, b.y + b.r - 8, 5, 16, 2); ctx.fill(); rrect(ctx, b.x + b.r + 2, b.y + b.r - 8, 5, 16, 2); ctx.fill(); ctx.restore();
  }
  function drawPaused() {
    const { W, H } = E, s = E.S;
    ctx.save(); ctx.fillStyle = 'rgba(5,3,12,.5)'; ctx.fillRect(0, 0, W, H); ctx.restore();
    text('Paused', W / 2, H / 2 - s * 2, s * 2.6, { font: game.titleFont || SERIF });
    pill('Tap to resume', W / 2, H / 2 + s * 2, s * 1.1, 1);
  }
  function hud(score, label) {
    const s = E.S;
    text(String(score), E.W / 2, s * 2.2, s * 2.1, { weight: 800, color: '#fff' });
    if (label) text(label, E.W / 2, s * 3.9, s * .75, { color: 'rgba(255,255,255,.75)', weight: 600 });
  }
  function grainAndVignette(a = .06) {
    ctx.save(); if (!game.noVignette) { // perf: device-resolution cache, blitted unscaled (scaled blits are costly on phones)
      if (!vigFull || vigFull.width !== cv.width || vigFull.height !== cv.height) { vigFull = makeCanvas(cv.width, cv.height); vigFull.getContext('2d').drawImage(vignetteC, -cv.width * .1, -cv.height * .1, cv.width * 1.2, cv.height * 1.2); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(vigFull, 0, 0); ctx.setTransform(E.DPR, 0, 0, E.DPR, 0, 0); }
    if (grainPat && game.grainOn) { ctx.globalAlpha = a; ctx.globalCompositeOperation = 'overlay'; ctx.translate((Math.random() * 160) | 0, (Math.random() * 160) | 0); ctx.fillStyle = grainPat; ctx.fillRect(-160, -160, E.W + 320, E.H + 320); }
    ctx.restore();
  }

  // ---------- main loop ----------
  function loop(now) {
    raf = 0; if (E.sdkPaused) return;
    let dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    const running = E.state === 'play' && !E.userPaused;
    if (!running) dt *= (E.state === 'play' ? 0 : 1);
    if (ADS.busy) dt = 0; // game fully paused while an ad request is pending
    E.t += dt; if (running) ADS.play += dt;
    try {
      if (running) game.update(dt); else if (game.idle && E.state === 'title') game.idle(dt);
      if (E.state === 'over') overT += dt; if (E.state === 'clear') clearT += dt;
      fx.update(running || E.state !== 'play' ? dt : 0);
      musicTick();
      ctx.setTransform(E.DPR, 0, 0, E.DPR, 0, 0);
      if (game.gl) ctx.clearRect(0, 0, E.W, E.H);
      ctx.save(); if (shakeAmt) ctx.translate(M.rand(-shakeAmt, shakeAmt), M.rand(-shakeAmt, shakeAmt));
      game.draw(ctx); fx.draw(ctx); ctx.restore();
      if (game.overlay) game.overlay(ctx);
      if (!game.noVignette) grainAndVignette(game.grain || .06);
      if (E.state === 'play') { if (game.hud) game.hud(ctx); drawPauseBtn(); if (E.userPaused) drawPaused(); }
      else if (E.state === 'title') drawTitle(); else if (E.state === 'over') drawOver(); else if (E.state === 'clear') drawClear();
      drawToast(dt || 1 / 60);
      if (ADS.busy) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, E.W, E.H); ctx.restore(); }
    } catch (err) { console.error(err); safe(() => yt.health.logError()); }
    raf = requestAnimationFrame(loop);
  }
  function splash() {
    ctx.setTransform(E.DPR, 0, 0, E.DPR, 0, 0);
    const gr = ctx.createLinearGradient(0, 0, 0, E.H); gr.addColorStop(0, game.bg0 || '#1d1436'); gr.addColorStop(1, game.bg1 || '#05030c');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, E.W, E.H);
    text(game.title, E.W / 2, E.H / 2 - E.S * 1.5, E.S * 2.2, { font: game.titleFont || SERIF, color: '#fff6e0' });
    text('Loading…', E.W / 2, E.H / 2 + E.S * 1.5, E.S * .9, { color: 'rgba(255,255,255,.7)', weight: 600 });
  }
  async function run(g) {
    game = g; E.game = g; if (g.gl) setupGL(); window.addEventListener('resize', resize); resize();
    splash(); safe(() => yt.game.firstFrameReady()); if (inEnv) safe(() => initAudio()); // starts muted-by-gain until isAudioEnabled allows; resumes on first gesture if the browser kept it suspended
    await Promise.race([loadSave(), new Promise(r => setTimeout(r, 4000))]);
    if (!loadDone) { loadDone = true; initMeta(); }
    if (game.init) game.init(E.W, E.H);
    E.state = 'title'; last = performance.now(); raf = requestAnimationFrame((t) => { loop(t); safe(() => yt.game.gameReady()); });
  }
  return Object.assign(E, { later, run, M, fx, sfx, text, rrect, blob, glow, glowSprite, texture, tile, pattern, makeCanvas, gameOver, levelClear, save, setBest, hud, panel, star, keys, pointers, FONT, SERIF, hexA, collect, toast,
    up: upLevel, skin: () => E.data.skin | 0, level: () => E.data.level | 0, mode: () => E.data.mode | 0, coins: () => E.data.coins | 0, addCoins(n) { E.data.coins += Math.floor(n); }, get audioCtx() { return A.ctx; }, get adsBusy() { return ADS.busy; }, get boosted() { return !!E.boosted; } });
})();
