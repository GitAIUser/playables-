/* Longsnack: a baby brachiosaur stretches its solid clay neck through a museum after hours to snack on exhibits.
   The neck is a body, not just a path: lying across a red plate holds a gate open. Motion-sensor beams flip every few
   steps your nose takes (time only moves when you move). Claymation look: thumbprint texture, 8 fps "boil", squash and stretch. */
'use strict';
(() => {
  const { M, fx, sfx, text, rrect, face } = PK;
  const COLS = 6, ROWS = 9, CS = 100 / COLS, HR = 4; // cell size, head radius (board units)
  const TOTAL = 120;
  const WORLDS = ['Dinosaur Hall', 'Art Wing', 'Space Gallery', 'Gem Vault', 'Museum Café', 'Gift Shop'];
  const SKINS = [
    { name: 'Mint', body: '#7fd39a', spot: '#4fae73', belly: '#d9f5c8' }, { name: 'Lavender', body: '#b79ae8', spot: '#8f6fd0', belly: '#efe4ff' },
    { name: 'Tangerine', body: '#ffa458', spot: '#e07a2a', belly: '#ffe2b8' }, { name: 'Sky', body: '#79c6f2', spot: '#4b98cc', belly: '#dff3ff' },
    { name: 'Rose', body: '#f59ab8', spot: '#d86a92', belly: '#ffe3ee' }, { name: 'Lemon', body: '#f2dc5a', spot: '#c9a92c', belly: '#fff7c8' },
    { name: 'Polka', body: '#ff7a6b', spot: '#fff1d6', belly: '#ffe0d6' }, { name: 'Midnight', body: '#4a5a8c', spot: '#ffd34d', belly: '#a8b6e6' },
  ];
  const SNACKS = ['cookie', 'cupcake', 'donut', 'pretzel', 'macaron', 'apple'];
  // handcrafted opening levels (row 0 = top). . free  # case  S start  T snack  g glue  c crumb  B plate  D gate  L beam(gate, toggles)
  const HAND = [
    ['......', '..T...', '......', '......', '......', '......', '......', '......', '..S...'],
    ['......', '....T.', '...##.', '..#...', '..#...', '...#..', '......', '##....', '..S...'],
    ['T.....', '##....', '..c...', '.##...', '.....#', '#..#..', '.g....', '....g.', '..S...'],
    ['..#..T', '..#...', '.g#.#.', '....#.', '.##...', '.c#.g.', '......', '.#..#.', '..S...'],
    ['...#T.', '.B.#D#', '...#..', '......', '.##...', '......', '..g...', '....#.', '..S...'],
    ['......', '.T....', '###D##', '......', '.#..B.', '.#....', '....#.', '..g...', '..S...'],
  ];
  let lv = null, neck = [], ticks = [], head = null, target = null, holding = false, mode = 'idle', T = 0, endT = 0, lumpT = -1, pressed = false, steps = 0, snap = null, mood = 'idle', moodT = 0, failKind = '', lastCell = -1;
  const cellOf = (x, y) => [Math.floor(x / CS), Math.floor(y / CS)];
  const idx = (c, r) => r * COLS + c;
  const cc = (c, r) => [(c + .5) * CS, (r + .5) * CS];

  // ---------- level generation ----------
  function parse(rows) {
    const L = { g: [], start: null, snack: null, crumb: null, btn: null, door: null, beams: [] };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = rows[r][c]; L.g.push(ch === '#' ? 1 : ch === 'g' ? 2 : 0);
      if (ch === 'S') L.start = [c, r]; if (ch === 'T') L.snack = [c, r]; if (ch === 'c') L.crumb = [c, r];
      if (ch === 'B') L.btn = [c, r]; if (ch === 'D') L.door = [c, r]; if (ch === 'L') L.beams.push({ c, r, per: 4, on: 2, ph: 0 });
    }
    return L;
  }
  const beamOn = (b, t) => ((t + b.ph) % b.per) < b.on;
  /** BFS over (cell, plate covered, tick mod 12). Returns a cell path or null. */
  function solve(L, from, to, btnInit) {
    const per = 12, key = (c, r, b, t) => ((idx(c, r) * 2 + b) * per) + t, seen = new Map();
    const q = [[from[0], from[1], btnInit ? 1 : 0, 0]]; seen.set(key(from[0], from[1], btnInit ? 1 : 0, 0), null);
    while (q.length) {
      const s = q.shift(), [c, r, b, t] = s;
      if (c === to[0] && r === to[1]) { const path = []; let k = key(c, r, b, t), cur = s; while (cur) { path.unshift([cur[0], cur[1]]); cur = seen.get(key(...cur)); } return { path, btn: b }; }
      for (const [dc, dr] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
        const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const v = L.g[idx(nc, nr)]; if (v) continue;
        if (L.door && nc === L.door[0] && nr === L.door[1] && !b) continue;
        const nt = (t + 1) % per; const beam = L.beams.find((x) => x.c === nc && x.r === nr); if (beam && beamOn(beam, nt)) continue;
        const nb = b || (L.btn && nc === L.btn[0] && nr === L.btn[1]) ? 1 : 0, k = key(nc, nr, nb, nt);
        if (seen.has(k)) continue; seen.set(k, s); q.push([nc, nr, nb, nt]);
      }
    }
    return null;
  }
  function fullSolve(L) {
    // with a plate: start -> plate, then plate -> snack (the neck keeps covering the plate)
    let path;
    if (L.btn) { const a = solve(L, L.start, L.btn, false); if (!a) return null; const b = solveFromTick(L, L.btn, L.snack, a.path.length - 1, true); if (!b) return null; path = a.path.concat(b.slice(1)); }
    else { const a = solve(L, L.start, L.snack, false); if (!a) return null; path = a.path; }
    return path;
  }
  function solveFromTick(L, from, to, t0, btn) { // BFS honoring beam phase offset t0
    const L2 = Object.assign({}, L, { beams: L.beams.map((b) => Object.assign({}, b, { ph: (b.ph + t0) % b.per })) });
    const s = solve(L2, from, to, btn); return s && s.path;
  }
  function gen(i, seed) {
    const r = M.rng(M.hash('longsnack', i, seed)); const d = i / TOTAL, w = Math.floor(i / 20);
    if (!seed && i < HAND.length) { const L = parse(HAND[i]); L.sol = fullSolve(L); return finish(L, r); }
    for (let a = 0; a < 400; a++) {
      const L = { g: new Array(COLS * ROWS).fill(0), start: [M.ri(r, 1, 4), ROWS - 1], snack: [M.ri(r, 0, 5), M.ri(r, 0, 1 + (d < .2 ? 1 : 0))], crumb: null, btn: null, door: null, beams: [] };
      const dens = .28 + d * .22 + r() * .08, glue = w >= 0 && i > 2 ? .06 + d * .1 : 0;
      for (let k = 0; k < L.g.length; k++) { const v = r(); L.g[k] = v < dens ? 1 : v < dens + glue ? 2 : 0; }
      L.g[idx(...L.start)] = 0; L.g[idx(...L.snack)] = 0; if (L.start[1] - 1 >= 0) L.g[idx(L.start[0], L.start[1] - 1)] = 0;
      const wantDoor = (w === 1 || w >= 4) ? r() < .85 : (w >= 2 ? r() < .45 : false);
      if (wantDoor) { // enclose the snack, leave one gate
        const [sc, sr] = L.snack, nb = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([x, y]) => [sc + x, sr + y]).filter(([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS);
        const gate = nb.filter(([x, y]) => y >= sr)[M.ri(r, 0, nb.filter(([x, y]) => y >= sr).length - 1)] || nb[0];
        for (const [x, y] of nb) L.g[idx(x, y)] = 1; L.g[idx(...gate)] = 0; L.door = gate;
        let tries = 0; do { L.btn = [M.ri(r, 0, 5), M.ri(r, 2, ROWS - 2)]; tries++; } while ((L.g[idx(...L.btn)] || (L.btn[0] === gate[0] && L.btn[1] === gate[1])) && tries < 30);
        L.g[idx(...L.btn)] = 0;
      }
      if (w >= 2) { const nbm = w === 2 ? 1 : M.ri(r, 1, 2); for (let k = 0; k < nbm; k++) { const c = M.ri(r, 0, 5), rr = M.ri(r, 1, ROWS - 2); if (!L.g[idx(c, rr)] && !(L.door && c === L.door[0] && rr === L.door[1])) L.beams.push({ c, r: rr, per: w === 2 ? 99 : M.pick(r, [3, 4, 4, 5]), on: w === 2 ? 99 : M.pick(r, [1, 2, 2]), ph: M.ri(r, 0, 4) }); } }
      const sol = fullSolve(L); if (!sol) continue;
      const minLen = 6 + Math.floor(d * 9), maxLen = 12 + Math.floor(d * 14);
      if (sol.length < minLen || sol.length > maxLen) continue;
      // must actually need the plate / beam timing when present
      if (L.door) { const Lb = Object.assign({}, L, { btn: null }); if (fullSolve(Lb)) continue; }
      if (L.beams.length && L.beams.some((b) => b.per < 99) && !sol.some(([c, rr], k) => L.beams.some((b) => b.c === c && b.r === rr))) { if (r() < .6) continue; }
      L.sol = sol; return finish(L, r);
    }
    const L = parse(HAND[i % HAND.length]); L.sol = fullSolve(L); return finish(L, r);
  }
  function finish(L, r) {
    // crumb: a free cell next to the route (a small detour); par length for the 3rd star
    const on = new Set(L.sol.map(([c, rr]) => idx(c, rr)));
    if (!L.crumb) {
      const cand = []; for (const [c, rr] of L.sol) for (const [x, y] of [[c + 1, rr], [c - 1, rr], [c, rr - 1], [c, rr + 1]]) if (x >= 0 && y >= 0 && x < COLS && y < ROWS - 1 && !L.g[idx(x, y)] && !on.has(idx(x, y)) && !(L.door && x === L.door[0] && y === L.door[1]) && !L.beams.some((b) => b.c === x && b.r === y)) cand.push([x, y]);
      if (cand.length) L.crumb = cand[Math.floor(r() * cand.length)];
    }
    L.par = Math.round((L.sol.length - 1) * CS * 1.25 + CS * 2.6);
    L.snackKind = SNACKS[Math.floor(r() * SNACKS.length)];
    L.deco = L.g.map((v, k) => Math.floor(r() * 6));
    return L;
  }

  // ---------- state ----------
  function reset() { neck = [base()]; ticks = [0]; head = base(); target = null; holding = false; mode = 'idle'; steps = 0; pressed = false; lumpT = -1; mood = 'idle'; lastCell = -1; }
  const base = () => { const [x, y] = cc(...lv.start); return [x, y + CS * .1]; };
  function blocked(x, y) {
    if (x < HR || y < HR || x > 100 - HR || y > ROWS * CS - HR + CS * .45) return true;
    const [c0, r0] = cellOf(x - HR, y - HR), [c1, r1] = cellOf(x + HR, y + HR);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const solid = lv.g[idx(c, r)] === 1 || (lv.door && c === lv.door[0] && r === lv.door[1] && !pressed);
      if (!solid) continue; const m = .9, rx = c * CS + m, ry = r * CS + m, nx = M.clamp(x, rx, rx + CS - 2 * m), ny = M.clamp(y, ry, ry + CS - 2 * m);
      if (Math.hypot(x - nx, y - ny) < HR) return true;
    }
    return false;
  }
  function plateCovered() {
    if (!lv.btn) return false; const x0 = lv.btn[0] * CS, y0 = lv.btn[1] * CS;
    for (let k = 3; k < neck.length; k++) { const p = neck[k]; if (p[0] > x0 + 2 && p[0] < x0 + CS - 2 && p[1] > y0 + 2 && p[1] < y0 + CS - 2) return true; }
    return false;
  }
  function doFail(kind, msg) {
    if (mode === 'fail') return; snap = { neck: neck.slice(0, Math.max(1, neck.length - 7)), ticks: ticks.slice(0, Math.max(1, neck.length - 7)) };
    mode = 'fail'; failKind = kind; mood = kind === 'beam' ? 'dizzy' : 'shock'; endT = 0; holding = false;
    if (kind === 'glue') { sfx.squish(); fx.word(head[0], head[1] - 8, 'SPLOT!', '#fff7c8', 7); }
    else if (kind === 'gate') { sfx.thud(.5); fx.word(head[0], head[1] - 8, 'BONK!', '#ffd34d', 8); }
    else { sfx.noise({ f: 3000, f2: 600, d: .3, v: .2 }); fx.puff(head[0], head[1], 12, 'rgba(60,60,60,.7)'); fx.word(head[0], head[1] - 8, 'ZAP!', '#ff6a6a', 8); }
    PK.fail(msg);
  }
  function moveHead(tx, ty, maxD) {
    let [x, y] = head; const dx = tx - x, dy = ty - y, dl = Math.hypot(dx, dy); if (dl < .01) return;
    const n = Math.ceil(Math.min(dl, maxD) / 1); const sx = dx / dl * Math.min(dl, maxD) / n, sy = dy / dl * Math.min(dl, maxD) / n;
    for (let k = 0; k < n; k++) {
      let nx = x + sx, ny = y + sy;
      if (blocked(nx, ny)) { if (!blocked(nx, y)) ny = y; else if (!blocked(x, ny)) nx = x; else break; }
      x = nx; y = ny; head = [x, y];
      const lp = neck[neck.length - 1]; if (Math.hypot(x - lp[0], y - lp[1]) >= 1.6) { neck.push([x, y]); ticks.push(steps); }
      const [c, r] = cellOf(x, y), ci = idx(c, r);
      if (ci !== lastCell) { if (lastCell >= 0) { steps++; sfx.tick(1 + (steps % 4) * .1); } lastCell = ci; }
      for (let k2 = 0; k2 < lv.g.length; k2++) if (lv.g[k2] === 2) { const [gx, gy] = cc(k2 % COLS, Math.floor(k2 / COLS)); if (Math.hypot(x - gx, y - gy) < HR + CS * .27) { doFail('glue', 'Stuck in the glue!'); return; } }
      for (const b of lv.beams) if (b.c === c && b.r === r && beamOn(b, steps)) { doFail('beam', 'Nose met the beam!'); return; }
      if (lv.crumb && !lv.crumbEaten) { const [kx, ky] = cc(...lv.crumb); if (Math.hypot(x - kx, y - ky) < HR + 3.5) { lv.crumbEaten = true; sfx.gulp(); fx.burst(kx, ky, 8, { col: '#c98a3a', speed: 20 }); mood = 'joy'; moodT = 0; } }
      const [sx2, sy2] = cc(...lv.snack); if (Math.hypot(x - sx2, y - sy2) < HR + 5) { winNow(); return; }
    }
  }
  function winNow() {
    mode = 'won'; holding = false; lumpT = 0; endT = 0; mood = 'joy'; sfx.gulp(); fx.burst(head[0], head[1], 14, { col: ['#e8b86b', '#fff', '#ff8fb0'], speed: 26 });
    const len = M.polyLen(neck); let st = 1; if (!lv.crumb || lv.crumbEaten) st++; if (len <= lv.par) st++; PK.win(st);
  }
  function retractStep(dt) { let d = 260 * dt; while (d > 0 && neck.length > 1) { const a = neck[neck.length - 1], b = neck[neck.length - 2], l = Math.hypot(a[0] - b[0], a[1] - b[1]); if (l <= d) { neck.pop(); ticks.pop(); d -= l; } else { a[0] += (b[0] - a[0]) * d / l; a[1] += (b[1] - a[1]) * d / l; d = 0; } } head = neck[neck.length - 1].slice(); }

  // ---------- drawing (claymation) ----------
  const clay = (g, fill, path, o = {}) => { g.fillStyle = fill; path(); g.fill(); g.save(); g.clip(); g.fillStyle = PK.pat('clay'); g.fill(); g.globalAlpha = .5; g.fillStyle = 'rgba(255,255,255,.22)'; g.translate(-1, -1.2); path(); g.fill(); g.restore(); g.lineWidth = o.lw || 1.1; g.strokeStyle = o.edge || 'rgba(40,20,10,.55)'; path(); g.stroke(); };
  function drawCase(g, c, r, kind, w) {
    const x = c * CS, y = r * CS, cx = x + CS / 2, cy = y + CS / 2;
    // pedestal
    clay(g, '#e9dcc4', () => { rrect(g, x + 2.2, cy + 1, CS - 4.4, CS / 2 - 2.6, 2.2); });
    const pal = [['#c96f4a', '#f2b27a'], ['#6d8cc9', '#a9c4ff'], ['#9a6bc4', '#d3b4ff'], ['#4bb6a6', '#a6f2e4'], ['#d9a23c', '#ffe08a'], ['#d8566c', '#ffb0bf']][(w + kind) % 6];
    const k = (kind + w * 2) % 6;
    if (k === 0) clay(g, pal[0], () => { g.beginPath(); g.moveTo(cx - 3, cy + 1.5); g.quadraticCurveTo(cx - 6.5, cy - 3, cx - 2.5, cy - 6.5); g.lineTo(cx + 2.5, cy - 6.5); g.quadraticCurveTo(cx + 6.5, cy - 3, cx + 3, cy + 1.5); g.closePath(); }); // vase
    else if (k === 1) clay(g, '#f4ecd8', () => { g.beginPath(); g.ellipse(cx, cy - 3, 6, 2.2, -.3, 0, 7); g.moveTo(cx + 6, cy - 6); g.arc(cx + 5, cy - 5.2, 2, 0, 7); g.moveTo(cx - 4, cy - .5); g.arc(cx - 5, cy - 1.2, 2, 0, 7); }); // bone
    else if (k === 2) { clay(g, pal[0], () => { g.beginPath(); g.arc(cx, cy - 3, 4.6, 0, 7); }); clay(g, pal[1], () => { g.beginPath(); g.ellipse(cx, cy - 3, 7.5, 1.6, -.25, 0, 7); }); } // planet
    else if (k === 3) clay(g, pal[1], () => { g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 5, cy - 3); g.lineTo(cx, cy + 1.5); g.lineTo(cx - 5, cy - 3); g.closePath(); }); // gem
    else if (k === 4) { clay(g, '#7b4a2a', () => { rrect(g, cx - 6, cy - 8.5, 12, 9, 1); }); clay(g, pal[1], () => { rrect(g, cx - 4.2, cy - 6.8, 8.4, 5.6, .6); }); } // painting
    else clay(g, pal[0], () => { g.beginPath(); g.arc(cx, cy - 3.5, 4.5, Math.PI, 0); g.lineTo(cx + 4.5, cy + 1); g.lineTo(cx - 4.5, cy + 1); g.closePath(); }); // bust/cake dome
    // glass dome glint
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = .8; g.beginPath(); g.arc(cx, cy - 2, 7.4, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  }
  function drawStatic(g, variant) {
    const w = Math.floor(PK.cur / 20) % 6, floorC = ['#d9c3a0', '#cdb8d6', '#9aa6c8', '#b6c9c2', '#e2c49e', '#d6b4bd'][w];
    g.fillStyle = floorC; g.fillRect(0, 0, 100, ROWS * CS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if ((r + c) % 2) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(c * CS, r * CS, CS, CS); } }
    g.fillStyle = PK.pat('clay'); g.fillRect(0, 0, 100, ROWS * CS);
    g.save(); g.translate(variant ? .35 : -.25, variant ? -.3 : .2);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const v = lv.g[idx(c, r)]; if (v === 1) drawCase(g, c, r, lv.deco[idx(c, r)], w); }
    g.restore();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (lv.g[idx(c, r)] === 2) {
      const [x, y] = cc(c, r); clay(g, '#f5f2e6', () => PK.blob(g, x + (variant ? .3 : 0), y, CS * .27, .18, idx(c, r), 14), { edge: 'rgba(120,110,90,.6)' });
      g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(x - 1.6, y - 1.4, 1, 0, 7); g.fill(); text('glue', x, y + .5, 2.6, { g, color: '#8a7a50', shadow: false, weight: 800 });
    }
  }
  function drawNeck(g, sk) {
    if (neck.length < 2) return; const pts = neck;
    const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(40,25,15,.6)'; g.lineWidth = 8.6; path(); g.stroke();
    g.strokeStyle = sk.body; g.lineWidth = 7; path(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2.2; g.save(); g.translate(-1, -1); path(); g.stroke(); g.restore();
    g.fillStyle = sk.spot; for (let k = 4; k < pts.length - 2; k += 6) { const p = pts[k]; g.beginPath(); g.arc(p[0] + ((k * 7) % 3 - 1) * .8, p[1] + ((k * 5) % 3 - 1) * .8, 1.1, 0, 7); g.fill(); }
    if (lumpT >= 0) { // the snack travelling down the neck
      const len = M.polyLen(pts), at = len * (1 - M.clamp(lumpT / .9, 0, 1)); let acc = 0;
      for (let k = 1; k < pts.length; k++) { const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); if (acc + l >= at) { const t = (at - acc) / (l || 1), x = M.lerp(pts[k - 1][0], pts[k][0], t), y = M.lerp(pts[k - 1][1], pts[k][1], t); g.fillStyle = sk.body; g.beginPath(); g.arc(x, y, 5.6, 0, 7); g.fill(); g.strokeStyle = 'rgba(40,25,15,.5)'; g.lineWidth = 1; g.stroke(); break; } acc += l; }
    }
  }
  function drawHeadAt(g, x, y, ang, sk, md, t) {
    g.save(); g.translate(x, y); g.rotate(ang);
    const sq = 1 + Math.sin(t * 9) * .03;
    clay(g, sk.body, () => { g.beginPath(); g.ellipse(1.2, 0, 6.4 * sq, 5 / sq, 0, 0, 7); });
    clay(g, sk.belly, () => { g.beginPath(); g.ellipse(4.2, 1.6, 2.6, 2, 0, 0, 7); });
    g.fillStyle = 'rgba(40,25,15,.6)'; g.beginPath(); g.arc(5.8, -.6, .45, 0, 7); g.arc(5.8, 1.3, .45, 0, 7); g.fill();
    g.restore();
    const up = Math.cos(ang) < 0; face(g, x - Math.sin(ang) * .3, y - 1.6, 4.6, md, t, { look: Math.cos(ang) > 0 ? 1 : -1 });
    if (md === 'dizzy') for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.1; PK.star(g, x + Math.cos(a) * 7, y - 7 + Math.sin(a) * 2, 1.4, '#ffd34d'); }
    if (failKind === 'glue' && mode === 'fail') { g.fillStyle = 'rgba(245,242,230,.85)'; PK.blob(g, x, y + 2, 5, .25, 3, 12); g.fill(); }
  }
  function drawBody(g, sk, t) {
    const [bx, by] = base(), bob = Math.sin(t * 2.2) * .6;
    clay(g, sk.body, () => { g.beginPath(); g.ellipse(bx + 9, by + 10 + bob, 15, 8.5, 0, 0, 7); });
    clay(g, sk.belly, () => { g.beginPath(); g.ellipse(bx + 8, by + 13 + bob, 9, 4, 0, 0, 7); });
    clay(g, sk.body, () => { g.beginPath(); g.moveTo(bx + 22, by + 9); g.quadraticCurveTo(bx + 34, by + 4, bx + 38, by + 12); g.quadraticCurveTo(bx + 30, by + 12, bx + 22, by + 15); g.closePath(); });
    g.fillStyle = sk.spot; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(bx + 2 + k * 4.5, by + 6 + bob + (k % 2) * 2.5, 1.4, 0, 7); g.fill(); }
    clay(g, sk.body, () => { g.beginPath(); g.ellipse(bx - .5, by + 3, 4.2, 6, 0, 0, 7); });
  }
  function drawSnack(g, kind, x, y, s, t) {
    g.save(); g.translate(x, y + Math.sin(t * 3) * .6); g.scale(s, s);
    if (kind === 'cupcake') { clay(g, '#f4a6c2', () => { g.beginPath(); g.arc(0, -1, 4.5, Math.PI, 0); g.closePath(); }); clay(g, '#e8c48a', () => { g.beginPath(); g.moveTo(-4, -1); g.lineTo(4, -1); g.lineTo(3, 4); g.lineTo(-3, 4); g.closePath(); }); g.fillStyle = '#e8384f'; g.beginPath(); g.arc(0, -5.6, 1.4, 0, 7); g.fill(); }
    else if (kind === 'donut') { clay(g, '#d9a066', () => { g.beginPath(); g.arc(0, 0, 5, 0, 7); g.arc(0, 0, 1.8, 0, 7, true); }); clay(g, '#ff8fc8', () => { g.beginPath(); g.arc(0, -.4, 4.2, 0, 7); g.arc(0, -.4, 2.2, 0, 7, true); }); }
    else if (kind === 'apple') { clay(g, '#e8463c', () => { g.beginPath(); g.arc(-1.6, 0, 3.6, 0, 7); g.arc(1.6, 0, 3.6, 0, 7); }); clay(g, '#5bb04a', () => { g.beginPath(); g.ellipse(1.6, -4.6, 1.8, .9, -.5, 0, 7); }); }
    else if (kind === 'macaron') { clay(g, '#9ee0c8', () => { rrect(g, -4.6, -3.8, 9.2, 3, 1.5); }); clay(g, '#fff1d0', () => { rrect(g, -4.2, -1, 8.4, 1.6, .8); }); clay(g, '#9ee0c8', () => { rrect(g, -4.6, .6, 9.2, 3, 1.5); }); }
    else if (kind === 'pretzel') { g.lineWidth = 2.2; g.strokeStyle = '#a0612a'; g.beginPath(); g.arc(-1.8, 0, 2.6, 0, 7); g.arc(1.8, 0, 2.6, 0, 7); g.stroke(); }
    else { clay(g, '#d6a25a', () => { g.beginPath(); g.arc(0, 0, 5, 0, 7); }); g.fillStyle = '#5a3418'; for (const [a, b] of [[-2, -1.5], [1.8, -.6], [-.4, 2], [2, 2.2]]) { g.beginPath(); g.arc(a, b, .8, 0, 7); g.fill(); } }
    g.restore();
  }
  const ROT = (a) => a;

  const game = {
    id: 'longsnack', title: 'Longsnack', tagline: 'Stretch a clay dino neck through the museum. Snack time!', total: TOTAL, worldSize: 20, worlds: WORLDS,
    accent: '#ffc76b', bg0: '#3a2a20', bg1: '#140c08', titleCol: '#ffe9c2', titleStroke: '#5a2e14', board: { w: 100, h: ROWS * CS + 14 }, lead: true, skins: SKINS,
    music: { root: 220, scale: [0, 2, 4, 7, 9, 12], bpm: 96, voice: 'pluck', density: .4 },
    clearLines: ['Crunch!', 'Burp. Pardon.', 'Snack secured!', 'Nom nom nom!', 'Neck-cellent!'],
    tutorial(i) {
      if (i === 0) return 'Drag the dino’s head to the snack. Let go to pull the neck back.';
      if (i === 2) return 'Don’t touch the glue! Grab the crumb for a ★, keep the neck short for ★★★';
      if (i === 4) return 'Lay the neck across the red plate. The gate stays open while you cover it';
      if (i === 40) return 'Nose beams: never touch a lit beam';
      if (i === 60) return 'Blinking beams flip every few steps your nose takes. Time only moves when you move';
      return null;
    },
    goal() { return (lv.crumb ? '★ crumb · ' : '★★ snack · ') + `★ neck ≤ ${Math.round(lv.par)}`; },
    load(i, seed) { lv = gen(i, seed); lv.crumbEaten = false; reset(); PK.unbake('ls'); },
    canRewind: () => !!snap && snap.neck.length > 1,
    rewind() { if (!snap) return false; neck = snap.neck.map((p) => p.slice()); ticks = snap.ticks.slice(); steps = ticks[ticks.length - 1] || 0; head = neck[neck.length - 1].slice(); const [c, r] = cellOf(...head); lastCell = idx(c, r); mode = 'idle'; mood = 'idle'; failKind = ''; pressed = plateCovered(); snap = null; return true; },
    cursorStart: () => head.slice(),
    down(x, y) { if (mode !== 'idle' && mode !== 'drag') return; holding = true; mode = 'drag'; target = [x, y]; },
    move(x, y) { if (holding) target = [x, y]; },
    up() { if (mode === 'drag') { holding = false; mode = 'retract'; sfx.boing(); } },
    cancel() { if (mode === 'drag') { holding = false; mode = 'retract'; } },
    step(dt) {
      T += dt; moodT += dt; if (moodT > 1.2 && mode === 'drag') mood = 'idle';
      if (mode === 'drag' && target) {
        // drag back along the recent neck = retract to that point
        const n = neck.length; if (n > 6 && Math.hypot(target[0] - head[0], target[1] - head[1]) > 6) { for (let k = Math.max(1, n - 26); k < n - 4; k++) if (Math.hypot(target[0] - neck[k][0], target[1] - neck[k][1]) < 4) { neck.length = k + 1; ticks.length = k + 1; head = neck[k].slice(); break; } }
        pressed = plateCovered();
        moveHead(target[0], target[1], 230 * dt);
        if (mode === 'drag') { pressed = plateCovered(); if (lv.door && !pressed) { const [dc, dr] = lv.door, x0 = dc * CS, y0 = dr * CS; if (neck.some((p) => p[0] > x0 + 1 && p[0] < x0 + CS - 1 && p[1] > y0 + 1 && p[1] < y0 + CS - 1)) doFail('gate', 'The gate came down. Bonk!'); } }
      }
      if (mode === 'retract') { retractStep(dt); pressed = plateCovered(); if (neck.length <= 1) { reset(); } }
      if (mode === 'won') { endT += dt; if (lumpT >= 0) lumpT += dt; if (lumpT > .9) { if (lumpT < 1) { fx.word(base()[0] + 6, base()[1] - 6, 'BURP!', '#fff', 9); fx.shake(2); sfx.boing(); fx.confetti(50, 40, 40); lumpT = 1.01; } retractStep(dt * .6); } }
      if (mode === 'fail') endT += dt;
    },
    drawBg(g, W, H) {
      g.drawImage(PK.screenBg('ls' + Math.floor(PK.cur / 20), (b, w, h) => {
        const gr = b.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6b4a3a'); gr.addColorStop(.6, '#3d2a22'); gr.addColorStop(1, '#22160f'); b.fillStyle = gr; b.fillRect(0, 0, w, h);
        b.fillStyle = 'rgba(255,220,170,.06)'; for (let x = 0; x < w; x += 46) b.fillRect(x, 0, 18, h * .7);
        b.fillStyle = '#2b1c14'; b.fillRect(0, h * .7, w, 6); b.fillStyle = PK.pat('clay'); b.fillRect(0, 0, w, h);
        const rg = b.createRadialGradient(w / 2, h * .45, 10, w / 2, h * .45, Math.max(w, h) * .7); rg.addColorStop(0, 'rgba(255,200,120,.18)'); rg.addColorStop(1, 'rgba(0,0,0,.45)'); b.fillStyle = rg; b.fillRect(0, 0, w, h);
      }), 0, 0, W, H);
    },
    draw(g, t) {
      const sk = SKINS[PK.skin()] || SKINS[0], boil = Math.floor(t * 8) % 2;
      g.save(); rrect(g, -1.5, -1.5, 103, ROWS * CS + 3, 3); g.fillStyle = '#2b1c14'; g.fill(); g.restore();
      PK.blit(g, PK.baked('ls' + boil, (b) => drawStatic(b, boil)), 0, 0);
      // plate + gate
      if (lv.btn) { const [x, y] = cc(...lv.btn); clay(g, pressed ? '#a83232' : '#e8463c', () => { g.beginPath(); g.ellipse(x, y + (pressed ? .6 : 0), 5.6, pressed ? 2.6 : 3.4, 0, 0, 7); }); }
      if (lv.door) {
        const x = lv.door[0] * CS, y = lv.door[1] * CS; g.fillStyle = '#b08a3a'; g.fillRect(x + 1, y + 1, 2.2, CS - 2); g.fillRect(x + CS - 3.2, y + 1, 2.2, CS - 2);
        const open = pressed ? 1 : 0; lv.gateY = M.approach(lv.gateY || 0, open, 10, 1 / 60);
        g.fillStyle = 'rgba(160,210,255,.45)'; g.fillRect(x + 3.2, y + 1 - lv.gateY * (CS - 3), CS - 6.4, CS - 2); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = .7; g.strokeRect(x + 3.2, y + 1 - lv.gateY * (CS - 3), CS - 6.4, CS - 2);
      }
      for (const b of lv.beams) {
        const [x, y] = cc(b.c, b.r), on = beamOn(b, steps); g.fillStyle = '#555'; g.fillRect(b.c * CS + .5, y - 2, 2, 4); g.fillRect(b.c * CS + CS - 2.5, y - 2, 2, 4);
        if (on) { g.strokeStyle = 'rgba(255,60,60,.35)'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(b.c * CS + 2, y); g.lineTo(b.c * CS + CS - 2, y); g.stroke(); g.strokeStyle = '#ff4a4a'; g.lineWidth = 1; g.stroke(); }
        else { g.strokeStyle = 'rgba(255,90,90,.35)'; g.setLineDash([1.5, 2]); g.lineWidth = .8; g.beginPath(); g.moveTo(b.c * CS + 2, y); g.lineTo(b.c * CS + CS - 2, y); g.stroke(); g.setLineDash([]); }
        if (b.per < 99) { let n = 1; while (n < b.per && beamOn(b, steps + n) === on) n++; text(`${on ? 'off' : 'ON'} in ${n}`, x, y - 4.6, 2.8, { g, color: on ? '#9cff9c' : '#ffb0b0', stroke: '#1a1010', sw: .8 }); }
      }
      if (lv.crumb && !lv.crumbEaten) { const [x, y] = cc(...lv.crumb); g.save(); g.translate(x, y); clay(g, '#d6a25a', () => PK.blob(g, 0, 0, 2.4, .2, 9, 9)); g.restore(); }
      const [sx, sy] = cc(...lv.snack); if (!(mode === 'won')) { g.fillStyle = 'rgba(255,240,180,.25)'; g.beginPath(); g.arc(sx, sy, 7.5 + Math.sin(t * 4), 0, 7); g.fill(); drawSnack(g, lv.snackKind, sx, sy, 1, t); }
      drawBody(g, sk, t); drawNeck(g, sk);
      const n = neck.length, h = neck[n - 1], pv = neck[Math.max(0, n - 4)]; let ang = n > 2 ? Math.atan2(h[1] - pv[1], h[0] - pv[0]) : -Math.PI / 2;
      const md = mode === 'fail' ? (failKind === 'beam' ? 'dizzy' : 'shock') : mode === 'won' ? 'joy' : (holding ? (mood === 'joy' ? 'joy' : 'idle') : 'smug');
      drawHeadAt(g, h[0], h[1], ang, sk, md, t);
      if (mode === 'fail' && failKind === 'beam') { g.fillStyle = 'rgba(30,30,30,.4)'; g.beginPath(); g.arc(h[0], h[1], 5.5, 0, 7); g.fill(); }
      // neck length meter
      const len = M.polyLen(neck); text(`neck ${Math.round(len)} / ${Math.round(lv.par)}`, 100 - 1, ROWS * CS + 6.5, 3.4, { g, align: 'right', color: len <= lv.par ? '#cfeeb0' : '#ffb0a0', weight: 700 });
      text(`steps ${steps}`, 1, ROWS * CS + 6.5, 3.4, { g, align: 'left', color: '#ffe9c2', weight: 700 });
    },
    hint(g, step, t) {
      const sol = lv.sol; if (!sol) return; const pts = sol.map(([c, r]) => cc(c, r));
      if (step >= 1) { const key = lv.btn ? cc(...lv.btn) : pts[Math.min(2, pts.length - 1)]; g.strokeStyle = '#fff36a'; g.lineWidth = 1.2; g.beginPath(); g.arc(key[0], key[1], 7 + Math.sin(t * 6) * 1.5, 0, 7); g.stroke(); }
      if (step >= 2) { g.save(); g.setLineDash([2.5, 2.5]); g.strokeStyle = 'rgba(255,250,170,.9)'; g.lineWidth = 1.4; g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.restore(); if (lv.beams.some((b) => b.per < 99)) text('tip: wiggle into a side cell to wait for a beam', 50, ROWS * CS + 11.5, 2.8, { g, color: '#fff36a' }); }
      if (step >= 3) { const k = (t * 3) % pts.length, a = pts[Math.floor(k)], b = pts[Math.min(pts.length - 1, Math.floor(k) + 1)], f = k % 1; g.globalAlpha = .7; drawHeadAt(g, M.lerp(a[0], b[0], f), M.lerp(a[1], b[1], f), -Math.PI / 2, SKINS[PK.skin()], 'happy', t); g.globalAlpha = 1; }
    },
    validate: () => !!lv.sol && lv.sol.length > 1, sig: () => [lv.g.join(''), lv.start, lv.snack, lv.crumb, lv.btn, lv.door, lv.beams],
    qaFail() { const pts = lv.sol.slice(0, Math.max(2, lv.sol.length >> 1)).map(([c, r]) => cc(c, r)); for (const q of pts) { const h = neck[neck.length - 1], d = Math.hypot(q[0] - h[0], q[1] - h[1]), n = Math.ceil(d / 1.5); for (let k = 1; k <= n; k++) { neck.push([h[0] + (q[0] - h[0]) * k / n, h[1] + (q[1] - h[1]) * k / n]); ticks.push(steps); } } head = neck[neck.length - 1].slice(); doFail('glue', 'Splot!'); },
    qa() { const pts = lv.sol.map(([c, r]) => cc(c, r)); return [{ t: 'drag', pts: [base()].concat(pts), wait: 70 }]; },
    drawTitle(g, W, H, t, hb) {
      const s = Math.min(hb.w / 70, hb.h / 85), x0 = W / 2 - 14 * s, y0 = hb.y + hb.h - 14 * s; g.save(); g.translate(x0, y0); g.scale(s, s); const sk = SKINS[PK.skin()];
      clay(g, sk.body, () => { g.beginPath(); g.ellipse(10, 6, 20, 11, 0, 0, 7); });
      g.lineCap = 'round'; const nx = 30 + Math.sin(t * 1.3) * 8, ny = -60 + Math.cos(t) * 4; g.strokeStyle = 'rgba(40,25,15,.6)'; g.lineWidth = 10.5; g.beginPath(); g.moveTo(-6, 0); g.bezierCurveTo(-20, -30, nx - 30, ny + 10, nx, ny); g.stroke(); g.strokeStyle = sk.body; g.lineWidth = 9; g.stroke();
      drawHeadAt(g, nx, ny, -.3, sk, 'happy', t); drawSnack(g, 'cookie', nx + 16, ny - 6, 1.1, t); g.restore();
    },
    drawSkin(g, i, x, y, r) { const sk = SKINS[i]; g.save(); g.translate(x, y); g.scale(r / 9, r / 9); drawHeadAt(g, 0, 0, -.2, sk, 'happy', PK.t); g.restore(); },
  };
  PK.run(game);
})();
