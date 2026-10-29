/* © 2026 Randomness. All rights reserved. Unauthorized copying or redistribution is prohibited. */
/* @libs arena */
// Frostline Rush — downhill ski race against 5 rival skiers: thread the gates, launch off kickers and spin tricks for boost, dodge pines.
(() => {
'use strict';
const { M, fx, sfx, text } = PK;
const LEN = 9600, NB = 5;
const SK = [{ name: 'Rookie', cost: 0, hue: 205 }, { name: 'Tangerine', cost: 150, hue: 25 }, { name: 'Mint Racer', cost: 300, hue: 150 }, { name: 'Berry Bolt', cost: 500, hue: 320 }, { name: 'Gold Medal', cost: 800, hue: 46 }, { name: 'Night Owl', cost: 1200, hue: 255 }]; AR.moreSkins(SK, 18);
let W, H, ss, me, cd, seed, gates, trees, rocks, ramps, items, tokens, ended, drag = null, keyX = 0, camY = 0, camX = 0, finish, flakes, tokGot = 0;
function cxAt(y) { return Math.sin(y * .0011 + seed) * 210 + Math.sin(y * .0027 + seed * 2) * 80 + Math.sin(y * .0061 + seed * 3) * 20 * Math.min(1, y / 900); }
function wAt(y) { const lv = PK.level(); return M.lerp(620, 520 - Math.min(110, lv * 8) + Math.sin(y * .0033 + seed) * 70, M.clamp((y - 150) / 500, 0, 1)); }
function mk(o, x) { return Object.assign(o, { x, y: 60, vx: 0, sp: 0, r: 16, crash: 0, hearts: 3, done: 0, gi: 0, combo: 0, boostT: 0, slowT: 0, air: 0, airT: 0, z: 0, spin: 0, spinQ: 0, tricks: 0, shield: 0, mag: 0, trail: [], head: 0 }); }
const clearOf = (x, y, list, d) => list.every(o => Math.abs(o.y - y) > d || Math.abs(o.x - x) > d);
function newRace(boost) {
  seed = M.rand(100); cd = 0; ended = false; finish = []; tokGot = 0; AR.clearFeed(); gates = []; trees = []; rocks = []; ramps = []; items = []; tokens = []; ss = [];
  const lv = PK.level();
  let side = Math.random() < .5 ? -1 : 1;
  for (let y = 520; y < LEN - 300; y += M.rand(360, 470) - Math.min(70, lv * 5)) { side = -side; const w = wAt(y); gates.push({ y, x: cxAt(y) + side * w * M.rand(.12, .28), gap: Math.max(96, 130 - lv * 2), red: side > 0 }); }
  for (let y = 1100; y < LEN - 500; y += M.rand(900, 1300)) { const near = gates.find(g => Math.abs(g.y - y) < 120); if (near) y += 160; ramps.push({ y, x: cxAt(y) + M.rand(-.22, .22) * wAt(y), w: 96 }); }
  const blocked = (x, y, d) => !clearOf(x, y, gates, d) || !clearOf(x, y, ramps, d + 40) || gates.some(g => Math.abs(g.y - y) < 70 && Math.abs(g.x - x) < g.gap / 2 + 40);
  for (let y = 700; y < LEN - 200; y += M.rand(55, 110) - Math.min(25, lv * 2)) { const w = wAt(y), x = cxAt(y) + M.rand(-.45, .45) * w; if (blocked(x, y, 70)) continue; if (Math.random() < .62) trees.push({ x, y, r: M.rand(17, 24), s: M.rand(.85, 1.2) }); else rocks.push({ x, y, r: M.rand(12, 18) }); }
  for (let y = 900; y < LEN - 400; y += M.rand(600, 950)) { const x = cxAt(y) + M.rand(-.3, .3) * wAt(y); if (!blocked(x, y, 60) && clearOf(x, y, trees, 60)) items.push({ x, y, k: M.pick(['speed', 'shield', 'heart', 'magnet', 'speed']), got: new Set() }); }
  for (let y = 600; y < LEN - 300; y += M.rand(500, 800)) { const x0 = cxAt(y) + M.rand(-.3, .3) * wAt(y); for (let k = 0; k < 6; k++) { const yy = y + k * 34, xx = x0 + Math.sin(k * .9) * 40; if (clearOf(xx, yy, trees, 40) && clearOf(xx, yy, rocks, 34)) tokens.push({ x: xx, y: yy, got: false }); } }
  const sk = SK[PK.skin()] || SK[0]; me = mk({ name: 'You', me: true, hue: sk.hue, pat: sk.pat || 0, skill: .7, react: .1, think: 0, mistake: 0 }, 0); if (boost) me.boostT = 4; ss.push(me);
  for (let i = 0; i < NB; i++) ss.push(mk(AR.rival(PK.level()), 0));
  ss.forEach((m, i) => { m.x = cxAt(60) - 150 + i * 60; m.y = 60 - (i % 2) * 34; });
  camX = cxAt(60); camY = 60; flakes = []; for (let i = 0; i < 40; i++) flakes.push({ x: Math.random(), y: Math.random(), s: M.rand(1, 2.6), v: M.rand(.04, .1) });
}
const spinRate = (m) => 6.283 / (.42 - (m.me ? PK.up('air') * .03 : m.skill * .08));
function land(m, demo) {
  const frac = (m.spin % 6.283) / 6.283, mid = m.spinQ > 0 && frac > .2 && frac < .85;
  if (mid && !m.shield) { crash(m, demo, 'Sloppy landing!'); m.spin = 0; m.spinQ = 0; m.tricks = 0; return; }
  if (m.tricks > 0) { m.boostT = Math.max(m.boostT, .7 + m.tricks * .55); if (m.me && !demo) { const nm = ['', '360!', '720!', '1080!', '1440!!'][Math.min(4, m.tricks)]; tokGot += m.tricks * 3; sfx.win(); fx.shake(6); fx.text(W / 2, H * .42, `${nm} +${m.tricks * 3} ⛀`, '#ffe680', PK.S * 1.6); } else if (!demo && m.tricks >= 2) AR.say(`${m.name} stomped a ${m.tricks * 360}!`, '#cfe8ff'); }
  else if (m.me && !demo) sfx.thud(.3);
  m.spin = 0; m.spinQ = 0; m.tricks = 0;
}
function crash(m, demo, why) { m.crash = 1.05; m.sp *= .15; m.vx = 0; m.combo = 0; m.air = 0; m.z = 0; if (!m.me || demo) return; m.hearts--; sfx.fail(); fx.shake(12); fx.text(W / 2, H * .45, why || 'WIPEOUT!', '#ffb0b0', PK.S * 1.3); }
function trick(m) { if (m.air > 0 && m.crash <= 0 && m.spinQ < 4) { m.spinQ++; return true; } return false; }
function step(dt, demo) {
  for (const m of ss) {
    if (m.done) { m.sp *= Math.exp(-2.5 * dt); m.y += m.sp * dt; m.x = M.approach(m.x, cxAt(m.y), 2, dt); continue; }
    m.shield = Math.max(0, m.shield - dt); m.mag = Math.max(0, m.mag - dt); m.boostT -= dt; m.slowT -= dt;
    if (m.crash > 0) { m.crash -= dt; m.sp = M.approach(m.sp, 0, 4, dt); m.y += m.sp * dt; if (m.crash <= 0) { if (m.hearts <= 0 && m.me && !demo) { m.crash = .001; continue; } m.shield = 1.2; } continue; }
    const c = cxAt(m.y), w = wAt(m.y);
    let steer;
    if (m.me && !demo) steer = M.clamp((drag ? (drag.tx - m.x) / 60 : 0) + keyX, -1, 1);
    else { if (AR.tick(m, dt) || m.lane === undefined) { m.lane = M.rand(-.2, .2); m.wob = AR.oops(m) ? M.rand(-.6, .6) : 0; m.wobT = .3; } if ((m.wobT -= dt) <= 0) m.wob = 0; steer = M.clamp((aiTarget(m) - m.x) / 45, -1, 1) + m.wob; }
    const off = Math.abs(m.x - c) - w / 2;
    let top = (m.me && !demo ? 360 + PK.up('speed') * 14 : 330 + m.skill * 55 + PK.level() * 3) * (m.boostT > 0 ? 1.4 : 1) * (m.slowT > 0 ? .7 : 1);
    if (off > 0 && m.air <= 0) top *= .5; // deep powder off-piste
    top *= 1 - Math.abs(steer) * .12; // carving bleeds a little speed
    m.sp = M.approach(m.sp, top, m.air > 0 ? .2 : 1.1, dt);
    const grip = m.me && !demo ? 320 + PK.up('grip') * 22 : 300 + m.skill * 30;
    if (m.air <= 0) m.vx = M.approach(m.vx, steer * grip, 6, dt); else m.vx *= Math.exp(-.3 * dt);
    m.x += m.vx * dt; m.y += m.sp * dt; m.head = M.approach(m.head, Math.atan2(m.vx, Math.max(60, m.sp)), 10, dt);
    // tree-line walls: bounce back with a speed penalty
    const lim = w / 2 + 110; if (Math.abs(m.x - c) > lim) { const s = Math.sign(m.x - c); m.x = c + s * lim; m.vx = -s * 220; m.sp *= .6; if (m.me && !demo) { sfx.thud(.4); fx.shake(6); } }
    if (m.air > 0) { m.air -= dt; const k = 1 - m.air / m.airT; m.z = Math.sin(Math.PI * M.clamp(k, 0, 1)); if (!(m.me && !demo) && m.spinQ === 0 && m.tricks === 0 && m.airT > .7 && k < .1) m.spinQ = Math.max(0, Math.floor(m.airT * M.rand(.6, 1.6) * m.skill / .5)); 
      if (m.spinQ > 0) { m.spin += spinRate(m) * dt; if (m.spin >= 6.283) { m.spin -= 6.283; m.spinQ--; m.tricks++; } }
      if (m.air <= 0) { m.z = 0; land(m, demo); } }
    else {
      for (const r of ramps) if (Math.abs(r.y - m.y) < m.sp * dt + 6 && Math.abs(r.x - m.x) < r.w / 2) { m.airT = m.air = .75 + m.sp / 900 + (m.me && !demo ? PK.up('air') * .05 : 0); m.spin = 0; m.spinQ = 0; m.tricks = 0; if (m.me && !demo) { sfx.whoosh(.4); fx.text(W / 2, H * .62, 'AIR! tap to spin', '#bfe9ff', PK.S * 1.1); } break; }
      if (!m.shield) { for (const t of trees) { if (Math.abs(t.y - m.y) > 30) continue; if (Math.hypot(t.x - m.x, (t.y - m.y) * 1.2) < t.r + m.r * .7) { crash(m, demo, 'TREE!'); m.y = t.y + t.r + m.r; break; } }
        for (const r of rocks) { if (Math.abs(r.y - m.y) > 24 || r.hitBy === m) continue; if (Math.hypot(r.x - m.x, r.y - m.y) < r.r + m.r * .6) { r.hitBy = m; m.sp *= .6; m.vx += Math.sign(m.x - r.x || 1) * 160; if (m.me && !demo) { sfx.thud(.3); fx.shake(5); } } } }
    }
    // gates: pass between the poles for a boost, miss one and lose speed
    const gt = gates[m.gi]; if (gt && m.y >= gt.y) { m.gi++; if (Math.abs(m.x - gt.x) < gt.gap / 2) { m.combo++; m.boostT = Math.max(m.boostT, .55 + Math.min(.6, m.combo * .08)); if (m.me && !demo) { sfx.chime(); if (m.combo % 5 === 0) { tokGot += 5; fx.text(W / 2, H * .5, `${m.combo} gate streak! +5 ⛀`, '#fff4b0', PK.S * 1.2); } } } else { m.combo = 0; m.slowT = .8; if (m.me && !demo) { sfx.thud(.25); fx.text(W / 2, H * .55, 'Missed gate', '#ffc0c0', PK.S); } } }
    for (const it of items) { if (it.got.has(m) || Math.abs(it.y - m.y) > 28 || m.z > .5) continue; if (Math.abs(it.x - m.x) < 34) { it.got.add(m); if (it.k === 'speed') m.boostT = 2.4; else if (it.k === 'shield') m.shield = 4; else if (it.k === 'magnet') m.mag = 6; else m.hearts = Math.min(3, m.hearts + 1);
      if (m.me && !demo) { sfx.chime(); fx.text(W / 2, H * .5, { speed: 'TURBO WAX!', shield: 'Snow globe: crash-proof 4 s', heart: '+1 heart', magnet: 'Token magnet!' }[it.k], '#fff4b0', PK.S * 1.1); } } }
    if (m.me && !demo) for (const tk of tokens) { if (tk.got || Math.abs(tk.y - m.y) > 150) continue; const d = Math.hypot(tk.x - m.x, tk.y - m.y); if (m.mag > 0 && d < 150) { tk.x = M.approach(tk.x, m.x, 8, dt); tk.y = M.approach(tk.y, m.y, 8, dt); } if (d < 28) { tk.got = true; tokGot++; sfx.pop(.4); } }
    if (m.y >= LEN) { m.done = finish.length + 1; finish.push(m); if (!demo) { if (m.me) sfx.win(); else AR.say(`${m.name} reached the lodge ${AR.ord(m.done)}`, '#fff'); } }
    if (PK.t - (m.tt || 0) > .05 && m.air <= 0) { m.tt = PK.t; m.trail.push(m.x, m.y); if (m.trail.length > 36) m.trail.splice(0, 2); }
  }
  for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) { const a = ss[i], b = ss[j]; if (a.crash > 0 || b.crash > 0 || (a.z > .3) !== (b.z > .3)) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d > 0 && d < a.r + b.r) { const nx = dx / d, ny = dy / d, ov = a.r + b.r - d; a.x -= nx * ov / 2; b.x += nx * ov / 2; a.y -= ny * ov / 2; b.y += ny * ov / 2; a.vx -= nx * 80; b.vx += nx * 80; if ((a.me || b.me) && !demo) sfx.pop(.5); } }
  const f = demo ? ss.slice().sort((a, b) => b.y - a.y)[0] : me; camY = M.approach(camY, f.y, 9, dt); camX = M.approach(camX, (f.x * 2 + cxAt(camY + 250)) / 3, 4, dt);
  if (demo && finish.length >= 2) newRace(false);
}
function aiTarget(m) {
  const look = m.y + 60 + m.skill * 140, c = cxAt(look), w = wAt(look); let tx = c + m.lane * w;
  const gt = gates[m.gi]; if (gt && gt.y - m.y < 420) tx = gt.x + M.clamp(m.lane, -.15, .15) * gt.gap;
  else if (m.skill > .45) { const r = ramps.find(q => q.y > m.y && q.y - m.y < 380); if (r) tx = r.x; }
  for (const t of trees.concat(rocks)) { if (t.y < m.y || t.y > m.y + 90 + m.skill * 130) continue; if (Math.abs(t.x - tx) < t.r + 30 && Math.abs(t.x - m.x) < t.r + 60) { const goR = (gt && gt.y - m.y < 420) ? gt.x > t.x : tx > t.x; tx = t.x + (goR ? 1 : -1) * (t.r + 38); } }
  return M.clamp(tx, c - w / 2 + 20, c + w / 2 - 20);
}
const SC = () => Math.min(W / 600, H / 820) * 1.05;
const sx = (x) => W / 2 + (x - camX) * SC(), sy = (y) => H * .3 + (y - camY) * SC();
const place = () => { const L = ss.slice().sort((a, b) => (b.done ? 1e6 - b.done : b.y) - (a.done ? 1e6 - a.done : a.y)); return L.indexOf(me) + 1; };
// ---------- original code-drawn sprites ----------
function treeSpr(px) { px = Math.max(8, Math.round(px)); const D = PK.DPR; return AR.bake('fpine' + px, px * D, px * 1.3 * D, (g, w, h) => { g.scale(D, D); const s = px / 60; g.fillStyle = 'rgba(40,60,90,.18)'; g.beginPath(); g.ellipse(34 * s, 70 * s, 26 * s, 9 * s, 0, 0, 7); g.fill(); g.fillStyle = '#6b4a32'; g.fillRect(27 * s, 58 * s, 7 * s, 14 * s);
  for (let k = 0; k < 3; k++) { const y = 10 * s + k * 15 * s, hw = (12 + k * 8) * s; g.fillStyle = ['#2f6b4f', '#2a5f47', '#245440'][k]; g.beginPath(); g.moveTo(30 * s, y - 6 * s); g.lineTo(30 * s + hw, y + 20 * s); g.lineTo(30 * s - hw, y + 20 * s); g.fill(); g.fillStyle = '#f4f9ff'; g.beginPath(); g.moveTo(30 * s, y - 6 * s); g.lineTo(30 * s + hw * .45, y + 4 * s); g.quadraticCurveTo(30 * s, y + 9 * s, 30 * s - hw * .45, y + 4 * s); g.fill(); } }); }
function skierSpr(hue, pat, px) { px = Math.max(10, Math.round(px)); const D = PK.DPR; return AR.bake('fski' + hue + '_' + pat + '_' + px, px * D, px * D, (g) => { g.scale(D * px / 64, D * px / 64); g.translate(32, 32);
  g.fillStyle = M.hsl(hue + 180, 70, 45); g.fillRect(-11, -26, 5, 52); g.fillRect(6, -26, 5, 52); g.fillStyle = M.hsl(hue + 180, 70, 70); g.fillRect(-11, -28, 5, 6); g.fillRect(6, -28, 5, 6); // skis
  g.strokeStyle = '#555'; g.lineWidth = 2; g.beginPath(); g.moveTo(-14, -2); g.lineTo(-20, -20); g.moveTo(14, -2); g.lineTo(20, -20); g.stroke(); // poles
  g.fillStyle = M.hsl(hue, 75, 50); g.beginPath(); g.ellipse(0, 2, 13, 10, 0, 0, 7); g.fill(); if (pat) { g.fillStyle = M.hsl(hue + 60 * pat, 80, 70); g.fillRect(-12, 0, 24, 3); } g.fillStyle = M.hsl(hue, 70, 35); g.beginPath(); g.arc(-13, -2, 4, 0, 7); g.arc(13, -2, 4, 0, 7); g.fill();
  g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(0, 8, 6.5, 0, 7); g.fill(); g.fillStyle = '#1d2b3a'; g.fillRect(-5.5, 9, 11, 3.5); g.fillStyle = M.hsl(hue + 40, 80, 60); g.beginPath(); g.arc(0, 5, 6.8, Math.PI, 0); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -1.5, 3, 0, 7); g.fill(); }); }
function flagSpr(red, px) { px = Math.max(8, Math.round(px)); const D = PK.DPR; return AR.bake('fflag' + red + px, px * D, px * 1.4 * D, (g) => { g.scale(D * px / 30, D * px / 30); g.fillStyle = 'rgba(40,60,90,.2)'; g.beginPath(); g.ellipse(9, 40, 9, 3, 0, 0, 7); g.fill(); g.fillStyle = '#eee'; g.fillRect(7, 4, 3, 36); g.fillStyle = red ? '#e5484d' : '#2f7de1'; g.beginPath(); g.moveTo(10, 5); g.lineTo(28, 11); g.lineTo(10, 19); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(10, 10, 14, 2); }); }
const G = {
  title: 'Frostline Rush', tagline: 'Gates. Kickers. Spins. First to the lodge.', accent: '#bfe9ff', bg0: '#9fd3ff', bg1: '#2a4a7a', unit: '',
  howto: ['Drag left/right to carve', 'Ski between the flags for a boost · dodge pines', 'Hit a kicker, TAP to spin · land clean for turbo', 'Top 3 at the lodge climbs the league'],
  music: { root: 330, scale: [0, 2, 4, 7, 9, 12], bpm: 138, voice: 'pluck', density: .55 },
  levelWord: 'Run', nextLabel: 'Next run', reviveLabel: 'refill hearts, keep skiing', boostLabel: 'rocket start (4 s turbo)',
  meta: { currency: '⛀', daily: 40, rewardId: 'frost-2x', reviveId: 'frost-revive', boostId: 'frost-boost',
    upgrades: [{ id: 'speed', name: 'Wax', desc: 'higher top speed', cost: 100, max: 5 }, { id: 'grip', name: 'Edges', desc: 'carve sharper', cost: 80, max: 5 }, { id: 'air', name: 'Air time', desc: 'bigger jumps, faster spins', cost: 120, max: 5 }],
    skins: SK, skinIcon(g, x, y, r, i) { const s = SK[i], im = skierSpr(s.hue, s.pat || 0, r * 2); g.drawImage(im, x - r, y - r, r * 2, r * 2); } },
  titleExtra: () => AR.league(PK.level()),
  qaPos: () => me ? [me.x, me.y] : [0, 0], qaIdle: () => true,
  qaBots: () => ss.map(m => ({ x: Math.round(m.x), y: Math.round(m.y), sp: Math.round(m.sp), crash: +m.crash.toFixed(2), done: m.done, me: !!m.me, gi: m.gi, air: m.air > 0 })),
  qaJump() { const r = ramps[0]; me.y = r.y - 80; me.x = r.x; me.vx = 0; me.sp = 300; camY = me.y; }, qaMe: () => ({ air: me.air, spinQ: me.spinQ, tricks: me.tricks, boostT: me.boostT, hearts: me.hearts, tok: tokGot }),
  init(w, h) { W = w; H = h; newRace(false); }, resize(w, h) { W = w; H = h; },
  start(b) { newRace(b); }, nextLevel(l, b) { newRace(b); },
  canRevive: () => me.hearts <= 0 && !me.done,
  revive() { me.hearts = 3; me.crash = 0; me.shield = 2.5; ended = false; },
  cancel() { drag = null; keyX = 0; },
  idle(dt) { step(dt, true); },
  update(dt) {
    cd += dt; if (cd < 3) return; step(dt, false); if (ended) return;
    const tc = (base) => base + tokGot;
    if (me.hearts <= 0 && me.crash > 0 && me.crash < .01 && !me.done) { ended = true; PK.gameOver(Math.floor(me.y / 60), 'Out of hearts', tc(6 + Math.floor(me.y / 450))); return; }
    if (me.done && me.done <= 3) { ended = true; PK.later(() => PK.levelClear({ stars: 4 - me.done, msg: me.done === 1 ? 'First down the mountain!' : `${AR.ord(me.done)} place!`, sub: AR.league(PK.level() + 1), coins: tc(AR.placeCoins(me.done, ss.length, 16 + PK.level() * 2)), score: 100 - me.done }), 700); }
    else if (finish.length >= 3 && !me.done) { ended = true; PK.gameOver(Math.floor(me.y / 60), `Podium full: you were ${AR.ord(place())}`, tc(AR.placeCoins(place(), ss.length, 10))); }
    else if (me.done > 3) { ended = true; PK.gameOver(100 - me.done, `Finished ${AR.ord(me.done)}`, tc(AR.placeCoins(me.done, ss.length, 10))); }
  },
  down(x, y, id) { if (me && me.air > 0 && trick(me)) { sfx.whoosh(.2); } drag = { id, x0: x, mx: me.x, tx: me.x }; },
  move(x, y, id) { if (drag && drag.id === id) drag.tx = drag.mx + (x - drag.x0) / SC() * 1.4; },
  up() { drag = null; },
  key(k, d) { if (k === 'ArrowLeft' || k === 'a') keyX = d ? -1 : (keyX < 0 ? 0 : keyX); if (k === 'ArrowRight' || k === 'd') keyX = d ? 1 : (keyX > 0 ? 0 : keyX); if ((k === ' ' || k === 'ArrowUp') && d && me) trick(me); },
  draw(g) {
    const S = SC();
    { const T = 256 / PK.DPR; g.save(); g.translate(-(((camX * S) % T) + T) % T, -(((camY * S) % T) + T) % T); AR.ground(g, 'snow', '#f6faff', '#dbe7f6'); g.restore(); }
    const y0 = camY - H * .32 / S, y1 = camY + H * .75 / S, st = 18;
    // deep powder + tree line outside the piste
    const L = [], R = []; for (let y = Math.floor(y0 / st) * st; y <= y1; y += st) { L.push([sx(cxAt(y) - wAt(y) / 2), sy(y)]); R.push([sx(cxAt(y) + wAt(y) / 2), sy(y)]); }
    g.fillStyle = 'rgba(150,180,220,.28)'; g.beginPath(); g.moveTo(0, L[0][1]); L.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(0, L[L.length - 1][1]); g.fill(); g.beginPath(); g.moveTo(W, R[0][1]); R.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(W, R[R.length - 1][1]); g.fill();
    g.strokeStyle = '#ff9a3c'; g.lineWidth = 2.5; g.setLineDash([10, 10]); for (const P of [L, R]) { g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); } g.setLineDash([]);
    const fy = sy(LEN); if (fy > -80 && fy < H + 80) { const a = sx(cxAt(LEN) - wAt(LEN) / 2), b = sx(cxAt(LEN) + wAt(LEN) / 2), n = 12; for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#1a2a44' : '#fff'; g.fillRect(a + (b - a) * i / n, fy - j * 12, (b - a) / n, 12); } g.fillStyle = '#7a4a2a'; g.fillRect((a + b) / 2 - 70 * S, fy + 40 * S, 140 * S, 60 * S); g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo((a + b) / 2 - 85 * S, fy + 42 * S); g.lineTo((a + b) / 2, fy); g.lineTo((a + b) / 2 + 85 * S, fy + 42 * S); g.fill(); g.fillStyle = '#ffd36b'; g.fillRect((a + b) / 2 - 15 * S, fy + 62 * S, 30 * S, 38 * S); }
    const vis = (y) => { const v = sy(y); return v > -90 && v < H + 60; };
    // ski tracks
    g.strokeStyle = 'rgba(120,150,190,.35)'; g.lineWidth = 1.5; g.beginPath(); for (const m of ss) { const t = m.trail; for (let k = 0; k < 2; k++) { const o = (k ? 5 : -5); for (let i = 0; i < t.length; i += 2) { const X = sx(t[i] + o), Y = sy(t[i + 1]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); } } } g.stroke();
    for (const r of ramps) { if (!vis(r.y)) continue; const x = sx(r.x), y = sy(r.y), w = r.w * S, h = 46 * S; g.fillStyle = 'rgba(60,90,140,.25)'; g.fillRect(x - w / 2 + 6, y - h + 8, w, h); g.fillStyle = '#cfe4fb'; g.beginPath(); g.moveTo(x - w / 2, y - h); g.lineTo(x + w / 2, y - h); g.lineTo(x + w / 2 + 6 * S, y); g.lineTo(x - w / 2 - 6 * S, y); g.fill(); g.fillStyle = '#9cc3ef'; g.fillRect(x - w / 2 - 6 * S, y - 6 * S, w + 12 * S, 6 * S); g.fillStyle = '#ff9a3c'; for (let k = 0; k < 3; k++) { const yy = y - h + 8 * S + k * 12 * S; g.beginPath(); g.moveTo(x - 10 * S, yy); g.lineTo(x, yy + 7 * S); g.lineTo(x + 10 * S, yy); g.lineTo(x + 10 * S, yy + 3 * S); g.lineTo(x, yy + 10 * S); g.lineTo(x - 10 * S, yy + 3 * S); g.fill(); } }
    for (const gt of gates) { if (!vis(gt.y)) continue; const px = 30 * S, fs = flagSpr(gt.red, px), y = sy(gt.y), passed = me.gi > gates.indexOf(gt); g.globalAlpha = passed ? .45 : 1; for (const s of [-1, 1]) g.drawImage(fs, sx(gt.x + s * gt.gap / 2) - px * .3, y - px * 1.3, px, px * 1.4); g.strokeStyle = gt.red ? 'rgba(229,72,77,.35)' : 'rgba(47,125,225,.35)'; g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(sx(gt.x - gt.gap / 2), y); g.lineTo(sx(gt.x + gt.gap / 2), y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
    for (const r of rocks) { if (!vis(r.y)) continue; const x = sx(r.x), y = sy(r.y), rr = r.r * S; g.fillStyle = 'rgba(60,80,110,.2)'; g.beginPath(); g.ellipse(x + 3, y + rr * .5, rr * 1.1, rr * .45, 0, 0, 7); g.fill(); g.fillStyle = '#8a94a6'; g.beginPath(); g.ellipse(x, y, rr, rr * .75, 0, 0, 7); g.fill(); g.fillStyle = '#f4f9ff'; g.beginPath(); g.ellipse(x - rr * .15, y - rr * .35, rr * .7, rr * .35, 0, 0, 7); g.fill(); }
    for (const tk of tokens) { if (tk.got || !vis(tk.y)) continue; const x = sx(tk.x), y = sy(tk.y), rr = 8 * S; g.fillStyle = '#e8a817'; g.beginPath(); g.arc(x, y + 1.5, rr, 0, 7); g.fill(); g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.strokeStyle = '#fff6c8'; g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k < 3; k++) { const a = k * 1.047 + PK.t; g.moveTo(x + Math.cos(a) * rr * .6, y + Math.sin(a) * rr * .6); g.lineTo(x - Math.cos(a) * rr * .6, y - Math.sin(a) * rr * .6); } g.stroke(); }
    for (const it of items) { if (it.got.has(me) || !vis(it.y)) continue; const R = 22 * S; g.drawImage(AR.itemSprite(it.k), sx(it.x) - R * 1.4, sy(it.y) - R * 1.4 + Math.sin(PK.t * 4 + it.y) * 3, R * 2.8, R * 2.8); }
    // pines + skiers, sorted by depth so skiers pass behind trees
    const objs = []; for (const t of trees) if (vis(t.y)) objs.push(t);
    const edgeStep = 70; for (let y = Math.floor(y0 / edgeStep) * edgeStep; y <= y1 + 80; y += edgeStep) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const h = Math.sin(y * 12.9898 + s * 78.233 + k * 37.7) * 43758.5453, fr = h - Math.floor(h); objs.push({ x: cxAt(y) + s * (wAt(y) / 2 + 60 + k * 70 + fr * 40), y: y + fr * 40, s: .9 + fr * .5, edge: 1 }); }
    for (const m of ss) objs.push({ m, y: m.y });
    objs.sort((a, b) => a.y - b.y);
    for (const o of objs) {
      if (!o.m) { const px = 66 * S * (o.s || 1), x = sx(o.x), y = sy(o.y); if (x < -px || x > W + px) continue; g.drawImage(treeSpr(px), x - px / 2, y - px * 1.05, px, px * 1.3); continue; }
      const m = o.m, x = sx(m.x), y = sy(m.y); if (y < -60 || y > H + 60) continue; const lift = m.z * 26 * S, sc = 1 + m.z * .35, px = 46 * S * sc;
      g.fillStyle = 'rgba(50,70,110,.22)'; g.beginPath(); g.ellipse(x + lift * .4, y + 6 * S, 14 * S, 6 * S, 0, 0, 7); g.fill();
      if (m.boostT > 0 && m.crash <= 0) { g.fillStyle = 'rgba(160,220,255,.4)'; g.beginPath(); g.ellipse(x, y - lift - 22 * S, 9 * S, 20 * S, 0, 0, 7); g.fill(); }
      g.save(); g.translate(x, y - lift); g.rotate(m.crash > 0 ? Math.sin(m.crash * 20) * .8 + 1.4 : -m.head + m.spin); g.drawImage(skierSpr(m.hue, m.pat || 0, px), -px / 2, -px / 2, px, px); g.restore();
      if (m.shield > 0) { g.strokeStyle = 'rgba(170,225,255,.75)'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y - lift, 26 * S, 0, 7); g.stroke(); }
      if (m.crash > 0) { g.fillStyle = 'rgba(255,255,255,.85)'; for (let k = 0; k < 6; k++) { const a = k * 1.05 + m.crash * 4; g.beginPath(); g.arc(x + Math.cos(a) * 20 * S * (1.2 - m.crash), y + Math.sin(a) * 12 * S, 5 * S, 0, 7); g.fill(); } }
      AR.tag(g, x, y - lift - 30 * S, m.me ? 'You' : m.name, m.me ? '#fff4b0' : '#fff', PK.S * .85);
    }
    g.fillStyle = 'rgba(255,255,255,.8)'; for (const f of flakes) { f.y = (f.y + f.v * (1 / 60)) % 1; const X = ((f.x + Math.sin(PK.t + f.y * 9) * .01) % 1) * W, Y = f.y * H; g.fillRect(X, Y, f.s, f.s); }
  },
  hud(g) {
    const s = PK.S; if (cd < 3.6) AR.countdown(g, cd, 3);
    text(`${AR.ord(place())} / ${ss.length}`, W / 2, s * 1.8, s * 1.5, { weight: 900 });
    for (let i = 0; i < 3; i++) text(i < me.hearts ? '♥' : '♡', s * 1.2 + i * s * 1.3, H - s * 1.4, s * 1.2, { color: '#ff5a7a' });
    text(`⛀ ${tokGot}`, W - s * 2.6, H - s * 1.4, s * 1, { color: '#ffe27a' });
    if (me.combo >= 2) text(`gate streak ×${me.combo}`, W / 2, s * 3.4, s * .9, { color: '#fff4b0' });
    if (me.air > 0) text(me.spinQ || me.tricks ? `${(me.tricks + (me.spinQ ? 1 : 0)) * 360}°` : 'TAP to spin!', W / 2, H * .7, s * 1.3, { weight: 900, color: '#bfe9ff' });
    const bh = H * .5, by = H * .25, bx = W - s * 1.2; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(bx - 3, by, 6, bh);
    for (const m of ss) { const k = Math.min(1, m.y / LEN); g.fillStyle = M.hsl(m.hue, 80, 55); g.beginPath(); g.arc(bx, by + bh * k, m.me ? 8 : 5, 0, 7); g.fill(); }
    AR.drawFeed(g, s * .5, s * 3.2, s, 1 / 60);
  },
};
PK.run(G);
})();
