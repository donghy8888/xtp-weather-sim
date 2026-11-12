# WebKit long-run test: python3 tools/wk.py URL minutes [jsAfterLoad]
import asyncio, sys, time
from playwright.async_api import async_playwright
async def main():
    url=sys.argv[1]; mins=float(sys.argv[2]); js=sys.argv[3] if len(sys.argv)>3 else None
    async with async_playwright() as p:
        import os
        b=await p.webkit.launch()
        pg=await b.new_page(viewport={'width':1180,'height':820},device_scale_factor=2)
        pg.on('console',lambda m: print('CONSOLE',m.type,m.text,flush=True) if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e:print('PAGEERROR',e,flush=True))
        pg.on('worker',lambda w: w.on('close',lambda _: print('WORKER CLOSED',flush=True)))
        await pg.goto(url)
        await pg.wait_for_function("()=>window.WeatherSim&&WeatherSim.getState()",timeout=120000)
        if js: await pg.evaluate(js)
        t0=time.time(); last=None
        while time.time()-t0<mins*60:
            await pg.wait_for_timeout(20000)
            st=await pg.evaluate("()=>{const s=WeatherSim.getState(); if(!s) return null; let nan=0; for(const v of s.t2m) if(!(v==v)) nan++; return {d:s.date, y:s.simYear, nan, dbg:(window.__dbg||null)}}")
            print(f"{time.time()-t0:5.0f}s", st, flush=True)
        await b.close()
asyncio.run(main())
