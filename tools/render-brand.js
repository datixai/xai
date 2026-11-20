// Renders the brand SVGs to PNG with Electron. Run: npx electron tools/render-brand.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const B = path.join(__dirname, '..', 'branding');
const jobs = [
  ['xai-icon.svg', 1024, 1024, 'xai-icon-1024.png'], ['xai-icon.svg', 512, 512, 'xai-icon-512.png'], ['xai-icon.svg', 256, 256, 'xai-icon-256.png'],
  ['xai-mark.svg', 512, 512, 'xai-mark-512.png'], ['xai-wordmark.svg', 1200, 360, 'xai-wordmark.png'], ['banner', 1600, 900, 'xai-banner.png'],
];
const banner = () => `<meta charset="utf-8"><body style="margin:0;width:1600px;height:900px;background:radial-gradient(circle at 75% 30%,#3b2a8a 0,#151530 45%,#0b0b16 100%);font-family:Segoe UI;color:#fff;display:flex;align-items:center;padding:0 120px;box-sizing:border-box;overflow:hidden">
<div style="flex:1"><img src="data:image/svg+xml;base64,${fs.readFileSync(path.join(B,'xai-icon.svg')).toString('base64')}" width="150"><div style="font-size:150px;font-weight:800;letter-spacing:20px;background:linear-gradient(135deg,#a5b4fc,#c084fc,#67e8f9);-webkit-background-clip:text;color:transparent;margin-top:20px">XAI</div>
<div style="font-size:44px;opacity:.92">Your private AI, on your own PC.</div><div style="font-size:26px;opacity:.6;margin-top:18px">Local models · No cloud · No limits</div><div style="font-size:18px;opacity:.45;margin-top:60px;letter-spacing:2px">Developed by Datix AI</div></div>
<img src="data:image/svg+xml;base64,${fs.readFileSync(path.join(B,'xai-mark.svg')).toString('base64')}" width="560" style="opacity:.9;filter:drop-shadow(0 0 80px #7c3aed)"></body>`;
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const [src, w, h, out] of jobs) {
    const win = new BrowserWindow({ width: w, height: h, show: false, frame: false, transparent: src !== 'banner', useContentSize: true, webPreferences: { offscreen: true } });
    const html = src === 'banner' ? banner() : `<body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${fs.readFileSync(path.join(B, src)).toString('base64')}" style="width:${w}px;height:${h}px;display:block"></body>`;
    await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
    await new Promise((r) => setTimeout(r, 400));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
    fs.writeFileSync(path.join(B, out), img.resize({ width: w, height: h }).toPNG());
    win.destroy();
    console.log('wrote', out);
  }
  app.quit();
});
