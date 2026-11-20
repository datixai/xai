// XAI desktop: main process. Talks to the local Ollama server, stores chats on disk.
const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA = path.join(app.getPath('userData'), 'data');
const CONV_DIR = path.join(DATA, 'conversations');
const SETTINGS_F = path.join(DATA, 'settings.json');
const PROJECTS_F = path.join(DATA, 'projects.json');
fs.mkdirSync(CONV_DIR, { recursive: true });

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
  quickShortcut: 'Ctrl+Alt+Space',
  autoTitle: true,
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
  win.once('ready-to-show', () => win.show());
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
    globalShortcut.register(settings.quickShortcut, () => {
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show(); win.focus();
      win.webContents.send('app:quick');
    });
  } catch { /* invalid accelerator */ }
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); registerShortcut(); });
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
          reqId, content: j.message?.content || '', thinking: j.message?.thinking || '', done: !!j.done,
          stats: j.done ? { evalCount: j.eval_count, evalMs: (j.eval_duration || 0) / 1e6, promptCount: j.prompt_eval_count, totalMs: (j.total_duration || 0) / 1e6 } : null,
        });
      }
    }
    return { ok: true };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: true, aborted: true };
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
