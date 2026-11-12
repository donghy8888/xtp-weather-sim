// Auto-generate a year of typhoons for one season file (Oct 1 -> Sep 30), reusing the
// typhoon-simulator's physics (intensityTendency: SST/MPI, land & mountain decay; betaDrift;
// Natural Earth land + mountain masks). Steering = model-climatology deep-layer (850-300 hPa)
// mean flow for the date + per-year subtropical-high shift + per-storm red-noise perturbation.
// node tools/gen_typhoons.mjs yNN seed
import fs from 'fs'; import vm from 'vm';
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
const W = [[1, 0.25], [2, 0.3], [3, 0.25], [4, 0.2]];
function steer(lon, lat, doy) {
  const [m0, m1, w] = pair(doy); let u = 0, v = 0;
  for (const [k, wk] of W) for (const [m, wm] of [[m0, 1 - w], [m1, w]]) { u += wk * wm * bil(m * PM + k * N, lon, lat); v += wk * wm * bil(m * PM + 6 * N + k * N, lon, lat); }
  return [u, v];
}
function sst(lon, lat, doy) { const [m0, m1, w] = pair(doy); return bil(m0 * PM + 22 * N, lon, lat) * (1 - w) + bil(m1 * PM + 22 * N, lon, lat) * w; }
const landC = new Map(); const land = (lon, lat) => { const k = Math.round(lon * 20) * 4000 + Math.round(lat * 20); let r = landC.get(k); if (r === undefined) { r = (G.isLand(lon, lat) ? 1 : 0) + (G.isMountain(lon, lat) ? 2 : 0); landC.set(k, r); } return r; };
// climatological genesis rate per month (Jan..Dec), ~26/yr
const RATE = [0.4, 0.3, 0.4, 0.7, 1.1, 1.7, 3.8, 5.6, 4.9, 3.6, 2.3, 1.2];
const yrFac = Math.exp(0.18 * gauss()), wpshShift = 1.6 * gauss(), steerAmp = 1.0 + 0.1 * gauss();
const storms = []; let nameIdx = Math.floor(rnd() * NAMES.length);
const HOURS = 365 * 24;
for (let h = 0; h < HOURS; h += 6) {
  const doy = (273 + h / 24) % 365; let mo = 0, d = doy; while (mo < 11 && d >= MD[mo]) { d -= MD[mo]; mo++; }
  if (rnd() > RATE[mo] * 1.3 * yrFac / (MD[mo] * 4)) continue;
  const summer = mo >= 5 && mo <= 10;
  let lon, lat;
  if (rnd() < (summer ? 0.14 : 0.08)) { lon = 111 + 8 * rnd(); lat = 12 + 8 * rnd(); }        // South China Sea
  else if (summer) { lon = 125 + 37 * rnd(); lat = 9 + 14 * rnd(); }
  else { lon = 126 + 30 * rnd(); lat = 5 + 8 * rnd(); }
  if (land(lon, lat) & 1 || sst(lon, lat, doy) < 26.5) continue;
  storms.push({ h0: h, lon, lat, vmax: 13 + 3 * rnd(), size: 0.8 + 0.5 * rnd(), pu: 0, pv: 0, beta: 0.8 + 0.5 * rnd(), envF: 0.12 + 0.3 * rnd(), capF: 0.38 + 0.62 * rnd(), track: [], alive: true, et: 0 });
}
const near = (st) => storms.some(o => o !== st && o.track.length && o.track[0][0] <= st.h0 && o.track[o.track.length - 1][0] >= st.h0 &&
  o.track.some(p => p[0] === st.h0 - st.h0 % 3 && Math.hypot((p[1] - st.lon) * Math.cos(st.lat * Math.PI / 180), p[2] - st.lat) < 10));
for (const st of storms) {
  if (near(st)) { st.track = []; continue; } // keep storms apart at birth (no clusters)
  for (let h = st.h0; h < HOURS && st.alive; h++) {
    const doy = (273 + h / 24) % 365;
    let [u, v] = steer(st.lon, st.lat - wpshShift * Math.max(0, 1 - Math.abs(st.lat - 28) / 15), doy);
    u *= steerAmp; v *= steerAmp;
    st.pu += (-st.pu / 72 + 0.33 * gauss() * Math.sqrt(2 / 72) * 1.8); st.pv += (-st.pv / 72 + 0.33 * gauss() * Math.sqrt(2 / 72) * 1.8);
    const bd = P.betaDrift(st.lat, st.beta * Math.min(1, st.vmax / 30 + 0.4));
    u += st.pu * 3 + bd.u; v += st.pv * 3 + bd.v;
    st.lon += u * 3600 / (111e3 * Math.cos(st.lat * Math.PI / 180)); st.lat += v * 3600 / 111e3;
    const L = land(st.lon, st.lat), T = sst(st.lon, st.lat, doy);
    let dV;
    if (L & 1) { // land decay (typhoon-simulator rule, mountain faster)
      dV = (-1.25 - (st.vmax / 35) * 1.45 - (L & 2 ? 5.5 : 0)) * 0.30;
    } else {
      dV = P.intensityTendency(st.lon, st.lat, st.vmax, T).dV;
      if (dV > 0) { dV *= st.envF; const cap = st.capF * P.mpi(T); if (st.vmax > cap) dV = -0.05 * (st.vmax - cap); } // vertical shear / dry air
    }
    if (st.lat > 30 && T < 25.5) st.et = Math.min(1, st.et + 1 / 36); // extratropical transition over cold water
    if (st.et > 0) dV -= 0.12 * st.et;
    st.vmax = Math.max(5, Math.min(85, st.vmax + dV));
    if (h % 3 === 0) st.track.push([h, +st.lon.toFixed(2), +st.lat.toFixed(2), +st.vmax.toFixed(1), Math.round(Math.max(18, Math.min(90, (70 - 0.6 * (st.vmax - 15)) * st.size))), +st.et.toFixed(2)]);
    if ((st.vmax < 12 && h - st.h0 > 24) || st.lat > 52 || st.lon > 178 || st.lon < 92 || st.lat < 1) st.alive = false;
  }
}
const out = storms.filter(s => s.track.length > 8 && Math.max(...s.track.map(p => p[3])) >= 17.2).map(s => ({ name: NAMES[nameIdx++ % NAMES.length], track: s.track }));
fs.writeFileSync(D + `w/${name}.ty.json`, JSON.stringify(out));
const cat = (v) => v >= 51 ? 'SuperTY' : v >= 41.5 ? 'STY' : v >= 32.7 ? 'TY' : v >= 24.5 ? 'STS' : 'TS';
const cnt = {}; let cn = 0;
for (const s of out) { const m = Math.max(...s.track.map(p => p[3])); cnt[cat(m)] = (cnt[cat(m)] || 0) + 1; if (s.track.some(p => p[1] > 105 && p[1] < 123 && p[2] > 18 && p[2] < 41 && (land(p[1], p[2]) & 1))) cn++; }
console.log(name, 'storms', out.length, JSON.stringify(cnt), 'China-land', cn, 'yrFac', yrFac.toFixed(2), 'shift', wpshShift.toFixed(1));
