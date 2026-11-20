// XAI automated checks. Run: npm test (also runs before every installer build).
// Tests that need Ollama or the internet are skipped when those are not available.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tools = require('../tools.js');
const exec = require('../exec.js');
const { Knowledge } = require('../rag.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xai-test-'));
const ctx = { readOne: async (p) => ({ kind: 'text', name: path.basename(p), text: fs.readFileSync(p, 'utf8') }), shell: { openPath: async () => '' } };
const run = (name, args) => tools.run(name, args, ctx);
const ollamaUp = async () => { try { return (await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };

test('all source files parse', () => {
  for (const f of ['main.js', 'preload.js', 'tools.js', 'mcp.js', 'exec.js', 'rag.js', 'renderer/app.js']) {
    const r = spawnSync(process.execPath, ['--check', path.join(__dirname, '..', f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('no long dashes in app text', () => {
  for (const f of ['renderer/app.js', 'renderer/index.html', 'renderer/quick.html', 'README.md', 'main.js', 'tools.js']) {
    const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(!/[–—]/.test(t), `${f} contains an en or em dash`);
  }
});

test('file tools: create, write, read, list, move, search', async () => {
  const dir = path.join(tmp, 'Alpha Project');
  assert.match(await run('create_folder', { path: dir }), /Created folder/);
  assert.match(await run('create_folder', { path: dir }), /already exists/);
  const f = path.join(dir, 'notes.txt');
  assert.match(await run('write_file', { path: f, content: 'hello falcon drone' }), /Wrote/);
  assert.match(await run('write_file', { path: f, content: 'x' }), /already exists/, 'must not overwrite without overwrite=true');
  assert.equal(fs.readFileSync(f, 'utf8'), 'hello falcon drone');
  assert.match(await run('read_file', { path: f }), /hello falcon drone/);
  assert.match(await run('list_directory', { path: dir }), /\[FILE\] notes\.txt/);
  assert.match(await run('search_files', { query: 'alpha', folder: tmp, type: 'folder' }), /Alpha Project/);
  assert.match(await run('search_files', { query: '*.txt', folder: tmp, contains: 'falcon' }), /notes\.txt/);
  const moved = path.join(tmp, 'moved.txt');
  assert.match(await run('move_path', { from: f, to: moved }), /Moved/);
  assert.ok(fs.existsSync(moved));
});

test('missing paths give a helpful message', async () => {
  const free = 'QWERTYUIOPLKJHGFDSAZXCVBNM'.split('').find((l) => !fs.existsSync(l + ':\\'));
  const r = await run('list_directory', { path: `${free}:\\Nothing` });
  assert.match(r, /Not found/);
  assert.match(r, /does not exist on this PC/);
  assert.match(await run('list_directory', { path: `${free}:Nothing` }), new RegExp(`${free}:\\\\Nothing`), 'drive-relative paths are normalised');
});

test('unknown tool is rejected', async () => {
  assert.match(await run('format_disk', {}), /Unknown tool/);
});

test('PowerShell command tool returns output', async () => {
  const r = await exec.run_command({ command: 'Write-Output "xai-ok"' });
  assert.match(r, /Exit code 0/);
  assert.match(r, /xai-ok/);
});

test('Python tool runs code and captures charts', async (t) => {
  const r = await exec.run_python({ code: 'print(6*7)' });
  if (/not recognized|ENOENT|cannot find/i.test(r.text)) return t.skip('Python not installed');
  assert.match(r.text, /42/);
  const c = await exec.run_python({ code: 'import matplotlib.pyplot as plt\nplt.plot([1,2],[3,4])\nplt.savefig("x.png")' });
  if (/No module named 'matplotlib'/.test(c.text)) return t.skip('matplotlib not installed');
  assert.equal(c.images.length, 1, 'one captured chart, even when saved elsewhere');
});

test('knowledge chunking', () => {
  const kb = new Knowledge(path.join(tmp, 'kb'), () => ({ ollamaUrl: 'http://127.0.0.1:11434' }));
  const parts = kb.chunk('a'.repeat(5000));
  assert.ok(parts.length >= 4 && parts.every((p) => p.length <= 1400));
});

test('knowledge search finds the right document (needs Ollama)', async (t) => {
  if (!(await ollamaUp())) return t.skip('Ollama not running');
  const kb = new Knowledge(path.join(tmp, 'kb2'), () => ({ ollamaUrl: 'http://127.0.0.1:11434' }));
  try {
    await kb.addDocs('p1', [{ name: 'drone.md', text: 'The Falcon drone flies for 38 minutes on one battery. '.repeat(3) }, { name: 'coffee.md', text: 'The coffee machine is on the second floor. '.repeat(3) }]);
  } catch (e) { return t.skip(e.message); }
  const hits = await kb.search('p1', 'how long can the drone fly', 2);
  assert.equal(hits[0].source, 'drone.md');
});

test('web search returns results (set XAI_NET_TESTS=1)', { skip: !process.env.XAI_NET_TESTS }, async () => {
  assert.match(await run('web_search', { query: 'Ollama' }), /https?:\/\//);
});

test('connector manager loads and maps tool names safely', () => {
  const { MCPManager } = require('../mcp.js');
  const m = new MCPManager(path.join(tmp, 'c.json'), path.join(tmp, 'media'));
  m.conns.set('my server', { tools: [{ name: 'make image!', inputSchema: { type: 'object', properties: {} } }], status: 'connected' });
  m.rebuildMap();
  const defs = m.toolDefs();
  assert.equal(defs[0].function.name, 'mcp__my_server__make_image_');
  assert.ok(typeof m.importable() === 'object');
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
