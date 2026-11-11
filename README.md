# 西太平洋天气模拟器（xtp-weather-sim）

在浏览器里跑的大气模式，**模拟**（不是播放观测数据）西北太平洋—东亚的天气，全年四季连续推演。iPad Safari 直接打开即可。

在线地址：https://donghy8888.github.io/xtp-weather-sim/

## 能看到什么
- **自绘详细地图**：Natural Earth 10m 海岸线/湖泊/河流、国界（中国官方立场版）、中国省界、600+ 城市中文名，ETOPO1 真实地形晕渲。不使用任何在线地图服务，双指缩放/拖动。
- **寒潮**：西伯利亚—蒙古高压堆积，冷锋南下，城市 48 小时降温、气压猛升、偏北大风；按中国气象局标准（48h 最低气温降幅 ≥8°C 且最低气温 ≤4°C）自动报警。
- **西太平洋副热带高压**：500hPa 高度场与 588 线实时绘制，脊线、西伸脊点、北界、面积指数实时计算；6 月中旬北跳、7 月下旬到最北，逐年不同。
- 图层：气温 / 气温距平 / 降水（雨、雪）/ 海温填色，海平面气压等压线与高低压中心，500hPa 高度，10 米风 / 500hPa 风 / 引导气流粒子动画。
- 时间：暂停、1 小时/秒 到最快、跳到任意日期。点城市或任意地点看最近 30 天模拟气温、降水、气压曲线。
- **每年都不一样**：随机初始扰动、随机上游波包（乌拉尔阻塞等）、随机对流、ENSO 型海温年际异常、夏季季节内振荡（BSISO）均为内部随机，不可预知。

## 模式（js/model.js）
- 静力原始方程，σ 坐标 6 层（925/850/700/500/300/200 hPa 附近），经纬网格 1.5°（60–189°E，6°S–69°N），蛙跳积分 + Robert-Asselin 滤波，Δt = 200 s，在 Web Worker 中运行（iPad 上约 1 模式日/秒）。
- 积分的是相对于 NCEP/NCAR 再分析 1991–2020 月气候态（逐日插值）的偏差，强迫项取 −N(气候态)（Hall 2000 式残差强迫），因此平均气候真实，而天气由模式自身的斜压/正压动力学产生。
- 数值稳定：∇⁴ 超扩散、38°N 以北纬向滤波、侧边界海绵层、热带/印度洋区额外阻尼（抑制跨赤道东风急流的惯性不稳定）、极端偏差的安全阻尼与限幅、每日检查点（异常时自动回退）。
- 物理过程：冬季西伯利亚—蒙古近地层随机冷空气脉冲（寒潮源），边界层摩擦、辐射/海气热交换弛豫、地形阻挡、干对流调整、大尺度凝结降水与潜热反馈、随机对流、随机涡度强迫、ENSO 海温异常、BSISO 加热、大尺度谱逼近（防止气候漂移）、侧边界海绵层。
- 资料：NCEP/NCAR Reanalysis 1 月平均长期平均（NOAA PSL）、NOAA OISST v2、WorldClim 2.1（10′ 气温/降水，用于地面细节）、ETOPO1、Natural Earth。

## 已知局限（第一版）
- 网格 1.5°、6 层，属“粗分辨率真实动力”；城市气温由 1/3° WorldClim 气候态 + 模式偏差插值得到，日变化为显示用。
- 采用“气候态 + 偏差”积分并带大尺度谱逼近，所以平均气候真实，但极端程度受约束：不少年份寒潮到长江以南偏弱，个别年份才明显影响华南。
- 暖季为防止格点尺度湿对流反馈失控，潜热反馈被削弱，夏季降水的空间细节偏粗。
- 没有台风（按计划留给台风模拟器对接）。
- 计算在 CPU（Web Worker）上，最快约 1 模式日/秒。

## 与台风模拟器对接的接口
页面加载后提供 `window.WeatherSim`：
```js
WeatherSim.getState()      // {date, simYear, grid, subtropicalHigh:{ridgeLat, westLon, northLat, area, intensity, line5880}, steeringFlow:{u,v}, wind10m, wind500, z500, slp, sst, t2m, precip, ensoIndex}
WeatherSim.sample(lon, lat) // 任一点的引导气流、500hPa风、10米风、z500、气压、海温、气温、降水
WeatherSim.onUpdate(cb)     // 每帧回调 cb(state)
WeatherSim.grid()           // {lon0, lat0, res, nx, ny}，数组按行存放，第0行为最南
WeatherSim.play() / pause() / setSpeed(模式秒每真实秒) / setDate(月, 日, 时)
```
跨页面（iframe / window.open）：`postMessage({type:'xtp-weather:getState', id})` 或 `{type:'xtp-weather:sample', lon, lat, id}`，回复类型为原类型加 `:result`。

## 本地运行
任意静态服务器：`python3 -m http.server`，打开 http://localhost:8000/ 。
`tools/` 里是资料预处理（Python）和模式离线检验（Node）脚本。
