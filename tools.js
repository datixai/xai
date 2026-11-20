// XAI tools: local file access and web access, executed in the main process.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

const SKIP = new Set(['node_modules', '.git', '$recycle.bin', 'system volume information', 'appdata', '.venv', 'venv', '__pycache__', 'windows', 'program files', 'program files (x86)', 'programdata', '$windows.~ws', '$windows.~bt', 'recovery', '.cache', '.npm', '.nuget', '.gradle']);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_OUT = 14000;
const clip = (s, n = MAX_OUT) => (s.length > n ? s.slice(0, n) + `\n\n[truncated, ${s.length - n} more characters]` : s);

function drives() {
  const out = [];
  for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; try { fs.accessSync(d); out.push(d); } catch {} }
  return out;
}
function resolveP(p) {
  p = String(p || '').trim().replace(/^["']|["']$/g, '');
  if (!p) return os.homedir();
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = path.join(os.homedir(), p.slice(1));
  const known = { desktop: 'Desktop', documents: 'Documents', downloads: 'Downloads', pictures: 'Pictures', music: 'Music', videos: 'Videos' };
  if (known[p.toLowerCase()]) p = path.join(os.homedir(), known[p.toLowerCase()]);
  if (/^[a-zA-Z]:$/.test(p)) p += '\\';
  if (/^[a-zA-Z]:[^\\/]/.test(p)) p = p.slice(0, 2) + '\\' + p.slice(2);
  if (!path.isAbsolute(p)) p = path.join(os.homedir(), p);
  return path.normalize(p);
}
const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(1) + ' KB');
const notFound = (p) => {
  const root = path.parse(p).root;
  let hint = '';
  try { fs.accessSync(root); } catch { hint = ` Drive ${root} does not exist on this PC. Available drives: ${drives().join(', ')}. Try search_files to find it.`; }
  return `Not found: ${p}.${hint}`;
};

async function list_directory({ path: p }) {
  const dir = resolveP(p);
  let ents;
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return e.code === 'ENOENT' ? notFound(dir) : `Cannot open ${dir}: ${e.message}`; }
  const rows = [];
  ents.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  for (const e of ents.slice(0, 400)) {
    if (e.isDirectory()) rows.push(`[DIR]  ${e.name}`);
    else { let s = ''; try { const st = await fsp.stat(path.join(dir, e.name)); s = `  (${fmtSize(st.size)}, modified ${st.mtime.toISOString().slice(0, 10)})`; } catch {} rows.push(`[FILE] ${e.name}${s}`); }
  }
  return `Contents of ${dir} (${ents.length} items${ents.length > 400 ? ', first 400 shown' : ''}):\n` + (rows.join('\n') || '(empty folder)');
}

function matcher(q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return () => true;
  if (q.includes('*') || q.includes('?')) {
    const re = new RegExp('^' + q.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    return (n) => re.test(n);
  }
  const words = q.split(/\s+/);
  return (n) => { n = n.toLowerCase(); return words.every((w) => n.includes(w)); };
}
const TEXT_EXT = new Set(['.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.py', '.json', '.html', '.css', '.csv', '.xml', '.yml', '.yaml', '.ini', '.cfg', '.log', '.sql', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.php', '.rb', '.sh', '.ps1', '.bat', '.tex', '.bib', '.toml', '.env', '.ipynb']);

async function search_files({ query = '', folder = '', contains = '', type = 'any' }) {
  const roots = folder ? [resolveP(folder)] : [os.homedir(), ...drives()];
  for (const r of roots) { try { fs.accessSync(r); } catch { if (folder) return notFound(r); } }
  const match = matcher(query);
  const needle = String(contains || '').toLowerCase();
  const results = [];
  const seen = new Set();
  const t0 = Date.now();
  let visited = 0;
  const queue = roots.map((r) => [r, 0]);
  while (queue.length && results.length < 80 && Date.now() - t0 < 20000 && visited < 120000) {
    const [dir, depth] = queue.shift();
    if (seen.has(dir.toLowerCase())) continue;
    seen.add(dir.toLowerCase());
    let ents;
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      visited++;
      const full = path.join(dir, e.name);
      const isDir = e.isDirectory();
      if (isDir) {
        if (SKIP.has(e.name.toLowerCase()) || e.name.startsWith('$')) continue;
        if (e.name.startsWith('.') && !String(query).startsWith('.')) continue;
        if (depth < 9) queue.push([full, depth + 1]);
      }
      if (type === 'folder' && !isDir) continue;
      if (type === 'file' && isDir) continue;
      if (!match(e.name)) continue;
      if (needle) {
        if (isDir || !TEXT_EXT.has(path.extname(e.name).toLowerCase())) continue;
        try { const st = await fsp.stat(full); if (st.size > 2e6) continue; const txt = await fsp.readFile(full, 'utf8'); const i = txt.toLowerCase().indexOf(needle); if (i < 0) continue; results.push(`${full}\n    ...${txt.slice(Math.max(0, i - 60), i + 100).replace(/\s+/g, ' ')}...`); } catch { continue; }
      } else results.push((isDir ? '[DIR]  ' : '[FILE] ') + full);
      if (results.length >= 80) break;
    }
  }
  const where = folder ? resolveP(folder) : 'home folder and all drives';
  if (!results.length) return `No matches for "${query || contains}" in ${where} (searched ${visited} items in ${((Date.now() - t0) / 1000).toFixed(1)} s).`;
  return `Found ${results.length}${results.length >= 80 ? '+' : ''} matches in ${where}:\n` + results.join('\n');
}

async function read_file({ path: p }, readOne) {
  const f = resolveP(p);
  try { const st = await fsp.stat(f); if (st.isDirectory()) return list_directory({ path: f }); } catch (e) { return notFound(f); }
  try {
    const r = await readOne(f);
    if (r.kind === 'image') return `${f} is an image (${r.mime}). Ask the user to attach it in the chat so a vision model can look at it.`;
    return `Contents of ${f}:\n\n` + clip(r.text);
  } catch (e) { return `Cannot read ${f}: ${e.message}`; }
}

async function create_folder({ path: p }) {
  const d = resolveP(p);
  if (fs.existsSync(d)) return `Folder already exists: ${d}`;
  await fsp.mkdir(d, { recursive: true });
  return `Created folder ${d}`;
}

async function write_file({ path: p, content = '', overwrite = false }) {
  const f = resolveP(p);
  if (fs.existsSync(f) && !overwrite) return `File already exists: ${f}. Call again with overwrite=true to replace it.`;
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await fsp.writeFile(f, String(content), 'utf8');
  return `Wrote ${Buffer.byteLength(String(content))} bytes to ${f}`;
}

async function move_path({ from, to }) {
  const a = resolveP(from), b = resolveP(to);
  if (!fs.existsSync(a)) return notFound(a);
  if (fs.existsSync(b)) return `Target already exists: ${b}`;
  await fsp.mkdir(path.dirname(b), { recursive: true });
  await fsp.rename(a, b);
  return `Moved ${a} to ${b}`;
}

async function open_path({ path: p }, _r, shell) {
  const f = resolveP(p);
  if (!fs.existsSync(f)) return notFound(f);
  const err = await shell.openPath(f);
  return err ? `Could not open ${f}: ${err}` : `Opened ${f} on the user's screen`;
}

// ---------- web ----------
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

async function ddg(q) {
  const r = await fetch('https://html.duckduckgo.com/html/', { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'q=' + encodeURIComponent(q), signal: AbortSignal.timeout(15000) });
  const h = await r.text();
  const out = [];
  for (const blk of h.split('class="result__a"').slice(1)) {
    const a = blk.match(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = decode(a[1]);
    const u = url.match(/[?&]uddg=([^&]+)/);
    if (u) url = decodeURIComponent(u[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    if (/duckduckgo\.com\/y\.js/.test(url)) continue;
    const sn = blk.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    out.push({ title: strip(a[2]), url, snippet: sn ? strip(sn[1]) : '' });
    if (out.length >= 8) break;
  }
  return out;
}
async function bing(q) {
  const r = await fetch('https://www.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=en', { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en' }, signal: AbortSignal.timeout(15000) });
  const h = await r.text();
  const out = [];
  for (const blk of h.split('<li class="b_algo"').slice(1)) {
    const a = blk.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const p = blk.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    out.push({ title: strip(a[2]), url: decode(a[1]), snippet: p ? strip(p[1]) : '' });
    if (out.length >= 8) break;
  }
  return out;
}
async function web_search({ query }) {
  if (!query) return 'No query given.';
  let res = [];
  try { res = await ddg(query); } catch {}
  if (!res.length) { try { res = await bing(query); } catch (e) { return `Web search failed: ${e.message}. The PC may be offline.`; } }
  if (!res.length) return `No web results for "${query}".`;
  return `Web results for "${query}" (fetched ${new Date().toISOString().slice(0, 10)}):\n\n` + res.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n') + '\n\nUse fetch_url on the most relevant links to read the full pages before answering, and cite the URLs you used.';
}
async function fetch_url({ url }) {
  if (!/^https?:\/\//i.test(url || '')) return 'Only http and https URLs can be fetched.';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) return `HTTP ${r.status} for ${url}`;
    if (!/text|json|xml/.test(ct)) return `${url} is ${ct || 'a binary file'}; it cannot be read as text.`;
    let t = await r.text();
    if (/html/.test(ct)) {
      const title = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
      t = t.replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr|\/section|\/article)[^>]*>/gi, '\n')
        .replace(/<li[^>]*>/gi, '\n- ').replace(/<h(\d)[^>]*>/gi, '\n\n## ')
        .replace(/<[^>]+>/g, ' ');
      t = decode(t).replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
      if (title) t = `Title: ${strip(title)}\n\n` + t;
    }
    return `Content of ${r.url}:\n\n` + clip(t, 12000);
  } catch (e) { return `Could not fetch ${url}: ${e.message}`; }
}

const IMPL = { list_directory, search_files, read_file, create_folder, write_file, move_path, open_path, web_search, fetch_url };
async function run(name, args, ctx) {
  const fn = IMPL[name];
  if (!fn) return `Unknown tool ${name}`;
  try { return await fn(args || {}, ctx.readOne, ctx.shell); } catch (e) { return `Tool ${name} failed: ${e.message}`; }
}
module.exports = { run, drives };
