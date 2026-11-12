// Precompute one stochastic winter (Oct 1 - Apr 30) with the full model; output 6-hourly frames.
// node tools/gen_winter.mjs index seed
import fs from 'fs'; import zlib from 'zlib';
import { Model } from '../js/model.js';
const D='/workspace/xtp-weather-sim/data/';
const meta=JSON.parse(fs.readFileSync(D+'clim.json'));
const b=fs.readFileSync(D+'clim.bin'); const clim=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
const idx=+process.argv[2], seed=+process.argv[3];
const m=new Model(meta,clim,{dt:200,seed});
const ib=fs.readFileSync(D+'init_10.bin'); const i16=new Int16Array(ib.buffer,ib.byteOffset,ib.byteLength/2); const a=new Float32Array(i16.length);
for(let x=0;x<a.length;x++) a[x]=i16[x]*0.01; for(let n=3*m.K*m.N;n<a.length;n++) a[n]=i16[n]*1e-5;
// spin up from mid-September so October already has its own weather
m.importState(a,0.85); m.addNoise(0.8); m.setDate(9,16);
for(let s=0;s<432*15;s++) m.step();
m.setDate(10,1); m.surges=[];
const I0=7,I1=73,J0=4,J1=48, NX=I1-I0+1, NY=J1-J0+1, NP=NX*NY; // 70.5-169.5E, 0-66N
const DAYS=+(process.env.DAYS||365), PER=4, NF=DAYS*PER+1, SPF=432/PER;
const raw=new Int8Array(NF*3*NP); const fronts=[]; const prev=new Int16Array(3*NP);
const C={北京:[116.4,39.9],上海:[121.5,31.2],武汉:[114.3,30.6],长沙:[113,28.2],广州:[113.3,23.1],南宁:[108.3,22.8],福州:[119.3,26.1],哈尔滨:[126.6,45.8]};
const bil=(arr,lon,lat)=>{const fi=(lon-60)/1.5,fj=(lat+6)/1.5,i=fi|0,j=fj|0,x=fi-i,y=fj-j,n=j*87+i;return (arr[n]*(1-x)+arr[n+1]*x)*(1-y)+(arr[n+87]*(1-x)+arr[n+88]*x)*y;};
const mins={}; for(const c in C) mins[c]=[]; let dm={};
for(let f=0;f<NF;f++){
  if(f>0) for(let s=0;s<SPF;s++) m.step();
  const o=m.diagnose();
  let p=f*3*NP;
  for(let q=0;q<3;q++){ const src=q===0?o.tAnom:q===1?o.u10:o.v10, sc=q===0?4:2.5;
    for(let j=J0;j<=J1;j++) for(let i=I0;i<=I1;i++){ const k=q*NP+(j-J0)*NX+(i-I0);
      let v=Math.round(src[j*87+i]*sc); v=Math.max(-127,Math.min(127,v)); const d=v-prev[k]; prev[k]=v; raw[p+k]=d; } }
  fronts.push((o.surges||[]).filter(g=>g.phase>=0).map(g=>[g.phase,+g.lat.toFixed(2),+g.lonC.toFixed(1),+g.tilt.toFixed(2),g.cls]));
  for(const c in C){ const t=bil(o.t2m,...C[c]); dm[c]=Math.min(dm[c]??99,t); }
  if(f%PER===PER-1){ for(const c in C){ mins[c].push(dm[c]); } dm={}; }
}
// note: deltas wrap within int8 only if |delta|<=127 (true: values are clamped to +-127 and change slowly)
const gz=zlib.gzipSync(Buffer.from(raw.buffer),{level:9});
const tag=process.env.TAG||'y'; fs.writeFileSync(D+`w/${tag}${String(idx).padStart(2,'0')}.bin`, gz);
fs.writeFileSync(D+`w/${tag}${String(idx).padStart(2,'0')}.json`, JSON.stringify({nf:NF,per:PER,nx:NX,ny:NY,lon0:60+I0*1.5,lat0:-6+J0*1.5,res:1.5,scale:[4,2.5,2.5],start:[10,1],fronts}));
const st={};
for(const c in C){ const x=mins[c]; let ev=0,last=-9,mn=99,mxs=-99; for(let d=240;d<Math.min(x.length,330);d++) mxs=Math.max(mxs,x[d]); for(let d=3;d<x.length;d++){ mn=Math.min(mn,x[d]); const d24=x[d-1]-x[d],d48=Math.max(x[d-2],x[d-1])-x[d],d72=Math.max(x[d-3],x[d-2],x[d-1])-x[d]; if(d-last>=3&&(d24>=8||d48>=10||d72>=12)&&x[d]<=4){ev++;last=d;} } st[c]=[ev,+mn.toFixed(1),+mxs.toFixed(1)]; }
let amax=0; for(let k=0;k<raw.length;k+=1){} console.log(JSON.stringify({idx,seed,kb:Math.round(gz.length/1024),restores:m.restores||0,coldAct:+m.yr.coldAct.toFixed(2),st}));
