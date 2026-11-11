import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const dt=+process.argv[2]||200, nolh=process.argv[3]==='1';
const m=new Model(meta,clim,{dt});
m.setDate(1,1); m.addNoise(1);
if(nolh){ const ph=m.physics.bind(m); m.physics=function(t){ph(t); }; }
for(let s=0;s<1000;s++){ m.step();
 if(s%20===0){ let mx=0,at=0; for(let x=0;x<m.T1.length;x++){ if(Math.abs(m.T1[x])>mx){mx=Math.abs(m.T1[x]);at=x;} }
  const k=Math.floor(at/m.N), n=at%m.N, j=Math.floor(n/m.nx), i=n%m.nx;
  let um=0; for(let x=0;x<m.u1.length;x++) um=Math.max(um,Math.abs(m.u1[x]));
  let pm=0; for(let x=0;x<m.N;x++) pm=Math.max(pm,Math.abs(m.p1[x]));
  console.log(s, (s*dt/3600).toFixed(1)+'h','Tmax',mx.toFixed(2),'k',k,'lon',m.lon[i],'lat',m.lat[j],'umax',um.toFixed(1),'pimax',pm.toFixed(4), 'H',m.H[n].toFixed(0));
  if(!isFinite(mx)||mx>50) break;}
}
