// winter test: node tools/winter.mjs seed [days] [startMon]
import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const seed=+process.argv[2]||1, days=+process.argv[3]||212, mon=+process.argv[4]||10;
const m=new Model(meta,clim,{dt:200,seed});
const ib=fs.readFileSync(D+'init_10.bin'); const i16=new Int16Array(ib.buffer,ib.byteOffset,ib.byteLength/2); const a=new Float32Array(i16.length);
for(let x=0;x<a.length;x++) a[x]=i16[x]*0.01; for(let n=3*m.K*m.N;n<a.length;n++) a[n]=i16[n]*1e-5;
m.importState(a,0.9); m.addNoise(0.6); m.setDate(mon,1);
const C={北京:[116.4,39.9],上海:[121.5,31.2],武汉:[114.3,30.6],长沙:[113,28.2],南昌:[115.9,28.7],桂林:[110.3,25.3],广州:[113.3,23.1],南宁:[108.3,22.8],福州:[119.3,26.1],哈尔滨:[126.6,45.8]};
const bil=(arr,lon,lat)=>{const fi=(lon-60)/1.5,fj=(lat+6)/1.5,i=fi|0,j=fj|0,x=fi-i,y=fj-j,n=j*87+i;return (arr[n]*(1-x)+arr[n+1]*x)*(1-y)+(arr[n+87]*(1-x)+arr[n+88]*x)*y;};
const mins={}; for(const c in C) mins[c]=[];
const t0=Date.now();
for(let d=0;d<days;d++){ let mn={}; for(const c in C) mn[c]=99;
  for(let q=0;q<4;q++){ for(let s=0;s<108;s++) m.step(); const o=m.diagnose(); for(const c in C) mn[c]=Math.min(mn[c],bil(o.t2m,...C[c])); }
  for(const c in C) mins[c].push(mn[c]);
  if(d%15==0){ const o=m.diagnose(); console.log(`${o.date.mon}/${o.date.day} R${m.restores||0} surges ${JSON.stringify((m.surgeInfo||[]).map(g=>[g.phase,g.lat.toFixed(0),g.A.toFixed(0)]))} ${Object.keys(C).map(c=>c+mins[c][d].toFixed(0)).join(' ')}`); }
}
// national standard cold wave: drop of daily min >=8 in 24h, >=10 in 48h or >=12 in 72h, and min <=4 ; also 强降温 (48h drop>=8)
for(const c in C){ const x=mins[c]; const ev=[], dr=[]; let last=-9;
  for(let d=3;d<x.length;d++){ const d24=x[d-1]-x[d], d48=Math.max(x[d-2],x[d-1])-x[d], d72=Math.max(x[d-3],x[d-2],x[d-1])-x[d];
    if(d-last<3) continue;
    if((d24>=8||d48>=10||d72>=12)&&x[d]<=4){ev.push(d);last=d;} else if(d48>=8){dr.push(d);last=d;} }
  const md=d=>{const o=Model.doyToDate(((mon===10?273:0)+d)%365*86400);return o.mon+'/'+o.day};
  console.log(c,'寒潮',ev.length,ev.map(md).join(','),'| 强降温',dr.length,'| min',Math.min(...x).toFixed(1));
}
console.log('restores',m.restores||0,'sec',(Date.now()-t0)/1000);
