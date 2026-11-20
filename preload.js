const { contextBridge, ipcRenderer, webUtils } = require('electron');

const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('xai', {
  settings: { get: inv('settings:get'), set: inv('settings:set') },
  setTitleBarTheme: inv('window:theme'),
  openData: inv('app:openData'),
  openExternal: inv('app:openExternal'),
  models: inv('ollama:models'),
  ps: inv('ollama:ps'),
  ping: inv('ollama:ping'),
  stream: inv('chat:stream'),
  stop: inv('chat:stop'),
  once: inv('chat:once'),
  onChunk: (fn) => ipcRenderer.on('chat:chunk', (_e, d) => fn(d)),
  onQuick: (fn) => ipcRenderer.on('app:quick', () => fn()),
  onTheme: (fn) => ipcRenderer.on('app:theme', () => fn()),
  conv: { list: inv('conv:list'), get: inv('conv:get'), save: inv('conv:save'), patch: inv('conv:patch'), del: inv('conv:delete'), search: inv('conv:search'), exportMd: inv('conv:export') },
  projects: { list: inv('projects:list'), save: inv('projects:save'), del: inv('projects:delete') },
  files: { pick: inv('files:pick'), read: inv('files:read'), saveText: inv('files:saveText') },
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
});
