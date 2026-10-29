/* © 2026 Randomness. All rights reserved. Unauthorized copying or redistribution is prohibited. */
/* @libs arena */
// Plank Dash — 4 teams of 2. Scoop up planks in your team colour, lay a bridge step by step, climb three floors before the other teams. Bump smaller stacks to scatter them.
// Revision: 8 players (you + a bot buddy vs 3 bot teams), team bridges, AI that walks back down to restock / rebuild, bridge-entrance pathing + stuck recovery, items, cheap floor drawing.
(() => {
'use strict';
const { M, fx, sfx, text } = PK;
const FW = 960, FH = 680, BL = 420, STEPS = 16, SL = BL / STEPS, NF = 3, LANES = [150, 370, 590, 810], MATCH = 160, NT = 4, NP = 8;
const off = (f) => -f * (FH + BL);
const SK = [{ name: 'Sunny', cost: 0, hue: 45 }, { name: 'Mint', cost: 150, hue: 150 }, { name: 'Sky', cost: 300, hue: 200 }, { name: 'Grape', cost: 500, hue: 275 }, { name: 'Rose', cost: 800, hue: 330 }, { name: 'Coral', cost: 1200, hue: 12 }]; AR.moreSkins(SK, 16); /*pc1*/
const TEAMN = ['Rafters', 'Beams', 'Gables', 'Girders', 'Joists', 'Trusses'];
let W, H, cam, ps, me, buddy, planks, bridges, t, cd, ended, finished, extra, stick = null, keys = {}, loose, teams, items;
function newMatch(boost) { cam = AR.cam(); t = 0; cd = 0; ended = false; finished = []; extra = 0; AR.clearFeed(); loose = []; endT0 = MATCH;
  const mh = (SK[PK.skin()] || SK[0]).hue; const pal = [355, 210, 125, 45, 280, 175].filter(h => Math.abs(((h - mh + 540) % 360) - 180) > 50);
  teams = [{ hue: mh, name: 'Your team', me: true }]; for (let i = 0; i < 3; i++) teams.push({ hue: pal[i], name: 'Team ' + TEAMN[(i + PK.level()) % TEAMN.length] });
  ps = []; me = { name: 'You', me: true, skill: .7, react: .2, think: 0, mistake: 0, aggro: .5 }; ps.push(me);
  for (let i = 1; i < NP; i++) ps.push(AR.rival(PK.level() + (i === 1 ? 1 : 0))); buddy = ps[1]; buddy.buddy = true;
  ps.forEach((p, i) => { const tm = i >> 1; Object.assign(p, { i, tm, hue: teams[tm].hue + (i & 1 ? 8 : 0), x: LANES[tm] + (i & 1 ? 26 : -26), y: FH - 60, vx: 0, vy: 0, f: 0, stack: 0, done: false, stun: 0, dir: -1.57, lane: tm, bob: 0, buffs: {}, stuckT: 0, lastPos: [0, 0], wander: 0, wp: null, pat: i & 1 ? 2 : 0 }); });
  if (boost) me.stack = 10;
  bridges = []; for (let f = 0; f < NF; f++) bridges.push(LANES.map(() => new Array(STEPS).fill(-1)));
  planks = []; for (let f = 0; f < NF; f++) for (let c = 0; c < NT; c++) for (let k = 0; k < 17; k++) planks.push({ f, c, x: M.rand(60, FW - 60), y: off(f) + M.rand(90, FH - 50), a: M.rand(6.28), live: 1, rt: 0 });
  items = AR.items({ kinds: ['speed', 'shield', 'magnet', 'grow'], max: 5, every: 6, r: 22, spot: () => { const f = M.irand(0, NF - 1); return [M.rand(80, FW - 80), off(f) + M.rand(120, FH - 80)]; } }); }
function laneAt(x) { for (let l = 0; l < LANES.length; l++) if (Math.abs(x - LANES[l]) < 34) return l; return -1; }
function walk(p, nx, ny, demo) { // returns allowed position
  const f = p.f; if (ny > off(f) + FH - 18) ny = off(f) + FH - 18;
  if (f >= NF) { return [M.clamp(nx, 30, FW - 30), Math.max(ny, off(NF) + 260)]; }
  if (ny < off(f) + 10) { const l = laneAt(p.x); if (l < 0) return [M.clamp(nx, 20, FW - 20), off(f) + 10]; nx = M.clamp(nx, LANES[l] - 26, LANES[l] + 26);
    const top = off(f) - BL; if (ny <= top) { p.f++; if (p.f >= NF) { p.done = true; finished.push(p); if (!demo) { if (p.me) { sfx.tone({ f: 523, f2: 1046, d: .4, type: 'triangle', v: .2 }); } else AR.say(`${p.buddy ? 'Your buddy ' + p.name : p.name} reached the top (${AR.ord(finished.length)})`, p.buddy ? '#b8ffb0' : '#ffe9a0'); } } else if (p.me && !demo) { sfx.tone({ f: 660, f2: 990, d: .2, type: 'triangle', v: .16 }); fx.text(PK.W / 2, PK.H * .35, `Floor ${p.f + 1}!`, '#fff4b0', 1.6); } return [nx, ny]; }
    const si = Math.min(STEPS - 1, Math.floor((off(f) - ny) / SL)), br = bridges[f][l];
    const cur = M.clamp(Math.floor((off(f) - p.y) / SL), 0, STEPS - 1); for (let s = cur; s <= si; s++) if (br[s] !== p.tm) { if (p.stack > 0) { p.stack--; br[s] = p.tm; if (p.me && !demo) sfx.tone({ f: 300 + s * 30, d: .06, type: 'square', v: .06, lp: 1600 }); } else { return [nx, off(f) - s * SL + 4]; } }
    return [nx, ny]; }
  return [M.clamp(nx, 20, FW - 20), ny]; }
const onBridge = (p) => p.f < NF && p.y < off(p.f) + 5;
const stepIdx = (p) => M.clamp(Math.floor((off(p.f) - p.y) / SL), 0, STEPS - 1);
const missing = (f, l, tm, from = 0) => { let n = 0; for (let s = from; s < STEPS; s++) if (bridges[f][l][s] !== tm) n++; return n; };
function nearestPlank(p) { let best = null, bd = 1e9; const f = p.f; for (const k of planks) if (k.live && k.f === f && k.c === p.tm) { const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd) { bd = d; best = k; } } for (const k of loose) if (k.f === f) { const d = Math.hypot(k.x - p.x, k.y - p.y) * .8; if (d < bd) { bd = d; best = k; } } return best; }
// AI. Key fixes vs. the old bots: (1) on a bridge with nothing left to lay they turn round and walk back down; (2) they line up with the bridge entrance before climbing
// (no more grinding against the floor edge); (3) progress watchdog: no movement for 1.2 s while trying to move → short detour / lane switch.
function ai(p, dt) { if (p.done) return [0, 0]; const f = p.f; if (f >= NF) return [0, 0];
  if (p.wander > 0) { p.wander -= dt; const w = p.wp; const dx = w[0] - p.x, dy = w[1] - p.y, l = Math.hypot(dx, dy) || 1; return l < 10 ? [0, 0] : [dx / l, dy / l]; }
  if (!AR.tick(p, dt) && p.want) return p.want;
  const l = p.lane, lx = LANES[l], need = missing(f, l, p.tm), margin = Math.round((1 - p.skill) * -3 + p.skill * 2);
  let tx, ty;
  if (onBridge(p)) { const ahead = missing(f, l, p.tm, stepIdx(p));
    if (p.stack > 0 || ahead === 0) { tx = lx; ty = off(f) - BL - 30; }        // keep climbing
    else { tx = lx; ty = off(f) + 140; p.restock = true; } }                     // out of planks: go back down and restock
  else { if (p.y > off(f) + 100) p.restock = false;
    const ready = !p.restock && (p.stack >= need + margin || (AR.oops(p) && p.stack > need * .6) || (need === 0));
    if (ready) { if (Math.abs(p.x - lx) > 16) { tx = lx; ty = Math.max(p.y, off(f) + 60); } else { tx = lx; ty = off(f) - BL - 30; } }  // line up with the entrance, then go up
    else { const best = nearestPlank(p); if (best) { tx = best.x; ty = best.y; } else { tx = FW / 2 + M.rand(-200, 200); ty = off(f) + FH / 2; }
      if (p.restock && p.stack >= Math.min(need, 6) + 2) p.restock = false;
      if (p.aggro > .7) for (const o of ps) if (o.tm !== p.tm && o.f === f && !o.done && o.stack < p.stack - 3 && !AR.has(o, 'shield') && Math.hypot(o.x - p.x, o.y - p.y) < 160) { tx = o.x; ty = o.y; } } }
  if (!onBridge(p) && Math.random() < .03) { const bl = bridges[f].map((b, k) => b.filter(c => c === p.tm).length * 1.0 - b.filter(c => c >= 0 && c !== p.tm).length * .6 - ps.filter(o => o !== p && o.f === f && o.lane === k && onBridge(o) && o.tm !== p.tm).length * 3); p.lane = bl.indexOf(Math.max(...bl)); }
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1; return (p.want = d < 8 ? [0, 0] : [dx / d, dy / d]); }
function watchdog(p, dt, ax, ay) { if (p.me || p.done || p.stun > 0) return; p.stuckT += dt; if (p.stuckT < 1.2) return;
  const mv = Math.hypot(p.x - p.lastPos[0], p.y - p.lastPos[1]); p.lastPos = [p.x, p.y]; const trying = Math.hypot(ax, ay) > .3; p.stuckT = 0;
  if (mv < 14 && trying) { const f = p.f; if (onBridge(p)) { p.wp = [LANES[p.lane], off(f) + 150]; p.restock = true; } else { p.lane = (p.lane + M.irand(1, 3)) % 4; p.wp = [M.clamp(p.x + M.rand(-220, 220), 60, FW - 60), off(f) + M.rand(160, FH - 80)]; } p.wander = .9; p.want = null; } }
function scatter(lo, hi, nx, ny, demo) { for (let k = 0; k < lo.stack; k++) { const an = M.rand(6.28), r = M.rand(30, 110); loose.push({ f: lo.f, x: M.clamp(lo.x + Math.cos(an) * r, 30, FW - 30), y: M.clamp(lo.y + Math.sin(an) * r, off(lo.f) + 60, off(lo.f) + FH - 30), a: an, t: 0 }); }
  lo.stack = 0; lo.stun = 1; lo.vx = nx * 400; lo.vy = ny * 400; lo.restock = true;
  if (!demo && (lo.tm === 0 || hi.tm === 0)) { const [sx, sy] = cam.toScreen(lo.x, lo.y); fx.burst(sx, sy, { n: 16, color: M.hsl(lo.hue, 70, 60), speed: 220 }); fx.shake(lo.me ? 10 : 4); sfx.noise({ d: .2, v: .2, lp: 900 }); if (lo.me) fx.text(sx, sy - 30, 'Scattered!', '#ff8a8a'); else if (lo.tm === 0) AR.say(`${lo.name} (your buddy) got scattered`, '#ffc0c0'); else { fx.text(sx, sy - 30, 'Bump!', '#fff4b0'); if (hi.me) AR.say(`You scattered ${lo.name}'s planks`, '#c8ffb0'); } } }
function step(dt, demo) { t += dt;
  for (const p of ps) { let ax = 0, ay = 0; if (p.me && !demo) { if (stick && stick.on) { ax = stick.dx; ay = stick.dy; } ax += (keys.r ? 1 : 0) - (keys.l ? 1 : 0); ay += (keys.d ? 1 : 0) - (keys.u ? 1 : 0); const l = Math.hypot(ax, ay); if (l > 1) { ax /= l; ay /= l; } } else { [ax, ay] = ai(p, dt); watchdog(p, dt, ax, ay); }
    AR.tickBuffs(p, dt); if (p.done) { ax = 0; ay = 0; } if (p.stun > 0) { p.stun -= dt; ax *= .2; ay *= .2; }
    const sp = (p.me ? 260 + PK.up('legs') * 12 : 228 + p.skill * 40) * (1 - Math.min(p.stack, 30) * .006) * (AR.has(p, 'speed') ? 1.4 : 1); p.vx = M.approach(p.vx, ax * sp, 10, dt); p.vy = M.approach(p.vy, ay * sp, 10, dt);
    const [nx, ny] = walk(p, p.x + p.vx * dt, p.y + p.vy * dt, demo); if (ny !== p.y + p.vy * dt) p.vy = 0; p.x = nx; p.y = ny; if (Math.hypot(p.vx, p.vy) > 20) { p.dir = Math.atan2(p.vy, p.vx); p.bob += dt * 14; }
    if (p.f < NF && p.y > off(p.f) + 5) { const cap = p.me ? 24 + PK.up('arms') * 4 : 26, pr = AR.has(p, 'magnet') ? 120 : 30;
      for (const k of planks) if (k.live && k.f === p.f && k.c === p.tm && p.stack < cap && Math.abs(k.y - p.y) < pr && Math.hypot(k.x - p.x, k.y - p.y) < pr) { k.live = 0; k.rt = 4; p.stack++; if (p.me && !demo) { sfx.tone({ f: 500 + p.stack * 12, d: .05, type: 'triangle', v: .08 }); } }
      for (let j = loose.length - 1; j >= 0; j--) { const k = loose[j]; if (k.f === p.f && k.t > .5 && p.stack < cap && Math.hypot(k.x - p.x, k.y - p.y) < pr) { loose.splice(j, 1); p.stack++; } } } }
  if (!demo) items.update(dt, ps.map(p => Object.assign(p, { r: 20 })), (p, k) => { if (k === 'grow') p.stack += 5; else AR.buff(p, k, 6); if (p.me) { sfx.chime(); const [sx, sy] = cam.toScreen(p.x, p.y); fx.text(sx, sy - 40, { speed: 'Fast feet!', shield: 'Unbumpable!', magnet: 'Plank magnet!', grow: '+5 planks!' }[k], '#fff4b0'); } });
  for (let i = 0; i < NP; i++) for (let j = i + 1; j < NP; j++) { const a = ps[i], b = ps[j]; if (a.f !== b.f || a.done || b.done || onBridge(a) || onBridge(b)) continue; const dx = b.x - a.x, dy = b.y - a.y; if (Math.abs(dx) > 34 || Math.abs(dy) > 34) continue; const l = Math.hypot(dx, dy); if (l < 34 && l) { const nx = dx / l, ny = dy / l;
      if (a.tm !== b.tm && Math.abs(a.stack - b.stack) >= 2 && Math.min(a.stack, b.stack) > 0 && a.stun <= 0 && b.stun <= 0) { const lo = a.stack < b.stack ? a : b, hi = lo === a ? b : a; if (!AR.has(lo, 'shield')) { scatter(lo, hi, lo === a ? -nx : nx, lo === a ? -ny : ny, demo); continue; } }
      const push = (34 - l) / 2; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; } }
  for (const k of planks) if (!k.live) { k.rt -= dt; if (k.rt <= 0) k.live = 1; } for (const k of loose) k.t = (k.t || 0) + dt;
  if (demo) { cam.fit(1150); const lead = ps.reduce((a, b) => b.y < a.y ? b : a); cam.follow(FW / 2, lead.y, dt, 2); } else { cam.fit(860); cam.follow(M.clamp(me.x, 200, FW - 200), Math.min(me.y - 60, FH + 60 - PK.H / 2 / cam.z), dt, 5); } }
function plankD(g, x, y, a, hue, s = 1) { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = M.hsl(hue, 70, 32); g.fillRect(-15 * s, -5 * s + 2, 30 * s, 10 * s); g.fillStyle = M.hsl(hue, 75, 55); g.fillRect(-15 * s, -5 * s, 30 * s, 9 * s); g.fillStyle = M.hsl(hue, 80, 72); g.fillRect(-13 * s, -4 * s, 26 * s, 2 * s); g.restore(); }
function personD(g, p) { const r = 20, b = Math.sin(p.bob) * 2.5; AR.shadow(g, p.x, p.y + r * .7, r * .9, r * .35, .3);
  for (let k = 0; k < Math.min(p.stack, 30); k++) { const sy = p.y - r * .2 - k * 4.2 + b, sx = p.x - Math.cos(p.dir) * r * .7; g.fillStyle = M.hsl(p.hue, 70, k % 2 ? 48 : 56); g.fillRect(sx - 12, sy - 3, 24, 4); g.fillStyle = M.hsl(p.hue, 70, 30); g.fillRect(sx - 12, sy + 1, 24, 1); }
  g.save(); if (p.stun > 0) g.globalAlpha = .5 + .5 * Math.sin(PK.t * 30); AR.critter(g, p.x, p.y - r * .3 + b, r, p.hue, { shadow: false, dir: p.dir, pat: p.pat, seed: p.i, mood: p.stun > 0 ? 'sad' : '' }); g.restore();
  if (p.tm === 0) { g.fillStyle = p.me ? '#fff4b0' : '#b8ffb0'; g.beginPath(); const yy = p.y - r * 1.55 + b; g.moveTo(p.x - 7, yy - 9); g.lineTo(p.x + 7, yy - 9); g.lineTo(p.x, yy); g.fill(); }
  AR.drawBuffs(g, p, r);
  if (p.stack > 0) AR.tag(g, p.x, p.y - r * 1.9 - Math.min(p.stack, 30) * 4.2 - (p.tm === 0 ? 10 : 0), String(p.stack), p.me ? '#fff4b0' : '#fff', PK.S * .8 / cam.z); }
function floorD(g, f) { // cheap wooden deck: flat boards + seams (no scaled pattern fill)
  const y0 = off(f), h = f < NF ? FH : 300; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(14, y0 + 18, FW, h); g.fillStyle = M.hsl(30, 40, 22); g.fillRect(0, y0 + h, FW, 18);
  if (f < NF) { g.fillStyle = '#b8844a'; g.fillRect(0, y0, FW, h); for (let i = 0, yy = y0; yy < y0 + h; i++, yy += 40) { g.fillStyle = i % 2 ? '#c28f55' : '#ad7a42'; g.fillRect(0, yy, FW, 38); g.fillStyle = 'rgba(70,40,15,.35)'; g.fillRect(0, yy + 38, FW, 2); for (let x = (i * 137) % 240; x < FW; x += 240) g.fillRect(x, yy, 2, 38); } }
  else { g.fillStyle = '#e6d6a8'; g.fillRect(0, y0, FW, h); g.fillStyle = 'rgba(120,100,60,.25)'; for (let x = 0; x < FW; x += 64) g.fillRect(x, y0, 2, h); for (let yy = y0; yy < y0 + h; yy += 64) g.fillRect(0, yy, FW, 2); }
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.strokeRect(2, y0 + 2, FW - 4, h - 4);
  if (f === NF) { for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#fff' : '#222'; g.fillRect(i * FW / 12, y0 + h - 30, FW / 12, 15); } text('FINISH', FW / 2, y0 + 120, 70, { weight: 900, color: '#ffe08a' }); }
  else text(`FLOOR ${f + 1}`, FW / 2, y0 + FH - 30, 34, { weight: 900, color: 'rgba(60,30,10,.35)', shadow: false }); }
function teamScore(tm) { const m = ps.filter(p => p.tm === tm); if (m.some(p => p.done)) return 100 - finished.findIndex(p => p.tm === tm); return Math.max(...m.map(p => p.f * 20 + Math.max(0, Math.round((off(p.f) - Math.min(p.y, off(p.f))) / BL * 19)))); }
const G = {
  title: 'Plank Dash', tagline: 'Team up. Stack. Bridge. Climb.', accent: '#ffd36a', bg0: '#2a7ab8', bg1: '#0a1a3a', unit: '',
  howto: ['4 teams of 2 — you + your buddy (green ▼)', 'Grab planks in YOUR colour · walk up a bridge to lay steps', 'Bump a smaller rival stack to scatter it · first team to the top wins'],
  music: { root: 294, scale: [0, 2, 4, 7, 9, 12], bpm: 128, voice: 'pluck', density: .55 },
  levelWord: 'League race', nextLabel: 'Next race', reviveLabel: 'Second chance', boostLabel: 'start with 10 planks',
  meta: { currency: '🪵', daily: 40, rewardId: 'plank-2x', reviveId: 'plank-retry', boostId: 'plank-boost',
    upgrades: [{ id: 'legs', name: 'Fast Feet', desc: 'run faster', cost: 90, max: 5 }, { id: 'arms', name: 'Big Arms', desc: 'carry +4 planks', cost: 110, max: 5 }],
    skins: SK, skinIcon(g, x, y, r, i) { AR.critter(g, x, y, r * .7, SK[i].hue, { shadow: false }); } },
  titleExtra: () => AR.league(PK.level()),
  qaPos: () => me ? [me.x, me.y] : [0, 0], qaIdle: () => !stick && !Object.values(keys).some(Boolean),
  qaBots: () => ps.map(p => ({ f: p.f, x: Math.round(p.x), y: Math.round(p.y), stack: p.stack, done: p.done, me: !!p.me })),
  init(w, h) { W = w; H = h; newMatch(false); }, resize(w, h) { W = w; H = h; },
  start(b) { newMatch(b); }, nextLevel(l, b) { newMatch(b); },
  canRevive: () => ended && !extra && !me.done && finished.length > 0 && finished[0].tm !== 0,
  revive() { extra = 1; ended = false; endT0 += 25; me.stack += 15; const tm = finished[0] && finished[0].tm;
    for (const w of ps.filter(p => p.tm === tm && p.done)) { w.done = false; w.f = NF - 1; w.x = LANES[w.lane]; w.y = off(NF - 1) + FH - 60; w.stack = 0; w.stun = 2.5; }
    finished = finished.filter(p => p.tm !== tm); AR.say(`Second chance: ${teams[tm] ? teams[tm].name : 'leaders'} sent back a floor, +15 planks!`, '#ffe08a'); },
  cancel() { stick = null; for (const k in keys) keys[k] = false; },
  idle(dt) { step(dt, true); if (finished.length || t > 90) newMatch(false); },
  update(dt) { cd += dt; if (cd < 3) { cam.fit(860); cam.follow(me.x, me.y - 60, dt); return; } step(dt, false); if (ended) return;
    if (finished.length || t > endT0) { ended = true; const order = [0, 1, 2, 3].sort((a, b) => teamScore(b) - teamScore(a)), p = order.indexOf(0) + 1, coins = AR.placeCoins(p, 4, 14 + PK.level() * 2) + me.f * 8;
      if (p === 1) PK.levelClear({ stars: t < 80 ? 3 : 2, msg: me.done ? 'Top of the tower!' : `${buddy.name} topped it for your team!`, sub: `${AR.fmt(t)} · ${AR.league(PK.level() + 1)}`, coins, score: Math.round(1000 - t * 4) });
      else PK.gameOver(me.f, `${finished[0] ? teams[finished[0].tm].name + ' climbed first' : 'Time up'} · your team ${AR.ord(p)}`, coins); } },
  down(x, y, id) { if (stick && stick.id !== undefined && !PK.pointers.has(stick.id)) stick = null; stick = { id, x0: x, y0: y, dx: 0, dy: 0, on: true }; },
  move(x, y, id) { if (!stick || stick.id !== id) return; const dx = x - stick.x0, dy = y - stick.y0, l = Math.hypot(dx, dy), m = PK.S * 3; stick.dx = l > 6 ? dx / Math.max(l, m) : 0; stick.dy = l > 6 ? dy / Math.max(l, m) : 0; if (l > m) { stick.x0 = x - dx / l * m; stick.y0 = y - dy / l * m; } },
  up(x, y, id) { if (stick && stick.id === id) stick = null; },
  key(k, d) { const m = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd' }; if (m[k]) keys[m[k]] = d; },
  draw(g) { g.save(); g.translate(-(PK.t * 12 % 256), 0); AR.ground(g, 'water', '#1a5a9a', '#3a9ad8'); g.restore(); g.save(); cam.apply(g);
    const vy0 = cam.y - H / 2 / cam.z - 40, vy1 = cam.y + H / 2 / cam.z + 40;
    for (let f = 0; f <= NF; f++) { const y0 = off(f), h = f < NF ? FH : 300; if (y0 > vy1 || y0 + h + 20 < vy0) continue; floorD(g, f); }
    for (let f = 0; f < NF; f++) { const y0 = off(f); if (y0 - BL > vy1 || y0 < vy0) continue; LANES.forEach((lx, l) => { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(lx - 28 + 10, y0 - BL + 10, 56, BL); g.fillStyle = 'rgba(60,40,20,.55)'; g.fillRect(lx - 28, y0 - BL, 56, BL); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.strokeRect(lx - 28, y0 - BL, 56, BL);
      for (let s = 0; s < STEPS; s++) { const c = bridges[f][l][s], sy = y0 - (s + 1) * SL; if (c >= 0) { g.fillStyle = M.hsl(teams[c].hue, 70, 34); g.fillRect(lx - 28, sy + 2, 56, SL - 1); g.fillStyle = M.hsl(teams[c].hue, 75, s % 2 ? 52 : 58); g.fillRect(lx - 28, sy, 56, SL - 3); } }
      g.fillStyle = '#6a4a2a'; g.fillRect(lx - 32, y0 - BL, 5, BL); g.fillRect(lx + 27, y0 - BL, 5, BL); }); }
    for (const k of planks) if (k.live && k.y > vy0 && k.y < vy1) plankD(g, k.x, k.y, k.a, teams[k.c].hue, k.c === 0 ? 1.1 : .9); for (const k of loose) plankD(g, k.x, k.y, k.a, 30, .8);
    items.draw(g, 1);
    ps.filter(p => p.y > vy0 - 200 && p.y < vy1 + 60).sort((a, b) => a.y - b.y).forEach(p => personD(g, p)); g.restore();
    if (stick && stick.on) { g.save(); g.globalAlpha = .35; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(stick.x0, stick.y0, PK.S * 3, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(stick.x0 + stick.dx * PK.S * 3, stick.y0 + stick.dy * PK.S * 3, PK.S * 1.2, 0, 7); g.fill(); g.restore(); } },
  hud(g) { const s = PK.S; if (cd < 3.6) AR.countdown(g, cd, 3); text(AR.fmt(endT0 - t), W / 2, s * 1.8, s * 1.3, { weight: 800 }); text(me.done ? 'At the top!' : `Floor ${me.f + 1}/${NF} · ${me.stack} planks · buddy F${buddy.f + 1}`, W / 2, s * 3.1, s * .72, { color: '#fff7d0' });
    AR.board(g, teams.map((tmo, i) => ({ name: tmo.name, score: teamScore(i), me: !!tmo.me, color: M.hsl(tmo.hue, 70, 55) })), { title: 'Teams', rows: 4, w: Math.min(W * .44, s * 10), fmt: v => v >= 97 ? '🏁' : 'F' + (Math.floor(v / 20) + 1) });
    AR.buffHud(g, me, s * .5, H - s * 3.6, s * .8); AR.drawFeed(g, s * .5, s * 4, s, 1 / 60); },
};
let endT0 = MATCH;
PK.run(G);
})();
