/* @libs arena */
// Puck Rivals — neon air hockey. First to 5 goals. Face a rival, or share the screen with a friend.
// Revision: table sized to the screen, baked table layer (no per-frame glow), one-use goal shield (110), Side Slow perk, table items, AI stall fix + air jets.
(() => {
'use strict';
const { M, fx, sfx, text } = PK;
const TW = 1, GW = .34, PR = .045, MR = .075, GOALS = 5, SHIELD_COST = 110;
let TH = 1.8;
const SK = [{ name: 'Neon Mint', cost: 0, hue: 160 }, { name: 'Hot Pink', cost: 150, hue: 325 }, { name: 'Volt', cost: 300, hue: 70 }, { name: 'Ultramarine', cost: 500, hue: 230 }, { name: 'Sunset', cost: 800, hue: 20 }, { name: 'Prism', cost: 1200, hue: 280 }]; AR.moreSkins(SK, 16); /*pc1*/
let W, H, puck, ma, mb, sc, rv, two, cd, ended, serveT, trail, ptrA = null, ptrB = null, keys = {}, flash = 0, shield = 0, shieldBought = false, items = [], itemT = 0, jetT = 0, jetP = null, lastKey = '';
const land = () => W > H;
function fitTable() { const L = land(), long = L ? W : H, short = L ? H : W; TH = M.clamp((long * .9) / (short * .96), 1.5, 2.05); }
function view() { const L = land(), sw = L ? TH : TW, sh = L ? TW : TH, k = Math.min(W / (sw + .05), H / (sh + .1)); return { k, L }; }
function toS(x, y) { const { k, L } = view(); return L ? [W / 2 + (y - TH / 2) * k, H / 2 - (x - TW / 2) * k] : [W / 2 + (x - TW / 2) * k, H / 2 + (y - TH / 2) * k]; }
function toT(sx, sy) { const { k, L } = view(); return L ? [TW / 2 - (sy - H / 2) / k, TH / 2 + (sx - W / 2) / k] : [TW / 2 + (sx - W / 2) / k, TH / 2 + (sy - H / 2) / k]; }
function serve(toward) { puck = { x: TW / 2, y: TH / 2 + (toward ? .25 : -.25), vx: 0, vy: 0, last: null }; serveT = .6; jetT = 0; jetP = [puck.x, puck.y]; }
function newMatch(boost) { two = PK.mode() === 1; fitTable(); sc = [boost && !two ? 1 : 0, 0]; cd = 0; ended = false; trail = []; AR.clearFeed(); shield = 0; shieldBought = false; items = []; itemT = 0;
  ma = { x: TW / 2, y: TH - .2, vx: 0, vy: 0, tx: TW / 2, ty: TH - .2, hue: (SK[PK.skin()] || SK[0]).hue, buffs: {}, power: 0 };
  rv = AR.rival(PK.level()); rv.stall = 0; if (Math.abs(AR.wrapA((rv.hue - ma.hue) / 57.3)) < 1.2) rv.hue = (ma.hue + 170) % 360; if (two) { rv.name = 'Top player'; rv.hue = 20; } mb = { x: TW / 2, y: .2, vx: 0, vy: 0, tx: TW / 2, ty: .2, hue: rv.hue, buffs: {}, power: 0 };
  if (!two) AR.say(`${rv.name} steps up to the table`, '#ffd9a0'); serve(Math.random() < .5); }
const mr = (m) => MR * (AR.has(m, 'grow') ? 1.35 : 1);
function moveMallet(m, tx, ty, top, dt, maxSp) { const r = mr(m); if (AR.has(m, 'slow')) maxSp *= .55;
  tx = M.clamp(tx, r, TW - r); ty = top ? M.clamp(ty, r, TH / 2 - r) : M.clamp(ty, TH / 2 + r, TH - r);
  let dx = tx - m.x, dy = ty - m.y; const d = Math.hypot(dx, dy), mx = maxSp * dt; if (d > mx) { dx *= mx / d; dy *= mx / d; }
  m.vx = dx / dt; m.vy = dy / dt; m.x += dx; m.y += dy; }
// AI: normal play + stall breaker. When the puck sits still on its side it gets *behind* the puck (relative to the far goal) and strikes;
// in a corner where it can't get behind, it sweeps the puck out from the inner side.
function ai(dt) { const p = puck, sp = Math.hypot(p.vx, p.vy), mine = p.y < TH / 2, r = mr(mb);
  if (mine && sp < .5) rv.stall += dt; else rv.stall = Math.max(0, rv.stall - dt * 2);
  if (rv.back > 0) { rv.back -= dt; rv.tgt = { x: TW / 2 + (p.x < TW / 2 ? .12 : -.12), y: .14 }; }
  else if (mine && rv.stall > .6 && p.y < PR + r + .03) { // puck pinned against the top rail / corner: come from below, strike up into the rail so it rebounds out, then retreat
    const side = p.x < TW / 2 ? 1 : -1, bx = p.x + side * .035, by = p.y + PR + r + .06, near = Math.hypot(mb.x - bx, mb.y - by) < .03;
    if (near && !(rv.hit > 0)) rv.hit = .22; if (rv.hit > 0) { rv.hit -= dt; rv.tgt = { x: p.x - side * .03, y: p.y - .1 }; if (rv.hit <= 0) { rv.back = .6; rv.stall = 0; } } else rv.tgt = { x: bx, y: by }; }
  else if (mine && rv.stall > .6) { const gx = TW / 2 + M.clamp((TW / 2 - p.x) * .2, -.08, .08), gy = TH; let dx = gx - p.x, dy = gy - p.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    let bx = p.x - dx * (PR + r + .03), by = p.y - dy * (PR + r + .03);
    if (by < r + .004 || bx < r || bx > TW - r) { const side = p.x < TW / 2 ? 1 : -1; bx = p.x + side * (PR + r + .04); by = Math.max(r, p.y - .01); dx = -side; dy = .35; }
    const near = Math.hypot(mb.x - bx, mb.y - by) < .035;
    if (near && !(rv.hit > 0)) rv.hit = .3; if (rv.hit > 0) { rv.hit -= dt; rv.tgt = { x: p.x + dx * .25, y: p.y + dy * .25 }; if (rv.hit <= 0) { rv.back = .45; rv.stall = 0; } } else rv.tgt = { x: bx, y: by }; }
  else if (AR.tick(rv, dt)) { rv.hit = 0; const home = { x: TW / 2, y: .16 };
    if (mine && (p.vy < .3 || p.y < .5)) { const lead = .06 + rv.skill * .05; rv.tgt = { x: p.x + p.vx * lead + (AR.oops(rv) ? M.rand(-.2, .2) : 0), y: p.y - .06 }; if (rv.tgt.y < r + .01) rv.tgt.x = p.x + (p.x < TW / 2 ? 1 : -1) * (PR + r); }
    else { const k = M.clamp((p.x - TW / 2) * .5, -.15, .15); rv.tgt = { x: home.x + k, y: home.y + (rv.skill > .6 ? .05 : 0) }; } }
  const t = rv.tgt || { x: TW / 2, y: .16 }; moveMallet(mb, t.x, t.y, true, dt, 1.4 + rv.skill * 1.6 + PK.level() * .05 + (rv.stall > .6 ? .8 : 0)); }
function clampPuck() { const inGoal = Math.abs(puck.x - TW / 2) < GW / 2; let cx = M.clamp(puck.x, PR, TW - PR), cy = inGoal ? puck.y : M.clamp(puck.y, PR, TH - PR);
  if (cx !== puck.x || cy !== puck.y) { puck.x = cx; puck.y = cy; for (const m of [ma, mb]) { const r = mr(m), dx = m.x - puck.x, dy = m.y - puck.y, d = Math.hypot(dx, dy) || 1; if (d < PR + r) { m.x = puck.x + dx / d * (PR + r); m.y = puck.y + dy / d * (PR + r); } } } }
function hitM(m) { const r = mr(m), dx = puck.x - m.x, dy = puck.y - m.y, d = Math.hypot(dx, dy); if (d >= PR + r || !d) return; const nx = dx / d, ny = dy / d; puck.x = m.x + nx * (PR + r); puck.y = m.y + ny * (PR + r);
  const rv2 = (puck.vx - m.vx) * nx + (puck.vy - m.vy) * ny; if (rv2 < 0) { const pw = m.power > 0 ? 1.4 : 1; puck.vx -= 1.9 * rv2 * nx * pw; puck.vy -= 1.9 * rv2 * ny * pw; if (m.power > 0 && -rv2 > .6) { m.power--; { const [x, y] = toS(puck.x, puck.y); fx.burst(x, y, { n: 12, color: '#ffe680', speed: 260 }); } } }
  const sp = Math.hypot(puck.vx, puck.vy), mx = m.power > 0 ? 6.5 : 5.5; if (sp > mx) { puck.vx *= mx / sp; puck.vy *= mx / sp; } puck.last = m;
  if (-rv2 > .05) { sfx.tone({ f: 900 + sp * 80, f2: 400, d: .08, type: 'square', v: Math.min(.14, .04 + sp * .02), lp: 3000 }); const [x, y] = toS(puck.x, puck.y); fx.burst(x, y, { n: 4 + sp * 1.5, color: M.hsl(m.hue, 100, 70), speed: 160 + sp * 30 }); if (sp > 3) fx.shake(sp * .7); } }
const ITEMK = ['speed', 'grow', 'slow'], INAME = { speed: 'Power shot', grow: 'Big mallet', slow: 'Freeze rival' };
function pickItem(m, k) { const foe = m === ma ? mb : ma; if (k === 'speed') m.power = 3; else if (k === 'grow') AR.buff(m, 'grow', 8); else AR.buff(foe, 'slow', 5);
  sfx.chime(); AR.say(`${m === ma ? (two ? 'Bottom' : 'You') : rv.name}: ${INAME[k]}!`, m === ma ? '#b0ffd8' : '#ffd0a0'); }
function buyShield() { if (two || shieldBought || ended || PK.state !== 'play') return; if (PK.coins() < SHIELD_COST) { PK.toast(`Need ${SHIELD_COST} ⬢ for a goal shield`); sfx.tone({ f: 200, d: .12, type: 'square', v: .06 }); return; }
  PK.addCoins(-SHIELD_COST); PK.save(); shield = 1; shieldBought = true; sfx.tone({ f: 520, f2: 1040, d: .25, type: 'triangle', v: .12 }); AR.say('Goal shield up — blocks one goal', '#a0e8ff'); }
function shieldBtn() { const s = PK.S, [gx, gy] = toS(TW * .14, TH - .1); return { x: gx - s * 2.1, y: gy - s * .9, w: s * 4.2, h: s * 1.8 }; }
function step(dt, demo) {
  if (serveT > 0) serveT -= dt; AR.tickBuffs(ma, dt); AR.tickBuffs(mb, dt);
  if (demo) { moveMallet(ma, puck.x + Math.sin(PK.t) * .03, puck.y > TH / 2 ? puck.y + .05 : TH - .2, false, dt, 2.2); ai(dt); }
  else { if (ptrA) { const [tx, ty] = toT(ptrA.x, ptrA.y); ma.tx = tx; ma.ty = ty - (ptrA.touch ? .05 : 0); } const kx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), ky = (keys.d ? 1 : 0) - (keys.u ? 1 : 0); if (kx || ky) { ma.tx = ma.x + kx * .2; ma.ty = ma.y + ky * .2; } moveMallet(ma, ma.tx, ma.ty, false, dt, 4 + PK.up('reach') * .3);
    if (two) { if (ptrB) { const [tx, ty] = toT(ptrB.x, ptrB.y); mb.tx = tx; mb.ty = ty; } moveMallet(mb, mb.tx, mb.ty, true, dt, 4); } else ai(dt); }
  if (!demo) { itemT += dt; if (itemT > 8 && items.length < 2) { itemT = 0; items.push({ x: M.rand(.18, TW - .18), y: TH / 2 + M.rand(-.3, .3), k: M.pick(ITEMK), t: 0 }); } }
  if (serveT > 0) return;
  const slowLv = two ? 0 : PK.up('sideslow');
  const sub = 4; for (let i = 0; i < sub; i++) { const h = dt / sub; puck.x += puck.vx * h; puck.y += puck.vy * h;
    let rail = false; if (puck.x < PR) { puck.x = PR; puck.vx = Math.abs(puck.vx) * .92; rail = true; } if (puck.x > TW - PR) { puck.x = TW - PR; puck.vx = -Math.abs(puck.vx) * .92; rail = true; }
    if (rail) { sfx.tone({ f: 500, d: .05, type: 'triangle', v: .06 }); if (slowLv) { const f = 1 - .01 * slowLv; puck.vx *= f; puck.vy *= f; } } // Side Slow perk: -1%/level on every side-rail touch
    const inGoal = Math.abs(puck.x - TW / 2) < GW / 2;
    if (puck.y < PR && !inGoal) { puck.y = PR; puck.vy = Math.abs(puck.vy) * .92; } if (puck.y > TH - PR && !inGoal) { puck.y = TH - PR; puck.vy = -Math.abs(puck.vy) * .92; }
    if (shield && inGoal && puck.y > TH - PR - .02 && puck.vy > 0) { shield = 0; puck.y = TH - PR - .02; puck.vy = -Math.abs(puck.vy) * .8; const [x, y] = toS(puck.x, puck.y); fx.burst(x, y, { n: 26, color: '#a0e8ff', speed: 300 }); fx.shake(6); sfx.tone({ f: 1200, f2: 300, d: .3, type: 'sawtooth', v: .1, lp: 2500 }); AR.say('Shield blocked the goal!', '#a0e8ff'); }
    if (puck.y < -PR || puck.y > TH + PR) { const meScored = puck.y < 0; if (!demo) { sc[meScored ? 0 : 1]++; flash = 1; fx.shake(12); meScored ? sfx.win() : sfx.fail(); AR.say(meScored ? (two ? 'Bottom scores!' : 'GOAL! You score') : `${rv.name} scores`, meScored ? '#fff1a0' : '#ffc0c0'); } serve(meScored); return; }
    hitM(ma); hitM(mb); clampPuck(); }
  for (let i = items.length - 1; i >= 0; i--) { const q = items[i]; q.t += dt; if (Math.hypot(q.x - puck.x, q.y - puck.y) < PR + .04 && puck.last) { items.splice(i, 1); pickItem(puck.last, q.k); } }
  // air jets: if the puck hasn't really moved for 2.5 s (pinned in a corner / dead stop) the table puffs it toward the centre
  jetT += dt; if (jetT > .5) { const mv = Math.hypot(puck.x - jetP[0], puck.y - jetP[1]); if (mv > .05) { jetP = [puck.x, puck.y]; puck.still = 0; } else puck.still = (puck.still || 0) + jetT; jetT = 0;
    if (puck.still > 2.5) { puck.still = 0; puck.vx += (TW / 2 - puck.x) * 2.2; puck.vy += (TH / 2 - puck.y) * 1.1 + (puck.y < TH / 2 ? .3 : -.3); const [x, y] = toS(puck.x, puck.y); fx.burst(x, y, { n: 14, color: '#bfe8ff', speed: 200 }); if (!demo) AR.say('Air jet!', '#bfe8ff'); rv.back = .8; } }
  const f = Math.exp(-.25 * dt); puck.vx *= f; puck.vy *= f; trail.push([puck.x, puck.y]); if (trail.length > 10) trail.shift(); flash = Math.max(0, flash - dt * 1.5);
}
// cached sprites: mallets and puck are pre-rendered once (gloss + neon rim baked in), then stamped
function malletSpr(hue) { return AR.bake('mal' + hue, 128, 128, (g) => { const x = 64, y = 64, r = 46; g.shadowColor = M.hsl(hue, 100, 60); g.shadowBlur = 16; g.fillStyle = M.hsl(hue, 80, 30); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.shadowBlur = 0;
  const gr = g.createRadialGradient(x - r * .3, y - r * .3, 2, x, y, r); gr.addColorStop(0, M.hsl(hue, 90, 80)); gr.addColorStop(.7, M.hsl(hue, 85, 50)); gr.addColorStop(1, M.hsl(hue, 80, 25)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = M.hsl(hue, 70, 35); g.beginPath(); g.arc(x, y, r * .5, 0, 7); g.fill(); g.fillStyle = M.hsl(hue, 90, 75); g.beginPath(); g.arc(x - r * .1, y - r * .1, r * .38, 0, 7); g.fill();
  g.strokeStyle = M.hsl(hue, 100, 75); g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(x - r * .35, y - r * .45, r * .25, r * .12, -.6, 0, 7); g.fill(); }); }
const puckSpr = () => AR.bake('puck', 96, 96, (g) => { const gl = g.createRadialGradient(48, 48, 6, 48, 48, 48); gl.addColorStop(0, 'rgba(255,240,200,.6)'); gl.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gl; g.fillRect(0, 0, 96, 96);
  const pg = g.createRadialGradient(42, 42, 1, 48, 48, 16); pg.addColorStop(0, '#fff'); pg.addColorStop(1, '#c9b48a'); g.fillStyle = pg; g.beginPath(); g.arc(48, 48, 16, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,90,40,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(48, 48, 11, 0, 7); g.stroke(); });
function mallet(g, m, k) { const [x, y] = toS(m.x, m.y), r = mr(m) * k; AR.shadow(g, x + r * .15, y + r * .25, r * 1.05, r * .9, .35); g.drawImage(malletSpr(m.hue), x - r * 1.39, y - r * 1.39, r * 2.78, r * 2.78);
  if (AR.has(m, 'slow')) { g.strokeStyle = 'rgba(170,220,255,.8)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r * 1.15, 0, 7); g.stroke(); } if (m.power > 0) { g.strokeStyle = '#ffe680'; g.lineWidth = 2; g.setLineDash([5, 5]); g.beginPath(); g.arc(x, y, r * 1.25, PK.t * 3, PK.t * 3 + 6.3); g.stroke(); g.setLineDash([]); } }
function drawTable(g) { // baked once per size/colours — the old version re-blurred 40px shadows + neon every frame
  const { k } = view(), [x0, y0] = toS(0, 0), [x1, y1] = toS(TW, TH), lx = Math.min(x0, x1), ly = Math.min(y0, y1), lw = Math.abs(x1 - x0), lh = Math.abs(y1 - y0);
  g.fillStyle = AR.tex(g, 'stone', '#0c0c22', '#1a1a3a'); g.fillRect(0, 0, W, H);
  g.save(); g.shadowColor = '#000'; g.shadowBlur = 30; PK.rrect(g, lx - k * .035, ly - k * .035, lw + k * .07, lh + k * .07, k * .06); g.fillStyle = '#2a2a48'; g.fill(); g.restore();
  g.strokeStyle = 'rgba(160,170,255,.35)'; g.lineWidth = 2; PK.rrect(g, lx - k * .035, ly - k * .035, lw + k * .07, lh + k * .07, k * .06); g.stroke();
  const tb = g.createLinearGradient(lx, ly, lx + lw, ly + lh); tb.addColorStop(0, '#1b2a5a'); tb.addColorStop(1, '#0e1636'); g.fillStyle = tb; PK.rrect(g, lx, ly, lw, lh, k * .05); g.fill();
  g.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 1; i < 14; i++) for (let j = 1; j < Math.round(TH * 13); j++) { const [px, py] = toS(i / 14 * TW, j / Math.round(TH * 13) * TH); g.beginPath(); g.arc(px, py, 1.4, 0, 7); g.fill(); }
  g.save(); PK.rrect(g, lx, ly, lw, lh, k * .05); g.clip(); g.shadowBlur = 14; const neon = (c) => { g.strokeStyle = c; g.shadowColor = c; };
  g.lineWidth = 3; neon('rgba(120,200,255,.7)'); const [ca, cb] = toS(0, TH / 2), [cc, cd2] = toS(TW, TH / 2); g.beginPath(); g.moveTo(ca, cb); g.lineTo(cc, cd2); g.stroke();
  const [mx, my] = toS(TW / 2, TH / 2); g.beginPath(); g.arc(mx, my, .16 * k, 0, 7); g.stroke();
  for (const top of [1, 0]) { const yy = top ? 0 : TH; neon(top ? M.hsl(mb.hue, 100, 60) : M.hsl(ma.hue, 100, 60)); const [gx0, gy0] = toS(TW / 2 - GW / 2, yy), [gx1, gy1] = toS(TW / 2 + GW / 2, yy); g.lineWidth = 7; g.beginPath(); g.moveTo(gx0, gy0); g.lineTo(gx1, gy1); g.stroke(); const [ax, ay] = toS(TW / 2, yy); g.lineWidth = 2; g.beginPath(); g.arc(ax, ay, .22 * k, 0, 7); g.stroke(); }
  g.restore(); }
const G = {
  title: 'Puck Rivals', tagline: 'Neon air hockey. First to five.', accent: '#6affd2', bg0: '#101030', bg1: '#04040e', unit: '',
  modes: ['vs Rival', '2 Players'],
  howto: ['Drag your mallet in your half', 'Slam the puck into the far goal · hit table items', `Tap 🛡 to buy a one-goal shield (${SHIELD_COST} ⬢)`],
  music: { root: 220, scale: [0, 3, 5, 7, 10, 12], bpm: 124, voice: 'pluck', density: .35 },
  levelWord: 'League match', nextLabel: 'Next rival', reviveLabel: 'wipe 2 of their goals', boostLabel: 'start 1–0 up',
  meta: { currency: '⬢', daily: 40, rewardId: 'puck-2x', reviveId: 'puck-revive', boostId: 'puck-boost',
    upgrades: [{ id: 'reach', name: 'Quick Hands', desc: 'faster mallet', cost: 100, max: 5 }, { id: 'sideslow', name: 'Side Slow', desc: 'puck −1%/lvl speed on side rails', cost: 120, max: 5 }],
    skins: SK, skinIcon(g, x, y, r, i) { g.drawImage(malletSpr(SK[i].hue), x - r * 1.1, y - r * 1.1, r * 2.2, r * 2.2); } },
  titleExtra: () => PK.mode() ? 'Same-screen duel' : AR.league(PK.level()),
  qaPos: () => ma ? toS(ma.x, ma.y) : [0, 0], qaIdle: () => !Object.values(keys).some(Boolean),
  qaSet(x, y, vx, vy, mx, my) { Object.assign(puck, { x, y, vx, vy }); serveT = 0; if (mx !== undefined) { ma.x = ma.tx = mx; ma.y = ma.ty = my; } }, qaState: () => ({ sc: sc.slice(), shield, puck: { ...puck, last: 0 }, mb: [mb.x, mb.y], TH }),
  init(w, h) { W = w; H = h; newMatch(false); }, resize(w, h) { W = w; H = h; if (ma) { const o = TH; fitTable(); const f = TH / o; for (const o2 of [ma, mb, puck]) { o2.y *= f; if (o2.ty) o2.ty *= f; } items.forEach(q => q.y *= f); } },
  start(b) { newMatch(b); }, nextLevel(l, b) { newMatch(b); },
  canRevive: () => !two && sc[1] >= GOALS, revive() { sc[1] = GOALS - 2; ended = false; serve(false); },
  cancel() { ptrA = ptrB = null; for (const k in keys) keys[k] = false; },
  idle(dt) { step(dt, true); },
  update(dt) { cd += dt; if (cd < 2.2) return; step(dt, false); if (ended) return;
    if (sc[0] >= GOALS || sc[1] >= GOALS) { ended = true; const won = sc[0] >= GOALS;
      if (two) PK.gameOver(Math.max(...sc) * 100, won ? 'Bottom player wins!' : 'Top player wins!', 5);
      else if (won) PK.levelClear({ stars: sc[1] === 0 ? 3 : sc[1] < 3 ? 2 : 1, msg: 'Table champion!', sub: `${sc[0]}–${sc[1]} vs ${rv.name}`, coins: 20 + PK.level() * 3 + (GOALS - sc[1]) * 4, score: 100 * (GOALS - sc[1]) });
      else PK.gameOver(sc[0] * 100, `${rv.name} wins ${sc[1]}–${sc[0]}`, 6 + sc[0] * 5); } },
  down(x, y, id, e) { if (!two && !shieldBought && PK.state === 'play') { const b = shieldBtn(); if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { buyShield(); return; } }
    if (ptrA && !PK.pointers.has(ptrA.id)) ptrA = null; if (ptrB && !PK.pointers.has(ptrB.id)) ptrB = null;
    const [tx, ty] = toT(x, y); if (two && ty < TH / 2) ptrB = { id, x, y }; else ptrA = { id, x, y }; },
  move(x, y, id) { if (ptrA && ptrA.id === id) { ptrA.x = x; ptrA.y = y; } else if (ptrB && ptrB.id === id) { ptrB.x = x; ptrB.y = y; } },
  up(x, y, id) { if (ptrA && ptrA.id === id) ptrA = null; if (ptrB && ptrB.id === id) ptrB = null; },
  key(k, d) { const m = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd' }; if (m[k]) keys[m[k]] = d; if (d && (k === 'g' || k === 'G')) buyShield(); },
  draw(g) {
    const key = `pr${W}x${H}:${TH.toFixed(3)}:${ma.hue}:${mb.hue}`; if (key !== lastKey) { AR.unview(lastKey); lastKey = key; } AR.view(g, key, drawTable);
    const { k } = view(), [x0, y0] = toS(0, 0), [x1, y1] = toS(TW, TH), lx = Math.min(x0, x1), ly = Math.min(y0, y1), lw = Math.abs(x1 - x0), lh = Math.abs(y1 - y0);
    // big faint score numerals in each half
    const [sx0, sy0] = toS(TW / 2, TH * .25), [sx1, sy1] = toS(TW / 2, TH * .75);
    text(String(sc[1]), sx0, sy0, k * .3, { color: M.hsl(mb.hue, 90, 70), alpha: .16, weight: 900, shadow: false }); text(String(sc[0]), sx1, sy1, k * .3, { color: M.hsl(ma.hue, 90, 70), alpha: .16, weight: 900, shadow: false });
    if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * .12})`; g.fillRect(lx, ly, lw, lh); }
    if (shield) { const [ax, ay] = toS(TW / 2, TH); g.strokeStyle = `rgba(150,230,255,${.6 + .3 * Math.sin(PK.t * 6)})`; g.lineWidth = 6; g.beginPath(); g.arc(ax, ay, (GW / 2 + .03) * k, Math.PI, 2 * Math.PI); g.stroke(); g.lineWidth = 2; g.strokeStyle = 'rgba(220,250,255,.8)'; g.beginPath(); g.arc(ax, ay, (GW / 2 + .045) * k, Math.PI, 2 * Math.PI); g.stroke(); }
    for (const q of items) { const [x, y] = toS(q.x, q.y), R = .05 * k * (1 + Math.sin(q.t * 5) * .08); g.drawImage(AR.itemSprite(q.k), x - R * 1.6, y - R * 1.6, R * 3.2, R * 3.2); }
    for (let i = 0; i < trail.length; i++) { const p = trail[i], [x, y] = toS(p[0], p[1]); g.fillStyle = `rgba(255,240,200,${i / trail.length * .25})`; g.beginPath(); g.arc(x, y, PR * k * (i / trail.length), 0, 7); g.fill(); }
    mallet(g, mb, k); mallet(g, ma, k);
    const [px, py] = toS(puck.x, puck.y), pr = PR * k; AR.shadow(g, px + 3, py + 4, pr, pr * .8, .4); g.drawImage(puckSpr(), px - pr * 3, py - pr * 3, pr * 6, pr * 6);
  },
  hud(g) {
    const s = PK.S;
    const [nx, ny] = toS(TW / 2, -.03); if (!two) AR.tag(g, nx, Math.max(ny + s * .5, s * 3.5), `${rv.name}  ${sc[1]}`, '#fff', s); if (cd < 2.6) AR.countdown(g, cd + .8, 3);
    if (!two && PK.state === 'play' && cd > 2.2) { const b = shieldBtn(); if (!shieldBought) { const ok = PK.coins() >= SHIELD_COST; PK.rrect(g, b.x, b.y, b.w, b.h, b.h / 2); g.fillStyle = ok ? 'rgba(40,120,170,.85)' : 'rgba(40,40,70,.7)'; g.fill(); g.strokeStyle = 'rgba(170,230,255,.8)'; g.lineWidth = 1.5; g.stroke(); text(`🛡 ${SHIELD_COST} ⬢`, b.x + b.w / 2, b.y + b.h / 2, s * .7, { color: ok ? '#fff' : 'rgba(255,255,255,.6)', weight: 800, shadow: false }); }
      else text(shield ? '🛡 shield ready' : '🛡 used', b.x + b.w / 2, b.y + b.h / 2, s * .6, { color: shield ? '#bff0ff' : 'rgba(255,255,255,.5)', weight: 700 }); }
    AR.buffHud(g, ma, s * .6, H - s * 4.2, s * .7);
    AR.drawFeed(g, s * .5, s * 3.2, s, 1 / 60);
  },
};
PK.run(G);
})();
