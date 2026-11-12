// 寒潮模拟 · 冬季气温图 —— 播放与显示（WebGL 温度图 + Canvas 地图线条）
const $ = (id) => document.getElementById(id);
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const KX = Math.cos(35 * Math.PI / 180);
const LON0 = 70, LON1 = 170, LAT0 = 0, LAT1 = 66;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DAY0 = 273; // 10月1日 = 一年中的第273天(0起)
const MLAB = ['10月', '11月', '12月', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月'], MLEN = [31, 30, 31, 31, 28, 31, 30, 31, 30, 31, 31, 30];
const view = { s: 10, ox: 0, oy: 0 };
let W = 0, H = 0;
const X = (lon) => view.ox + (lon - LON0) * KX * view.s;
const Y = (lat) => view.oy + (LAT1 - lat) * view.s;
const LONf = (x) => (x - view.ox) / (KX * view.s) + LON0;
const LATf = (y) => LAT1 - (y - view.oy) / view.s;
let dirtyLines = true, dirtyBase = true;

// ---------------- canvases ----------------
const cBase = $('base'), cGL = $('gl'), cLines = $('lines'), cDyn = $('dyn');
const gBase = cBase.getContext('2d'), gLines = cLines.getContext('2d'), gDyn = cDyn.getContext('2d');
function resize() {
  W = innerWidth; H = innerHeight;
  for (const c of [cBase, cLines, cDyn]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
  cGL.width = W; cGL.height = H; // smooth field: 1 GL pixel per CSS pixel is plenty
  dirtyLines = dirtyBase = true; parts = [];
}
function fitView() {
  const top = 70, bot = 90; // keep the main area (85-150E, 12-58N) clear of the bars
  const s1 = W / ((150 - 85) * KX), s2 = (H - top - bot) / (58 - 12);
  view.s = Math.min(s1, s2);
  view.ox = W / 2 - (117.5 - LON0) * KX * view.s;
  view.oy = top + (H - top - bot) / 2 - (LAT1 - 35) * view.s;
  clampView();
}
function minScale() { return Math.max(W / ((LON1 - LON0) * KX), H / (LAT1 - LAT0)); } // map always fills the screen
function clampView() {
  view.s = Math.max(minScale(), Math.min(view.s, 160));
  const mw = (LON1 - LON0) * KX * view.s, mh = (LAT1 - LAT0) * view.s;
  view.ox = Math.min(0, Math.max(W - mw, view.ox));
  view.oy = Math.min(0, Math.max(H - mh, view.oy));
}

// ---------------- static data ----------------
let geo = null, relief = null, tclim = null, paths = {};
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function loadStatic() {
  const [g, tj, tb, rl] = await Promise.all([
    fetch('data/geo.json').then(r => r.json()),
    fetch('data/tclim.json').then(r => r.json()),
    fetch('data/tclim.bin').then(r => r.arrayBuffer()),
    loadImg('data/relief.jpg').catch(() => null),
  ]);
  geo = g; relief = rl; tclim = { ...tj, data: new Uint8Array(tb) };
  for (const k of ['coast0', 'coast1', 'lakes0', 'lakes1', 'prov', 'border']) {
    const p = new Path2D();
    for (const l of geo[k]) { p.moveTo((l[0] - 60) * KX, 70 - l[1]); for (let i = 2; i < l.length; i += 2) p.lineTo((l[i] - 60) * KX, 70 - l[i + 1]); }
    paths[k] = p;
  }
}

// ---------------- winters (precomputed by the model) ----------------
let winterList = [], W_ = null, winterNo = 0, nextW = null, usedW = [];
async function gunzip(buf) {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    return new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer());
  }
  const { gunzipSync } = await import('./vendor/fflate.js');
  return gunzipSync(new Uint8Array(buf));
}
async function loadWinter(name) {
  const [meta, bin] = await Promise.all([fetch(`data/w/${name}.json`).then(r => r.json()), fetch(`data/w/${name}.bin`).then(r => r.arrayBuffer())]);
  const raw = new Int8Array((await gunzip(bin)).buffer);
  const NP = meta.nx * meta.ny, L = 3 * NP, nf = meta.nf;
  const abs = new Int8Array(raw.length), prev = new Int8Array(L);
  for (let f = 0; f < nf; f++) { const o = f * L; for (let k = 0; k < L; k++) { const v = (prev[k] + raw[o + k]) << 24 >> 24; prev[k] = v; abs[o + k] = v; } }
  // cold-front display windows: phase 1 (advancing) and first day after it stops
  const fr = meta.fronts; const show = fr.map(() => []);
  for (let f = 0; f < nf; f++) for (const g of fr[f]) {
    let vis = g[0] === 1;
    if (g[0] === 2) { for (let b = 1; b <= 4 && f - b >= 0; b++) if (fr[f - b].some(h => h[0] === 1 && Math.abs(h[2] - g[2]) < 0.5)) { vis = true; break; } }
    show[f].push(vis);
  }
  let storms = [], high = null;
  try { const t = await fetch(`data/w/${name}.ty.json`).then(r => r.ok ? r.json() : []); if (Array.isArray(t)) storms = t; else { storms = t.storms || []; high = t.high || null; } } catch (e) { storms = []; }
  for (const st of storms) { st.h0 = st.track[0][0]; st.h1 = st.track[st.track.length - 1][0]; st.peak = Math.max(...st.track.map(p => p[3])); }
  return { ...meta, NP, L, abs, show, name, storms, high };
}
function pickWinter() {
  const want = new URLSearchParams(location.search).get('year'); if (want && !usedW.length && winterList.includes(want)) { usedW.push(want); return want; }
  let pool = winterList.filter(n => !usedW.includes(n)); if (!pool.length) { usedW = []; pool = winterList.slice(); }
  const n = pool[Math.floor(Math.random() * pool.length)]; usedW.push(n); return n;
}
function prefetchNext() { if (!nextW) nextW = loadWinter(pickWinter()).catch(() => null); }

// ---------------- playback clock ----------------
let tf = 0, playing = true, speed = 2; // tf: fractional frame index, speed: days per second
function frameDate(f) {
  const doy = (DAY0 + f / W_.per) % 365;
  let d = doy, m = 0; while (m < 11 && d >= MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; }
  return { mon: m + 1, day: Math.floor(d) + 1, hour: (d - Math.floor(d)) * 24, doy };
}
function climPair(doy) {
  const mids = []; let c = 0; for (let i = 0; i < 12; i++) { mids.push(c + MONTH_DAYS[i] / 2); c += MONTH_DAYS[i]; }
  if (doy < mids[0]) return [11, 0, (doy + 365 - mids[11]) / (mids[0] + 365 - mids[11])];
  if (doy >= mids[11]) return [11, 0, (doy - mids[11]) / (mids[0] + 365 - mids[11])];
  for (let i = 0; i < 11; i++) if (doy < mids[i + 1]) return [i, i + 1, (doy - mids[i]) / (mids[i + 1] - mids[i])];
}

// ---------------- WebGL temperature map ----------------
const gl = cGL.getContext('webgl', { premultipliedAlpha: false, antialias: false, alpha: true });
let prog, tex = {}, U = {}, curPair = '', curFrames = '';
const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision highp float;
uniform vec4 uV; uniform vec2 uSz; uniform float uDpr;
uniform sampler2D tC0, tC1, tA0, tA1, tB0, tB1, tPal;
uniform float uCw, uFw, uMode;
uniform vec4 uCg; uniform vec4 uAg;
uniform vec4 uTy[8]; uniform float uTyN; // typhoons: lon, lat, vmax (m/s), radius of max wind (km)
// typhoon wind profile: calm eye inside rm, decaying outside, fading out by ~900 km
float tyV(float r, float vm, float rm) { return r < rm ? vm * pow(r / rm, 1.3) : vm * pow(rm / r, 0.55) * exp(-pow(r / 950.0, 2.0)); }
// manual bilinear sampling (independent of the GPU's filtering support for 8-bit textures)
float bl(sampler2D t, vec2 g, vec2 sz) {
  g = clamp(g, vec2(0.0), sz - 1.001); vec2 i = floor(g), f = g - i;
  vec2 c = (i + 0.5) / sz, d = 1.0 / sz;
  float a = texture2D(t, c).r, b = texture2D(t, c + vec2(d.x, 0.0)).r, e = texture2D(t, c + vec2(0.0, d.y)).r, h = texture2D(t, c + d).r;
  return mix(mix(a, b, f.x), mix(e, h, f.x), f.y);
}
void main(){
  vec2 px = vec2(gl_FragCoord.x, uSz.y - gl_FragCoord.y) / uDpr;
  float lon = (px.x - uV.x) / (uV.w * uV.z) + ${LON0.toFixed(1)};
  float lat = ${LAT1.toFixed(1)} - (px.y - uV.y) / uV.z;
  if (lon < ${LON0.toFixed(1)} || lon > ${LON1.toFixed(1)} || lat < ${LAT0.toFixed(1)} || lat > ${LAT1.toFixed(1)}) { gl_FragColor = vec4(0.0); return; }
  vec2 cg = vec2((lon - uCg.x) / uCg.z, (lat - uCg.y) / uCg.z), CS = vec2(301.0, 199.0);
  vec2 ag = vec2((lon - uAg.x) / uAg.z, (lat - uAg.y) / uAg.z), AS = vec2(67.0, 45.0);
  float a0 = (bl(tA0, ag, AS) * 255.0 - 128.0) * 0.25, a1 = (bl(tA1, ag, AS) * 255.0 - 128.0) * 0.25;
  float an = mix(a0, a1, uFw);
  float v, tyS = 0.0, tyC = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uTyN) break;
    vec4 t = uTy[i]; float dx = (lon - t.x) * 111.2 * cos(radians(t.y)), dy = (lat - t.y) * 111.2, r = sqrt(dx * dx + dy * dy);
    if (r > 1500.0) continue;
    float vt = tyV(r, t.z, t.w); tyS = max(tyS, vt);
    tyC += clamp(t.z / 45.0, 0.0, 1.0) * 2.5 * exp(-pow(r / 280.0, 2.0)); // rain-cooled core
  }
  if (uMode < 0.5) {
    float c0 = bl(tC0, cg, CS) * 127.5 - 50.0, c1 = bl(tC1, cg, CS) * 127.5 - 50.0;
    v = mix(c0, c1, uCw) + an - tyC;
    gl_FragColor = texture2D(tPal, vec2((v + 44.0) / 88.0, 0.1667));
  } else if (uMode < 1.5) {
    float b0 = (bl(tB0, ag, AS) * 255.0 - 128.0) * 0.25, b1 = (bl(tB1, ag, AS) * 255.0 - 128.0) * 0.25;
    v = an - mix(b0, b1, uFw);
    gl_FragColor = texture2D(tPal, vec2((v + 20.0) / 40.0, 0.5));
  } else {
    float s0 = bl(tA0, ag, AS) * 255.0 / 8.0, s1 = bl(tA1, ag, AS) * 255.0 / 8.0;
    float se = mix(s0, s1, uFw); se = sqrt(se * se + tyS * tyS);
    gl_FragColor = texture2D(tPal, vec2(se / 80.0, 0.8333));
  }
}`;
function glInit() {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['uV', 'uSz', 'uDpr', 'tC0', 'tC1', 'tA0', 'tA1', 'tB0', 'tB1', 'tPal', 'uCw', 'uFw', 'uMode', 'uCg', 'uAg', 'uTy', 'uTyN']) U[n] = gl.getUniformLocation(prog, n);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  ['tC0', 'tC1', 'tA0', 'tA1', 'tB0', 'tB1', 'tPal'].forEach((n, i) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U[n], i); tex[n] = { t, unit: i };
  });
  // palette texture: row 0 = temperature (-44..44, 2℃ bands), row 1 = 24h change (-20..20)
  const PW = 352, pal = new Uint8Array(PW * 3 * 4);
  for (let i = 0; i < PW; i++) {
    const v = -44 + 88 * (i + 0.5) / PW, vb = Math.floor(v / 2) * 2 + 1; const c = tempColor(vb);
    pal.set([c[0], c[1], c[2], 225], i * 4);
    const d = -20 + 40 * (i + 0.5) / PW, db = Math.floor(d / 2) * 2 + 1; const e = dColor(db);
    pal.set(e, (PW + i) * 4);
    pal.set(windColor(80 * (i + 0.5) / PW), (2 * PW + i) * 4);
  }
  upload('tPal', PW, 3, pal, gl.RGBA);
  gl.uniform4f(U.uCg, tclim.lon0, tclim.lat0, tclim.res, tclim.nx);
}
function upload(name, w, h, data, fmt = gl.LUMINANCE) {
  gl.activeTexture(gl.TEXTURE0 + tex[name].unit); gl.bindTexture(gl.TEXTURE_2D, tex[name].t);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
}
const TSTOPS = [[-40, 70, 0, 110], [-32, 110, 30, 170], [-24, 80, 60, 210], [-16, 40, 100, 235], [-10, 40, 150, 245], [-4, 100, 195, 250], [0, 175, 225, 255],
  [2, 175, 230, 205], [6, 120, 205, 120], [10, 175, 220, 90], [14, 240, 230, 90], [18, 250, 195, 70], [22, 245, 145, 50], [26, 230, 85, 40], [30, 200, 30, 40], [36, 150, 0, 40], [40, 105, 0, 70], [44, 80, 0, 100]];
function interp(stops, v) {
  if (v <= stops[0][0]) return stops[0].slice(1);
  for (let i = 1; i < stops.length; i++) if (v < stops[i][0]) { const a = stops[i - 1], b = stops[i], f = (v - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(k => Math.round(a[k + 1] + (b[k + 1] - a[k + 1]) * f)); }
  return stops[stops.length - 1].slice(1);
}
const tempColor = (v) => interp(TSTOPS, v);
const DSTOPS = [[-16, 30, 20, 140, 235], [-10, 40, 80, 220, 225], [-5, 90, 160, 245, 205], [-2, 170, 210, 250, 150], [0, 235, 235, 235, 40], [2, 250, 210, 170, 150], [5, 245, 150, 90, 205], [10, 220, 60, 40, 225], [16, 150, 10, 30, 235]];
// continuous wind-speed colour scale (m/s): many distinct hues, fine steps in light winds
const WST = [[0, 228, 236, 252, 200], [1, 190, 208, 250, 210], [2, 140, 175, 245, 215], [3, 95, 140, 235, 220], [4, 60, 110, 215, 225], [5, 40, 155, 210, 225],
  [6, 35, 185, 170, 225], [7, 55, 195, 110, 228], [8, 120, 210, 60, 230], [9, 185, 220, 50, 232], [10, 235, 225, 50, 235], [12, 250, 190, 40, 238], [14, 245, 140, 35, 240],
  [17, 232, 90, 40, 242], [21, 215, 45, 45, 245], [25, 185, 20, 75, 248], [29, 160, 15, 130, 250], [33, 125, 20, 165, 252], [42, 85, 25, 140, 255], [51, 175, 40, 200, 255], [60, 235, 100, 225, 255], [70, 255, 175, 240, 255], [80, 255, 240, 255, 255]];
function windColor(v) {
  if (v <= 0) return WST[0].slice(1);
  for (let i = 1; i < WST.length; i++) if (v < WST[i][0]) { const p = WST[i - 1], q = WST[i], f = (v - p[0]) / (q[0] - p[0]); return [1, 2, 3, 4].map(k => Math.round(p[k] + (q[k] - p[k]) * f)); }
  return WST[WST.length - 1].slice(1);
}
function dColor(v) { if (v <= DSTOPS[0][0]) return DSTOPS[0].slice(1); for (let i = 1; i < DSTOPS.length; i++) if (v < DSTOPS[i][0]) { const a = DSTOPS[i - 1], b = DSTOPS[i], f = (v - a[0]) / (b[0] - a[0]); return [0, 1, 2, 3].map(k => Math.round(a[k + 1] + (b[k + 1] - a[k + 1]) * f)); } return DSTOPS[DSTOPS.length - 1].slice(1); }

let mode = 'temp';
const tmpA = new Uint8Array(67 * 45);
function frameTex(f, name) {
  const NP = W_.NP, o = f * W_.L;
  if (mode === 'wind') { const A = W_.abs; for (let k = 0; k < NP; k++) { const sp = Math.hypot(A[o + NP + k], A[o + 2 * NP + k]) / 2.5; tmpA[k] = Math.min(255, Math.round(sp * 8)); } }
  else for (let k = 0; k < NP; k++) tmpA[k] = W_.abs[o + k] + 128;
  upload(name, W_.nx, W_.ny, tmpA);
}
function drawGL() {
  const nf = W_.nf, f0 = Math.min(nf - 2, Math.floor(tf)), fw = tf - f0, dt = frameDate(tf);
  const [m0, m1, cw] = climPair(dt.doy), pk = m0 + ',' + m1;
  if (pk !== curPair) { const n = tclim.nx * tclim.ny; upload('tC0', tclim.nx, tclim.ny, tclim.data.subarray(m0 * n, m0 * n + n)); upload('tC1', tclim.nx, tclim.ny, tclim.data.subarray(m1 * n, m1 * n + n)); curPair = pk; }
  const fk = W_.name + f0 + mode;
  if (fk !== curFrames) {
    frameTex(f0, 'tA0'); frameTex(f0 + 1, 'tA1');
    if (mode === 'd24') { const b = Math.max(0, f0 - W_.per); frameTex(b, 'tB0'); frameTex(Math.max(0, f0 + 1 - W_.per), 'tB1'); }
    curFrames = fk;
  }
  gl.viewport(0, 0, cGL.width, cGL.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform4f(U.uV, view.ox, view.oy, view.s, KX); gl.uniform2f(U.uSz, cGL.width, cGL.height); gl.uniform1f(U.uDpr, 1);
  gl.uniform1f(U.uCw, cw); gl.uniform1f(U.uFw, fw); gl.uniform1f(U.uMode, mode === 'temp' ? 0 : mode === 'd24' ? 1 : 2);
  gl.uniform4f(U.uAg, W_.lon0, W_.lat0, W_.res, 0);
  const ty = (showTy() ? activeStorms(tf) : []).slice(0, 8), ta = new Float32Array(32);
  ty.forEach((t, i) => ta.set([t.lon, t.lat, t.v, t.rm], i * 4));
  gl.uniform4fv(U.uTy, ta); gl.uniform1f(U.uTyN, ty.length);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------------- base relief + map lines + labels (redrawn only when the view changes) ----------------
function drawBase() {
  const c = gBase; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.fillStyle = '#0d2440'; c.fillRect(0, 0, W, H);
  if (relief) { const x0 = X(60), y0 = Y(70), x1 = X(190), y1 = Y(-6); c.drawImage(relief, x0, y0, x1 - x0, y1 - y0); }
}
function drawLines() {
  const c = gLines; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  if (!geo) return;
  const hi = view.s > 26;
  c.save(); c.setTransform(DPR * view.s, 0, 0, DPR * view.s, DPR * (view.ox - 10 * KX * view.s), DPR * (view.oy - 4 * view.s));
  const lw = (px) => px / view.s;
  if (view.s > 13) { c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = lw(0.7); c.setLineDash([lw(3), lw(2.5)]); c.stroke(paths.prov); c.setLineDash([]); }
  c.strokeStyle = 'rgba(20,40,70,0.7)'; c.lineWidth = lw(0.7); c.stroke(paths[hi ? 'lakes1' : 'lakes0']);
  c.strokeStyle = 'rgba(15,20,30,0.85)'; c.lineWidth = lw(1.1); c.stroke(paths[hi ? 'coast1' : 'coast0']);
  c.strokeStyle = 'rgba(90,20,20,0.9)'; c.lineWidth = lw(1.4); c.stroke(paths.border);
  c.restore();
  if ($('ly-city').checked) drawLabels(c);
}
const placedBoxes = [];
function drawLabels(c) {
  placedBoxes.length = 0;
  // keep text away from the top/bottom bars
  const fits = (x, y, w, h) => { if (y < 76 || y + h > H - 86) return false; for (const b of placedBoxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false; placedBoxes.push([x, y, w, h]); return true; };
  c.textBaseline = 'middle';
  const maxR = view.s < 12 ? 1 : view.s < 17 ? 2 : view.s < 27 ? 3 : view.s < 45 ? 4 : 5;
  c.textAlign = 'left';
  for (const ct of geo.cities) {
    if (ct.r > maxR) continue;
    if (!ct.cn && ct.r > maxR - 1) continue; // fewer foreign cities
    const x = X(ct.x), y = Y(ct.y); if (x < 0 || y < 0 || x > W || y > H) continue;
    const fs = ct.r <= 1 ? 14 : 13; c.font = `${ct.r <= 1 ? 600 : 500} ${fs}px -apple-system,PingFang SC,sans-serif`;
    const w = c.measureText(ct.n).width;
    if (!fits(x - 4, y - fs / 2 - 1, w + 12, fs + 2)) continue;
    c.beginPath(); c.arc(x, y, 3, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#000'; c.stroke();
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.strokeText(ct.n, x + 6, y); c.fillStyle = '#fff'; c.fillText(ct.n, x + 6, y);
  }
  c.textAlign = 'center';
  for (const l of geo.labels) {
    if (l.t !== 'c' && l.t !== 's') continue;
    const x = X(l.x), y = Y(l.y); if (x < 30 || y < 0 || x > W - 30 || y > H) continue;
    const fs = l.t === 'c' ? 15 : 14; c.font = `${l.t === 's' ? 'italic 500' : '700'} ${fs}px -apple-system,PingFang SC,sans-serif`;
    const w = c.measureText(l.n).width; if (!fits(x - w / 2, y - fs / 2, w, fs)) continue;
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.55)'; c.strokeText(l.n, x, y); c.fillStyle = l.t === 's' ? '#d8eeff' : '#fff6e0'; c.fillText(l.n, x, y);
  }
}

// ---------------- dynamic layer: wind flow + cold fronts ----------------
let parts = [];
function sampleField(q, lon, lat, f0, fw) { // q: 0 tAnom, 1 u10, 2 v10 (interpolated in space & time)
  const fi = (lon - W_.lon0) / W_.res, fj = (lat - W_.lat0) / W_.res, nx = W_.nx, ny = W_.ny;
  if (fi < 0 || fj < 0 || fi > nx - 1.001 || fj > ny - 1.001) return 0;
  const i = fi | 0, j = fj | 0, a = fi - i, b = fj - j, n = j * nx + i, sc = W_.scale[q];
  const g = (f) => { const o = f * W_.L + q * W_.NP, A = W_.abs; return ((A[o + n] * (1 - a) + A[o + n + 1] * a) * (1 - b) + (A[o + n + nx] * (1 - a) + A[o + n + nx + 1] * a) * b) / sc; };
  return g(f0) * (1 - fw) + g(f0 + 1) * fw;
}
function newPart() { return { lon: LONf(Math.random() * W), lat: LATf(76 + Math.random() * (H - 160)), age: Math.random() * 60 | 0 }; }
function drawDyn(dtReal) {
  const c = gDyn; c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const nf = W_.nf, f0 = Math.min(nf - 2, Math.floor(tf)), fw = tf - f0;
  curTy = showTy() ? activeStorms(tf) : [];
  if ($('ly-wind').checked) {
    c.globalCompositeOperation = 'destination-in'; c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over';
    if (!parts.length) { const n = Math.round(Math.min(1800, W * H / 600)); for (let i = 0; i < n; i++) parts.push(newPart()); }
    c.lineWidth = 1.1; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.beginPath();
    const k = 0.35; // px per frame per m/s
    for (const p of parts) {
      const x0 = X(p.lon), y0 = Y(p.lat);
      if (p.age > 70 || x0 < 0 || y0 < 0 || x0 > W || y0 > H) { Object.assign(p, newPart()); p.age = 0; continue; }
      let u = sampleField(1, p.lon, p.lat, f0, fw), v = sampleField(2, p.lon, p.lat, f0, fw);
      for (const t of curTy) { const w = tyWind(t, p.lon, p.lat); u += w[0]; v += w[1]; }
      p.lon += u * k / (view.s * Math.max(0.3, Math.cos(p.lat * Math.PI / 180))); p.lat += v * k / view.s;
      c.moveTo(x0, y0); c.lineTo(X(p.lon), Y(p.lat)); p.age++;
    }
    c.stroke();
  } else c.clearRect(0, 0, W, H);
  // fronts are drawn on a separate pass on top (cleared each frame)
  drawFronts(f0, fw);
}
const cFr = document.createElement('canvas'); cFr.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; $('map-wrap').appendChild(cFr);
const gFr = cFr.getContext('2d');
function frontWest(lat) { return lat > 40 ? 90 : lat > 34 ? 97 : 103.5; }
function currentFronts(f0, fw) {
  const a = W_.fronts[f0], b = W_.fronts[f0 + 1] || [];
  const out = [];
  a.forEach((g, i) => {
    const h = b.find(x => Math.abs(x[2] - g[2]) < 0.5);
    const lat = h ? g[1] + (h[1] - g[1]) * fw : g[1];
    out.push({ phase: g[0], lat, lonC: g[2], tilt: g[3], cls: g[4], vis: W_.show[f0][i] });
  });
  return out;
}
// ---------------- typhoons (auto-generated each year by tools/gen_typhoons.mjs) ----------------
let curTy = [];
const showTy = () => $('ly-ty').checked;
function tyLerp(st, h) {
  const T = st.track; let i = Math.min(T.length - 2, Math.max(0, Math.floor((h - T[0][0]) / 3)));
  while (i > 0 && T[i][0] > h) i--; while (i < T.length - 2 && T[i + 1][0] <= h) i++;
  const a = T[i], b = T[i + 1], f = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
  return { lon: a[1] + (b[1] - a[1]) * f, lat: a[2] + (b[2] - a[2]) * f, v: a[3] + (b[3] - a[3]) * f, rm: a[4] + (b[4] - a[4]) * f, et: a[5] + (b[5] - a[5]) * f, i };
}
function activeStorms(f) {
  if (!W_ || !W_.storms) return [];
  const h = f * 24 / W_.per, out = [];
  for (const st of W_.storms) if (h >= st.h0 && h <= st.h1) { const p = tyLerp(st, h); p.st = st; p.h = h; out.push(p); }
  return out.sort((a, b) => b.v - a.v);
}
function tyProfile(r, vm, rm) { return r < rm ? vm * Math.pow(r / rm, 1.3) : vm * Math.pow(rm / r, 0.55) * Math.exp(-Math.pow(r / 950, 2)); }
function tyWind(t, lon, lat) { // counter-clockwise circulation with ~20° inflow
  const dx = (lon - t.lon) * 111.2 * Math.cos(t.lat * Math.PI / 180), dy = (lat - t.lat) * 111.2, r = Math.hypot(dx, dy);
  if (r > 1400 || r < 1) return [0, 0];
  const V = tyProfile(r, t.v, t.rm) * 0.85, ex = dx / r, ey = dy / r;
  return [V * (-ey - 0.36 * ex), V * (ex - 0.36 * ey)];
}
function tyCat(v) {
  return v >= 51 ? ['超强台风', '#d81bd8'] : v >= 41.5 ? ['强台风', '#e8204a'] : v >= 32.7 ? ['台风', '#ff7a1a'] : v >= 24.5 ? ['强热带风暴', '#f5c400'] : v >= 17.2 ? ['热带风暴', '#2fb5ff'] : ['热带低压', '#7fd36b'];
}
const pastCv = document.createElement('canvas'); let pastKey = '';
function drawHigh(c, boxes) {
  if (!$('ly-high').checked || !W_.high) return;
  const H_ = W_.high, d = Math.max(0, Math.min(H_.days.length - 1, tf / W_.per)), d0 = Math.floor(d), d1 = Math.min(H_.days.length - 1, d0 + 1), w = d - d0;
  const A = H_.days[d0], B = H_.days[d1], lonW = A[0] * (1 - w) + B[0] * w;
  const pts = []; H_.lons.forEach((lon, i) => { if (lon >= lonW - 2) pts.push([Math.min(lon, 170), A[i + 1] * (1 - w) + B[i + 1] * w]); });
  if (pts.length < 2) return;
  c.setLineDash([7, 5]); c.lineWidth = 2; c.strokeStyle = 'rgba(150,40,190,0.85)'; c.beginPath();
  // smooth: Catmull-Rom through the edge points
  const P2 = pts.map(p => [X(p[0]), Y(p[1])]); c.moveTo(P2[0][0], P2[0][1]);
  for (let i = 0; i < P2.length - 1; i++) { const p0 = P2[Math.max(0, i - 1)], p1 = P2[i], p2 = P2[i + 1], p3 = P2[Math.min(P2.length - 1, i + 2)];
    c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); }
  c.stroke(); c.setLineDash([]);
  const x = P2[0][0], y = P2[0][1]; c.font = '600 12px -apple-system,PingFang SC,sans-serif';
  const t = '副高', tw = c.measureText(t).width + 10;
  if (y > 80 && y < H - 100 && x > 4 && x < W - 40) { c.fillStyle = 'rgba(120,30,160,0.85)'; roundRect(c, x - tw - 4, y - 9, tw, 18, 9); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(t, x - tw + 1, y + 0.5); boxes.push([x - tw - 4, y - 9, tw, 18]); }
}
function drawTyphoons(c) {
  const boxes = [];
  drawHigh(c, boxes);
  if (!showTy()) return;
  // earlier storms of this year: thin faint full tracks with a small name
  const h = tf * 24 / W_.per;
  c.lineWidth = 1.2; c.lineCap = 'round';
  const past = W_.storms.filter(st => st.h1 < h);
  const key = W_.name + past.length + ',' + view.ox + ',' + view.oy + ',' + view.s + ',' + cFr.width + ',' + cFr.height;
  if (pastKey !== key) { // cache the faint past tracks; redraw only when a storm ends or the view changes
    pastKey = key; if (pastCv.width !== cFr.width || pastCv.height !== cFr.height) { pastCv.width = cFr.width; pastCv.height = cFr.height; }
    const g = pastCv.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H); g.lineWidth = 1.2; g.lineCap = 'round'; g.globalAlpha = 0.5;
    for (const st of past) { const T = st.track; for (let k = 1; k < T.length; k++) { g.strokeStyle = tyCat(T[k - 1][3])[1]; g.beginPath(); g.moveTo(X(T[k - 1][1]), Y(T[k - 1][2])); g.lineTo(X(T[k][1]), Y(T[k][2])); g.stroke(); } }
  }
  c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(pastCv, 0, 0); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const hit = (x, y, w, h) => { if (y < 76 || y + h > H - 86 || x < 4 || x + w > W - 4) return true; for (const b of boxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return true; return false; };
  // tracks first
  for (const t of curTy) {
    const T = t.st.track; c.lineWidth = 2.2; c.lineCap = 'round';
    for (let k = 1; k <= t.i + 1 && k < T.length; k++) {
      const a = T[k - 1], b = k <= t.i ? T[k] : [0, t.lon, t.lat, t.v];
      c.strokeStyle = tyCat(a[3])[1]; c.beginPath(); c.moveTo(X(a[1]), Y(a[2])); c.lineTo(X(b[1]), Y(b[2])); c.stroke();
    }
    for (let k = 0; k <= t.i; k += 8) { c.beginPath(); c.arc(X(T[k][1]), Y(T[k][2]), 2.2, 0, 7); c.fillStyle = '#fff'; c.fill(); } // one dot per day
  }
  // symbols + labels
  for (const t of curTy) {
    const x = X(t.lon), y = Y(t.lat); if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
    const [cn, col] = tyCat(t.v), R = t.v >= 32.7 ? 11 : 9, ang = -t.h * 0.9;
    c.save(); c.translate(x, y); c.rotate(ang);
    c.lineWidth = 3.4; c.strokeStyle = 'rgba(0,0,0,0.55)';
    const glyph = () => { c.beginPath(); c.arc(0, 0, R * 0.55, 0, 7); c.moveTo(R * 0.55, 0); c.arc(R * 1.15, 0, R * 0.6, Math.PI, Math.PI * 1.75, false); c.moveTo(-R * 0.55, 0); c.arc(-R * 1.15, 0, R * 0.6, 0, Math.PI * 0.75, false); };
    if (t.v >= 17.2) { glyph(); c.stroke(); c.lineWidth = 2.4; c.strokeStyle = col; glyph(); c.stroke(); }
    c.beginPath(); c.arc(0, 0, R * 0.55, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#fff'; c.stroke();
    c.restore();
    if (t.v < 17.2 && view.s < 14) continue;
    const txt = `${t.st.name} · ${t.et > 0.6 ? '变性温带气旋' : cn} ${Math.round(t.v)}米/秒`;
    c.font = '600 13px -apple-system,PingFang SC,sans-serif'; const w = c.measureText(txt).width + 14, h = 22;
    let pos = null;
    const cand = [[16, -h / 2], [-16 - w, -h / 2], [-w / 2, 16], [-w / 2, -16 - h], [16, 8], [16, -h - 8]];
    const cityHit = (x, y) => placedBoxes.some(b => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]);
    for (const [ox, oy] of cand) if (!hit(x + ox, y + oy, w, h) && !cityHit(x + ox, y + oy)) { pos = [x + ox, y + oy]; break; }
    if (!pos) for (const [ox, oy] of cand) if (!hit(x + ox, y + oy, w, h)) { pos = [x + ox, y + oy]; break; }
    if (!pos) continue; boxes.push([pos[0], pos[1], w, h]);
    c.fillStyle = 'rgba(12,18,30,0.78)'; roundRect(c, pos[0], pos[1], w, h, 11); c.fill();
    c.fillStyle = col; c.fillRect(pos[0] + 7, pos[1] + 6, 3, h - 12);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, pos[0] + 14, pos[1] + h / 2 + 0.5);
  }
  c.font = '500 11px -apple-system,PingFang SC,sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
  for (const st of past) {
    let k = 0; for (let i = 0; i < st.track.length; i++) if (st.track[i][3] >= st.peak - 0.01) { k = i; break; } // name at peak intensity
    const x = X(st.track[k][1]) + 5, y = Y(st.track[k][2]), w = c.measureText(st.name).width + 2;
    if (x < 4 || x + w > W - 4 || y < 84 || y > H - 96) continue;
    if (boxes.some(b => x < b[0] + b[2] && x + w > b[0] && y - 7 < b[1] + b[3] && y + 7 > b[1])) continue;
    boxes.push([x, y - 7, w, 14]);
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(0,0,0,0.45)'; c.strokeText(st.name, x, y); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillText(st.name, x, y);
  }
}
function drawFronts(f0, fw) {
  const c = gFr; if (cFr.width !== cDyn.width) { cFr.width = cDyn.width; cFr.height = cDyn.height; }
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  drawTyphoons(c);
  return; // cold-front drawing removed at the user's request
  for (const g of currentFronts(f0, fw)) {
    if (g.phase === 0) { // cold air building up over Mongolia / Siberia
      const x = X(g.lonC - 4), y = Y(g.lat - 1); if (y < 80 || y > H - 90) continue;
      c.font = '700 15px -apple-system,PingFang SC,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const t = '冷空气堆积中', w = c.measureText(t).width + 20;
      c.fillStyle = 'rgba(25,60,160,0.85)'; roundRect(c, x - w / 2, y - 15, w, 30, 15); c.fill();
      c.fillStyle = '#fff'; c.fillText(t, x, y);
      continue;
    }
    if (!g.vis) continue;
    const pts = [];
    for (let lon = 86; lon <= 136; lon += 0.5) { const la = g.lat + g.tilt * (lon - g.lonC); if (la < 8 || la > 62 || lon < frontWest(la)) continue; pts.push([X(lon), Y(la)]); }
    if (pts.length < 4) continue;
    c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 6.5; c.stroke(); c.strokeStyle = '#1748d8'; c.lineWidth = 3.5; c.stroke();
    // triangles on the warm (south) side, pointing the way the cold air moves
    c.fillStyle = '#1748d8'; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.5;
    let acc = 0; const step = 46, sz = 9;
    for (let i = 1; i < pts.length; i++) {
      const [xa, ya] = pts[i - 1], [xb, yb] = pts[i], L = Math.hypot(xb - xa, yb - ya); acc += L;
      if (acc < step) continue; acc = 0;
      const ux = (xb - xa) / L, uy = (yb - ya) / L; let nx = -uy, ny = ux; if (ny < 0) { nx = -nx; ny = -ny; }
      const mx = (xa + xb) / 2, my = (ya + yb) / 2;
      c.beginPath(); c.moveTo(mx - ux * sz, my - uy * sz); c.lineTo(mx + ux * sz, my + uy * sz); c.lineTo(mx + nx * sz * 1.4, my + ny * sz * 1.4); c.closePath(); c.fill(); c.stroke();
    }
    const mid = pts[Math.floor(pts.length * 0.35)];
    c.font = '700 15px -apple-system,PingFang SC,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.95)'; c.strokeText('冷锋', mid[0], mid[1] - 18); c.fillStyle = '#1240c0'; c.fillText('冷锋', mid[0], mid[1] - 18);
  }
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

// ---------------- status text ----------------
function region(lat) {
  return lat > 44 ? '内蒙古、东北北部' : lat > 38 ? '华北、东北南部' : lat > 33 ? '黄淮一带' : lat > 29 ? '长江中下游' : lat > 25.5 ? '江南' : lat > 21.5 ? '华南' : '华南沿海和南海北部';
}
function statusText(f0, fw) {
  const fr = currentFronts(f0, fw);
  const adv = fr.filter(g => g.phase === 1).sort((a, b) => a.lat - b.lat)[0];
  const strength = (g) => g.cls === 2 ? '强冷空气（寒潮）' : g.cls === 1 ? '较强冷空气' : '一股冷空气';
  if (adv) { const la = adv.lat + adv.tilt * (113 - adv.lonC); return `${strength(adv)}正在南下，已到<b>${region(la)}</b>，所到之处刮北风、气温骤降`; }
  const stop = fr.find(g => g.phase === 2);
  if (stop) { const la = stop.lat + stop.tilt * (113 - stop.lonC); return `冷空气已南下到<b>${region(la)}</b>，大范围气温偏低，之后将慢慢回升`; }
  if (fr.some(g => g.phase === 0)) return '蒙古—西伯利亚一带<b>冷空气正在堆积</b>，即将南下';
  return '暂无明显冷空气活动';
}

// ---------------- city panel ----------------
let selected = null;
function climAt(lon, lat, doy) {
  const [m0, m1, w] = climPair(doy), T = tclim, n = T.nx * T.ny;
  const fi = Math.max(0, Math.min(T.nx - 1.001, (lon - T.lon0) / T.res)), fj = Math.max(0, Math.min(T.ny - 1.001, (lat - T.lat0) / T.res));
  const i = fi | 0, j = fj | 0, a = fi - i, b = fj - j, k = j * T.nx + i, d = T.data;
  const g = (m) => { const o = m * n; return ((d[o + k] * (1 - a) + d[o + k + 1] * a) * (1 - b) + (d[o + k + T.nx] * (1 - a) + d[o + k + T.nx + 1] * a) * b) / 2 - 50; };
  return g(m0) * (1 - w) + g(m1) * w;
}
function tempAt(lon, lat, f) {
  const f0 = Math.min(W_.nf - 2, Math.floor(f)); let T = climAt(lon, lat, frameDate(f).doy) + sampleField(0, lon, lat, f0, f - f0);
  if (showTy()) for (const t of activeStorms(f)) { const r = Math.hypot((lon - t.lon) * 111.2 * Math.cos(t.lat * Math.PI / 180), (lat - t.lat) * 111.2); T -= Math.min(1, Math.max(0, t.v / 45)) * 2.5 * Math.exp(-Math.pow(r / 280, 2)); }
  return T;
}
function showCity() {
  if (!selected) return;
  $('city').classList.remove('hidden');
  $('city-name').textContent = selected.name;
  const T = tempAt(selected.lon, selected.lat, tf), Tb = tempAt(selected.lon, selected.lat, Math.max(0, tf - W_.per));
  const d = T - Tb;
  $('city-now').innerHTML = `现在 <b>${T.toFixed(1)}℃</b>　24小时 <b style="color:${d < -0.5 ? '#8fc4ff' : d > 0.5 ? '#ffb38a' : '#fff'}">${d > 0 ? '升' : '降'} ${Math.abs(d).toFixed(1)}℃</b>`;
  drawChart();
}
function drawChart() {
  const cv = $('city-chart'), g = cv.getContext('2d'), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * DPR)) { cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); }
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h);
  const nf = W_.nf, cur = Math.floor(tf), vals = [];
  for (let f = 0; f <= cur; f++) vals.push(tempAt(selected.lon, selected.lat, f));
  let mn = Math.min(0, ...vals, 0), mx = Math.max(10, ...vals); mn = Math.floor((mn - 2) / 5) * 5; mx = Math.ceil((mx + 2) / 5) * 5;
  const L = 34, R = 8, T = 6, B = 18, x = (f) => L + f / (nf - 1) * (w - L - R), y = (v) => T + (mx - v) / (mx - mn) * (h - T - B);
  g.font = '11px -apple-system,sans-serif'; g.fillStyle = '#c9d6ea'; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  for (let v = mn; v <= mx; v += (mx - mn > 30 ? 10 : 5)) { g.beginPath(); g.moveTo(L, y(v)); g.lineTo(w - R, y(v)); g.stroke(); g.fillText(v + '°', 4, y(v) + 4); }
  let acc = 0; const step = w < 400 ? 2 : 1; for (let m = 0; m < 12 && acc * W_.per < nf; m++) { const md = MLEN[m]; if (m % step === 0) g.fillText(MLAB[m], x(acc * W_.per) + 2, h - 4); g.beginPath(); g.moveTo(x(acc * W_.per), T); g.lineTo(x(acc * W_.per), h - B); g.stroke(); acc += md; }
  g.setLineDash([4, 4]); g.strokeStyle = 'rgba(160,210,255,0.8)'; g.beginPath(); g.moveTo(L, y(0)); g.lineTo(w - R, y(0)); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#ff8a6a'; g.lineWidth = 1.8; g.beginPath(); vals.forEach((v, f) => f ? g.lineTo(x(f), y(v)) : g.moveTo(x(f), y(v))); g.stroke();
  if (vals.length) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x(cur), y(vals[vals.length - 1]), 3.5, 0, 7); g.fill(); }
}

// ---------------- gestures ----------------
const ptrs = new Map(); let gesture = null, tapStart = null;
const wrap = $('map-wrap');
wrap.addEventListener('pointerdown', (e) => {
  wrap.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  tapStart = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; startGesture();
  closePops();
});
wrap.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (!gesture) return;
  const pts = [...ptrs.values()];
  if (pts.length === 1 && gesture.n === 1) { view.ox = gesture.ox + pts[0].x - gesture.cx; view.oy = gesture.oy + pts[0].y - gesture.cy; }
  else if (pts.length >= 2 && gesture.n >= 2) {
    const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2, d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const lon = (gesture.cx - gesture.ox) / (KX * gesture.s), lat = (gesture.cy - gesture.oy) / gesture.s;
    view.s = Math.max(minScale(), Math.min(160, gesture.s * d / gesture.d)); view.ox = cx - lon * KX * view.s; view.oy = cy - lat * view.s;
  }
  clampView(); markView();
});
const endPtr = (e) => {
  ptrs.delete(e.pointerId);
  if (tapStart && ptrs.size === 0) { const dx = e.clientX - tapStart.x, dy = e.clientY - tapStart.y; if (dx * dx + dy * dy < 81 && performance.now() - tapStart.t < 500) onTap(e.clientX, e.clientY); }
  tapStart = null; startGesture();
};
wrap.addEventListener('pointerup', endPtr); wrap.addEventListener('pointercancel', endPtr);
wrap.addEventListener('wheel', (e) => {
  e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015), lon = (e.clientX - view.ox) / (KX * view.s), lat = (e.clientY - view.oy) / view.s;
  view.s = Math.max(minScale(), Math.min(160, view.s * f)); view.ox = e.clientX - lon * KX * view.s; view.oy = e.clientY - lat * view.s; clampView(); markView();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
function startGesture() {
  const pts = [...ptrs.values()]; if (!pts.length) { gesture = null; return; }
  gesture = pts.length === 1 ? { n: 1, cx: pts[0].x, cy: pts[0].y, ox: view.ox, oy: view.oy }
    : { n: 2, cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, d: Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), s: view.s, ox: view.ox, oy: view.oy };
}
function markView() { dirtyLines = dirtyBase = true; parts = []; gDyn.setTransform(1, 0, 0, 1, 0, 0); gDyn.clearRect(0, 0, cDyn.width, cDyn.height); }
function onTap(x, y) {
  if (!W_) return;
  let best = null, bd = 30 * 30;
  for (const b of geo.cities) { if (!b.cn && b.r > 3) continue; const d = (X(b.x) - x) ** 2 + (Y(b.y) - y) ** 2; if (d < bd && (b.r <= 4 || d < 100)) { bd = d; best = b; } }
  if (best) selected = { name: best.n, lon: best.x, lat: best.y };
  else { const lon = LONf(x), lat = LATf(y); if (lon < LON0 + 1 || lon > LON1 - 1 || lat < LAT0 + 1 || lat > LAT1 - 1) return; selected = { name: `${lon.toFixed(1)}°E ${lat.toFixed(1)}°N`, lon, lat }; }
  showCity();
}

// ---------------- controls ----------------
function closePops() { $('layers').classList.add('hidden'); $('btn-layers').classList.remove('on'); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { $(b.dataset.close).classList.add('hidden'); if (b.dataset.close === 'city') selected = null; });
$('btn-layers').onclick = () => { const h = $('layers').classList.toggle('hidden'); $('btn-layers').classList.toggle('on', !h); };
const setPlay = (p) => { playing = p; $('btn-play').textContent = p ? '⏸' : '▶'; };
$('btn-play').onclick = () => setPlay(!playing);
document.querySelectorAll('#speeds button').forEach(b => b.onclick = () => { document.querySelectorAll('#speeds button').forEach(x => x.classList.remove('on')); b.classList.add('on'); speed = +b.dataset.sp; });
function setMode(m) {
  mode = m; curFrames = ''; drawLegend();
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x.dataset.mode === m));
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
['ly-city'].forEach(id => $(id).onchange = () => { dirtyLines = true; });
$('ly-wind').onchange = () => { parts = []; gDyn.setTransform(1, 0, 0, 1, 0, 0); gDyn.clearRect(0, 0, cDyn.width, cDyn.height); };
const slider = $('slider'); let scrubbing = false;
slider.addEventListener('input', () => { scrubbing = true; tf = +slider.value; });
slider.addEventListener('change', () => { scrubbing = false; });
$('btn-next').onclick = () => switchWinter();
function buildTicks() {
  const t = $('ticks'); t.innerHTML = ''; let acc = 0;
  const nd = (W_.nf - 1) / W_.per;
  MLAB.forEach((m, i) => { if (acc + 10 > nd) return; const s = document.createElement('span'); s.textContent = m; s.style.left = ((acc + MLEN[i] / 2) / nd * 100) + '%'; t.appendChild(s); acc += MLEN[i]; });
}
function drawLegend() {
  const cv = $('legend-bar'), g = cv.getContext('2d'), w = cv.width, h = cv.height, ticks = $('legend-ticks');
  ticks.innerHTML = '';
  if (mode === 'temp') {
    $('legend-title').textContent = '地面气温（℃）';
    for (let x = 0; x < w; x++) { const v = -32 + 76 * x / w, c = tempColor(Math.floor(v / 2) * 2 + 1); g.fillStyle = `rgb(${c})`; g.fillRect(x, 0, 1, h); }
    for (const v of [-30, -20, -10, 0, 10, 20, 30, 40]) { const s = document.createElement('span'); s.textContent = v; s.style.left = ((v + 32) / 76 * 100) + '%'; ticks.appendChild(s); }
  } else if (mode === 'wind') {
    $('legend-title').textContent = '10米风速（米/秒）';
    const pos = (v) => v <= 17 ? 0.38 * v / 17 : 0.38 + 0.62 * (v - 17) / 63, inv = (q) => q <= 0.38 ? 17 * q / 0.38 : 17 + 63 * (q - 0.38) / 0.62;
    for (let x = 0; x < w; x++) { const c = windColor(inv(x / w)); g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x, 0, 1, h); }
    for (const v of (W < 900 ? [0, 5, 10, 17, 25, 33, 42, 51, 60, 70, 80] : [0, 2, 4, 6, 8, 10, 12, 14, 17, 25, 33, 42, 51, 60, 70, 80])) { const s = document.createElement('span'); s.textContent = v; s.style.left = (Math.max(1.5, Math.min(98, pos(v) * 100))) + '%'; ticks.appendChild(s); }
  } else {
    $('legend-title').textContent = '24小时变温（℃）：蓝色＝降温，红色＝升温';
    for (let x = 0; x < w; x++) { const v = -16 + 32 * x / w, c = dColor(Math.floor(v / 2) * 2 + 1); g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x, 0, 1, h); }
    for (const v of [-16, -8, -4, 0, 4, 8, 16]) { const s = document.createElement('span'); s.textContent = v > 0 ? '+' + v : v; s.style.left = ((v + 16) / 32 * 100) + '%'; ticks.appendChild(s); }
  }
}

// ---------------- main loop ----------------
let lastT = performance.now(), lastUi = 0, switching = false;
async function switchWinter(startFrame = 0) {
  if (switching) return; switching = true;
  try {
    prefetchNext(); const w = await nextW; nextW = null;
    if (w) { W_ = w; winterNo++; tf = Math.min(startFrame, w.nf - 2); curFrames = ''; parts = []; slider.max = w.nf - 1; buildTicks(); }
    prefetchNext();
  } finally { switching = false; }
}
function render(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (W_) {
    if (playing && !scrubbing) {
      tf += speed * W_.per * dt;
      if (tf >= W_.nf - 1.001) { tf = W_.nf - 1.001; switchWinter(0); }
    }
    if (dirtyBase) { drawBase(); dirtyBase = false; }
    if (dirtyLines) { drawLines(); dirtyLines = false; }
    drawGL();
    drawDyn(dt);
    if (now - lastUi > 120) { lastUi = now; updateUi(); }
  }
  requestAnimationFrame(render);
}
function updateUi() {
  const f0 = Math.min(W_.nf - 2, Math.floor(tf)), d = frameDate(tf);
  $('date-str').textContent = `${d.mon}月${d.day}日`;
  $('winter-str').textContent = `第 ${winterNo} 个模拟年 · 每天都由模式算出`;
  const ty = showTy() ? activeStorms(tf).filter(t => t.v >= 17.2) : [];
  const st = ty.length ? `🌀 ${ty.slice(0, 3).map(t => `<b>${t.st.name}</b> ${tyCat(t.v)[0]}`).join('　')}${ty.length > 3 ? ` 等${ty.length}个` : ''}`
    : (d.mon >= 5 && d.mon <= 9) ? '' : statusText(f0, tf - f0); if ($('status').innerHTML !== st) $('status').innerHTML = st;
  if (!scrubbing) slider.value = Math.round(tf);
  if (selected) showCity();
  api._emit();
}

// ---------------- small public API (state of the simulated winter) ----------------
const api = {
  _subs: [], _emit() { if (!this._subs.length) return; const s = this.getState(); for (const f of this._subs) try { f(s); } catch (e) { } },
  getState() { if (!W_) return null; const f0 = Math.min(W_.nf - 2, Math.floor(tf)); return { date: frameDate(tf), winter: winterNo, frame: tf, coldFronts: currentFronts(f0, tf - f0), status: $('status').textContent, typhoons: activeStorms(tf).map(t => ({ name: t.st.name, lon: +t.lon.toFixed(2), lat: +t.lat.toFixed(2), vmax: +t.v.toFixed(1), category: tyCat(t.v)[0] })) }; },
  temperature(lon, lat) { return W_ ? tempAt(lon, lat, tf) : null; },
  onUpdate(cb) { this._subs.push(cb); return () => { this._subs = this._subs.filter(f => f !== cb); }; },
  play() { setPlay(true); }, pause() { setPlay(false); }, setSpeed(daysPerSecond) { speed = daysPerSecond; },
  seek(mon, day) { let doy = 0; for (let i = 0; i < mon - 1; i++) doy += MONTH_DAYS[i]; doy += day - 1; tf = Math.max(0, Math.min(W_.nf - 1.001, ((doy - DAY0 + 365) % 365) * W_.per)); },
  nextWinter() { return switchWinter(0); }, nextYear() { return switchWinter(0); },
  seekFrame(f) { tf = Math.max(0, Math.min(W_.nf - 1.001, f)); },
  showCity(name) { const b = geo.cities.find(c => c.n === name); if (b) { selected = { name: b.n, lon: b.x, lat: b.y }; showCity(); } },
};
window.WeatherSim = api;

// ---------------- boot ----------------
async function boot() {
  resize(); fitView();
  addEventListener('resize', () => { resize(); fitView(); });
  const idx = fetch('data/w/index.json').then(r => r.json());
  await loadStatic();
  winterList = (await idx).winters;
  if (!gl) throw new Error('此浏览器不支持 WebGL，无法绘制温度图');
  glInit(); drawLegend();
  // start on today's date if it is in the cold season, otherwise on Oct 1
  const now = new Date(Date.now() + (8 * 60 + new Date().getTimezoneOffset()) * 60000);
  let doy = 0; for (let i = 0; i < now.getMonth(); i++) doy += MONTH_DAYS[i]; doy += now.getDate() - 1;
  const off = (doy - DAY0 + 365) % 365;
  await switchWinter(off * 4);
  $('loading').style.display = 'none';
  setPlay(true);
  requestAnimationFrame(render);
}
boot().catch(e => { $('load-msg').textContent = '载入失败：' + e.message; console.error(e); });
