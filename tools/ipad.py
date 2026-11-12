# python3 tools/ipad.py URL outprefix wait_s [js]
import asyncio, sys
from playwright.async_api import async_playwright
SIZES=[(1024,768),(1180,820),(820,1180)]
async def main():
    url,pre,wait=sys.argv[1],sys.argv[2],float(sys.argv[3]); js=sys.argv[4] if len(sys.argv)>4 else None
    async with async_playwright() as p:
        b=await p.webkit.launch()
        for (w,h) in SIZES:
            pg=await b.new_page(viewport={'width':w,'height':h},device_scale_factor=2,has_touch=True)
            pg.on('console',lambda m: print('CONSOLE',m.type,m.text) if m.type in('error','warning') else None)
            pg.on('pageerror',lambda e:print('PAGEERROR',e))
            await pg.goto(url); await pg.wait_for_timeout(wait*1000)
            if js: await pg.evaluate(js); await pg.wait_for_timeout(1500)
            out=f"{pre}_{w}x{h}.png"; await pg.screenshot(path=out)
            fps=await pg.evaluate("()=>new Promise(r=>{let n=0;const t0=performance.now();function f(){n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else r(n/2);} requestAnimationFrame(f);})")
            st=await pg.evaluate("()=>window.WeatherSim&&JSON.stringify(WeatherSim.getState())")
            print(out,'fps',fps,(st or '')[:200])
            await pg.close()
        await b.close()
asyncio.run(main())
