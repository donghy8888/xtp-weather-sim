import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const m=new Model(meta,clim,{dt:200}); m.setDate(1,1); m.addNoise(1);
const T={};
for(const f of ['tend','physics','hyperdiff','zonalFilter','climUpdate','updateConv','diagnose']){ const o=m[f].bind(m); T[f]=0; m[f]=function(...a){const t=performance.now(); const r=o(...a); T[f]+=performance.now()-t; return r;}; }
const t0=performance.now(); for(let i=0;i<432;i++) m.step(); console.log('total ms/day',(performance.now()-t0).toFixed(0), JSON.stringify(Object.fromEntries(Object.entries(T).map(([k,v])=>[k,Math.round(v)]))));
