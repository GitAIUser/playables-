/* © 2026 Randomness. All rights reserved. Unauthorized copying or redistribution is prohibited. */
/* Off the Panel: every level is a comic strip, and you solve it by editing the comic itself. Only comic elements move:
   sound effects, emanata (ZZZ, hearts, idea bulbs, sweat drops), thought bubbles, panel gutters and captions.
   Consistent rules: each symbol does what it means. ZZZ puts things to sleep, BOOM blasts, SPLASH soaks, ♥ calms...
   Style: halftone pop-art comic: Ben-Day dots, bold inks, letterer-style SFX, page-flip transitions. */
'use strict';
(() => {
  const { M, fx, sfx, text, rrect, face } = PK;
  const TOTAL = 150, BW = 100, BH = 152, PX = 2, PW = 96, PHT = 46, PG = 4;
  const WORLDS = ['Issue #1: Nap Time', 'Issue #2: Hot Stuff', 'Issue #3: Think Bubble', 'Issue #4: Mind the Gap', 'Issue #5: Meanwhile…', 'Issue #6: Ice Age', 'Issue #7: Chain Reaction', 'Issue #8: Crowded Panels', 'Issue #9: Plot Twist', 'Issue #10: The End?'];
  const SKINS = [
    { name: 'Classic', cape: '#e0302a', suit: '#2a5ad0', paper: '#fff8e8' }, { name: 'Golden Age', cape: '#e0a020', suit: '#5a8a3a', paper: '#f4e4b8' },
    { name: 'Manga', cape: '#1d1d24', suit: '#f4f2ea', paper: '#ffffff' }, { name: 'Newsprint', cape: '#5a5a5a', suit: '#9a9a9a', paper: '#e8e4d8' },
    { name: 'Neon', cape: '#ff3ac0', suit: '#3af0e0', paper: '#fff0fa' }, { name: 'Noir', cape: '#c0303a', suit: '#2a2a34', paper: '#d8d8d8' },
    { name: 'Sunny', cape: '#ff8a3a', suit: '#ffd34d', paper: '#fffbe0' }, { name: 'Cosmic', cape: '#7a3ae0', suit: '#1a1a5a', paper: '#eae0ff' },
  ];
  // symbol -> look ; blocker -> needs ; source -> emits (+ optional lock)
  const SYM = { zzz: { t: 'ZZZ', c: '#7ab0ff' }, boom: { t: 'BOOM!', c: '#ffd34d' }, splash: { t: 'SPLASH!', c: '#5ac8ff' }, idea: { t: '💡', c: '#fff36a' }, heart: { t: '♥', c: '#ff5a8a' }, drops: { t: '💧', c: '#8ad8ff' }, whoosh: { t: 'FWOOSH!', c: '#ff7a2a' }, notes: { t: '♪♫', c: '#c08aff' }, huh: { t: '?!', c: '#ffffff' }, achoo: { t: 'ACHOO!', c: '#a0e080' } };
  const BLOCK = { guard: 'zzz', boulder: 'boom', fire: 'splash', dark: 'idea', bull: 'heart', pit: 'drops', ice: 'whoosh', cliff: 'notes' };
  const SRC = { zzz: 'cat', boom: 'fireworks', splash: 'bucket', idea: 'inventor', heart: 'lovebirds', drops: 'jogger', whoosh: 'dragon', notes: 'radio', huh: 'parrot', achoo: 'flower' };
  const UNLOCK = { cat: 'notes', fireworks: 'whoosh', bucket: 'whoosh', inventor: 'boom', jogger: 'boom', radio: 'idea', dragon: 'heart', lovebirds: 'notes' };
  const INTRO = [['guard', 'fire', 'boulder', 'bull'], ['dark', 'pit'], ['door'], ['gutter'], ['caption'], ['ice', 'cliff']];
  const panelY = (i) => 2 + i * (PHT + PG), floorY = (i) => panelY(i) + PHT - 7;
  function gen(i, seed) {
    const w = Math.floor(i / 15), d = (i % 15) / 14, r = M.rng(M.hash(i, seed, 'panel'));
    const avail = []; for (let k = 0; k <= Math.min(5, w); k++) avail.push(...INTRO[k]);
    const nB = w === 0 ? 1 : w <= 2 ? 1 + (d > .5 ? 1 : 0) : w <= 5 ? 2 : 2 + (d > .4 ? 1 : 0);
    const L = { blockers: [], sources: [], specials: [], seed: M.hash(i, seed) };
    // newest mechanic first so each issue really teaches its rule
    const pool = M.shuffle(r, avail.slice()); if (w >= 1 && w <= 5 && i % 15 < 8) { const nw = INTRO[w][(i % 15) % INTRO[w].length]; pool.splice(pool.indexOf(nw), 1); pool.unshift(nw); }
    const picked = []; for (const b of pool) { if (picked.length >= nB) break; if (['door', 'gutter', 'caption'].includes(b) && picked.includes(b)) continue; picked.push(b); }
    // slots along the reading path: 3 panels x 2 floor slots
    const slots = M.shuffle(r, [[0, 1], [1, 0], [1, 1], [2, 0], [0, 0]]).slice(0, picked.length).sort((a, b) => a[0] * 2 + a[1] - (b[0] * 2 + b[1]));
    const needSyms = [];
    picked.forEach((b, k) => {
      const [p, s] = slots[k], x = s ? 66 : 38;
      if (b === 'gutter') L.blockers.push({ k: 'gutter', p, x: 52, w: 12, done: false });
      else if (b === 'caption') L.specials.push({ k: 'caption', p: 2, x: 72, y: floorY(2) - 22, hx: 72, hy: floorY(2) - 22, done: false });
      else if (b === 'door') { L.blockers.push({ k: 'door', p, x, done: false }); L.sources.push({ k: 'thinker', emits: 'say', p: -1 }); }
      else { L.blockers.push({ k: b, p, x, done: false }); needSyms.push(BLOCK[b]); }
    });
    const chainP = w >= 6 ? .35 + d * .4 : w >= 3 ? d * .35 : 0, have = new Set(needSyms);
    for (const s of needSyms) { const src = { k: SRC[s], emits: s, p: -1 }; const u = UNLOCK[src.k]; if (u && !have.has(u) && r() < chainP) { src.lock = u; have.add(u); L.sources.push({ k: SRC[u], emits: u, p: -1 }); } L.sources.push(src); }
    const decoys = w === 0 ? (i % 15 < 5 ? 0 : 1) : Math.min(4, 1 + Math.round(d * 1.5) + (w >= 7 ? 1 : 0));
    const spare = M.shuffle(r, Object.keys(SYM).filter((s) => !have.has(s))); for (let k = 0; k < decoys && k < spare.length; k++) L.sources.push({ k: SRC[spare[k]], emits: spare[k], p: -1, decoy: true });
    // place sources in panel skies, left/right of blockers, no overlaps
    const spots = []; for (let p = 0; p < 3; p++) for (const x of [16, 38, 62, 84]) spots.push([p, x]); M.shuffle(r, spots);
    L.sources.forEach((s, k) => { const [p, x] = spots[k]; s.p = p; s.x = x; s.y = panelY(p) + 15; });
    L.ops = L.blockers.length + L.specials.length + L.sources.filter((s) => s.lock).length;
    L.order = solveOrder(L); return L;
  }
  function solveOrder(L) { // the intended sequence of edits (used for hints + QA)
    const ops = [];
    for (const s of L.sources) if (s.lock) { const from = L.sources.find((o) => o.emits === s.lock && !o.lock); ops.push({ t: 'drop', from: L.sources.indexOf(from), to: ['src', L.sources.indexOf(s)] }); }
    for (const b of L.blockers) { const bi = L.blockers.indexOf(b); if (b.k === 'gutter') ops.push({ t: 'gutter', b: bi }); else if (b.k === 'door') ops.push({ t: 'tap', from: L.sources.findIndex((o) => o.emits === 'say') }); else ops.push({ t: 'drop', from: L.sources.findIndex((o) => o.emits === BLOCK[b.k]), to: ['blk', bi] }); }
    for (const sp of L.specials) ops.push({ t: 'peel', s: L.specials.indexOf(sp) });
    return ops;
  }
  // ---------- state ----------
  let lv = null, B = [], S = [], SP = [], syms = [], drag = null, hero = { p: 0, x: 8, walk: 0 }, mode = 'idle', opsUsed = 0, fails0 = 0, glare = null, endT = 0, winT = -1, T = 0, flipT = 0, tapPend = null;
  function reset() {
    B = lv.blockers.map((b) => Object.assign({}, b, { done: false, t: 0 })); S = lv.sources.map((s) => Object.assign({}, s, { open: !s.lock, used: false, t: 0 })); SP = lv.specials.map((s) => Object.assign({}, s, { done: false, x: s.hx, y: s.hy }));
    syms = []; S.forEach((s, k) => { if (s.open && s.emits !== 'say') syms.push(mkSym(k)); }); drag = null; hero = { p: 0, x: 8, walk: 0 }; mode = 'idle'; opsUsed = 0; glare = null; endT = 0; winT = -1; flipT = 0;
  }
  function mkSym(k) { const s = S[k]; return { k: s.emits, src: k, hx: s.x + (s.x > 50 ? -6 : 6), hy: s.y - 9, x: s.x + (s.x > 50 ? -6 : 6), y: s.y - 9, pop: 0, gone: false }; }
  function blockerAt(x, y) { for (let k = 0; k < B.length; k++) { const b = B[k]; if (b.done || b.k === 'gutter' || b.k === 'door') continue; if (Math.abs(x - b.x) < 11 && y > floorY(b.p) - 22 && y < floorY(b.p) + 5) return k; } return -1; }
  function sourceAt(x, y) { for (let k = 0; k < S.length; k++) { const s = S[k]; if (Math.hypot(x - s.x, y - s.y) < 9) return k; } return -1; }
  function wrong(x, y, who) {
    mode = 'fail'; endT = 0; glare = { x, y, who }; sfx.tone({ f: 180, f2: 150, d: .5, type: 'sawtooth', v: .07, lp: 700 }); fx.word(x, y - 14, '…really?', '#fff', 5.5);
    PK.fail('That symbol doesn’t do that. Try another!');
  }
  function drop(sy, x, y) {
    opsUsed++; const bi = blockerAt(x, y), si = sourceAt(x, y);
    if (bi >= 0) { const b = B[bi]; if (BLOCK[b.k] === sy.k) { b.done = true; b.t = 0; sy.gone = true; resolveFx(b); return; } wrong(b.x, floorY(b.p) - 10, 'b' + bi); sy.back = true; return; }
    if (si >= 0 && si !== sy.src) { const s = S[si]; if (s.lock === sy.k && !s.open) { s.open = true; s.t = 0; sy.gone = true; syms.push(mkSym(si)); sfx.pop(1.3); fx.word(s.x, s.y - 12, s.k === 'cat' ? 'yaaawn' : 'ding!', '#fff', 4.5); return; } wrong(s.x, s.y, 's' + si); sy.back = true; return; }
    sy.back = true; sfx.whoosh(.06);
  }
  function resolveFx(b) {
    const x = b.x, y = floorY(b.p) - 8; sfx.pop(1.1);
    const words = { guard: ['snore…', '#7ab0ff'], boulder: ['KRAK!', '#ffd34d'], fire: ['FSSST', '#bfe8ff'], dark: ['click!', '#fff36a'], bull: ['awww', '#ff8ab0'], pit: ['SPROING', '#7ae07a'], ice: ['drip drip', '#bfe8ff'], cliff: ['hssss~', '#c08aff'] };
    const wd = words[b.k] || ['!', '#fff']; fx.word(x, y - 10, wd[0], wd[1], 5.5); fx.burst(x, y, 12, { col: [wd[1], '#fff'], speed: 26, size: 1.4, shape: 'rect' }); if (b.k === 'boulder') { fx.shake(2.5); sfx.thud(.4); }
  }
  function nextStop() { // how far the hero may walk in its current panel
    for (const b of B) if (b.p === hero.p && !b.done) return b.x - (b.k === 'gutter' ? b.w / 2 + 4 : 12);
    if (hero.p === 2) { const cap = SP.find((s) => s.k === 'caption' && !s.done); return cap ? 60 : 90; }
    return 99;
  }
  function win() { mode = 'won'; winT = 0; let st = 1; if (PK.fails === 0 && !lvRewound) st++; if (opsUsed <= lv.ops) st++; sfx.win(); fx.confetti(50, panelY(2) + 20, 50); PK.win(st); }
  let lvRewound = false;
  // ---------- drawing ----------
  function ink(g, w = .9) { g.strokeStyle = '#111'; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; }
  function drawHero(g, x, y, sk, md, t, walk) {
    g.save(); g.translate(x, y); const b = Math.abs(Math.sin(walk * 8)) * 1.2;
    g.fillStyle = sk.cape; g.beginPath(); g.moveTo(-2, -12 - b); g.quadraticCurveTo(-8 - Math.sin(t * 6) * 1.5, -6, -6, 0); g.lineTo(-1, -4); g.closePath(); g.fill(); ink(g, .6); g.stroke();
    ink(g, 1.4); g.beginPath(); g.moveTo(-1.5, -4 - b); g.lineTo(-2.5 - Math.sin(walk * 8) * 2, 0); g.moveTo(1.5, -4 - b); g.lineTo(2.5 + Math.sin(walk * 8) * 2, 0); g.stroke();
    g.fillStyle = sk.suit; rrect(g, -3.4, -12 - b, 6.8, 8.5, 2); g.fill(); ink(g, .7); g.stroke();
    g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(0, -8.5 - b, 1.4, 0, 7); g.fill();
    g.fillStyle = '#f4c8a0'; g.beginPath(); g.arc(0, -16 - b, 4.2, 0, 7); g.fill(); ink(g, .7); g.stroke();
    g.fillStyle = '#1d1d24'; g.beginPath(); g.arc(0, -18 - b, 4.2, Math.PI, 0); g.fill();
    face(g, .4, -15.6 - b, 3.4, md, t, { ink: '#111' }); g.restore();
  }
  function drawBlocker(g, b, t) {
    const x = b.x, y = floorY(b.p), done = b.done; g.save(); g.translate(x, y);
    if (b.k === 'guard') { const sl = done; g.fillStyle = '#3a4a8a'; rrect(g, -4, -14, 8, 14, 2); g.fill(); ink(g); g.stroke(); g.fillStyle = '#f4c8a0'; g.beginPath(); g.arc(0, -18, 4, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#1d2a5a'; g.fillRect(-4.6, -23, 9.2, 2.6); face(g, 0, -17.6, 3.2, sl ? 'sleep' : 'angry', t, { ink: '#111' }); if (sl) { g.rotate(-.2); text('z', 6, -24 - Math.sin(t * 2) * 2, 3, { g, color: '#7ab0ff', stroke: '#111', sw: .6 }); } else { ink(g, 1); g.beginPath(); g.moveTo(5, -12); g.lineTo(5, 0); g.stroke(); } if (sl) { g.restore(); return; } }
    else if (b.k === 'boulder') { if (done) { g.fillStyle = '#8a8070'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(-8 + k * 4, -1, 1.6, 0, 7); g.fill(); } g.restore(); return; } g.fillStyle = '#9a9080'; PK.blob(g, 0, -9, 9.5, .15, 4, 12); g.fill(); ink(g); g.stroke(); g.fillStyle = PK.pat('halftone'); PK.blob(g, 2, -7, 7, .15, 5, 10); g.fill(); }
    else if (b.k === 'fire') { if (done) { g.fillStyle = '#4a4a4a'; g.fillRect(-6, -2, 12, 2); for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(220,220,220,.6)'; g.beginPath(); g.arc(-3 + k * 3, -6 - ((t * 8 + k * 3) % 12), 2, 0, 7); g.fill(); } g.restore(); return; } for (const [c, s] of [['#ff4a1a', 1], ['#ffb02a', .65], ['#fff36a', .35]]) { g.fillStyle = c; g.beginPath(); g.moveTo(-8 * s, 0); g.quadraticCurveTo(-9 * s, -10 * s, -2 * s + Math.sin(t * 9) * s, -20 * s); g.quadraticCurveTo(0, -12 * s, 3 * s, -16 * s + Math.cos(t * 7)); g.quadraticCurveTo(9 * s, -8 * s, 8 * s, 0); g.closePath(); g.fill(); } ink(g, .6); g.stroke(); }
    else if (b.k === 'dark') { g.fillStyle = done ? 'rgba(255,240,150,.5)' : '#111'; rrect(g, -9, -24, 18, 24, 2); g.fill(); ink(g); g.stroke(); if (!done) { g.fillStyle = '#fff'; g.beginPath(); g.arc(-3, -14, 1, 0, 7); g.arc(3, -14, 1, 0, 7); g.fill(); text('too dark!', 0, -27, 2.6, { g, color: '#fff', stroke: '#111', sw: .5 }); } }
    else if (b.k === 'bull') { if (done) g.translate(0, 6); g.fillStyle = '#8a4a2a'; rrect(g, -9, -12, 16, 9, 3); g.fill(); ink(g); g.stroke(); g.beginPath(); g.arc(-9, -12, 4.6, 0, 7); g.fill(); g.stroke(); ink(g, 1); g.beginPath(); g.moveTo(-12, -15); g.lineTo(-14, -18); g.moveTo(-6, -15); g.lineTo(-4, -18); g.stroke(); face(g, -9, -11.6, 3.2, done ? 'happy' : 'angry', t, { ink: '#111' }); if (!done) { text('SNORT', 6, -18, 2.6, { g, color: '#fff', stroke: '#111', sw: .5 }); } else { text('♥', -9, -20 - Math.sin(t * 3), 3, { g, color: '#ff5a8a', stroke: '#111', sw: .4 }); } }
    else if (b.k === 'pit') { g.fillStyle = '#111'; g.fillRect(-9, -1, 18, 8); if (done) { g.strokeStyle = '#3a9a3a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-9, 0); g.quadraticCurveTo(0, -4, 9, 0); g.stroke(); g.fillStyle = '#5ac05a'; for (let k = -2; k <= 2; k++) { g.beginPath(); g.ellipse(k * 4, -2.4, 1.6, .9, k, 0, 7); g.fill(); } } }
    else if (b.k === 'ice') { if (done) { g.fillStyle = 'rgba(140,200,255,.5)'; g.beginPath(); g.ellipse(0, -.5, 9, 1.4, 0, 0, 7); g.fill(); g.restore(); return; } g.fillStyle = 'rgba(180,225,255,.9)'; rrect(g, -7, -22, 14, 22, 1); g.fill(); ink(g); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = .7; g.beginPath(); g.moveTo(-4, -18); g.lineTo(-1, -12); g.moveTo(2, -20); g.lineTo(4, -15); g.stroke(); }
    else if (b.k === 'cliff') { g.fillStyle = '#a07a50'; g.fillRect(-4, -26, 14, 26); ink(g); g.strokeRect(-4, -26, 14, 26); g.fillStyle = '#c89a60'; g.fillRect(-10, -3, 6, 3); ink(g, .5); g.strokeRect(-10, -3, 6, 3); if (done) { g.strokeStyle = '#5ab05a'; g.lineWidth = 1.8; g.beginPath(); for (let k = 0; k < 10; k++) g.lineTo(-7 + Math.sin(k + t * 3) * 1.2, -3 - k * 2.4); g.stroke(); g.fillStyle = '#5ab05a'; g.beginPath(); g.arc(-7, -27, 1.6, 0, 7); g.fill(); } else text('too high', 3, -29, 2.6, { g, color: '#fff', stroke: '#111', sw: .5 }); }
    else if (b.k === 'door') { g.fillStyle = done ? '#2a1a10' : '#8a5a2a'; rrect(g, -6, -22, 12, 22, 1.5); g.fill(); ink(g); g.stroke(); if (!done) { g.fillStyle = '#fffbe0'; rrect(g, -7, -30, 14, 6, 1); g.fill(); ink(g, .4); g.stroke(); text('Password?', 0, -27, 2.2, { g, color: '#111', shadow: false }); g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(3.5, -11, 1, 0, 7); g.fill(); } }
    if (glare && glare.who === 'b' + B.indexOf(b)) { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(0, -30, 10, 4, 0, 0, 7); g.fill(); ink(g, .5); g.stroke(); text('…really?', 0, -30, 2.6, { g, color: '#111', shadow: false }); }
    g.restore();
  }
  function drawSource(g, s, k, t) {
    const x = s.x, y = s.y; g.save(); g.translate(x, y); const op = s.open;
    const shelf = () => { g.fillStyle = '#8a6a4a'; g.fillRect(-8, 5, 16, 2); ink(g, .5); g.strokeRect(-8, 5, 16, 2); };
    shelf();
    if (s.k === 'cat') { g.fillStyle = '#ff9a4a'; g.beginPath(); g.ellipse(0, 2, 6, 3.4, 0, 0, 7); g.fill(); ink(g, .6); g.stroke(); g.beginPath(); g.arc(-4.6, -.6, 2.8, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-6.6, -2.4); g.lineTo(-6.2, -4.6); g.lineTo(-5, -3); g.moveTo(-3.4, -3); g.lineTo(-2.6, -4.8); g.lineTo(-2, -2.6); g.fill(); face(g, -4.6, -.4, 2.2, op ? 'sleep' : 'angry', t, { ink: '#111' }); if (!op) text('MEOW!', 3, -5, 2.4, { g, color: '#fff', stroke: '#111', sw: .5 }); }
    else if (s.k === 'fireworks') { for (let j = -1; j <= 1; j++) { g.fillStyle = ['#e0302a', '#2a8ae0', '#5ac05a'][j + 1]; g.fillRect(j * 4 - 1.4, -6, 2.8, 10); ink(g, .4); g.strokeRect(j * 4 - 1.4, -6, 2.8, 10); } if (!op) text('unlit', 0, -9, 2.2, { g, color: '#fff', stroke: '#111', sw: .5 }); else { g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(0, -7.5 + Math.sin(t * 20) * .3, .8, 0, 7); g.fill(); } }
    else if (s.k === 'bucket') { g.fillStyle = op ? '#5a8ad0' : '#bfe8ff'; g.beginPath(); g.moveTo(-4.5, -4); g.lineTo(4.5, -4); g.lineTo(3.5, 4); g.lineTo(-3.5, 4); g.closePath(); g.fill(); ink(g, .6); g.stroke(); if (!op) text('frozen', 0, -7, 2.2, { g, color: '#fff', stroke: '#111', sw: .5 }); }
    else if (s.k === 'inventor' || s.k === 'thinker') { g.fillStyle = s.k === 'thinker' ? '#5ac08a' : '#f4f2ea'; rrect(g, -3, -2, 6, 7, 1.5); g.fill(); ink(g, .5); g.stroke(); g.fillStyle = '#f4c8a0'; g.beginPath(); g.arc(0, -5, 3, 0, 7); g.fill(); g.stroke(); face(g, 0, -4.8, 2.4, s.k === 'thinker' ? 'smug' : (op ? 'happy' : 'sleep'), t, { ink: '#111' }); if (s.k === 'inventor') { g.fillStyle = '#ddd'; g.beginPath(); g.arc(-2.6, -7.2, 1.4, 0, 7); g.arc(2.6, -7.2, 1.4, 0, 7); g.fill(); } }
    else if (s.k === 'lovebirds') { for (const j of [-1, 1]) { g.fillStyle = j < 0 ? '#ff8ab0' : '#8ad0ff'; g.beginPath(); g.ellipse(j * 3, 1, 3, 2.6, 0, 0, 7); g.fill(); ink(g, .5); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(j * 3 - j * .8, 0, .45, 0, 7); g.fill(); } }
    else if (s.k === 'jogger') { g.fillStyle = '#e04a4a'; rrect(g, -2.6, -2, 5.2, 6, 1.2); g.fill(); ink(g, .5); g.stroke(); g.fillStyle = '#f4c8a0'; g.beginPath(); g.arc(0, -5, 2.8, 0, 7); g.fill(); g.stroke(); face(g, 0, -4.8, 2.2, op ? 'shock' : 'sleep', t, { ink: '#111' }); }
    else if (s.k === 'dragon') { g.fillStyle = '#5ab05a'; g.beginPath(); g.ellipse(0, 1.5, 6, 3.4, 0, 0, 7); g.fill(); ink(g, .6); g.stroke(); g.beginPath(); g.ellipse(5.5, -1.5, 3, 2.4, 0, 0, 7); g.fill(); g.stroke(); face(g, 5.8, -1.4, 2, op ? 'smug' : 'sleep', t, { ink: '#111' }); if (!op) text('grumpy', -1, -5, 2.2, { g, color: '#fff', stroke: '#111', sw: .5 }); }
    else if (s.k === 'radio') { g.fillStyle = '#c08a5a'; rrect(g, -5, -4, 10, 8, 1.5); g.fill(); ink(g, .6); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(-2, 0, 2, 0, 7); g.fill(); g.fillStyle = op ? '#7dff8a' : '#555'; g.beginPath(); g.arc(3, -1.5, .8, 0, 7); g.fill(); if (!op) text('no idea how', 0, -7, 2.2, { g, color: '#fff', stroke: '#111', sw: .5 }); }
    else if (s.k === 'parrot') { g.fillStyle = '#e04a4a'; g.beginPath(); g.ellipse(0, 0, 3, 4.4, 0, 0, 7); g.fill(); ink(g, .5); g.stroke(); g.fillStyle = '#ffd34d'; g.beginPath(); g.moveTo(2.2, -2); g.lineTo(4.4, -1); g.lineTo(2.2, 0); g.fill(); }
    else if (s.k === 'flower') { g.fillStyle = '#5ab05a'; g.fillRect(-.4, -2, .8, 7); for (let j = 0; j < 5; j++) { const a = j * 1.2566 + t * .3; g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(Math.cos(a) * 2, -3 + Math.sin(a) * 2, 1.3, 0, 7); g.fill(); } }
    if (s.k === 'thinker') { const flip = SP.length >= 0 && flipT > 0; const bx = s.x > 50 ? -14 : 14; g.fillStyle = '#fff'; if (!s.used) { for (const [a, b2, rr] of [[bx * .3, -8, 1], [bx * .55, -11, 1.5]]) { g.beginPath(); g.arc(a, b2, rr, 0, 7); g.fill(); ink(g, .4); g.stroke(); } g.beginPath(); PK.blob(g, bx, -17, 9, .18, 3, 12); g.fill(); ink(g, .6); g.stroke(); text('Open sesame…', bx, -17, 2.2, { g, color: '#111', shadow: false, italic: true }); text('tap', bx, -10.5, 1.8, { g, color: '#c03030', shadow: false }); } else { g.beginPath(); rrect(g, bx - 10, -23, 20, 10, 3); g.moveTo(bx - 2, -13); g.lineTo(0, -8); g.lineTo(bx + 2, -13); g.fill(); ink(g, .6); g.stroke(); text('OPEN SESAME!', bx, -18, 2.4, { g, color: '#111', shadow: false }); } }
    if (glare && glare.who === 's' + k) { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(0, -14, 9, 3.6, 0, 0, 7); g.fill(); text('…really?', 0, -14, 2.4, { g, color: '#111', shadow: false }); }
    g.restore();
  }
  function drawSym(g, sy, t) {
    const L2 = SYM[sy.k], big = L2.t.length > 2; g.save(); g.translate(sy.x, sy.y + (drag && drag.sym === sy ? 0 : Math.sin(t * 3 + sy.hx) * .6)); g.rotate(-.12 + Math.sin(t * 2 + sy.hy) * .04); const s = 1 + (sy.pop < 1 ? (1 - sy.pop) * .6 : 0); g.scale(s, s);
    if (big) { g.fillStyle = L2.c; g.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, rr = k % 2 ? 4.2 : 7; g.lineTo(Math.cos(a) * rr * 1.5, Math.sin(a) * rr * .8); } g.closePath(); g.fill(); ink(g, .5); g.stroke(); text(L2.t, 0, .3, L2.t.length > 5 ? 2.6 : 3.2, { g, color: '#111', font: '"Comic Sans MS","Chalkboard SE","Marker Felt",sans-serif', weight: 900, shadow: false }); }
    else text(L2.t, 0, 0, 5.2, { g, color: L2.c, stroke: '#111', sw: .8, font: '"Comic Sans MS","Chalkboard SE","Marker Felt",sans-serif', weight: 900 });
    g.restore();
  }
  function drawPanels(g, sk) {
    for (let p = 0; p < 3; p++) { const y = panelY(p); g.fillStyle = sk.paper; g.fillRect(PX, y, PW, PHT); const bg = [['#ffe0a0', '#ffb07a'], ['#a0d8ff', '#7ab0e0'], ['#e0c0ff', '#c090f0']][p]; const gr = g.createLinearGradient(0, y, 0, y + PHT); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); g.fillStyle = gr; g.fillRect(PX, y, PW, PHT - 7); g.fillStyle = PK.pat('halftone'); g.fillRect(PX, y, PW, PHT - 7); g.fillStyle = '#c8b090'; g.fillRect(PX, y + PHT - 7, PW, 7); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(PX, y + PHT - 7, PW, 1); ink(g, 1.4); g.strokeRect(PX, y, PW, PHT); }
  }
  const game = {
    id: 'off-the-panel', title: 'Off the Panel', tagline: 'Solve each comic strip by editing the comic itself!', total: TOTAL, worldSize: 15, worlds: WORLDS,
    accent: '#ffd34d', bg0: '#ffe9a0', bg1: '#e0302a', titleCol: '#ffd34d', titleStroke: '#111', titleFont: '"Comic Sans MS","Chalkboard SE","Marker Felt",sans-serif', board: { w: BW, h: BH }, lead: true, skins: SKINS,
    music: { root: 262, scale: [0, 2, 4, 5, 7, 9, 12], bpm: 126, voice: 'pluck', density: .5 },
    clearLines: ['THE END?', 'KA-POW!', 'To be continued…', 'Holy plot twist!', 'Panel-tastic!'],
    tutorial(i) {
      if (i === 0) return 'Only comic stuff moves! Drag the ZZZ (or other symbols) onto what’s in the way';
      if (i === 1) return 'Each symbol does what it means: SPLASH soaks, BOOM blasts, ♥ calms…';
      if (i === 5) return 'Watch out for decoys. A wrong symbol gets a glare!';
      if (i === 30) return 'Tap a thought bubble to say it out loud';
      if (i === 45) return 'Drag the panel gutter to close the gap';
      if (i === 60) return 'Captions are paper too. Peel one off!';
      if (i === 90) return 'Chain reactions: unlock a symbol before you can use it';
      return null;
    },
    goal() { return `★★ no wrong edits · ★ ≤ ${lv.ops} edits`; },
    load(i, seed) { lv = gen(i, seed); lvRewound = false; reset(); PK.unbake('op'); },
    validate: () => !!(lv && lv.order && lv.order.length && lv.order.every((o) => o.t !== 'drop' || o.from >= 0)), sig: () => [lv.blockers.map((b) => b.k + b.p + b.x), lv.sources.map((s) => s.k + s.p + s.x + (s.lock || ''))],
    canRewind: () => !!glare,
    rewind() { glare = null; mode = 'idle'; lvRewound = true; for (const sy of syms) if (sy.back) { sy.x = sy.hx; sy.y = sy.hy; sy.back = false; } return true; },
    cursorStart: () => [50, 60],
    down(x, y) {
      if (mode !== 'idle') return;
      for (const sy of syms) if (!sy.gone && Math.hypot(x - sy.x, y - sy.y) < 7.5) { drag = { sym: sy, ox: sy.x - x, oy: sy.y - y }; sfx.click(); return; }
      for (const b of B) if (b.k === 'gutter' && !b.done && Math.abs(x - b.x) < b.w / 2 + 5 && y > panelY(b.p) && y < panelY(b.p) + PHT) { drag = { gut: b, x0: x, w0: b.w }; sfx.click(); return; }
      for (const s of SP) if (s.k === 'caption' && !s.done && Math.abs(x - s.x) < 16 && Math.abs(y - s.y) < 6) { drag = { cap: s, ox: s.x - x, oy: s.y - y }; sfx.rip(); return; }
      for (let k = 0; k < S.length; k++) { const s = S[k]; if (s.k === 'thinker' && !s.used) { const bx = s.x + (s.x > 50 ? -14 : 14); if (Math.hypot(x - bx, y - (s.y - 17)) < 11) { s.used = true; opsUsed++; sfx.boing(); fx.word(bx, s.y - 26, 'OPEN SESAME!', '#fff', 4.5); const d = B.find((b) => b.k === 'door'); if (d) { d.done = true; sfx.tone({ f: 200, f2: 120, d: .4, type: 'sawtooth', v: .07, lp: 800 }); } return; } } }
    },
    move(x, y) { if (!drag) return; if (drag.sym) { drag.sym.x = x + drag.ox; drag.sym.y = y + drag.oy; } else if (drag.gut) { drag.gut.w = M.clamp(drag.w0 - Math.abs(x - drag.x0) * 1.2, 0, 14); if (drag.gut.w < 1.5 && !drag.gut.done) { drag.gut.done = true; drag.gut.w = 0; opsUsed++; sfx.thud(.3); fx.word(drag.gut.x, floorY(drag.gut.p) - 12, 'SNAP!', '#fff', 5); drag = null; } } else if (drag.cap) { drag.cap.x = x + drag.ox; drag.cap.y = y + drag.oy; } },
    up() { if (!drag) return; if (drag.sym) drop(drag.sym, drag.sym.x, drag.sym.y); else if (drag.gut) { if (!drag.gut.done) drag.gut.w = drag.w0; } else if (drag.cap) { const c = drag.cap; if (Math.hypot(c.x - c.hx, c.y - c.hy) > 14) { c.done = true; opsUsed++; sfx.whoosh(.12); fx.word(c.x, c.y, 'peel!', '#fff', 4); } else { c.x = c.hx; c.y = c.hy; } } drag = null; },
    cancel() { game.up(); },
    step(dt) {
      T += dt; for (const sy of syms) { sy.pop = Math.min(1, sy.pop + dt * 3); if (sy.back && mode !== 'fail') { sy.x = M.approach(sy.x, sy.hx, 12, dt); sy.y = M.approach(sy.y, sy.hy, 12, dt); if (Math.hypot(sy.x - sy.hx, sy.y - sy.hy) < .2) sy.back = false; } }
      if (mode === 'idle') { const stop = nextStop(); if (hero.x < stop - .5) { hero.x = Math.min(stop, hero.x + 26 * dt); hero.walk += dt; } else if (stop >= 99 && hero.p < 2) { hero.p++; hero.x = 6; sfx.whoosh(.05); } else if (hero.p === 2 && stop === 90 && hero.x >= 89.5) win(); }
      if (winT >= 0) winT += dt; if (mode === 'fail') endT += dt;
    },
    drawBg(g, W, H) { g.drawImage(PK.screenBg('op', (b, w, h) => { b.fillStyle = '#ffd34d'; b.fillRect(0, 0, w, h); const cx = w / 2, cy = h * .45; for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; b.fillStyle = k % 2 ? '#ffb02a' : '#ffd34d'; b.beginPath(); b.moveTo(cx, cy); b.arc(cx, cy, Math.max(w, h), a, a + Math.PI / 28); b.closePath(); b.fill(); } b.globalAlpha = .5; b.fillStyle = PK.pat('halftone'); b.fillRect(0, 0, w, h); b.globalAlpha = 1; }), 0, 0, W, H); },
    draw(g, t) {
      const sk = SKINS[PK.skin()] || SKINS[0];
      PK.blit(g, PK.baked('op', (b) => drawPanels(b, sk)), 0, 0);
      for (let p = 0; p < 3; p++) text(['Our hero…', 'Then…', 'Finally!'][p], PX + 2, panelY(p) + 4, 2.6, { g, align: 'left', color: '#111', shadow: false, italic: true, font: '"Comic Sans MS","Chalkboard SE",sans-serif' });
      for (const b of B) if (b.k === 'gutter') { const y = panelY(b.p), bw = b.w; g.fillStyle = sk.paper; g.fillRect(b.x - bw / 2, y - 1, bw, PHT + 2); ink(g, 1.4); if (bw > .5) { g.beginPath(); g.moveTo(b.x - bw / 2, y); g.lineTo(b.x - bw / 2, y + PHT); g.moveTo(b.x + bw / 2, y); g.lineTo(b.x + bw / 2, y + PHT); g.stroke(); g.fillStyle = '#111'; g.fillRect(b.x - bw / 2 + .7, y + PHT - 7, Math.max(0, bw - 1.4), 7); if (!b.done) { text('⟷', b.x, y + PHT / 2 - 6, 4, { g, color: '#e0302a', stroke: '#fff', sw: .6 }); text('drag', b.x, y + PHT / 2 - 1.5, 2, { g, color: '#e0302a', shadow: false }); } } }
      for (const b of B) if (b.k !== 'gutter') drawBlocker(g, b, t);
      S.forEach((s, k) => drawSource(g, s, k, t));
      // goal door + caption
      { const y = floorY(2); g.fillStyle = '#5ac05a'; rrect(g, 86, y - 20, 10, 20, 1.5); g.fill(); ink(g); g.stroke(); text('EXIT', 91, y - 23, 2.4, { g, color: '#111', shadow: false }); }
      for (const s of SP) if (s.k === 'caption' && !(s.done && s.gone)) { g.save(); if (s.done) { s.gone = s.gone || false; } g.translate(s.x, s.y); g.rotate(s.done ? .2 : 0); g.fillStyle = '#ffe680'; g.fillRect(-16, -6, 32, 12); ink(g, .8); g.strokeRect(-16, -6, 32, 12); text('MEANWHILE…', 0, -1.6, 2.8, { g, color: '#111', shadow: false, font: '"Comic Sans MS",sans-serif' }); text('(peel me)', 0, 2.6, 2, { g, color: '#7a5a10', shadow: false }); g.restore(); }
      const md = mode === 'fail' ? 'sour' : mode === 'won' ? 'joy' : (nextStop() - hero.x < 1 ? 'idle' : 'happy');
      drawHero(g, hero.x, floorY(hero.p), sk, md, t, hero.walk);
      if (mode === 'fail' && glare) { const a = Math.min(1, endT * 3); g.save(); g.globalAlpha = a * .9; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(hero.x + 8, floorY(hero.p) - 26, 9, 4, 0, 0, 7); g.fill(); ink(g, .5); g.stroke(); text('-_-', hero.x + 8, floorY(hero.p) - 26, 3, { g, color: '#111', shadow: false }); g.restore(); }
      for (const sy of syms) if (!sy.gone) drawSym(g, sy, t);
      if (mode === 'won') { const a = Math.min(1, winT * 2); g.save(); g.globalAlpha = a; g.translate(50, panelY(1) + 20); g.rotate(-.1); g.scale(.6 + a * .4, .6 + a * .4); g.fillStyle = '#e0302a'; g.beginPath(); for (let k = 0; k < 24; k++) { const an = k / 24 * Math.PI * 2, rr = k % 2 ? 22 : 30; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * .6); } g.closePath(); g.fill(); ink(g, 1.2); g.stroke(); text('THE END?', 0, 0, 7, { g, color: '#ffd34d', stroke: '#111', sw: 1.2, font: '"Comic Sans MS","Chalkboard SE",sans-serif', weight: 900 }); g.restore(); }
    },
    hint(g, step, t) {
      const ops = lv.order; const pos = (o) => { if (o.t === 'drop') { const sy = syms.find((s) => s.src === o.from && !s.gone); const from = sy ? [sy.x, sy.y] : [S[o.from].x, S[o.from].y - 9]; const to = o.to[0] === 'blk' ? [B[o.to[1]].x, floorY(B[o.to[1]].p) - 10] : [S[o.to[1]].x, S[o.to[1]].y]; return [from, to]; } if (o.t === 'tap') { const s = S[o.from]; return [[s.x + (s.x > 50 ? -14 : 14), s.y - 17], null]; } if (o.t === 'gutter') { const b = B[o.b]; return [[b.x, panelY(b.p) + 20], [b.x + 14, panelY(b.p) + 20]]; } const c = SP[o.s]; return [[c.x, c.y], [c.x - 30, c.y - 20]]; };
      const done = (o) => o.t === 'drop' ? (o.to[0] === 'blk' ? B[o.to[1]].done : S[o.to[1]].open) : o.t === 'tap' ? S[o.from].used : o.t === 'gutter' ? B[o.b].done : SP[o.s].done;
      const nxt = ops.find((o) => !done(o)); if (!nxt) return; const [a, b] = pos(nxt);
      g.strokeStyle = '#e0302a'; g.lineWidth = 1; g.beginPath(); g.arc(a[0], a[1], 7 + Math.sin(t * 6), 0, 7); g.stroke();
      if (step >= 2 && b) { g.save(); g.setLineDash([2, 1.5]); g.strokeStyle = '#e0302a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.restore(); g.fillStyle = '#e0302a'; g.beginPath(); g.arc(b[0], b[1], 1.6, 0, 7); g.fill(); }
      if (step >= 3 && b) { const f = (t * .8) % 1; g.globalAlpha = .7; g.fillStyle = '#e0302a'; g.beginPath(); g.arc(M.lerp(a[0], b[0], f), M.lerp(a[1], b[1], f), 2.4, 0, 7); g.fill(); g.globalAlpha = 1; }
    },
    qaFail() { const bad = syms.find((s) => !s.gone && S[s.src].decoy) || syms[0]; const b = B.find((x) => !x.done && x.k !== 'gutter' && x.k !== 'door' && BLOCK[x.k] !== bad.k); if (b) drop(bad, b.x, floorY(b.p) - 10); else wrong(50, 50, 'x'); },
    qa() {
      const acts = [];
      for (const o of lv.order) {
        if (o.t === 'drop') { const s = S[o.from]; const hx = s.x + (s.x > 50 ? -6 : 6), hy = s.y - 9; const to = o.to[0] === 'blk' ? [lv.blockers[o.to[1]].x, floorY(lv.blockers[o.to[1]].p) - 10] : [S[o.to[1]].x, S[o.to[1]].y]; acts.push({ t: 'drag', pts: [[hx, hy], to], wait: 30, hold: 80, after: 350 }); }
        else if (o.t === 'tap') { const s = S[o.from]; acts.push({ t: 'tap', x: s.x + (s.x > 50 ? -14 : 14), y: s.y - 17, wait: 300 }); }
        else if (o.t === 'gutter') { const b = lv.blockers[o.b]; acts.push({ t: 'drag', pts: [[b.x, panelY(b.p) + 20], [b.x + 14, panelY(b.p) + 20]], wait: 30, after: 300 }); }
        else { const c = lv.specials[o.s]; acts.push({ t: 'drag', pts: [[c.hx, c.hy], [c.hx - 30, c.hy - 18]], wait: 30, after: 300 }); }
      }
      acts.push({ t: 'wait', ms: 9000 }); return acts;
    },
    drawTitle(g, W, H, t, hb) { const s = Math.min(hb.w / 90, hb.h / 50), sk = SKINS[PK.skin()] || SKINS[0]; g.save(); g.translate(W / 2, hb.y + hb.h * .55); g.scale(s, s); g.fillStyle = sk.paper; g.fillRect(-40, -22, 80, 40); ink(g, 1.4); g.strokeRect(-40, -22, 80, 40); g.fillStyle = PK.pat('halftone'); g.fillRect(-40, -22, 80, 40); drawHero(g, -14, 12, sk, 'smug', t, t * .3); drawSym(g, { k: 'boom', x: 14 + Math.sin(t) * 4, y: -6, hx: 0, hy: 0, pop: 1 }, t); drawSym(g, { k: 'zzz', x: 26, y: 8, hx: 1, hy: 2, pop: 1 }, t); g.restore(); },
    drawSkin(g, i, x, y, r) { g.save(); g.translate(x, y + r * .8); g.scale(r / 12, r / 12); drawHero(g, 0, 0, SKINS[i], 'happy', PK.t, 0); g.restore(); },
  };
  PK.run(game);
})();
