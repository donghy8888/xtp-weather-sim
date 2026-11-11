import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const mon=+process.argv[2]||4, days=+process.argv[3]||60, seed=+process.argv[4]||5;
const m=new Model(meta,clim,{dt:+(process.env.DT||200),seed}); m.setDate(mon,1); m.addNoise(1);
const mx=(a)=>{let v=0,at=0;for(let x=0;x<a.length;x++){const q=Math.abs(a[x]); if(!(q<=v)){v=q;at=x;}} return [v,at];};
const loc=(at)=>{const k=Math.floor(at/m.N),n=at%m.N;return `k${k} ${m.lon[n%m.nx]}E ${m.lat[Math.floor(n/m.nx)]}N`;};
const hist=[];
for(let s=0;s<days*Math.round(86400/m.dt);s++){ m.step();
  const [uv,ua]=mx(m.u1),[vv,va]=mx(m.v1),[tv,ta]=mx(m.T1),[pv,pa]=mx(m.prec);
  hist.push(`${s} d${(s/432).toFixed(2)} u ${uv.toFixed(1)} ${loc(ua)} | v ${vv.toFixed(1)} ${loc(va)} | T ${tv.toFixed(1)} ${loc(ta)} | P ${pv.toFixed(0)} ${loc(pa)}`);
  if(hist.length>150) hist.shift();
  if(!(uv<500)){ console.log(hist.filter((_,i)=>i%5===0||i>130).join('\n'));
    const n=ua%m.N; console.log('H',m.H[n],'LF',m.LF[n],'blk',[0,1,2,3,4,5].map(k=>m.blk[k*m.N+n].toExponential(1)).join(','));
    console.log('clim u col',[0,1,2,3,4,5].map(k=>m.uc[k*m.N+n].toFixed(1)).join(','),'T col',[0,1,2,3,4,5].map(k=>m.Tc[k*m.N+n].toFixed(1)).join(','));
    process.exit(); }
}
console.log('no nan');
