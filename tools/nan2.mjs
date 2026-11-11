import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const seed=+process.argv[2], s0=+process.argv[3], s1=+process.argv[4];
const m=new Model(meta,clim,{dt:200,seed}); m.setDate(4,1); m.addNoise(1);
globalThis.M=m;
const mx=(a)=>{let v=0,at=0;for(let x=0;x<a.length;x++){const q=Math.abs(a[x]); if(!(q<=v)){v=q;at=x;}} return [v,at];};
const loc=(at)=>{const k=Math.floor(at/m.N),n=at%m.N;return `k${k} ${m.lon[n%m.nx]}E ${m.lat[Math.floor(n/m.nx)]}N`;};
for(let s=0;s<s1;s++){ m.step(); if(s>=s0){ const [tv,ta]=mx(m.T1),[uv,ua]=mx(m.u1),[pv,pa]=mx(m.prec),[fv,fa]=mx(m.fT),[nv,na]=mx(m.tT); console.log(s,'T',tv.toFixed(2),loc(ta),'| u',uv.toFixed(1),loc(ua),'| P',pv.toFixed(0),loc(pa),'| fT*1e5',(fv*1e5).toFixed(2),loc(fa)); if(!isFinite(tv)) break; } }
// dump column at worst point
const [uv,ua]=mx(m.u1); 
