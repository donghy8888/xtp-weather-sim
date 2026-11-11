# Build model-grid climatology + hi-res display climatology
import numpy as np, xarray as xr, tifffile, json, struct, sys
R='/workspace/xtp-weather-sim/raw/'; O='/workspace/xtp-weather-sim/data/'
RES=float(sys.argv[1]) if len(sys.argv)>1 else 1.5
LON0,LAT0=60.0,-6.0
NX=int(round((189.0-LON0)/RES))+1; NY=int(round((69.0-LAT0)/RES))+1
lons=LON0+RES*np.arange(NX); lats=LAT0+RES*np.arange(NY)
LEVS=[200,300,500,700,850,925]
print('grid',NX,NY,lons[-1],lats[-1])
def opn(f): return xr.open_dataset(R+f,decode_times=False)
def regrid(da):  # da dims (..., lat, lon) with lon 0..360
    da=da.sortby('lat')
    lonname='lon'
    # extend periodic
    return da.interp(lat=xr.DataArray(lats,dims='y'),lon=xr.DataArray(lons%360,dims='x'),method='linear')
def pl(var,f):
    d=opn(f)[var]
    out=[]
    for p in LEVS: out.append(regrid(d.sel(level=p)).values)  # (12,NY,NX)
    return np.stack(out,1)  # (12,K,NY,NX)
U=pl('uwnd','uwnd.mon.ltm.1991-2020.nc'); V=pl('vwnd','vwnd.mon.ltm.1991-2020.nc')
T=pl('air','air.mon.ltm.1991-2020.nc')+273.15
Zd=opn('hgt.mon.ltm.1991-2020.nc')['hgt']; Z500=regrid(Zd.sel(level=500)).values
SLP=regrid(opn('slp.mon.ltm.1991-2020.nc')['slp']).values
Q=regrid(opn('shum.mon.ltm.1991-2020.nc')['shum'].sel(level=850)).values
W=regrid(opn('omega.mon.ltm.1991-2020.nc')['omega'].sel(level=500)).values
T2=regrid(opn('air.2m.mon.ltm.1991-2020.nc')['air']).values
T2=T2-273.15 if np.nanmean(T2)>100 else T2
PR=regrid(opn('prate.sfc.mon.ltm.1991-2020.nc')['prate']).values*86400
U10=regrid(opn('uwnd.10m.mon.ltm.1991-2020.nc')['uwnd']).values
V10=regrid(opn('vwnd.10m.mon.ltm.1991-2020.nc')['vwnd']).values
sd=opn('sst.ltm.1991-2020.nc')['sst']; msk=opn('lsmask.nc')['mask'].isel(time=0) if 'time' in opn('lsmask.nc')['mask'].dims else opn('lsmask.nc')['mask']
sd=sd.where(msk.values[None]>0.5)
SST=regrid(sd).values
# topography on model grid
ea=xr.open_dataset(R+'etopo_a.nc')['altitude']; eb=xr.open_dataset(R+'etopo_b.nc')['altitude']
eb=eb.assign_coords(longitude=eb.longitude+360)
E=xr.concat([ea,eb.isel(longitude=slice(1,None))],'longitude')
Ev=E.values; elat=E.latitude.values; elon=E.longitude.values
H=np.zeros((NY,NX)); LF=np.zeros((NY,NX))
for j,la in enumerate(lats):
  ji=np.where(np.abs(elat-la)<=RES/2)[0]
  for i,lo in enumerate(lons):
    ii=np.where(np.abs(elon-lo)<=RES/2)[0]
    if len(ji)==0 or len(ii)==0: continue
    b=Ev[ji[0]:ji[-1]+1, ii[0]:ii[-1]+1]
    LF[j,i]=(b>0).mean(); H[j,i]=np.maximum(b,0).mean()
# SST fill over land with T2m (for continuity) and extrapolate
for m in range(12):
    s=SST[m]; bad=~np.isfinite(s); s[bad]=T2[m][bad]; SST[m]=s
for a in (U,V,T,Z500,SLP,Q,W,T2,PR,U10,V10):
    assert np.isfinite(a).all(), 'nan'
meta=dict(res=RES,lon0=LON0,lat0=LAT0,nx=NX,ny=NY,levs=LEVS,
  fields=['u','v','T','slp','z500','t2m','pr','sst','q850','w500','u10','v10'])
arrs=[]
for m in range(12):
    arrs += [U[m],V[m],T[m],SLP[m][None],Z500[m][None],T2[m][None],PR[m][None],SST[m][None],Q[m][None]*1000 if Q.max()<1 else Q[m][None],W[m][None],U10[m][None],V10[m][None]]
buf=np.concatenate([a.reshape(-1) for a in arrs]).astype(np.float32)
static=np.concatenate([H.reshape(-1),LF.reshape(-1)]).astype(np.float32)
open(O+'clim.bin','wb').write(buf.tobytes()+static.tobytes())
meta['perMonth']=int(buf.size//12); meta['staticSize']=int(static.size)
json.dump(meta,open(O+'clim.json','w'))
print('clim bytes',buf.nbytes+static.nbytes, 'q850 max',Q.max())
# ---- hi-res display climatology (1/3 deg) ----
HR=1/3.; HNX=int(round(130/HR))+1; HNY=int(round(76/HR))+1
hl=60+HR*np.arange(HNX); hb=-6+HR*np.arange(HNY)
def wc(name,m):
    a=tifffile.imread(R+f'wc/wc2.1_10m_{name}_{m:02d}.tif').astype(np.float64)
    a[a<-1e30]=np.nan
    # wc grid: lat 90..-90 rows, lon -180..180 cols at 1/6
    la=90-(np.arange(1080)+0.5)/6; lo=-180+(np.arange(2160)+0.5)/6
    da=xr.DataArray(a,coords=dict(lat=la,lon=lo),dims=('lat','lon')).sortby('lat')
    # handle >180: shift
    lon2=np.where(hl>180,hl-360,hl)
    return da.interp(lat=xr.DataArray(hb,dims='y'),lon=xr.DataArray(lon2,dims='x')).values
def coarse_to_hr(F):  # model grid -> hr bilinear
    da=xr.DataArray(F,coords=dict(lat=lats,lon=lons),dims=('lat','lon'))
    return da.interp(lat=xr.DataArray(hb,dims='y'),lon=xr.DataArray(hl,dims='x'),kwargs=dict(fill_value='extrapolate')).values
days=[31,28,31,30,31,30,31,31,30,31,30,31]
TH=np.zeros((12,HNY,HNX),np.uint8); PH=np.zeros((12,HNY,HNX),np.uint8)
for m in range(12):
    t=wc('tavg',m+1); p=wc('prec',m+1)/days[m]
    tc=coarse_to_hr(np.where(LF>0.5,T2[m],SST[m]*0.6+T2[m]*0.4)); pc=coarse_to_hr(PR[m])
    t=np.where(np.isfinite(t),t,tc); p=np.where(np.isfinite(p),p,pc)
    TH[m]=np.clip(np.round((t+50)*2),0,255)      # 0.5K steps from -50C
    PH[m]=np.clip(np.round(np.sqrt(np.maximum(p,0))*40),0,255)  # sqrt scale
open(O+'hires.bin','wb').write(TH.tobytes()+PH.tobytes())
json.dump(dict(res=HR,lon0=60,lat0=-6,nx=HNX,ny=HNY,tEnc='(v/2)-50',pEnc='(v/40)^2 mm/day'),open(O+'hires.json','w'))
print('hires',HNX,HNY)
