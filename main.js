// XAI desktop: main process. Talks to the local Ollama server, stores chats on disk.
const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, Menu, nativeTheme, Tray, desktopCapturer, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA = path.join(app.getPath('userData'), 'data');
const CONV_DIR = path.join(DATA, 'conversations');
const SETTINGS_F = path.join(DATA, 'settings.json');
const PROJECTS_F = path.join(DATA, 'projects.json');
fs.mkdirSync(CONV_DIR, { recursive: true });

// ---------- error log (rotates at 2 MB) ----------
const LOG_F = path.join(app.getPath('userData'), 'logs', 'xai.log');
fs.mkdirSync(path.dirname(LOG_F), { recursive: true });
function log(level, ...parts) {
  try {
    if (fs.existsSync(LOG_F) && fs.statSync(LOG_F).size > 2e6) fs.renameSync(LOG_F, LOG_F + '.old');
    const text = parts.map((x) => (x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    fs.appendFileSync(LOG_F, `${new Date().toISOString()} [${level}] ${text.slice(0, 4000)}\n`);
  } catch {}
}
process.on('uncaughtException', (e) => log('crash', e));
process.on('unhandledRejection', (e) => log('error', 'unhandled', e));
app.on('render-process-gone', (_e, _w, d) => log('crash', 'window process ended', d));
app.on('child-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') log('crash', 'helper process ended', d); });
ipcMain.handle('log:write', (_e, level, msg) => log(level, String(msg)));
ipcMain.handle('log:open', () => { if (!fs.existsSync(LOG_F)) fs.writeFileSync(LOG_F, ''); return shell.openPath(LOG_F); });
app.whenReady().then(() => log('info', `XAI ${app.getVersion()} started (${process.platform}, Electron ${process.versions.electron})`));

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, v) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); };
const uid = () => crypto.randomUUID();

const DEFAULTS = {
  ollamaUrl: 'http://127.0.0.1:11434',
  defaultModel: '',
  temperature: 0.7,
  numCtx: 8192,
  keepAlive: '15m',
  theme: 'system',
  userName: '',
  preferences: '',
  style: 'normal',
  thinking: true,
  sendOnEnter: true,
  quickShortcut: 'Ctrl+Alt+X',
  autoTitle: true,
  fileTools: true,
  webTools: true,
  askWrites: true,
  codeTools: true,
  memoryEnabled: true,
  askMcp: true,
  pythonPath: 'python',
  embedModel: '',
  voicePython: 'C:\\Claud AI\\video-kit\\voice-venv\\Scripts\\python.exe',
  voiceTools: 'C:\\Claud AI\\video-kit\\voice_tools.py',
  ttsEngine: 'system',
  trayOnClose: true,
  openAtLogin: false,
  autoUpdate: true,
  autoSummarize: true,
};
let settings = { ...DEFAULTS, ...readJSON(SETTINGS_F, {}) };

// ---------- conversations index (meta kept in memory) ----------
const index = new Map();
const metaOf = (c) => ({ id: c.id, title: c.title, updated: c.updated, created: c.created, projectId: c.projectId || null, starred: !!c.starred, model: c.model, count: (c.messages || []).length });
for (const f of fs.readdirSync(CONV_DIR)) {
  if (!f.endsWith('.json')) continue;
  const c = readJSON(path.join(CONV_DIR, f), null);
  if (c && c.id) index.set(c.id, metaOf(c));
}
const convFile = (id) => path.join(CONV_DIR, id.replace(/[^a-zA-Z0-9-]/g, '') + '.json');

// ---------- window ----------
let win;
const overlayFor = (dark) => dark ? { color: '#17181b', symbolColor: '#c9ccd1', height: 44 } : { color: '#f4f3f0', symbolColor: '#3a3d42', height: 44 };
const isDark = () => settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors);

function createWindow() {
  win = new BrowserWindow({
    width: 1300, height: 860, minWidth: 760, minHeight: 520,
    title: 'XAI', show: false,
    backgroundColor: isDark() ? '#1d1e21' : '#faf9f7',
    icon: path.join(__dirname, 'build', 'icon.png'),
    titleBarStyle: 'hidden', titleBarOverlay: overlayFor(isDark()),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });
  win.on('close', (e) => {
    if (!settings.trayOnClose || app.isQuitting) return;
    e.preventDefault();
    win.hide();
    if (!settings.trayHintShown) {
      settings.trayHintShown = true;
      const { systemDark, dataDir, version, ...save } = settings; writeJSON(SETTINGS_F, save);
      try { new (require('electron').Notification)({ title: 'XAI is still running', body: 'It keeps running in the system tray so the quick-entry shortcut works. Click the XAI icon near the clock, or open XAI from the Start menu, to bring it back. To quit, right-click the tray icon and choose Quit XAI.', icon: path.join(__dirname, 'build', 'icon.png') }).show(); } catch {}
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // Right click: spelling suggestions + copy/paste
  win.webContents.on('context-menu', (_e, p) => {
    const items = [];
    for (const s of p.dictionarySuggestions || []) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    if (items.length) items.push({ type: 'separator' });
    if (p.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (p.selectionText) items.push({ role: 'copy' });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
}

function registerShortcut() {
  globalShortcut.unregisterAll();
  if (!settings.quickShortcut) return;
  try {
    let ok = globalShortcut.register(settings.quickShortcut, () => toggleQuick());
    if (!ok && settings.quickShortcut !== 'Ctrl+Alt+X') {
      ok = globalShortcut.register('Ctrl+Alt+X', () => toggleQuick());
      if (ok) { settings.quickShortcut = 'Ctrl+Alt+X'; const { systemDark, dataDir, version, ...save } = settings; writeJSON(SETTINGS_F, save); }
    }
  } catch { /* invalid accelerator */ }
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.on('second-instance', () => showMain());
app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); registerShortcut(); createTray(); mcp.connectAll().then(() => win?.webContents.send('mcp:changed')); setupUpdater(); });
app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
nativeTheme.on('updated', () => { if (win && settings.theme === 'system') { win.setTitleBarOverlay(overlayFor(isDark())); win.webContents.send('app:theme'); } });

// ---------- settings ----------
ipcMain.handle('settings:get', () => ({ ...settings, systemDark: nativeTheme.shouldUseDarkColors, dataDir: DATA, version: app.getVersion() }));
ipcMain.handle('settings:set', (_e, patch) => {
  settings = { ...settings, ...patch };
  const { systemDark, dataDir, version, ...save } = settings;
  writeJSON(SETTINGS_F, save);
  if ('quickShortcut' in patch) registerShortcut();
  if ('openAtLogin' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin, args: ['--hidden'] });
  return settings;
});
ipcMain.handle('window:theme', (_e, dark) => { if (win) win.setTitleBarOverlay(overlayFor(dark)); });
ipcMain.handle('app:openData', () => shell.openPath(DATA));
ipcMain.handle('app:openExternal', (_e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); });

// ---------- ollama ----------
const base = () => settings.ollamaUrl.replace(/\/+$/, '');
const showCache = new Map();

ipcMain.handle('ollama:models', async () => {
  const r = await fetch(base() + '/api/tags');
  if (!r.ok) throw new Error('Ollama returned ' + r.status);
  const { models = [] } = await r.json();
  const out = [];
  for (const m of models) {
    let info = showCache.get(m.digest);
    if (!info) {
      try {
        const s = await (await fetch(base() + '/api/show', { method: 'POST', body: JSON.stringify({ model: m.name }) })).json();
        const mi = s.model_info || {};
        const ctxKey = Object.keys(mi).find((k) => k.endsWith('.context_length'));
        info = { capabilities: s.capabilities || ['completion'], contextLength: ctxKey ? mi[ctxKey] : null };
      } catch { info = { capabilities: ['completion'], contextLength: null }; }
      showCache.set(m.digest, info);
    }
    out.push({ name: m.name, size: m.size, family: m.details?.family, params: m.details?.parameter_size, quant: m.details?.quantization_level, ...info });
  }
  return out.filter((m) => m.capabilities.includes('completion'));
});

ipcMain.handle('ollama:ps', async () => {
  try { const r = await fetch(base() + '/api/ps'); return (await r.json()).models || []; } catch { return null; }
});

ipcMain.handle('ollama:ping', async (_e, url) => {
  try { const r = await fetch((url || base()).replace(/\/+$/, '') + '/api/version', { signal: AbortSignal.timeout(4000) }); return r.ok ? (await r.json()).version : null; } catch { return null; }
});

const active = new Map();
ipcMain.handle('chat:stream', async (e, { reqId, body }) => {
  const ctrl = new AbortController();
  active.set(reqId, ctrl);
  try {
    const res = await fetch(base() + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, stream: true }), signal: ctrl.signal });
    if (!res.ok) { let t = await res.text(); try { t = JSON.parse(t).error || t; } catch {} throw new Error(t); }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const j = JSON.parse(line);
        if (j.error) throw new Error(j.error);
        e.sender.send('chat:chunk', {
          reqId, content: j.message?.content || '', thinking: j.message?.thinking || '', toolCalls: j.message?.tool_calls || null, done: !!j.done,
          stats: j.done ? { evalCount: j.eval_count, evalMs: (j.eval_duration || 0) / 1e6, promptCount: j.prompt_eval_count, totalMs: (j.total_duration || 0) / 1e6 } : null,
        });
      }
    }
    return { ok: true };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: true, aborted: true };
    log('error', 'chat stream', body?.model, err.message || err);
    return { ok: false, error: String(err.message || err) };
  } finally { active.delete(reqId); }
});
ipcMain.handle('chat:stop', (_e, reqId) => { active.get(reqId)?.abort(); });

// One-shot completion (titles etc.)
ipcMain.handle('chat:once', async (_e, body) => {
  try {
    const r = await fetch(base() + '/api/chat', { method: 'POST', body: JSON.stringify({ ...body, stream: false }), signal: AbortSignal.timeout(120000) });
    const j = await r.json();
    return j.message?.content || '';
  } catch { return ''; }
});

// ---------- conversations ----------
ipcMain.handle('conv:list', () => [...index.values()].sort((a, b) => b.updated - a.updated));
ipcMain.handle('conv:get', (_e, id) => readJSON(convFile(id), null));
ipcMain.handle('conv:save', (_e, c) => {
  if (!c.id) c.id = uid();
  if (!c.created) c.created = Date.now();
  c.updated = c.updated || Date.now();
  writeJSON(convFile(c.id), c);
  index.set(c.id, metaOf(c));
  return metaOf(c);
});
ipcMain.handle('conv:patch', (_e, id, patch) => {
  const c = readJSON(convFile(id), null);
  if (!c) return null;
  Object.assign(c, patch);
  writeJSON(convFile(id), c);
  index.set(id, metaOf(c));
  return metaOf(c);
});
ipcMain.handle('conv:delete', (_e, id) => { try { fs.unlinkSync(convFile(id)); } catch {} index.delete(id); });
ipcMain.handle('conv:search', (_e, q) => {
  q = (q || '').toLowerCase().trim();
  const res = [];
  for (const m of [...index.values()].sort((a, b) => b.updated - a.updated)) {
    if (!q) { res.push({ ...m, snippet: '' }); continue; }
    if ((m.title || '').toLowerCase().includes(q)) { res.push({ ...m, snippet: '' }); continue; }
    const c = readJSON(convFile(m.id), null);
    const hit = c?.messages?.find((x) => (x.content || '').toLowerCase().includes(q));
    if (hit) {
      const t = hit.content; const i = t.toLowerCase().indexOf(q);
      res.push({ ...m, snippet: (i > 40 ? '...' : '') + t.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, ' ') });
    }
    if (res.length >= 60) break;
  }
  return res;
});
ipcMain.handle('conv:export', async (_e, id) => {
  const c = readJSON(convFile(id), null);
  if (!c) return false;
  const md = `# ${c.title}\n\n` + c.messages.map((m) => `**${m.role === 'user' ? 'You' : 'XAI (' + (m.model || c.model) + ')'}**\n\n${m.content}\n`).join('\n---\n\n');
  const { filePath } = await dialog.showSaveDialog(win, { defaultPath: (c.title || 'chat').replace(/[\\/:*?"<>|]/g, '') + '.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
  if (!filePath) return false;
  fs.writeFileSync(filePath, md);
  return true;
});

// ---------- projects ----------
ipcMain.handle('projects:list', () => readJSON(PROJECTS_F, []));
ipcMain.handle('projects:save', (_e, p) => {
  const all = readJSON(PROJECTS_F, []);
  if (!p.id) { p.id = uid(); p.created = Date.now(); }
  p.updated = Date.now();
  const i = all.findIndex((x) => x.id === p.id);
  if (i >= 0) all[i] = p; else all.unshift(p);
  writeJSON(PROJECTS_F, all);
  return p;
});
ipcMain.handle('projects:delete', (_e, id) => {
  writeJSON(PROJECTS_F, readJSON(PROJECTS_F, []).filter((p) => p.id !== id));
  for (const m of index.values()) if (m.projectId === id) { try { fs.unlinkSync(convFile(m.id)); } catch {} index.delete(m.id); }
});

// ---------- files ----------
const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
const MAX_TEXT = 400000;
async function readOne(p) {
  const name = path.basename(p);
  const ext = path.extname(p).toLowerCase();
  const size = fs.statSync(p).size;
  if (IMG[ext]) {
    if (size > 20e6) throw new Error(name + ': image larger than 20 MB');
    return { name, kind: 'image', mime: IMG[ext], data: fs.readFileSync(p).toString('base64'), size };
  }
  let text;
  if (ext === '.pdf') {
    const pdf = require('pdf-parse/lib/pdf-parse.js');
    text = (await pdf(fs.readFileSync(p))).text;
  } else if (ext === '.docx') {
    text = (await require('mammoth').extractRawText({ path: p })).value;
  } else {
    const buf = fs.readFileSync(p);
    if (buf.subarray(0, 8000).includes(0)) throw new Error(name + ': binary files are not supported');
    text = buf.toString('utf8');
  }
  const truncated = text.length > MAX_TEXT;
  return { name, kind: 'text', text: truncated ? text.slice(0, MAX_TEXT) : text, truncated, size };
}
ipcMain.handle('files:pick', async (_e, opts = {}) => {
  const { filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: opts.textOnly
      ? [{ name: 'Documents', extensions: ['txt', 'md', 'pdf', 'docx', 'csv', 'json', 'js', 'ts', 'py', 'html', 'css', 'xml', 'yaml', 'yml', 'log', 'sql', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'sh', 'ps1'] }, { name: 'All files', extensions: ['*'] }]
      : [{ name: 'All supported', extensions: ['*'] }],
  });
  return readMany(filePaths);
});
ipcMain.handle('files:read', (_e, paths) => readMany(paths));
async function readMany(paths = []) {
  const out = [];
  for (const p of paths) { try { out.push(await readOne(p)); } catch (err) { out.push({ name: path.basename(p), error: String(err.message || err) }); } }
  return out;
}
ipcMain.handle('files:saveText', async (_e, { name, content }) => {
  const { filePath } = await dialog.showSaveDialog(win, { defaultPath: name });
  if (!filePath) return false;
  fs.writeFileSync(filePath, content);
  return true;
});

// ---------- tools ----------
const tools = require('./tools.js');
ipcMain.handle('tools:run', async (_e, name, args, ctx = {}) => {
  if (name.startsWith('mcp__')) return mcp.call(name, args);
  if (name === 'run_command') return exec.run_command(args);
  if (name === 'run_python') return exec.run_python(args, settings.pythonPath);
  if (name === 'search_project_knowledge') {
    if (!ctx.projectId) return 'This chat is not in a project.';
    try { const hits = await kb.search(ctx.projectId, args.query || '', 8); return hits.length ? hits.map((h, i) => `[${i + 1}] ${h.source} (match ${h.score})\n${h.text}`).join('\n\n---\n\n') : 'Nothing relevant found in the project knowledge.'; } catch (e) { return 'Knowledge search failed: ' + e.message; }
  }
  if (name === 'remember') { const all = readJSON(MEMORY_F, []); all.push({ id: uid(), text: String(args.fact || '').slice(0, 500), ts: Date.now() }); writeJSON(MEMORY_F, all); win?.webContents.send('memory:changed'); return 'Saved to memory.'; }
  if (name === 'forget') { const q = String(args.fact || '').toLowerCase(); const all = readJSON(MEMORY_F, []); const keep = all.filter((m) => !m.text.toLowerCase().includes(q)); writeJSON(MEMORY_F, keep); win?.webContents.send('memory:changed'); return `Removed ${all.length - keep.length} memory item(s).`; }
  return tools.run(name, args, { readOne, shell });
});
ipcMain.handle('sys:info', () => ({ drives: tools.drives(), home: require('os').homedir(), user: require('os').userInfo().username }));

// ---------- connectors (MCP) ----------
const { MCPManager } = require('./mcp.js');
const exec = require('./exec.js');
const { Knowledge } = require('./rag.js');
const mcp = new MCPManager(path.join(DATA, 'connectors.json'), path.join(DATA, 'media'));
const kb = new Knowledge(path.join(DATA, 'knowledge'), () => settings);
const MEMORY_F = path.join(DATA, 'memory.json');

ipcMain.handle('mcp:status', () => mcp.status());
ipcMain.handle('mcp:tools', () => mcp.toolDefs());
ipcMain.handle('mcp:importable', () => mcp.importable());
ipcMain.handle('mcp:save', async (_e, name, cfg) => { mcp.servers[name] = cfg; mcp.save(); await mcp.connect(name); return mcp.status(); });
ipcMain.handle('mcp:remove', async (_e, name) => { await mcp.disconnect(name); delete mcp.servers[name]; mcp.save(); return mcp.status(); });
ipcMain.handle('mcp:reconnect', async (_e, name) => { await mcp.connect(name); return mcp.status(); });

// ---------- knowledge ----------
ipcMain.handle('kb:info', (_e, id) => kb.info(id));
ipcMain.handle('kb:addFiles', async (e, id) => {
  const { filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
  if (!filePaths.length) return null;
  const docs = [];
  for (const f of filePaths) { try { const r = await readOne(f); if (r.kind === 'text') docs.push({ name: r.name, text: r.text }); } catch {} }
  return kb.addDocs(id, docs, (d, t) => e.sender.send('kb:progress', { id, done: d, total: t }));
});
ipcMain.handle('kb:addFolder', async (e, id) => {
  const { filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (!filePaths.length) return null;
  return kb.addFolder(id, filePaths[0], readOne, (d, t) => e.sender.send('kb:progress', { id, done: d, total: t }));
});
ipcMain.handle('kb:addDocs', (e, id, docs) => kb.addDocs(id, docs, (d, t) => e.sender.send('kb:progress', { id, done: d, total: t })));
ipcMain.handle('kb:remove', (_e, id, name) => kb.remove(id, name));
ipcMain.handle('kb:drop', (_e, id) => kb.drop(id));
ipcMain.handle('kb:search', async (_e, id, q, k) => { try { return await kb.search(id, q, k); } catch { return []; } });

// ---------- memory ----------
ipcMain.handle('memory:list', () => readJSON(MEMORY_F, []));
ipcMain.handle('memory:save', (_e, list) => { writeJSON(MEMORY_F, list); return list; });

// ---------- images from tools ----------
ipcMain.handle('img:read', (_e, p) => {
  try { const ext = path.extname(p).slice(1).toLowerCase(); if (!/^(png|jpe?g|gif|webp|svg)$/.test(ext)) return null; return `data:image/${ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext};base64,` + fs.readFileSync(p).toString('base64'); } catch { return null; }
});
ipcMain.handle('img:open', (_e, p) => shell.openPath(p));

// ---------- voice ----------
const voiceReady = () => fs.existsSync(settings.voicePython) && fs.existsSync(settings.voiceTools);
ipcMain.handle('voice:available', () => voiceReady());
ipcMain.handle('voice:transcribe', async (_e, b64, ext = 'webm') => {
  if (!voiceReady()) return { error: 'Local Whisper not found. Set the voice kit paths in Settings > Voice.' };
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'xai-voice-'));
  const audio = path.join(dir, 'rec.' + ext), srt = path.join(dir, 'rec.srt');
  fs.writeFileSync(audio, Buffer.from(b64, 'base64'));
  const r = await exec.runProc(settings.voicePython, [settings.voiceTools, 'transcribe', audio, srt], { timeout: 600000 });
  if (!fs.existsSync(srt)) return { error: 'Transcription failed: ' + (r.err || r.out).slice(-300) };
  const text = fs.readFileSync(srt, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l)).join(' ');
  return { text };
});
ipcMain.handle('voice:speak', async (_e, text, voice = 'am_michael') => {
  if (!voiceReady()) return { error: 'Kokoro voice not found.' };
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'xai-tts-'));
  const tf = path.join(dir, 'in.txt'), out = path.join(dir, 'out.wav');
  fs.writeFileSync(tf, text, 'utf8');
  const r = await exec.runProc(settings.voicePython, [settings.voiceTools, 'speak', tf, out, voice, '1.0'], { timeout: 600000 });
  if (!fs.existsSync(out)) return { error: 'Speech failed: ' + (r.err || r.out).slice(-300) };
  return { audio: 'data:audio/wav;base64,' + fs.readFileSync(out).toString('base64') };
});

// ---------- screenshots ----------
ipcMain.handle('screen:sources', async () => {
  const d = screen.getPrimaryDisplay();
  const sz = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const wasVisible = win.isVisible();
  if (wasVisible) { win.hide(); await new Promise((r) => setTimeout(r, 350)); }
  try {
    const srcs = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: sz, fetchWindowIcons: false });
    return srcs.filter((s) => !/^XAI$/.test(s.name) && !s.thumbnail.isEmpty()).slice(0, 16).map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.resize({ width: 320 }).toDataURL(), full: s.thumbnail.toPNG().toString('base64') }));
  } finally { if (wasVisible) { win.show(); win.focus(); } }
});

// ---------- model manager ----------
ipcMain.handle('ollama:pull', async (e, name) => {
  try {
    const res = await fetch(base() + '/api/pull', { method: 'POST', body: JSON.stringify({ model: name, stream: true }) });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; const j = JSON.parse(line); if (j.error) return { ok: false, error: j.error }; e.sender.send('pull:progress', { name, status: j.status, total: j.total, completed: j.completed }); }
    }
    showCache.clear();
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('ollama:delete', async (_e, name) => { const r = await fetch(base() + '/api/delete', { method: 'DELETE', body: JSON.stringify({ model: name }) }); return r.ok; });

// ---------- export ----------
ipcMain.handle('export:pdf', async (_e, title, html) => {
  const { filePath } = await dialog.showSaveDialog(win, { defaultPath: title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (!filePath) return false;
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  await w.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(html).toString('base64'));
  const pdf = await w.webContents.printToPDF({ printBackground: true, margins: { marginType: 'default' }, pageSize: 'A4' });
  w.destroy();
  fs.writeFileSync(filePath, pdf);
  return true;
});
ipcMain.handle('export:doc', async (_e, title, html) => {
  const { filePath } = await dialog.showSaveDialog(win, { defaultPath: title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) + '.doc', filters: [{ name: 'Word document', extensions: ['doc'] }] });
  if (!filePath) return false;
  fs.writeFileSync(filePath, html.replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">'));
  return true;
});

// ---------- preview libraries (inlined into sandboxed previews, works offline) ----------
const LIBS = { react: 'react/umd/react.production.min.js', reactdom: 'react-dom/umd/react-dom.production.min.js', babel: '@babel/standalone/babel.min.js', mermaid: 'mermaid/dist/mermaid.min.js' };
ipcMain.handle('lib:get', (_e, k) => fs.readFileSync(path.join(__dirname, 'node_modules', LIBS[k]), 'utf8'));

// ---------- tray and quick entry ----------
let tray, quick;
function showMain() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.moveTop(); win.focus(); }
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('XAI');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open XAI', click: showMain },
    { label: 'Quick entry', accelerator: settings.quickShortcut || undefined, click: toggleQuick },
    { label: 'New chat', click: () => { showMain(); win.webContents.send('app:newchat'); } },
    { type: 'separator' },
    { label: 'Quit XAI', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showMain);
}
function toggleQuick() {
  if (quick && !quick.isDestroyed()) { if (quick.isVisible()) quick.hide(); else { quick.show(); quick.focus(); } return; }
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  quick = new BrowserWindow({ width: 680, height: 76, x: Math.round(d.x + (d.width - 680) / 2), y: Math.round(d.y + d.height * 0.28), frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } });
  quick.loadFile(path.join(__dirname, 'renderer', 'quick.html'));
  quick.once('ready-to-show', () => { quick.show(); quick.focus(); });
  quick.on('blur', () => { if (quick && !quick.isDestroyed()) quick.hide(); });
}
ipcMain.handle('quick:submit', (_e, text) => { quick?.hide(); showMain(); win.webContents.send('app:quickSend', text); });
ipcMain.handle('quick:close', () => quick?.hide());

// ---------- updates and network ----------
function setupUpdater() {
  if (!app.isPackaged || !settings.autoUpdate) return;
  try { const { autoUpdater } = require('electron-updater'); autoUpdater.checkForUpdatesAndNotify().catch(() => {}); } catch {}
}
ipcMain.handle('app:checkUpdate', async () => {
  if (!app.isPackaged) return 'Updates are checked in the installed app, not in development mode.';
  try { const { autoUpdater } = require('electron-updater'); const r = await autoUpdater.checkForUpdates(); return r?.updateInfo?.version && r.updateInfo.version !== app.getVersion() ? `Version ${r.updateInfo.version} is downloading. It installs when XAI restarts.` : 'XAI is up to date.'; } catch (e) { return 'Could not check for updates: ' + e.message; }
});
ipcMain.handle('net:lan', () => {
  const out = [];
  for (const [n, list] of Object.entries(require('os').networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !/vEthernet|VirtualBox|VMware|WSL/i.test(n)) out.push(a.address);
  return out;
});
