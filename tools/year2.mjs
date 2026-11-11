import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const dt=+(process.env.DT||200), days=+process.argv[2]||365, out=process.argv[3]||'/tmp/y.json', mon=+process.argv[4]||10, seed=+process.argv[5]||1, saveInit=process.argv[6]==='1';
const m=new Model(meta,clim,{dt,seed});
m.setDate(mon,1); m.addNoise(1);
const city={北京:[116.4,39.9],上海:[121.5,31.2],广州:[113.3,23.1],哈尔滨:[126.6,45.8],武汉:[114.3,30.6],长沙:[113,28.2],南宁:[108.4,22.8],东京:[139.7,35.7],首尔:[127,37.6],乌兰巴托:[106.9,47.9]};
const idx=(lo,la)=>Math.round((la-meta.lat0)/meta.res)*meta.nx+Math.round((lo-meta.lon0)/meta.res);
const spd=Math.round(86400/dt), rec=[]; const t0=Date.now();
const enc=(st)=>{ const K=m.K,N=m.N; const a=new Int16Array(st.length); for(let x=0;x<st.length;x++){ const s= x>=3*K*N ? 1e5 : 100; a[x]=Math.max(-32767,Math.min(32767,Math.round(st[x]*s))); } return Buffer.from(a.buffer); };
for(let d=0; d<days; d++){
  const acc={}; for(const c in city) acc[c]={T:[],P:[],R:0,V:0};
  let w=null, dd=null, en=0, z5bar=0;
  for(let s=0;s<spd;s++){ m.step(); if(s%(spd/4|0)===0){ const o=m.diagnose(); for(const [c,[lo,la]] of Object.entries(city)){ const n=idx(lo,la); acc[c].T.push(o.t2m[n]); acc[c].P.push(o.slp[n]); acc[c].R+=o.precip[n]/4; acc[c].V=Math.max(acc[c].V,Math.hypot(o.u10[n],o.v10[n])); } if(!w){ w=o.wpsh; dd=o.date; en=o.enso; } } }
  let bad=false; for(let x=0;x<m.u1.length;x+=7) if(!isFinite(m.u1[x])) bad=true;
  if(bad){ console.log('BLOWUP day',d); break; }
  const r={d, mon:dd.mon, day:dd.day, wpsh:w, enso:+en.toFixed(2), c:{}};
  for(const c in city){ const a=acc[c]; r.c[c]=[+(a.T.reduce((x,y)=>x+y)/a.T.length).toFixed(1), +(a.P.reduce((x,y)=>x+y)/a.P.length).toFixed(1), +a.R.toFixed(1), +a.V.toFixed(1)]; }
  rec.push(r);
  if(saveInit && dd.day===1 && [1,4,7,10].includes(dd.mon) && d>20) { fs.writeFileSync(D+`init_${dd.mon}.bin`, enc(m.exportState())); console.log('saved init',dd.mon); }
  if(d%15===0) console.log('R'+(m.restores||0),`${dd.mon}/${dd.day}`, 'ridge',w.ridgeLat?.toFixed(1),'west',w.westLon,'area',w.area, JSON.stringify(Object.fromEntries(Object.entries(r.c).slice(0,5).map(([k,v])=>[k,v[0]]))), ((Date.now()-t0)/1000/(d+1)).toFixed(2)+'s/day');
}
fs.writeFileSync(out, JSON.stringify(rec)); console.log('restores', m.restores||0);
