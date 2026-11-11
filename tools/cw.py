import json,sys,numpy as np
for f in sys.argv[1:]:
  r=json.load(open(f)); print('==',f,len(r))
  for c in ['北京','武汉','上海','长沙','广州','哈尔滨','乌兰巴托','首尔']:
    t=np.array([x['c'][c][0] for x in r]); p=np.array([x['c'][c][1] for x in r]); v=np.array([x['c'][c][3] for x in r])
    d48=np.array([max(t[i-2],t[i-1])-t[i] for i in range(2,len(t))])
    ev=[f"{r[i+2]['mon']}/{r[i+2]['day']}:-{d48[i]:.0f}" for i in range(len(d48)) if d48[i]>=6 and (i==0 or d48[i-1]<6)]
    dstd=np.diff(t).std()
    print(f"{c} dTstd {dstd:.1f} max48 {d48.max():.1f} SLPstd {p.std():.1f} maxV {v.max():.1f} events>=6: {' '.join(ev[:10])}")
