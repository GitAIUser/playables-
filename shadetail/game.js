/* Shadetail: an ink-wash tanuki spirit can only stretch its tail through SHADOW. Paper lanterns, moonlight and drifting
   clouds decide where shadow falls. Tug a lantern cord with the tail tip to flip that lantern set; clouds drift only while
   your tail is home (holding the tail freezes the sky), so timing is planning, never reflex.
   Style: sumi-e ink wash on rice paper, soft-bled light maps, dry-brush tail, red seal stamp on clear. */
'use strict';
(() => {
  const { M, fx, sfx, text, rrect, face } = PK;
  const COLS = 6, ROWS = 9, CS = 100 / COLS, GH = ROWS * CS, TOTAL = 90, HR = 3.4, CLOUD_T = 0.9;
  const WORLDS = ['Spring Garden', 'Summer Festival', 'Autumn Shrine', 'Winter Village', 'Rainy Bridge', 'Moon Palace'];
  const SKINS = [
    { name: 'Sumi', ink: '#1d1d24', wash: '#5a5f70', seal: '#c8323a' }, { name: 'Indigo', ink: '#1b2a5a', wash: '#4a5f9a', seal: '#d0503a' },
    { name: 'Sepia', ink: '#3a2414', wash: '#8a6a4a', seal: '#b8322a' }, { name: 'Vermilion', ink: '#5a1414', wash: '#c0503a', seal: '#2a2a2a' },
    { name: 'Moss', ink: '#1e3020', wash: '#5a7a50', seal: '#c8323a' }, { name: 'Plum', ink: '#3a1a3a', wash: '#8a5a8a', seal: '#e0a020' },
    { name: 'Snow', ink: '#4a5a70', wash: '#a8b8cc', seal: '#c8323a' }, { name: 'Gold leaf', ink: '#3a2a08', wash: '#c8a040', seal: '#c8323a' },
  ];
  // . free  # rock  = shoji screen (blocks too)  0 lantern always-on  1/2 lantern set A/B  a/b cord for set A/B  D dumpling  p petal
  const HAND = [
    { sc: 2, r: ['..D...', '......', '..##..', '......', '0.....', '......', '......', '......', '......'] },
    { sc: 3, r: ['....D.', '......', '.0....', '......', '...#..', '......', '.....0', '..p...', '......'] },
  ];
  const idx = (c, r) => r * COLS + c, cc = (c, r) => [(c + .5) * CS, (r + .5) * CS];
  const solid = (L, i) => L.g[i] === 1 || L.lan.some((l) => idx(l.c, l.r) === i);

  // ---------- light ----------
  function los(L, a, b) { // straight sight line between cell centres, rocks block
    const [x0, y0] = [a[0] + .5, a[1] + .5], [x1, y1] = [b[0] + .5, b[1] + .5], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
    for (let k = 1; k < n; k++) { const x = Math.floor(x0 + (x1 - x0) * k / n), y = Math.floor(y0 + (y1 - y0) * k / n); if ((x === a[0] && y === a[1]) || (x === b[0] && y === b[1])) continue; if (L.g[idx(x, y)] === 1) return false; }
    return true;
  }
  function lightMap(L, mask, p) {
    const m = new Uint8Array(COLS * ROWS);
    for (const l of L.lan) {
      const on = l.g === 0 || (mask >> (l.g - 1) & 1); if (!on) continue;
      for (let r = Math.max(0, l.r - l.R); r <= Math.min(ROWS - 1, l.r + l.R); r++) for (let c = Math.max(0, l.c - l.R); c <= Math.min(COLS - 1, l.c + l.R); c++) if (!solid(L, idx(c, r)) && los(L, [l.c, l.r], [c, r])) m[idx(c, r)] = 1;
    }
    if (L.moon) for (let c = 0; c < COLS; c++) { if (c >= p && c < p + L.cw) continue; for (let r = 0; r < ROWS; r++) { if (solid(L, idx(c, r))) break; m[idx(c, r)] = 1; } }
    return m;
  }
  const cloudN = (L) => L.moon ? COLS - L.cw + 1 : 1;
  function maps(L) { const out = []; for (let p = 0; p < cloudN(L); p++) { out.push([]); for (let m = 0; m < 4; m++) out[p].push(lightMap(L, m, p)); } return out; }
  /** BFS over (cell, lantern mask, petal) for a fixed cloud position; then validates that the whole tail stays dark. */
  function solveP(L, p, needPetal) {
    const S = COLS * ROWS, LM = L.maps[p], pet = L.petal ? idx(...L.petal) : -1, goal = idx(...L.goal);
    const key = (c, m, f) => (c * 4 + m) * 2 + f, prev = new Map(), q = [[S, L.mask0, 0]]; prev.set(key(S, L.mask0, 0), null);
    while (q.length) {
      const cur = q.shift(), [cell, m, f] = cur;
      if (cell === goal && (f || !needPetal)) { const path = []; let s = cur; while (s) { path.unshift(s); s = prev.get(key(s[0], s[1], s[2])); } return path; }
      const c = cell === S ? L.sc : cell % COLS, r = cell === S ? ROWS : Math.floor(cell / COLS);
      for (const [dc, dr] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
        const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const ni = idx(nc, nr); if (solid(L, ni)) continue;
        let nm = m; const cord = L.cords.find((k) => k.c === nc && k.r === nr); if (cord) nm = m ^ (1 << (cord.g - 1));
        if (LM[nm][ni]) continue; const nf = f || ni === pet ? 1 : 0, kk = key(ni, nm, nf); if (prev.has(kk)) continue; prev.set(kk, cur); q.push([ni, nm, nf]);
      }
    }
    return null;
  }
  function validTail(L, p, path) { // whole body must stay in shadow after every move/toggle
    const LM = L.maps[p], seen = [];
    for (let k = 1; k < path.length; k++) { const [cell, m] = path[k]; seen.push(cell); for (const x of seen) if (LM[m][x]) return false; }
    return true;
  }
  function solve(L, needPetal) {
    let best = null;
    for (let p = 0; p < cloudN(L); p++) { const s = solveP(L, p, needPetal); if (s && validTail(L, p, s) && (!best || s.length < best.path.length)) best = { p, path: s }; }
    return best;
  }
  function finish(L, i) {
    L.maps = maps(L); const a = solve(L, false); if (!a) return null; let b = a;
    if (L.petal) { b = solve(L, true); if (!b) return null; }
    L.sol = b; L.par = Math.round((b.path.length - 1) * CS * 1.06 + 3);
    L.pOK = []; for (let p = 0; p < cloudN(L); p++) { const s = solveP(L, p, false); L.pOK.push(!!(s && validTail(L, p, s))); }
    return L;
  }
  function parse(h) {
    const L = { g: [], lan: [], cords: [], sc: h.sc, goal: null, petal: null, moon: false, cw: 2, mask0: 1 };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = h.r[r][c]; L.g.push(ch === '#' ? 1 : ch === '=' ? 1 : 0);
      if ('012'.includes(ch)) L.lan.push({ c, r, g: +ch, R: 2 }); if (ch === 'a' || ch === 'b') L.cords.push({ c, r, g: ch === 'a' ? 1 : 2 });
      if (ch === 'D') L.goal = [c, r]; if (ch === 'p') L.petal = [c, r];
    }
    return L;
  }
  function gen(i, seed) {
    if (!seed && i < HAND.length) { const L = finish(parse(HAND[i]), i); if (L) return L; }
    const w = Math.floor(i / 15), d = (i % 15) / 14;
    for (let tr = 0; tr < 700; tr++) {
      const r = M.rng(M.hash(i, seed, tr, 'shade')), strict = tr < 550;
      const L = { g: new Array(COLS * ROWS).fill(0), lan: [], cords: [], sc: M.ri(r, 0, 5), goal: [M.ri(r, 0, 5), M.ri(r, 0, 1)], petal: null, moon: w === 2 || w === 3 || w === 5, cw: 2 + (r() < .3 ? 1 : 0), mask0: M.ri(r, 0, 3) };
      const used = new Set([idx(...L.goal), idx(L.sc, ROWS - 1)]);
      const freeCell = (r0 = 0, r1 = ROWS - 1) => { for (let k = 0; k < 40; k++) { const c = M.ri(r, 0, COLS - 1), rr = M.ri(r, r0, r1), x = idx(c, rr); if (!used.has(x) && !L.g[x]) { used.add(x); return [c, rr]; } } return null; };
      const nRock = Math.round(2 + d * 3 + r() * 2 + (L.moon ? 2 : 0));
      for (let k = 0; k < nRock; k++) { const a = freeCell(L.moon ? 0 : 1, ROWS - 2); if (a) { L.g[idx(...a)] = 1; if (r() < .45 && a[0] < COLS - 1 && !used.has(idx(a[0] + 1, a[1]))) { L.g[idx(a[0] + 1, a[1])] = 1; used.add(idx(a[0] + 1, a[1])); } } }
      const groups = w === 0 ? 0 : w === 2 ? 0 : w === 1 || w === 3 ? 1 : 2;
      const nLan = w === 2 ? (d > .5 ? 1 : 0) : Math.round(1 + d * 2 + (w >= 4 ? 1 : 0) + r());
      for (let k = 0; k < nLan; k++) { const a = freeCell(0, ROWS - 2); if (!a) continue; const g = groups === 0 ? 0 : (k === 0 ? 1 : groups === 2 && k === 1 ? 2 : M.ri(r, 0, groups)); L.lan.push({ c: a[0], r: a[1], g, R: r() < .35 + d * .2 ? 2 : 1 }); }
      for (let g = 1; g <= groups; g++) { const a = freeCell(1, ROWS - 1); if (a) L.cords.push({ c: a[0], r: a[1], g }); }
      if (groups === 0) L.mask0 = 0;
      if (r() < .85) L.petal = freeCell(0, ROWS - 2);
      const out = finish(L, i); if (!out) continue;
      const steps = out.sol.path.length - 1; if (strict && steps < 6 + d * 5 + w * .5) continue;
      if (strict && groups) { const usedCord = out.sol.path.some((s) => L.cords.some((k) => idx(k.c, k.r) === s[0])); if (!usedCord) continue; }
      if (strict && L.moon && out.pOK.every((x) => x)) continue; // the cloud position must matter
      if (strict && !L.moon && L.lan.length && steps <= Math.abs(L.goal[1] - ROWS) + Math.abs(L.goal[0] - L.sc) + (w ? 1 : 0)) continue; // straight shots are dull
      return out;
    }
    return finish(parse(HAND[i % HAND.length]), i);
  }

  // ---------- state ----------
  let lv = null, tail = [], cells = [], head = null, target = null, holding = false, mode = 'idle', mask = 0, cloudP = 0, cloudDir = 1, cloudT = 0, petalGot = false;
  let snap = null, mood = 'idle', moodT = 0, endT = 0, winT = -1, failCell = -1, lastCell = -1, T = 0, cloudX = 0;
  const base = () => [(lv.sc + .5) * CS, GH + 4];
  const curMap = () => lv.maps[cloudP][mask];
  function reset(keepSky) { tail = [base()]; cells = []; head = base(); target = null; holding = false; mode = 'idle'; lastCell = -1; failCell = -1; snap = null; petalGot = false; winT = -1; mood = 'idle'; if (!keepSky) { mask = lv.mask0; cloudP = 0; cloudDir = 1; cloudT = 0; cloudX = 0; } }
  const blocked = (x, y) => {
    if (x < HR || x > 100 - HR || y < HR) return true;
    if (y > GH - HR) return Math.abs(x - base()[0]) > CS / 2 - HR || y > GH + 6;
    for (const [ox, oy] of [[-HR, -HR], [HR, -HR], [-HR, HR], [HR, HR]]) { const c = Math.floor((x + ox) / CS), r = Math.floor((y + oy) / CS); if (c >= 0 && r >= 0 && c < COLS && r < ROWS && solid(lv, idx(c, r))) return true; }
    return false;
  };
  function enterCell(ci) {
    const c = ci % COLS, r = Math.floor(ci / COLS); cells.push(ci);
    const cord = lv.cords.find((k) => k.c === c && k.r === r);
    if (cord) { mask ^= 1 << (cord.g - 1); sfx.pluck(cord.g === 1 ? 392 : 523, .2); sfx.tone({ f: 1200, d: .05, type: 'square', v: .03 }); const [x, y] = cc(c, r); fx.word(x, y - 7, (mask >> (cord.g - 1) & 1) ? 'light!' : 'dark…', '#fff', 4.5); }
    if (lv.petal && !petalGot && c === lv.petal[0] && r === lv.petal[1]) { petalGot = true; sfx.chime(1175); const [x, y] = cc(c, r); fx.burst(x, y, 10, { col: ['#ffc0d0', '#fff'], speed: 18, size: 1.4 }); }
    const LM = curMap(); for (const x of cells) if (LM[x]) { dissolve(x); return; }
    if (c === lv.goal[0] && r === lv.goal[1]) winNow();
  }
  function moveHead(tx, ty, maxD) {
    let [x, y] = head; const dx = tx - x, dy = ty - y, dl = Math.hypot(dx, dy); if (dl < .05) return;
    const n = Math.ceil(Math.min(dl, maxD)), sx = dx / dl * Math.min(dl, maxD) / n, sy = dy / dl * Math.min(dl, maxD) / n;
    for (let k = 0; k < n && mode === 'drag'; k++) {
      let nx = x + sx, ny = y + sy; if (blocked(nx, ny)) { if (!blocked(nx, y)) ny = y; else if (!blocked(x, ny)) nx = x; else break; }
      x = nx; y = ny; head = [x, y]; const lp = tail[tail.length - 1]; if (Math.hypot(x - lp[0], y - lp[1]) >= 1) tail.push([x, y]);
      const c = Math.floor(x / CS), r = Math.floor(y / CS); if (r < ROWS) { const ci = idx(c, r); if (ci !== lastCell) { lastCell = ci; snap = { tail: tail.slice(0, Math.max(1, tail.length - 6)), cells: cells.slice(), mask }; enterCell(ci); } } else lastCell = -1;
    }
  }
  function dissolve(ci) {
    mode = 'fail'; failCell = ci; endT = 0; mood = 'shock'; const [x, y] = cc(ci % COLS, Math.floor(ci / COLS));
    fx.burst(x, y, 22, { col: ['#1d1d24', '#3a3a48', '#5a5f70'], speed: 26, grav: -10, size: 2.2, life: 1, shape: 'puff' }); sfx.noise({ f: 3000, f2: 800, d: .5, v: .16, q: .6 });
    PK.later(() => { if (mode === 'fail') { const b = base(); fx.word(b[0] + 8, b[1] - 12, 'ACHOO!', '#1d1d24', 7); fx.burst(b[0], b[1] - 6, 14, { col: '#1d1d24', speed: 40, dir: -1.2, size: 1.5 }); sfx.noise({ f: 1500, f2: 400, d: .25, v: .2 }); } }, 450);
    PK.fail('The tail touched the light!');
  }
  function winNow() {
    mode = 'won'; winT = 0; holding = false; const len = M.polyLen(tail); let st = 1; if (!lv.petal || petalGot) st++; if (len <= lv.par) st++;
    sfx.gulp(); PK.later(() => sfx.chime(784), 600); PK.win(st);
  }

  // ---------- drawing ----------
  function inkStroke(g, pts, w, col, alpha = 1) {
    if (pts.length < 2) return; g.save(); g.globalAlpha *= alpha; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col;
    for (let k = 1; k < pts.length; k++) { const f = k / pts.length; g.lineWidth = w * (.45 + .55 * Math.min(1, f * 3)) * (1 - Math.max(0, f - .85) * 2.5); g.beginPath(); g.moveTo(pts[k - 1][0], pts[k - 1][1]); g.lineTo(pts[k][0], pts[k][1]); g.stroke(); }
    g.restore();
  }
  function drawRock(g, x, y, seed, sk) {
    g.fillStyle = 'rgba(30,30,40,.18)'; PK.blob(g, x + 1, y + 1.5, CS * .46, .2, seed, 14); g.fill();
    g.fillStyle = sk.wash; g.globalAlpha = .75; PK.blob(g, x, y, CS * .44, .22, seed, 14); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = sk.ink; g.lineWidth = 1.1; PK.blob(g, x, y, CS * .44, .22, seed, 14); g.stroke();
    g.lineWidth = .5; g.globalAlpha = .6; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - 5 + k * 3, y - 4 + k); g.quadraticCurveTo(x - 2 + k * 3, y, x - 4 + k * 3, y + 4); g.stroke(); } g.globalAlpha = 1;
  }
  function drawStatic(g) {
    const sk = SKINS[PK.skin()] || SKINS[0];
    g.fillStyle = '#f3ead6'; g.fillRect(0, 0, 100, GH); g.fillStyle = PK.pat('paper'); g.globalCompositeOperation = 'multiply'; g.fillRect(0, 0, 100, GH); g.globalCompositeOperation = 'source-over';
    // ink-wash shadow over everything (light is painted on top)
    const r = M.rng(PK.cur * 7 + 1); for (let k = 0; k < 26; k++) { g.fillStyle = `rgba(40,45,60,${.06 + r() * .06})`; PK.blob(g, r() * 100, r() * GH, 10 + r() * 22, .35, k + PK.cur, 12); g.fill(); }
    g.fillStyle = 'rgba(40,45,60,.22)'; g.fillRect(0, 0, 100, GH);
    for (let rr = 0; rr < ROWS; rr++) for (let c = 0; c < COLS; c++) if (lv.g[idx(c, rr)] === 1) { const [x, y] = cc(c, rr); drawRock(g, x, y, idx(c, rr) + PK.cur, sk); }
  }
  let lightC = null, lightKey = '';
  function lightCanvas() {
    const k = PK.cur + ':' + mask + ':' + cloudP; if (lightC && lightKey === k) return lightC;
    const m = curMap(), S = 4, W = COLS * S, H = ROWS * S; if (!lightC) lightC = document.createElement('canvas'); lightC.width = W + 2; lightC.height = H + 2; const g = lightC.getContext('2d'); const img = g.createImageData(W + 2, H + 2);
    for (let y = 0; y < H + 2; y++) for (let x = 0; x < W + 2; x++) { const c = Math.floor((x - 1) / S), r = Math.floor((y - 1) / S); const lit = c >= 0 && r >= 0 && c < COLS && r < ROWS && m[idx(c, r)]; const o = (y * (W + 2) + x) * 4; img.data[o] = 255; img.data[o + 1] = 222; img.data[o + 2] = 140; img.data[o + 3] = lit ? 150 : 0; }
    g.putImageData(img, 0, 0); lightKey = k; return lightC;
  }
  function drawLantern(g, l, on, t) {
    const [x, y] = cc(l.c, l.r), col = l.g === 0 ? '#d8402a' : l.g === 1 ? '#e0a020' : '#3a8ad0';
    if (on) { const rg = g.createRadialGradient(x, y, 1, x, y, CS * (l.R + .5)); rg.addColorStop(0, 'rgba(255,220,130,.35)'); rg.addColorStop(1, 'rgba(255,220,130,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, CS * (l.R + .5), 0, 7); g.fill(); }
    g.strokeStyle = '#1d1d24'; g.lineWidth = .7; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x, y - 5); g.stroke();
    g.fillStyle = on ? col : '#8a8580'; g.beginPath(); g.ellipse(x, y, 4.2, 5, 0, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(29,29,36,.55)'; g.lineWidth = .4; for (let k = -2; k <= 2; k++) { g.beginPath(); g.ellipse(x, y, 4.2 * Math.cos(k * .35), 5, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); }
    g.fillStyle = '#1d1d24'; g.fillRect(x - 2.4, y - 5.6, 4.8, 1.2); g.fillRect(x - 2.4, y + 4.4, 4.8, 1.2);
    if (on) { g.fillStyle = 'rgba(255,250,210,.8)'; g.beginPath(); g.ellipse(x - 1, y - 1, 1.2, 2, 0, 0, 7); g.fill(); }
    if (l.g) { g.fillStyle = '#fff'; g.beginPath(); if (l.g === 1) g.arc(x + 4.6, y - 5, 1.5, 0, 7); else { g.moveTo(x + 4.6, y - 6.8); g.lineTo(x + 6.3, y - 3.8); g.lineTo(x + 2.9, y - 3.8); g.closePath(); } g.fill(); g.strokeStyle = col; g.lineWidth = .5; g.stroke(); }
  }
  function drawCord(g, k, t) {
    const [x, y] = cc(k.c, k.r), col = k.g === 1 ? '#e0a020' : '#3a8ad0', sw = Math.sin(t * 2 + k.c) * .6;
    g.strokeStyle = '#6a4a2a'; g.lineWidth = .8; g.beginPath(); g.moveTo(x, y - 8); g.quadraticCurveTo(x + sw, y - 2, x + sw, y + 2); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(x + sw - 1.6, y + 2); g.lineTo(x + sw + 1.6, y + 2); g.lineTo(x + sw + 2.2, y + 6); g.lineTo(x + sw - 2.2, y + 6); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); if (k.g === 1) g.arc(x + sw, y - 2, 1.3, 0, 7); else { g.moveTo(x + sw, y - 3.6); g.lineTo(x + sw + 1.4, y - 1); g.lineTo(x + sw - 1.4, y - 1); g.closePath(); } g.fill();
  }
  function drawTanuki(g, x, y, sk, md, t, teapot) {
    g.save(); g.translate(x, y);
    if (teapot) { // classic folklore shapeshift gag: tanuki-teapot
      g.fillStyle = '#8a6a4a'; g.beginPath(); g.ellipse(0, 1, 8, 6.5, 0, 0, 7); g.fill(); g.strokeStyle = sk.ink; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.moveTo(7, -1); g.quadraticCurveTo(13, -2, 13, -7); g.stroke(); g.beginPath(); g.ellipse(-9, 1, 2.2, 3.6, 0, Math.PI * .5, Math.PI * 1.5); g.stroke();
      g.fillStyle = sk.ink; g.fillRect(-3, -7, 6, 1.6); g.beginPath(); g.arc(0, -7.6, 1.2, 0, 7); g.fill();
      face(g, 0, 1.5, 4.2, 'joy', t, { ink: sk.ink }); g.restore(); return;
    }
    g.fillStyle = 'rgba(30,30,40,.18)'; g.beginPath(); g.ellipse(0, 7, 9, 2.2, 0, 0, 7); g.fill();
    g.fillStyle = '#b89a78'; g.beginPath(); g.ellipse(0, 1.5, 7.5, 6.5, 0, 0, 7); g.fill(); g.strokeStyle = sk.ink; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#efe4cc'; g.beginPath(); g.ellipse(0, 3, 4.5, 4, 0, 0, 7); g.fill();
    g.fillStyle = '#b89a78'; g.beginPath(); g.arc(0, -6, 5.6, 0, 7); g.fill(); g.stroke();
    g.fillStyle = sk.ink; g.beginPath(); g.arc(-4.4, -10.4, 1.6, 0, 7); g.arc(4.4, -10.4, 1.6, 0, 7); g.fill();
    g.globalAlpha = .85; g.beginPath(); g.ellipse(-2.4, -6.4, 2.4, 1.8, -.3, 0, 7); g.ellipse(2.4, -6.4, 2.4, 1.8, .3, 0, 7); g.fill(); g.globalAlpha = 1;
    face(g, 0, -5.6, 4.6, md, t, { ink: '#f3ead6' });
    g.fillStyle = '#5a9a40'; g.beginPath(); g.ellipse(1.5, -12, 2.6, 1.2, -.5, 0, 7); g.fill();
    g.restore();
  }
  function drawDumpling(g, x, y, t, s = 1) {
    g.save(); g.translate(x, y + Math.sin(t * 2.5) * .5); g.scale(s, s);
    g.fillStyle = 'rgba(255,240,200,.28)'; g.beginPath(); g.arc(0, 0, 7.5, 0, 7); g.fill();
    g.fillStyle = '#fbf6ea'; g.beginPath(); g.moveTo(-5.5, 2.6); g.quadraticCurveTo(-5, -3.5, 0, -4.6); g.quadraticCurveTo(5, -3.5, 5.5, 2.6); g.closePath(); g.fill(); g.strokeStyle = '#1d1d24'; g.lineWidth = .8; g.stroke();
    g.lineWidth = .5; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 1.3, -4.2); g.lineTo(k * 1.6, -1.6); g.stroke(); }
    for (let k = 0; k < 2; k++) { g.strokeStyle = 'rgba(29,29,36,.3)'; g.beginPath(); g.moveTo(-1.5 + k * 3, -6); g.quadraticCurveTo(-3 + k * 3, -8.5 + Math.sin(t * 3 + k), -1 + k * 3, -11); g.stroke(); }
    g.restore();
  }

  const game = {
    id: 'shadetail', title: 'Shadetail', tagline: 'A tanuki spirit stretches its tail through shadow. Shape the dark, then reach!', total: TOTAL, worldSize: 15, worlds: WORLDS,
    accent: '#c8323a', bg0: '#efe4cc', bg1: '#2a2a34', titleCol: '#1d1d24', titleStroke: '#f3ead6', titleFont: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif', board: { w: 100, h: GH + 16 }, lead: true, skins: SKINS,
    music: { root: 220, scale: [0, 2, 5, 7, 9, 12], bpm: 72, voice: 'bell', density: .3 },
    clearLines: ['Pon-poko!', 'Dumpling acquired.', 'Teapot mode!', 'Shadow master!', 'Silent as ink.'],
    tutorial(i) {
      if (i === 0) return 'Drag the tail through the shadow to the dumpling. Light melts it!';
      if (i === 1) return 'Lantern light spreads around it. Rocks cast shadows.';
      if (i === 15) return 'Touch a cord with the tail tip to flip its lanterns (●/▲). Your tail must stay dark!';
      if (i === 30) return 'Moonlight! Clouds drift only while your tail is home. Let go, wait for the cloud, then go';
      if (i === 45) return 'Snowy village: moonlight AND lantern cords';
      if (i === 60) return 'Two lantern sets. Flip them in the right order';
      if (i === 75) return 'The Moon Palace. Everything at once';
      return null;
    },
    goal() { return (lv.petal ? '★ petal · ' : '★★ dumpling · ') + `★ tail ≤ ${lv.par}`; },
    load(i, seed) { lv = gen(i, seed); reset(); PK.unbake('st'); lightKey = ''; },
    validate: () => !!(lv && lv.sol && lv.sol.path.length > 1), sig: () => [lv.g.join(''), lv.sc, lv.goal, lv.lan, lv.cords, lv.moon, lv.mask0],
    canRewind: () => !!snap && snap.tail.length > 1,
    rewind() { if (!snap) return false; tail = snap.tail.map((p) => p.slice()); head = tail[tail.length - 1].slice(); mask = snap.mask; cells = snap.cells.slice(); const c = Math.floor(head[0] / CS), r = Math.floor(head[1] / CS); lastCell = r < ROWS ? idx(c, r) : -1; while (cells.length && cells[cells.length - 1] !== lastCell && lastCell >= 0) cells.pop(); if (lastCell >= 0 && cells[cells.length - 1] !== lastCell) cells.push(lastCell); const LM = curMap(); if (cells.some((x) => LM[x])) { reset(true); } mode = 'idle'; failCell = -1; snap = null; mood = 'idle'; return true; },
    cursorStart: () => head.slice(),
    down(x, y) { if (mode !== 'idle' && mode !== 'drag') return; holding = true; mode = 'drag'; target = [x, y]; },
    move(x, y) { if (holding) target = [x, y]; },
    up() { if (mode === 'drag') { holding = false; mode = 'retract'; sfx.whoosh(.08); } },
    cancel() { game.up(); },
    step(dt) {
      T += dt; moodT += dt;
      if (mode === 'drag' && target) moveHead(target[0], target[1], 220 * dt);
      if (mode === 'retract') { let d = 260 * dt; while (d > 0 && tail.length > 1) { const a = tail[tail.length - 1], b = tail[tail.length - 2], l = Math.hypot(a[0] - b[0], a[1] - b[1]); if (l <= d) { tail.pop(); d -= l; } else { a[0] += (b[0] - a[0]) * d / l; a[1] += (b[1] - a[1]) * d / l; d = 0; } } head = tail[tail.length - 1].slice(); if (tail.length <= 1) { reset(true); } }
      // clouds drift only while the tail is home
      if (lv.moon && mode === 'idle' && tail.length <= 1) { cloudT += dt; if (cloudT >= CLOUD_T) { cloudT -= CLOUD_T; const n = cloudN(lv); if (cloudP + cloudDir < 0 || cloudP + cloudDir >= n) cloudDir *= -1; cloudP += cloudDir; sfx.tone({ f: 180, d: .3, v: .03, a: .1 }); } }
      cloudX = M.approach(cloudX, cloudP, 8, dt);
      if (winT >= 0) winT += dt; if (mode === 'fail') endT += dt;
    },
    drawBg(g, W, H) {
      const w = Math.floor(PK.cur / 15) % 6;
      g.drawImage(PK.screenBg('st' + w, (b, w2, h2) => {
        b.fillStyle = '#efe4cc'; b.fillRect(0, 0, w2, h2); b.fillStyle = PK.pat('paper'); b.globalCompositeOperation = 'multiply'; b.fillRect(0, 0, w2, h2); b.globalCompositeOperation = 'source-over';
        const r = M.rng(w * 31 + 3), hz = h2 * .78;
        for (let layer = 0; layer < 3; layer++) { b.fillStyle = `rgba(40,45,60,${.08 + layer * .07})`; b.beginPath(); b.moveTo(0, h2); let x = 0; b.lineTo(0, hz - 40 + layer * 30); while (x < w2) { x += 20 + r() * 50; b.lineTo(x, hz - 30 - r() * (110 - layer * 30) + layer * 34); } b.lineTo(w2, h2); b.closePath(); b.fill(); }
        b.fillStyle = 'rgba(200,50,58,.85)'; b.beginPath(); b.arc(w2 * .9, h2 * .95, Math.min(w2, h2) * .04, 0, 7); b.fill();
        if (w === 0 || w === 5) for (let k = 0; k < 18; k++) { b.fillStyle = 'rgba(230,150,170,.5)'; b.beginPath(); b.ellipse(r() * w2, r() * h2, 3, 1.6, r() * 3, 0, 7); b.fill(); }
        if (w === 3) for (let k = 0; k < 60; k++) { b.fillStyle = 'rgba(255,255,255,.7)'; b.beginPath(); b.arc(r() * w2, r() * h2, 1 + r() * 1.5, 0, 7); b.fill(); }
        if (w === 4) { b.strokeStyle = 'rgba(40,45,60,.12)'; b.lineWidth = 1; for (let k = 0; k < 70; k++) { const x = r() * w2, y = r() * h2; b.beginPath(); b.moveTo(x, y); b.lineTo(x - 4, y + 14); b.stroke(); } }
      }), 0, 0, W, H);
    },
    draw(g, t) {
      const sk = SKINS[PK.skin()] || SKINS[0];
      g.save(); g.fillStyle = sk.ink; g.fillRect(-1.6, -1.6, 103.2, GH + 3.2); g.restore();
      PK.blit(g, PK.baked('st', drawStatic), 0, 0);
      g.save(); g.imageSmoothingEnabled = true; g.globalCompositeOperation = 'lighter'; g.globalAlpha = .3; const lc = lightCanvas(); g.drawImage(lc, 1, 1, COLS * 4, ROWS * 4, 0, 0, 100, GH); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(lc, 1, 1, COLS * 4, ROWS * 4, 0, 0, 100, GH); g.restore();
      if (lv.moon) { // moon beams + the drifting cloud
        g.save(); g.globalAlpha = .18; g.fillStyle = '#ffffff'; const m = curMap(); for (let c = 0; c < COLS; c++) if (m[idx(c, 0)] && !(c >= cloudP && c < cloudP + lv.cw)) g.fillRect(c * CS + 3, 0, CS - 6, GH); g.restore();
        const cx = (cloudX + lv.cw / 2) * CS; g.save(); g.fillStyle = 'rgba(70,75,95,.9)'; for (let k = 0; k < lv.cw * 2 + 1; k++) { g.beginPath(); g.arc(cx - lv.cw * CS / 2 + 4 + k * (lv.cw * CS - 8) / (lv.cw * 2), -1 + Math.sin(k * 1.7) * 1.5, 4.2 + (k % 2) * 1.6, 0, 7); g.fill(); } g.restore();
        text('☾', 96, 5, 5, { g, color: '#fffbe0', shadow: false });
      }
      for (const k of lv.cords) drawCord(g, k, t);
      for (const l of lv.lan) drawLantern(g, l, l.g === 0 || !!(mask >> (l.g - 1) & 1), t);
      if (lv.petal && !petalGot) { const [x, y] = cc(...lv.petal); g.save(); g.translate(x, y + Math.sin(t * 2) * .7); g.rotate(t * .6); g.fillStyle = '#ffb0c8'; for (let k = 0; k < 5; k++) { g.rotate(1.2566); g.beginPath(); g.ellipse(0, -2.2, 1.3, 2.2, 0, 0, 7); g.fill(); } g.fillStyle = '#e0a020'; g.beginPath(); g.arc(0, 0, .8, 0, 7); g.fill(); g.restore(); }
      if (winT < 0 || winT < .5) { const [x, y] = cc(...lv.goal); drawDumpling(g, x, y, t, winT >= 0 ? 1 - winT * 2 : 1); }
      // tail: dry-brush ink stroke with a striped tip
      const fade = mode === 'fail' ? Math.max(0, 1 - endT * 1.4) : 1;
      if (tail.length > 1) { inkStroke(g, tail, 7.5, sk.ink, .25 * fade); inkStroke(g, tail, 6, sk.ink, .9 * fade); g.save(); g.translate(.6, -.6); inkStroke(g, tail, 2.2, sk.wash, .7 * fade); g.restore();
        if (fade > 0) { const h = tail[tail.length - 1]; g.fillStyle = sk.ink; g.globalAlpha = fade; g.beginPath(); g.arc(h[0], h[1], HR, 0, 7); g.fill(); g.fillStyle = '#b89a78'; g.beginPath(); g.arc(h[0], h[1], HR * .55, 0, 7); g.fill(); g.globalAlpha = 1; } }
      if (failCell >= 0) { const [x, y] = cc(failCell % COLS, Math.floor(failCell / COLS)); g.strokeStyle = '#c8323a'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 6 + endT * 6, 0, 7); g.stroke(); }
      const b = base(), md = mode === 'fail' ? (endT > .5 ? 'sour' : 'shock') : mode === 'won' ? 'joy' : holding ? 'idle' : 'smug';
      drawTanuki(g, b[0], b[1] + 2, sk, md, t, winT > .8);
      if (winT > .8) { const a = M.clamp((winT - .8) * 3, 0, 1), s = 1 + (1 - a) * 1.5; g.save(); g.translate(86, GH - 12); g.rotate(-.15); g.scale(s, s); g.globalAlpha = a; g.fillStyle = sk.seal; rrect(g, -8, -8, 16, 16, 1.5); g.fill(); text('影', 0, .5, 10, { g, color: '#f3ead6', shadow: false, font: '"Hiragino Mincho ProN","Yu Mincho",serif' }); g.restore(); }
      const len = Math.round(M.polyLen(tail)); text(`tail ${len} / ★${lv.par}`, 99, GH + 11.5, 3.2, { g, align: 'right', color: len <= lv.par ? '#2a4a2a' : '#7a2a2a', shadow: false });
      if (lv.moon) text(holding || tail.length > 1 ? 'sky frozen' : 'clouds drifting…', 1, GH + 11.5, 3, { g, align: 'left', color: '#2a2a3a', shadow: false });
    },
    hint(g, step, t) {
      const sol = lv.sol; if (!sol) return; const P = sol.path.map((s) => s[0] === COLS * ROWS ? base() : cc(s[0] % COLS, Math.floor(s[0] / COLS)));
      if (lv.moon) { g.strokeStyle = '#c8323a'; g.lineWidth = 1; g.setLineDash([2, 2]); g.strokeRect(sol.p * CS + .5, .5, lv.cw * CS - 1, 9); g.setLineDash([]); text(cloudP === sol.p ? 'go now!' : 'wait for the cloud here', (sol.p + lv.cw / 2) * CS, 12, 3, { g, color: '#c8323a', shadow: false }); }
      const cord = sol.path.find((s) => lv.cords.some((k) => idx(k.c, k.r) === s[0])); if (cord) { const [x, y] = cc(cord[0] % COLS, Math.floor(cord[0] / COLS)); g.strokeStyle = '#c8323a'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 7 + Math.sin(t * 6), 0, 7); g.stroke(); }
      if (step >= 2) { g.save(); g.setLineDash([2.5, 2]); g.strokeStyle = 'rgba(200,50,58,.85)'; g.lineWidth = 1.3; g.beginPath(); P.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.restore(); }
      if (step >= 3) { const k = (t * 3) % P.length, a = P[Math.floor(k)], b = P[Math.min(P.length - 1, Math.floor(k) + 1)], f = k % 1; g.globalAlpha = .6; g.fillStyle = '#1d1d24'; g.beginPath(); g.arc(M.lerp(a[0], b[0], f), M.lerp(a[1], b[1], f), 3, 0, 7); g.fill(); g.globalAlpha = 1; }
    },
    qaFail() { const P = lv.sol.path.slice(1, Math.max(2, lv.sol.path.length >> 1)).map((s) => cc(s[0] % COLS, Math.floor(s[0] / COLS))); mode = 'drag'; cloudP = lv.sol.p; for (const p of P) moveHead(p[0], p[1], 999); if (mode === 'drag') { const ci = cells[cells.length - 1]; dissolve(ci === undefined ? idx(lv.sc, ROWS - 1) : ci); } },
    qa() {
      const P = lv.sol.path.map((s) => s[0] === COLS * ROWS ? base() : cc(s[0] % COLS, Math.floor(s[0] / COLS)));
      const acts = []; if (lv.moon && cloudP !== lv.sol.p) { // wait (really) for the cloud to drift into place
        let p = cloudP, dir = cloudDir, n = 0; const N = cloudN(lv); while (p !== lv.sol.p && n < 30) { if (p + dir < 0 || p + dir >= N) dir *= -1; p += dir; n++; }
        acts.push({ t: 'wait', ms: Math.round(((n - 1) * CLOUD_T + (CLOUD_T - cloudT)) * 1000 + 300) });
      }
      acts.push({ t: 'drag', pts: P, wait: 40, after: 600 }); return acts;
    },
    drawTitle(g, W, H, t, hb) {
      const s = Math.min(hb.w / 90, hb.h / 50), sk = SKINS[PK.skin()] || SKINS[0]; g.save(); g.translate(W / 2, hb.y + hb.h * .62); g.scale(s, s);
      const pts = []; for (let k = 0; k <= 50; k++) { const f = k / 50; pts.push([-8 + f * 44, 4 - Math.sin(f * 5 + t * 1.2) * 6 * f - f * 14]); }
      inkStroke(g, pts, 6, sk.ink, .9); drawDumpling(g, 38, -14, t, .9); drawTanuki(g, -14, 2, sk, 'smug', t, false); g.restore();
    },
    drawSkin(g, i, x, y, r) { const sk = SKINS[i]; g.save(); g.translate(x, y + r * .3); g.scale(r / 11, r / 11); drawTanuki(g, 0, 0, sk, 'happy', PK.t, false); g.restore(); },
  };
  PK.run(game);
})();
