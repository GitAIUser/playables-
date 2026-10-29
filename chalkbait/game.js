/* Chalkbait: a hedgehog crosses the city at night along a fixed route. You can't build walls. Instead you DRAW chalk lures
   that pull the pests away: the fox follows bug trails, the crow chases shiny circles, the dog chases cat doodles.
   Press GO and everyone moves at once (deterministic tick sim). A distracted pest only bumps; an alert pest pounces if the
   hedgehog comes close. When a pest reaches the far end of its lure it eats/plays for 3 ticks, then looks up again.
   Rain later washes away chalk that isn't under an awning. Style: sidewalk chalk on night asphalt. */
'use strict';
(() => {
  const { M, fx, sfx, text, rrect, face } = PK;
  const TOTAL = 120, WS = 24, BW = 100, BH = 152, C = 7, R = 10, S = 13, OX = 4.5, OY = 3, TK = .38;
  const WORLDS = ['Fox Lane', 'Crow Corner', 'Dog Park', 'Drizzle District', 'Snack Street'];
  const cx = (x) => OX + x * S + S / 2, cy = (y) => OY + y * S + S / 2;
  const PT = {
    fox: { name: 'Fox', lure: 'bug trail', col: '#ffe27a', rad: 1, fly: false, body: '#e07a3a' },
    crow: { name: 'Crow', lure: 'shiny circle', col: '#9ad8ff', rad: 1, fly: true, body: '#3a3a52' },
    dog: { name: 'Dog', lure: 'cat doodle', col: '#ff9ac8', rad: 2, fly: false, body: '#a87a50' },
  };
  const TYPES = ['fox', 'crow', 'dog'];
  const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]], D8 = D4.concat([[1, -1], [1, 1], [-1, 1], [-1, -1]]);
  const SKINS = [
    { name: 'Bare spikes', hat: 0, a: '#8a6a4a', b: '#5a4030' }, { name: 'Beanie', hat: 1, a: '#8a6a4a', b: '#5a4030', h: '#e05a5a' },
    { name: 'Party hat', hat: 2, a: '#9a7a5a', b: '#6a4a30', h: '#7ad0ff' }, { name: 'Chef', hat: 3, a: '#8a6a4a', b: '#5a4030', h: '#ffffff' },
    { name: 'Top hat', hat: 4, a: '#7a5a3a', b: '#4a3020', h: '#2a2a34' }, { name: 'Frog hood', hat: 5, a: '#8a6a4a', b: '#5a4030', h: '#6ac06a' },
    { name: 'Crown', hat: 6, a: '#9a7a5a', b: '#6a4a30', h: '#ffd34d' }, { name: 'Albino', hat: 1, a: '#e8dccc', b: '#b8a898', h: '#7a9aff' },
    { name: 'Chalk-dust', hat: 2, a: '#c0c8d8', b: '#8a90a0', h: '#ff9ac8' },
  ];
  const key = (x, y) => y * C + x;
  // ---------- simulation ----------
  function bfs(lv, cells, fly) {
    const d = new Int16Array(C * R).fill(-1), q = [];
    for (const [x, y] of cells) { d[key(x, y)] = 0; q.push(x, y); }
    for (let h = 0; h < q.length; h += 2) { const x = q[h], y = q[h + 1], k = d[key(x, y)]; for (const [dx, dy] of fly ? D8 : D4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue; const kk = key(nx, ny); if (d[kk] >= 0 || (!fly && lv.wall[kk])) continue; d[kk] = k + 1; q.push(nx, ny); } }
    return d;
  }
  const near = (p, hx, hy) => { const T = PT[p.type]; return p.type === 'crow' ? Math.max(Math.abs(p.x - hx), Math.abs(p.y - hy)) <= T.rad : Math.abs(p.x - hx) + Math.abs(p.y - hy) <= T.rad; };
  function simulate(lv, strokes, preds) {
    preds = (preds || lv.preds).map((p) => ({ type: p.type, x: p.x, y: p.y, mode: 'alert', s: -1, si: 0, end: 0, sd: 1, eat: 0 }));
    const st = strokes.map((s) => ({ type: s.type, cells: s.cells, alive: true, cov: lv.rain >= 0 && s.cells.every(([x, y]) => lv.cover[key(x, y)]), maps: {} }));
    const map = (s, fly) => s.maps[fly] || (s.maps[fly] = bfs(lv, s.cells, fly));
    const frames = []; const L = lv.route.length; let washed = false;
    const retarget = (p) => { let best = -1, bd = 1e9; st.forEach((s, j) => { if (!s.alive || s.type !== p.type) return; const dd = map(s, PT[p.type].fly)[key(p.x, p.y)]; if (dd >= 0 && dd < bd) { bd = dd; best = j; } }); if (best >= 0) { p.mode = 'go'; p.s = best; } };
    const join = (p) => { const s = st[p.s], i = s.cells.findIndex(([x, y]) => x === p.x && y === p.y); if (i < 0) return false; p.mode = 'follow'; p.si = i; p.end = i <= s.cells.length - 1 - i ? s.cells.length - 1 : 0; p.sd = p.end > i ? 1 : -1; return true; };
    const snap = (t, hog) => frames.push({ hog, preds: preds.map((p) => [p.x, p.y, p.mode]), alive: st.map((s) => s.alive), washed });
    let hog = lv.route[0];
    for (const p of preds) { retarget(p); if (p.mode === 'go') join(p); }
    snap(0, hog);
    const check = (prevHog, prevP) => { for (let j = 0; j < preds.length; j++) { const p = preds[j]; if (p.x === hog[0] && p.y === hog[1]) return j; if (prevP && prevP[j][0] === hog[0] && prevP[j][1] === hog[1] && p.x === prevHog[0] && p.y === prevHog[1]) return j; if (p.mode === 'alert' && near(p, hog[0], hog[1])) return j; } return -1; };
    let c = check(null, null); if (c >= 0) return { ok: false, frames, failTick: 0, failPred: c };
    for (let t = 1; t < L; t++) {
      if (lv.rain >= 0 && t === lv.rain) { washed = true; st.forEach((s, j) => { if (s.alive && !s.cov) { s.alive = false; for (const p of preds) if (p.s === j && (p.mode === 'go' || p.mode === 'follow')) { p.mode = 'alert'; p.s = -1; } } }); }
      const prevHog = hog, prevP = preds.map((p) => [p.x, p.y]); hog = lv.route[t];
      for (const p of preds) {
        if (p.mode === 'alert') { retarget(p); if (p.mode === 'go' && join(p)) continue; }
        if (p.mode === 'go') { const m = map(st[p.s], PT[p.type].fly), cur = m[key(p.x, p.y)]; for (const [dx, dy] of PT[p.type].fly ? D8 : D4) { const nx = p.x + dx, ny = p.y + dy; if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue; if (m[key(nx, ny)] === cur - 1) { p.x = nx; p.y = ny; break; } } if (m[key(p.x, p.y)] === 0) join(p); }
        else if (p.mode === 'follow') { if (p.si === p.end) { p.mode = 'eat'; p.eat = 3; st[p.s].alive = false; } else { p.si += p.sd; [p.x, p.y] = st[p.s].cells[p.si]; } }
        else if (p.mode === 'eat') { p.eat--; if (p.eat <= 0) { p.mode = 'alert'; p.s = -1; retarget(p); } }
      }
      snap(t, hog);
      c = check(prevHog, prevP); if (c >= 0) return { ok: false, frames, failTick: t, failPred: c };
    }
    return { ok: true, frames, failTick: -1, failPred: -1 };
  }
  // ---------- generation ----------
  function makeRoute(r) {
    for (let tries = 0; tries < 60; tries++) {
      let x = M.ri(r, 0, C - 1), y = R - 1; const path = [[x, y]], seen = new Set([key(x, y)]);
      while (y > 0 && path.length < 26) {
        const opts = []; if (!seen.has(key(x, y - 1))) opts.push([0, -1], [0, -1]); for (const dx of [-1, 1]) { const nx = x + dx; if (nx >= 0 && nx < C && !seen.has(key(nx, y))) opts.push([dx, 0], [dx, 0], [dx, 0]); }
        if (!opts.length) break; const [dx, dy] = M.pick(r, opts); x += dx; y += dy; path.push([x, y]); seen.add(key(x, y));
      }
      if (y === 0 && path.length >= 12 && path.length <= 24) return path;
    }
    return null;
  }
  function gen(i, seed) {
    const w = Math.floor(i / WS), d = (i % WS) / (WS - 1), r = M.rng(M.hash(i, seed, 'chalk'));
    for (let tr = 0; tr < 500; tr++) {
      const strict = tr < 300, route = makeRoute(r); if (!route) continue;
      const onRoute = new Uint8Array(C * R); route.forEach(([x, y]) => { onRoute[key(x, y)] = 1; });
      const wall = new Uint8Array(C * R), cover = new Uint8Array(C * R), wp = .15 + d * .07 + w * .01;
      for (let k = 0; k < C * R; k++) if (!onRoute[k] && r() < wp) wall[k] = 1;
      let np = [1, 2, 2, 2, 3][w]; if (i % WS < 4) np = Math.max(1, np - 1); if (w === 2 && d > .6) np = 3;
      const types = []; for (let k = 0; k < np; k++) types.push(w === 0 ? TYPES[(Math.floor(i / 8) + k) % 3] : w === 1 ? (k === 0 ? 'crow' : M.pick(r, TYPES)) : w === 2 ? (k === 0 ? 'dog' : M.pick(r, TYPES)) : M.pick(r, TYPES));
      const lv = { route, wall, cover, onRoute, preds: [], rain: -1, snack: -1, ink: 0, par: np, sol: [] };
      if (w >= 3) { lv.rain = M.ri(r, Math.floor(route.length * .3), Math.floor(route.length * .55)); for (let k = 0; k < 7; k++) { const x = M.ri(r, 0, C - 1), y = M.ri(r, 0, R - 1); if (!wall[key(x, y)]) { cover[key(x, y)] = 1; if (x + 1 < C && !wall[key(x + 1, y)]) cover[key(x + 1, y)] = 1; } } }
      if (w === 4) lv.snack = M.ri(r, 4, route.length - 4);
      // predators near the route, not near the start
      let okP = true;
      for (const type of types) {
        const cand = []; for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) { const k = key(x, y); if (wall[k] || onRoute[k] || lv.preds.some((p) => p.x === x && p.y === y)) continue; const p = { type, x, y }; if (near(p, route[0][0], route[0][1]) || Math.abs(x - route[0][0]) + Math.abs(y - route[0][1]) <= PT[type].rad + 1) continue; if (!route.some(([hx, hy]) => near(p, hx, hy))) continue; cand.push(p); }
        if (!cand.length) { okP = false; break; } lv.preds.push(M.pick(r, cand));
      }
      if (!okP) continue;
      if (simulate(lv, []).ok) continue;
      // per-predator single-cell lures that work when it is alone
      const free = []; for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) { const k = key(x, y); if (wall[k] || (x === route[0][0] && y === route[0][1]) || (x === route[route.length - 1][0] && y === route[route.length - 1][1]) || lv.preds.some((p) => p.x === x && p.y === y)) continue; free.push([x, y]); }
      const goods = []; let bad = false;
      for (const p of lv.preds) { const gd = free.filter((c) => simulate(lv, [{ type: p.type, cells: [c] }], [p]).ok); const thr = strict ? .55 - d * .3 - w * .03 : 1; if (!gd.length || gd.length / free.length > thr) { bad = true; break; } goods.push(gd); }
      if (bad) continue;
      let sol = null;
      for (let k = 0; k < 80 && !sol; k++) { const pick = goods.map((g) => g[Math.floor(r() * g.length)]); if (new Set(pick.map(([x, y]) => key(x, y))).size < pick.length) continue; const strokes = pick.map((c, j) => ({ type: lv.preds[j].type, cells: [c] })); if (simulate(lv, strokes).ok) sol = strokes; }
      if (!sol) continue;
      lv.sol = sol; lv.ink = np + [4, 3, 2, 2, 2][w] - (d > .5 && w >= 2 ? 1 : 0); return lv;
    }
    // fallback: same index, other seed
    return gen(i, seed + 7919);
  }
  // ---------- state ----------
  let lv = null, strokes = [], sel = 'fox', phase = 'plan', res = null, animT = 0, drawing = null, endT = 0, T = 0, rewound = false, lvId = 0;
  const inkUsed = () => strokes.reduce((a, s) => a + s.cells.length, 0);
  const typesHere = () => TYPES.filter((t) => lv.preds.some((p) => p.type === t));
  const PAL_Y = 144, palX = (j) => 10 + j * 15, GO = { x: 89, y: 144, r: 7.5 };
  function reset() { strokes = []; phase = 'plan'; res = null; animT = 0; drawing = null; endT = 0; sel = typesHere()[0]; }
  function cellAt(x, y) { const gx = Math.floor((x - OX) / S), gy = Math.floor((y - OY) / S); return gx >= 0 && gy >= 0 && gx < C && gy < R ? [gx, gy] : null; }
  function placeable(x, y) { const k = key(x, y); if (lv.wall[k]) return false; const s0 = lv.route[0], g0 = lv.route[lv.route.length - 1]; if ((x === s0[0] && y === s0[1]) || (x === g0[0] && y === g0[1])) return false; if (lv.preds.some((p) => p.x === x && p.y === y)) return false; return !strokes.some((s) => s.cells.some(([a, b]) => a === x && b === y)); }
  function go() { if (phase !== 'plan') return; drawing = null; res = simulate(lv, strokes); phase = 'run'; animT = 0; sfx.click(); sfx.tone({ f: 440, f2: 660, d: .12, type: 'triangle', v: .1 }); }
  function finish() {
    if (res.ok) { phase = 'won'; endT = 0; let st = 1; if (PK.fails === 0 && !rewound) st++; if (inkUsed() <= lv.par) st++; sfx.win(); const g = lv.route[lv.route.length - 1]; fx.confetti(cx(g[0]), cy(g[1]), 30, ['#ffe27a', '#9ad8ff', '#ff9ac8', '#fff']); PK.win(st); }
    else { phase = 'fail'; endT = 0; const p = lv.preds[res.failPred], T2 = PT[p.type]; sfx.thud(.4); sfx.boing(); const h = res.frames[res.failTick].hog; fx.word(cx(h[0]), cy(h[1]) - 8, ['STRIKE!', 'Gutter ball!', 'Bowled over!'][res.failTick % 3], '#fff', 5); PK.fail(`The ${T2.name.toLowerCase()} wasn't distracted. ${T2.name}s want a ${T2.lure}.`); }
  }
  // ---------- drawing ----------
  function chalkLine(g, pts, col, w, seed) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col;
    for (let k = 0; k < 3; k++) { g.globalAlpha = .45; g.lineWidth = w * (1 - k * .25); g.beginPath(); pts.forEach(([x, y], j) => { const jx = Math.sin(seed * 9.1 + j * 3.7 + k * 5.3) * .6, jy = Math.cos(seed * 4.3 + j * 2.9 + k * 7.1) * .6; j ? g.lineTo(x + jx, y + jy) : g.moveTo(x + jx, y + jy); }); g.stroke(); }
    g.restore();
  }
  function lureIcon(g, type, x, y, s, t, a = 1) {
    g.save(); g.globalAlpha *= a; g.translate(x, y); g.scale(s, s); g.strokeStyle = PT[type].col; g.fillStyle = PT[type].col; g.lineWidth = .7; g.lineCap = 'round';
    if (type === 'fox') { for (const [bx, by] of [[-2, 1], [1.5, -1.5]]) { g.beginPath(); g.ellipse(bx, by, 1.4, .9, .6, 0, 7); g.stroke(); g.beginPath(); for (let l = -1; l <= 1; l++) { g.moveTo(bx + l * .7, by - .6); g.lineTo(bx + l * .9 - .4, by - 1.6); g.moveTo(bx + l * .7, by + .6); g.lineTo(bx + l * .9 + .4, by + 1.6); } g.stroke(); } }
    else if (type === 'crow') { g.beginPath(); g.arc(0, 0, 2.6, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 1.2, 0, 7); g.stroke(); const tw = (Math.sin(t * 5 + x) + 1) / 2; g.globalAlpha *= tw; g.beginPath(); g.moveTo(2.6, -3.2); g.lineTo(2.6, -1.4); g.moveTo(1.7, -2.3); g.lineTo(3.5, -2.3); g.stroke(); }
    else { g.beginPath(); g.arc(0, .4, 2.3, 0, 7); g.moveTo(-2, -.6); g.lineTo(-1.6, -2.8); g.lineTo(-.6, -1.8); g.moveTo(2, -.6); g.lineTo(1.6, -2.8); g.lineTo(.6, -1.8); g.stroke(); g.fillRect(-1, 0, .5, .5); g.fillRect(.6, 0, .5, .5); g.beginPath(); g.moveTo(-2.6, .9); g.lineTo(-4, .6); g.moveTo(2.6, .9); g.lineTo(4, .6); g.stroke(); }
    g.restore();
  }
  function hedgehog(g, x, y, s, t, o = {}) {
    const sk = o.sk || SKINS[PK.skin()] || SKINS[0];
    g.save(); g.translate(x, y); g.scale(s * (o.dir || 1), s);
    if (o.curl) { g.rotate(o.spin || 0); g.fillStyle = sk.b; g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, rr = k % 2 ? 3 : 4.4; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); g.fillStyle = sk.a; g.beginPath(); g.arc(0, 0, 2.8, 0, 7); g.fill(); g.fillStyle = '#f0d8b8'; g.beginPath(); g.arc(.8, .6, 1.2, 0, 7); g.fill(); g.restore(); return; }
    const bob = o.walk ? Math.abs(Math.sin(t * 14)) * .5 : 0; g.translate(0, -bob);
    g.fillStyle = sk.b; g.beginPath(); g.moveTo(-4.4, 1.4); for (let k = 0; k <= 8; k++) { const a = Math.PI + k / 8 * Math.PI * .9, rr = k % 2 ? 3.4 : 4.8; g.lineTo(-.6 + Math.cos(a) * rr, 1 + Math.sin(a) * rr * .9); } g.lineTo(2.4, 1.4); g.fill();
    g.fillStyle = sk.a; g.beginPath(); g.ellipse(-.6, .6, 3.4, 2.4, 0, 0, 7); g.fill();
    g.fillStyle = '#f0d8b8'; g.beginPath(); g.ellipse(2.4, .9, 2.2, 1.6, -.2, 0, 7); g.fill(); g.fillStyle = '#2a1a1a'; g.beginPath(); g.arc(4.5, .4, .55, 0, 7); g.fill();
    g.fillStyle = '#4a3020'; const lg = o.walk ? Math.sin(t * 14) * .8 : 0; g.fillRect(-2 + lg, 2.6, .9, 1.2); g.fillRect(1 - lg, 2.6, .9, 1.2);
    g.restore();
    face(g, x + 2.4 * s * (o.dir || 1), y + .3 * s - bob * s, 1.6 * s, o.mood || 'idle', t, { eyeWhite: false, ink: '#1a1010' });
    if (sk.hat) { g.save(); g.translate(x - .6 * s * (o.dir || 1), y - 3.2 * s - bob * s); g.scale(s, s); g.fillStyle = sk.h; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = .3;
      if (sk.hat === 1) { g.beginPath(); g.arc(0, 0, 2.4, Math.PI, 0); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -2.6, .8, 0, 7); g.fill(); }
      else if (sk.hat === 2) { g.beginPath(); g.moveTo(-1.6, 0); g.lineTo(0, -4.4); g.lineTo(1.6, 0); g.fill(); g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(0, -4.4, .6, 0, 7); g.fill(); }
      else if (sk.hat === 3) { g.fillRect(-1.4, -2.2, 2.8, 2.2); g.beginPath(); g.arc(-1, -2.6, 1.2, 0, 7); g.arc(1, -2.6, 1.2, 0, 7); g.arc(0, -3.2, 1.3, 0, 7); g.fill(); }
      else if (sk.hat === 4) { g.fillRect(-2.4, -.5, 4.8, .8); g.fillRect(-1.5, -3.8, 3, 3.4); g.fillStyle = '#c84a3a'; g.fillRect(-1.5, -1.3, 3, .6); }
      else if (sk.hat === 5) { g.beginPath(); g.arc(0, .2, 2.8, Math.PI, 0); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(-1.2, -2.4, .9, 0, 7); g.arc(1.2, -2.4, .9, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(-1.2, -2.4, .4, 0, 7); g.arc(1.2, -2.4, .4, 0, 7); g.fill(); }
      else if (sk.hat === 6) { g.beginPath(); g.moveTo(-2, 0); g.lineTo(-2, -2.6); g.lineTo(-1, -1.4); g.lineTo(0, -3); g.lineTo(1, -1.4); g.lineTo(2, -2.6); g.lineTo(2, 0); g.fill(); }
      g.restore(); }
  }
  function pest(g, type, x, y, s, t, mode, look) {
    const T2 = PT[type]; g.save(); g.translate(x, y); g.scale(s * (look || 1), s); g.lineJoin = 'round';
    const busy = mode === 'eat', bob = mode === 'go' || mode === 'follow' ? Math.abs(Math.sin(t * 12)) * .6 : 0; g.translate(0, -bob);
    if (type === 'fox') {
      g.fillStyle = T2.body; g.beginPath(); g.ellipse(-.5, 1, 3.6, 2.1, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(-3.6, .4); g.quadraticCurveTo(-7, -1 + Math.sin(t * 4) * .8, -6, 2.4); g.quadraticCurveTo(-5, 1.8, -3.6, 1.6); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(-6.2, 1.6, .9, 0, 7); g.fill();
      g.fillStyle = T2.body; g.beginPath(); g.moveTo(1.4, -2.4); g.lineTo(5.6, -.4); g.lineTo(2.4, 1.6); g.lineTo(.6, .2); g.fill(); g.beginPath(); g.moveTo(1.4, -2.2); g.lineTo(1.8, -4.4); g.lineTo(3, -2); g.fill(); g.fillStyle = '#1a1010'; g.beginPath(); g.arc(5.6, -.4, .5, 0, 7); g.fill();
      g.fillStyle = '#3a2010'; g.fillRect(-2.6, 2.6, .8, 1.3); g.fillRect(1, 2.6, .8, 1.3);
    } else if (type === 'crow') {
      const fl = mode === 'go' ? Math.sin(t * 20) * 2 : 0; g.fillStyle = 'rgba(200,215,240,.55)'; g.beginPath(); g.ellipse(0, .2, 4, 3, -.2, 0, 7); g.arc(2.6, -1.2, 2.3, 0, 7); g.fill(); g.fillStyle = T2.body; g.beginPath(); g.ellipse(0, .6, 3.2, 2.2, -.2, 0, 7); g.fill(); g.beginPath(); g.moveTo(-1, -.2); g.lineTo(-3.4, -2.6 - fl); g.lineTo(1, -.8); g.fill(); g.beginPath(); g.moveTo(-2.8, .6); g.lineTo(-5.2, 0); g.lineTo(-5, 1.6); g.fill();
      g.beginPath(); g.arc(2.6, -1.2, 1.7, 0, 7); g.fill(); g.fillStyle = '#e0b040'; g.beginPath(); g.moveTo(4, -1.6); g.lineTo(5.8, -1); g.lineTo(4, -.5); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(3, -1.6, .55, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(3.1, -1.6, .3, 0, 7); g.fill();
      g.strokeStyle = '#e0b040'; g.lineWidth = .4; g.beginPath(); g.moveTo(-.4, 2.6); g.lineTo(-.6, 3.8); g.moveTo(.8, 2.6); g.lineTo(.8, 3.8); g.stroke();
    } else {
      g.fillStyle = T2.body; rrect(g, -4, -1, 7, 3.6, 1.6); g.fill(); g.fillRect(-3.4, 2.2, 1, 1.6); g.fillRect(1.6, 2.2, 1, 1.6); g.strokeStyle = T2.body; g.lineWidth = .8; g.lineCap = 'round'; g.beginPath(); g.moveTo(-4, 0); g.lineTo(-5.4, -1.6 + Math.sin(t * (mode === 'alert' ? 3 : 14)) * .8); g.stroke();
      g.beginPath(); g.arc(3.6, -1.6, 2.2, 0, 7); g.fill(); g.fillStyle = '#6a4a30'; g.beginPath(); g.ellipse(2.4, -1.4, .9, 1.8, .3, 0, 7); g.fill(); g.fillStyle = '#1a1010'; g.beginPath(); g.arc(5.7, -1.3, .5, 0, 7); g.fill();
    }
    g.restore();
    const fxp = type === 'fox' ? 3.6 : type === 'crow' ? 2.6 : 4; if (type !== 'crow') face(g, x + fxp * s * (look || 1), y - (type === 'dog' ? 1.8 : .6) * s - bob * s, 1.5 * s, busy ? 'happy' : mode === 'alert' ? 'angry' : 'idle', t, { eyeWhite: false, ink: '#1a1010' });
    if (busy) text('♪', x + 3 * s, y - 6 * s - Math.sin(t * 6) * s, 3.4 * s, { g, color: '#fff', shadow: false });
  }
  function boardLayer() {
    return PK.baked('cb' + lvId, (g) => {
      g.fillStyle = '#2c2f36'; rrect(g, 0, 0, BW, BH, 3); g.fill();
      g.save(); rrect(g, 0, 0, BW, BH, 3); g.clip(); g.fillStyle = PK.pat('speck'); g.fillRect(0, 0, BW, BH); g.fillStyle = PK.pat('grain'); g.fillRect(0, 0, BW, BH);
      // sidewalk slab joints
      g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = .4; for (let x = 0; x <= C; x++) { g.beginPath(); g.moveTo(OX + x * S, OY); g.lineTo(OX + x * S, OY + R * S); g.stroke(); } for (let y = 0; y <= R; y++) { g.beginPath(); g.moveTo(OX, OY + y * S); g.lineTo(OX + C * S, OY + y * S); g.stroke(); }
      // streetlamp pools (baked gradients)
      const rr = M.rng(lvId * 31 + 7); for (let k = 0; k < 3; k++) { const x = 10 + rr() * 80, y = 10 + rr() * 110, gr = g.createRadialGradient(x, y, 0, x, y, 30); gr.addColorStop(0, 'rgba(255,220,140,.16)'); gr.addColorStop(1, 'rgba(255,220,140,0)'); g.fillStyle = gr; g.fillRect(x - 30, y - 30, 60, 60); }
      // awnings
      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (lv.cover[key(x, y)]) { const X = OX + x * S, Y = OY + y * S; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(X, Y, S, S); for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#e8e0d0' : '#c84a5a'; g.fillRect(X + k * S / 4, Y, S / 4, 2.6); } g.fillStyle = 'rgba(255,255,255,.5)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(X + k * S / 4 + S / 8, Y + 2.6, S / 8, 0, Math.PI); g.fill(); } }
      // walls: buildings and hedges
      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (lv.wall[key(x, y)]) { const X = OX + x * S, Y = OY + y * S, hedge = (x * 7 + y * 3 + lvId) % 3 === 0;
        if (hedge) { g.fillStyle = '#2f5a3a'; rrect(g, X + .5, Y + .5, S - 1, S - 1, 3); g.fill(); g.fillStyle = '#3f7a4a'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(X + 2.5 + (k % 3) * 4, Y + 3 + Math.floor(k / 3) * 6, 2.4, 0, 7); g.fill(); } }
        else { g.fillStyle = '#4a3a44'; g.fillRect(X + .3, Y + .3, S - .6, S - .6); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = .3; for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(X, Y + k * S / 5); g.lineTo(X + S, Y + k * S / 5); g.stroke(); } for (let k = 0; k < 4; k++) { const lit = (x * 13 + y * 7 + k) % 3 === 0; g.fillStyle = lit ? '#ffd880' : '#1e1a24'; g.fillRect(X + 2 + (k % 2) * 5.4, Y + 2.2 + Math.floor(k / 2) * 5, 3.2, 3); } }
      }
      // route in chalk: dotted footprints
      const rt = lv.route; g.save(); g.setLineDash([1.2, 1.6]); chalkLine(g, rt.map(([x, y]) => [cx(x), cy(y)]), 'rgba(255,255,255,.5)', .8, 3); g.restore();
      for (let k = 1; k < rt.length - 1; k += 2) { const [x, y] = rt[k], [nx, ny] = rt[k + 1], a = Math.atan2(ny - y, nx - x); g.save(); g.translate(cx(x), cy(y)); g.rotate(a); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = .6; g.beginPath(); g.moveTo(-1, -1.4); g.lineTo(1, 0); g.lineTo(-1, 1.4); g.stroke(); g.restore(); }
      // burrow home at goal (teacup)
      const [gx, gy] = rt[rt.length - 1]; g.save(); g.translate(cx(gx), cy(gy)); g.strokeStyle = '#fff'; g.globalAlpha = .8; g.lineWidth = .8; g.beginPath(); g.moveTo(-4.4, -1); g.lineTo(-3.4, 3.4); g.lineTo(3.4, 3.4); g.lineTo(4.4, -1); g.closePath(); g.stroke(); g.beginPath(); g.arc(5.4, .8, 1.6, -1.4, 1.4); g.stroke(); g.beginPath(); g.ellipse(0, 4.2, 5.6, 1, 0, 0, 7); g.stroke(); g.restore();
      text('HOME', cx(gx), cy(gy) - 5, 2.2, { g, color: 'rgba(255,255,255,.8)', shadow: false, font: PK.COMIC });
      if (lv.snack >= 0) { const [sx, sy] = rt[lv.snack]; g.fillStyle = '#e0a050'; g.beginPath(); g.arc(cx(sx) + 3, cy(sy) - 3, 1.8, 0, 7); g.fill(); g.fillStyle = '#6a3a1a'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx(sx) + 2.4 + k * .6, cy(sy) - 3.6 + (k % 2) * .9, .35, 0, 7); g.fill(); } }
      g.restore(); g.strokeStyle = '#121418'; g.lineWidth = 1; rrect(g, 0, 0, BW, BH, 3); g.stroke();
    });
  }
  function frameAt() {
    const fr = res.frames, f = animT / TK, k = Math.min(fr.length - 1, Math.floor(f)), k2 = Math.min(fr.length - 1, k + 1), u = M.easeInOut(M.clamp(f - k, 0, 1));
    return { a: fr[k], b: fr[k2], u, k };
  }
  const game = {
    id: 'chalkbait', title: 'Chalkbait', tagline: 'Draw chalk distractions. Get the hedgehog home.', total: TOTAL, worldSize: WS, worlds: WORLDS,
    accent: '#ffe27a', bg0: '#3a3f4a', bg1: '#1e2128', titleCol: '#fff8e0', titleStroke: '#2c2f36', titleFont: PK.COMIC, board: { w: BW, h: BH }, lead: true, skins: SKINS,
    music: { root: 196, scale: [0, 3, 5, 7, 10, 12], bpm: 84, voice: 'pluck', density: .35 },
    clearLines: ['Home and cozy!', 'Teacup nap earned.', 'Sneaky chalk!', 'Pests out-doodled.', 'Purr-fect lure!'],
    tutorial(i) {
      if (i === 0) return 'Foxes love bugs: drag a yellow bug trail away from the route, then GO';
      if (i === 8) return 'Crows chase shiny circles. Lead them off the path';
      if (i === 16) return 'Dogs chase cat doodles and spot you from 2 squares away';
      if (i === WS) return 'Each pest only wants its own lure. Pick the chalk colour first';
      if (i === WS * 2 + 3) return 'Ink is short. Every chalk square counts';
      if (i === WS * 3) return 'Rain washes chalk away, except under the striped awnings';
      if (i === WS * 4) return 'The hedgehog grabs a dropped cookie on the way. Keep it safe!';
      if (i === 2) return 'A pest finishes its lure, then looks around again. Lead it far away';
      return null;
    },
    goal() { return `★★ no mishaps · ★ ink ≤ ${lv.par}`; },
    load(i, seed) { lv = gen(i, seed); lvId++; PK.unbake('cb' + (lvId - 1)); reset(); rewound = false; },
    validate: () => !!(lv && lv.sol.length === lv.preds.length && simulate(lv, lv.sol).ok && !simulate(lv, []).ok && lv.sol.reduce((a, s) => a + s.cells.length, 0) <= lv.ink),
    sig: () => [lv.route, lv.preds, Array.from(lv.wall), lv.rain],
    canRewind: () => phase === 'fail',
    rewind() { phase = 'plan'; res = null; animT = 0; rewound = true; return true; },
    cursorStart: () => [GO.x, GO.y],
    down(x, y) {
      if (Math.hypot(x - GO.x, y - GO.y) < GO.r + 1.5) { go(); return; }
      if (phase !== 'plan') return;
      const ts = typesHere(); for (let j = 0; j < ts.length; j++) if (Math.hypot(x - palX(j), y - PAL_Y) < 7) { sel = ts[j]; sfx.tick(1.2); return; }
      const c = cellAt(x, y); if (!c) return;
      const si = strokes.findIndex((s) => s.cells.some(([a, b]) => a === c[0] && b === c[1])); if (si >= 0) { strokes.splice(si, 1); sfx.whoosh(.08); return; }
      if (!placeable(c[0], c[1])) { sfx.tick(.5); return; }
      if (inkUsed() >= lv.ink) { PK.toast('Out of chalk! Tap a doodle to erase it'); return; }
      drawing = { type: sel, cells: [c] }; strokes.push(drawing); sfx.tone({ f: 1800, f2: 1400, d: .05, type: 'sawtooth', v: .03, lp: 2500 });
    },
    move(x, y) {
      if (!drawing || phase !== 'plan') return; const c = cellAt(x, y); if (!c) return; const last = drawing.cells[drawing.cells.length - 1];
      if (c[0] === last[0] && c[1] === last[1]) return; if (Math.abs(c[0] - last[0]) + Math.abs(c[1] - last[1]) !== 1) return;
      if (drawing.cells.length > 1) { const pr = drawing.cells[drawing.cells.length - 2]; if (pr[0] === c[0] && pr[1] === c[1]) { drawing.cells.pop(); return; } }
      if (!placeable(c[0], c[1]) || inkUsed() >= lv.ink) return; drawing.cells.push(c); sfx.tone({ f: 1600 + drawing.cells.length * 40, f2: 1300, d: .05, type: 'sawtooth', v: .03, lp: 2500 });
    },
    up() { drawing = null; }, cancel() { drawing = null; },
    key(k) {
      if (phase !== 'plan') return false; const ts = typesHere();
      if (k >= '1' && k <= '3' && ts[+k - 1]) { sel = ts[+k - 1]; sfx.tick(); return true; }
      if (k === 'g' || k === 'G' || k === 'Enter') { go(); return true; }
      if (k === 'Backspace' || k === 'z' || k === 'Z') { if (strokes.length) { strokes.pop(); sfx.whoosh(.08); } return true; }
      return false;
    },
    step(dt) {
      T += dt; if (phase === 'won' || phase === 'fail') endT += dt;
      if (phase === 'run') {
        const before = Math.floor(animT / TK); animT += dt; const now = Math.floor(animT / TK);
        if (now !== before) { sfx.tick(.8); const fr = res.frames[Math.min(now, res.frames.length - 1)]; if (fr && fr.washed && !res.frames[Math.max(0, now - 1)].washed) sfx.whoosh(.2); if (lv.snack >= 0 && now === lv.snack) { sfx.gulp(); const [sx, sy] = lv.route[lv.snack]; fx.word(cx(sx), cy(sy) - 6, 'nom!', '#ffe27a', 3.4); } }
        const endTick = res.ok ? res.frames.length - 1 : res.failTick; if (animT >= endTick * TK + (res.ok ? .2 : .1)) finish();
      }
    },
    drawBg(g, W, H) { g.drawImage(PK.screenBg('cb', (b, w, h) => { b.fillStyle = '#23262d'; b.fillRect(0, 0, w, h); b.fillStyle = PK.pat('speck'); b.fillRect(0, 0, w, h); b.fillStyle = PK.pat('grain'); b.fillRect(0, 0, w, h); const gr = b.createRadialGradient(w / 2, h * .3, 0, w / 2, h * .3, Math.max(w, h) * .7); gr.addColorStop(0, 'rgba(255,220,150,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.3)'); b.fillStyle = gr; b.fillRect(0, 0, w, h); }), 0, 0, W, H); },
    draw(g, t) {
      PK.blit(g, boardLayer(), 0, 0);
      const fr = res ? frameAt() : null, washedNow = fr && fr.a.washed;
      // chalk strokes
      strokes.forEach((s, j) => {
        let a = 1; if (fr) { const al = fr.a.alive[j]; if (!al) a = washedNow && !s.cells.every(([x, y]) => lv.cover[key(x, y)]) ? .12 : .3; }
        g.save(); g.globalAlpha = a; chalkLine(g, s.cells.map(([x, y]) => [cx(x), cy(y)]), PT[s.type].col, s.cells.length > 1 ? 3 : 1.6, j + 1);
        s.cells.forEach(([x, y], k) => lureIcon(g, s.type, cx(x), cy(y), 1, t + k)); g.restore();
      });
      // pests
      lv.preds.forEach((p, j) => {
        let x = cx(p.x), y = cy(p.y), mode = 'alert', look = 1;
        if (fr) { const A = fr.a.preds[j], Bp = fr.b.preds[j]; x = M.lerp(cx(A[0]), cx(Bp[0]), fr.u); y = M.lerp(cy(A[1]), cy(Bp[1]), fr.u); mode = Bp[2]; if (Bp[0] !== A[0]) look = Bp[0] > A[0] ? 1 : -1; }
        if (phase === 'plan' || (mode === 'alert' && phase !== 'won')) { g.strokeStyle = 'rgba(255,90,90,.28)'; g.lineWidth = .6; g.setLineDash([1, 1]); const rr2 = PT[p.type].rad; if (p.type === 'crow') g.strokeRect(x - S * 1.5, y - S * 1.5, S * 3, S * 3); else { g.beginPath(); g.moveTo(x, y - S * (rr2 + .5)); g.lineTo(x + S * (rr2 + .5), y); g.lineTo(x, y + S * (rr2 + .5)); g.lineTo(x - S * (rr2 + .5), y); g.closePath(); g.stroke(); } g.setLineDash([]); }
        g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, y + 4, 4, 1.2, 0, 0, 7); g.fill();
        pest(g, p.type, x, y, 1.25, t + j, mode, look);
        if (phase === 'fail' && res.failPred === j) text('!', x, y - 8, 5, { g, color: '#ff5a5a', stroke: '#000', sw: .6 });
      });
      // hedgehog
      const rt = lv.route;
      if (!res) hedgehog(g, cx(rt[0][0]), cy(rt[0][1]), 1.15, t, { mood: 'idle' });
      else if (phase === 'fail') { const h = res.frames[res.failTick].hog, p = lv.preds[res.failPred], fp = res.frames[res.failTick].preds[res.failPred]; const dx = Math.sign(h[0] - fp[0]) || 1, dy = Math.sign(h[1] - fp[1]); const e = Math.min(endT, 1.4); const x = cx(h[0]) + dx * e * 40, y = cy(h[1]) + dy * e * 20; hedgehog(g, x, y, 1, t, { curl: true, spin: e * 14 * dx });
        for (let k = 0; k < 3; k++) { const px = cx(h[0]) + dx * (36 + k * 3), py = cy(h[1]) + dy * 18 - 4 + k * 3, hit = e > .8; g.save(); g.translate(px, py); g.rotate(hit ? dx * (1.2 + k * .3) : 0); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, -2, 1, 2.6, 0, 0, 7); g.fill(); g.fillStyle = '#e04a4a'; g.fillRect(-.9, -3, 1.8, .5); g.restore(); }
        if (p) {} }
      else if (phase === 'won') { const [gx, gy] = rt[rt.length - 1]; hedgehog(g, cx(gx), cy(gy) - .5, 1, t, { mood: 'sleep' }); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.moveTo(cx(gx) - 4.4, cy(gy) + .5); g.lineTo(cx(gx) - 3.4, cy(gy) + 3.4); g.lineTo(cx(gx) + 3.4, cy(gy) + 3.4); g.lineTo(cx(gx) + 4.4, cy(gy) + .5); g.fill(); for (let k = 0; k < 3; k++) text('z', cx(gx) + 4 + k * 2, cy(gy) - 6 - k * 2.5 - (t * 3 % 2), 2.4 + k * .6, { g, color: '#fff', shadow: false, alpha: .8 }); }
      else { const A = fr.a.hog, Bh = fr.b.hog; hedgehog(g, M.lerp(cx(A[0]), cx(Bh[0]), fr.u), M.lerp(cy(A[1]), cy(Bh[1]), fr.u), 1.15, t, { walk: true, dir: Bh[0] < A[0] ? -1 : 1, mood: 'idle' }); }
      if (lv.snack >= 0 && res && fr && fr.k >= lv.snack) { /* eaten: baked cookie hidden by crumbs */ const [sx, sy] = rt[lv.snack]; g.fillStyle = '#2c2f36'; g.beginPath(); g.arc(cx(sx) + 3, cy(sy) - 3, 2.2, 0, 7); g.fill(); }
      // rain
      if (lv.rain >= 0) { const raining = washedNow || (phase === 'won' && true); if (raining) { g.strokeStyle = 'rgba(160,200,255,.35)'; g.lineWidth = .4; for (let k = 0; k < 40; k++) { const x = (k * 37.7 + t * 60) % BW, y = (k * 53.3 + t * 140) % (R * S); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1.5, y + 4); g.stroke(); } } }
      // bottom bar: chalk palette, ink, rain clock, GO
      g.fillStyle = 'rgba(20,22,28,.9)'; rrect(g, 1.5, 135, 97, 15.5, 3); g.fill();
      typesHere().forEach((ty, j) => { const x = palX(j), on = sel === ty; g.fillStyle = on ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.05)'; g.beginPath(); g.arc(x, PAL_Y, 6.4, 0, 7); g.fill(); if (on) { g.strokeStyle = PT[ty].col; g.lineWidth = .8; g.stroke(); } g.fillStyle = PT[ty].col; g.save(); g.translate(x - 2, PAL_Y + 3.6); g.rotate(-.7); g.fillRect(-.9, -4.5, 1.8, 6); g.restore(); lureIcon(g, ty, x + 1.6, PAL_Y - 1, .8, t); });
      const ix = 10 + typesHere().length * 15 - 1, used = inkUsed();
      text(`chalk ${lv.ink - used}/${lv.ink}`, ix + 9, PAL_Y - 2.4, 2.6, { g, color: '#fff', shadow: false, align: 'left', font: PK.COMIC });
      for (let k = 0; k < lv.ink; k++) { g.fillStyle = k < lv.ink - used ? '#f4f0e0' : 'rgba(255,255,255,.15)'; g.fillRect(ix + 9 + k * 2.6, PAL_Y + .6, 2, 3); }
      if (lv.rain >= 0) text(`☔ rain at step ${lv.rain}`, ix + 9, PAL_Y + 6, 2.2, { g, color: '#9ad8ff', shadow: false, align: 'left' });
      if (res && phase === 'run') text(`step ${Math.min(res.frames.length - 1, Math.floor(animT / TK))}`, 50, 132, 2.4, { g, color: '#fff', shadow: false });
      g.fillStyle = phase === 'plan' ? '#7ad07a' : '#606470'; g.beginPath(); g.arc(GO.x, GO.y, GO.r, 0, 7); g.fill(); g.strokeStyle = '#f4f0e0'; g.lineWidth = .7; g.stroke(); text('GO', GO.x, GO.y + .3, 4.4, { g, color: '#fff', shadow: false, font: PK.COMIC });
    },
    hint(g, step, t) {
      if (phase !== 'plan') return;
      lv.preds.forEach((p, j) => { const x = cx(p.x), y = cy(p.y) - 9; g.fillStyle = 'rgba(255,255,255,.92)'; rrect(g, x - 5, y - 4, 10, 7, 2); g.fill(); g.fillStyle = '#2c2f36'; g.save(); g.translate(0, 0); lureIcon(g, p.type, x, y - .5, .9, t); g.restore(); g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(x, y - .5, 3.3, 0, 7); g.globalCompositeOperation = 'destination-over'; g.fill(); g.globalCompositeOperation = 'source-over'; });
      if (step >= 2) lv.sol.forEach((s, j) => { if (step < 3 && j > 0) return; const [x, y] = s.cells[0]; g.strokeStyle = PT[s.type].col; g.lineWidth = .9; g.beginPath(); g.arc(cx(x), cy(y), 5 + Math.sin(t * 6) * .6, 0, 7); g.stroke(); g.setLineDash([1, 1]); g.beginPath(); g.moveTo(cx(lv.preds[j].x), cy(lv.preds[j].y)); g.lineTo(cx(x), cy(y)); g.stroke(); g.setLineDash([]); });
    },
    qaFail() { strokes = []; go(); animT = Math.max(0, res.failTick - .3) * TK; },
    qa() { const acts = []; const ts = typesHere(); lv.sol.forEach((s) => { const j = ts.indexOf(s.type); acts.push({ t: 'tap', x: palX(j), y: PAL_Y, wait: 100 }); const [x, y] = s.cells[0]; acts.push({ t: 'tap', x: cx(x), y: cy(y), wait: 120 }); }); acts.push({ t: 'tap', x: GO.x, y: GO.y, wait: lv.route.length * TK * 1000 + 900 }); return acts; },
    drawTitle(g, W, H, t, hb) {
      const s = Math.min(hb.w / 80, hb.h / 40); g.save(); g.translate(W / 2, hb.y + hb.h / 2); g.scale(s, s);
      g.fillStyle = '#2c2f36'; rrect(g, -40, -19, 80, 38, 4); g.fill(); g.fillStyle = PK.pat('speck'); g.fill();
      chalkLine(g, [[-34, 10], [-24, 4], [-14, 8], [-4, 2]], PT.fox.col, 2.6, 1); for (let k = 0; k < 4; k++) lureIcon(g, 'fox', -34 + k * 10, [10, 4, 8, 2][k], 1, t);
      const fxp = -4 - ((t * 6) % 30) * 0; pest(g, 'fox', fxp + 6, 0, 1.4, t, 'eat', -1);
      chalkLine(g, [[18, -12], [26, -12]], PT.crow.col, 1.6, 2); lureIcon(g, 'crow', 22, -12, 1.2, t);
      hedgehog(g, 26 + Math.sin(t) * 2, 8, 1.6, t, { walk: true, mood: 'happy' });
      g.restore();
    },
    drawSkin(g, i, x, y, r) { hedgehog(g, x, y + r * .2, r / 6, PK.t, { sk: SKINS[i], mood: 'happy' }); },
  };
  PK.run(game);
})();
