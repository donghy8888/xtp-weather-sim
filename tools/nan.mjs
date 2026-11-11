import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const mon=+process.argv[2]||4, days=+process.argv[3]||60, seed=+process.argv[4]||5;
const m=new Model(meta,clim,{dt:200,seed}); m.setDate(mon,1); m.addNoise(1);
const chk=(a)=>{for(let x=0;x<a.length;x++) if(!isFinite(a[x])) return x; return -1;};
for(let s=0;s<days*432;s++){ m.step();
  for(const k of ['u1','T1','p1','fT','fu','prec','tropQ','bfu','bfT','sstA','conv','Ncu','NcT','Ncp','uc','Tc','pc']){ const i=chk(m[k]); if(i>=0){ const n=i%m.N; console.log('NaN in',k,'step',s,'day',(s/432).toFixed(2),'k',Math.floor(i/m.N),'lon',m.lon[n%m.nx],'lat',m.lat[Math.floor(n/m.nx)], 't',m.t/86400); console.log(m.blobs.map(b=>JSON.stringify([b.lon,b.lat,b.amp,b.r,b.age,b.life])).join('\n')); process.exit(); } }
}
console.log('no nan');
