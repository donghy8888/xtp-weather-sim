// 西太平洋天气模拟器 —— 显示与交互
const $ = (id) => document.getElementById(id);
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const KX = Math.cos(35 * Math.PI / 180); // 等距圆柱投影的经向压缩
const LON0 = 60, LON1 = 190, LAT0 = -6, LAT1 = 70;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const cv = { base: $('base'), field: $('field'), wind: $('wind'), over: $('over') };
const ctx = {}; for (const k in cv) ctx[k] = cv[k].getContext('2d');
let W = 0, H = 0;
const view = { s: 10, ox: 0, oy: 0 }; // px per degree latitude (CSS px), offsets
let dirtyBase = true, dirtyField = true, dirtyOver = true, windClear = true;
const X = (lon) => view.ox + (lon - LON0) * KX * view.s;
const Y = (lat) => view.oy + (LAT1 - lat) * view.s;
const LONf = (x) => (x - view.ox) / (KX * view.s) + LON0;
const LATf = (y) => LAT1 - (y - view.oy) / view.s;

function resize() {
  W = innerWidth; H = innerHeight;
  for (const k in cv) { cv[k].width = Math.round(W * DPR); cv[k].height = Math.round(H * DPR); }
  dirtyBase = dirtyField = dirtyOver = windClear = true;
}
function fitView() {
  // show roughly 88E-182E, -2N-62N
  const s1 = W / ((182 - 88) * KX), s2 = (H - 40) / (62 - (-2));
  view.s = Math.min(s1, s2);
  view.ox = W / 2 - ((135 - LON0) * KX * view.s);
  view.oy = H / 2 + 10 - ((LAT1 - 30) * view.s);
  clampView();
}
function clampView() {
  const minS = Math.min(W / ((LON1 - LON0) * KX), H / (LAT1 - LAT0)) * 0.9;
  view.s = Math.max(minS, Math.min(view.s, 260));
  const mw = (LON1 - LON0) * KX * view.s, mh = (LAT1 - LAT0) * view.s;
  const padX = W * 0.4, padY = H * 0.4;
  view.ox = Math.min(padX, Math.max(W - mw - padX, view.ox));
  view.oy = Math.min(padY, Math.max(H - mh - padY, view.oy));
}

// ---------------- data ----------------
let geo = null, relief = null, reliefS = null, hires = null, meta = null, frame = null;
const paths = {};
async function loadStatic() {
  const [g, hj, hb] = await Promise.all([
    fetch('data/geo.json').then(r => r.json()),
    fetch('data/hires.json').then(r => r.json()),
    fetch('data/hires.bin').then(r => r.arrayBuffer()),
  ]);
  geo = g;
  relief = await loadImg('data/relief.jpg');
  const n = hj.nx * hj.ny, u8 = new Uint8Array(hb);
  hires = { ...hj, T: [], P: [] };
  for (let m = 0; m < 12; m++) {
    const t = new Float32Array(n), p = new Float32Array(n);
    for (let i = 0; i < n; i++) { t[i] = u8[m * n + i] / 2 - 50; const v = u8[12 * n + m * n + i] / 40; p[i] = v * v; }
    hires.T.push(t); hires.P.push(p);
  }
  for (const k of ['coast0', 'coast1', 'lakes0', 'lakes1', 'rivers', 'prov', 'border']) {
    const p = new Path2D();
    for (const l of geo[k]) { p.moveTo((l[0] - LON0) * KX, LAT1 - l[1]); for (let i = 2; i < l.length; i += 2) p.lineTo((l[i] - LON0) * KX, LAT1 - l[i + 1]); }
    paths[k] = p;
  }
}
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

// ---------------- base map ----------------
function drawBase() {
  const c = ctx.base; c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = '#123a66'; c.fillRect(0, 0, W, H);
  if (relief) {
    const x0 = X(LON0 - 0.025), y0 = Y(LAT1 + 0.025), x1 = X(LON1 + 0.025), y1 = Y(LAT0 - 0.025);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(relief, x0, y0, x1 - x0, y1 - y0);
  }
  if (!geo) return;
  const hi = view.s > 22;
  c.save(); c.setTransform(DPR * view.s, 0, 0, DPR * view.s, DPR * view.ox, DPR * view.oy);
  const lw = (px) => px / view.s;
  if (hi) { c.strokeStyle = '#5ea4dd'; c.lineWidth = lw(0.8); c.stroke(paths.rivers); }
  c.strokeStyle = '#2a5a8a'; c.lineWidth = lw(0.8); c.stroke(paths[hi ? 'lakes1' : 'lakes0']);
  c.strokeStyle = '#ffffffb0'; c.lineWidth = lw(0.9); c.setLineDash([lw(4), lw(2.5)]); c.stroke(paths.prov); c.setLineDash([]);
  c.strokeStyle = '#1b1b1b'; c.lineWidth = lw(1.1); c.stroke(paths[hi ? 'coast1' : 'coast0']);
  c.strokeStyle = '#7a1f1f'; c.lineWidth = lw(1.5); c.stroke(paths.border);
  c.restore();
}
// labels (drawn on overlay so they sit above weather)
function drawLabels(c) {
  if (!geo) return;
  const placed = [];
  const fits = (x, y, w, h) => { for (const b of placed) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false; placed.push([x, y, w, h]); return true; };
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const l of geo.labels) {
    const x = X(l.x), y = Y(l.y); if (x < -50 || y < -20 || x > W + 50 || y > H + 20) continue;
    if (l.t === 'p' && view.s < 13) continue;
    if (l.t === 'c' && view.s > 40 && l.n === '中国') continue;
    const fs = l.t === 'c' ? 15 : l.t === 's' ? 14 : 12;
    c.font = `${l.t === 's' ? 'italic ' : ''}${l.t === 'c' ? 700 : 500} ${fs}px -apple-system,PingFang SC,sans-serif`;
    const w = c.measureText(l.n).width;
    if (!fits(x - w / 2, y - fs / 2, w, fs)) continue;
    c.lineWidth = 3; c.strokeStyle = l.t === 's' ? '#0a2a4a99' : '#00000088'; c.strokeText(l.n, x, y);
    c.fillStyle = l.t === 's' ? '#bfe3ff' : l.t === 'c' ? '#fff3d6' : '#f2f2f2cc'; c.fillText(l.n, x, y);
  }
  const maxR = view.s < 16 ? 2 : view.s < 24 ? 3 : view.s < 36 ? 4 : view.s < 60 ? 5 : view.s < 100 ? 6 : 7;
  c.textAlign = 'left';
  for (const ct of geo.cities) {
    if (ct.r > maxR && !(ct.cn && ct.r <= maxR + 1 && view.s > 20)) continue;
    const x = X(ct.x), y = Y(ct.y); if (x < 0 || y < 0 || x > W || y > H) continue;
    const fs = ct.r <= 2 ? 13.5 : 12;
    c.font = `${ct.r <= 2 ? 600 : 500} ${fs}px -apple-system,PingFang SC,sans-serif`;
    const w = c.measureText(ct.n).width;
    if (!fits(x - 3, y - fs / 2, w + 9, fs)) continue;
    c.beginPath(); c.arc(x, y, ct.cap ? 3.5 : 2.6, 0, 7); c.fillStyle = ct.cap ? '#ffdf5e' : '#fff'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#000'; c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#000000aa'; c.strokeText(ct.n, x + 5, y); c.fillStyle = '#fff'; c.fillText(ct.n, x + 5, y);
  }
}

// ---------------- colour scales ----------------
function mkPal(stops) { // stops: [v, r,g,b,a]
  return (v, out, o) => {
    if (v <= stops[0][0]) { const s = stops[0]; out[o] = s[1]; out[o + 1] = s[2]; out[o + 2] = s[3]; out[o + 3] = s[4]; return; }
    for (let i = 1; i < stops.length; i++) if (v < stops[i][0]) {
      const a = stops[i - 1], b = stops[i], f = (v - a[0]) / (b[0] - a[0]);
      out[o] = a[1] + (b[1] - a[1]) * f; out[o + 1] = a[2] + (b[2] - a[2]) * f; out[o + 2] = a[3] + (b[3] - a[3]) * f; out[o + 3] = a[4] + (b[4] - a[4]) * f; return;
    }
    const s = stops[stops.length - 1]; out[o] = s[1]; out[o + 1] = s[2]; out[o + 2] = s[3]; out[o + 3] = s[4];
  };
}
const A = 150;
const PAL = {
  temp: { f: mkPal([[-40, 120, 0, 140, A], [-30, 90, 30, 200, A], [-20, 40, 80, 230, A], [-10, 40, 150, 240, A], [0, 120, 210, 250, A], [5, 140, 230, 200, A], [10, 120, 220, 120, A], [15, 190, 235, 90, A], [20, 250, 235, 90, A], [25, 250, 180, 60, A], [30, 240, 100, 40, A], [35, 200, 30, 40, A], [40, 140, 0, 60, A]]), min: -40, max: 40, unit: '°C', name: '地面气温' },
  tanom: { f: mkPal([[-12, 40, 40, 170, 190], [-8, 50, 100, 220, 180], [-4, 120, 170, 240, 150], [-1, 210, 230, 250, 60], [0, 255, 255, 255, 0], [1, 255, 230, 200, 60], [4, 250, 170, 110, 150], [8, 230, 80, 50, 180], [12, 170, 20, 30, 190]]), min: -12, max: 12, unit: '°C', name: '气温距平（相对常年同期）' },
  precip: { f: mkPal([[0.3, 160, 240, 150, 0], [1, 160, 240, 150, 150], [5, 60, 190, 80, 190], [10, 40, 150, 230, 205], [25, 20, 60, 220, 215], [50, 220, 40, 220, 225], [100, 140, 0, 60, 230]]), min: 0, max: 100, unit: 'mm/日', name: '降水强度' },
  snow: mkPal([[0.3, 230, 230, 255, 0], [1, 225, 225, 255, 160], [5, 200, 190, 255, 200], [15, 160, 130, 240, 220], [40, 120, 80, 220, 230]]),
  sst: { f: mkPal([[-2, 80, 0, 140, A], [5, 40, 80, 220, A], [12, 40, 170, 230, A], [18, 100, 220, 160, A], [22, 220, 235, 90, A], [26, 250, 170, 50, A], [28, 240, 90, 40, A], [30, 190, 20, 40, A], [32, 130, 0, 50, A]]), min: -2, max: 32, unit: '°C', name: '海表温度' },
};

// ---------------- field composition (hi-res) ----------------
const fieldImg = document.createElement('canvas');
let fieldData = null;
let tAnomGrid = null, prRatio = null;
function bil(arr, nx, ny, fi, fj) {
  if (fi < 0) fi = 0; if (fj < 0) fj = 0; if (fi > nx - 1.001) fi = nx - 1.001; if (fj > ny - 1.001) fj = ny - 1.001;
  const i = fi | 0, j = fj | 0, a = fi - i, b = fj - j, n = j * nx + i;
  return (arr[n] * (1 - a) + arr[n + 1] * a) * (1 - b) + (arr[n + nx] * (1 - a) + arr[n + nx + 1] * a) * b;
}
function hourOf(fr) { return fr.date.hour; }
function diurnal(lon, hourBJ, precip, land) { // display-only diurnal cycle
  const solar = hourBJ - 8 + lon / 15;
  const amp = (land ? 4.8 : 0.6) * Math.max(0.25, 1 - precip / 12);
  return amp * Math.cos(2 * Math.PI * (solar - 15) / 24);
}
let landHR = null;
function composeField() {
  if (!frame || !hires) return;
  const fillMode = document.querySelector('input[name=fill]:checked').value;
  const rainOver = $('ly-rain').checked;
  const nx = hires.nx, ny = hires.ny, hr = hires.res;
  if (!fieldData) { fieldImg.width = nx; fieldImg.height = ny; fieldData = fieldImg.getContext('2d').createImageData(nx, ny); }
  const d = fieldData.data; d.fill(0);
  const [m0, m1, w] = frame.climMonth, w0 = 1 - w;
  const T0 = hires.T[m0], T1 = hires.T[m1], P0 = hires.P[m0], P1 = hires.P[m1];
  const M = meta, mnx = M.nx, mny = M.ny;
  const hour = hourOf(frame);
  const tmp = [0, 0, 0, 0];
  if (!landHR) { landHR = new Uint8Array(nx * ny); }
  for (let j = 0; j < ny; j++) {
    const lat = hires.lat0 + j * hr, fj = (lat - M.lat0) / M.res, row = (ny - 1 - j) * nx;
    for (let i = 0; i < nx; i++) {
      const lon = hires.lon0 + i * hr, fi = (lon - M.lon0) / M.res, n = j * nx + i, o = (row + i) * 4;
      let drew = false;
      // precipitation
      const pm = bil(frame.precip, mnx, mny, fi, fj), pc = bil(frame.climPr, mnx, mny, fi, fj);
      const phr = P0[n] * w0 + P1[n] * w;
      const r = Math.min(pm / Math.max(pc, 0.3), 6);
      const P = 0.5 * pm + 0.5 * phr * r;
      const ta = bil(tAnomGrid, mnx, mny, fi, fj);
      const land = bil(frame.landFrac || LFm, mnx, mny, fi, fj) > 0.5;
      const T = T0[n] * w0 + T1[n] * w + ta + diurnal(lon, hour, P, land);
      if (fillMode === 'temp') { PAL.temp.f(T, d, o); drew = true; }
      else if (fillMode === 'tanom') { PAL.tanom.f(ta, d, o); drew = true; }
      else if (fillMode === 'sst') { if (!land) { PAL.sst.f(bil(frame.sst, mnx, mny, fi, fj), d, o); drew = true; } }
      if (fillMode === 'precip' || rainOver) {
        if (P > 0.3) {
          (T < 0.5 ? PAL.snow : PAL.precip.f)(P, tmp, 0);
          if (drew) { const a = tmp[3] / 255; d[o] = d[o] * (1 - a) + tmp[0] * a; d[o + 1] = d[o + 1] * (1 - a) + tmp[1] * a; d[o + 2] = d[o + 2] * (1 - a) + tmp[2] * a; d[o + 3] = Math.max(d[o + 3], tmp[3]); }
          else { d[o] = tmp[0]; d[o + 1] = tmp[1]; d[o + 2] = tmp[2]; d[o + 3] = tmp[3]; }
        }
      }
    }
  }
  fieldImg.getContext('2d').putImageData(fieldData, 0, 0);
  drawLegend(fillMode, rainOver);
}
let LFm = null;
function drawField() {
  const c = ctx.field; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  if (!fieldData) return;
  const hr = hires.res;
  const x0 = X(hires.lon0 - hr / 2), x1 = X(hires.lon0 + (hires.nx - 0.5) * hr), y0 = Y(hires.lat0 + (hires.ny - 0.5) * hr), y1 = Y(hires.lat0 - hr / 2);
  c.imageSmoothingEnabled = true; c.drawImage(fieldImg, x0, y0, x1 - x0, y1 - y0);
}
let legendKey = '';
function drawLegend(mode, rain) {
  const key = mode + rain; if (key === legendKey) return; legendKey = key;
  const L = $('legend'); L.innerHTML = '';
  const add = (p, name) => {
    const div = document.createElement('div');
    div.innerHTML = `<div class="ln">${name || p.name}（${p.unit}）</div>`;
    const c = document.createElement('canvas'); c.width = 160; c.height = 12; const g = c.getContext('2d'); const id = g.createImageData(160, 12); const t = [0, 0, 0, 0];
    for (let i = 0; i < 160; i++) { const v = p.min + (p.max - p.min) * i / 159; p.f(mode === 'precip' || p === PAL.precip ? Math.pow(i / 159, 2) * p.max : v, t, 0); for (let j = 0; j < 12; j++) { const o = (j * 160 + i) * 4; id.data[o] = t[0]; id.data[o + 1] = t[1]; id.data[o + 2] = t[2]; id.data[o + 3] = Math.max(t[3], 60); } }
    g.putImageData(id, 0, 0); div.appendChild(c);
    const lt = document.createElement('div'); lt.className = 'lt';
    lt.innerHTML = p === PAL.precip ? '<span>0</span><span>10</span><span>25</span><span>50</span><span>100</span>' : `<span>${p.min}</span><span>${(p.min + p.max) / 2}</span><span>${p.max}</span>`;
    div.appendChild(lt); L.appendChild(div);
  };
  if (PAL[mode] && mode !== 'precip') add(PAL[mode]);
  if (mode === 'precip' || rain) add(PAL.precip, '降水（蓝绿雨 / 紫白雪）');
}

// ---------------- contours ----------------
function upsample(src, nx, ny, f) {
  const NX = (nx - 1) * f + 1, NY = (ny - 1) * f + 1, out = new Float32Array(NX * NY);
  for (let J = 0; J < NY; J++) for (let I = 0; I < NX; I++) out[J * NX + I] = bil(src, nx, ny, I / f, J / f);
  return { a: out, nx: NX, ny: NY };
}
function contourSegs(g, level, mask) { // marching squares -> segments in grid coords
  const { a, nx, ny } = g, segs = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const n = j * nx + i;
    if (mask && (mask[n] || mask[n + 1] || mask[n + nx] || mask[n + nx + 1])) continue;
    const v0 = a[n], v1 = a[n + 1], v2 = a[n + nx + 1], v3 = a[n + nx];
    let c = 0; if (v0 > level) c |= 1; if (v1 > level) c |= 2; if (v2 > level) c |= 4; if (v3 > level) c |= 8;
    if (c === 0 || c === 15) continue;
    const e = (k) => { // edge point
      switch (k) {
        case 0: return [i + (level - v0) / (v1 - v0), j];
        case 1: return [i + 1, j + (level - v1) / (v2 - v1)];
        case 2: return [i + (level - v3) / (v2 - v3), j + 1];
        case 3: return [i, j + (level - v0) / (v3 - v0)];
      }
    };
    const T = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] }[c];
    for (const [p, q] of T) segs.push(e(p), e(q));
  }
  return segs;
}
let hiMask = null;
function drawContours(c) {
  if (!frame) return;
  const M = meta, f = 3;
  const gx = (I) => X(M.lon0 + I * M.res / f), gy = (J) => Y(M.lat0 + J * M.res / f);
  if ($('ly-slp').checked) {
    const g = upsample(frame.slp, M.nx, M.ny, f);
    if (!hiMask) { const h = upsample(Hm, M.nx, M.ny, f); hiMask = new Uint8Array(h.a.length); for (let n = 0; n < h.a.length; n++) hiMask[n] = h.a[n] > 2200 ? 1 : 0; }
    let mn = 1e9, mx = -1e9; for (const v of frame.slp) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    for (let L = Math.ceil(mn / 2.5) * 2.5; L <= mx; L += 2.5) {
      const segs = contourSegs(g, L, hiMask); if (!segs.length) continue;
      const major = Math.abs(L % 10) < 0.01;
      c.beginPath(); for (let s = 0; s < segs.length; s += 2) { c.moveTo(gx(segs[s][0]), gy(segs[s][1])); c.lineTo(gx(segs[s + 1][0]), gy(segs[s + 1][1])); }
      c.strokeStyle = major ? '#ffffffee' : '#ffffffaa'; c.lineWidth = major ? 1.6 : 1; c.stroke();
      if (Math.abs(L % 5) < 0.01) labelLine(c, segs, gx, gy, String(L % 1 ? L.toFixed(1) : L), '#fff', 180, false, 3);
    }
    // H / L centres
    const a = frame.slp, nx = M.nx, ny = M.ny, R = 4;
    c.font = '700 17px -apple-system,PingFang SC,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let j = R; j < ny - R; j++) for (let i = R; i < nx - R; i++) {
      const n = j * nx + i, v = a[n]; if (Hm[n] > 2200) continue;
      let isMax = true, isMin = true, sum = 0, cnt = 0;
      for (let dj = -R; dj <= R && (isMax || isMin); dj++) for (let di = -R; di <= R; di++) {
        if (!di && !dj) continue; const u = a[n + dj * nx + di]; if (u >= v) isMax = false; if (u <= v) isMin = false; if (Math.abs(di) === R || Math.abs(dj) === R) { sum += u; cnt++; }
      }
      const avg = sum / cnt;
      if (isMax && v - avg > 1.5) txt(c, '高', X(M.lon0 + i * M.res), Y(M.lat0 + j * M.res), '#5aa9ff', v.toFixed(0));
      if (isMin && avg - v > 1.5) txt(c, '低', X(M.lon0 + i * M.res), Y(M.lat0 + j * M.res), '#ff5a5a', v.toFixed(0));
    }
  }
  if ($('ly-z500').checked) {
    const g = upsample(frame.z500, M.nx, M.ny, f);
    let mn = 1e9, mx = -1e9; for (const v of frame.z500) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    for (let L = Math.ceil(mn / 40) * 40; L <= mx; L += 40) {
      if (L === 5880) continue;
      const segs = contourSegs(g, L); if (!segs.length) continue;
      c.beginPath(); for (let s = 0; s < segs.length; s += 2) { c.moveTo(gx(segs[s][0]), gy(segs[s][1])); c.lineTo(gx(segs[s + 1][0]), gy(segs[s + 1][1])); }
      c.strokeStyle = '#3b1e6ccc'; c.lineWidth = 1.2; c.setLineDash([6, 4]); c.stroke(); c.setLineDash([]);
      labelLine(c, segs, gx, gy, String(L / 10), '#d9c8ff', 220, false, 3);
    }
    const segs = contourSegs(g, 5880);
    if (segs.length) {
      c.beginPath(); for (let s = 0; s < segs.length; s += 2) { c.moveTo(gx(segs[s][0]), gy(segs[s][1])); c.lineTo(gx(segs[s + 1][0]), gy(segs[s + 1][1])); }
      c.strokeStyle = '#000000aa'; c.lineWidth = 5; c.stroke();
      c.strokeStyle = '#ff2d2d'; c.lineWidth = 3; c.stroke();
      labelLine(c, segs, gx, gy, '588', '#ff6b6b', 160, true, 5);
    }
  }
}
function txt(c, s, x, y, col, sub) {
  c.lineWidth = 3.5; c.strokeStyle = '#000a'; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y);
  c.font = '600 11px -apple-system,sans-serif'; c.strokeText(sub, x, y + 15); c.fillStyle = '#fff'; c.fillText(sub, x, y + 15);
  c.font = '700 17px -apple-system,PingFang SC,sans-serif';
}
function labelLine(c, segs, gx, gy, text, col, spacing, bold, maxN = 6) {
  c.font = `${bold ? 800 : 600} ${bold ? 13 : 11}px -apple-system,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const placed = [];
  for (let s = 0; s < segs.length; s += 2 * 7) {
    const x = gx(segs[s][0]), y = gy(segs[s][1]); if (x < 20 || y < 60 || x > W - 20 || y > H - 80) continue;
    if (placed.some(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 < spacing * spacing)) continue;
    placed.push([x, y]);
    c.lineWidth = 3; c.strokeStyle = '#000b'; c.strokeText(text, x, y); c.fillStyle = col; c.fillText(text, x, y);
    if (placed.length >= maxN) break;
  }
}

// ---------------- wind particles ----------------
let parts = [];
function initParticles() {
  const n = Math.round(Math.min(2600, W * H / 480));
  parts = []; for (let i = 0; i < n; i++) parts.push(newPart());
}
function newPart() {
  const lon = LONf(Math.random() * W), lat = LATf(Math.random() * H);
  return { lon, lat, age: Math.random() * 80 | 0 };
}
function windField() {
  const lev = $('wind-lev').value;
  if (lev === '500') return [frame.u500, frame.v500, 0.18];
  if (lev === 'steer') return [frame.usteer, frame.vsteer, 0.25];
  return [frame.u10, frame.v10, 0.45];
}
function drawWind() {
  const c = ctx.wind; c.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!$('ly-wind').checked || !frame) { if (!windClear) { c.clearRect(0, 0, W, H); windClear = true; } return; }
  if (windClear) { c.clearRect(0, 0, W, H); windClear = false; if (!parts.length) initParticles(); }
  c.globalCompositeOperation = 'destination-in'; c.fillStyle = 'rgba(0,0,0,0.90)'; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';
  const [U, V, k] = windField(), M = meta;
  c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,0.72)'; c.beginPath();
  const pxPerDeg = view.s;
  for (const p of parts) {
    const fi = (p.lon - M.lon0) / M.res, fj = (p.lat - M.lat0) / M.res;
    if (p.age > 90 || fi < 0 || fj < 0 || fi > M.nx - 1 || fj > M.ny - 1) { Object.assign(p, newPart()); p.age = 0; continue; }
    const u = bil(U, M.nx, M.ny, fi, fj), v = bil(V, M.nx, M.ny, fi, fj);
    const x0 = X(p.lon), y0 = Y(p.lat);
    const dxp = u * k, dyp = -v * k; // px per frame
    p.lon += dxp / (KX * pxPerDeg) / Math.max(0.3, Math.cos(p.lat * Math.PI / 180)) * KX; p.lat -= dyp / pxPerDeg;
    const x1 = X(p.lon), y1 = Y(p.lat);
    if (x0 < 0 || y0 < 0 || x0 > W || y0 > H) { p.age = 999; continue; }
    c.moveTo(x0, y0); c.lineTo(x1, y1); p.age++;
  }
  c.stroke();
}

// ---------------- overlay ----------------
function drawOver() {
  const c = ctx.over; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  drawContours(c);
  drawLabels(c);
  if (selected) { const x = X(selected.lon), y = Y(selected.lat); c.beginPath(); c.arc(x, y, 9, 0, 7); c.lineWidth = 3; c.strokeStyle = '#ffd27a'; c.stroke(); }
}

// ---------------- city tracking / cold waves ----------------
let tracked = [], selected = null, Hm = null;
const DAY = 86400;
function setupTracked() {
  const list = geo.cities.filter(c => (c.cn && c.r <= 6) || c.r <= 3);
  tracked = list.slice(0, 220).map(c => ({ name: c.n, lon: c.x, lat: c.y, cn: c.cn, hist: [], dmin: {} }));
}
function sampleAt(lon, lat) {
  const M = meta, fi = (lon - M.lon0) / M.res, fj = (lat - M.lat0) / M.res;
  const [m0, m1, w] = frame.climMonth;
  const hi = hires, hfi = (lon - hi.lon0) / hi.res, hfj = (lat - hi.lat0) / hi.res;
  const thr = bil(hi.T[m0], hi.nx, hi.ny, hfi, hfj) * (1 - w) + bil(hi.T[m1], hi.nx, hi.ny, hfi, hfj) * w;
  const phr = bil(hi.P[m0], hi.nx, hi.ny, hfi, hfj) * (1 - w) + bil(hi.P[m1], hi.nx, hi.ny, hfi, hfj) * w;
  const pm = bil(frame.precip, M.nx, M.ny, fi, fj), pc = bil(frame.climPr, M.nx, M.ny, fi, fj);
  const P = 0.5 * pm + 0.5 * phr * Math.min(pm / Math.max(pc, 0.3), 6);
  const land = bil(LFm, M.nx, M.ny, fi, fj) > 0.5;
  const ta = bil(tAnomGrid, M.nx, M.ny, fi, fj);
  const T = thr + ta + diurnal(lon, frame.date.hour, P, land);
  return { T, P, slp: bil(frame.slp, M.nx, M.ny, fi, fj), u: bil(frame.u10, M.nx, M.ny, fi, fj), v: bil(frame.v10, M.nx, M.ny, fi, fj), z500: bil(frame.z500, M.nx, M.ny, fi, fj), ta };
}
let lastRecT = null, absT = 0, prevT = null, events = [];
function recordFrame() {
  // absolute model time (seconds since start, across years)
  absT = frame.year * 365 * DAY + frame.t;
  if (lastRecT !== null && absT - lastRecT < 1800 && absT >= lastRecT) return;
  if (lastRecT !== null && absT < lastRecT) { for (const c of tracked) { c.hist = []; c.dmin = {}; } } // date jump backwards
  lastRecT = absT;
  const dayIdx = Math.floor(absT / DAY);
  const hits = [];
  for (const c of tracked) {
    const s = sampleAt(c.lon, c.lat);
    c.hist.push([absT, s.T, s.P, s.slp]);
    while (c.hist.length && c.hist[0][0] < absT - 30 * DAY) c.hist.shift();
    c.dmin[dayIdx] = Math.min(c.dmin[dayIdx] ?? 99, s.T);
    // CMA cold wave: 48h drop of daily minimum >= 8C and min <= 4C (check yesterday complete)
    const d = dayIdx - 1;
    if (c.cn && c.dmin[d] !== undefined && c.dmin[d - 2] !== undefined && !c['cw' + d]) {
      c['cw' + d] = 1;
      const prev = Math.max(c.dmin[d - 2], c.dmin[d - 1] ?? -99);
      const drop = prev - c.dmin[d];
      if (drop >= 8 && c.dmin[d] <= 4) hits.push([c.name, drop]);
      for (const k in c.dmin) if (+k < dayIdx - 5) delete c.dmin[k];
    }
  }
  if (hits.length) {
    hits.sort((a, b) => b[1] - a[1]);
    const dd = frame.date; const md = `${dd.mon}月${dd.day - 1 > 0 ? dd.day - 1 : dd.day}日`;
    const strong = hits[0][1] >= 12;
    const txt = `${strong ? '强寒潮' : '寒潮'}：${hits.slice(0, 5).map(h => h[0]).join('、')}${hits.length > 5 ? `等${hits.length}城` : ''}，48小时最低气温降幅达 ${hits[0][1].toFixed(1)}°C`;
    events.unshift({ md, txt, y: frame.year + 1 }); events = events.slice(0, 30);
    $('events').innerHTML = events.map(e => `<div class="ev"><b>第${e.y}年${e.md}</b> ${e.txt}</div>`).join('');
    toast('❄️ ' + txt);
  }
}
let toastT = 0;
function toast(s) { const t = $('toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 4500); }

function windDir(u, v) {
  const sp = Math.hypot(u, v); const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const ang = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360; // direction wind comes from
  const lvl = sp < 0.3 ? 0 : sp < 1.6 ? 1 : sp < 3.4 ? 2 : sp < 5.5 ? 3 : sp < 8 ? 4 : sp < 10.8 ? 5 : sp < 13.9 ? 6 : sp < 17.2 ? 7 : sp < 20.8 ? 8 : 9;
  return `${dirs[Math.round(ang / 45) % 8]}风${lvl}级`;
}
function wxText(T, P) {
  if (P < 0.3) return T > 30 ? '晴热' : '晴/多云';
  const snow = T < 0.5;
  if (snow) return P < 2.5 ? '小雪' : P < 5 ? '中雪' : P < 10 ? '大雪' : '暴雪';
  return P < 10 ? '小雨' : P < 25 ? '中雨' : P < 50 ? '大雨' : '暴雨';
}
function showCity() {
  if (!selected || !frame) return;
  $('city').classList.remove('hidden');
  $('city-name').textContent = selected.name;
  $('city-coord').textContent = `${selected.lon.toFixed(1)}°E ${selected.lat.toFixed(1)}°N`;
  const s = sampleAt(selected.lon, selected.lat);
  $('city-now').innerHTML = `<span>天气 <b>${wxText(s.T, s.P)}</b></span><span>气温 <b>${s.T.toFixed(1)}°C</b></span><span>距平 <b>${s.ta > 0 ? '+' : ''}${s.ta.toFixed(1)}°C</b></span><span>降水 <b>${s.P.toFixed(1)}</b> mm/日</span><span>气压 <b>${s.slp.toFixed(1)}</b> hPa</span><span><b>${windDir(s.u, s.v)}</b></span><span>500hPa <b>${(s.z500 / 10).toFixed(0)}</b> dagpm</span>`;
  drawChart(selected.track ? selected.track.hist : []);
}
function drawChart(h) {
  const c = $('city-chart'), g = c.getContext('2d');
  const w = c.clientWidth, hh = c.clientHeight; c.width = w * DPR; c.height = hh * DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.clearRect(0, 0, w, hh);
  if (h.length < 2) { g.fillStyle = '#fff9'; g.font = '13px sans-serif'; g.fillText('模拟进行中，曲线会随时间积累…', 10, 30); return; }
  const t1 = h[h.length - 1][0], t0 = t1 - 30 * DAY;
  let tmin = 1e9, tmax = -1e9, pmin = 1e9, pmax = -1e9, rmax = 10;
  for (const r of h) { tmin = Math.min(tmin, r[1]); tmax = Math.max(tmax, r[1]); pmin = Math.min(pmin, r[3]); pmax = Math.max(pmax, r[3]); rmax = Math.max(rmax, r[2]); }
  tmin = Math.floor(tmin - 1); tmax = Math.ceil(tmax + 1); pmin -= 1; pmax += 1;
  const L = 30, R = 38, T = 6, B = 18, x = (t) => L + (t - t0) / (t1 - t0) * (w - L - R);
  const yT = (v) => T + (tmax - v) / (tmax - tmin) * (hh - T - B), yP = (v) => T + (pmax - v) / (pmax - pmin) * (hh - T - B), yR = (v) => hh - B - v / rmax * (hh - T - B) * 0.6;
  g.strokeStyle = '#ffffff22'; g.lineWidth = 1; g.fillStyle = '#fff9'; g.font = '10px sans-serif';
  for (let d = Math.ceil(t0 / DAY); d * DAY <= t1; d++) { const xx = x(d * DAY); if (d % 5 === 0) { g.beginPath(); g.moveTo(xx, T); g.lineTo(xx, hh - B); g.stroke(); const dd = dayToMD(d % 365); g.fillText(`${dd[0]}/${dd[1]}`, xx - 10, hh - 5); } }
  for (let v = Math.ceil(tmin / 5) * 5; v <= tmax; v += 5) { g.fillText(v + '°', 2, yT(v) + 3); }
  g.fillStyle = '#4aa3ff99';
  for (const r of h) { if (r[2] > 0.3) { const xx = x(r[0]); g.fillRect(xx - 1, yR(r[2]), 2.2, hh - B - yR(r[2])); } }
  g.strokeStyle = '#bbbbbb'; g.lineWidth = 1.2; g.beginPath(); h.forEach((r, i) => { const xx = x(r[0]), yy = yP(r[3]); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }); g.stroke();
  g.strokeStyle = '#ff6b5a'; g.lineWidth = 2; g.beginPath(); h.forEach((r, i) => { const xx = x(r[0]), yy = yT(r[1]); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }); g.stroke();
  g.fillStyle = '#ccc'; g.fillText(pmax.toFixed(0), w - R + 3, T + 8); g.fillText(pmin.toFixed(0), w - R + 3, hh - B);
}
function dayToMD(doy) { let m = 0; while (m < 11 && doy >= MONTH_DAYS[m]) { doy -= MONTH_DAYS[m]; m++; } return [m + 1, doy + 1]; }

// ---------------- interaction (pan / pinch / tap) ----------------
const ptrs = new Map(); let gesture = null, tapStart = null;
const wrap = $('map-wrap');
wrap.addEventListener('pointerdown', (e) => {
  wrap.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now() }; else tapStart = null;
  startGesture();
});
wrap.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gesture) return;
  const pts = [...ptrs.values()];
  if (pts.length === 1 && gesture.n === 1) { view.ox = gesture.ox + pts[0].x - gesture.cx; view.oy = gesture.oy + pts[0].y - gesture.cy; }
  else if (pts.length >= 2 && gesture.n >= 2) {
    const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2, d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const ns = gesture.s * d / gesture.d;
    const lon = (gesture.cx - gesture.ox) / (KX * gesture.s), lat = (gesture.cy - gesture.oy) / gesture.s;
    view.s = ns; clampScaleOnly(); view.ox = cx - lon * KX * view.s; view.oy = cy - lat * view.s;
  }
  clampView(); markView();
});
const endPtr = (e) => {
  ptrs.delete(e.pointerId);
  if (tapStart && ptrs.size === 0) {
    const dx = e.clientX - tapStart.x, dy = e.clientY - tapStart.y;
    if (dx * dx + dy * dy < 64 && performance.now() - tapStart.t < 500) onTap(e.clientX, e.clientY);
  }
  tapStart = null; startGesture();
};
wrap.addEventListener('pointerup', endPtr); wrap.addEventListener('pointercancel', endPtr);
wrap.addEventListener('wheel', (e) => {
  e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015);
  const lon = (e.clientX - view.ox) / (KX * view.s), lat = (e.clientY - view.oy) / view.s;
  view.s *= f; clampScaleOnly(); view.ox = e.clientX - lon * KX * view.s; view.oy = e.clientY - lat * view.s; clampView(); markView();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
function clampScaleOnly() { const minS = Math.min(W / ((LON1 - LON0) * KX), H / (LAT1 - LAT0)) * 0.9; view.s = Math.max(minS, Math.min(view.s, 260)); }
function startGesture() {
  const pts = [...ptrs.values()];
  if (!pts.length) { gesture = null; return; }
  if (pts.length === 1) gesture = { n: 1, cx: pts[0].x, cy: pts[0].y, ox: view.ox, oy: view.oy };
  else gesture = { n: 2, cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, d: Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), s: view.s, ox: view.ox, oy: view.oy };
}
function markView() { dirtyBase = dirtyField = dirtyOver = windClear = true; }
function onTap(x, y) {
  if (!frame) return;
  let best = null, bd = 28 * 28;
  for (const c of tracked) { const d = (X(c.lon) - x) ** 2 + (Y(c.lat) - y) ** 2; if (d < bd) { bd = d; best = c; } }
  if (best) selected = { name: best.name, lon: best.lon, lat: best.lat, track: best };
  else {
    const lon = LONf(x), lat = LATf(y); if (lon < LON0 || lon > LON1 || lat < LAT0 || lat > LAT1) return;
    const t = { name: `${lon.toFixed(1)}°E ${lat.toFixed(1)}°N`, lon, lat, cn: 0, hist: [], dmin: {} }; tracked.push(t);
    selected = { name: '自选地点', lon, lat, track: t };
  }
  dirtyOver = true; showCity();
}
$('city-close').onclick = () => { $('city').classList.add('hidden'); selected = null; dirtyOver = true; };

// ---------------- controls ----------------
let worker = null, playing = true;
$('btn-play').onclick = () => { playing = !playing; worker.postMessage({ type: playing ? 'play' : 'pause' }); $('btn-play').textContent = playing ? '⏸' : '▶'; };
document.querySelectorAll('.speeds button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.speeds button').forEach(x => x.classList.remove('on')); b.classList.add('on');
  worker.postMessage({ type: 'speed', value: +b.dataset.sp });
});
const jm = $('j-mon'), jd = $('j-day');
for (let m = 1; m <= 12; m++) jm.add(new Option(m + '月', m));
function fillDays() { const v = +jd.value || 1; jd.innerHTML = ''; for (let d = 1; d <= MONTH_DAYS[jm.value - 1]; d++) jd.add(new Option(d + '日', d)); jd.value = Math.min(v, MONTH_DAYS[jm.value - 1]); }
jm.onchange = fillDays;
$('btn-jump').onclick = () => { worker.postMessage({ type: 'setDate', mon: +jm.value, day: +jd.value, hour: 8 }); toast(`已跳到 ${jm.value}月${jd.value}日，天气将从当前形势继续演变`); };
document.querySelectorAll('input[name=fill], #ly-rain').forEach(i => i.onchange = () => { composeField(); dirtyField = true; });
['ly-slp', 'ly-z500'].forEach(id => $(id).onchange = () => { dirtyOver = true; });
$('ly-wind').onchange = () => { windClear = true; parts = []; };
$('wind-lev').onchange = () => { windClear = true; parts = []; };

// ---------------- main loop ----------------
let frameOver = false, lastOverT = 0;
let fps = 0, fcount = 0, ft = performance.now(), lastSteps = 0, lastStepT = performance.now(), simRate = 0;
function render() {
  if (dirtyBase) { drawBase(); dirtyBase = false; }
  if (dirtyField) { drawField(); dirtyField = false; }
  if (dirtyOver || (frameOver && performance.now() - lastOverT > 180)) { drawOver(); dirtyOver = false; frameOver = false; lastOverT = performance.now(); }
  drawWind();
  fcount++; const now = performance.now();
  if (now - ft > 1000) { fps = fcount; fcount = 0; ft = now; $('perf').textContent = `模式 ${simRate.toFixed(1)} 天/秒 · ${fps}帧`; }
  requestAnimationFrame(render);
}
function onFrame(d) {
  frame = d;
  if (!LFm) { LFm = frame.landFrac; }
  tAnomGrid = d.tAnom;
  const dd = d.date, hh = Math.floor(dd.hour);
  $('date-str').textContent = `${dd.mon}月${dd.day}日 ${String(hh).padStart(2, '0')}:00`;
  $('year-str').textContent = `模拟第 ${d.year + 1} 年 · 北京时间`;
  const w = d.wpsh;
  $('wp-ridge').textContent = w.ridgeLat ? w.ridgeLat.toFixed(1) + '°N' : '—';
  $('wp-west').textContent = w.westLon ? w.westLon.toFixed(1) + '°E' : '无588线';
  $('wp-north').textContent = w.northLat ? w.northLat.toFixed(1) + '°N' : '—';
  $('wp-area').textContent = w.area;
  $('enso').textContent = (d.enso > 0 ? '+' : '') + d.enso.toFixed(2) + (d.enso > 0.5 ? ' 偏暖' : d.enso < -0.5 ? ' 偏冷' : ' 中性');
  const now = performance.now(); if (now - lastStepT > 1000) { simRate = (d.stepsDone - lastSteps) * 200 / 86400 / ((now - lastStepT) / 1000); lastSteps = d.stepsDone; lastStepT = now; }
  composeField(); recordFrame();
  dirtyField = true; frameOver = true;
  if (selected) showCity();
  api._emit(d);
}

// ---------------- public API for integration (e.g. 台风模拟器) ----------------
const api = {
  _subs: [],
  _emit(d) { for (const f of this._subs) try { f(this.getState()); } catch (e) { } },
  version: 1,
  grid() { return meta ? { lon0: meta.lon0, lat0: meta.lat0, res: meta.res, nx: meta.nx, ny: meta.ny, order: 'row-major, row 0 = southernmost latitude' } : null; },
  getState() {
    if (!frame) return null;
    return {
      date: { ...frame.date }, simYear: frame.year + 1, secondsOfYear: frame.t, grid: this.grid(),
      subtropicalHigh: { ...frame.wpsh, line5880: this.line5880() },
      steeringFlow: { u: frame.usteer, v: frame.vsteer, layer: '850-300hPa 质量加权平均' },
      wind10m: { u: frame.u10, v: frame.v10 }, wind500: { u: frame.u500, v: frame.v500 },
      z500: frame.z500, slp: frame.slp, sst: frame.sst, t2m: frame.t2m, precip: frame.precip, ensoIndex: frame.enso,
    };
  },
  sample(lon, lat) {
    if (!frame) return null; const M = meta, fi = (lon - M.lon0) / M.res, fj = (lat - M.lat0) / M.res, b = (a) => bil(a, M.nx, M.ny, fi, fj);
    return { usteer: b(frame.usteer), vsteer: b(frame.vsteer), u500: b(frame.u500), v500: b(frame.v500), u10: b(frame.u10), v10: b(frame.v10), z500: b(frame.z500), slp: b(frame.slp), sst: b(frame.sst), t2m: b(frame.t2m), precip: b(frame.precip) };
  },
  line5880() {
    if (!frame) return []; const M = meta, segs = contourSegs({ a: frame.z500, nx: M.nx, ny: M.ny }, 5880), out = [];
    for (let s = 0; s < segs.length; s += 2) out.push([M.lon0 + segs[s][0] * M.res, M.lat0 + segs[s][1] * M.res, M.lon0 + segs[s + 1][0] * M.res, M.lat0 + segs[s + 1][1] * M.res]);
    return out;
  },
  onUpdate(cb) { this._subs.push(cb); return () => { this._subs = this._subs.filter(f => f !== cb); }; },
  play() { if (!playing) $('btn-play').click(); }, pause() { if (playing) $('btn-play').click(); },
  setSpeed(modelSecondsPerSecond) { worker.postMessage({ type: 'speed', value: modelSecondsPerSecond }); },
  setDate(mon, day, hour = 0) { worker.postMessage({ type: 'setDate', mon, day, hour }); },
};
window.WeatherSim = api;
window.addEventListener('message', (e) => { // cross-window / iframe integration
  const d = e.data; if (!d || typeof d !== 'object' || !String(d.type || '').startsWith('xtp-weather:')) return;
  let res = null;
  if (d.type === 'xtp-weather:getState') res = api.getState();
  else if (d.type === 'xtp-weather:sample') res = api.sample(d.lon, d.lat);
  if (e.source) e.source.postMessage({ type: d.type + ':result', id: d.id, data: res }, '*');
});

// ---------------- boot ----------------
async function boot() {
  resize(); fitView();
  addEventListener('resize', () => { resize(); clampView(); parts = []; });
  await loadStatic();
  setupTracked();
  const now = new Date(Date.now() + (8 * 60 + new Date().getTimezoneOffset()) * 60000); // 北京时间
  const init = { mon: now.getMonth() + 1, day: Math.min(now.getDate(), MONTH_DAYS[now.getMonth()]), hour: now.getHours() };
  jm.value = init.mon; fillDays(); jd.value = init.day;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const d = e.data;
    if (d.type === 'ready') { meta = d.meta; Hm = d.H; LFm = d.LF; $('loading').style.display = 'none'; worker.postMessage({ type: 'speed', value: 43200 }); }
    else if (d.type === 'frame') onFrame(d);
  };
  worker.onerror = (e) => { $('load-msg').textContent = '模式启动失败：' + (e.message || e); };
  worker.postMessage({ type: 'init', date: init });
  requestAnimationFrame(render);
}
boot().catch(e => { $('load-msg').textContent = '载入失败：' + e; console.error(e); });
