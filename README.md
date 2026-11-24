# KET 闯关 · 1612 词

iPad 本地单词闯关 App。每天 10 个新词 + 艾宾浩斯/SM-2 智能复习，多邻国式路径地图、打卡、错词本、统计。

## 功能

- **1612 个 KET 单词**，按 10 词一组共 162 关，蛇形闯关地图
- **每天 10 个新词**（数量可调 5–30），到期复习自动组卷
- **SM-2 自适应复习**：按「忘了 / 一般 / 秒答」动态调整下次复习间隔（1 → 2 → 4 → 7 → … 最长 180 天）
- **6 种题型**：学习卡片、英→中、中→英、听音选词、拼写、主动回忆（先回想再翻答案、自评三档）
- **真人级英音音频**（1612 个 mp3，本地离线）
- **错词本 + 考前冲刺**：错词自动收录、答对 2 次移出；冲刺模式混合错词与近期到期词，20 题集中攻克
- **打卡统计**：连胜火焰、XP、掌握度环形图、16 周打卡热力图
- **深色模式**：跟随系统 / 手动切换
- **答题音效与结算彩带**：正确、错误、完成三种音效，可关闭
- 数据只存本机，支持导出/导入备份

## 在 iPad 上使用：两种方式

### 方式 A：局域网（最快，无离线缓存）

1. Mac 和 iPad 连同一个 Wi-Fi
2. **双击 `start.command`**，终端会显示地址和二维码
3. iPad Safari 打开 `http://192.168.x.x:8000`（**不要用 127.0.0.1**），或直接用相机扫码
4. 分享 → 添加到主屏幕

> 为什么手机打不开？按顺序检查：
> 1. 地址必须是 `192.168.x.x` 开头，`localhost` / `127.0.0.1` 只有电脑自己能打开
> 2. iPad 和 Mac 是否连同一个 Wi-Fi（很多路由器有 2.4G/5G 两个名字，连到同一个）
> 3. 手机是否开着 VPN / 代理 / 加速器，先关掉
> 4. 路由器是否开了「访客网络」或「AP 隔离」，关掉
> 5. Mac 的「系统设置 → 网络 → 防火墙」，允许 Python 接收连接（也可临时关闭）
>
> 注意：局域网 http 地址下浏览器**不允许 Service Worker**，所以只能在线用，不能完全离线。设置页的「离线缓存」会显示「未启用（需 HTTPS）」。

### 方式 B：GitHub Pages（推荐，国内直连稳定）

**线上地址：https://q317881966-star.github.io/ket-word-journey/**

1. iPad Safari 打开上面的地址
2. 分享 → 添加到主屏幕
3. 首次加载后即可断网使用，设置页「离线缓存」显示「已启用」

更新线上版本：

```bash
cd ~/Desktop/claude-code/ket-app
git add -A && git commit -m "更新说明"
git push
```

推送后 GitHub Pages 会自动重新构建（约 1 分钟）。注意：改过 `app.js` / `style.css` 后记得先把 `sw.js` 的 `VERSION` 加一。

### 方式 C：Vercel（备用，可能需要代理）

已部署到 https://ket-word-journey.vercel.app ，但当前网络直连不稳定，一般用不上。

## 更新与版本

修改 `app.js` / `style.css` 后，把 `sw.js` 里的 `VERSION` 加一（如 `ket-v3` → `ket-v4`），否则 iPad 可能继续用缓存里的旧代码。

首次打开会缓存全部资源（词库 + 字体 + 已听过的音频）。之后即使 Mac 关机，也能离线使用。

> 提示：Mac 的「系统设置 → 网络」里可以查看 IP；防火墙如拦截，允许 python 传入连接即可。

## 目录结构

```
ket-app/
├── index.html              # 页面结构
├── style.css               # 多邻国风格样式
├── app.js                  # 学习逻辑、SM-2、存储
├── sw.js                   # Service Worker（离线缓存）
├── manifest.webmanifest    # PWA 配置
├── words.json              # 1612 词（构建产物）
├── audio/                  # <id>.mp3 单词音频
├── fonts/nunito-latin.woff2
├── icons/                  # PWA 图标
└── data/
    ├── build_words.py      # ket.xlsx → words.json
    └── generate_audio.py   # 批量生成音频
```

## 重新构建数据

```bash
cd ~/Desktop/claude-code/ket-app

# 1. 从 Excel 重新生成词库（会覆盖 words.json，需同步复制到根目录）
python3 data/build_words.py ~/Downloads/ket.xlsx data/words.json
cp data/words.json words.json

# 2. 生成音频（跳过已存在的，可断点续传）
python3 data/generate_audio.py                    # 全量
python3 data/generate_audio.py --ids 1,2,3        # 指定单词
python3 data/generate_audio.py --voice en-GB-RyanNeural   # 换男声
```

## 数据备份

设置页 →「导出进度备份」会下载一个 JSON 文件。换设备或清了浏览器数据后，用「导入进度备份」恢复。建议每周导一次。

## 已知数据说明

- 90 个词条原表没有音标（多为 `next to`、`police officer` 等短语），App 中不显示音标，发音由音频提供
- `centimet`（第 1163 条）原表拼写不完整，保留原样
- `Mr`（第 706 条）原表音标与释义均为 `#N/A`，显示为「原表缺失」
- 4 个重复单词（miss / it / computer / alright）是原表不同释义，按独立词条学习
