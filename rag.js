// XAI project knowledge: chunk documents, embed them with a local Ollama embedding model, search by meaning.
const fs = require('fs');
const path = require('path');

const TEXT_EXT = new Set(['.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.py', '.json', '.html', '.css', '.csv', '.xml', '.yml', '.yaml', '.ini', '.log', '.sql', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.php', '.rb', '.sh', '.ps1', '.tex', '.bib', '.toml', '.pdf', '.docx', '.ipynb']);
const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next', 'out']);

class Knowledge {
  constructor(dir, getSettings) { this.dir = dir; this.getSettings = getSettings; fs.mkdirSync(dir, { recursive: true }); }
  file(id) { return path.join(this.dir, id.replace(/[^a-zA-Z0-9-]/g, '') + '.json'); }
  load(id) { try { return JSON.parse(fs.readFileSync(this.file(id), 'utf8')); } catch { return { chunks: [], sources: [] }; } }
  saveIdx(id, idx) { fs.writeFileSync(this.file(id), JSON.stringify(idx)); }
  base() { return this.getSettings().ollamaUrl.replace(/\/+$/, ''); }

  async embedModel() {
    const want = this.getSettings().embedModel;
    if (want) return want;
    const { models = [] } = await (await fetch(this.base() + '/api/tags')).json();
    const m = models.find((x) => /nomic-embed/.test(x.name)) || models.find((x) => /embed/.test(x.name));
    if (!m) throw new Error('No embedding model installed. Run: ollama pull nomic-embed-text');
    return m.name;
  }
  async embed(texts) {
    const model = await this.embedModel();
    const out = [];
    for (let i = 0; i < texts.length; i += 32) {
      const r = await fetch(this.base() + '/api/embed', { method: 'POST', body: JSON.stringify({ model, input: texts.slice(i, i + 32), keep_alive: '2m' }) });
      if (!r.ok) throw new Error('Embedding failed: ' + (await r.text()));
      out.push(...(await r.json()).embeddings);
    }
    return { model, vecs: out.map(norm) };
  }
  chunk(text, size = 1400, overlap = 200) {
    const out = [];
    text = text.replace(/\r/g, '');
    for (let i = 0; i < text.length; i += size - overlap) {
      let piece = text.slice(i, i + size);
      if (piece.trim().length > 40) out.push(piece);
      if (i + size >= text.length) break;
    }
    return out;
  }
  async addDocs(id, docs, onProgress) {
    const idx = this.load(id);
    const pieces = [];
    for (const d of docs) {
      idx.chunks = idx.chunks.filter((c) => c.source !== d.name);
      idx.sources = idx.sources.filter((s) => s.name !== d.name);
      const ch = this.chunk(d.text);
      ch.forEach((t) => pieces.push({ source: d.name, text: t }));
      idx.sources.push({ name: d.name, chars: d.text.length, chunks: ch.length, added: Date.now() });
    }
    for (let i = 0; i < pieces.length; i += 64) {
      const batch = pieces.slice(i, i + 64);
      const { model, vecs } = await this.embed(batch.map((p) => p.text));
      batch.forEach((p, j) => idx.chunks.push({ ...p, vec: vecs[j].map((x) => +x.toFixed(5)) }));
      idx.model = model;
      onProgress?.(Math.min(pieces.length, i + 64), pieces.length);
    }
    this.saveIdx(id, idx);
    return { sources: idx.sources.length, chunks: idx.chunks.length };
  }
  async addFolder(id, folder, readOne, onProgress) {
    const docs = [];
    const walk = async (d, depth) => {
      if (depth > 8 || docs.length >= 1500) return;
      let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) await walk(full, depth + 1); continue; }
        if (!TEXT_EXT.has(path.extname(e.name).toLowerCase())) continue;
        try { if (fs.statSync(full).size > 5e6) continue; const r = await readOne(full); if (r.kind === 'text' && r.text.trim()) docs.push({ name: path.relative(path.dirname(folder), full), text: r.text }); } catch {}
      }
    };
    await walk(folder, 0);
    if (!docs.length) return { sources: this.load(id).sources.length, chunks: 0, note: 'No readable documents found.' };
    return this.addDocs(id, docs, onProgress);
  }
  remove(id, name) { const idx = this.load(id); idx.chunks = idx.chunks.filter((c) => c.source !== name); idx.sources = idx.sources.filter((s) => s.name !== name); this.saveIdx(id, idx); }
  drop(id) { try { fs.unlinkSync(this.file(id)); } catch {} }
  info(id) { const idx = this.load(id); return { sources: idx.sources, chunks: idx.chunks.length, model: idx.model }; }
  async search(id, query, k = 6) {
    const idx = this.load(id);
    if (!idx.chunks.length) return [];
    const { vecs } = await this.embed([query]);
    const q = vecs[0];
    return idx.chunks.map((c) => ({ c, s: dot(q, c.vec) })).sort((a, b) => b.s - a.s).slice(0, k).map(({ c, s }) => ({ source: c.source, text: c.text, score: +s.toFixed(3) }));
  }
}
function norm(v) { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); }
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
module.exports = { Knowledge };
