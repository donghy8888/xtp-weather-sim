import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const dt=+process.argv[2]||200, days=+process.argv[3]||40, mon=+process.argv[4]||1;
const m=new Model(meta,clim,{dt, seed: +process.argv[5]||123, lhFac: +(process.env.LH??0.55), forceAmp: +(process.env.FA??0.5)});
m.setDate(mon,1); m.addNoise(1);
const spd=Math.round(86400/dt);
for(let s=0;s<days*spd;s++){ m.step();
 if(s%(spd/4|0)===0){ let mx=0,at=0; for(let x=0;x<m.u1.length;x++){ const w=Math.hypot(m.u1[x],m.v1[x]); if(w>mx){mx=w;at=x;} }
  const k=Math.floor(at/m.N), n=at%m.N, j=Math.floor(n/m.nx), i=n%m.nx;
  let pm=0; for(let x=0;x<m.N;x++) pm=Math.max(pm,m.prec[x]);
  if(s%spd===0||mx>60) console.log((s/spd).toFixed(2),'Vmax',mx.toFixed(1),'k',k,'lon',m.lon[i],'lat',m.lat[j],'Pmax',pm.toFixed(0));
  if(!isFinite(mx)||mx>90) break;}
}
