/* @libs arena */
// Tallyworm — glossy number-worms in a huge garden arena. Eat glow-seeds to grow your tally; the bigger tally wins every clash. Grab power-ups, topple the boss.
(() => {
'use strict';
const { M, fx, sfx, text } = PK;
const WR = 3200, MAXFOOD = 1100, NR = 21, MATCH = 150, CELL = 96;
// original worm skins: base hue, second hue, pattern style
const SK = [{ name: 'Lime Sprout', cost: 0, hue: 95, h2: 60, st: 'band' }, { name: 'Coral Reef', cost: 150, hue: 8, h2: 40, st: 'spot' }, { name: 'Lagoon', cost: 300, hue: 190, h2: 230, st: 'scale' }, { name: 'Royal Velvet', cost: 500, hue: 270, h2: 320, st: 'stripe' },
  { name: 'Sunburst', cost: 800, hue: 45, h2: 15, st: 'band' }, { name: 'Midnight', cost: 1200, hue: 230, h2: 190, st: 'glow' }, { name: 'Candy Cane', cost: 1500, hue: 350, h2: 0, st: 'candy' }, { name: 'Tiger Moth', cost: 1800, hue: 30, h2: 0, st: 'tiger' },
  { name: 'Jade Dragon', cost: 2200, hue: 150, h2: 90, st: 'scale' }, { name: 'Bumblebee', cost: 2500, hue: 50, h2: 0, st: 'tiger' }, { name: 'Galaxy', cost: 3000, hue: 260, h2: 200, st: 'glow' }, { name: 'Watermelon', cost: 3500, hue: 120, h2: 350, st: 'spot' }]; AR.moreSkins(SK, 20); /*pc1*/
SK.forEach((s, i) => { if (!s.st) s.st = ['band', 'spot', 'scale', 'stripe', 'glow', 'candy', 'tiger'][i % 7]; if (s.h2 === undefined) s.h2 = (s.hue + 40) % 360; });
let W, H, cam, worms, food, me, t, endT, aim, keyTurn = 0, boostKey = false, ptr = null, ptr2 = false, deathBy = '', ended = false, deadAt = 0, cd = 0, items, boss, grid, kills = 0, bossSpawned;
const lv = () => PK.level();
// ---------- cached sprites (perf: every segment is one drawImage, no per-frame gradients) ----------
const segCache = {};
function segSprite(sk, k) { const key = sk.hue + ':' + sk.h2 + ':' + sk.st + ':' + k; if (segCache[key]) return segCache[key]; const c = PK.makeCanvas(64, 64), g = c.getContext('2d'), R = 30;
  const hue = (sk.st === 'band' || sk.st === 'candy') && k ? sk.h2 : sk.hue, l = sk.st === 'candy' && k ? 96 : undefined;
  const gr = g.createRadialGradient(32 - R * .35, 32 - R * .4, 2, 32, 32, R); gr.addColorStop(0, l ? '#fff' : M.hsl(hue, 95, 82)); gr.addColorStop(.5, l ? '#f4f0f0' : M.hsl(hue, 80, 55)); gr.addColorStop(1, l ? '#c8c0c0' : M.hsl(hue - 10, 75, 26)); g.fillStyle = gr; g.beginPath(); g.arc(32, 32, R, 0, 7); g.fill();
  g.save(); g.beginPath(); g.arc(32, 32, R - 1, 0, 7); g.clip(); g.fillStyle = M.hsl(sk.h2, 85, 60, .55);
  if (sk.st === 'spot') { for (let i = 0; i < 5; i++) { const a = i * 2.4 + k, r = 9 + (i % 2) * 8; g.beginPath(); g.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 5 + (i % 3), 0, 7); g.fill(); } }
  else if (sk.st === 'scale') { g.strokeStyle = M.hsl(sk.h2, 80, 70, .6); g.lineWidth = 2; for (let y = 6; y < 64; y += 10) for (let x = (y / 10 % 2) * 7; x < 64; x += 14) { g.beginPath(); g.arc(x, y, 7, .2, Math.PI - .2); g.stroke(); } }
  else if (sk.st === 'stripe') { g.fillRect(26, 0, 12, 64); }
  else if (sk.st === 'tiger') { g.fillStyle = 'rgba(20,10,10,.75)'; for (let i = -1; i < 2; i++) { g.beginPath(); g.moveTo(32 + i * 18 - 4, 0); g.lineTo(32 + i * 18 + 5, 0); g.lineTo(32 + i * 18 + (k ? 8 : -6), 64); g.lineTo(32 + i * 18 + (k ? 0 : -14), 64); g.fill(); } }
  else if (sk.st === 'glow') { g.fillStyle = M.hsl(sk.h2, 100, 80, .9); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(14 + ((i * 37 + k * 11) % 40), 14 + ((i * 23 + k * 17) % 40), 1.8 + i % 2, 0, 7); g.fill(); } }
  g.restore(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(32 - R * .38, 32 - R * .45, R * .28, R * .14, -.6, 0, 7); g.fill();
  return (segCache[key] = c); }
const foodCache = {};
function foodSprite(hue, gold) { const key = hue + (gold ? 'g' : ''); if (foodCache[key]) return foodCache[key]; const c = PK.makeCanvas(48, 48), g = c.getContext('2d');
  const gl = g.createRadialGradient(24, 24, 2, 24, 24, 24); gl.addColorStop(0, M.hsl(hue, 100, 70, .7)); gl.addColorStop(1, M.hsl(hue, 100, 60, 0)); g.fillStyle = gl; g.fillRect(0, 0, 48, 48); AR.orb(g, 24, 24, 13, hue, { rim: false }); if (gold) PK.star(g, 24, 25, 8, '#fff8d0'); return (foodCache[key] = c); }
function mkWorm(o, len, x, y) { const a = M.rand(6.28), w = Object.assign(o, { x, y, a, len, segs: [], shield: 0, boost: false, alive: true, best: len, buffs: {} });
  for (let i = 0; i < 40; i++) w.segs.push({ x: x - Math.cos(a) * i * 8, y: y - Math.sin(a) * i * 8 }); return w; }
const rad = (w) => Math.min(46, 11 + Math.sqrt(w.len) * 1.5);
const nSeg = (w) => Math.min(130, 8 + Math.floor(w.len * .45)), nS = (w) => Math.min(nSeg(w), w.segs.length);
function spawnSpot(minD = 500) { for (let k = 0; k < 40; k++) { const a = M.rand(6.28), r = M.rand(300, WR - 300), x = Math.cos(a) * r, y = Math.sin(a) * r; if (!worms.some(w => w.alive && Math.hypot(w.x - x, w.y - y) < minD)) return [x, y]; } return [0, 0]; }
function addFood(x, y, v = 1, gold = false) { if (food.length >= MAXFOOD + 200) return; food.push({ x, y, v, gold, hue: gold ? 48 : M.pick(AR.HUES), ph: M.rand(6.28) }); }
function rivalSkin() { const s = M.pick(SK); return { hue: s.hue + M.rand(-8, 8), h2: s.h2, st: s.st }; }
function addRival(silent) { const r = AR.rival(lv()); Object.assign(r, rivalSkin(), { lvl: Math.max(1, lv() + 1 + M.irand(-3, 6)) }); const [x, y] = spawnSpot(); const len = Math.round(M.rand(12, 34) + lv() * 2.5 + (t > 30 ? M.rand(0, 60) : 0)); worms.push(mkWorm(r, len, x, y)); if (!silent) AR.say(`${r.name} joined`, 'rgba(200,255,200,.9)'); }
function addBoss(demo) { const r = AR.rival(lv() + 6); Object.assign(r, { hue: 0, h2: 280, st: 'scale', boss: true, skill: Math.min(.95, r.skill + .1), aggro: 1, lvl: lv() + 15, name: 'Boss ' + r.name }); const [x, y] = spawnSpot(900); boss = mkWorm(r, Math.round(Math.max(160, me.len * 2.2) + lv() * 10), x, y); worms.push(boss); if (!demo) { AR.say(`⚠ ${r.name} the BOSS entered the garden!`, '#ff9a8a'); sfx.tone({ f: 110, f2: 70, d: .7, type: 'sawtooth', v: .14, lp: 900 }); } }
function newMatch(boost) {
  cam = AR.cam(); worms = []; food = []; t = 0; endT = MATCH; ended = false; deathBy = ''; cd = 0; kills = 0; boss = null; bossSpawned = false; AR.clearFeed();
  const sk = SK[PK.skin()] || SK[0];
  me = mkWorm({ name: 'You', me: true, hue: sk.hue, h2: sk.h2, st: sk.st, lvl: lv() + 1 }, Math.round((14 + PK.up('start') * 6) * (boost ? 1.5 : 1)), 0, 0); me.shield = boost ? 5 : 2; worms.push(me);
  for (let i = 0; i < NR; i++) addRival(true);
  for (let i = 0; i < MAXFOOD; i++) { const a = M.rand(6.28), r = Math.sqrt(Math.random()) * (WR - 40); addFood(Math.cos(a) * r, Math.sin(a) * r, Math.random() < .1 ? 3 : 1); }
  items = AR.items({ kinds: ['magnet', 'speed', 'shield', 'burst', 'magnet', 'speed'], max: 14, every: 2.5, r: 20, spot: () => { const a = M.rand(6.28), r = Math.sqrt(Math.random()) * (WR - 200); return [Math.cos(a) * r, Math.sin(a) * r]; } });
  for (let i = 0; i < 10; i++) items.spawn(); aim = me.a;
}
function kill(w, by, demo) {
  if (!w.alive) return; w.alive = false; w.deadT = 0;
  const n = Math.min(60, Math.floor(w.len / 2)); for (let i = 0; i < n; i++) { const s = w.segs[Math.floor(i / n * nS(w))] || w; addFood(s.x + M.rand(-16, 16), s.y + M.rand(-16, 16), 2, i % 6 === 0); }
  if (by) { by.len += Math.floor(w.len * .45); by.best = Math.max(by.best, by.len); }
  if (w === boss) boss = null;
  if (demo) return; const [sx, sy] = cam.toScreen(w.x, w.y); fx.burst(sx, sy, { n: 26, color: M.hsl(w.hue, 90, 70), speed: 260, life: .8 });
  if (w.me) { deathBy = by ? by.name : 'the hedge'; sfx.fail(); fx.shake(14); deadAt = t; }
  else { AR.say(by ? `${by.me ? 'You' : by.name} gobbled ${w.name}` : `${w.name} bonked the hedge`, by && by.me ? '#fff1a0' : '#fff');
    if (by && by.me) { kills++; sfx.tone({ f: 300, f2: 900, d: .3, type: 'square', v: .12, lp: 1800 }); fx.shake(9); fx.text(sx, sy - 30, w.boss ? `BOSS DOWN! +${Math.floor(w.len * .45)}` : `+${Math.floor(w.len * .45)} GOBBLE!`, '#fff3a0', PK.S * (w.boss ? 2 : 1.4)); } }
}
function steerBot(b, dt) {
  if (AR.tick(b, dt)) {
    let best = null, bd = 1e9, threat = null, td = 1e9; const R = 420 + b.skill * 300;
    for (const o of worms) { if (o === b || !o.alive) continue; const d = Math.abs(o.x - b.x) + Math.abs(o.y - b.y); if (d > R * 1.4) continue;
      if (o.len > b.len * 1.05 && d < td) { td = d; threat = o; } else if (o.len < b.len * .9 && b.aggro > .45 && d < bd) { bd = d; best = o; } }
    if (threat && td < 300 + b.skill * 140 && !AR.oops(b)) { b.tgtA = Math.atan2(b.y - threat.y, b.x - threat.x) + M.rand(-.4, .4); b.boost = b.skill > .5 && td < 200; }
    else if (best && Math.random() < .5 + b.skill * .4) { b.tgtA = Math.atan2(best.y + Math.sin(best.a) * 60 - b.y, best.x + Math.cos(best.a) * 60 - b.x); b.boost = bd < 260 && b.len > 25 && Math.random() < b.skill; }
    else { let fb = null, fd = 1e9; for (const it of items.list) { const d = Math.abs(it.x - b.x) + Math.abs(it.y - b.y) - 200; if (d < fd) { fd = d; fb = it; } } for (let i = 0; i < food.length; i += 2) { const f = food[i], d = Math.abs(f.x - b.x) + Math.abs(f.y - b.y) - f.v * 40; if (d < fd) { fd = d; fb = f; } } b.tgtA = fb ? Math.atan2(fb.y - b.y, fb.x - b.x) : b.a + M.rand(-1, 1); b.boost = false; }
    if (AR.oops(b)) b.tgtA += M.rand(-1.5, 1.5);
    const dr = Math.hypot(b.x, b.y); if (dr > WR - 260) b.tgtA = Math.atan2(-b.y, -b.x) + M.rand(-.3, .3);
  }
  return b.tgtA === undefined ? b.a : b.tgtA;
}
function buildGrid() { grid = new Map(); for (const w of worms) { if (!w.alive) continue; const n = nS(w); for (let i = 3; i < n; i += 2) { const s = w.segs[i], k = ((s.x / CELL) | 0) * 4096 + ((s.y / CELL) | 0); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(w, s); } } }
function step(dt, demo) {
  t += dt;
  if (!bossSpawned && t > (demo ? 20 : 35)) { bossSpawned = true; addBoss(demo); }
  for (const w of worms) {
    if (!w.alive) { w.deadT += dt; continue; } AR.tickBuffs(w, dt);
    let target = w.a;
    if (w.me && !demo) { if (ptr) target = aim; else if (keyTurn) target = w.a + keyTurn * 2; w.boost = (boostKey || ptr2) && (w.len > 12 || AR.has(w, 'speed')); }
    else target = steerBot(w, dt);
    const turn = (4.2 - Math.min(2.2, w.len / 120)) * (w.me ? 1 + PK.up('agile') * .08 : .85 + w.skill * .3);
    w.a = AR.turnTo(w.a, target, turn * dt);
    const fast = w.boost || AR.has(w, 'speed'), sp = (fast ? 330 : 190) * (w.me ? 1 : .92 + w.skill * .12) * (w.boss ? .9 : 1);
    if (w.boost && !AR.has(w, 'speed')) { w.bt = (w.bt || 0) + dt; if (w.bt > .25) { w.bt = 0; w.len -= 1; const tl = w.segs[nS(w) - 1]; if (tl) addFood(tl.x, tl.y, 1); } }
    w.x += Math.cos(w.a) * sp * dt; w.y += Math.sin(w.a) * sp * dt; w.shield = Math.max(0, w.shield - dt);
    const r = rad(w), sp2 = r * .72; w.segs[0].x = w.x; w.segs[0].y = w.y; const n = nSeg(w);
    while (w.segs.length < n) { const l = w.segs[w.segs.length - 1]; w.segs.push({ x: l.x, y: l.y }); }
    for (let i = 1; i < n; i++) { const p = w.segs[i - 1], s = w.segs[i], dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy); if (d > sp2) { const k = (d - sp2) / d; s.x += dx * k; s.y += dy * k; } }
    if (Math.hypot(w.x, w.y) > WR - r) { if (AR.has(w, 'shield') || w.shield > 0) { w.a = Math.atan2(-w.y, -w.x); w.x *= .995; w.y *= .995; } else kill(w, null, demo); }
    const mag = r + 18 + (w.me ? PK.up('magnet') * 14 : 0) + (AR.has(w, 'magnet') ? 170 : 0), pull = mag + 30;
    for (let i = food.length - 1; i >= 0; i--) { const f = food[i], dx = w.x - f.x, dy = w.y - f.y; if (dx > pull || dx < -pull || dy > pull || dy < -pull) continue; const d = Math.hypot(dx, dy);
      if (d < pull) { f.x += dx * Math.min(1, dt * 8); f.y += dy * Math.min(1, dt * 8); }
      if (d < mag * .55 + r) { w.len += f.v * (f.gold ? 3 : 1); w.best = Math.max(w.best, w.len); food.splice(i, 1); if (w.me && !demo) { sfx.pop(1 + Math.min(1, w.len / 300)); if (f.gold) fx.text(W / 2, H / 2 - 50, '+9', '#ffe27a'); } } }
  }
  items.update(dt, worms.map(w => Object.assign(w, { r: rad(w) })), (w, k) => {
    if (k === 'burst') { for (let i = 0; i < 36; i++) { const a = i / 36 * 6.283, rr = M.rand(40, 160); addFood(w.x + Math.cos(a) * rr, w.y + Math.sin(a) * rr, 2, i % 9 === 0); } }
    else AR.buff(w, k, k === 'shield' ? 6 : 8);
    if (w.me && !demo) { sfx.tone({ f: 600, f2: 1200, d: .2, type: 'triangle', v: .16 }); fx.text(W / 2, H * .4, { magnet: 'MAGNET!', speed: 'FREE SPEED!', shield: 'SHIELD!', burst: 'SEED BURST!' }[k], '#fff4b0', PK.S * 1.5); } });
  // clashes (spatial grid over body segments): bigger tally wins
  buildGrid();
  for (const a of worms) { if (!a.alive) continue; const ra = rad(a), cx = (a.x / CELL) | 0, cy = (a.y / CELL) | 0; let hit = null;
    for (let gx = cx - 1; gx <= cx + 1 && !hit; gx++) for (let gy = cy - 1; gy <= cy + 1 && !hit; gy++) { const c = grid.get(gx * 4096 + gy); if (!c) continue;
      for (let j = 0; j < c.length; j += 2) { const b = c[j]; if (b === a || !b.alive) continue; const s = c[j + 1], rb = rad(b); if (Math.abs(a.x - s.x) < ra + rb && Math.abs(a.y - s.y) < ra + rb && Math.hypot(a.x - s.x, a.y - s.y) < ra * .8 + rb * .8) { hit = b; break; } } }
    if (!hit) continue; const b = hit, sa = a.shield > 0 || AR.has(a, 'shield'), sb = b.shield > 0 || AR.has(b, 'shield');
    if (a.len > b.len && !sb) kill(b, a, demo); else if (a.len < b.len && !sa) kill(a, b, demo); else { a.a += Math.PI * .8; } }
  for (let i = worms.length - 1; i >= 0; i--) { const w = worms[i]; if (!w.alive && !w.me && w.deadT > 1) { worms.splice(i, 1); if (!demo) AR.say(`${w.name} left`, 'rgba(255,255,255,.55)'); if (!w.boss && (endT - t > 20 || demo)) PK.later(() => worms && addRival(demo), M.rand(800, 3000)); } }
  let add = 0; while (food.length < MAXFOOD && add++ < 30) { const a = M.rand(6.28), r = Math.sqrt(Math.random()) * (WR - 40); addFood(Math.cos(a) * r, Math.sin(a) * r, Math.random() < .08 ? 3 : 1, !demo && endT - t < 20 && Math.random() < .25); }
  const focus = demo ? worms.find(w => w.alive) || me : me;
  cam.fit(900 + Math.sqrt(focus.len) * 30); cam.follow(focus.x, focus.y, dt, 5);
}
function finish() {
  if (ended) return; ended = true;
  const L = worms.map(w => ({ w, score: w.alive ? w.len : -1 })).sort((a, b) => b.score - a.score), place = L.findIndex(e => e.w === me) + 1, n = L.length;
  const coins = AR.placeCoins(place, n, 12 + lv() * 2) + Math.floor(me.len / 10) + kills * 4;
  if (place <= 3) PK.levelClear({ stars: 4 - place, msg: place === 1 ? 'Top Tally!' : `${AR.ord(place)} place!`, sub: `${AR.league(lv() + 1)} · tally ${me.len} · ${kills} gobbled`, coins, score: me.len });
  else PK.gameOver(me.len, `Finished ${AR.ord(place)} of ${n}`, coins);
}
function drawWorm(g, w, in_) { const r = rad(w), n = nS(w), alpha = w.alive ? 1 : 1 - w.deadT / .3, sk = w, s0 = segSprite(sk, 0), s1 = segSprite(sk, 1);
  g.globalAlpha = alpha * .25; g.strokeStyle = '#000'; g.lineWidth = r * 1.8; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(w.segs[0].x + 5, w.segs[0].y + 8); for (let i = 2; i < n; i += 2) g.lineTo(w.segs[i].x + 5, w.segs[i].y + 8); g.stroke();
  g.globalAlpha = alpha; const fast = w.boost || AR.has(w, 'speed');
  if (fast) { const gs = PK.glowSprite(M.hsl(w.hue, 100, 70, .6)); for (let i = n - 1; i >= 0; i -= 4) { const s = w.segs[i]; g.drawImage(gs, s.x - r * 1.8, s.y - r * 1.8, r * 3.6, r * 3.6); } }
  for (let i = n - 1; i >= 1; i--) { const s = w.segs[i]; if (!in_(s.x, s.y)) continue; const rr = r * (1 - i / n * .35); g.drawImage(((i / 3) | 0) % 2 ? s1 : s0, s.x - rr, s.y - rr, rr * 2, rr * 2); }
  AR.critter(g, w.x, w.y, r * 1.15, w.hue, { dir: w.a, shadow: false, seed: w.hue | 0, pat: 0 });
  if (w.boss) { g.fillStyle = '#ffd34a'; g.beginPath(); const cy = w.y - r * 1.1; g.moveTo(w.x - r * .7, cy); for (let k = 0; k < 5; k++) g.lineTo(w.x - r * .7 + k * r * .35, cy - (k % 2 ? r * .25 : r * .7)); g.lineTo(w.x + r * .7, cy); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,60,60,.7)'; g.lineWidth = 3; g.beginPath(); g.arc(w.x, w.y, r * 1.5, 0, 7); g.stroke(); }
  if (w.shield > 0) { g.strokeStyle = `rgba(160,230,255,${.4 + Math.sin(PK.t * 10) * .2})`; g.lineWidth = 4; g.beginPath(); g.arc(w.x, w.y, r * 1.7, 0, 7); g.stroke(); }
  AR.drawBuffs(g, w, r * 1.2);
  const s = PK.S / cam.z; text(String(Math.floor(w.len)), w.x, w.y - r * 1.15 - s * (w.boss ? 1.6 : .9), s * (w.boss ? 1.5 : 1.05), { color: w.boss ? '#ffd34a' : '#fff', weight: 900, shadow: false });
  if (!w.me) text(`Lv${w.lvl} ${w.name}`, w.x, w.y + r * 1.15 + s * .8, s * .7, { color: w.boss ? '#ffb0a0' : 'rgba(255,255,255,.85)', weight: 700, shadow: false });
  g.globalAlpha = 1; }
const G = {
  title: 'Tallyworm', tagline: 'Eat. Grow. Out-tally everyone.', accent: '#b6ff6a', bg0: '#16301c', bg1: '#06120a', unit: '',
  howto: ['Drag to steer · hold a 2nd finger or Space to dash', 'Bigger tally wins every clash · grab 🧲 ⚡ 🛡 ✸ power-ups', 'A boss worm arrives at 0:35 · top 3 climbs the league'],
  music: { root: 220, scale: [0, 3, 5, 7, 10, 12], bpm: 112, voice: 'pluck', density: .5 },
  levelWord: 'League match', nextLabel: 'Next match', reviveLabel: 'respawn at full size', boostLabel: 'start 50% bigger + shield',
  meta: { currency: '✿', daily: 40, rewardId: 'tallyworm-2x', reviveId: 'tallyworm-revive', boostId: 'tallyworm-boost',
    upgrades: [{ id: 'start', name: 'Start Level', desc: '+6 starting tally', cost: 80, max: 10 }, { id: 'agile', name: 'Speed & Turn', desc: 'turn sharper', cost: 90, max: 8 }, { id: 'magnet', name: 'Item Power', desc: 'wider seed pickup', cost: 100, max: 8 }],
    skins: SK, skinIcon(g, x, y, r, i) { const s = SK[i]; for (let k = 3; k >= 0; k--) g.drawImage(segSprite(s, k % 2), x - r * .5 + k * r * .33 - r * .45, y + Math.sin(k) * r * .2 - r * .45, r * .9, r * .9); } },
  titleExtra: () => AR.league(lv()),
  qaPos: () => me ? [me.x, me.y] : [0, 0], qaIdle: () => !ptr && !keyTurn && !boostKey,
  init(w, h) { W = w; H = h; newMatch(false); }, resize(w, h) { W = w; H = h; },
  start(b) { newMatch(b); }, nextLevel(l, b) { newMatch(b); },
  canRevive: () => !me.alive && endT - t > 8,
  revive() { const [x, y] = spawnSpot(); const len = Math.max(me.best, me.len); Object.assign(me, mkWorm(me, len, x, y)); me.shield = 3; cam.x = x; cam.y = y; deathBy = ''; ended = false; },
  cancel() { ptr = null; ptr2 = false; keyTurn = 0; boostKey = false; },
  idle(dt) { if (!worms.length) newMatch(false); step(dt, true); },
  update(dt) {
    cd += dt; if (cd < 3) { cam.fit(900); cam.follow(me.x, me.y, dt); return; }
    step(dt, false);
    if (!me.alive) { if (t - deadAt > .9) PK.gameOver(me.len, `Gobbled by ${deathBy}`, Math.floor(me.best / 8) + kills * 4); return; }
    if (t >= endT) finish();
  },
  down(x, y, id) { if (ptr && ptr.id !== undefined && !PK.pointers.has(ptr.id)) ptr = null; if (ptr && ptr.id !== id) { ptr2 = true; return; } ptr = { id }; this.move(x, y, id, true); },
  move(x, y, id) { if (!ptr || ptr.id !== id) return; aim = Math.atan2(y - H / 2, x - W / 2); },
  up(x, y, id) { if (ptr && ptr.id === id) ptr = null; else ptr2 = false; },
  key(k, d) { if (k === 'ArrowLeft' || k === 'a') keyTurn = d ? -1 : (keyTurn === -1 ? 0 : keyTurn); if (k === 'ArrowRight' || k === 'd') keyTurn = d ? 1 : (keyTurn === 1 ? 0 : keyTurn); if (k === ' ' || k === 'ArrowUp') boostKey = d; },
  draw(g) {
    const vx0 = cam.x - W / 2 / cam.z - 60, vx1 = cam.x + W / 2 / cam.z + 60, vy0 = cam.y - H / 2 / cam.z - 60, vy1 = cam.y + H / 2 / cam.z + 60, in_ = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;

    g.save(); cam.apply(g);
    // ground: pattern only over the visible rect (no huge arc fills); hedge ring drawn only when near the edge
    AR.ground(g, 'grass', '#1f4a26', '#3f7a35');
    const nearEdge = Math.hypot(cam.x, cam.y) + Math.hypot(W, H) / cam.z > WR - 100;
    if (nearEdge) { g.fillStyle = '#0b1a0e'; g.beginPath(); g.rect(vx0, vy0, vx1 - vx0, vy1 - vy0); g.arc(0, 0, WR, 0, 6.2832, true); g.fill(); g.strokeStyle = '#1d5a24'; g.lineWidth = 60; g.beginPath(); g.arc(0, 0, WR + 20, 0, 6.2832); g.stroke(); g.strokeStyle = '#2f7a33'; g.lineWidth = 18; g.beginPath(); g.arc(0, 0, WR - 6, 0, 6.2832); g.stroke(); }
    for (const f of food) { if (!in_(f.x, f.y)) continue; const r = ((f.v > 1 ? 9 : 6) + (f.gold ? 4 : 0)) * (1 + Math.sin(PK.t * 4 + f.ph) * .12) * 2.1; g.drawImage(foodSprite(f.hue, f.gold), f.x - r, f.y - r, r * 2, r * 2); }
    items.draw(g, 1.1);
    const list = worms.filter(w => (w.alive || w.deadT < .3)).sort((a, b) => a.len - b.len);
    for (const w of list) { const n = nS(w); if (!in_(w.x, w.y) && !in_(w.segs[n - 1].x, w.segs[n - 1].y) && !in_(w.segs[n >> 1].x, w.segs[n >> 1].y)) continue; drawWorm(g, w, in_); }
    g.restore();
    if (me.alive && PK.state === 'play') { for (const w of worms) { if (w === me || !w.alive) continue; const [sx, sy] = cam.toScreen(w.x, w.y); if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
      if (Math.hypot(w.x - me.x, w.y - me.y) > 1300 && !w.boss) continue; const a = Math.atan2(sy - H / 2, sx - W / 2), ex = W / 2 + Math.cos(a) * (W / 2 - 24), ey = H / 2 + Math.sin(a) * (H / 2 - 24), bigger = w.len > me.len;
      g.fillStyle = w.boss ? '#ffd34a' : bigger ? 'rgba(255,90,90,.85)' : 'rgba(140,255,140,.85)'; g.save(); g.translate(M.clamp(ex, 20, W - 20), M.clamp(ey, 20, H - 20)); g.rotate(a); g.beginPath(); g.moveTo(w.boss ? 14 : 10, 0); g.lineTo(-6, -7); g.lineTo(-6, 7); g.fill(); g.restore(); } }
  },
  hud(g) {
    const s = PK.S; if (cd < 3.6) AR.countdown(g, cd, 3);
    text(AR.fmt(endT - t), W / 2, s * 1.8, s * 1.5, { color: endT - t < 15 ? '#ff9a7a' : '#fff', weight: 800 });
    if (endT - t < 20 && endT - t > 0) text('Golden seed frenzy!', W / 2, s * 3.3, s * .75, { color: '#ffe27a' });
    AR.board(g, worms.filter(w => w.alive).map(w => ({ name: (w.boss ? '👑 ' : '') + w.name, score: w.len, me: w.me, color: M.hsl(w.hue, 80, 60) })), { title: 'Top 8 live', rows: 8, w: Math.min(W * .42, s * 10), s: Math.min(s, H / 30) });
    AR.drawFeed(g, s * .5, s * 3.2, s, 1 / 60);
    text(`${Math.floor(me.len)}`, W / 2, H - s * 2.2, s * 2.2, { color: '#e7ffd0', weight: 900 }); text('TALLY', W / 2, H - s * .8, s * .6, { color: 'rgba(230,255,210,.7)' });
    AR.buffHud(g, me, s * .5, H - s * 3.4, s * .9);
    // minimap
    const mr = Math.min(W, H) * .11, mx = W - mr - s * .5, my = H - mr - s * .5; g.fillStyle = 'rgba(8,20,10,.55)'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1.5; g.stroke();
    for (const w of worms) { if (!w.alive) continue; g.fillStyle = w.me ? '#fff' : w.boss ? '#ffd34a' : M.hsl(w.hue, 80, 60, .8); const r = w.me || w.boss ? 3.5 : 2; g.fillRect(mx + w.x / WR * mr - r / 2, my + w.y / WR * mr - r / 2, r, r); }
  },
};
PK.run(G);
})();
