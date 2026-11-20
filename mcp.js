// XAI MCP connector manager: connects to MCP servers (stdio or HTTP) and exposes their tools to local models.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport, getDefaultEnvironment } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

class MCPManager {
  constructor(file, outDir) {
    this.file = file;
    this.outDir = outDir;
    fs.mkdirSync(outDir, { recursive: true });
    try { this.servers = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.servers = {}; }
    this.conns = new Map(); // name -> { client, tools, status, error }
    this.map = new Map(); // ollama tool name -> { server, tool }
  }
  save() { fs.writeFileSync(this.file, JSON.stringify(this.servers, null, 1)); }

  async connect(name) {
    const cfg = this.servers[name];
    await this.disconnect(name);
    if (!cfg || cfg.enabled === false) return;
    const entry = { status: 'connecting', tools: [], error: null };
    this.conns.set(name, entry);
    try {
      let transport;
      if (cfg.url || cfg.type === 'http' || cfg.type === 'sse') {
        const u = new URL(cfg.url);
        const opts = cfg.headers ? { requestInit: { headers: cfg.headers } } : undefined;
        transport = cfg.type === 'sse' ? new SSEClientTransport(u, opts) : new StreamableHTTPClientTransport(u, opts);
      } else {
        transport = new StdioClientTransport({ command: cfg.command, args: cfg.args || [], env: { ...getDefaultEnvironment(), ...(cfg.env || {}) }, cwd: cfg.cwd, stderr: 'ignore' });
      }
      const client = new Client({ name: 'xai-desktop', version: '1.0.0' }, { capabilities: {} });
      await Promise.race([client.connect(transport), new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out connecting')), 30000))]);
      const { tools = [] } = await client.listTools();
      Object.assign(entry, { client, tools, status: 'connected' });
    } catch (e) {
      Object.assign(entry, { status: 'error', error: String(e.message || e) });
    }
    this.rebuildMap();
  }
  async disconnect(name) {
    const c = this.conns.get(name);
    if (c?.client) { try { await c.client.close(); } catch {} }
    this.conns.delete(name);
    this.rebuildMap();
  }
  async connectAll() { await Promise.all(Object.keys(this.servers).map((n) => this.connect(n))); }
  rebuildMap() {
    this.map.clear();
    for (const [server, c] of this.conns) for (const t of c.tools || []) this.map.set(`mcp__${safe(server)}__${safe(t.name)}`.slice(0, 64), { server, tool: t.name });
  }
  status() {
    return Object.entries(this.servers).map(([name, cfg]) => {
      const c = this.conns.get(name);
      return { name, cfg, enabled: cfg.enabled !== false, status: cfg.enabled === false ? 'off' : c?.status || 'off', error: c?.error, tools: (c?.tools || []).map((t) => ({ name: t.name, description: t.description || '' })) };
    });
  }
  toolDefs() {
    const out = [];
    for (const [full, { server, tool }] of this.map) {
      const t = this.conns.get(server).tools.find((x) => x.name === tool);
      out.push({ type: 'function', function: { name: full, description: `[${server}] ${(t.description || tool).slice(0, 900)}`, parameters: t.inputSchema || { type: 'object', properties: {} } } });
    }
    return out;
  }
  async call(full, args) {
    const m = this.map.get(full);
    if (!m) return `Connector tool ${full} is not available. It may be disconnected.`;
    const c = this.conns.get(m.server);
    try {
      const r = await c.client.callTool({ name: m.tool, arguments: args || {} }, undefined, { timeout: 30 * 60 * 1000 });
      const texts = [], images = [];
      for (const part of r.content || []) {
        if (part.type === 'text') texts.push(part.text);
        else if (part.type === 'image' && part.data) {
          const f = path.join(this.outDir, `mcp-${Date.now()}-${images.length}.${(part.mimeType || 'image/png').split('/')[1] || 'png'}`);
          fs.writeFileSync(f, Buffer.from(part.data, 'base64'));
          images.push(f);
        } else if (part.type === 'resource') texts.push(part.resource?.text || `[resource ${part.resource?.uri}]`);
      }
      let text = texts.join('\n') || (images.length ? 'Image returned.' : 'Done.');
      if (r.isError) text = 'Error from connector: ' + text;
      return { text, images };
    } catch (e) { return `Connector ${m.server} failed: ${e.message}`; }
  }
  // Read Claude Desktop and Claude Code configs so existing connectors can be imported in one click.
  importable() {
    const found = {};
    const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).mcpServers || {}; } catch { return {}; } };
    Object.assign(found, read(path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json')));
    Object.assign(found, read(path.join(os.homedir(), '.claude.json')));
    for (const k of Object.keys(found)) if (this.servers[k]) delete found[k];
    return found;
  }
}
module.exports = { MCPManager };
