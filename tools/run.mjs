import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const days=+process.argv[2]||5, mon=+process.argv[3]||1, dt=+process.argv[4]||200;
const m=new Model(meta,clim,{dt});
m.setDate(mon,1); m.addNoise(1);
const city={bj:[116.4,39.9],gz:[113.3,23.1],sh:[121.5,31.2],hrb:[126.6,45.8],hk:[114.2,22.3]};
const idx=(lo,la)=>Math.round((la-meta.lat0)/meta.res)*meta.nx+Math.round((lo-meta.lon0)/meta.res);
const t0=Date.now(); const spd=Math.round(86400/dt);
const log=[];
for(let d=0; d<days*4; d++){
  for(let s=0;s<spd/4;s++) m.step();
  const o=m.diagnose();
  let mx=0; for(let x=0;x<m.u1.length;x++) mx=Math.max(mx,Math.abs(m.u1[x]));
  let tmin=0,tmax=0; for(let x=0;x<m.T1.length;x++){tmin=Math.min(tmin,m.T1[x]);tmax=Math.max(tmax,m.T1[x]);}
  if(!isFinite(mx)){console.log('BLOWUP',d/4);break;}
  if(d%4===0||d===days*4-1){
    const c=Object.entries(city).map(([k,[lo,la]])=>`${k} T${o.t2m[idx(lo,la)].toFixed(1)} P${o.slp[idx(lo,la)].toFixed(0)} R${o.precip[idx(lo,la)].toFixed(1)}`).join(' | ');
    const w=o.wpsh;
    console.log(`${o.date.mon}/${o.date.day} |u'|max ${mx.toFixed(1)} T' ${tmin.toFixed(1)}..${tmax.toFixed(1)} WPSH ridge ${w.ridgeLat?.toFixed(1)} west ${w.westLon} area ${w.area} | ${c}`);
  }
}
console.log('sec/day',(Date.now()-t0)/1000/days);
if(process.argv[5]) fs.writeFileSync(process.argv[5],Buffer.from(m.exportState().buffer));
