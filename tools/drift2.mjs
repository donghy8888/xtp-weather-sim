import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const days=+process.argv[2]||30, mon=+process.argv[3]||7, seed=+process.argv[4]||202;
const E=process.env; const m=new Model(meta,clim,{dt:200,seed, landRfDays:E.RF?+E.RF:undefined, landRtDays:E.RT?+E.RT:undefined, lhFac:E.LH?+E.LH:undefined, noSharp:!!E.NS, omFac:E.OM?+E.OM:undefined}); m.setDate(mon,1); m.addNoise(1);
const N=m.N,K=m.K; const wu=Math.round((30.6+6)/1.5)*m.nx+Math.round((114.3-60)/1.5);
for(let d=0;d<days;d++){ for(let s=0;s<432;s++) m.step();
  const o=m.diagnose();
  const lt=[]; for(let k=0;k<K;k++){ let sT=0,c=0; for(let n=0;n<N;n++){ const la=m.lat[Math.floor(n/m.nx)], lo=m.lon[n%m.nx]; if(la<20||la>40||lo<100||lo>125) continue; sT+=m.T1[k*N+n]; c++; } lt.push((sT/c).toFixed(1)); }
  console.log(`${o.date.mon}/${o.date.day} EChina T' ${lt.join(' ')} | Wuhan col T' ${[0,1,2,3,4,5].map(k=>m.T1[k*N+wu].toFixed(1)).join(' ')} p' ${(m.p1[wu]*1013).toFixed(1)} prec ${m.prec[wu].toFixed(1)} run ${m.precRun[wu].toFixed(1)} clim ${m.c2d.pr[wu].toFixed(1)} tropQ ${(m.tropQ[wu]*86400).toFixed(2)}`);
}
