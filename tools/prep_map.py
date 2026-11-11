import json, numpy as np, xarray as xr
from shapely.geometry import shape, box, mapping, LineString, MultiLineString, Polygon, MultiPolygon, Point
from shapely.ops import unary_union
from shapely import affinity
from PIL import Image
R='raw/'; O='data/'
BB=box(60,-6,190,70)
B1=box(60,-6,180,70); B2=box(-180,-6,-170,70)
def shift(g):
    # clip to domain; western-hemisphere part (-180..-170) moved to 180..190
    if g.geom_type in ('Polygon','MultiPolygon') and not g.is_valid: g=g.buffer(0)
    a=g.intersection(B1) if g.intersects(B1) else None
    b=affinity.translate(g.intersection(B2),360,0) if g.intersects(B2) else None
    parts=[x for x in (a,b) if x is not None and not x.is_empty]
    if not parts: return Polygon()
    return unary_union(parts) if len(parts)>1 else parts[0]
def load(f): return json.load(open(R+f))['features']
def lines_of(g):
    if g.is_empty: return []
    t=g.geom_type
    if t=='LineString': return [g]
    if t=='MultiLineString' or t=='GeometryCollection': 
        out=[]; [out.extend(lines_of(x)) for x in g.geoms]; return out
    if t=='Polygon': return [LineString(g.exterior.coords)]+[LineString(i.coords) for i in g.interiors]
    if t=='MultiPolygon': out=[]; [out.extend(lines_of(p)) for p in g.geoms]; return out
    return []
def enc(lines,tol,dec=3,minlen=0):
    out=[]
    for l in lines:
        l=l.simplify(tol)
        if l.length<minlen: continue
        c=np.round(np.asarray(l.coords)[:,:2],dec)
        if len(c)<2: continue
        out.append([float(v) for v in c.reshape(-1)])
    return out
res={}
def feats_lines(f, filt=None):
    L=[]
    for ft in load(f):
        if filt and not filt(ft['properties']): continue
        g=shape(ft['geometry'])
        g=shift(g)
        if not g.intersects(BB): continue
        L+=lines_of(g.intersection(BB))
    return L
res['coast0']=enc(feats_lines('ne_50m_coastline.geojson'),0.02,2,0.05)
res['coast1']=enc(feats_lines('ne_10m_coastline.geojson'),0.004,3)
res['lakes0']=enc(feats_lines('ne_50m_lakes.geojson'),0.02,2,0.3)
res['lakes1']=enc(feats_lines('ne_10m_lakes.geojson',lambda p:p.get('scalerank',9)<=6),0.004,3,0.05)
res['rivers']=enc(feats_lines('ne_10m_rivers_lake_centerlines.geojson',lambda p:p.get('scalerank',9)<=6),0.006,3)
res['prov']=enc(feats_lines('ne_10m_admin_1_states_provinces_lines.geojson',lambda p:p.get('ADM0_A3')=='CHN' or p.get('adm0_a3')=='CHN'),0.005,3)
# country borders (China's official point of view)
cs=[]
for ft in load('ne_10m_admin_0_countries_chn.geojson'):
    g=shift(shape(ft['geometry']).buffer(0))
    if g.is_empty: continue
    cs.append((ft['properties'],g))
land=unary_union([g for _,g in cs])
coast=land.boundary.buffer(0.02)
allb=unary_union([g.boundary for _,g in cs])
borders=allb.difference(coast).intersection(BB)
res['border']=enc(lines_of(borders),0.005,3,0.02)
# labels: countries, provinces, seas
lab=[]
cn_names={'CHN':'中国','MNG':'蒙古','RUS':'俄罗斯','JPN':'日本','KOR':'韩国','PRK':'朝鲜','VNM':'越南','LAO':'老挝','THA':'泰国','MMR':'缅甸','PHL':'菲律宾','IND':'印度','KAZ':'哈萨克斯坦','MYS':'马来西亚','IDN':'印度尼西亚','KHM':'柬埔寨','NPL':'尼泊尔','BTN':'不丹','BGD':'孟加拉国','PAK':'巴基斯坦','AFG':'阿富汗','KGZ':'吉尔吉斯斯坦','TJK':'塔吉克斯坦','UZB':'乌兹别克斯坦','TKM':'土库曼斯坦','PNG':'巴布亚新几内亚','BRN':'文莱','LKA':'斯里兰卡'}
pos={'CHN':(103,35),'RUS':(110,62),'MNG':(103,46.5),'JPN':(138.5,37.2),'IDN':(115,-2),'MYS':(102,4),'IND':(79,22),'PHL':(122.5,12)}
for p,g in cs:
    a3=p.get('ADM0_A3'); 
    if a3 in cn_names:
        pt=pos.get(a3); 
        if not pt:
            gi=g.intersection(BB)
            if gi.is_empty: continue
            rp=gi.representative_point(); pt=(rp.x,rp.y)
        lab.append(dict(t='c',n=cn_names[a3],x=round(pt[0],2),y=round(pt[1],2),a=round(g.area,1)))
for ft in load('ne_10m_admin_1_states_provinces.geojson'):
    p=ft['properties']
    if p.get('adm0_a3')!='CHN': continue
    g=shape(ft['geometry']); rp=g.representative_point()
    nm=p.get('name_zh') or p.get('name')
    nm=nm.replace('维吾尔自治区','').replace('壮族自治区','').replace('回族自治区','').replace('自治区','').replace('特别行政区','').replace('省','').replace('市','')
    lab.append(dict(t='p',n=nm,x=round(rp.x,2),y=round(rp.y,2)))
lab.append(dict(t='p',n='台湾',x=121.0,y=23.7))
seas=[('太平洋',165,25),('南海',114,14),('东海',125.5,29),('黄海',123.5,35.5),('日本海',135,40.5),('菲律宾海',132,18),('鄂霍次克海',148,53),('孟加拉湾',89,15),('白令海',178,58),('渤海',120,38.8),('爪哇海',111,-5),('苏禄海',120,8.5),('西伯利亚',95,62),('青藏高原',88,33),('蒙古高原',108,44),('印度洋',75,5)]
for n,x,y in seas: lab.append(dict(t='s',n=n,x=x,y=y))
res['labels']=lab
# cities
cities=[]
for ft in load('ne_10m_populated_places.geojson'):
    p=ft['properties']; lo,la=ft['geometry']['coordinates']
    if lo<-90: lo+=360
    if not(60<=lo<=190 and -6<=la<=70): continue
    zh=p.get('NAME_ZH'); sr=p.get('SCALERANK',10)
    if not zh: continue
    a3=p.get('ADM0_A3')
    if a3 in('CHN','TWN','HKG','MAC'): keep= sr<=7
    else: keep= sr<=4
    if not keep: continue
    zh=zh.replace('市','') if len(zh)>2 else zh
    cities.append(dict(n=zh,x=round(lo,3),y=round(la,3),r=sr,cap=int(p.get('ADM0CAP',0) or 0),cn=int(a3 in('CHN','TWN','HKG','MAC')),pop=int(p.get('POP_MAX',0))))
cities.sort(key=lambda c:(c['r'],-c['pop']))
res['cities']=cities
s=json.dumps(res,ensure_ascii=False,separators=(',',':'))
open(O+'geo.json','w').write(s)
print('geo.json',len(s)/1e6,'MB', {k:(len(v) if isinstance(v,list) else 0) for k,v in res.items()}, 'cities',len(cities))
# ---------- relief image ----------
ea=xr.open_dataset(R+'etopo_a.nc')['altitude']; eb=xr.open_dataset(R+'etopo_b.nc')['altitude']
eb=eb.assign_coords(longitude=eb.longitude+360)
E=xr.concat([ea,eb.isel(longitude=slice(1,None))],'longitude').values.astype(np.float32)[::-1]  # north up
h=E; ny,nx=h.shape
# hillshade
dy=0.05*111e3; dx=dy*np.cos(np.deg2rad(np.linspace(70,-6,ny)))[:,None]
gy,gx=np.gradient(np.where(h>0,h,h*0.15))
gx=gx/dx; gy=-gy/dy
az,alt=np.deg2rad(315),np.deg2rad(40)
slope=np.arctan(np.hypot(gx,gy)*3.0); aspect=np.arctan2(-gx,gy)
hs=np.sin(alt)*np.cos(slope)+np.cos(alt)*np.sin(slope)*np.cos(az-aspect)
hs=np.clip(hs,0,1)
def ramp(v,stops):
    xs=[s[0] for s in stops]; out=np.zeros(v.shape+(3,),np.float32)
    for c in range(3): out[...,c]=np.interp(v,xs,[s[1][c] for s in stops])
    return out
landc=ramp(h,[(0,(118,158,96)),(200,(150,178,110)),(600,(196,196,138)),(1200,(204,176,120)),(2000,(178,140,104)),(3000,(150,118,96)),(4200,(172,160,152)),(5200,(226,224,226)),(7000,(255,255,255))])
seac=ramp(h,[(-9000,(14,40,86)),(-6000,(22,58,112)),(-4000,(30,76,138)),(-2000,(42,98,160)),(-200,(66,128,186)),(-50,(92,156,204)),(0,(120,176,214))])
isl=(h>0)
# use Natural Earth land mask to avoid etopo lakes/depressions (e.g., Caspian) confusion: rasterize simple check via h>0 is fine
col=np.where(isl[...,None],landc,seac)
shade=np.where(isl[...,None],(0.55+0.65*hs)[...,None],(0.85+0.25*hs)[...,None])
img=np.clip(col*shade,0,255).astype(np.uint8)
Image.fromarray(img).save(O+'relief.jpg',quality=84,optimize=True,progressive=True)
Image.fromarray(img).resize((nx//2,ny//2),Image.LANCZOS).save(O+'relief_s.jpg',quality=82,optimize=True)
print('relief',nx,ny)
