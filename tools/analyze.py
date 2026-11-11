import json,sys,numpy as np
for f in sys.argv[1:]:
    r=json.load(open(f)); print('=====',f,len(r),'days')
    # WPSH summer
    def pent(m0,d0):
        out=[]
        for x in r:
            pass
    rows=[(x['mon'],x['day'],x['wpsh']['ridgeLat'] or np.nan,x['wpsh']['westLon'] or np.nan,x['wpsh']['area']) for x in r]
    s=[x for x in rows if 5<=x[0]<=9]
    line=[]
    for i in range(0,len(s),5):
        ch=s[i:i+5]; line.append(f"{ch[0][0]}/{ch[0][1]}:{np.nanmean([c[2] for c in ch]):.1f}N/{np.nanmean([c[3] for c in ch]):.0f}E")
    print('WPSH pentads (ridge/west):',' '.join(line))
    cities=list(r[0]['c'].keys())
    T={c:np.array([x['c'][c][0] for x in r]) for c in cities}
    lab=[f"{x['mon']}/{x['day']}" for x in r]
    for c in ['北京','武汉','上海','长沙','广州','南宁','哈尔滨']:
        if c not in T: continue
        t=T[c]; ev=[]
        i=2
        while i<len(t):
            drop=max(t[i-2],t[i-1])-t[i]
            if drop>=7 and t[i]<=6 and r[i]['mon'] in (10,11,12,1,2,3,4):
                ev.append(f"{lab[i]}(-{drop:.0f})"); i+=3
            else: i+=1
        mm={}
        for x,v in zip(r,t): mm.setdefault(x['mon'],[]).append(v)
        print(f"{c}: cold drops(48h daily-mean>=7C): {len(ev)} {' '.join(ev[:12])} | monthly mean:",' '.join(f"{m}:{np.mean(mm[m]):.0f}" for m in sorted(mm)))
