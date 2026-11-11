import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const days=+process.argv[2]||30, mon=+process.argv[3]||7, seed=+process.argv[4]||202, from=+process.argv[5]||18;
const m=new Model(meta,clim,{dt:200,seed}); m.setDate(mon,1); m.addNoise(1);
const N=m.N,K=m.K,nx=m.nx;
for(let d=0;d<days;d++){ const per=1; for(let q=0;q<per;q++){ for(let s=0;s<432/per;s++) m.step();
  
  const o=m.diagnose(); let out=`${o.date.mon}/${o.date.day} ${o.date.hour??''}h`;
  for(const k of [1,3,4,5]){ let mx=0,mi=0; for(let n=0;n<N;n++){ const j=Math.floor(n/nx),i=n%nx; if(j<7||j>=m.ny-7||i<7||i>=nx-7) continue; const v=Math.abs(m.T1[k*N+n]); if(v>mx){mx=v;mi=n;} }
    out+=` | k${k} ${m.T1[k*N+mi].toFixed(1)}@${m.lon[mi%nx]},${m.lat[Math.floor(mi/nx)]} H${Math.round(m.H[mi])}`; }
  let mx=0,mi=0; for(let n=0;n<N;n++){ const v=Math.abs(m.p1[n]); if(v>mx){mx=v;mi=n;} } out+=` | p ${(m.p1[mi]*1013).toFixed(1)}@${m.lon[mi%nx]},${m.lat[Math.floor(mi/nx)]}`;
  let um=0,ui=0; for(let x=0;x<K*N;x++){ const v=Math.hypot(m.u1[x],m.v1[x]); if(v>um){um=v;ui=x;} } const n=ui%N; out+=` | V' ${um.toFixed(0)} k${Math.floor(ui/N)}@${m.lon[n%nx]},${m.lat[Math.floor(n/nx)]}`;
  console.log(out);
}}
