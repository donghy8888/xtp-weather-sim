import fs from 'fs';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const dt=+(process.env.DT||200);
const m=new Model(meta,clim,{dt}); m.setDate(1,1); m.addNoise(1);
for(let i=0;i<100;i++) m.step();
const t0=performance.now(); const n=Math.round(86400*2/dt); for(let i=0;i<n;i++) m.step(); console.log('s/day',((performance.now()-t0)/2000).toFixed(3));
