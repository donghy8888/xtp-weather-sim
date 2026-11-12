import asyncio, sys, time
from playwright.async_api import async_playwright
async def main():
    url=sys.argv[1]; mins=float(sys.argv[2])
    async with async_playwright() as p:
        b=await p.webkit.launch()
        pg=await b.new_page(viewport={'width':1180,'height':820},device_scale_factor=2)
        pg.on('console',lambda m: print('CONSOLE',m.type,m.text,flush=True) if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e:print('PAGEERROR',e,flush=True))
        t0=time.time(); await pg.goto(url)
        await pg.wait_for_function("()=>window.WeatherSim&&WeatherSim.getState()",timeout=60000)
        print('loaded in',round(time.time()-t0,1),'s',flush=True)
        await pg.evaluate("WeatherSim.setSpeed(10)")
        while time.time()-t0<mins*60:
            await pg.wait_for_timeout(15000)
            st=await pg.evaluate("()=>{const s=WeatherSim.getState(); return [s.winter, s.date.mon+'/'+s.date.day, Math.round(s.frame), s.status.slice(0,30), (performance.memory||{}).usedJSHeapSize||0]}")
            print(f"{time.time()-t0:5.0f}s", st, flush=True)
        await b.close()
asyncio.run(main())
