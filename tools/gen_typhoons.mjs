// Auto-generate a year of typhoons for one simulated year (Oct 1 -> Sep 30).
// Motion = the typhoon-simulator's own step (TyPhysics.stepMember: subtropical-high slab, WNW south of the
// ridge edge, due-N leg, ENE after recurvature, beta drift, Taiwan mountain attraction, its intensity physics).
// The subtropical high uses the simulator's representation (ridgeSlabRing with a bent northern edge), but its
// daily ridge latitude, west-extension point and strength come from competition with cold air in THAT year's
// precomputed model fields (East-China / north-of-ridge temperature anomaly).
// node tools/gen_typhoons.mjs yNN seed
import fs from 'fs'; import vm from 'vm'; import zlib from 'zlib';
for (const f of ['land-mask-data.js', 'mountain-data.js', 'geo.js', 'physics.js', 'typhoon-names-zh.js'])
  vm.runInThisContext(fs.readFileSync(new URL('./tysim/' + f, import.meta.url), 'utf8'));
const P = globalThis.TyPhysics, G = globalThis.TyGeo, NAMES = [...new Set(Object.values(globalThis.TyNamesZh.MAP))];
const D = '/workspace/xtp-weather-sim/data/';
const meta = JSON.parse(fs.readFileSync(D + 'clim.json'));
const b = fs.readFileSync(D + 'clim.bin'); const clim = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
const name = process.argv[2], seed = +process.argv[3] || 1;
let s = seed >>> 0; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
const NX = meta.nx, NY = meta.ny, N = NX * NY, PM = meta.perMonth;
const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const mids = []; { let c = 0; for (let i = 0; i < 12; i++) { mids.push(c + MD[i] / 2); c += MD[i]; } }
function pair(doy) {
  if (doy < mids[0]) return [11, 0, (doy + 365 - mids[11]) / (mids[0] + 365 - mids[11])];
  if (doy >= mids[11]) return [11, 0, (doy - mids[11]) / (mids[0] + 365 - mids[11])];
  for (let i = 0; i < 11; i++) if (doy < mids[i + 1]) return [i, i + 1, (doy - mids[i]) / (mids[i + 1] - mids[i])];
}
function bil(off, lon, lat) {
  let fi = (lon - meta.lon0) / meta.res, fj = (lat - meta.lat0) / meta.res;
  fi = Math.max(0, Math.min(NX - 1.001, fi)); fj = Math.max(0, Math.min(NY - 1.001, fj));
  const i = fi | 0, j = fj | 0, a = fi - i, c = fj - j, n = off + j * NX + i;
  return (clim[n] * (1 - a) + clim[n + 1] * a) * (1 - c) + (clim[n + NX] * (1 - a) + clim[n + NX + 1] * a) * c;
}
let curDoy = 0;
function sst(lon, lat, doy) { const [m0, m1, w] = pair(doy); return bil(m0 * PM + 22 * N, lon, lat) * (1 - w) + bil(m1 * PM + 22 * N, lon, lat) * w; }
G.getSst = (lon, lat) => sst(lon, lat, curDoy); // the simulator's intensity physics reads the model's SST climatology
const landC = new Map(); const land = (lon, lat) => { const k = Math.round(lon * 20) * 4000 + Math.round(lat * 20); let r = landC.get(k); if (r === undefined) { r = G.isLand(lon, lat) ? 1 : 0; landC.set(k, r); } return r; };

// ---- cold-air index from this year's precomputed fields (T anomaly over East China / north of the ridge) ----
const ym = JSON.parse(fs.readFileSync(D + `w/${name}.json`));
const raw = new Int8Array(zlib.gunzipSync(fs.readFileSync(D + `w/${name}.bin`)).buffer.slice(0));
const YNP = ym.nx * ym.ny, YL = 3 * YNP;
const prevT = new Int8Array(YNP), coldF = [];
for (let f = 0; f < ym.nf; f++) {
  let sum = 0, n = 0;
  for (let k = 0; k < YNP; k++) { const v = (prevT[k] + raw[f * YL + k]) << 24 >> 24; prevT[k] = v; }
  for (let j = 0; j < ym.ny; j++) { const lat = ym.lat0 + j * ym.res; if (lat < 28 || lat > 45) continue;
    for (let i = 0; i < ym.nx; i++) { const lon = ym.lon0 + i * ym.res; if (lon < 105 || lon > 128) continue; sum += prevT[j * ym.nx + i] / ym.scale[0]; n++; } }
  // also step through the wind deltas so the next frame's T deltas line up (they are interleaved per frame)
  coldF.push(sum / n);
}
const days = Math.floor((ym.nf - 1) / 4), dayT = [];
for (let d = 0; d < days; d++) { let a = 0; for (let q = 0; q < 4; q++) a += coldF[d * 4 + q]; dayT.push(a / 4); }
const coldAt = (d) => coldIdx[Math.min(days - 1, (Math.floor(d) + 92) % 365)];
const runMean = (arr, w) => arr.map((_, i) => { let a = 0, n = 0; for (let k = i - w; k <= i + w; k++) if (k >= 0 && k < arr.length) { a += arr[k]; n++; } return a / n; });
const t5 = runMean(dayT, 2), t21 = runMean(dayT, 10);
const sd = Math.sqrt(dayT.reduce((a, v) => a + v * v, 0) / dayT.length) || 1;
const coldIdx = dayT.map((_, d) => Math.max(-2.5, Math.min(2.5, (0.55 * t5[d] + 0.75 * t21[d]) / sd))); // >0 warm (weak cold air)

// ---- subtropical high: analytic 500 hPa height-like field  h = 5880 + A·(s(lon) − ((lat−φr(lon))/w)²)
// (ridge line φr, west-extension point lonW, half-width w ~ strength). The 588 contour (h=5880) is a closed area
// that can sit over land; it is handed to the typhoon simulator as its 副高 polygon (fugenList).
// Monthly climatology (ridge lat near 130E, west-extension point), day-to-day/yearly variation from the cold-air index.
const RID = [16, 16, 17, 16.5, 18, 21.5, 28.5, 31, 26.5, 23, 21, 18];
const LONW = [125, 125, 123, 122, 119, 116, 111, 110, 110, 113, 118, 123];
const WID = [5.5, 5.5, 5.5, 5.8, 6.2, 7.2, 7.3, 7.5, 5.6, 5.0, 5.0, 5.3]; // north edge ≈ simulator's green line
const yrShift = 0.7 * gauss();
function smoothPair(doy) { const [m0, m1, w] = pair(doy); return [m0, m1, w * w * (3 - 2 * w)]; }
function highParams(dayIdx) {
  const doy = dayIdx % 365, [m0, m1, w] = smoothPair(doy), C = coldAt(dayIdx) + 0.5 * yrShift;
  const phi = RID[m0] * (1 - w) + RID[m1] * w + Math.max(-2, Math.min(doy > 180 && doy < 245 ? 3.5 : 2.5, 1.1 * C)); // summer strong years: ridge up to ~33–35N
  const lonW = Math.max(100, Math.min(145, LONW[m0] * (1 - w) + LONW[m1] * w - Math.max(-8, Math.min(10, 6 * C))));
  const wid = Math.max(3.5, Math.min(9, WID[m0] * (1 - w) + WID[m1] * w + 0.9 * C));
  const dTr = Math.max(0, -C) * 1.8; // cold trough digging south over East China
  return [lonW, phi, wid, dTr];
}
// shared with js/app.js (keep identical)
function ring588(prm) {
  const [lonW, phi, wid, dTr] = prm;
  const sOf = (lon) => Math.pow(Math.max(0, Math.min(1, (lon - lonW) / 7)), 0.45) * Math.pow(Math.max(0, Math.min(1, (200 - lon) / 8)), 0.5);
  const ridge = (lon) => phi + 0.06 * (lon - 130) - dTr * Math.exp(-Math.pow((lon - 118) / 10, 2));
  const N = [], S = [];
  for (let lon = lonW; lon <= 200; lon += (lon < lonW + 8 ? 1 : 3)) { const q = Math.sqrt(sOf(lon)), r = ridge(lon); N.push([lon, r + wid * q]); S.push([lon, Math.min(r - 1, r - (r - 4) * Math.pow(q, 0.6))]); }
  return { ring: [...S, ...N.reverse(), S[0]], ridge };
}
const EL = []; for (let lon = 100; lon <= 180; lon += 5) EL.push(lon);
function highFor(dayIdx) {
  const prm = highParams(dayIdx), C = coldAt(dayIdx), R = ring588(prm);
  const north = (lon) => { const q = Math.sqrt(Math.pow(Math.max(0, Math.min(1, (lon - prm[0]) / 7)), 0.45)); return R.ridge(lon) + prm[2] * q; };
  return { list: [{ id: 'wnp_slab', name: '西北太副高', ring: R.ring }], prm, ridge: EL.map(lon => [lon, north(lon)]), C,
    cfg: { steerU: -3 - 0.5 * C, steerV: 1.5, westerlyU: 8 - 1.5 * C, betaStrength: 1, steerMonth: null, steerDekad: null, steerPattern: null } };
}
const HIGH = []; for (let d = 0; d < days; d++) HIGH.push(highFor(d));

// ---- genesis (~30–38 per year, mostly Jun–Nov) ----
const RATE = [0.45, 0.3, 0.45, 0.75, 1.3, 2.3, 4.6, 6.6, 5.9, 4.4, 2.9, 1.4];
const yrFac = Math.exp(0.08 * gauss());
const storms = []; let nameIdx = Math.floor(rnd() * NAMES.length);
const HOURS = days * 24;
for (let h = 0; h < HOURS; h += 6) {
  const doy = (h / 24) % 365; let mo = 0, d = doy; while (mo < 11 && d >= MD[mo]) { d -= MD[mo]; mo++; }
  if (rnd() > RATE[mo] * 1.3 * yrFac / (MD[mo] * 4)) continue;
  const summer = mo >= 5 && mo <= 10;
  let lon, lat;
  if (rnd() < (summer ? 0.14 : 0.08)) { lon = 111 + 8 * rnd(); lat = 12 + 8 * rnd(); }        // South China Sea
  else if (summer) { lon = 124 + 36 * rnd(); lat = 9 + 15 * rnd(); }
  else { lon = 126 + 30 * rnd(); lat = 5 + 9 * rnd(); }
  if (land(lon, lat) || sst(lon, lat, doy) < 26.5) continue;
  const hi = HIGH[Math.floor(h / 24)]; let e = null; for (const q of hi.ridge) if (q[0] >= lon) { e = q[1]; break; }
  if (e != null && lon < hi.prm[0]) e = hi.prm[1] + 0.06 * (lon - 130);
  if (e != null && lat > e - 2) continue; // genesis happens on the south side of the high
  storms.push({ h0: h, lon, lat, vmax: 14 + 2 * rnd(), envF: 0.2 + 0.45 * rnd(), capF: 0.42 + 0.58 * rnd() ** 1.3, alive: true, et: 0, out: [], track: [],
    cfgPerturb: null, pert: { su: 0.25 * gauss(), wu: 0.6 * gauss(), beta: 1 + 0.08 * gauss() } });
}
const posAt = (o, h) => { for (const p of o.out) if (p[0] === h) return p; return null; };
let flagged = 0, clamped = 0;
for (const st of storms) {
  if (storms.some(o => o !== st && o.out.length && o.out[0][0] <= st.h0 && o.out[o.out.length - 1][0] >= st.h0 && (() => { const p = posAt(o, st.h0 - st.h0 % 3); return p && Math.hypot((p[1] - st.lon) * Math.cos(st.lat * Math.PI / 180), p[2] - st.lat) < 9; })())) continue;
  let hole = null;
  for (let h = st.h0; h < HOURS && st.alive; h++) {
    const di = Math.floor(h / 24), hi = HIGH[di]; curDoy = (h / 24) % 365;
    const cfg = Object.assign({}, hi.cfg); cfg.steerU += st.pert.su; cfg.westerlyU += st.pert.wu; cfg.betaStrength *= st.pert.beta;
    st.cfgPerturb = cfg;
    if (!hole) hole = P.ensureBirthHole(st.lon, st.lat, st.vmax, hi.list); else hole = P.updateHole(hole, st.lon, st.lat, st.vmax);
    const lon0 = st.lon, lat0 = st.lat, v0 = st.vmax;
    P.stepMember(st, 1, cfg, hi.list, null, hole);
    // motion sanity: south of the ridge edge a storm never moves S/SW or E/SE
    const edge = G.guidingNorthernEdgeLat(st.lon, hi.list, null);
    const south = edge == null ? st.lat < 25 : st.lat < edge - 1;
    if (st.lat < lat0 - 0.005 || (south && st.lon > lon0 + 0.005)) clamped++;
    if (st.lat < lat0) st.lat = lat0; if (south && st.lon > lon0) st.lon = lon0;
    // intensity: the simulator's tendency, slowed by a per-storm shear / dry-air factor; ET over cold water
    let dV = st.vmax - v0; if (dV > 0) { dV *= st.envF; const cap = st.capF * P.mpi(sst(st.lon, st.lat, curDoy)); if (v0 > cap) dV = -0.05 * (v0 - cap); }
    if (st.lat > 30 && sst(st.lon, st.lat, curDoy) < 25.5) st.et = Math.min(1, st.et + 1 / 36);
    if (st.et > 0) dV -= 0.12 * st.et;
    st.vmax = Math.max(5, Math.min(82, v0 + dV));
    st.alive = st.vmax >= P.DISSIPATE_MS || h - st.h0 < 24;
    if (h % 3 === 0) st.out.push([h, +st.lon.toFixed(2), +st.lat.toFixed(2), +st.vmax.toFixed(1), Math.round(Math.max(18, Math.min(90, (70 - 0.6 * (st.vmax - 15)) * (0.8 + 0.4 * st.envF)))), +st.et.toFixed(2)]);
    if (st.lat > 52 || st.lon > 179 || st.lon < 100.5 || st.lat < 1) st.alive = false;
  }
}
const out = storms.filter(s => s.out.length > 8 && Math.max(...s.out.map(p => p[3])) >= 17.2).map(s => ({ name: NAMES[nameIdx++ % NAMES.length], track: s.out }));
// motion check on output (3-hourly segments): count S/SW or (south of the edge) E/SE segments
let bad = 0, segs = 0;
for (const s of out) for (let k = 1; k < s.track.length; k++) { const a = s.track[k - 1], c = s.track[k], hi = HIGH[Math.min(days - 1, Math.floor(c[0] / 24))];
  const e = G.guidingNorthernEdgeLat(c[1], hi.list, null); const south = e == null ? c[2] < 25 : c[2] < e - 1; segs++;
  if (c[2] < a[2] - 0.05 || (south && c[1] > a[1] + 0.05)) { bad++; if (process.env.DBG) console.error(s.name, a, c, e); } }
const high = HIGH.map(h => h.prm.map(v => Math.round(v * 100) / 100));
fs.writeFileSync(D + `w/${name}.ty.json`, JSON.stringify({ storms: out, high: { v: 2, days: high } }));
const cat = (v) => v >= 51 ? 'SuperTY' : v >= 41.5 ? 'STY' : v >= 32.7 ? 'TY' : v >= 24.5 ? 'STS' : 'TS';
const cnt = {}; let zj = 0, sh = 0, gd = 0, cn = 0, mx = 0; const mon = new Array(12).fill(0);
for (const s of out) { const m = Math.max(...s.track.map(p => p[3])); mx = Math.max(mx, m); cnt[cat(m)] = (cnt[cat(m)] || 0) + 1;
  mon[new Date(Date.UTC(2025, 0, 1) + s.track[0][0] * 3600e3).getUTCMonth()]++;
  const lf = s.track.find((p, k) => k > 0 && land(p[1], p[2]) && !land(s.track[k - 1][1], s.track[k - 1][2]) && p[3] >= 17.2);
  if (lf) { if (lf[1] > 105 && lf[1] < 123 && lf[2] > 18 && lf[2] < 41) cn++; if (lf[1] > 118.5 && lf[1] < 123 && lf[2] >= 27.0 && lf[2] < 30.8) zj++; if (lf[1] > 120.8 && lf[1] < 122.5 && lf[2] >= 30.8 && lf[2] < 32) sh++; if (lf[1] > 107.5 && lf[1] < 117.2 && lf[2] > 20 && lf[2] < 23.6) gd++; } }
console.log(JSON.stringify({ name, storms: out.length, cat: cnt, peak: +mx.toFixed(0), chinaLandfall: cn, zhejiang: zj, shanghai: sh, guangdongGuangxi: gd, months: mon.join(','), badSegs: bad, segs, clampedSteps: clamped }));
