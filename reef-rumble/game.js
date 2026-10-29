/* @libs arena */
// Reef Rumble — a coral reef feeding frenzy. Gulp smaller fish, evolve through five forms, dodge the big ones.
(() => {
'use strict';
const { M, fx, sfx, text } = PK;
const WR = 1800, NR = 10, MATCH = 120, MAXSCHOOL = 260, MAXBUG = 70; // revision: many more tiny fish + seabed critters
const FORMS = ['Minnow', 'Clownfish', 'Pufferfish', 'Barracuda', 'Reef King'], TIER = [0, 40, 110, 230, 420];
const SK = [{ name: 'Tangerine', cost: 0, hue: 25 }, { name: 'Lagoon', cost: 150, hue: 185 }, { name: 'Royal Gramma', cost: 300, hue: 285 }, { name: 'Lime Wrasse', cost: 500, hue: 95 }, { name: 'Ruby', cost: 800, hue: 350 }, { name: 'Gold Koi', cost: 1200, hue: 48 }]; AR.moreSkins(SK, 16); /*pc1*/
let bugs = [], items, dashTap = false, W, H, cam, fish, small, me, t, cd, ended, ptr = null, aim = 0, keyA = null, dashK = false, ptr2 = false, bubbles, deathBy = '', deadAt = 0, weeds;
const tierOf = (m) => { let k = 0; for (let i = 0; i < TIER.length; i++) if (m >= TIER[i]) k = i; return k; };
const rad = (f) => 12 + Math.sqrt(f.mass) * 2.1;
function spot() { for (let k = 0; k < 30; k++) { const a = M.rand(6.28), r = M.rand(200, WR - 200), x = Math.cos(a) * r, y = Math.sin(a) * r; if (!fish.some(f => f.alive && Math.hypot(f.x - x, f.y - y) < 450)) return [x, y]; } return [0, 0]; }
function mk(o, mass) { const [x, y] = spot(); return Object.assign(o, { x, y, a: M.rand(6.28), mass, alive: true, vx: 0, vy: 0, dashT: 0, cool: 0, shield: 2, tail: 0, best: mass }); }
function addRival(silent) { const r = AR.rival(PK.level()); fish.push(mk(r, M.rand(8, 30) + (t > 30 ? M.rand(0, 120) : 0) + PK.level() * 2)); if (!silent) AR.say(`${r.name} swam in`, 'rgba(180,240,255,.9)'); }
function addSmall() { const a = M.rand(6.28), r = Math.sqrt(Math.random()) * (WR - 60), sch = Math.random() < .5; const n = sch ? M.irand(5, 11) : 1; for (let i = 0; i < n && small.length < MAXSCHOOL; i++) small.push({ x: Math.cos(a) * r + M.rand(-30, 30), y: Math.sin(a) * r + M.rand(-30, 30), a: M.rand(6.28), v: M.rand(.6, 1.6), hue: M.pick([45, 190, 320, 120, 10, 60, 270]), ph: M.rand(6), sz: M.rand(.6, 1.1) }); }
// seabed critters: shrimp (hop backwards when chased), sea bugs (slow crawlers), tiny crabs (sideways scuttle)
function addBug() { const a = M.rand(6.28), r = Math.sqrt(Math.random()) * (WR - 80), k = M.pick(['shrimp', 'shrimp', 'bug', 'crab']); bugs.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, a: M.rand(6.28), k, ph: M.rand(6), hop: 0, hue: k === 'shrimp' ? M.pick([8, 20, 340]) : k === 'bug' ? M.pick([200, 260, 40]) : M.pick([0, 25, 300]) }); }
function newMatch(boost) {
  cam = AR.cam(); fish = []; small = []; bubbles = []; t = 0; cd = 0; ended = false; AR.clearFeed(); deathBy = '';
  const sk = SK[PK.skin()] || SK[0]; me = mk({ name: 'You', me: true, hue: sk.hue, skill: .7, react: .2, think: 0, mistake: 0, aggro: .5 }, (6 + PK.up('start') * 6) + (boost ? 45 : 0)); me.x = 0; me.y = 0; fish.push(me);
  for (let i = 0; i < NR; i++) addRival(true); small.length = 0; bugs = []; for (let i = 0; i < 40; i++) addSmall(); for (let i = 0; i < MAXBUG; i++) addBug();
  items = AR.items({ kinds: ['magnet', 'speed', 'shield', 'grow'], max: 6, every: 5, r: 20, spot: () => { const a = M.rand(6.28), r = Math.sqrt(Math.random()) * (WR - 150); return [Math.cos(a) * r, Math.sin(a) * r]; } });
  weeds = []; for (let i = 0; i < 60; i++) { const a = M.rand(6.28), r = M.rand(100, WR - 40); weeds.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, h: M.rand(40, 110), hue: M.pick([150, 330, 20, 280]), coral: Math.random() < .5 }); }
  aim = me.a;
}
function eat(a, b) { const gain = Math.max(3, b.mass * .55); a.mass += gain; a.best = Math.max(a.best, a.mass); b.alive = false; b.deadT = 0; const [sx, sy] = cam.toScreen(b.x, b.y); fx.burst(sx, sy, { n: 22, color: ['rgba(200,240,255,1)', M.hsl(b.hue, 90, 70)], speed: 220 });
  if (b.me) { deathBy = a.name; deadAt = t; sfx.fail(); fx.shake(14); } else { AR.say(`${a.me ? 'You' : a.name} gulped ${b.name}`, a.me ? '#fff1a0' : '#fff'); if (a.me) { sfx.tone({ f: 200, f2: 700, d: .3, type: 'sine', v: .2 }); fx.shake(8); fx.text(sx, sy - 30, `GULP! +${Math.floor(gain)}`, '#fff3a0', PK.S * 1.4); } } }
function think(f, dt) {
  if (!AR.tick(f, dt)) return f.ta === undefined ? f.a : f.ta; const R = 360 + f.skill * 260; let th = null, td = 1e9, pr = null, pd = 1e9;
  for (const o of fish) { if (o === f || !o.alive) continue; const d = Math.hypot(o.x - f.x, o.y - f.y); if (d > R) continue; if (o.mass > f.mass * 1.15 && d < td) { td = d; th = o; } else if (o.mass * 1.15 < f.mass && d < pd) { pd = d; pr = o; } }
  f.dash = false;
  if (th && !AR.oops(f)) { f.ta = Math.atan2(f.y - th.y, f.x - th.x) + M.rand(-.5, .5); f.dash = td < 200 && f.skill > .4; }
  else if (pr && f.aggro > .35) { f.ta = Math.atan2(pr.y - f.y, pr.x - f.x); f.dash = pd < 180 && Math.random() < f.skill; }
  else { let b = null, bd = 1e9; for (const s of small) { const d = Math.hypot(s.x - f.x, s.y - f.y); if (d < bd) { bd = d; b = s; } } f.ta = b ? Math.atan2(b.y - f.y, b.x - f.x) : f.a + M.rand(-1, 1); }
  if (AR.oops(f)) f.ta += M.rand(-1.4, 1.4); if (Math.hypot(f.x, f.y) > WR - 200) f.ta = Math.atan2(-f.y, -f.x); return f.ta;
}
function step(dt, demo) {
  t += dt; if (small.length < MAXSCHOOL - 10 && Math.random() < dt * 5) addSmall(); if (bugs.length < MAXBUG && Math.random() < dt * 2) addBug();
  for (const f of fish) {
    if (!f.alive) { f.deadT += dt; continue; }
    let ta = f.a, dsh = false;
    if (f.me && !demo) { if (ptr) ta = aim; else if (keyA !== null) ta = keyA; dsh = dashK || ptr2 || dashTap; dashTap = false; } else { ta = think(f, dt); dsh = f.dash; }
    if (dsh && f.cool <= 0) { f.dashT = .35; f.cool = 1.4; if (f.mass > 12) f.mass -= 1.5; // dash at ANY size (old rule mass>10 vs start mass 6 = no dash after a restart)
      if (f.me && !demo) sfx.whoosh(.2); }
    f.a = AR.turnTo(f.a, ta, (5 - tierOf(f.mass) * .55) * dt); const sp = (175 - Math.min(60, Math.sqrt(f.mass) * 2.5)) * (f.dashT > 0 ? 2.4 : 1) * (AR.has(f, 'speed') ? 1.35 : 1) * (f.me ? 1 + PK.up('fins') * .05 : .9 + f.skill * .15);
    f.x += Math.cos(f.a) * sp * dt; f.y += Math.sin(f.a) * sp * dt; f.dashT -= dt; f.cool -= dt; f.shield = Math.max(0, f.shield - dt); f.tail += dt * (6 + sp / 30);
    const d0 = Math.hypot(f.x, f.y), rr = rad(f); if (d0 > WR - rr) { f.x *= (WR - rr) / d0; f.y *= (WR - rr) / d0; }
    AR.tickBuffs(f, dt); const mouth = rr * 1.05 + (f.me ? PK.up('jaw') * 4 : 0) + (AR.has(f, 'magnet') ? 60 : 0);
    for (let i = bugs.length - 1; i >= 0; i--) { const s = bugs[i]; if (Math.abs(s.x - f.x) < mouth && Math.abs(s.y - f.y) < mouth && Math.hypot(s.x - f.x, s.y - f.y) < mouth) { bugs.splice(i, 1); f.mass += s.k === 'crab' ? 3 : 1.5; f.best = Math.max(f.best, f.mass); if (f.me && !demo) sfx.pop(.8); } }
    for (let i = small.length - 1; i >= 0; i--) { const s = small[i]; if (Math.abs(s.x - f.x) < mouth && Math.abs(s.y - f.y) < mouth && Math.hypot(s.x - f.x, s.y - f.y) < mouth) { small.splice(i, 1); f.mass += 1 + s.sz; f.best = Math.max(f.best, f.mass); if (f.me && !demo) { sfx.pop(1 + Math.min(1, f.mass / 300)); const tr = tierOf(f.mass); if (tr > (me.tier || 0)) { me.tier = tr; sfx.win(); fx.text(W / 2, H * .38, `Evolved: ${FORMS[tr]}!`, '#9ff0ff', PK.S * 1.6); fx.shake(6); } } } }
  }
  for (const a of fish) for (const b of fish) { if (a === b || !a.alive || !b.alive || a.shield > 0 || b.shield > 0 || AR.has(b, 'shield')) continue; if (a.mass > b.mass * 1.15 && Math.hypot(a.x - b.x, a.y - b.y) < rad(a) * 1.05) eat(a, b); }
  for (const s of small) { s.ph += dt; const near = fish.find(f => f.alive && Math.hypot(f.x - s.x, f.y - s.y) < 120); if (near) s.a = AR.turnTo(s.a, Math.atan2(s.y - near.y, s.x - near.x), 4 * dt); else s.a += Math.sin(s.ph) * dt; s.x += Math.cos(s.a) * 55 * s.v * dt; s.y += Math.sin(s.a) * 55 * s.v * dt; const d = Math.hypot(s.x, s.y); if (d > WR - 30) s.a = Math.atan2(-s.y, -s.x); }
  for (const b of bugs) { b.ph += dt; let flee = null; for (const f of fish) if (f.alive && Math.abs(f.x - b.x) < 110 && Math.abs(f.y - b.y) < 110) { flee = f; break; }
    if (b.k === 'shrimp') { if (flee && b.hop <= 0) { b.a = Math.atan2(b.y - flee.y, b.x - flee.x); b.hop = .35; } const v = b.hop > 0 ? 260 : 12; b.hop -= dt; b.x += Math.cos(b.a) * v * dt; b.y += Math.sin(b.a) * v * dt; }
    else if (b.k === 'crab') { if (flee) b.a = Math.atan2(b.y - flee.y, b.x - flee.x); else b.a += Math.sin(b.ph * .7) * dt; const v = flee ? 80 : 22; b.x += Math.cos(b.a) * v * dt; b.y += Math.sin(b.a) * v * dt; }
    else { b.a += Math.sin(b.ph) * dt * .8; b.x += Math.cos(b.a) * 16 * dt; b.y += Math.sin(b.a) * 16 * dt; }
    const d = Math.hypot(b.x, b.y); if (d > WR - 40) b.a = Math.atan2(-b.y, -b.x); }
  if (!demo) items.update(dt, fish.filter(f => f.alive).map(f => Object.assign(f, { r: rad(f) })), (f, k) => { if (k === 'grow') { f.mass += 15; f.best = Math.max(f.best, f.mass); } else AR.buff(f, k, k === 'shield' ? 5 : 7); if (f.me) { sfx.chime(); const [sx, sy] = cam.toScreen(f.x, f.y); fx.text(sx, sy - 40, { magnet: 'Krill magnet!', speed: 'Current rider!', shield: 'Spiky shell!', grow: '+15 kg!' }[k], '#fff4b0'); } });
  for (let i = fish.length - 1; i >= 0; i--) { const f = fish[i]; if (!f.alive && !f.me && f.deadT > 1) { fish.splice(i, 1); if (!demo) AR.say(`${f.name} left`, 'rgba(255,255,255,.55)'); if (MATCH - t > 20 || demo) PK.later(() => fish && addRival(demo), M.rand(900, 3500)); } }
  if (Math.random() < dt * 6) bubbles.push({ x: cam.x + M.rand(-W, W) / cam.z, y: cam.y + H / cam.z, v: M.rand(30, 80), r: M.rand(2, 7) }); for (const b of bubbles) b.y -= b.v * dt; bubbles = bubbles.filter(b => b.y > cam.y - H / cam.z);
  const f = demo ? fish.find(q => q.alive) || me : me; cam.fit(800 + Math.sqrt(f.mass) * 30); cam.follow(f.x, f.y, dt, 5);
}
const tinyC = {};
function tinySpr(kind, hue) { const key = kind + hue; if (tinyC[key]) return tinyC[key]; const c = PK.makeCanvas(48, 32), g = c.getContext('2d'); g.translate(24, 16);
  if (kind === 'fish') { g.fillStyle = M.hsl(hue, 85, 60); g.beginPath(); g.ellipse(2, 0, 10, 5.5, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(-7, 0); g.lineTo(-15, -6); g.lineTo(-15, 6); g.fill(); g.fillStyle = M.hsl(hue + 20, 90, 80, .7); g.fillRect(-2, -4, 2, 8); g.fillStyle = '#fff'; g.beginPath(); g.arc(7, -1, 2, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(7.4, -1, 1, 0, 7); g.fill(); }
  else if (kind === 'shrimp') { g.strokeStyle = M.hsl(hue, 85, 62); g.lineCap = 'round'; for (let k = 0; k < 5; k++) { g.lineWidth = 6 - k; g.beginPath(); g.arc(-k * 3.2 + 6, 2 - Math.abs(k - 1) * 1.2, 3, Math.PI, 2 * Math.PI); g.stroke(); } g.strokeStyle = M.hsl(hue, 60, 85); g.lineWidth = 1; g.beginPath(); g.moveTo(10, -2); g.quadraticCurveTo(18, -10, 22, -4); g.moveTo(10, -1); g.quadraticCurveTo(19, -4, 22, 2); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(9, -3, 1.2, 0, 7); g.fill(); }
  else if (kind === 'bug') { g.fillStyle = M.hsl(hue, 40, 45); g.beginPath(); g.ellipse(0, 0, 11, 7, 0, 0, 7); g.fill(); g.strokeStyle = M.hsl(hue, 40, 30); g.lineWidth = 1.2; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 4, -7); g.lineTo(k * 4, 7); g.stroke(); g.beginPath(); g.moveTo(k * 4, 6); g.lineTo(k * 4 - 2, 10); g.moveTo(k * 4, -6); g.lineTo(k * 4 - 2, -10); g.stroke(); } g.beginPath(); g.moveTo(10, -3); g.lineTo(16, -7); g.moveTo(10, 3); g.lineTo(16, 7); g.stroke(); }
  else { g.fillStyle = M.hsl(hue, 80, 52); g.beginPath(); g.ellipse(0, 0, 8, 6, 0, 0, 7); g.fill(); g.strokeStyle = M.hsl(hue, 80, 40); g.lineWidth = 2; for (const sd of [-1, 1]) { for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-3 + k * 3, sd * 5); g.lineTo(-5 + k * 3, sd * 10); g.stroke(); } g.beginPath(); g.arc(8, sd * 6, 3, 0, 7); g.stroke(); } g.fillStyle = '#fff'; g.beginPath(); g.arc(5, -2, 1.6, 0, 7); g.arc(5, 2, 1.6, 0, 7); g.fill(); }
  return (tinyC[key] = c); }
function drawFish(g, f) {
  const r = rad(f), tr = tierOf(f.mass); g.save(); g.translate(f.x, f.y); g.rotate(f.a); const flip = Math.cos(f.a) < 0 ? -1 : 1; g.scale(1, flip);
  const L = r * (tr === 3 ? 1.9 : tr === 2 ? 1.1 : 1.5), Hh = r * (tr === 2 ? 1.05 : tr === 3 ? .55 : .8), wag = Math.sin(f.tail) * .35;
  g.fillStyle = 'rgba(0,20,40,.22)'; g.beginPath(); g.ellipse(6, 14, L, Hh, 0, 0, 7); g.fill();
  g.save(); g.translate(-L * .85, 0); g.rotate(wag); g.fillStyle = M.hsl(f.hue, 80, 45); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-r * .6, -r * .9, -r * .9, -r * .8); g.quadraticCurveTo(-r * .5, 0, -r * .9, r * .8); g.quadraticCurveTo(-r * .6, r * .9, 0, 0); g.fill(); g.restore();
  g.fillStyle = M.hsl(f.hue, 75, 50); g.beginPath(); g.moveTo(-L * .2, -Hh * .8); g.quadraticCurveTo(L * .1, -Hh * 1.6, L * .35, -Hh * .7); g.fill();
  const gr = g.createLinearGradient(0, -Hh, 0, Hh); gr.addColorStop(0, M.hsl(f.hue, 85, 62)); gr.addColorStop(.6, M.hsl(f.hue, 80, 50)); gr.addColorStop(1, M.hsl(f.hue + 20, 60, 85)); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, L, Hh, 0, 0, 7); g.fill();
  if (tr === 1 || tr === 4) { g.save(); g.clip(); g.fillStyle = 'rgba(255,255,255,.85)'; for (const k of [-.3, .25]) { g.beginPath(); g.ellipse(L * k, 0, r * .14, Hh, 0, 0, 7); g.fill(); } g.restore(); }
  if (tr === 2) { g.fillStyle = M.hsl(f.hue, 60, 30); for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; g.beginPath(); g.arc(Math.cos(a) * L * .95, Math.sin(a) * Hh * .95, r * .07, 0, 7); g.fill(); } }
  if (tr === 4) { g.fillStyle = '#ffd54a'; g.beginPath(); for (let k = 0; k < 5; k++) { g.lineTo(-r * .3 + k * r * .15, -Hh - (k % 2 ? r * .12 : r * .35)); } g.lineTo(r * .3, -Hh); g.lineTo(-r * .3, -Hh); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-L * .1, -Hh * .45, L * .5, Hh * .18, 0, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(L * .55, -Hh * .2, r * .22, 0, 7); g.fill(); g.fillStyle = '#10152a'; g.beginPath(); g.arc(L * .6, -Hh * .2, r * .12, 0, 7); g.fill();
  if (tr === 3) { g.fillStyle = '#fff'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(L * .7 + k * r * .08, Hh * .2); g.lineTo(L * .74 + k * r * .08, Hh * .45); g.lineTo(L * .78 + k * r * .08, Hh * .2); g.fill(); } }
  g.restore();
}
const dashBtn = () => ({ x: W - PK.S * 2.6, y: H - PK.S * 4.2, r: PK.S * 1.7 });
const G = {
  title: 'Reef Rumble', tagline: 'Eat smaller. Evolve. Rule the reef.', accent: '#7fe9ff', bg0: '#0c4a6e', bg1: '#021624', unit: ' kg',
  howto: ['Drag to swim · DASH button, 2nd finger or Space', 'Gulp fish smaller than you; flee the big ones', 'Evolve through 5 forms · top 3 after 2:00 climbs'],
  music: { root: 196, scale: [0, 2, 3, 7, 9, 12], bpm: 100, voice: 'bell', density: .45 },
  levelWord: 'League tide', nextLabel: 'Next tide', reviveLabel: 'respawn at full size', boostLabel: 'start as a Clownfish',
  meta: { currency: '🐚', daily: 40, rewardId: 'reef-2x', reviveId: 'reef-revive', boostId: 'reef-boost',
    upgrades: [{ id: 'start', name: 'Big Hatch', desc: 'start heavier', cost: 80, max: 5 }, { id: 'fins', name: 'Fast Fins', desc: 'swim faster', cost: 100, max: 5 }, { id: 'jaw', name: 'Wide Jaw', desc: 'bigger gulp', cost: 90, max: 5 }],
    skins: SK, skinIcon(g, x, y, r, i) { drawFish(g, { x, y, a: 0, mass: 60, hue: SK[i].hue, tail: 0 }); } },
  titleExtra: () => AR.league(PK.level()),
  qaPos: () => me ? [me.x, me.y] : [0, 0], qaIdle: () => !ptr,
  init(w, h) { W = w; H = h; newMatch(false); }, resize(w, h) { W = w; H = h; },
  start(b) { newMatch(b); }, nextLevel(l, b) { newMatch(b); },
  canRevive: () => !me.alive && MATCH - t > 10,
  revive() { const m = me.best; Object.assign(me, mk(me, m)); me.shield = 3; ended = false; },
  cancel() { ptr = null; ptr2 = false; dashK = false; dashTap = false; },
  idle(dt) { step(dt, true); },
  update(dt) {
    cd += dt; if (cd < 3) { cam.fit(800); cam.follow(me.x, me.y, dt); return; } step(dt, false); if (ended) return;
    if (!me.alive) { if (t - deadAt > .9) { ended = true; PK.gameOver(Math.floor(me.best), `Gulped by ${deathBy}`, Math.floor(me.best / 8)); } return; }
    if (t >= MATCH) { ended = true; const L = fish.filter(f => f.alive).sort((a, b) => b.mass - a.mass), p = L.indexOf(me) + 1, coins = AR.placeCoins(p, fish.length, 14 + PK.level() * 2) + Math.floor(me.mass / 10);
      if (p <= 3) PK.levelClear({ stars: 4 - p, msg: p === 1 ? 'Reef King!' : `${AR.ord(p)} place!`, sub: `${FORMS[tierOf(me.mass)]} · ${Math.floor(me.mass)} kg`, coins, score: Math.floor(me.mass) }); else PK.gameOver(Math.floor(me.mass), `Finished ${AR.ord(p)}`, coins); }
  },
  qaCool: () => me.cool,
  down(x, y, id) { { const b = dashBtn(); if (Math.hypot(x - b.x, y - b.y) < b.r * 1.15) { dashTap = true; return; } } if (ptr && ptr.id !== undefined && !PK.pointers.has(ptr.id)) ptr = null; if (ptr && ptr.id !== id) { ptr2 = true; return; } ptr = { id }; aim = Math.atan2(y - H / 2, x - W / 2); },
  move(x, y, id) { if (ptr && ptr.id === id) aim = Math.atan2(y - H / 2, x - W / 2); },
  up(x, y, id) { if (ptr && ptr.id === id) ptr = null; else ptr2 = false; },
  key(k, d) { const m = { ArrowUp: -Math.PI / 2, w: -Math.PI / 2, ArrowDown: Math.PI / 2, s: Math.PI / 2, ArrowLeft: Math.PI, a: Math.PI, ArrowRight: 0, d: 0 }; if (k in m) keyA = d ? m[k] : null; if (k === ' ') { dashK = d; if (d) dashTap = true; } },
  draw(g) {
    g.save(); cam.apply(g);
    AR.ground(g, 'sand', '#1f5f74', '#4a9aa0'); // unscaled tile blits (old: scaled sand pattern + full-screen additive caustics + light gradient every frame)
    if (Math.hypot(cam.x, cam.y) + Math.hypot(W, H) / cam.z > WR) { g.fillStyle = '#073652'; g.beginPath(); g.rect(cam.x - W / cam.z, cam.y - H / cam.z, W * 2 / cam.z, H * 2 / cam.z); g.arc(0, 0, WR, 0, 6.2832, true); g.fill(); }
    g.strokeStyle = 'rgba(0,30,60,.5)'; g.lineWidth = 60; g.beginPath(); g.arc(0, 0, WR + 30, 0, 7); g.stroke();
    const g0 = g.getTransform(), dm = (m, x, y, c, sn) => [m.a * c + m.c * sn, m.b * c + m.d * sn, m.a * -sn + m.c * c, m.b * -sn + m.d * c, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    const vx = W / 2 / cam.z + 150, vy = H / 2 / cam.z + 150, inV = (x, y) => Math.abs(x - cam.x) < vx && Math.abs(y - cam.y) < vy;
    for (const w of weeds) { if (!inV(w.x, w.y)) continue; if (w.coral) { for (let k = 0; k < 5; k++) { const a = -1.57 + (k - 2) * .4 + Math.sin(PK.t + w.x) * .05; g.strokeStyle = M.hsl(w.hue, 70, 55 + k * 4); g.lineWidth = 10 - k; g.lineCap = 'round'; g.beginPath(); g.moveTo(w.x, w.y); g.lineTo(w.x + Math.cos(a) * w.h * .6, w.y + Math.sin(a) * w.h * .6); g.stroke(); } } else { g.strokeStyle = '#2f8a4a'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(w.x, w.y); for (let k = 1; k <= 5; k++) g.lineTo(w.x + Math.sin(PK.t * 1.5 + k + w.y) * 10 * k / 5, w.y - w.h * k / 5); g.stroke(); } }
    for (const b of bugs) { if (!inV(b.x, b.y)) continue; const c = Math.cos(b.a), sn = Math.sin(b.a), sc = .9 + Math.sin(b.ph * 8) * .05; g.setTransform(...dm(g0, b.x, b.y, c * sc, sn * sc)); g.drawImage(tinySpr(b.k, b.hue), -24, -16); }
    for (const s of small) { if (!inV(s.x, s.y)) continue; const k = s.sz * (1 + Math.sin(PK.t * 12 + s.ph) * .06); g.setTransform(...dm(g0, s.x, s.y, Math.cos(s.a) * k, Math.sin(s.a) * k)); g.drawImage(tinySpr('fish', s.hue), -24, -16); }
    g.setTransform(g0); items.draw(g, 1);
    const list = fish.filter(f => f.alive || f.deadT < .2).sort((a, b) => a.mass - b.mass);
    for (const f of list) { if (!inV(f.x, f.y)) continue; drawFish(g, f); AR.drawBuffs(g, f, rad(f) * 1.2); if (f.shield > 0) { g.strokeStyle = 'rgba(200,255,255,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y, rad(f) * 1.8, 0, 7); g.stroke(); }
      const s = PK.S / cam.z; AR.tag(g, f.x, f.y - rad(f) * 1.3 - s * .8, `${f.me ? 'You' : f.name} · ${Math.floor(f.mass)}`, f.me ? '#fff4b0' : (f.mass > me.mass * 1.15 ? '#ffb0a0' : f.mass * 1.15 < me.mass ? '#b0ffc0' : '#fff'), s); }
    g.fillStyle = 'rgba(220,250,255,.5)'; for (const b of bubbles) { g.beginPath(); g.arc(b.x + Math.sin(b.y * .05) * 6, b.y, b.r, 0, 7); g.fill(); }
    g.restore();
  },
  hud(g) {
    const s = PK.S; if (cd < 3.6) AR.countdown(g, cd, 3);
    text(AR.fmt(MATCH - t), W / 2, s * 1.8, s * 1.4, { weight: 800, color: MATCH - t < 15 ? '#ff9a7a' : '#fff' });
    AR.board(g, fish.filter(f => f.alive).map(f => ({ name: f.me ? 'You' : f.name, score: f.mass, me: f.me, color: M.hsl(f.hue, 80, 60) })), { title: 'Heaviest fish', rows: W < H ? 4 : 6, w: Math.min(W * .44, s * 10) });
    AR.drawFeed(g, s * .5, s * 3.2, s, 1 / 60);
    { const b = dashBtn(), k = Math.max(0, me.cool) / 1.4; g.fillStyle = k > 0 ? 'rgba(20,40,70,.55)' : 'rgba(40,160,220,.75)'; g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill(); if (k > 0) { g.strokeStyle = '#9ff0ff'; g.lineWidth = 4; g.beginPath(); g.arc(b.x, b.y, b.r - 3, -1.57, -1.57 + (1 - k) * 6.283); g.stroke(); } text('DASH', b.x, b.y, s * .6, { weight: 900, color: k > 0 ? 'rgba(255,255,255,.6)' : '#fff' }); }
    AR.buffHud(g, me, s * .5, H - s * 4.8, s * .8);
    const tr = tierOf(me.mass), nx = TIER[tr + 1]; text(`${FORMS[tr]} · ${Math.floor(me.mass)} kg${nx ? ` · next form at ${nx}` : ''}`, W / 2, H - s * 1.5, s * .85, { color: '#dff8ff' });
  },
};
PK.run(G);
})();
