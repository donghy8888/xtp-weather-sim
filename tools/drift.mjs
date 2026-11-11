import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const days=+process.argv[2]||30, mon=+process.argv[3]||4;
const m=new Model(meta,clim,{dt:200}); m.setDate(mon,1); m.addNoise(1);
const N=m.N,K=m.K;
for(let d=0;d<days;d++){ for(let s=0;s<432;s++) m.step();
  const o=m.diagnose();
  const lt=[]; for(let k=0;k<K;k++){ let sT=0,sU=0,c=0; for(let n=0;n<N;n++){ const la=m.lat[Math.floor(n/m.nx)]; if(la<5||la>35) continue; sT+=m.T1[k*N+n]; sU+=m.u1[k*N+n]; c++; } lt.push((sT/c).toFixed(2)+'/'+(sU/c).toFixed(1)); }
  let sp=0,sz=0,c=0; for(let n=0;n<N;n++){ const la=m.lat[Math.floor(n/m.nx)], lo=m.lon[n%m.nx]; if(la<10||la>35||lo<110||lo>170) continue; sp+=m.p1[n]*1013; sz+=o.z500[n]-m.c2d.z500[n]; c++; }
  let mx=0,at=0; for(let x=0;x<m.u1.length;x++){ const w=Math.hypot(m.u1[x],m.v1[x]); if(w>mx){mx=w;at=x;} }
  const k=Math.floor(at/N), n=at%N;
  console.log(`${o.date.mon}/${o.date.day} T'/u'(5-35N) by lev ${lt.join(' ')} | ps' ${(sp/c).toFixed(2)} z500' ${(sz/c).toFixed(1)} | Vmax ${mx.toFixed(1)} k${k} ${m.lon[n%m.nx]}E ${m.lat[Math.floor(n/m.nx)]}N | ridge ${o.wpsh.ridgeLat?.toFixed(1)} area ${o.wpsh.area}`);
  if(!isFinite(mx)) break;
}
