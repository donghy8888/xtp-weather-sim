import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const dt=+process.argv[2]||200, days=+process.argv[3]||365, out=process.argv[4]||'/tmp/year.json', mon=+process.argv[5]||1;
const m=new Model(meta,clim,{dt});
m.setDate(mon,1); m.addNoise(1);
const city={北京:[116.4,39.9],上海:[121.5,31.2],广州:[113.3,23.1],哈尔滨:[126.6,45.8],武汉:[114.3,30.6],东京:[139.7,35.7],马尼拉:[121,14.6],乌兰巴托:[106.9,47.9]};
const idx=(lo,la)=>Math.round((la-meta.lat0)/meta.res)*meta.nx+Math.round((lo-meta.lon0)/meta.res);
const spd=Math.round(86400/dt), rec=[]; const t0=Date.now();
for(let d=0; d<days; d++){
  const acc={}; for(const c in city) acc[c]={T:[],P:[],R:0};
  for(let s=0;s<spd;s++){ m.step(); if(s%(spd/4|0)===0){ const o=m.diagnose(); for(const [c,[lo,la]] of Object.entries(city)){ const n=idx(lo,la); acc[c].T.push(o.t2m[n]); acc[c].P.push(o.slp[n]); acc[c].R+=o.precip[n]/4; } if(s===0){ var w=o.wpsh; var dd=o.date; var en=o.enso;} } }
  let bad=false; for(let x=0;x<m.u1.length;x+=7) if(!isFinite(m.u1[x])) bad=true;
  if(bad){ console.log('BLOWUP day',d); break; }
  const r={d, date:`${dd.mon}/${dd.day}`, wpsh:w, enso:+en.toFixed(2), c:{}};
  for(const c in city){ const a=acc[c]; r.c[c]=[+(a.T.reduce((x,y)=>x+y)/a.T.length).toFixed(1), +(a.P.reduce((x,y)=>x+y)/a.P.length).toFixed(1), +a.R.toFixed(1)]; }
  rec.push(r);
  if(d%10===0) console.log(r.date, JSON.stringify(r.wpsh), JSON.stringify(r.c), ((Date.now()-t0)/1000/(d+1)).toFixed(2)+'s/day');
}
fs.writeFileSync(out, JSON.stringify(rec));
fs.writeFileSync(out.replace('.json','.state.bin'), Buffer.from(m.exportState().buffer));
