import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const mon=+process.argv[2]||11, days=+process.argv[3]||100, seed=+process.argv[4]||202;
const m=new Model(meta,clim,{dt:200,seed}); m.setDate(mon,1); m.addNoise(1);
const mx=(a)=>{let v=0,at=0;for(let x=0;x<a.length;x++){const q=Math.abs(a[x]); if(!(q<=v)){v=q;at=x;}} return [v,at];};
const loc=(at)=>{const k=Math.floor(at/m.N),n=at%m.N;return `k${k} ${m.lon[n%m.nx]}E ${m.lat[Math.floor(n/m.nx)]}N`;};
const hist=[];
for(let s=0;s<days*432;s++){ m.step();
  if(s%10===0){ const [uv,ua]=mx(m.u1),[vv,va]=mx(m.v1),[tv,ta]=mx(m.T1),[pv,pa]=mx(m.p1);
  hist.push(`${s} d${(s/432).toFixed(2)} u ${uv.toFixed(1)} ${loc(ua)} | v ${vv.toFixed(1)} ${loc(va)} | T ${tv.toFixed(1)} ${loc(ta)} | p ${(pv*1000).toFixed(0)}hPa ${loc(pa)}`);
  if(hist.length>60) hist.shift(); }
  if(m.restores){ console.log(hist.join('\n')); process.exit(); }
}
console.log('no restore');
