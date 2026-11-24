# ket-app 项目约定

## 线上地址

- 主站（GitHub Pages，国内直连）：https://q317881966-star.github.io/ket-word-journey/
- 仓库：`q317881966-star/ket-word-journey`（public，main 分支，根目录，含 `.nojekyll`）
- 备用：https://ket-word-journey.vercel.app （直连不稳定，一般不用）

## 发布流程（每次改完代码都要做）

1. 改了 `index.html` / `app.js` / `style.css` / `words.json` / 音频后，**必须递增 `sw.js` 里的 `VERSION`**（`ket-vN` → `ket-vN+1`），否则 iPad 会继续用缓存旧版
2. 执行 `./deploy.command`：它会自动递增版本、提交、推送
3. 推送后约 1 分钟 GitHub Pages 自动重建

改完代码不要只本地测试就结束，要跑一次 `./deploy.command` 让线上同步。

## 网络

- GitHub / Vercel API 直连不稳定，需要代理时先启动 Clash Party（端口 7890），`deploy.command` 会自动检测
- `github.io` 站点本身可直连，iPad 使用不需要代理

## 数据

- 词库来源：`~/Downloads/ket.xlsx` → `data/build_words.py` → `words.json`
- 音频：`data/generate_audio.py`（edge-tts 英音），输出到 `audio/<id>.mp3`
- 用户进度只存在 iPad 本地 localStorage，不上传服务器
