/* AR — arena toolkit for batch-3 "rivals" games: human-like AI rival roster with skill variance and mistakes,
   per-match leaderboard, join/leave/KO feed, smooth camera, procedural ground textures, glossy characters.
   Everything is local: rivals are AI and are labelled as rivals, never as online players. */
'use strict';
const AR = (() => {
  const { M, text, rrect } = PK;
  const A1 = ['Mika', 'Juno', 'Ravi', 'Lena', 'Kofi', 'Yuki', 'Theo', 'Nia', 'Omar', 'Ivy', 'Bruno', 'Sana', 'Leo', 'Ayla', 'Finn', 'Zara', 'Hugo', 'Mei', 'Arlo', 'Noor', 'Kai', 'Elif', 'Rio', 'Tess', 'Dev', 'Luz', 'Milo', 'Asha', 'Otto', 'Pia', 'Remy', 'Suki', 'Ezra', 'Vera', 'Jae', 'Nico', 'Rumi', 'Cleo', 'Taro', 'Wren'];
  const A2 = ['Fox', 'Byte', 'Nova', 'Pebble', 'Comet', 'Mochi', 'Bolt', 'Pixel', 'Maple', 'Echo', 'Taco', 'Storm', 'Bean', 'Ziggy', 'Moss', 'Rocket', 'Noodle', 'Ember', 'Kiwi', 'Drift', 'Biscuit', 'Shadow', 'Panda', 'Waffle', 'Frost', 'Lucky', 'Ninja', 'Toast'];
  const used = new Set();
  function name() {
    for (let k = 0; k < 40; k++) {
      const r = Math.random(); let n;
      if (r < .3) n = M.pick(A1); else if (r < .55) n = M.pick(A1) + M.irand(2, 99); else if (r < .75) n = M.pick(A2) + M.pick(A2); else if (r < .9) n = M.pick(A1) + '_' + M.pick(A2); else n = M.pick(A2).toLowerCase() + M.irand(10, 999);
      if (!used.has(n)) { used.add(n); if (used.size > 300) used.clear(); return n; }
    }
    return 'Rival' + M.irand(100, 999);
  }
  const HUES = [8, 28, 48, 90, 140, 168, 190, 212, 236, 262, 290, 320, 345];
  /** a rival: skill 0..1 scales with the player's league (escalating difficulty) plus personal variance */
  function rival(level = 0, o = {}) {
    const base = M.clamp(.28 + level * .045, .28, .86), skill = M.clamp(base + M.rand(-.18, .14), .12, .97);
    const hue = o.hue !== undefined ? o.hue : M.pick(HUES) + M.rand(-6, 6);
    return { name: o.name || name(), hue, color: M.hsl(hue, 78, 56), dark: M.hsl(hue, 70, 30), light: M.hsl(hue, 90, 78), skill, aggro: M.rand(.2, 1), react: M.lerp(.55, .12, skill) * M.rand(.8, 1.3), mistake: M.lerp(.09, .012, skill), think: M.rand(.3), pat: M.irand(0, 3), score: 0, alive: true, bot: true };
  }
  function roster(n, level, o) { const r = []; for (let i = 0; i < n; i++) r.push(rival(level, o)); return r; }
  /** returns true when it's time for this bot to re-decide (reaction delay with jitter) */
  function tick(b, dt) { b.think -= dt; if (b.think > 0) return false; b.think = b.react * M.rand(.7, 1.4); return true; }
  const oops = (b) => Math.random() < b.mistake;
  const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Legend'];
  const league = (lv) => LEAGUES[Math.min(LEAGUES.length - 1, Math.floor(lv / 4))] + ' ' + ['I', 'II', 'III', 'IV'][lv % 4];
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

  // ---------- feed (joins, leaves, KOs) ----------
  const feed = [];
  function say(msg, color = '#fff') { feed.unshift({ msg, color, t: 0 }); if (feed.length > 5) feed.length = 5; }
  function drawFeed(g, x, y, s, dt, align = 'left') {
    for (let i = feed.length - 1; i >= 0; i--) { feed[i].t += dt; if (feed[i].t > 4.5) feed.splice(i, 1); }
    feed.forEach((f, i) => { const a = Math.min(1, (4.5 - f.t) * 2, f.t * 6); g.save(); g.globalAlpha = a; g.font = `700 ${s * .62}px ${PK.FONT}`; const w = g.measureText(f.msg).width + s; const bx = align === 'left' ? x : x - w;
      rrect(g, bx, y + i * s * 1.25, w, s * 1.05, s * .5); g.fillStyle = 'rgba(8,6,20,.5)'; g.fill(); g.restore();
      text(f.msg, bx + w / 2, y + i * s * 1.25 + s * .53, s * .62, { color: f.color, alpha: a, shadow: false }); });
  }
  function clearFeed() { feed.length = 0; }

  // ---------- leaderboard ----------
  /** list: [{name, score, me, color, alive}] (sorted inside). Shows top rows + the player's row. */
  function board(g, list, o = {}) {
    const s = o.s || PK.S, rows = o.rows || 5, w = o.w || s * 9, x = o.x === undefined ? PK.W - w - s * .5 : o.x, y = o.y || s * 3.2, lh = s * 1.05;
    const L = list.slice().sort((a, b) => (o.asc ? a.score - b.score : b.score - a.score) || (b.alive - a.alive));
    const mi = L.findIndex(e => e.me); const show = L.slice(0, rows); if (mi >= rows) show.push(L[mi]);
    const bh = lh * (show.length + (o.title ? 1 : 0)) + s * .4, D = PK.DPR;
    // perf: the panel is re-rendered into a cached canvas only when its visible content changes (text is the costliest thing to rasterise)
    const sig = [w, bh, s, D, o.title, ...show.map(e => (L.indexOf(e) + 1) + e.name + '|' + (o.fmt ? o.fmt(e.score) : Math.floor(e.score)) + e.alive + e.me + e.color)].join(';');
    if (!boardC || boardC.sig !== sig) { boardC = boardC && boardC.width === Math.ceil(w * D) && boardC.height === Math.ceil(bh * D) ? boardC : PK.makeCanvas(w * D, bh * D); const bg = boardC.getContext('2d'); bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, boardC.width, boardC.height); bg.setTransform(D, 0, 0, D, -x * D, -y * D);
      drawBoard(bg, show, L, o, s, w, x, y, lh, bh); boardC.sig = sig; }
    g.drawImage(boardC, x, y, boardC.width / D, boardC.height / D);
    return L;
  }
  let boardC = null;
  function drawBoard(g, show, L, o, s, w, x, y, lh, bh) { const text = (str, X, Y, sz, op) => PK.text(str, X, Y, sz, Object.assign({ g }, op));
    g.save(); rrect(g, x, y, w, bh, s * .5); g.fillStyle = 'rgba(8,6,20,.45)'; g.fill(); g.restore();
    let yy = y + s * .2; if (o.title) { text(o.title, x + w / 2, yy + lh / 2, s * .58, { color: 'rgba(255,255,255,.7)', shadow: false }); yy += lh; }
    show.forEach((e) => { const rk = L.indexOf(e) + 1;
      if (e.me) { g.save(); rrect(g, x + 2, yy, w - 4, lh, s * .3); g.fillStyle = 'rgba(255,255,255,.16)'; g.fill(); g.restore(); }
      g.fillStyle = e.color || '#fff'; g.beginPath(); g.arc(x + s * 1.35, yy + lh / 2, s * .24, 0, 7); g.fill();
      text(rk + '', x + s * .55, yy + lh / 2, s * .55, { color: 'rgba(255,255,255,.75)', shadow: false });
      text(e.name, x + s * 1.8, yy + lh / 2, s * .6, { align: 'left', color: e.alive === false ? 'rgba(255,255,255,.35)' : e.me ? '#fff4b0' : '#fff', max: w - s * 4.4, shadow: false, weight: e.me ? 800 : 600 });
      text(o.fmt ? o.fmt(e.score) : String(Math.floor(e.score)), x + w - s * .4, yy + lh / 2, s * .6, { align: 'right', color: '#ffe9a8', shadow: false }); yy += lh; });
  }
  const rankIn = (list, me, asc) => list.slice().sort((a, b) => asc ? a.score - b.score : b.score - a.score).indexOf(me) + 1;

  // ---------- camera ----------
  function cam() { return { x: 0, y: 0, z: 1, follow(tx, ty, dt, rate = 6) { this.x = M.approach(this.x, tx, rate, dt); this.y = M.approach(this.y, ty, rate, dt); },
    apply(g) { g.translate(PK.W / 2, PK.H / 2); g.scale(this.z, this.z); g.translate(-this.x, -this.y); },
    toWorld(sx, sy) { return [(sx - PK.W / 2) / this.z + this.x, (sy - PK.H / 2) / this.z + this.y]; },
    toScreen(wx, wy) { return [(wx - this.x) * this.z + PK.W / 2, (wy - this.y) * this.z + PK.H / 2]; },
    fit(viewDiam) { this.z = Math.sqrt(PK.W * PK.H) / viewDiam; } }; }

  // ---------- procedural textures (tileable, cached) ----------
  const texCache = {};
  function hex2(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  /** kind: grass|sand|stone|ice|wood|felt|water|lava|snow|dirt; returns CanvasPattern */
  function tex(g, kind, c1, c2, size = 256) {
    const key = kind + c1 + c2 + size; if (texCache[key]) return texCache[key];
    const cv = PK.makeCanvas(size, size), x = cv.getContext('2d'), im = x.createImageData(size, size), a = hex2(c1), b = hex2(c2), p = size / 32;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const u = i / 32, v = j / 32; let k = M.pfbm(u, v, p, 4);
      if (kind === 'grass') k = k * .7 + .3 * M.pfbm(u * 4, v * 4, p * 4, 2) + (Math.random() - .5) * .12;
      else if (kind === 'wood') k = .5 + .5 * Math.sin((v + M.pfbm(u, v * .3, p, 3) * 3) * 6.283 * 2) * .5 + k * .3;
      else if (kind === 'stone') { const cx = (i % 64) / 64, cy = (j % 64) / 64, edge = Math.min(cx, cy, 1 - cx, 1 - cy); k = k * .6 + (edge < .04 ? -.35 : .2); }
      else if (kind === 'ice') k = .6 + k * .4 + (Math.abs(M.pfbm(u * 2, v * 2, p * 2, 3) - .5) < .02 ? .35 : 0);
      else if (kind === 'water') k = .5 + .5 * Math.sin((u + M.pfbm(u, v, p, 3) * 2) * 6.283) * .5;
      else if (kind === 'lava') k = Math.pow(Math.abs(M.pfbm(u * 1.5, v * 1.5, p * 1.5, 4) - .5) * 2, .5);
      else if (kind === 'felt') k = .5 + (Math.random() - .5) * .25 + (k - .5) * .2;
      else k = k + (Math.random() - .5) * .14;
      k = M.clamp(k, 0, 1); const o = (j * size + i) * 4;
      im.data[o] = a[0] + (b[0] - a[0]) * k; im.data[o + 1] = a[1] + (b[1] - a[1]) * k; im.data[o + 2] = a[2] + (b[2] - a[2]) * k; im.data[o + 3] = 255;
    }
    x.putImageData(im, 0, 0); return (texCache[key] = g.createPattern(cv, 'repeat'));
  }

  // ---------- glossy character / orb ----------
  function shadow(g, x, y, rx, ry, a = .3) { g.save(); g.fillStyle = `rgba(0,0,0,${a})`; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); g.restore(); }
  function orb(g, x, y, r, hue, o = {}) {
    const gr = g.createRadialGradient(x - r * .35, y - r * .4, r * .08, x, y, r * 1.05);
    gr.addColorStop(0, M.hsl(hue, 95, o.l1 || 86)); gr.addColorStop(.45, M.hsl(hue, 80, o.l2 || 56)); gr.addColorStop(1, M.hsl(hue + (o.shift || -12), 75, o.l3 || 24));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (o.rim !== false) { g.strokeStyle = M.hsl(hue, 70, 18, .55); g.lineWidth = Math.max(1, r * .07); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(x - r * .38, y - r * .45, r * .26, r * .14, -.6, 0, 7); g.fill();
  }
  /** body with face; dir = look angle; pat = skin pattern 0 plain, 1 stripes, 2 spots, 3 star */
  function critter(g, x, y, r, hue, o = {}) {
    if (o.shadow !== false) shadow(g, x + r * .15, y + r * .85, r * .95, r * .35);
    if (!o.live) { g.drawImage(critSprite(hue, o.pat | 0), x - r * 1.0909, y - r * 1.0909, r * 2.1818, r * 2.1818); } // perf: cached body (gloss + pattern), face drawn live
    else { orb(g, x, y, r, hue, o);
    if (o.pat) { g.save(); g.beginPath(); g.arc(x, y, r * .97, 0, 7); g.clip(); g.globalAlpha = .28; g.fillStyle = M.hsl(hue + 30, 90, 90);
      if (o.pat === 1) for (let i = -3; i <= 3; i++) { g.save(); g.translate(x, y); g.rotate(.6); g.fillRect(i * r * .55 - r * .12, -r * 2, r * .24, r * 4); g.restore(); }
      else if (o.pat === 2) for (let i = 0; i < 7; i++) { const a = i * 2.4; g.beginPath(); g.arc(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55, r * .17, 0, 7); g.fill(); }
      else { PK.star(g, x, y + r * .25, r * .45, M.hsl(hue + 30, 90, 90)); } g.restore(); } }
    if (o.face === false) return;
    const d = o.dir || 0, ex = Math.cos(d) * r * .22, ey = Math.sin(d) * r * .16, blink = (PK.t * 1.3 + (o.seed || 0)) % 4 < .12;
    for (const sd of [-1, 1]) { const px = x + sd * r * .3 + ex * .6, py = y - r * .12 + ey * .6;
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(px, py, r * .19, blink ? r * .03 : r * .23, 0, 0, 7); g.fill();
      if (!blink) { g.fillStyle = '#1b1530'; g.beginPath(); g.arc(px + ex * .35, py + ey * .4, r * .11, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(px + ex * .35 - r * .04, py + ey * .4 - r * .05, r * .035, 0, 7); g.fill(); } }
    g.fillStyle = 'rgba(255,120,140,.35)'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(x + sd * r * .55, y + r * .2, r * .13, r * .08, 0, 0, 7); g.fill(); }
    if (o.mood === 'sad') { g.strokeStyle = '#1b1530'; g.lineWidth = r * .07; g.beginPath(); g.arc(x, y + r * .45, r * .16, 3.6, 5.8); g.stroke(); }
    else { g.strokeStyle = '#1b1530'; g.lineWidth = r * .07; g.lineCap = 'round'; g.beginPath(); g.arc(x, y + r * .18, r * .17, .5, 2.6); g.stroke(); }
  }
  const critC = {};
  function critSprite(hue, pat) { const key = Math.round(hue) + ':' + pat; if (critC[key]) return critC[key]; const c = PK.makeCanvas(96, 96), g = c.getContext('2d'); critter(g, 48, 48, 44, Math.round(hue), { live: true, pat, face: false, shadow: false }); return (critC[key] = c); }
  /** cached glossy orb sprite (fast drawImage for many bodies) */
  const sprCache = {};
  function sprite(hue, o = {}) {
    const key = hue.toFixed(0) + (o.pat || 0) + (o.l2 || ''); if (sprCache[key]) return sprCache[key];
    const c = PK.makeCanvas(96, 96), g = c.getContext('2d'); orb(g, 48, 48, 44, hue, o);
    if (o.pat) { g.save(); g.beginPath(); g.arc(48, 48, 43, 0, 7); g.clip(); g.globalAlpha = .25; g.fillStyle = '#fff'; if (o.pat === 1) g.fillRect(36, 0, 24, 96); else if (o.pat === 2) { g.beginPath(); g.arc(48, 48, 16, 0, 7); g.fill(); } else { PK.star(g, 48, 50, 22, '#fff'); } g.restore(); }
    return (sprCache[key] = c);
  }
  const tagC = {}; let tagN = 0;
  function tag(g, x, y, str, color, s) { // perf: name tags are cached sprites (one drawImage instead of rrect + 2 text draws)
    const m = g.getTransform(), sc = Math.hypot(m.a, m.b) || 1, px = Math.max(6, Math.round(s * sc * 4) / 4), key = str + '|' + color + '|' + px; let c = tagC[key];
    if (!c) { if (++tagN > 400) { for (const k in tagC) delete tagC[k]; tagN = 0; } const x2 = PK.makeCanvas(4, 4).getContext('2d'); x2.font = `800 ${px * .55}px ${PK.FONT}`; const w = x2.measureText(str).width + px * .7, h = px * .8;
      c = tagC[key] = PK.makeCanvas(w + 4, h + 4); const t = c.getContext('2d'); rrect(t, 2, 2 + px * .02, w, px * .76, px * .38); t.fillStyle = 'rgba(8,6,20,.45)'; t.fill(); PK.text(str, 2 + w / 2, 2 + h / 2, px * .55, { g: t, color: color || '#fff', shadow: false }); c.sc = 1; }
    g.drawImage(c, x - c.width / 2 / sc, y - c.height / 2 / sc, c.width / sc, c.height / sc); }
  /** big 3-2-1-GO countdown; returns true while counting */
  function countdown(g, t, total = 3) {
    if (t >= total + .6) return false; const n = Math.ceil(total - t), s = PK.S, f = (t % 1);
    const str = t < total ? String(n) : 'GO!', sc = 1 + (1 - Math.min(1, f * 3)) * .6;
    text(str, PK.W / 2, PK.H * .4, s * 4 * sc, { color: t < total ? '#fff' : '#9dff8a', stroke: 'rgba(20,10,40,.7)', alpha: t < total ? 1 : Math.max(0, 1 - (t - total) / .6) });
    return t < total;
  }
  /** coins for a placement out of n */
  const placeCoins = (place, n, base = 20) => Math.round(base * (1 + (n - place) / Math.max(1, n - 1) * 2) + (place === 1 ? base : 0));
  function wrapA(a) { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; }
  function turnTo(a, target, rate) { const d = wrapA(target - a); return a + M.clamp(d, -rate, rate); }

  // ---------- bigger skin rosters: hue/pattern variants of a game's base skins (gem prices rise along the list) ----------
  const ADJ = ['Neon', 'Midnight', 'Sunset', 'Frost', 'Ember', 'Royal', 'Toxic', 'Candy', 'Storm', 'Aurora', 'Lava', 'Ghost', 'Galaxy', 'Jungle', 'Pearl', 'Shadow'];
  function moreSkins(base, n) { const b0 = base.length; let k = 0; while (base.length < n) { const b = base[k % b0], j = base.length; base.push(Object.assign({}, b, { name: (b.name.includes(ADJ[k % ADJ.length]) ? ADJ[(k + 3) % ADJ.length] : ADJ[k % ADJ.length]) + ' ' + b.name, hue: ((b.hue || 0) + 47 * (k + 1)) % 360, pat: (k % 3) + 1, cost: 0, gems: 10 + j * 4, v: k + 1 })); k++; } base.forEach((b, i) => { if (i && b.gems === undefined) b.gems = Math.max(5, Math.round((b.cost || 100) / 40)); }); return base; }

  // ---------- baked canvases (static backgrounds/sprites drawn once, then drawImage) ----------
  const bakes = {};
  function bake(key, w, h, fn) { w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h)); const b = bakes[key]; if (b && b.width === w && b.height === h) return b; const c = PK.makeCanvas(w, h); fn(c.getContext('2d'), w, h); return (bakes[key] = c); }
  function unbake(key) { delete bakes[key]; }

  /** perf: fill the whole canvas with a world-anchored texture using unscaled device-space tile blits (much cheaper than a scaled pattern fill) */
  const tileC = {};
  function groundTile(kind, c1, c2) { const k = kind + c1 + c2; if (tileC[k]) return tileC[k]; const c = PK.makeCanvas(256, 256), x = c.getContext('2d'); x.fillStyle = tex(x, kind, c1, c2); x.fillRect(0, 0, 256, 256); return (tileC[k] = c); }
  function ground(g, kind, c1, c2) { const T = groundTile(kind, c1, c2), m = g.getTransform(), cw = g.canvas.width, ch = g.canvas.height;
    const ox = ((Math.round(m.e) % 256) + 256) % 256 - 256, oy = ((Math.round(m.f) % 256) + 256) % 256 - 256;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); for (let y = oy; y < ch; y += 256) for (let x = ox; x < cw; x += 256) g.drawImage(T, x, y); g.restore(); }
  /** perf: cache a static full-screen layer at device resolution; fn(g) draws in normal (DPR-scaled) coordinates. key changes or resize rebuild it */
  const views = {};
  function view(g, key, fn) { const cw = g.canvas.width, ch = g.canvas.height; let v = views[key];
    if (!v || v.width !== cw || v.height !== ch) { v = views[key] = PK.makeCanvas(cw, ch); const x = v.getContext('2d'); x.setTransform(PK.DPR, 0, 0, PK.DPR, 0, 0); fn(x); }
    const m = g.getTransform(); g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(v, Math.round(m.e), Math.round(m.f)); g.restore(); } // keeps screen-shake offset
  function unview(key) { if (key) delete views[key]; else for (const k in views) delete views[k]; }

  // ---------- in-match pickup items + timed buffs ----------
  const ICON = { magnet: ['🧲', 0], speed: ['⚡', 50], shield: ['🛡', 200], burst: ['✸', 300], grow: ['⬆', 120], heart: ['❤', 350], bomb: ['💣', 20], slow: ['❄', 190], gem: ['💎', 195], star: ['★', 45], coin: ['●', 48] };
  const itemSpr = {};
  function itemSprite(kind) { if (itemSpr[kind]) return itemSpr[kind]; const [ic, hue] = ICON[kind] || ['?', 0]; const c = PK.makeCanvas(72, 72), g = c.getContext('2d');
    const gl = g.createRadialGradient(36, 36, 4, 36, 36, 36); gl.addColorStop(0, M.hsl(hue, 100, 70, .55)); gl.addColorStop(1, M.hsl(hue, 100, 60, 0)); g.fillStyle = gl; g.fillRect(0, 0, 72, 72);
    orb(g, 36, 36, 22, hue, { l2: 60 }); g.font = `800 24px ${PK.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(ic, 36, 38); return (itemSpr[kind] = c); }
  /** items({kinds, max, every, spot:()=>[x,y], r}) → {list, update(dt, players, onPick), draw(g, z)} */
  function items(o) { const it = { list: [], t: 0, o };
    it.spawn = (kind, x, y) => { const [sx, sy] = x === undefined ? o.spot() : [x, y]; it.list.push({ x: sx, y: sy, k: kind || M.pick(o.kinds), t: 0 }); };
    it.update = (dt, players, onPick) => { it.t += dt; if (it.list.length < (o.max || 6) && it.t > (o.every || 4)) { it.t = 0; it.spawn(); }
      for (let i = it.list.length - 1; i >= 0; i--) { const q = it.list[i]; q.t += dt; for (const p of players) { if (p.alive === false || p.dead) continue; const rr = (p.r || 20) + (o.r || 18); if (Math.abs(p.x - q.x) < rr && Math.abs(p.y - q.y) < rr && Math.hypot(p.x - q.x, p.y - q.y) < rr) { it.list.splice(i, 1); onPick(p, q.k, q); break; } } } };
    it.draw = (g, sc = 1) => { const R = (o.r || 18) * 1.6 * sc; for (const q of it.list) { const b = Math.sin(q.t * 4 + q.x) * 3; g.drawImage(itemSprite(q.k), q.x - R, q.y - R + b, R * 2, R * 2); } };
    return it; }
  const buff = (p, k, secs) => { (p.buffs || (p.buffs = {}))[k] = Math.max((p.buffs[k] || 0), secs); };
  const has = (p, k) => !!(p.buffs && p.buffs[k] > 0);
  function tickBuffs(p, dt) { if (!p.buffs) return; for (const k in p.buffs) if (p.buffs[k] > 0) p.buffs[k] -= dt; }
  function drawBuffs(g, p, r) { if (!p.buffs) return; if (has(p, 'shield')) { g.strokeStyle = `rgba(140,220,255,${.55 + .3 * Math.sin(PK.t * 8)})`; g.lineWidth = Math.max(2, r * .12); g.beginPath(); g.arc(p.x, p.y, r * 1.35, 0, 7); g.stroke(); }
    if (has(p, 'magnet')) { g.strokeStyle = 'rgba(255,90,90,.35)'; g.lineWidth = 2; g.setLineDash([6, 8]); g.beginPath(); g.arc(p.x, p.y, r * 2.2 + Math.sin(PK.t * 6) * 3, 0, 7); g.stroke(); g.setLineDash([]); }
    if (has(p, 'speed')) { g.fillStyle = 'rgba(255,230,90,.35)'; g.beginPath(); g.arc(p.x, p.y, r * 1.15, 0, 7); g.fill(); } }
  /** HUD chips for the player's active buffs */
  function buffHud(g, p, x, y, s) { if (!p || !p.buffs) return; let i = 0; for (const k in p.buffs) { const v = p.buffs[k]; if (v <= 0) continue; g.drawImage(itemSprite(k), x + i * s * 2.4, y, s * 2, s * 2); text(Math.ceil(v) + 's', x + i * s * 2.4 + s, y + s * 2.3, s * .55, { shadow: false }); i++; } }
  return { moreSkins, bake, unbake, ground, groundTile, view, unview, items, itemSprite, buff, has, tickBuffs, drawBuffs, buffHud, name, rival, roster, tick, oops, league, ord, fmt, say, drawFeed, clearFeed, board, rankIn, cam, tex, shadow, orb, critter, tag, countdown, placeCoins, sprite, wrapA, turnTo, HUES };
})();
