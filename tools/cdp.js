// Dev helper: drive the running app over Chrome DevTools Protocol.
// Start app: npx electron . --remote-debugging-port=9333
// Usage: node tools/cdp.js "<js expression>" [screenshot.png]
const [, , expr = '1', shot] = process.argv;
(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json();
  const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await new Promise((r) => (ws.onopen = r));
  const call = (method, params) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r.result).slice(0, 3000));
  if (shot) { const s = await call('Page.captureScreenshot', { format: 'png' }); require('fs').writeFileSync(shot, Buffer.from(s.result.data, 'base64')); }
  ws.close();
})();
