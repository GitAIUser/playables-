/* @libs arena */
// Bumper Bloom — jelly sumo on a lily-flower island that sheds petals as the match goes on. Last jelly standing wins.
(() => {
'use strict';
const { M, fx, sfx, text } = PK;
const R0 = 900, RMIN = 210, MATCH = 110, NB = 11; // revision: much bigger flower island, 12 jellies, camera follows you
const SK = [{ name: 'Strawberry', cost: 0, hue: 350 }, { name: 'Mint', cost: 150, hue: 150, pat: 2 }, { name: 'Blueberry', cost: 300, hue: 225, pat: 1 }, { name: 'Mango', cost: 500, hue: 35, pat: 2 }, { name: 'Grape', cost: 800, hue: 280, pat: 3 }, { name: 'Lemon Star', cost: 1200, hue: 55, pat: 3 }]; AR.moreSkins(SK, 16); /*pc1*/
let items, W, H, cam, bs, me, t, cd, R, out, ended, stick = null, keys = {}, dashQ = false, ripples, joinQ;
function mk(o, x, y) { return Object.assign(o, { x, y, vx: 0, vy: 0, r: 34, m: 1, cool: 0, alive: true, fall: 0, dir: 0, shield: 0, giant: 0, squish: 0 }); }
function newMatch(boost) {
  cam = AR.cam(); bs = []; t = 0; cd = 0; R = R0; out = []; ended = false; ripples = []; AR.clearFeed();
  items = AR.items({ kinds: ['shield', 'grow', 'speed', 'bomb'], max: 6, every: 4, r: 26, spot: () => { const a = M.rand(6.283), d = Math.sqrt(Math.random()) * R * .75; return [Math.cos(a) * d, Math.sin(a) * d]; } });
  const sk = SK[PK.skin()] || SK[0]; me = mk({ name: 'You', me: true, hue: sk.hue, pat: sk.pat || 0, skill: .7, aggro: .6, react: .2, think: 0, mistake: 0 }, 0, 0);
  me.m = 1 + PK.up('mass') * .12; me.r = 34 + PK.up('mass') * 1.5; if (boost) { me.giant = 25; } bs.push(me); joinQ = [];
  for (let i = 0; i < NB; i++) { const a = (i + 1) / (NB + 1) * 6.283, r = AR.rival(PK.level()); const rr = i % 2 ? R0 * .62 : R0 * .38, b = mk(r, Math.cos(a) * rr, Math.sin(a) * rr); b.m = M.rand(.85, 1.2) + PK.level() * .02; b.r = 30 + b.m * 5; b.drop = 1 + i * .25; bs.push(b); joinQ.push(b); }
}
const petalSpr = () => AR.bake('petal', 200, 100, (g) => { const gr = g.createLinearGradient(0, 0, 200, 0); gr.addColorStop(0, '#ffd1e6'); gr.addColorStop(1, '#ff8fbf'); g.fillStyle = gr; g.beginPath(); g.ellipse(100, 50, 96, 46, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 50); g.quadraticCurveTo(100, 40, 190, 50); g.stroke(); });
const tuftSpr = () => AR.bake('tuft', 72, 48, (g) => { g.strokeStyle = '#3d7e34'; g.lineWidth = 3; g.lineCap = 'round'; for (let i = 0; i < 7; i++) { const x = 14 + i * 7; g.beginPath(); g.moveTo(x, 44); g.quadraticCurveTo(x + (i % 2 ? 6 : -6), 24, x + (i - 3) * 3, 8 + (i % 3) * 5); g.stroke(); } g.fillStyle = '#fff6a8'; g.beginPath(); g.arc(50, 12, 4, 0, 7); g.fill(); });
function alive() { return bs.filter(b => b.alive); }
function eliminate(b, by) {
  b.alive = false; b.fall = 0.001; out.push(b); ripples.push({ x: b.x, y: b.y, t: 0 }); sfx.splash(.35);
  const [sx, sy] = cam.toScreen(b.x, b.y); fx.burst(sx, sy, { n: 24, color: 'rgba(200,240,255,1)', speed: 200 });
  if (b.me) { sfx.fail(); fx.shake(12); }
  else { const k = b.lastHit && t - b.lastHit.t < 2.5 ? b.lastHit.by : null; AR.say(k ? `${k.me ? 'You' : k.name} bloomed ${b.name} off` : `${b.name} slipped off`, k && k.me ? '#fff1a0' : '#fff');
    if (k && k.me) { fx.text(sx, sy - 30, 'BLOOMED!', '#ffe9a0', PK.S * 1.5); sfx.tone({ f: 330, f2: 990, d: .3, type: 'square', v: .1, lp: 1800 }); PK.data.kos = (PK.data.kos | 0) + 1; } }
}
function dash(b, ax, ay) { if (b.cool > 0) return; const d = Math.hypot(ax, ay) || 1, p = (b.me ? 620 + PK.up('dash') * 50 : 560 + b.skill * 120); b.vx += ax / d * p; b.vy += ay / d * p; b.cool = b.me ? 1.1 : 1.3 + (1 - b.skill) * .8; b.squish = 1; if (b.me) sfx.whoosh(.2); }
function ai(b, dt) {
  if (!AR.tick(b, dt)) return b.want || [0, 0];
  const dc = Math.hypot(b.x, b.y);
  if (dc > R - b.r * 2.2 && !AR.oops(b)) return (b.want = [-b.x / dc, -b.y / dc]);
  let tg = null, bd = 1e9; for (const o of bs) { if (o === b || !o.alive || o.drop > 0) continue; const d = Math.hypot(o.x - b.x, o.y - b.y) - Math.hypot(o.x, o.y) * b.aggro * .6 + (o.me ? -40 * b.aggro : 0); if (d < bd) { bd = d; tg = o; } }
  if (!tg) return (b.want = [0, 0]);
  const od = Math.hypot(tg.x, tg.y) || 1, bx = tg.x - tg.x / od * 70, by = tg.y - tg.y / od * 70; // get between target and center
  let wx = bx - b.x, wy = by - b.y; const l = Math.hypot(wx, wy) || 1; wx /= l; wy /= l;
  const dx = tg.x - b.x, dy = tg.y - b.y, dist = Math.hypot(dx, dy);
  if (dist < 210 && Math.random() < .35 + b.skill * .5) { const ang = Math.abs(AR.wrapA(Math.atan2(dy, dx) - Math.atan2(tg.y, tg.x))); if (ang < 1 || AR.oops(b)) dash(b, dx + (AR.oops(b) ? M.rand(-200, 200) : 0), dy); }
  return (b.want = [wx, wy]);
}
function phys(dt, demo) {
  t += dt; if (!demo) R = Math.max(RMIN, R0 - Math.max(0, t - 8) * (R0 - RMIN) / (MATCH - 20));
  for (const b of bs) {
    if (b.drop > 0) { b.drop -= dt; if (b.drop <= 0 && !demo) { AR.say(`${b.name} joined`, 'rgba(200,255,220,.9)'); sfx.pop(.8); } continue; }
    if (!b.alive) { b.fall += dt; continue; }
    let ax = 0, ay = 0;
    if (b.me && !demo) { if (stick && stick.on) { ax = stick.dx; ay = stick.dy; } ax += (keys.r ? 1 : 0) - (keys.l ? 1 : 0); ay += (keys.d ? 1 : 0) - (keys.u ? 1 : 0); const l = Math.hypot(ax, ay); if (l > 1) { ax /= l; ay /= l; } if (dashQ) { dashQ = false; const dl = Math.hypot(ax, ay) > .1 ? 1 : 0; dash(b, dl ? ax : Math.cos(b.dir), dl ? ay : Math.sin(b.dir)); } }
    else [ax, ay] = ai(b, dt);
    AR.tickBuffs(b, dt); const acc = (b.me ? 900 + PK.up('grip') * 60 : 780 + b.skill * 160) * (AR.has(b, 'speed') ? 1.5 : 1); if (AR.has(b, 'speed')) b.cool -= dt; b.vx += ax * acc * dt; b.vy += ay * acc * dt;
    if (Math.hypot(ax, ay) > .2) b.dir = Math.atan2(ay, ax);
    const fr = Math.exp(-2.6 * dt); b.vx *= fr; b.vy *= fr; b.x += b.vx * dt; b.y += b.vy * dt; b.cool -= dt; b.shield = Math.max(0, b.shield - dt); b.giant = Math.max(0, b.giant - dt); b.squish = Math.max(0, b.squish - dt * 3);
    if (Math.hypot(b.x, b.y) > R + b.r * .2) eliminate(b);
  }
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], c = bs[j]; if (!a.alive || !c.alive || a.drop > 0 || c.drop > 0) continue;
    const ra = a.r * (a.giant ? 1.3 : 1), rc = c.r * (c.giant ? 1.3 : 1), dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy); if (d >= ra + rc || d === 0) continue;
    const nx = dx / d, ny = dy / d, ov = ra + rc - d, ma = a.m * (a.giant ? 1.8 : 1) * (a.shield ? 4 : 1), mc = c.m * (c.giant ? 1.8 : 1) * (c.shield ? 4 : 1);
    a.x -= nx * ov * mc / (ma + mc); a.y -= ny * ov * mc / (ma + mc); c.x += nx * ov * ma / (ma + mc); c.y += ny * ov * ma / (ma + mc);
    const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny; if (rv >= 0) continue;
    const imp = -(1 + 1.15) * rv / (1 / ma + 1 / mc); a.vx -= imp * nx / ma; a.vy -= imp * ny / ma; c.vx += imp * nx / mc; c.vy += imp * ny / mc;
    a.squish = c.squish = Math.min(1, imp / 600); a.lastHit = { by: c, t }; c.lastHit = { by: a, t };
    if (!demo && imp > 150) { const [sx, sy] = cam.toScreen(a.x + nx * ra, a.y + ny * ra); fx.burst(sx, sy, { n: 10, color: ['rgba(255,240,200,1)', 'rgba(255,170,200,1)'], speed: 220 }); sfx.thud(Math.min(.5, imp / 1500)); if (a.me || c.me) fx.shake(Math.min(10, imp / 120)); }
  }
  if (!demo) items.update(dt, bs.filter(b => b.alive && !(b.drop > 0)), (b, k) => { if (k === 'shield') b.shield = Math.max(b.shield, 5); else if (k === 'grow') b.giant = Math.max(b.giant, 6); else if (k === 'speed') AR.buff(b, 'speed', 5);
      else { for (const o of bs) { if (o === b || !o.alive) continue; const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy) || 1; if (d < 260) { const f = 900 * (1 - d / 260) / (o.m * (o.shield ? 4 : 1)); o.vx += dx / d * f; o.vy += dy / d * f; o.lastHit = { by: b, t }; } } ripples.push({ x: b.x, y: b.y, t: 0 }); const [sx, sy] = cam.toScreen(b.x, b.y); fx.burst(sx, sy, { n: 26, color: '#ffd0e8', speed: 340 }); sfx.thud(.5); if (b.me) fx.shake(8); }
      if (b.me) { sfx.chime(); const [sx, sy] = cam.toScreen(b.x, b.y); fx.text(sx, sy - 40, { shield: 'Iron jelly!', grow: 'Giant!', speed: 'Zoom!', bomb: 'Petal blast!' }[k], '#fff4b0'); } });
  for (const r of ripples) r.t += dt; ripples = ripples.filter(r => r.t < 1.4);
  if (demo) { cam.fit(Math.max(R * 2.3, 700)); cam.follow(0, 0, dt, 3); } else { const fz = Math.min(R * 2.3, 1150); cam.fit(fz); const f = me.alive ? me : { x: 0, y: 0 }; cam.follow(f.x * (fz < R * 2.2 ? 1 : .3), f.y * (fz < R * 2.2 ? 1 : .3), dt, 4); }
}
function finish(place) {
  if (ended) return; ended = true; const n = bs.length, coins = AR.placeCoins(place, n, 14 + PK.level() * 2);
  if (place <= 3) PK.levelClear({ stars: 4 - place, msg: place === 1 ? 'Last Bloom Standing!' : `${AR.ord(place)} place!`, sub: `${AR.league(PK.level() + 1)} unlocked`, coins, score: (n - place + 1) * 100 });
  else PK.gameOver((n - place + 1) * 100, `Knocked out · ${AR.ord(place)}`, coins);
}
const G = {
  title: 'Bumper Bloom', tagline: 'Jelly sumo on a shrinking flower.', accent: '#ff9ccf', bg0: '#1b3c57', bg1: '#07131f', unit: ' pts',
  howto: ['Drag anywhere to roll · tap with a 2nd finger or Space to dash', 'Shove rivals into the pond · grab 🛡 ⬆ ⚡ 💣 power-ups', 'Top 3 climbs the league · last jelly standing wins'],
  music: { root: 262, scale: [0, 2, 4, 7, 9, 12], bpm: 120, voice: 'pluck', density: .5 },
  levelWord: 'League bout', nextLabel: 'Next bout', reviveLabel: 'jump back in, shielded', boostLabel: 'start as a giant jelly',
  meta: { currency: '❀', daily: 40, rewardId: 'bloom-2x', reviveId: 'bloom-revive', boostId: 'bloom-boost',
    upgrades: [{ id: 'mass', name: 'Heavy Jelly', desc: 'harder to shove', cost: 100, max: 5 }, { id: 'dash', name: 'Spring Dash', desc: 'stronger dash', cost: 90, max: 5 }, { id: 'grip', name: 'Sticky Feet', desc: 'roll faster', cost: 80, max: 5 }],
    skins: SK, skinIcon(g, x, y, r, i) { AR.critter(g, x, y, r * .8, SK[i].hue, { shadow: false, pat: SK[i].pat }); } },
  titleExtra: () => AR.league(PK.level()),
  qaPos: () => me ? [me.x, me.y] : [0, 0], qaIdle: () => !stick && !Object.values(keys).some(Boolean),
  init(w, h) { W = w; H = h; newMatch(false); for (const b of bs) b.drop = 0; }, resize(w, h) { W = w; H = h; },
  start(b) { newMatch(b); }, nextLevel(l, b) { newMatch(b); },
  canRevive: () => !me.alive && alive().length >= 2,
  revive() { out = out.filter(b => b !== me); Object.assign(me, { alive: true, fall: 0, x: 0, y: 0, vx: 0, vy: 0, shield: 2.5 }); ended = false; },
  cancel() { stick = null;  for (const k in keys) keys[k] = false; },
  idle(dt) { phys(dt, true); for (const b of bs) if (!b.alive && b.fall > 1.5) { Object.assign(b, { alive: true, fall: 0, x: M.rand(-200, 200), y: M.rand(-200, 200), vx: 0, vy: 0 }); } },
  update(dt) {
    cd += dt; if (cd < 3) { cam.fit(Math.min(R * 2.3, 1150)); cam.follow(me.x, me.y, dt, 4); for (const b of bs) b.drop = Math.min(b.drop || 0, 3 - cd); return; }
    phys(dt, false); const al = alive();
    if (!me.alive && me.fall > .8 && !ended) { PK.gameOver((bs.length - al.length) * 100, `Splashed out · ${AR.ord(al.length + 1)}`, AR.placeCoins(al.length + 1, bs.length, 10)); return; }
    if (me.alive && al.length === 1) finish(1);
    else if (t > MATCH && me.alive) { const L = al.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)); finish(L.indexOf(me) + 1); }
  },
  down(x, y, id) { if (stick && stick.id !== undefined && !PK.pointers.has(stick.id)) stick = null; if (stick && stick.on && stick.id !== id) { dashQ = true; return; } stick = { id, x0: x, y0: y, dx: 0, dy: 0, on: true, t0: PK.t }; },
  move(x, y, id) { if (!stick || stick.id !== id) return; const dx = x - stick.x0, dy = y - stick.y0, l = Math.hypot(dx, dy), m = PK.S * 3; stick.dx = l > 6 ? dx / Math.max(l, m) : 0; stick.dy = l > 6 ? dy / Math.max(l, m) : 0; if (l > m) { stick.x0 = x - dx / l * m; stick.y0 = y - dy / l * m; } },
  up(x, y, id) { if (stick && stick.id === id) { if (PK.t - stick.t0 < .18 && Math.hypot(stick.dx, stick.dy) < .3) dashQ = true; stick = null; } },
  key(k, d) { const m = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd' }; if (m[k]) keys[m[k]] = d; if (k === ' ' && d) dashQ = true; },
  draw(g) {
    g.save(); g.translate((PK.t * 8) % 256, 0); AR.ground(g, 'water', '#17506e', '#2a7fa0'); g.restore();
    g.save(); cam.apply(g);
    for (const r of ripples) { g.strokeStyle = `rgba(220,250,255,${1 - r.t / 1.4})`; g.lineWidth = 4; g.beginPath(); g.arc(r.x, r.y, 20 + r.t * 90, 0, 7); g.stroke(); }
    // petals: one cached sprite stamped 18× (was 14 fresh gradients/frame)
    const pet = 18; g.lineWidth = 3; for (let i = 0; i < pet; i++) { const a = i / pet * 6.283 + PK.t * .05, lost = R < R0 - (i + 1) * (R0 - RMIN) / pet * .9; const cx = Math.cos(a) * R * .98, cy = Math.sin(a) * R * .98;
      g.fillStyle = lost ? 'rgba(255,170,205,.25)' : (i % 2 ? '#ffb3d4' : '#ff9cc7'); g.beginPath(); g.ellipse(cx, cy, R * .3, R * .15, a, 0, 7); g.fill(); if (!lost) { g.strokeStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.moveTo(cx - Math.cos(a) * R * .25, cy - Math.sin(a) * R * .25); g.lineTo(cx + Math.cos(a) * R * .25, cy + Math.sin(a) * R * .25); g.stroke(); } }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(0, 18, R, 0, 7); g.fill();
    g.fillStyle = '#3f8a3a'; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.fillStyle = '#5aa84a'; g.beginPath(); g.arc(-R * .05, -R * .05, R * .93, 0, 7); g.fill(); g.fillStyle = '#76c25c'; g.beginPath(); g.arc(-R * .18, -R * .18, R * .6, 0, 7); g.fill();
    { const ts = tuftSpr(); for (let i = 0; i < 70; i++) { const a = i * 2.39996, d = Math.sqrt((i + .5) / 70) * R0 * .95; if (d > R - 30) continue; const x = Math.cos(a) * d, y = Math.sin(a) * d; g.drawImage(ts, x - 18, y - 12, 36, 24); } }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 6; g.setLineDash([18, 14]); g.beginPath(); g.arc(0, 0, R - 16, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ffe48a'; g.beginPath(); g.arc(0, 0, 40, 0, 7); g.fill(); g.fillStyle = 'rgba(200,120,0,.4)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(Math.cos(i * 2.4) * 22, Math.sin(i * 2.4) * 22, 4, 0, 7); g.fill(); }
    items.draw(g, 1.2);
    const list = bs.slice().sort((a, b) => a.y - b.y);
    for (const b of list) {
      if (b.drop > 0) { const k = b.drop; AR.shadow(g, b.x, b.y + b.r * .8, b.r * (1 - Math.min(1, k) * .5), b.r * .3, .25); g.save(); g.translate(0, -k * 300); AR.critter(g, b.x, b.y, b.r, b.hue, { shadow: false, pat: b.pat }); g.restore(); continue; }
      const gi = b.giant ? 1.3 : 1, sq = b.squish * .25, r = b.r * gi; let sc = 1; if (!b.alive) { sc = Math.max(0, 1 - b.fall * 1.4); if (sc <= 0) continue; }
      g.save(); g.translate(b.x, b.y); g.scale(sc * (1 + sq), sc * (1 - sq)); if (b.shield) { g.strokeStyle = 'rgba(170,230,255,.7)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, r * 1.25, 0, 7); g.stroke(); }
      AR.critter(g, 0, 0, r, b.hue, { dir: b.dir, pat: b.pat, seed: b.hue, mood: b.alive ? '' : 'sad' }); g.restore();
      if (b.alive && b.cool <= 0 && b.me) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(b.x, b.y, r + 8, -1.57, 4.7); g.stroke(); }
      const s = PK.S / cam.z; if (b.alive) AR.tag(g, b.x, b.y - r - s * .9, b.me ? 'You' : b.name, b.me ? '#fff4b0' : '#fff', s);
    }
    g.restore();
    if (stick && stick.on) { g.save(); g.globalAlpha = .35; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(stick.x0, stick.y0, PK.S * 3, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(stick.x0 + stick.dx * PK.S * 3, stick.y0 + stick.dy * PK.S * 3, PK.S * 1.2, 0, 7); g.fill(); g.restore(); }
  },
  hud(g) {
    const s = PK.S; if (cd < 3.6) AR.countdown(g, cd, 3);
    text(AR.fmt(MATCH - t), W / 2, s * 1.8, s * 1.4, { weight: 800 }); text(`${alive().length} jellies left`, W / 2, s * 3.2, s * .75, { color: '#ffd6ea' });
    AR.board(g, bs.map(b => ({ name: b.me ? 'You' : b.name, score: b.alive ? Math.round(b.m * 100) : 0, alive: b.alive, me: b.me, color: M.hsl(b.hue, 80, 60) })), { title: 'Still standing · weight', rows: W < H ? 4 : 8, w: Math.min(W * .44, s * 10) });
    AR.drawFeed(g, s * .5, s * 3.2, s, 1 / 60);
  },
};
PK.run(G);
})();
