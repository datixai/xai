'use strict';
/* XAI desktop renderer. All AI runs on local Ollama models through window.xai (preload). */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const uid = () => crypto.randomUUID();
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmtSize = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
function rel(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const I = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  retry: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/><path d="M12 21a3 3 0 0 1 0-6h2"/>',
  key: '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11h.01M10 11h.01M14 11h.01M18 11h.01M7 14h10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h13"/>',
  wand: '<path d="m15 4 5 5L9 20l-5-5zM13 6l5 5"/>',
  chart: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
};
const icon = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n] || ''}</svg>`;

// XAI brand mark: a four-point "spark" that forms an X.
const STAR = 'M256 214Q296 134 384 128Q378 216 298 256Q378 296 384 384Q296 378 256 298Q216 378 128 384Q134 296 214 256Q134 216 128 128Q216 134 256 214Z';
let gid = 0;
const grad = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4F46E5"/><stop offset=".55" stop-color="#7C3AED"/><stop offset="1" stop-color="#06B6D4"/></linearGradient>`;
function logo(size = 26) { const id = 'xg' + gid++; return `<svg width="${size}" height="${size}" viewBox="0 0 512 512"><defs>${grad(id)}</defs><rect x="16" y="16" width="480" height="480" rx="124" fill="url(#${id})"/><path d="${STAR}" fill="#fff"/><circle cx="256" cy="256" r="16" fill="url(#${id})"/></svg>`; }
function mark(size = 26) { const id = 'xg' + gid++; return `<svg class="mark" width="${size}" height="${size}" viewBox="96 96 320 320"><defs>${grad(id)}</defs><path d="${STAR}" fill="url(#${id})"/></svg>`; }

// ---------- state ----------
const S = {
  settings: null, models: [], model: null, online: false, version: null,
  convs: [], projects: [], conv: null, view: 'new', projectId: null,
  gen: null, artifact: null, artTab: 'preview', artifacts: new Map(), composer: null,
};
const STYLES = {
  normal: { label: 'Normal', desc: 'Default responses', p: '' },
  concise: { label: 'Concise', desc: 'Shorter, more direct answers', p: 'Be concise. Give short, direct answers without filler or long preambles.' },
  explanatory: { label: 'Explanatory', desc: 'Step by step, like a teacher', p: 'Explain thoroughly and step by step like a patient teacher, with examples and the reasoning behind each point.' },
  formal: { label: 'Formal', desc: 'Clear and professional', p: 'Write in a clear, formal and professional tone, well structured with headings where helpful.' },
};
const PREVIEW = new Set(['html', 'svg', 'markdown', 'md']);
const LANG_NAME = { js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', py: 'Python', python: 'Python', html: 'HTML', css: 'CSS', svg: 'SVG', md: 'Markdown', markdown: 'Markdown', json: 'JSON', sql: 'SQL', bash: 'Bash', sh: 'Shell', powershell: 'PowerShell', ps1: 'PowerShell', java: 'Java', cpp: 'C++', c: 'C', cs: 'C#', csharp: 'C#', go: 'Go', rust: 'Rust', php: 'PHP', jsx: 'React', tsx: 'React', yaml: 'YAML', xml: 'XML', kotlin: 'Kotlin', swift: 'Swift', dart: 'Dart' };
const EXT = { javascript: 'js', typescript: 'ts', python: 'py', markdown: 'md', bash: 'sh', powershell: 'ps1', csharp: 'cs', rust: 'rs', kotlin: 'kt', jsx: 'jsx', tsx: 'tsx', text: 'txt', '': 'txt' };

const modelInfo = (name = S.model) => S.models.find((m) => m.name === name) || { name, capabilities: ['completion'] };
const has = (cap, name) => modelInfo(name).capabilities.includes(cap);
const leveled = (name = S.model) => /gpt-oss/i.test(name || '');
const prettyModel = (n) => (n || 'No model').replace(/:latest$/, '');

// ---------- markdown ----------
marked.setOptions({ gfm: true, breaks: false });
DOMPurify.addHook('afterSanitizeAttributes', (n) => { if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); } });

function artifactTitle(code, lang) {
  const t = code.match(/<title>([^<]{1,80})<\/title>/i) || code.match(/^#\s+(.{1,80})$/m) || code.match(/<h1[^>]*>([^<]{1,80})<\/h1>/i);
  if (t) return t[1].trim();
  const f = code.match(/(?:function|class|def)\s+([A-Za-z_]\w*)/);
  return f ? f[1] : (LANG_NAME[lang] || lang.toUpperCase() || 'Code') + (lang === 'svg' ? ' graphic' : PREVIEW.has(lang) ? ' document' : ' snippet');
}
const isArtifact = (lang, lines) => lang === 'html' || lang === 'svg' || (lines >= 24 && !['text', 'txt', 'output', 'console', ''].includes(lang));

function highlight(code, lang) {
  try { if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch {}
  return esc(code);
}

function renderMd(box, text, ctx = {}) {
  box.innerHTML = DOMPurify.sanitize(marked.parse(text || ''));
  const blocks = $$('pre > code', box);
  blocks.forEach((code, bi) => {
    const pre = code.parentElement;
    const lang = ((code.className.match(/language-([\w+#.-]+)/) || [])[1] || '').toLowerCase();
    const src = code.textContent.replace(/\n$/, '');
    const lines = src.split('\n').length;
    const writing = ctx.streaming && bi === blocks.length - 1 && (text.match(/^\s*```/gm) || []).length % 2 === 1;
    if (ctx.key != null && isArtifact(lang, lines)) {
      const key = ctx.key + ':' + bi;
      const a = { key, lang, code: src, title: artifactTitle(src, lang), writing };
      S.artifacts.set(key, a);
      const card = el(`<div class="art-card${S.artifact?.key === key ? ' active' : ''}"><div class="aic">${icon(PREVIEW.has(lang) ? 'eye' : 'code', 22)}</div><div class="am"><div class="at">${esc(a.title)}</div><div class="as">${esc(LANG_NAME[lang] || lang || 'Text')} · ${lines} lines${writing ? ' · <span class="shimmer">writing</span>' : ' · Click to open'}</div></div>${icon('right', 16)}</div>`);
      card.onclick = () => openArtifact(key);
      pre.replaceWith(card);
      if (S.artifact?.key === key) refreshArtifact(a);
      else if (writing && ctx.autoOpen) { ctx.autoOpen(key); }
      return;
    }
    const wrap = el(`<div class="codeblock"><div class="cb-head"><span>${esc(LANG_NAME[lang] || lang || 'text')}</span><button>${icon('copy', 14)}<span>Copy</span></button></div></div>`);
    code.innerHTML = highlight(src, lang);
    pre.replaceWith(wrap);
    wrap.append(pre);
    $('button', wrap).onclick = (e) => copy(src, e.currentTarget);
  });
}

async function copy(text, btn) {
  await navigator.clipboard.writeText(text);
  if (btn) { const old = btn.innerHTML; btn.innerHTML = icon('check', 14) + (btn.querySelector('span') ? '<span>Copied</span>' : ''); setTimeout(() => (btn.innerHTML = old), 1400); }
  else toast('Copied');
}

// ---------- UI primitives ----------
function toast(msg, kind = '') {
  const t = el(`<div class="toast ${kind}">${esc(msg)}</div>`);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 5200 : 2400);
}
let menuEl = null;
function closeMenu() { if (menuEl) { menuEl._anchor?.classList.remove('open'); menuEl.remove(); menuEl = null; } }
function showMenu(anchor, items, { align = 'left', up = false } = {}) {
  closeMenu();
  const m = el('<div class="menu"></div>');
  for (const it of items) {
    if (it === '-') { m.append(el('<div class="sep"></div>')); continue; }
    if (it.header) { m.append(el(`<div class="mh">${esc(it.header)}</div>`)); continue; }
    const b = el(`<button class="mi ${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon, 16) : ''}<span class="mtx">${esc(it.label)}${it.sub ? `<span class="sub">${it.sub}</span>` : ''}</span>${it.checked ? `<span class="ck">${icon('check', 16)}</span>` : ''}</button>`);
    b.onclick = (e) => { e.stopPropagation(); closeMenu(); it.onClick?.(); };
    m.append(b);
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = align === 'right' ? r.right - mw : r.left;
  let y = up || r.bottom + mh + 8 > innerHeight ? r.top - mh - 6 : r.bottom + 6;
  m.style.left = Math.max(8, Math.min(x, innerWidth - mw - 8)) + 'px';
  m.style.top = Math.max(8, y) + 'px';
  anchor.classList.add('open'); m._anchor = anchor;
  menuEl = m;
}
document.addEventListener('mousedown', (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });

function modal({ title, body, actions = [], cls = '' }) {
  const ov = el(`<div class="overlay"><div class="modal ${cls}">${title ? `<div class="m-head"><h3>${esc(title)}</h3><button class="ibtn" data-x>${icon('x')}</button></div>` : ''}<div class="m-body"></div>${actions.length ? '<div class="m-foot"></div>' : ''}</div></div>`);
  const close = () => { ov.remove(); };
  if (typeof body === 'string') $('.m-body', ov).innerHTML = body; else if (body) $('.m-body', ov).append(body);
  for (const a of actions) {
    const b = el(`<button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}">${esc(a.label)}</button>`);
    b.onclick = () => (a.onClick ? a.onClick(close, ov) : close());
    $('.m-foot', ov).append(b);
  }
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  $('[data-x]', ov)?.addEventListener('click', close);
  ov._close = close;
  document.body.append(ov);
  return ov;
}
function askText(title, value = '', { label = '', multiline = false, placeholder = '', okLabel = 'Save' } = {}) {
  return new Promise((res) => {
    const f = el(`<div class="field">${label ? `<label>${esc(label)}</label>` : ''}${multiline ? `<textarea rows="8" placeholder="${esc(placeholder)}"></textarea>` : `<input type="text" placeholder="${esc(placeholder)}">`}</div>`);
    const inp = $('input,textarea', f); inp.value = value;
    let done = false;
    const ov = modal({ title, body: f, actions: [{ label: 'Cancel', onClick: (c) => { done = true; c(); res(null); } }, { label: okLabel, primary: true, onClick: (c) => { done = true; c(); res(inp.value); } }] });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (!multiline || e.ctrlKey)) { e.preventDefault(); done = true; ov._close(); res(inp.value); } });
    new MutationObserver((_, o) => { if (!ov.isConnected) { o.disconnect(); if (!done) res(null); } }).observe(document.body, { childList: true });
    setTimeout(() => { inp.focus(); inp.select?.(); }, 30);
  });
}
function confirmBox(title, text, okLabel = 'Delete') {
  return new Promise((res) => modal({ title, body: `<p style="margin:4px 0 8px;color:var(--muted)">${esc(text)}</p>`, actions: [{ label: 'Cancel', onClick: (c) => { c(); res(false); } }, { label: okLabel, danger: true, onClick: (c) => { c(); res(true); } }] }));
}

// ---------- theme ----------
function applyTheme() {
  const t = S.settings.theme;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  xai.setTitleBarTheme(dark);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => S.settings && applyTheme());

async function setSetting(patch) {
  S.settings = { ...S.settings, ...(await xai.settings.set(patch)) };
}

// ---------- models / status ----------
async function loadModels(silent) {
  try {
    S.models = await xai.models();
    S.online = true;
    S.version = await xai.ping();
  } catch { S.models = []; S.online = false; }
  const names = S.models.map((m) => m.name);
  if (!S.model || !names.includes(S.model)) {
    S.model = names.includes(S.settings.defaultModel) ? S.settings.defaultModel
      : names.find((n) => n.startsWith('gpt-oss')) || names.find((n) => n.startsWith('gemma3')) || names[0] || null;
  }
  updateStatus();
  S.composer?.sync();
  if (!silent && S.view === 'new') renderNew();
}
function updateStatus() {
  $('#statusDot').className = S.online ? 'ok' : 'bad';
  $('#statusText').textContent = S.online ? `Local · ${S.models.length} models` : 'Ollama offline';
}
setInterval(async () => {
  const v = await xai.ping();
  if (!!v !== S.online) loadModels(true).then(() => S.view === 'new' && renderNew());
}, 15000);

// ---------- sidebar ----------
async function refreshConvs() { S.convs = await xai.conv.list(); renderSidebar(); }
async function refreshProjects() { S.projects = await xai.projects.list(); }

function sbItem(c) {
  const live = S.gen?.conv.id === c.id;
  const it = el(`<div class="sb-item ${S.conv?.id === c.id && S.view === 'chat' ? 'active' : ''}" title="${esc(c.title)}">${live ? '<i class="live"></i>' : ''}<span class="t">${esc(c.title)}</span><button class="ibtn more">${icon('more', 16)}</button></div>`);
  it.onclick = () => openConv(c.id);
  $('.more', it).onclick = (e) => { e.stopPropagation(); convMenu(e.currentTarget, c.id); };
  return it;
}
function renderSidebar() {
  const starred = S.convs.filter((c) => c.starred);
  const recent = S.convs.filter((c) => !c.starred).slice(0, 50);
  $('#starredSec').hidden = !starred.length;
  $('#starredList').replaceChildren(...starred.map(sbItem));
  $('#recentList').replaceChildren(...(recent.length ? recent.map(sbItem) : [el('<div class="sb-empty">No chats yet</div>')]));
  $('#chatsBtn').classList.toggle('active', S.view === 'chats');
  $('#projectsBtn').classList.toggle('active', S.view === 'projects' || S.view === 'project');
  const name = S.settings.userName || 'You';
  $('#userName').textContent = name;
  $('#userAvatar').textContent = name.trim()[0]?.toUpperCase() || 'U';
}
function convMenu(anchor, id) {
  const c = S.convs.find((x) => x.id === id);
  if (!c) return;
  showMenu(anchor, [
    { label: c.starred ? 'Unstar' : 'Star', icon: 'star', onClick: () => patchConv(id, { starred: !c.starred }) },
    { label: 'Rename', icon: 'edit', onClick: () => renameConv(id) },
    { label: 'Move to project', icon: 'folder', onClick: () => moveConv(id) },
    { label: 'Export as Markdown', icon: 'download', onClick: async () => { if (await xai.conv.exportMd(id)) toast('Chat exported'); } },
    '-',
    { label: 'Delete', icon: 'trash', danger: true, onClick: () => deleteConv(id) },
  ]);
}
async function patchConv(id, patch) {
  await xai.conv.patch(id, patch);
  if (S.conv?.id === id) Object.assign(S.conv, patch);
  if (S.gen?.conv.id === id) Object.assign(S.gen.conv, patch);
  await refreshConvs();
  if (S.view === 'chat') renderTopbar();
}
async function renameConv(id) {
  const c = S.convs.find((x) => x.id === id);
  const t = await askText('Rename chat', c?.title || '');
  if (t && t.trim()) patchConv(id, { title: t.trim() });
}
async function moveConv(id) {
  const items = [{ label: 'No project', onClick: () => patchConv(id, { projectId: null }) }, ...S.projects.map((p) => ({ label: p.name, icon: 'folder', onClick: () => patchConv(id, { projectId: p.id }) }))];
  if (!S.projects.length) return toast('Create a project first');
  modal({ title: 'Move to project', body: '<div id="mvList"></div>' });
  const list = $('#mvList');
  for (const it of items) { const r = el(`<div class="row"><div class="rm rt">${esc(it.label)}</div></div>`); r.onclick = () => { $('.overlay')?.remove(); it.onClick(); }; list.append(r); }
}
async function deleteConv(id) {
  if (!(await confirmBox('Delete chat?', 'This chat will be permanently deleted from this PC.'))) return;
  if (S.gen?.conv.id === id) xai.stop(S.gen.reqId);
  await xai.conv.del(id);
  if (S.conv?.id === id) newChat();
  await refreshConvs();
  if (S.view === 'chats') renderChats();
  if (S.view === 'project') renderProject(S.projectId);
}

// ---------- topbar ----------
function renderTopbar() {
  const crumb = $('#crumb');
  const right = $('#tbRight');
  crumb.innerHTML = ''; right.innerHTML = '';
  if (S.view === 'chat' && S.conv) {
    const p = S.conv.projectId && S.projects.find((x) => x.id === S.conv.projectId);
    if (p) { const a = el(`<a>${esc(p.name)}</a>`); a.onclick = () => renderProject(p.id); crumb.append(a, el(`<span>/</span>`)); }
    const t = el(`<span class="ct btn">${esc(S.conv.title)}</span>`);
    t.onclick = () => renameConv(S.conv.id);
    crumb.append(t);
    if (S.convs.some((c) => c.id === S.conv.id)) {
      const more = el(`<button class="ibtn" title="Chat options">${icon('chev', 16)}</button>`);
      more.onclick = (e) => convMenu(e.currentTarget, S.conv.id);
      crumb.append(more);
    }
  }
}

// ---------- composer ----------
function makeComposer({ placeholder = 'How can XAI help you today?', projectId = null } = {}) {
  const root = el(`<div class="composer">
    <div class="atts"></div>
    <textarea rows="1" placeholder="${esc(placeholder)}" spellcheck="true"></textarea>
    <div class="c-row">
      <button class="ibtn c-add" title="Add files or photos">${icon('plus', 20)}</button>
      <button class="pill c-style" title="Response style">${icon('pen', 15)}<span></span></button>
      <button class="pill c-think" title="Extended thinking">${icon('bulb', 15)}<span></span></button>
      <div class="grow"></div>
      <button class="model-btn" title="Choose a local model"><span></span>${icon('chev', 15)}</button>
      <button class="send" title="Send (Enter)">${icon('up', 18)}</button>
    </div></div>`);
  const ta = $('textarea', root), attsBox = $('.atts', root), sendBtn = $('.send', root);
  root.atts = [];
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 280) + 'px'; root.sync(); };
  const generatingHere = () => S.gen && (!S.conv || S.gen.conv.id === S.conv.id);

  root.sync = () => {
    const busy = S.view === 'chat' && generatingHere();
    sendBtn.classList.toggle('stop', !!busy);
    sendBtn.innerHTML = busy ? icon('stop', 16) : icon('up', 18);
    sendBtn.title = busy ? 'Stop generating' : 'Send (Enter)';
    sendBtn.disabled = !busy && !ta.value.trim() && !root.atts.length;
    $('.model-btn span', root).textContent = prettyModel(S.model);
    const th = $('.c-think', root);
    th.hidden = !has('thinking');
    const lv = leveled();
    th.classList.toggle('on', lv || !!S.settings.thinking);
    $('span', th).textContent = lv ? 'Thinking: ' + (S.settings.thinkLevel || 'medium') : S.settings.thinking ? 'Thinking on' : 'Thinking off';
    const st = $('.c-style', root);
    st.classList.toggle('on', S.settings.style !== 'normal');
    $('span', st).textContent = STYLES[S.settings.style]?.label || 'Normal';
  };
  root.addFiles = (files) => {
    for (const f of files) {
      if (f.error) { toast(f.error, 'error'); continue; }
      if (f.truncated) toast(`${f.name} is long; only the first part was added.`);
      root.atts.push(f);
    }
    drawAtts(); root.sync();
  };
  const drawAtts = () => {
    attsBox.replaceChildren(...root.atts.map((a, i) => {
      const ext = (a.name.split('.').pop() || 'TXT').slice(0, 4).toUpperCase();
      const node = a.kind === 'image'
        ? el(`<div class="att img-only" title="${esc(a.name)}"><img src="data:${a.mime};base64,${a.data}"><button class="rm">${icon('x', 12)}</button></div>`)
        : el(`<div class="att" title="${esc(a.name)}"><div class="fi">${esc(ext)}</div><div class="an"><b>${esc(a.name)}</b><span>${(a.text || '').split('\n').length} lines</span></div><button class="rm">${icon('x', 12)}</button></div>`);
      $('.rm', node).onclick = () => { root.atts.splice(i, 1); drawAtts(); root.sync(); };
      return node;
    }));
  };
  root.setText = (t) => { ta.value = t; autosize(); ta.focus(); ta.setSelectionRange(t.length, t.length); };
  root.focus = () => ta.focus();

  const submit = async () => {
    if (S.view === 'chat' && generatingHere()) { xai.stop(S.gen.reqId); return; }
    if (S.gen) { toast('Wait for the current reply to finish, or stop it first.'); return; }
    const text = ta.value, atts = root.atts.slice();
    if (!text.trim() && !atts.length) return;
    const ok = await send(text, atts, projectId);
    if (ok !== false) { ta.value = ''; root.atts = []; drawAtts(); autosize(); }
  };
  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && S.settings.sendOnEnter !== false) { e.preventDefault(); submit(); }
    else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); submit(); }
  });
  ta.addEventListener('paste', async (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const imgs = items.filter((i) => i.type.startsWith('image/'));
    if (imgs.length) {
      e.preventDefault();
      for (const it of imgs) {
        const f = it.getAsFile();
        const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
        root.addFiles([{ name: 'pasted-image.png', kind: 'image', mime: f.type, data, size: f.size }]);
      }
      return;
    }
    const text = e.clipboardData?.getData('text/plain') || '';
    if (text.length > 6000) { e.preventDefault(); root.addFiles([{ name: 'Pasted text.txt', kind: 'text', text, size: text.length }]); toast('Long text added as an attachment'); }
  });
  sendBtn.onclick = submit;
  $('.c-add', root).onclick = (e) => showMenu(e.currentTarget, [
    { label: 'Upload files', icon: 'clip', sub: 'Images, PDF, Word, text and code', onClick: async () => root.addFiles(await xai.files.pick()) },
    { label: 'Paste a screenshot with Ctrl+V', icon: 'image', onClick: () => ta.focus() },
  ], { up: true });
  $('.c-style', root).onclick = (e) => showMenu(e.currentTarget, [{ header: 'Response style' }, ...Object.entries(STYLES).map(([k, v]) => ({ label: v.label, sub: v.desc, checked: S.settings.style === k, onClick: async () => { await setSetting({ style: k }); root.sync(); } }))], { up: true });
  $('.c-think', root).onclick = async (e) => {
    if (leveled()) {
      showMenu(e.currentTarget, [{ header: 'Reasoning effort' }, ...['low', 'medium', 'high'].map((l) => ({ label: l[0].toUpperCase() + l.slice(1), sub: { low: 'Fastest replies', medium: 'Balanced', high: 'Deepest reasoning, slower' }[l], checked: (S.settings.thinkLevel || 'medium') === l, onClick: async () => { await setSetting({ thinkLevel: l }); root.sync(); } }))], { up: true });
    } else { await setSetting({ thinking: !S.settings.thinking }); root.sync(); }
  };
  $('.model-btn', root).onclick = (e) => modelMenu(e.currentTarget, () => root.sync());
  setTimeout(() => { root.sync(); }, 0);
  return root;
}

function capBadges(m) {
  const c = m.capabilities || [];
  return `<span class="badges">${c.includes('vision') ? '<span class="badge v">Vision</span>' : ''}${c.includes('thinking') ? '<span class="badge t">Thinking</span>' : ''}${c.includes('tools') ? '<span class="badge k">Tools</span>' : ''}</span>`;
}
function modelMenu(anchor, after) {
  if (!S.models.length) {
    showMenu(anchor, [{ label: S.online ? 'No chat models installed' : 'Ollama is not reachable', sub: 'Install with: ollama pull gemma3:12b' }, { label: 'Refresh', icon: 'retry', onClick: () => loadModels() }], { align: 'right', up: true });
    return;
  }
  showMenu(anchor, [
    { header: 'Local models on this PC' },
    ...S.models.map((m) => ({
      label: prettyModel(m.name), checked: m.name === S.model,
      sub: `${m.params || ''}${m.size ? ' · ' + fmtSize(m.size) : ''}${m.contextLength ? ' · ' + Math.round(m.contextLength / 1024) + 'K ctx' : ''} ${capBadges(m)}`,
      onClick: async () => { S.model = m.name; await setSetting({ defaultModel: m.name }); after?.(); },
    })),
    '-',
    { label: 'Refresh model list', icon: 'retry', onClick: () => loadModels(true).then(after) },
    { label: 'Model settings', icon: 'settings', onClick: () => openSettings('models') },
  ], { align: 'right', up: true });
}

// ---------- views ----------
function setView(v) {
  S.view = v;
  closeMenu();
  renderSidebar();
  renderTopbar();
}
function greeting() {
  const h = new Date().getHours();
  const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return S.settings.userName ? `${part}, ${esc(S.settings.userName)}` : `${part}`;
}
const SUGGEST = [
  { icon: 'code', label: 'Code', text: 'Help me write code that ' },
  { icon: 'pen', label: 'Write', text: 'Help me write ' },
  { icon: 'book', label: 'Learn', text: 'Explain to me how ' },
  { icon: 'chart', label: 'Analyze', text: 'Analyze this and give me the key insights: ' },
  { icon: 'wand', label: 'Brainstorm', text: 'Brainstorm ideas for ' },
];

function newChat(projectId = null) {
  if (projectId) return renderProject(projectId);
  S.conv = null; S.projectId = null;
  closeArtifact();
  renderNew();
}
function renderNew() {
  setView('new');
  const wrap = el(`<div class="new-wrap"><div class="greet">${mark(44)}<h1>${greeting()}</h1></div></div>`);
  if (!S.online) {
    const off = el(`<div class="offline">${icon('info', 20)}<div class="grow"><b>Ollama is not running</b><br><span style="color:var(--muted)">XAI could not reach ${esc(S.settings.ollamaUrl)}. Start Ollama and click Retry.</span></div><button class="btn sm">Retry</button></div>`);
    $('button', off).onclick = () => loadModels();
    wrap.append(off);
  }
  const comp = makeComposer();
  S.composer = comp;
  wrap.append(comp);
  const chips = el('<div class="chips"></div>');
  for (const s of SUGGEST) { const c = el(`<button class="chip">${icon(s.icon, 15)}${s.label}</button>`); c.onclick = () => comp.setText(s.text); chips.append(c); }
  wrap.append(chips);
  $('#view').replaceChildren(wrap, el('<div class="credit foot">Developed by Datix AI</div>'));
  setTimeout(() => comp.focus(), 20);
}

async function openConv(id) {
  if (S.gen?.conv.id === id) S.conv = S.gen.conv;
  else {
    const c = await xai.conv.get(id);
    if (!c) { toast('Chat not found'); return refreshConvs(); }
    S.conv = c;
  }
  if (S.conv.model && S.models.some((m) => m.name === S.conv.model)) S.model = S.conv.model;
  closeArtifact();
  renderChat();
}

function renderChat() {
  setView('chat');
  const box = el(`<div class="chat"><div class="msgs"><div class="msgs-inner"></div></div><div class="dock"><button class="to-bottom" hidden>${icon('down', 16)}</button><div class="disclaimer">XAI runs on this PC with local models. Answers can be wrong, so check important facts.<span class="credit">Developed by Datix AI</span></div></div></div>`);
  const comp = makeComposer({ placeholder: 'Reply to XAI...', projectId: S.conv?.projectId });
  S.composer = comp;
  $('.dock', box).insertBefore(comp, $('.disclaimer', box));
  $('#view').replaceChildren(box);
  const scroller = $('.msgs', box);
  const tb = $('.to-bottom', box);
  scroller.addEventListener('scroll', () => { tb.hidden = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 200; });
  tb.onclick = () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  renderMessages();
  scroller.scrollTop = scroller.scrollHeight;
  comp.focus();
}

function renderMessages() {
  const inner = $('.msgs-inner');
  if (!inner || !S.conv) return;
  S.artifacts.clear();
  inner.replaceChildren(...S.conv.messages.map((m, i) => msgEl(m, i)));
}

function msgEl(m, i) {
  if (m.role === 'user') {
    const n = el(`<div class="msg user" data-i="${i}"></div>`);
    const imgs = (m.attachments || []).filter((a) => a.kind === 'image');
    const docs = (m.attachments || []).filter((a) => a.kind === 'text');
    if (imgs.length || docs.length) {
      const ua = el('<div class="u-atts"></div>');
      for (const a of imgs) { const im = el(`<img src="data:${a.mime};base64,${a.data}" title="${esc(a.name)}">`); im.onclick = () => lightbox(im.src); ua.append(im); }
      for (const a of docs) ua.append(el(`<div class="att" title="${esc(a.name)}"><div class="fi">${esc((a.name.split('.').pop() || 'TXT').slice(0, 4).toUpperCase())}</div><div class="an"><b>${esc(a.name)}</b><span>${(a.text || '').split('\n').length} lines</span></div></div>`));
      n.append(ua);
    }
    if (m.content) n.append(el(`<div class="bubble">${esc(m.content)}</div>`));
    const acts = el(`<div class="actions"><button class="ibtn" title="Copy">${icon('copy', 15)}</button><button class="ibtn" title="Edit">${icon('edit', 15)}</button></div>`);
    const [cp, ed] = $$('button', acts);
    cp.onclick = () => copy(m.content, cp);
    ed.onclick = () => editUser(i, n);
    n.append(acts);
    return n;
  }
  const n = el(`<div class="msg ai" data-i="${i}"><div class="ai-av">${mark(26)}</div><div class="ai-body"><details class="think" hidden><summary>${icon('bulb', 15)}<span class="ts"></span>${icon('chev', 15).replace('class="ic"', 'class="ic chev"')}</summary><div class="tt"></div></details><div class="md"></div><div class="typing" hidden><i></i><i></i><i></i></div><div class="tail"></div><div class="actions"></div></div></div>`);
  $('details', n).addEventListener('toggle', (e) => { m._open = e.currentTarget.open; });
  fillAi(n, m, i);
  return n;
}

function fillAi(n, m, i) {
  const streaming = !!m.streaming;
  $('.ai-av', n).classList.toggle('busy', streaming);
  const d = $('details', n);
  if (m.thinking) {
    d.hidden = false;
    if (m._open != null && d.open !== m._open) d.open = m._open;
    const thinkingNow = streaming && !m.content;
    const secs = m.thinkMs ? Math.max(1, Math.round(m.thinkMs / 1000)) : null;
    $('.ts', d).className = 'ts' + (thinkingNow ? ' shimmer' : '');
    $('.ts', d).textContent = thinkingNow ? 'Thinking...' : secs ? `Thought for ${secs} s` : 'Thought process';
    const tt = $('.tt', d);
    const atEnd = tt.scrollHeight - tt.scrollTop - tt.clientHeight < 30;
    tt.textContent = m.thinking;
    if (atEnd) tt.scrollTop = tt.scrollHeight;
  } else d.hidden = true;
  const md = $('.md', n);
  renderMd(md, m.content, {
    key: i, streaming,
    autoOpen: (key) => { if (S.gen && S.gen.autoOpened !== key) { S.gen.autoOpened = key; openArtifact(key); } },
  });
  $('.typing', n).hidden = !(streaming && !m.content && !m.thinking);
  const tail = $('.tail', n);
  tail.innerHTML = '';
  if (m.error) {
    const e = el(`<div class="err">${icon('info', 18)}<div class="grow">${esc(m.error)}</div><button class="btn sm">Retry</button></div>`);
    $('button', e).onclick = () => regenerate(i);
    tail.append(e);
  } else if (m.stopped) tail.append(el('<div class="stopped">Stopped by you</div>'));
  const acts = $('.actions', n);
  acts.innerHTML = '';
  if (!streaming) {
    const cp = el(`<button class="ibtn" title="Copy">${icon('copy', 15)}</button>`);
    cp.onclick = () => copy(m.content, cp);
    const rg = el(`<button class="ibtn" title="Retry">${icon('retry', 15)}</button>`);
    rg.onclick = () => regenerate(i);
    acts.append(cp, rg);
    const st = m.stats;
    const tps = st?.evalMs ? (st.evalCount / (st.evalMs / 1000)).toFixed(1) + ' tok/s · ' : '';
    acts.append(el(`<span class="stats">${esc(prettyModel(m.model))}${st ? ' · ' + tps + (st.evalCount || 0) + ' tokens' : ''}</span>`));
  }
}

function lightbox(src) { const lb = el(`<div class="lightbox"><img src="${src}"></div>`); lb.onclick = () => lb.remove(); document.body.append(lb); }

let rafPending = false;
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const g = S.gen;
    if (!g || S.view !== 'chat' || S.conv !== g.conv) return;
    const i = g.conv.messages.indexOf(g.msg);
    const node = $(`.msg[data-i="${i}"]`);
    const sc = $('.msgs');
    const stick = sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120;
    if (node) fillAi(node, g.msg, i);
    if (stick) sc.scrollTop = sc.scrollHeight;
  });
}

// ---------- sending / generation ----------
const titleFrom = (t) => { t = t.replace(/\s+/g, ' ').trim(); return t.length > 48 ? t.slice(0, 46).trim() + '...' : t || 'New chat'; };

async function send(text, atts, projectId) {
  if (!S.model) { toast('No local model is available. Start Ollama, then try again.', 'error'); return false; }
  if (atts.some((a) => a.kind === 'image') && !has('vision')) {
    const v = S.models.find((m) => m.capabilities.includes('vision'));
    toast(`${prettyModel(S.model)} cannot read images.${v ? ' Switch to ' + prettyModel(v.name) + ' from the model menu.' : ''}`, 'error');
    return false;
  }
  let conv = S.conv;
  if (!conv) {
    conv = { id: uid(), title: titleFrom(text || atts[0]?.name || 'New chat'), projectId: projectId || null, model: S.model, messages: [], created: Date.now() };
  }
  conv.messages.push({ role: 'user', content: text.trim(), attachments: atts, ts: Date.now() });
  conv.model = S.model;
  S.conv = conv;
  await persist(conv);
  renderChat();
  generate(conv);
  return true;
}

async function persist(conv) {
  conv.updated = Date.now();
  const clean = { ...conv, messages: conv.messages.map(({ _open, ...m }) => m) };
  await xai.conv.save(clean);
  await refreshConvs();
}

function systemPrompt(conv) {
  let s = `You are XAI, a capable, warm and honest AI assistant. You run fully offline on the user's own Windows PC through the local model "${prettyModel(S.model)}". Today is ${new Date().toDateString()}.
Use Markdown formatting. Put code in fenced code blocks with a language tag. When the user asks for a complete web page, app, game, SVG graphic, document or a long program, deliver it as ONE complete fenced code block (for web pages use \`\`\`html with a full HTML document including its CSS and JavaScript) so it can open in the side preview panel.
You do not have internet access. If you are unsure about something, say so instead of guessing.`;
  if (S.settings.userName) s += `\nThe user's name is ${S.settings.userName}.`;
  if (S.settings.preferences?.trim()) s += `\n\nThe user's personal preferences:\n${S.settings.preferences.trim()}`;
  const st = STYLES[S.settings.style];
  if (st?.p) s += `\n\nResponse style: ${st.p}`;
  const p = conv.projectId && S.projects.find((x) => x.id === conv.projectId);
  if (p) {
    s += `\n\nThis chat belongs to the project "${p.name}".${p.description ? ' Project description: ' + p.description : ''}`;
    if (p.instructions?.trim()) s += `\nProject instructions (follow them):\n${p.instructions.trim()}`;
    if (p.files?.length) s += `\n\nProject knowledge files:\n` + p.files.map((f) => `<document name="${f.name}">\n${f.text}\n</document>`).join('\n\n');
  }
  return s;
}

function buildBody(conv, model) {
  const info = modelInfo(model);
  const messages = [{ role: 'system', content: systemPrompt(conv) }];
  for (const m of conv.messages) {
    if (m.streaming) continue;
    if (m.role === 'assistant') { if (!m.error && m.content) messages.push({ role: 'assistant', content: m.content }); continue; }
    let content = m.content || '';
    const docs = (m.attachments || []).filter((a) => a.kind === 'text');
    if (docs.length) content = docs.map((a) => `<document name="${a.name}">\n${a.text}\n</document>`).join('\n\n') + (content ? '\n\n' + content : '\n\nPlease review the attached document.');
    const o = { role: 'user', content };
    const images = (m.attachments || []).filter((a) => a.kind === 'image').map((a) => a.data);
    if (images.length && info.capabilities.includes('vision')) { o.images = images; if (!content) o.content = 'Describe this image.'; }
    messages.push(o);
  }
  const body = { model, messages, keep_alive: S.settings.keepAlive, options: { temperature: +S.settings.temperature, num_ctx: +S.settings.numCtx } };
  if (info.capabilities.includes('thinking')) body.think = leveled(model) ? S.settings.thinkLevel || 'medium' : !!S.settings.thinking;
  return body;
}

async function generate(conv) {
  const model = S.model;
  const msg = { role: 'assistant', content: '', thinking: '', model, ts: Date.now(), streaming: true };
  conv.messages.push(msg);
  const reqId = uid();
  S.gen = { reqId, conv, msg };
  if (S.view === 'chat' && S.conv === conv) {
    $('.msgs-inner')?.append(msgEl(msg, conv.messages.length - 1));
    const sc = $('.msgs'); if (sc) sc.scrollTop = sc.scrollHeight;
  }
  S.composer?.sync();
  renderSidebar();
  const r = await xai.stream({ reqId, body: buildBody(conv, model) });
  msg.streaming = false;
  if (msg.thinking && !msg.thinkMs && msg.thinkStart) msg.thinkMs = Date.now() - msg.thinkStart;
  if (!r.ok) msg.error = friendlyError(r.error, model);
  if (r.aborted) msg.stopped = true;
  S.gen = null;
  await persist(conv);
  if (S.view === 'chat' && S.conv === conv) {
    const i = conv.messages.indexOf(msg);
    const node = $(`.msg[data-i="${i}"]`);
    if (node) fillAi(node, msg, i);
  }
  S.composer?.sync();
  const firstReply = conv.messages.filter((m) => m.role === 'assistant').length === 1;
  if (firstReply && !msg.error && msg.content && S.settings.autoTitle) autoTitle(conv, model);
}

function friendlyError(e, model) {
  if (/fetch failed|ECONNREFUSED/i.test(e)) return 'Could not reach Ollama. Make sure it is running, then retry.';
  if (/not found/i.test(e)) return `Model ${model} was not found in Ollama. Pick another model.`;
  if (/memory|CUDA|out of/i.test(e)) return 'The model ran out of memory. Try a smaller model or a shorter context length in Settings.';
  return e;
}

xai.onChunk((d) => {
  const g = S.gen;
  if (!g || g.reqId !== d.reqId) return;
  if (d.thinking) { if (!g.msg.thinkStart) g.msg.thinkStart = Date.now(); g.msg.thinking += d.thinking; }
  if (d.content) {
    if (g.msg.thinkStart && !g.msg.thinkMs) g.msg.thinkMs = Date.now() - g.msg.thinkStart;
    g.msg.content += d.content;
  }
  if (d.stats) g.msg.stats = d.stats;
  scheduleRender();
});

async function autoTitle(conv, model) {
  const first = conv.messages.find((m) => m.role === 'user');
  const reply = conv.messages.find((m) => m.role === 'assistant');
  const body = {
    model, keep_alive: S.settings.keepAlive, options: { temperature: 0.2, num_ctx: +S.settings.numCtx },
    messages: [{ role: 'user', content: `Write a short, specific title of 2 to 6 words for this conversation. Reply with the title only, no quotes, no trailing punctuation.\n\nUser: ${(first.content || first.attachments?.[0]?.name || '').slice(0, 1000)}\n\nAssistant: ${reply.content.slice(0, 600)}` }],
  };
  if (has('thinking', model)) body.think = leveled(model) ? 'low' : false;
  let t = await xai.once(body);
  t = (t || '').replace(/<think>[\s\S]*?<\/think>/g, '').split('\n').map((x) => x.trim()).find(Boolean) || '';
  t = t.replace(/^(title:\s*)/i, '').replace(/^["'#*\s]+|["'.*\s]+$/g, '').slice(0, 70);
  if (t) await patchConv(conv.id, { title: t });
}

async function regenerate(i) {
  if (S.gen) return toast('Wait for the current reply to finish.');
  const conv = S.conv;
  conv.messages = conv.messages.slice(0, i);
  if (conv.messages[conv.messages.length - 1]?.role !== 'user') return;
  closeArtifact();
  renderMessages();
  generate(conv);
}

function editUser(i, node) {
  if (S.gen) return toast('Wait for the current reply to finish.');
  const m = S.conv.messages[i];
  const b = $('.bubble', node) || node.appendChild(el('<div class="bubble"></div>'));
  b.classList.add('editing');
  b.innerHTML = '<textarea></textarea><div class="edit-acts"><button class="btn sm ghost">Cancel</button><button class="btn sm primary">Save and send</button></div>';
  const ta = $('textarea', b);
  ta.value = m.content;
  ta.style.height = Math.min(ta.scrollHeight + 4, 360) + 'px';
  ta.focus();
  const [cancel, save] = $$('button', b);
  cancel.onclick = () => renderMessages();
  save.onclick = () => {
    m.content = ta.value.trim();
    S.conv.messages = S.conv.messages.slice(0, i + 1);
    closeArtifact();
    renderMessages();
    generate(S.conv);
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save.click(); } if (e.key === 'Escape') cancel.click(); });
}

// ---------- artifacts ----------
function openArtifact(key) {
  const a = S.artifacts.get(key);
  if (!a) return;
  S.artifact = a;
  S.artTab = PREVIEW.has(a.lang) && !a.writing ? 'preview' : 'code';
  document.body.classList.add('art-open');
  $('#artifact').hidden = false;
  $('#resizer').hidden = false;
  drawArtifact(true);
  $$('.art-card').forEach((c) => c.classList.remove('active'));
  renderTopbar();
}
function closeArtifact() {
  S.artifact = null;
  document.body.classList.remove('art-open');
  $('#artifact').hidden = true;
  $('#resizer').hidden = true;
  $$('.art-card').forEach((c) => c.classList.remove('active'));
}
let artTimer;
function refreshArtifact(a) {
  const wasWriting = S.artifact.writing;
  S.artifact = a;
  if (S.artTab === 'code') drawArtifact(false);
  else if (wasWriting && !a.writing) drawArtifact(true);
  else { clearTimeout(artTimer); artTimer = setTimeout(() => drawArtifact(true), 900); }
  if (wasWriting && !a.writing && PREVIEW.has(a.lang)) { S.artTab = 'preview'; drawArtifact(true); }
}
function srcdocFor(a) {
  if (a.lang === 'svg') return `<!doctype html><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff">${a.code}</body>`;
  if (/<html|<body|<!doctype/i.test(a.code)) return a.code;
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${a.code}</body></html>`;
}
function drawArtifact(full) {
  const a = S.artifact;
  if (!a) return;
  $('#artIcon').innerHTML = icon(PREVIEW.has(a.lang) ? 'eye' : 'code', 17);
  $('#artTitle').textContent = a.title + (a.writing ? ' (writing...)' : '');
  const tabs = $('#artTabs');
  tabs.hidden = !PREVIEW.has(a.lang);
  tabs.innerHTML = `<button class="${S.artTab === 'preview' ? 'on' : ''}" data-t="preview">Preview</button><button class="${S.artTab === 'code' ? 'on' : ''}" data-t="code">Code</button>`;
  $$('button', tabs).forEach((b) => (b.onclick = () => { S.artTab = b.dataset.t; drawArtifact(true); }));
  const acts = $('#artActs');
  acts.innerHTML = '';
  const cp = el(`<button class="ibtn" title="Copy">${icon('copy', 16)}</button>`); cp.onclick = () => copy(a.code, cp);
  const dl = el(`<button class="ibtn" title="Download">${icon('download', 16)}</button>`);
  dl.onclick = async () => { const ext = EXT[a.lang] || a.lang || 'txt'; if (await xai.files.saveText({ name: a.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.' + ext, content: a.code })) toast('Saved'); };
  const x = el(`<button class="ibtn" title="Close (Esc)">${icon('x', 16)}</button>`); x.onclick = closeArtifact;
  acts.append(cp, dl, x);
  const body = $('#artBody');
  if (S.artTab === 'preview' && PREVIEW.has(a.lang)) {
    if (!full && body.firstElementChild) return;
    if (a.lang === 'md' || a.lang === 'markdown') { const d = el('<div class="md"></div>'); renderMd(d, a.code); body.replaceChildren(d); }
    else { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms allow-popups'); f.srcdoc = srcdocFor(a); body.replaceChildren(f); }
  } else {
    const atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    const pre = el('<pre><code></code></pre>');
    $('code', pre).innerHTML = highlight(a.code, a.lang === 'md' ? 'markdown' : a.lang);
    body.replaceChildren(pre);
    if (a.writing && atEnd) body.scrollTop = body.scrollHeight;
  }
}
(() => {
  const rz = $('#resizer');
  rz.addEventListener('mousedown', (e) => {
    e.preventDefault(); rz.classList.add('drag');
    const ifr = $('#artBody iframe'); if (ifr) ifr.style.pointerEvents = 'none';
    const move = (ev) => { const w = Math.min(Math.max(innerWidth - ev.clientX, 340), innerWidth - 420); document.documentElement.style.setProperty('--art-w', w + 'px'); };
    const up = () => { rz.classList.remove('drag'); if (ifr) ifr.style.pointerEvents = ''; removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });
})();

// ---------- chats page ----------
async function renderChats() {
  setView('chats');
  closeArtifact();
  const pg = el(`<div class="page"><div class="page-inner"><h2>Your chat history<span class="grow"></span><button class="btn primary">${icon('plus', 16)}New chat</button></h2><div class="searchbox">${icon('search')}<input placeholder="Search your chats..."></div><div class="list-meta"></div><div class="rows"></div></div></div>`);
  $('h2 .btn', pg).onclick = () => newChat();
  const input = $('input', pg);
  const draw = async () => {
    const res = await xai.conv.search(input.value);
    $('.list-meta', pg).textContent = input.value ? `${res.length} results` : `You have ${S.convs.length} chats with XAI`;
    const rows = $('.rows', pg);
    rows.replaceChildren(...res.map((c) => {
      const p = c.projectId && S.projects.find((x) => x.id === c.projectId);
      const r = el(`<div class="row"><div class="rm"><div class="rt">${esc(c.title)}</div>${c.snippet ? `<div class="rsn">${esc(c.snippet)}</div>` : ''}<div class="rs">Last message ${rel(c.updated)} · ${esc(prettyModel(c.model))}</div></div>${p ? `<span class="tag">${esc(p.name)}</span>` : ''}${c.starred ? icon('star', 15) : ''}<button class="ibtn">${icon('more', 16)}</button></div>`);
      r.onclick = () => openConv(c.id);
      $('.ibtn', r).onclick = (e) => { e.stopPropagation(); convMenu(e.currentTarget, c.id); };
      return r;
    }));
    if (!res.length) rows.append(el(`<div class="empty">${mark(40)}<div>${input.value ? 'No chats match your search.' : 'No chats yet. Start one!'}</div></div>`));
  };
  input.oninput = debounce(draw, 180);
  $('#view').replaceChildren(pg);
  draw();
  input.focus();
}

// ---------- projects ----------
async function renderProjects() {
  await refreshProjects();
  setView('projects');
  closeArtifact();
  const pg = el(`<div class="page"><div class="page-inner"><h2>Projects<span class="grow"></span><button class="btn primary">${icon('plus', 16)}New project</button></h2><div class="list-meta">Projects keep related chats together, with their own instructions and knowledge files that every chat in the project can use.</div><div class="grid" style="margin-top:16px"></div></div></div>`);
  $('h2 .btn', pg).onclick = createProject;
  const grid = $('.grid', pg);
  for (const p of S.projects) {
    const n = S.convs.filter((c) => c.projectId === p.id).length;
    const c = el(`<div class="card"><div class="ch">${esc(p.name)}</div><div class="cd">${esc(p.description || 'No description')}</div><div class="cf">${n} chats · ${(p.files || []).length} files · Updated ${rel(p.updated)}</div></div>`);
    c.onclick = () => renderProject(p.id);
    grid.append(c);
  }
  if (!S.projects.length) grid.replaceWith(el(`<div class="empty">${mark(44)}<div>No projects yet. Create one to organise chats with shared instructions and files.</div></div>`));
  $('#view').replaceChildren(pg);
}
function createProject() {
  const f = el(`<div><div class="field"><label>What are you working on?</label><input type="text" placeholder="Name your project"></div><div class="field"><label>What are you trying to achieve?</label><textarea placeholder="Describe your project, goals, subject, etc." rows="4"></textarea></div></div>`);
  modal({
    title: 'Create a project', body: f, actions: [{ label: 'Cancel' }, {
      label: 'Create project', primary: true, onClick: async (close) => {
        const name = $('input', f).value.trim();
        if (!name) return $('input', f).focus();
        const p = await xai.projects.save({ name, description: $('textarea', f).value.trim(), instructions: '', files: [] });
        close(); await refreshProjects(); renderProject(p.id);
      },
    }],
  });
  setTimeout(() => $('input', f).focus(), 30);
}
async function saveProject(p) { await xai.projects.save(p); await refreshProjects(); }

async function renderProject(id) {
  await refreshProjects();
  const p = S.projects.find((x) => x.id === id);
  if (!p) return renderProjects();
  S.projectId = id; S.conv = null;
  setView('project');
  closeArtifact();
  const crumb = $('#crumb');
  const a = el(`<a>${icon('folder', 15)}</a>`); a.title = 'All projects'; a.onclick = renderProjects;
  crumb.append(a, el(`<span>/</span>`), el(`<span class="ct">${esc(p.name)}</span>`));
  const pg = el(`<div class="page"><div class="page-inner"><div class="proj"><div>
      <h2>${esc(p.name)}<span class="grow"></span><button class="ibtn">${icon('more', 18)}</button></h2>
      <p style="color:var(--muted);margin:-10px 0 18px">${esc(p.description || '')}</p>
      <div class="pc"></div><div class="rows" style="margin-top:22px"></div></div>
      <div><div class="side-card"><h4>Instructions<span class="grow"></span><button class="ibtn" title="Edit">${icon('edit', 15)}</button></h4><p class="ins"></p></div>
      <div class="side-card"><h4>Knowledge<span class="grow"></span><button class="ibtn" title="Add files">${icon('plus', 16)}</button></h4><div class="kf"></div><div class="meter"><i></i></div><div class="km" style="font-size:12px;color:var(--faint);margin-top:6px"></div></div></div>
    </div></div></div>`);
  const comp = makeComposer({ placeholder: `Start a chat in ${p.name}...`, projectId: id });
  S.composer = comp;
  $('.pc', pg).append(comp);
  $('h2 .ibtn', pg).onclick = (e) => showMenu(e.currentTarget, [
    { label: 'Edit details', icon: 'edit', onClick: async () => { const n = await askText('Project name', p.name); if (n?.trim()) { p.name = n.trim(); const d = await askText('Description', p.description || '', { multiline: true }); if (d != null) p.description = d.trim(); await saveProject(p); renderProject(id); } } },
    '-',
    { label: 'Delete project', icon: 'trash', danger: true, onClick: async () => { if (await confirmBox('Delete project?', `"${p.name}" and all of its chats will be permanently deleted.`)) { await xai.projects.del(id); await refreshConvs(); renderProjects(); } } },
  ], { align: 'right' });
  $('.ins', pg).textContent = p.instructions || 'Add instructions to tailor XAI\'s responses in this project.';
  $$('.side-card .ibtn', pg)[0].onclick = async () => {
    const t = await askText('Project instructions', p.instructions || '', { multiline: true, label: 'How should XAI behave in this project?', placeholder: 'e.g. Answer as a senior Python engineer. Use type hints. Keep explanations short.' });
    if (t != null) { p.instructions = t; await saveProject(p); renderProject(id); }
  };
  $$('.side-card .ibtn', pg)[1].onclick = async () => {
    const files = await xai.files.pick({ textOnly: true });
    let added = 0;
    for (const f of files) { if (f.error) toast(f.error, 'error'); else if (f.kind === 'text') { (p.files ||= []).push({ name: f.name, text: f.text }); added++; } else toast(`${f.name}: only text documents can be project knowledge`, 'error'); }
    if (added) { await saveProject(p); renderProject(id); }
  };
  const kf = $('.kf', pg);
  const total = (p.files || []).reduce((s, f) => s + f.text.length, 0);
  for (const [i, f] of (p.files || []).entries()) {
    const r = el(`<div class="kfile">${icon('file', 15)}<span title="${esc(f.name)}">${esc(f.name)}</span><button class="ibtn" title="Remove">${icon('x', 14)}</button></div>`);
    $('button', r).onclick = async () => { p.files.splice(i, 1); await saveProject(p); renderProject(id); };
    kf.append(r);
  }
  if (!p.files?.length) kf.append(el('<p>Add PDFs, documents or code that XAI should know about in this project.</p>'));
  const ctxTokens = +S.settings.numCtx;
  const pct = Math.min(100, Math.round((total / 4 / ctxTokens) * 100));
  $('.meter i', pg).style.width = pct + '%';
  $('.km', pg).textContent = `${pct}% of the ${Math.round(ctxTokens / 1024)}K context window`;
  const rows = $('.rows', pg);
  const convs = S.convs.filter((c) => c.projectId === id);
  for (const c of convs) {
    const r = el(`<div class="row"><div class="rm"><div class="rt">${esc(c.title)}</div><div class="rs">Last message ${rel(c.updated)}</div></div><button class="ibtn">${icon('more', 16)}</button></div>`);
    r.onclick = () => openConv(c.id);
    $('.ibtn', r).onclick = (e) => { e.stopPropagation(); convMenu(e.currentTarget, c.id); };
    rows.append(r);
  }
  if (!convs.length) rows.append(el('<div class="list-meta" style="text-align:center;padding:20px">Start a chat to keep conversations organised and reuse project knowledge.</div>'));
  $('#view').replaceChildren(pg);
  comp.focus();
}

// ---------- search (Ctrl+K) ----------
function openSearch() {
  closeMenu();
  const ov = el(`<div class="overlay"><div class="modal search-modal"><div class="searchbox">${icon('search')}<input placeholder="Search chats and projects..."></div><div class="results"></div></div></div>`);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) ov.remove(); });
  document.body.append(ov);
  const input = $('input', ov), box = $('.results', ov);
  let items = [], sel = 0;
  const go = (it) => { ov.remove(); it.run(); };
  const draw = async () => {
    const q = input.value.trim().toLowerCase();
    const convs = (await xai.conv.search(q)).slice(0, 30);
    const projs = S.projects.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 5);
    items = [
      ...(!q ? [{ title: 'New chat', sub: 'Ctrl+N', icon: 'plus', run: () => newChat() }] : []),
      ...projs.map((p) => ({ title: p.name, sub: 'Project', icon: 'folder', run: () => renderProject(p.id) })),
      ...convs.map((c) => ({ title: c.title, sub: c.snippet || rel(c.updated), icon: 'chat', run: () => openConv(c.id) })),
    ];
    sel = 0;
    box.replaceChildren(...items.map((it, i) => {
      const r = el(`<div class="row ${i === sel ? 'sel' : ''}">${icon(it.icon, 16)}<div class="rm"><div class="rt">${esc(it.title)}</div><div class="rs">${esc(it.sub)}</div></div></div>`);
      r.onclick = () => go(it);
      return r;
    }));
    if (!items.length) box.append(el('<div class="empty">No results</div>'));
  };
  input.oninput = debounce(draw, 120);
  input.onkeydown = (e) => {
    const rows = $$('.row', box);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('sel', i === sel));
      rows[sel]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && items[sel]) go(items[sel]);
    else if (e.key === 'Escape') ov.remove();
  };
  draw();
  input.focus();
}

// ---------- settings ----------
async function openSettings(tab = 'general') {
  closeMenu();
  const ov = modal({ cls: 'wide', title: 'Settings', body: '' });
  const m = $('.modal', ov);
  $('.m-body', ov).remove();
  const wrap = el(`<div class="settings"><div class="s-nav"></div><div class="s-body"></div></div>`);
  m.append(wrap);
  const tabs = [['general', 'General', 'user'], ['models', 'Models', 'chip'], ['appearance', 'Appearance', 'palette'], ['shortcuts', 'Shortcuts', 'key'], ['about', 'About', 'info']];
  const nav = $('.s-nav', wrap), body = $('.s-body', wrap);
  const show = async (t) => {
    nav.replaceChildren(...tabs.map(([k, label, ic]) => { const b = el(`<button class="${k === t ? 'on' : ''}">${icon(ic, 16)}${label}</button>`); b.onclick = () => show(k); return b; }));
    body.innerHTML = '';
    await SETTINGS_PAGES[t](body);
  };
  show(tab);
}
const field = (label, hint, inner) => el(`<div class="field"><label>${label}</label>${hint ? `<div class="hint">${hint}</div>` : ''}${inner}</div>`);
function toggleRow(title, sub, checked, onChange) {
  const r = el(`<label class="toggle-row"><div><b>${title}</b><span>${sub}</span></div><span class="switch"><input type="checkbox" ${checked ? 'checked' : ''}><i></i></span></label>`);
  $('input', r).onchange = (e) => onChange(e.target.checked);
  return r;
}
const SETTINGS_PAGES = {
  async general(b) {
    b.append(el('<h4>Profile</h4>'));
    const name = field('What should XAI call you?', '', `<input type="text" placeholder="Your name" value="${esc(S.settings.userName)}">`);
    $('input', name).onchange = async (e) => { await setSetting({ userName: e.target.value.trim() }); renderSidebar(); };
    const pref = field('Personal preferences', 'XAI will consider these in every chat. For example: "I am a data scientist. Prefer Python and concise answers."', `<textarea rows="5"></textarea>`);
    $('textarea', pref).value = S.settings.preferences || '';
    $('textarea', pref).onchange = (e) => setSetting({ preferences: e.target.value });
    b.append(name, pref);
    b.append(toggleRow('Send with Enter', 'Shift+Enter adds a new line. When off, use Ctrl+Enter to send.', S.settings.sendOnEnter !== false, (v) => setSetting({ sendOnEnter: v })));
    b.append(toggleRow('Auto-name chats', 'Use the current model to write a short title after the first reply.', S.settings.autoTitle !== false, (v) => setSetting({ autoTitle: v })));
  },
  async models(b) {
    b.append(el('<h4>Ollama connection</h4>'));
    const url = field('Server address', 'Use http://127.0.0.1:11434 for this PC, or another office PC address on your network.', `<div class="inline"><input type="text" class="input" value="${esc(S.settings.ollamaUrl)}"><button class="btn">Test</button></div>`);
    const [inp, test] = [$('input', url), $('button', url)];
    test.onclick = async () => { const v = await xai.ping(inp.value.trim()); toast(v ? `Connected to Ollama ${v}` : 'Could not connect', v ? '' : 'error'); };
    inp.onchange = async () => { await setSetting({ ollamaUrl: inp.value.trim() || 'http://127.0.0.1:11434' }); loadModels(true); };
    b.append(url);
    const temp = field('Temperature', 'Lower is more focused and predictable, higher is more creative.', `<div class="range"><input type="range" min="0" max="1.5" step="0.05" value="${S.settings.temperature}"><b>${(+S.settings.temperature).toFixed(2)}</b></div>`);
    $('input', temp).oninput = (e) => ($('b', temp).textContent = (+e.target.value).toFixed(2));
    $('input', temp).onchange = (e) => setSetting({ temperature: +e.target.value });
    const ctxOpts = [4096, 8192, 16384, 32768, 65536, 131072];
    const ctx = field('Context length', 'How much of the conversation and files the model can see. Bigger uses more GPU memory.', `<select>${ctxOpts.map((v) => `<option value="${v}" ${+S.settings.numCtx === v ? 'selected' : ''}>${v / 1024}K tokens</option>`).join('')}</select>`);
    $('select', ctx).onchange = (e) => setSetting({ numCtx: +e.target.value });
    const ka = field('Keep model loaded for', 'Keeping a model in GPU memory makes the next reply start instantly.', `<select>${[['5m', '5 minutes'], ['15m', '15 minutes'], ['1h', '1 hour'], ['-1', 'Always'], ['0', 'Unload right away']].map(([v, l]) => `<option value="${v}" ${S.settings.keepAlive === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
    $('select', ka).onchange = (e) => setSetting({ keepAlive: e.target.value });
    b.append(temp, ctx, ka);
    b.append(el('<h4 style="margin-top:26px">Installed models</h4>'));
    const loaded = (await xai.ps()) || [];
    const list = el('<div></div>');
    for (const m of S.models) {
      const live = loaded.find((x) => x.name === m.name);
      const r = el(`<div class="mrow">${mark(22)}<div class="grow"><div class="mn">${esc(prettyModel(m.name))} ${m.name === S.model ? '<span class="tag">Default</span>' : ''}</div><div class="ms">${esc(m.family || '')} · ${esc(m.params || '')} · ${esc(m.quant || '')} · ${fmtSize(m.size)}${m.contextLength ? ' · ' + Math.round(m.contextLength / 1024) + 'K max context' : ''}</div></div>${live ? '<span class="badge live">In GPU memory</span>' : ''}${capBadges(m)}<button class="btn sm">Use</button></div>`);
      $('button', r).onclick = async () => { S.model = m.name; await setSetting({ defaultModel: m.name }); S.composer?.sync(); SETTINGS_PAGES.models(b.replaceChildren() || b); };
      list.append(r);
    }
    if (!S.models.length) list.append(el('<p style="color:var(--muted)">No chat models found. Start Ollama, then install one, for example: <code>ollama pull gemma3:12b</code></p>'));
    b.append(list);
    const more = el(`<div class="inline" style="margin-top:14px"><button class="btn">${icon('retry', 15)}Refresh</button><button class="btn ghost">${icon('ext', 15)}Browse more models</button></div>`);
    const [rf, br] = $$('button', more);
    rf.onclick = async () => { await loadModels(true); b.replaceChildren(); SETTINGS_PAGES.models(b); };
    br.onclick = () => xai.openExternal('https://ollama.com/library');
    b.append(more);
  },
  async appearance(b) {
    b.append(el('<h4>Theme</h4>'));
    const t = el('<div class="themes"></div>');
    for (const [k, l, c] of [['light', 'Light', 'l'], ['dark', 'Dark', 'd'], ['system', 'Match system', 's']]) {
      const o = el(`<button class="theme-opt ${S.settings.theme === k ? 'on' : ''}"><div class="tp ${c}"></div>${l}</button>`);
      o.onclick = async () => { await setSetting({ theme: k }); applyTheme(); $$('.theme-opt', t).forEach((x) => x.classList.remove('on')); o.classList.add('on'); };
      t.append(o);
    }
    b.append(t);
  },
  async shortcuts(b) {
    b.append(el('<h4>Keyboard shortcuts</h4>'));
    const rows = [['New chat', 'Ctrl+N'], ['Search chats', 'Ctrl+K'], ['Toggle sidebar', 'Ctrl+B'], ['Settings', 'Ctrl+,'], ['Stop generating / close panel', 'Esc'], ['New line', 'Shift+Enter'], ['Show XAI from anywhere', S.settings.quickShortcut || 'Off']];
    for (const [a, k] of rows) b.append(el(`<div class="mrow"><div class="grow">${a}</div><kbd style="font-size:12px;padding:2px 8px">${esc(k)}</kbd></div>`));
    const q = field('Global shortcut', 'Brings XAI to the front from any app. Example: Ctrl+Alt+Space. Leave empty to turn off.', `<input type="text" value="${esc(S.settings.quickShortcut || '')}">`);
    q.style.marginTop = '20px';
    $('input', q).onchange = (e) => setSetting({ quickShortcut: e.target.value.trim() });
    b.append(q);
  },
  async about(b) {
    b.append(el(`<div style="text-align:center;padding:26px 0 10px">${logo(84)}<h2 style="font:700 30px var(--font);letter-spacing:3px;margin:14px 0 2px"><span class="brand-name">XAI</span></h2><div style="color:var(--muted)">Your private AI, running on your own PC</div><div style="color:var(--faint);font-size:12.5px;margin-top:8px">Version ${esc(S.settings.version)} · Ollama ${esc(S.version || 'offline')}</div></div>`));
    b.append(el(`<div class="side-card" style="margin-top:14px"><h4>${icon('bolt', 16)}&nbsp;Private by design</h4><p>Every chat, file and project stays on this computer. Replies are generated by local models through Ollama. Nothing is sent to the cloud.</p></div>`));
    const d = el(`<div class="inline"><button class="btn">${icon('folder', 15)}Open data folder</button></div>`);
    $('button', d).onclick = () => xai.openData();
    b.append(d);
    b.append(el('<div style="text-align:center;color:var(--faint);font-size:12px;margin-top:26px">Developed by Datix AI</div>'));
  },
};

// ---------- onboarding ----------
function onboarding() {
  const f = el(`<div style="text-align:center;padding:10px 6px 0">${logo(72)}<h2 style="font:400 28px var(--serif);margin:16px 0 6px">Welcome to <span class="brand-name" style="font-family:var(--font);font-weight:750;letter-spacing:2px">XAI</span></h2><p style="color:var(--muted);margin:0 0 18px">A private AI assistant powered by the models on this PC. No cloud, no limits, no data leaving your machine.</p><div class="field" style="text-align:left"><label>What should XAI call you?</label><input type="text" placeholder="Your name"></div></div>`);
  modal({ body: f, actions: [{ label: 'Get started', primary: true, onClick: async (c) => { await setSetting({ userName: $('input', f).value.trim(), onboarded: true }); c(); renderSidebar(); if (S.view === 'new') renderNew(); } }] });
  setTimeout(() => $('input', f).focus(), 40);
}

// ---------- drag and drop ----------
let dragDepth = 0;
addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('#dropzone').hidden = false; } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropzone').hidden = true; } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('#dropzone').hidden = true;
  const paths = [...(e.dataTransfer?.files || [])].map((f) => xai.pathFor(f)).filter(Boolean);
  if (!paths.length) return;
  if (!S.composer || !S.composer.isConnected) newChat();
  S.composer.addFiles(await xai.files.read(paths));
});

// ---------- keyboard ----------
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.ctrlKey && !e.shiftKey && k === 'n') { e.preventDefault(); newChat(); }
  else if (e.ctrlKey && k === 'k') { e.preventDefault(); openSearch(); }
  else if (e.ctrlKey && k === 'b') { e.preventDefault(); toggleSidebar(); }
  else if (e.ctrlKey && k === ',') { e.preventDefault(); openSettings(); }
  else if (e.key === 'Escape') {
    if (menuEl) return closeMenu();
    const ov = $$('.overlay').pop(); if (ov) return ov.remove();
    if ($('.lightbox')) return $('.lightbox').remove();
    if (S.gen && S.view === 'chat' && S.conv === S.gen.conv) return xai.stop(S.gen.reqId);
    if (S.artifact) return closeArtifact();
  } else if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1 && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !$('.overlay') && S.composer?.isConnected) {
    S.composer.focus();
  }
});
function toggleSidebar() {
  const sb = $('#sidebar');
  sb.classList.toggle('collapsed');
  setSetting({ sidebarCollapsed: sb.classList.contains('collapsed') });
}

// ---------- boot ----------
(async function init() {
  S.settings = await xai.settings.get();
  applyTheme();
  xai.onTheme(applyTheme);
  $('#sbToggle').innerHTML = icon('panel', 18);
  $('#brandLogo').innerHTML = logo(24);
  $('.plusc').innerHTML = icon('plus', 15);
  $('#dzIcon').innerHTML = mark(54);
  $$('[data-ic]').forEach((n) => (n.innerHTML = icon(n.dataset.ic, 18)));
  if (S.settings.sidebarCollapsed) $('#sidebar').classList.add('collapsed');
  $('#sbToggle').onclick = toggleSidebar;
  $('#newChatBtn').onclick = () => newChat();
  $('#searchBtn').onclick = openSearch;
  $('#chatsBtn').onclick = renderChats;
  $('#projectsBtn').onclick = renderProjects;
  $('#userBtn').onclick = () => openSettings();
  xai.onQuick(() => { if (S.view !== 'chat' && S.view !== 'new') newChat(); S.composer?.focus(); });
  await Promise.all([refreshConvs(), refreshProjects()]);
  renderNew();
  await loadModels();
  if (!S.settings.onboarded) onboarding();
})();
