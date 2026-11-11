// 模式线程：在 Web Worker 中运行大气模式，主线程只负责显示
import { Model } from './model.js';

let model = null, playing = true, speed = 86400 / 2; // model seconds per real second
let lastReal = 0, budgetMs = 35, lastPost = 0, stepsDone = 0;

async function load(initDate) {
  const base = new URL('../data/', import.meta.url);
  const meta = await (await fetch(new URL('clim.json', base))).json();
  const buf = await (await fetch(new URL('clim16.bin', base))).arrayBuffer();
  const nb = meta.nblocks, N = meta.nx * meta.ny;
  const lo = new Float32Array(buf, 0, nb), sc = new Float32Array(buf, nb * 4, nb), q = new Int16Array(buf, nb * 8, nb * N);
  const clim = new Float32Array(nb * N);
  for (let b = 0; b < nb; b++) { const l = lo[b], s = sc[b], o = b * N; for (let n = 0; n < N; n++) clim[o + n] = (q[o + n] + 32500) * s + l; }
  model = new Model(meta, clim, { dt: 200 });
  // warm start from a pre-spun-up anomaly state of the nearest season, then perturb randomly
  const seasons = [1, 4, 7, 10];
  const mon = initDate.mon; let best = 1, bd = 99;
  for (const s of seasons) { const d = Math.min(Math.abs(s - mon), 12 - Math.abs(s - mon)); if (d < bd) { bd = d; best = s; } }
  try {
    const ib = await (await fetch(new URL(`init_${best}.bin`, base))).arrayBuffer();
    const i16 = new Int16Array(ib); const a = new Float32Array(i16.length);
    for (let x = 0; x < a.length; x++) a[x] = i16[x] * 0.01;
    // pi anomaly stored x1000 more precisely
    const K = model.K; for (let n = 3 * K * N; n < a.length; n++) a[n] = i16[n] * 0.00001;
    model.importState(a, 0.9);
  } catch (e) { /* cold start */ }
  model.addNoise(0.6);
  model.setDate(initDate.mon, initDate.day, initDate.hour);
  // brief spin-up so the stochastic noise is dynamically balanced (12 model hours)
  for (let i = 0; i < 180; i++) model.step();
  model.setDate(initDate.mon, initDate.day, initDate.hour);
  postMessage({ type: 'ready', meta: { nx: meta.nx, ny: meta.ny, res: meta.res, lon0: meta.lon0, lat0: meta.lat0, levs: meta.levs }, H: new Float32Array(model.H), LF: new Float32Array(model.LF) });
  post();
  lastReal = performance.now();
  loop();
}

function post() {
  const o = model.diagnose();
  const fields = ['slp', 'z500', 't2m', 't850', 'precip', 'u10', 'v10', 'u500', 'v500', 'usteer', 'vsteer', 'sst', 'tAnom'];
  const climT2 = new Float32Array(model.c2d.t2m), climPr = new Float32Array(model.c2d.pr);
  const msg = { type: 'frame', t: o.t, year: o.year, date: o.date, enso: o.enso, wpsh: o.wpsh, climMonth: model.climMonthW, climT2, climPr, stepsDone };
  const tr = [climT2.buffer, climPr.buffer];
  for (const f of fields) { msg[f] = o[f]; tr.push(o[f].buffer); }
  postMessage(msg, tr);
}

function loop() {
  const now = performance.now();
  const realDt = Math.min(0.25, (now - lastReal) / 1000); lastReal = now;
  if (playing && model) {
    let want = speed * realDt; // model seconds to advance
    const t0 = performance.now();
    while (want > 0 && performance.now() - t0 < budgetMs) { model.step(); stepsDone++; want -= model.dt; }
    if (now - lastPost > 90) { post(); lastPost = now; }
  }
  setTimeout(loop, playing ? 4 : 60);
}

onmessage = (e) => {
  const d = e.data;
  if (d.type === 'init') load(d.date);
  else if (d.type === 'play') { playing = true; }
  else if (d.type === 'pause') { playing = false; if (model) post(); }
  else if (d.type === 'speed') { speed = d.value; }
  else if (d.type === 'setDate') { model.setDate(d.mon, d.day, d.hour ?? 0); post(); }
  else if (d.type === 'stepOnce') { for (let i = 0; i < d.n; i++) model.step(); post(); }
};
