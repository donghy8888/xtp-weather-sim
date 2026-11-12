import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    url=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8765/'
    out=sys.argv[2] if len(sys.argv)>2 else '/tmp/shot.png'
    wait=float(sys.argv[3]) if len(sys.argv)>3 else 15
    async with async_playwright() as p:
        b=await p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':1180,'height':820},device_scale_factor=2)
        logs=[]
        pg.on('console',lambda m:logs.append(m.type+': '+m.text))
        pg.on('pageerror',lambda e:logs.append('PAGEERROR '+str(e)))
        await pg.goto(url)
        await pg.wait_for_timeout(wait*1000)
        js=sys.argv[4] if len(sys.argv)>4 else None
        if js:
            r=await pg.evaluate(js); print('eval:',str(r)[:800]); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=out)
        st=await pg.evaluate("()=>{const s=window.WeatherSim&&WeatherSim.getState(); return s?{date:s.date,typhoons:s.typhoons,status:s.status}:null}")
        print('state',st)
        print('\n'.join(logs[-20:]))
        await b.close()
asyncio.run(main())
