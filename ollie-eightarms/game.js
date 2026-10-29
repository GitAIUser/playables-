/* Ollie Eightarms: an octopus cat-burglar uses SEVERAL arms at once. Each arm you draw stays where you leave it and keeps
   doing its job: lying on a plate holds a door open, lying on a switch kills a laser. Arms can't cross each other, so
   the order and route of every arm matters. Tap an arm to pull it back (whatever it held lets go!).
   Style: chunky 3D-look toon: thick outlines, two-tone cel shading, suction-cup decals, rubbery wobble, tilted rooms. */
'use strict';
(() => {
  const { M, fx, sfx, text, rrect, face } = PK;
  const COLS = 6, ROWS = 9, CS = 100 / COLS, GH = ROWS * CS, TOTAL = 120, SPAN = [1, 2, 3, 4];
  const WORLDS = ['Aquarium', 'Yacht Club', 'Sushi Bar', 'Lighthouse', 'Submarine', 'Harbor Bank'];
  const SKINS = [
    { name: 'Coral', a: '#ff7a6b', b: '#d84a4a', h: '#ffb0a0', d: 'mustache' }, { name: 'Lilac', a: '#b48ae0', b: '#7a50b0', h: '#e0c8ff', d: 'monocle' },
    { name: 'Teal', a: '#3ac0b0', b: '#1a8078', h: '#a0f0e0', d: 'beret' }, { name: 'Sunny', a: '#ffc040', b: '#d08a10', h: '#ffe8a0', d: 'mustache' },
    { name: 'Midnight', a: '#4a5aa0', b: '#2a3470', h: '#a0b0ff', d: 'tophat' }, { name: 'Bubblegum', a: '#ff8ac8', b: '#d0508a', h: '#ffd0ea', d: 'bow' },
    { name: 'Mint', a: '#7ae0a0', b: '#3aa86a', h: '#d0ffe0', d: 'monocle' }, { name: 'Gold heist', a: '#e8c050', b: '#a07a10', h: '#fff0b0', d: 'tophat' },
  ];
  const idx = (c, r) => r * COLS + c, cc = (c, r) => [(c + .5) * CS, (r + .5) * CS];
  // ---------- level model ----------
  // g: 0 free, 1 rock, 2 door(k), 3 beam row cell(k). holds: [{c,r,kind:'plate'|'switch',k}]
  function openSet(L, held) { const s = new Set(); for (const h of L.holds) if (held.has(idx(h.c, h.r))) s.add(h.kind + h.k); return s; }
  function passable(L, i, occ, open) {
    if (occ.has(i)) return false; const v = L.g[i];
    if (v === 1) return false; if (v === 2 && !open.has('plate' + L.key[i])) return false; if (v === 3 && !open.has('switch' + L.key[i])) return 'zap';
    return true;
  }
  function armBFS(L, goal, occ, held) {
    const hk = L.holds.map((h) => idx(h.c, h.r)), q = [], prev = new Map();
    for (const c of SPAN) { const i = idx(c, ROWS - 1); const o = openSet(L, held); if (passable(L, i, occ, o) === true) { const m = hk.indexOf(i) >= 0 ? 1 << hk.indexOf(i) : 0; const k = i * 32 + m; if (!prev.has(k)) { prev.set(k, null); q.push([i, m]); } } }
    while (q.length) {
      const cur = q.shift(), [i, m] = cur;
      if (i === goal) { const path = []; let s = cur; while (s) { path.unshift(s[0]); s = prev.get(s[0] * 32 + s[1]); } return path; }
      const h2 = new Set(held); hk.forEach((x, j) => { if (m >> j & 1) h2.add(x); }); const o = openSet(L, h2);
      const c = i % COLS, r = Math.floor(i / COLS);
      for (const [dc, dr] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
        const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue; const ni = idx(nc, nr);
        if (passable(L, ni, occ, o) !== true) continue;
        // no self-crossing: walk back the chain
        let s = cur, hit = false; while (s) { if (s[0] === ni) { hit = true; break; } s = prev.get(s[0] * 32 + s[1]); } if (hit) continue;
        const j = hk.indexOf(ni), nm = j >= 0 ? m | (1 << j) : m, k = ni * 32 + nm; if (prev.has(k)) continue; prev.set(k, cur); q.push([ni, nm]);
      }
    }
    return null;
  }
  function perms(arr, k) { if (k === 0) return [[]]; const out = []; arr.forEach((x, i) => { for (const p of perms(arr.filter((_, j) => j !== i), k - 1)) out.push([x].concat(p)); }); return out; }
  function solve(L, needPearl) {
    const targets = L.holds.map((h) => idx(h.c, h.r)).concat(needPearl && L.pearl ? [idx(...L.pearl)] : []); let best = null;
    for (let k = 0; k <= Math.min(L.arms - 1, targets.length); k++) for (const seq of perms(targets, k)) {
      const occ = new Set(), held = new Set(), arms = []; let ok = true;
      for (const tg of seq) { if (occ.has(tg)) { ok = false; break; } const p = armBFS(L, tg, occ, held); if (!p) { ok = false; break; } arms.push(p); p.forEach((x) => { occ.add(x); held.add(x); }); }
      if (!ok) continue; const fin = armBFS(L, idx(...L.loot), occ, held); if (!fin) continue; arms.push(fin);
      if (needPearl && L.pearl && !arms.some((a) => a.includes(idx(...L.pearl)))) continue;
      const len = arms.reduce((s, a) => s + a.length, 0); if (!best || len < best.len) best = { arms, len };
    }
    return best;
  }
  function gen(i, seed) {
    const w = Math.floor(i / 20), d = (i % 20) / 19;
    const barriers = w === 0 ? (d > .45 ? 1 : 0) : w === 1 ? 1 + (d > .6 ? 1 : 0) : w === 2 ? 1 + (d > .5 ? 1 : 0) : w === 3 ? 2 : w === 4 ? 2 + (d > .7 ? 1 : 0) : 2 + (d > .3 ? 1 : 0);
    for (let tr = 0; tr < 500; tr++) {
      const r = M.rng(M.hash(i, seed, tr, 'ollie')), strict = tr < 400;
      const L = { g: new Array(COLS * ROWS).fill(0), key: new Array(COLS * ROWS).fill(0), holds: [], loot: [M.ri(r, 0, COLS - 1), 0], pearl: null, arms: barriers + 1 + (w === 0 || d < .3 ? 1 : 0) };
      const rows = []; const cand = [2, 4, 6].slice(0, 3); M.shuffle(r, cand); for (let k = 0; k < barriers; k++) rows.push(cand[k]); rows.sort((a, b) => a - b);
      rows.forEach((rr, k) => {
        const laser = w >= 2 && (w === 2 ? true : r() < .5);
        if (laser) { for (let c = 0; c < COLS; c++) { L.g[idx(c, rr)] = 3; L.key[idx(c, rr)] = k; } }
        else { for (let c = 0; c < COLS; c++) L.g[idx(c, rr)] = 1; const dc = M.ri(r, 0, COLS - 1); L.g[idx(dc, rr)] = 2; L.key[idx(dc, rr)] = k; }
        // its plate/switch lives somewhere below the barrier
        for (let t = 0; t < 30; t++) { const c = M.ri(r, 0, COLS - 1), r2 = M.ri(r, rr + 1, ROWS - 1), x = idx(c, r2); if (!L.g[x] && !L.holds.some((h) => h.c === c && h.r === r2)) { L.holds.push({ c, r: r2, kind: laser ? 'switch' : 'plate', k }); break; } }
      });
      const nRock = Math.round(1 + d * 3 + r() * 2); for (let k = 0; k < nRock; k++) { const c = M.ri(r, 0, COLS - 1), rr = M.ri(r, 1, ROWS - 2), x = idx(c, rr); if (!L.g[x] && !L.holds.some((h) => idx(h.c, h.r) === x) && !(c === L.loot[0] && rr === L.loot[1])) L.g[x] = 1; }
      if (w >= 4 && r() < .6) { for (let t = 0; t < 20; t++) { const c = M.ri(r, 0, COLS - 1), rr = M.ri(r, 1, ROWS - 1), x = idx(c, rr); if (!L.g[x] && !L.holds.some((h) => idx(h.c, h.r) === x)) { L.holds.push({ c, r: rr, kind: 'plate', k: 9 }); break; } } } // decoy plate
      if (L.g[idx(...L.loot)]) continue;
      if (r() < .85) { for (let t = 0; t < 20; t++) { const c = M.ri(r, 0, COLS - 1), rr = M.ri(r, 1, ROWS - 2), x = idx(c, rr); if (!L.g[x] && !L.holds.some((h) => idx(h.c, h.r) === x)) { L.pearl = [c, rr]; break; } } }
      const a = solve(L, false); if (!a) continue;
      if (strict && a.arms.length < Math.min(L.arms, barriers + 1)) continue; // every barrier really needs an arm
      if (strict && a.len < 7 + d * 4 + w) continue;
      let b = a; if (L.pearl) { b = solve(L, true); if (!b) L.pearl = null, b = a; }
      L.sol = b; L.par = b.len + 1; L.minArms = a.arms.length; return L;
    }
    return null;
  }

  // ---------- state ----------
  let lv = null, arms = [], cur = null, mode = 'idle', hist = [], held = new Set(), open = new Set(), pearlGot = false, mood = 'idle', moodT = 0, endT = 0, winT = -1, failKind = '', T = 0, failAt = null, lootArm = -1, doorY = {};
  function reset() { arms = []; cur = null; mode = 'idle'; hist = []; held = new Set(); open = new Set(); pearlGot = false; mood = 'idle'; endT = 0; winT = -1; failKind = ''; failAt = null; lootArm = -1; recalc(); }
  const occ = () => { const s = new Set(); for (const a of arms) for (const x of a.cells) s.add(x); return s; };
  function recalc() { held = new Set(); for (const a of arms) for (const x of a.cells) if (lv.holds.some((h) => idx(h.c, h.r) === x)) held.add(x); open = openSet(lv, held); }
  const snapshot = () => JSON.stringify({ arms: arms.map((a) => ({ cells: a.cells.slice() })), cur: cur ? arms.indexOf(cur) : -1, pearlGot });
  function restore(s) { const o = JSON.parse(s); arms = o.arms.map((a) => ({ cells: a.cells, wob: 0 })); cur = null; pearlGot = o.pearlGot; recalc(); }
  function checkWorld() { // after any change: a closed door or live laser on an arm = disaster
    for (const a of arms) for (const x of a.cells) { const v = lv.g[x]; if (v === 2 && !open.has('plate' + lv.key[x])) return ['pinch', x]; if (v === 3 && !open.has('switch' + lv.key[x])) return ['zap', x]; }
    return null;
  }
  function step1(ni) { // extend current arm by one cell
    hist.push(snapshot()); cur.cells.push(ni); cur.wob = 1; sfx.pop(.8 + cur.cells.length * .03);
    const was = new Set(open); recalc(); for (const k of open) if (!was.has(k)) { sfx.chime(k.startsWith('plate') ? 660 : 990); const [x, y] = cc(ni % COLS, Math.floor(ni / COLS)); fx.word(x, y - 7, k.startsWith('plate') ? 'click!' : 'laser off', '#fff', 4); }
    if (lv.pearl && !pearlGot && ni === idx(...lv.pearl)) { pearlGot = true; sfx.chime(1320); fx.burst(...cc(...lv.pearl), 10, { col: ['#fff', '#d0f0ff'], speed: 18, size: 1.2 }); }
    const bad = checkWorld(); if (bad) { fail(bad[0], bad[1]); return; }
    if (ni === idx(...lv.loot)) win();
  }
  function fail(kind, at) {
    mode = 'fail'; failKind = kind; failAt = at; endT = 0; mood = 'shock'; const [x, y] = cc(at % COLS, Math.floor(at / COLS));
    if (kind === 'zap') { sfx.noise({ f: 3200, f2: 900, d: .35, v: .2 }); fx.burst(x, y, 16, { col: ['#ff4a6a', '#fff'], speed: 40, size: 1.4 }); fx.word(x, y - 8, 'ZAP!', '#ff6a8a', 7); }
    else { sfx.thud(.5); fx.word(x, y - 8, 'PINCH!', '#ffd34d', 7); fx.shake(2.5); }
    PK.later(() => { const [ox, oy] = body(); fx.puff(ox, oy - 4, 18, 'rgba(30,20,40,.85)'); fx.word(ox, oy - 14, 'POOF', '#1d1d24', 7); sfx.whoosh(.2); }, 250);
    PK.fail(kind === 'zap' ? 'Laser alarm! Switch it off first.' : 'The door slammed on an arm!');
  }
  function win() { mode = 'won'; winT = 0; lootArm = arms.indexOf(cur); cur = null; const len = arms.reduce((s, a) => s + a.cells.length, 0); let st = 1; if (!lv.pearl || pearlGot) st++; if (len <= lv.par) st++; sfx.win(); PK.win(st); }
  const body = () => [50, GH + 9];
  function cellAt(x, y) { const c = Math.floor(x / CS), r = Math.floor(y / CS); return c >= 0 && r >= 0 && c < COLS && r < ROWS ? idx(c, r) : -1; }
  function tryToward(x, y) {
    if (!cur) return; let n = 0;
    while (n++ < 4 && mode === 'play') {
      const tip = cur.cells[cur.cells.length - 1], tc = tip % COLS, tr = Math.floor(tip / COLS), [cx, cy] = cc(tc, tr), dx = x - cx, dy = y - cy;
      if (Math.abs(dx) < CS * .55 && Math.abs(dy) < CS * .55) return;
      const [sc, sr] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)], nc = tc + sc, nr = tr + sr; if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) return; const ni = idx(nc, nr);
      if (cur.cells.length > 1 && ni === cur.cells[cur.cells.length - 2]) { hist.push(snapshot()); cur.cells.pop(); sfx.tick(.8); recalc(); const bad = checkWorld(); if (bad) { fail(bad[0], bad[1]); } continue; }
      const p = passable(lv, ni, occ(), open); if (p === false) { if (cur.bumpT === undefined || T - cur.bumpT > .4) { cur.bumpT = T; sfx.tick(.5); } return; }
      if (cur.cells.length >= 24) return;
      if (p === 'zap') { hist.push(snapshot()); cur.cells.push(ni); fail('zap', ni); return; }
      step1(ni);
    }
  }
  // ---------- drawing ----------
  function smooth(cells, t, wob) {
    const P = [body()].concat(cells.map((x) => cc(x % COLS, Math.floor(x / COLS)))); const out = [];
    for (let k = 0; k < P.length - 1; k++) { const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(P.length - 1, k + 2)]; for (let s = 0; s < 6; s++) { const u = s / 6, u2 = u * u, u3 = u2 * u; const f = (a, b, c2, d) => .5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u2 + (-a + 3 * b - 3 * c2 + d) * u3); out.push([f(p0[0], p1[0], p2[0], p3[0]) + Math.sin(t * 3 + k + s * .3) * .5 * wob, f(p0[1], p1[1], p2[1], p3[1]) + Math.cos(t * 2.6 + k) * .4 * wob]); } }
    out.push(P[P.length - 1]); return out;
  }
  function drawArm(g, cells, sk, t, active) {
    const pts = smooth(cells, t, active ? 1.6 : .6); const n = pts.length; if (n < 2) return;
    const path = () => { g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    path(); g.strokeStyle = '#1d1424'; g.lineWidth = 9.6; g.stroke();
    path(); g.strokeStyle = sk.b; g.lineWidth = 7.4; g.stroke();
    g.save(); g.translate(-.9, -.9); path(); g.strokeStyle = sk.a; g.lineWidth = 5; g.stroke(); g.translate(-.6, -.6); path(); g.strokeStyle = sk.h; g.globalAlpha = .7; g.lineWidth = 1.4; g.stroke(); g.restore();
    for (let k = 8; k < n - 3; k += 7) { const a = pts[k], b = pts[k + 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const ox = Math.cos(ang + 1.57) * 2.3, oy = Math.sin(ang + 1.57) * 2.3; g.fillStyle = '#ffe0d8'; g.strokeStyle = '#1d1424'; g.lineWidth = .5; g.beginPath(); g.ellipse(a[0] + ox, a[1] + oy, 1.3, .9, ang, 0, 7); g.fill(); g.stroke(); }
    const tip = pts[n - 1]; g.fillStyle = sk.a; g.strokeStyle = '#1d1424'; g.lineWidth = 1; g.beginPath(); g.arc(tip[0], tip[1], 3.4, 0, 7); g.fill(); g.stroke(); g.fillStyle = sk.h; g.beginPath(); g.arc(tip[0] - 1, tip[1] - 1, 1.1, 0, 7); g.fill();
  }
  function drawOllie(g, sk, md, t) {
    const [x, y] = body(), sq = mode === 'won' ? 1 + Math.sin(t * 10) * .06 : 1 + Math.sin(t * 2.4) * .025;
    g.save(); g.translate(x, y); g.scale(1 / sq, sq);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 9, 18, 3, 0, 0, 7); g.fill();
    for (let k = 0; k < 4; k++) { const a = -2.6 + k * .35 + (k > 1 ? 1.6 : 0); g.strokeStyle = '#1d1424'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 2); g.quadraticCurveTo(Math.cos(a) * 12, 6, Math.cos(a) * 17, 8 + Math.sin(t * 3 + k) * 1); g.stroke(); g.strokeStyle = sk.b; g.lineWidth = 3.4; g.stroke(); }
    g.fillStyle = '#1d1424'; g.beginPath(); g.ellipse(0, -2, 13.6, 11.6, 0, 0, 7); g.fill();
    g.fillStyle = sk.b; g.beginPath(); g.ellipse(0, -2, 12.4, 10.4, 0, 0, 7); g.fill();
    g.fillStyle = sk.a; g.beginPath(); g.ellipse(-1.4, -3.6, 10.6, 8.6, 0, 0, 7); g.fill();
    g.fillStyle = sk.h; g.globalAlpha = .7; g.beginPath(); g.ellipse(-5, -8, 3.6, 2, -.5, 0, 7); g.fill(); g.globalAlpha = 1;
    face(g, 0, -1, 7, md, t, { ink: '#1d1424' });
    const dz = sk.d, drop = mode === 'fail' ? Math.min(14, endT * 30) : 0;
    g.fillStyle = '#1d1424';
    if (dz === 'mustache') { g.save(); g.translate(0, 3 + drop); g.rotate(drop * .08); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-4, -2.2, -6.5, .5); g.quadraticCurveTo(-3.5, 1.3, 0, .9); g.quadraticCurveTo(3.5, 1.3, 6.5, .5); g.quadraticCurveTo(4, -2.2, 0, 0); g.fill(); g.restore(); }
    else if (dz === 'monocle') { g.strokeStyle = '#d0a020'; g.lineWidth = .8; g.beginPath(); g.arc(2.7, -1.6 + drop, 2.6, 0, 7); g.stroke(); g.beginPath(); g.moveTo(5.3, -1 + drop); g.lineTo(6, 5 + drop); g.stroke(); }
    else if (dz === 'beret') { g.fillStyle = '#c0303a'; g.beginPath(); g.ellipse(-2, -11 + drop, 8, 3, -.15, 0, 7); g.fill(); g.fillRect(-2.5, -15 + drop, 1.4, 2.5); }
    else if (dz === 'tophat') { g.fillRect(-6.5, -12 + drop, 13, 1.6); g.fillRect(-4.2, -20 + drop, 8.4, 8.4); g.fillStyle = '#c0303a'; g.fillRect(-4.2, -13.6 + drop, 8.4, 1.4); }
    else { g.fillStyle = '#ff4a8a'; g.beginPath(); g.moveTo(0, -11 + drop); g.lineTo(-5, -14 + drop); g.lineTo(-5, -8 + drop); g.closePath(); g.moveTo(0, -11 + drop); g.lineTo(5, -14 + drop); g.lineTo(5, -8 + drop); g.closePath(); g.fill(); }
    g.restore();
  }
  function drawStatic(g) {
    const w = Math.floor(PK.cur / 20) % 6, pal = [['#bfe8f4', '#9ad4e8'], ['#f4ecd8', '#e0d4b8'], ['#f4e0c8', '#e8c8a0'], ['#e8e0f0', '#d0c4e0'], ['#c8d8c0', '#a8bca0'], ['#e8dcc0', '#d0c098']][w];
    g.fillStyle = '#1d1424'; g.fillRect(-1.6, -1.6, 103.2, GH + 3.2);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const x = c * CS, y = r * CS; g.fillStyle = (r + c) % 2 ? pal[0] : pal[1]; g.fillRect(x, y, CS, CS); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, y, CS, 1.2); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x, y + CS - 1.2, CS, 1.2); }
    const gr = g.createLinearGradient(0, 0, 0, GH); gr.addColorStop(0, 'rgba(0,0,40,.18)'); gr.addColorStop(.4, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 100, GH);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = idx(c, r), x = c * CS, y = r * CS, v = lv.g[i];
      if (v === 1) { g.fillStyle = '#1d1424'; rrect(g, x + .6, y + .6, CS - 1.2, CS - 1.2, 2.5); g.fill(); g.fillStyle = ['#5a8ab0', '#8a6a4a', '#6a4a3a', '#7a7a8a', '#5a6a50', '#8a7a50'][w]; rrect(g, x + 1.6, y + 1.6, CS - 3.2, CS - 4.2, 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.25)'; rrect(g, x + 2.6, y + 2.4, CS - 5.2, 3, 1.5); g.fill(); }
      if (v === 3) { g.fillStyle = 'rgba(255,60,100,.08)'; g.fillRect(x, y, CS, CS); }
    }
    for (const h of lv.holds) { const [x, y] = cc(h.c, h.r); g.fillStyle = '#1d1424'; g.beginPath(); g.ellipse(x, y + 1, 6.2, 4.4, 0, 0, 7); g.fill(); g.fillStyle = h.kind === 'plate' ? (h.k === 9 ? '#9a9aa8' : ['#ffcf3a', '#3ac0ff', '#ff7ac0'][h.k]) : '#ff4a6a'; g.beginPath(); g.ellipse(x, y, 5.4, 3.6, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(x - 1.5, y - 1.2, 2.2, 1, 0, 0, 7); g.fill(); if (h.kind === 'switch') text('⏻', x, y + .2, 4, { g, color: '#fff', shadow: false }); }
  }
  const game = {
    id: 'ollie-eightarms', title: 'Ollie Eightarms', tagline: 'An octopus burglar with arms to spare. Hold, block, grab!', total: TOTAL, worldSize: 20, worlds: WORLDS,
    accent: '#ff7a6b', bg0: '#1a5a7a', bg1: '#0a1a30', titleCol: '#ffd0c8', titleStroke: '#1d1424', board: { w: 100, h: GH + 22 }, lead: true, skins: SKINS,
    music: { root: 233, scale: [0, 3, 5, 7, 10, 12], bpm: 104, voice: 'pluck', density: .45 },
    clearLines: ['Eight-tastic!', 'Ink-credible heist!', 'Smooth as a sucker!', 'Loot secured!', 'Tenta-cool!'],
    tutorial(i) {
      if (i === 0) return 'Drag an arm from Ollie to the loot. Arms can’t pass rocks';
      if (i === 9) return 'Lay an arm across a plate to hold its door open. Then send another arm!';
      if (i === 40) return 'Red switches turn lasers off, but only while an arm stays on them';
      if (i === 60) return 'Arms can’t cross each other. Plan each route so the next one fits';
      if (i === 100) return 'The Harbor Bank: three barriers, four arms. Good luck, Ollie';
      return null;
    },
    goal() { return (lv.pearl ? '★ pearl · ' : '★★ loot · ') + `★ arms ≤ ${lv.par} squares`; },
    load(i, seed) { lv = gen(i, seed) || gen(i, (seed | 0) + 101); reset(); PK.unbake('oe'); },
    validate: () => !!(lv && lv.sol && lv.sol.arms.length), sig: () => [lv.g.join(''), lv.holds, lv.loot, lv.pearl, lv.arms],
    canRewind: () => hist.length > 0,
    rewind() { const s = hist.pop(); if (!s) return false; restore(s); mode = 'idle'; failKind = ''; failAt = null; mood = 'idle'; return true; },
    cursorStart: () => cur ? cc(cur.cells[cur.cells.length - 1] % COLS, Math.floor(cur.cells[cur.cells.length - 1] / COLS)) : [50, GH - 6],
    down(x, y) {
      if (mode !== 'idle') return; const ci = cellAt(x, y);
      // continue an arm from its tip
      for (const a of arms) if (a.cells[a.cells.length - 1] === ci) { cur = a; mode = 'play'; return; }
      // tap an existing arm segment = pull that arm home
      for (let k = 0; k < arms.length; k++) if (arms[k].cells.includes(ci)) { hist.push(snapshot()); arms.splice(k, 1); recalc(); sfx.whoosh(.12); const bad = checkWorld(); if (bad) { mode = 'play'; fail(bad[0], bad[1]); } return; }
      if (arms.length >= lv.arms) { PK.toast(`Only ${lv.arms} arms this level. Tap an arm to pull it back`); return; }
      let sc = -1; if (y > GH - CS && y < GH + 22) { const c = Math.floor(x / CS); const opts = SPAN.slice().sort((a, b) => Math.abs(a - c) - Math.abs(b - c)); const o = occ(); for (const c2 of opts) { const i2 = idx(c2, ROWS - 1); if (passable(lv, i2, o, open) === true && Math.abs(c2 - c) <= 1) { sc = i2; break; } } }
      if (sc < 0) return; hist.push(snapshot()); cur = { cells: [], wob: 1 }; arms.push(cur); hist.pop(); mode = 'play'; step1(sc);
    },
    move(x, y) { if (mode === 'play' && cur) tryToward(x, y); },
    up() { if (mode === 'play') { mode = 'idle'; if (cur && !cur.cells.length) arms.splice(arms.indexOf(cur), 1); cur = null; sfx.squish(); } },
    cancel() { game.up(); },
    step(dt) { T += dt; moodT += dt; if (winT >= 0) winT += dt; if (mode === 'fail') endT += dt; for (const a of arms) a.wob = Math.max(0, (a.wob || 0) - dt * 2); for (const h of lv.holds) { const k = 'd' + h.k; doorY[k] = M.approach(doorY[k] || 0, open.has('plate' + h.k) ? 1 : 0, 10, dt); } },
    drawBg(g, W, H) {
      const w = Math.floor(PK.cur / 20) % 6, c = [['#1a6a8a', '#0a2a40'], ['#2a5a8a', '#0a1a3a'], ['#5a2a2a', '#1a0a0a'], ['#2a3a5a', '#0a0a1a'], ['#1a4a3a', '#061a14'], ['#4a3a1a', '#140c04']][w];
      g.drawImage(PK.screenBg('oe' + w, (b, w2, h2) => { const gr = b.createLinearGradient(0, 0, 0, h2); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]); b.fillStyle = gr; b.fillRect(0, 0, w2, h2); const r = M.rng(w + 4); for (let k = 0; k < 30; k++) { b.strokeStyle = 'rgba(255,255,255,.12)'; b.lineWidth = 1.5; b.beginPath(); b.arc(r() * w2, r() * h2, 3 + r() * 9, 0, 7); b.stroke(); } b.fillStyle = 'rgba(0,0,0,.25)'; b.beginPath(); b.moveTo(0, h2 * .78); b.lineTo(w2, h2 * .72); b.lineTo(w2, h2); b.lineTo(0, h2); b.fill(); }), 0, 0, W, H);
    },
    draw(g, t) {
      const sk = SKINS[PK.skin()] || SKINS[0];
      g.save();
      PK.blit(g, PK.baked('oe', drawStatic), 0, 0);
      // doors + lasers
      for (let i = 0; i < COLS * ROWS; i++) {
        const v = lv.g[i], x = (i % COLS) * CS, y = Math.floor(i / COLS) * CS;
        if (v === 2) { const o = doorY['d' + lv.key[i]] || 0, col = ['#ffcf3a', '#3ac0ff', '#ff7ac0'][lv.key[i]]; g.fillStyle = '#1d1424'; g.fillRect(x, y, CS, CS); g.fillStyle = '#3a3040'; g.fillRect(x + 1, y + 1, CS - 2, CS - 2); const hgt = (CS - 2) * (1 - o); g.fillStyle = col; g.fillRect(x + 1.5, y + 1, CS - 3, hgt); g.fillStyle = 'rgba(0,0,0,.2)'; for (let k = 0; k < hgt - 1; k += 3) g.fillRect(x + 1.5, y + 1 + k, CS - 3, 1); }
        if (v === 3) { const on = !open.has('switch' + lv.key[i]); if (on) { const f = .6 + Math.sin(t * 20 + i) * .2; g.strokeStyle = `rgba(255,60,100,${f})`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y + CS / 2); g.lineTo(x + CS, y + CS / 2); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = .4; g.stroke(); } else { g.strokeStyle = 'rgba(255,60,100,.25)'; g.setLineDash([1, 2]); g.lineWidth = .5; g.beginPath(); g.moveTo(x, y + CS / 2); g.lineTo(x + CS, y + CS / 2); g.stroke(); g.setLineDash([]); } if (i % COLS === 0) { g.fillStyle = '#3a3040'; rrect(g, -2.5, y + CS / 2 - 2.5, 4, 5, 1); g.fill(); g.fillStyle = on ? '#ff4a6a' : '#5a4a5a'; g.beginPath(); g.arc(-.5, y + CS / 2, 1.2, 0, 7); g.fill(); } }
      }
      if (lv.pearl && !pearlGot) { const [x, y] = cc(...lv.pearl); g.fillStyle = '#1d1424'; g.beginPath(); g.arc(x, y, 3.4, 0, 7); g.fill(); const rg = g.createRadialGradient(x - 1, y - 1, .3, x, y, 3); rg.addColorStop(0, '#fff'); rg.addColorStop(1, '#c8d8f0'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, 2.8, 0, 7); g.fill(); }
      const [lx, ly] = cc(...lv.loot); if (mode !== 'won') { g.save(); g.translate(lx, ly + Math.sin(t * 3) * .6); g.fillStyle = '#1d1424'; rrect(g, -6.4, -4.4, 12.8, 9.4, 2); g.fill(); g.fillStyle = '#e8b030'; rrect(g, -5.4, -3.4, 10.8, 7.4, 1.6); g.fill(); g.fillStyle = '#ffe080'; g.fillRect(-5.4, -3.4, 10.8, 2); g.fillStyle = '#1d1424'; g.fillRect(-1, -.6, 2, 2.4); text('$', 0, 7.5, 3.4, { g, color: '#ffe080', stroke: '#1d1424', sw: .7 }); g.restore(); }
      g.restore();
      arms.forEach((a, k) => { if (mode === 'won' && winT > .3) { const keep = Math.max(0, Math.floor(a.cells.length * (1 - (winT - .3) * 1.4))); if (!keep) return; drawArm(g, a.cells.slice(0, keep), sk, t, false); } else drawArm(g, a.cells, sk, t, a === cur || a.wob > 0); });
      const md = mode === 'fail' ? (endT > .4 ? 'sad' : 'shock') : mode === 'won' ? 'joy' : cur ? 'idle' : 'smug';
      drawOllie(g, sk, md, t);
      if (mode === 'won' && winT > .6) { for (let k = 0; k < 3; k++) { const a = winT * 5 + k * 2.1, x = 50 + Math.cos(a) * 14, y = GH - 8 - Math.abs(Math.sin(a)) * 16; g.fillStyle = ['#e8b030', '#fff', '#7ae0ff'][k]; g.strokeStyle = '#1d1424'; g.lineWidth = .7; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.stroke(); } }
      if (failAt !== null && mode === 'fail') { const [x, y] = cc(failAt % COLS, Math.floor(failAt / COLS)); g.strokeStyle = '#ff4a6a'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 5 + endT * 8, 0, 7); g.stroke(); }
      // arms counter
      for (let k = 0; k < lv.arms; k++) { const x = 4 + k * 6, y = GH + 17; g.fillStyle = k < arms.length ? 'rgba(255,255,255,.25)' : sk.a; g.strokeStyle = '#1d1424'; g.lineWidth = .6; g.beginPath(); g.arc(x, y, 2.3, 0, 7); g.fill(); g.stroke(); }
      const len = arms.reduce((s, a) => s + a.cells.length, 0); text(`${len} / ★${lv.par}`, 99, GH + 17, 3.4, { g, align: 'right', color: len <= lv.par ? '#d0ffe0' : '#ffb0a0' });
    },
    hint(g, step, t) {
      const A = lv.sol.arms; A.forEach((a, k) => { if (step < 2 && k > 0) return; const P = a.map((x) => cc(x % COLS, Math.floor(x / COLS))); const end = P[P.length - 1]; g.fillStyle = '#1d1424'; g.beginPath(); g.arc(end[0], end[1] - 6, 3, 0, 7); g.fill(); text(String(k + 1), end[0], end[1] - 6, 3.6, { g, color: '#ffd34d', shadow: false }); g.strokeStyle = '#ffd34d'; g.lineWidth = 1; g.beginPath(); g.arc(end[0], end[1], 6 + Math.sin(t * 6), 0, 7); g.stroke(); if (step >= 2) { g.save(); g.setLineDash([2, 2]); g.globalAlpha = .85; g.lineWidth = 1.2; g.beginPath(); P.forEach((p, j) => j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.restore(); } });
      if (step >= 3) { const all = [].concat(...A), k = Math.floor(t * 3) % all.length, [x, y] = cc(all[k] % COLS, Math.floor(all[k] / COLS)); g.globalAlpha = .6; g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(x, y, 3.4, 0, 7); g.fill(); g.globalAlpha = 1; }
    },
    qaFail() { const a = lv.sol.arms[lv.sol.arms.length - 1]; cur = { cells: [], wob: 1 }; arms.push(cur); mode = 'play'; for (const x of a.slice(0, Math.max(1, a.length - 1))) { if (mode !== 'play') break; if (passable(lv, x, occ(), open) !== true) { hist.push(snapshot()); cur.cells.push(x); fail(lv.g[x] === 3 ? 'zap' : 'pinch', x); break; } step1(x); } if (mode === 'play') { hist.push(snapshot()); fail('zap', a[0]); } },
    qa() { return lv.sol.arms.map((a) => ({ t: 'drag', pts: a.map((x) => cc(x % COLS, Math.floor(x / COLS))), wait: 40, hold: 150, after: 150 })).concat([{ t: 'wait', ms: 300 }]); },
    drawTitle(g, W, H, t, hb) {
      const s = Math.min(hb.w / 100, hb.h / 60), sk = SKINS[PK.skin()] || SKINS[0]; g.save(); g.translate(W / 2 - 50 * s, hb.y + hb.h - (GH + 18) * s); g.scale(s, s);
      const sm = mode; mode = 'idle'; for (let k = 0; k < 3; k++) { const P = []; for (let j = 0; j <= 30; j++) { const f = j / 30; P.push([50 + Math.sin(f * 4 + t + k * 2) * 10 * f + (k - 1) * 30 * f, GH + 4 - f * (30 + k * 6)]); } g.lineCap = 'round'; g.strokeStyle = '#1d1424'; g.lineWidth = 7; g.beginPath(); P.forEach((p, j) => j ? g.lineTo(...p) : g.moveTo(...p)); g.stroke(); g.strokeStyle = sk.a; g.lineWidth = 4.6; g.stroke(); }
      drawOllie(g, sk, 'smug', t); mode = sm; g.restore();
    },
    drawSkin(g, i, x, y, r) { g.save(); g.translate(x - 50 * r / 14, y - (GH + 9) * r / 14 + r * .2); g.scale(r / 14, r / 14); const sm = mode; mode = 'idle'; drawOllie(g, SKINS[i], 'happy', PK.t); mode = sm; g.restore(); },
  };
  PK.run(game);
})();
