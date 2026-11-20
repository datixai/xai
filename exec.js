// XAI code execution tools: PowerShell commands and Python analysis with chart capture.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const clip = (s, n = 12000) => (s.length > n ? s.slice(0, n / 2) + `\n...[${s.length - n} characters cut]...\n` + s.slice(-n / 2) : s);

function runProc(cmd, args, { cwd, timeout = 120000, input } = {}) {
  return new Promise((resolve) => {
    let out = '', err = '', done = false;
    const p = spawn(cmd, args, { cwd, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    const t = setTimeout(() => { if (!done) { p.kill(); err += `\n[stopped after ${timeout / 1000} s]`; } }, timeout);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { done = true; clearTimeout(t); resolve({ code: -1, out, err: err + e.message }); });
    p.on('close', (code) => { done = true; clearTimeout(t); resolve({ code, out, err }); });
    if (input) p.stdin.end(input);
  });
}

async function run_command({ command, cwd }) {
  if (!command) return 'No command given.';
  const dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  const r = await runProc('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`], { cwd: dir, timeout: 180000 });
  return clip(`Exit code ${r.code} (in ${dir})\n` + (r.out ? `Output:\n${r.out.trim()}\n` : '') + (r.err.trim() ? `Errors:\n${r.err.trim()}` : ''));
}

async function run_python({ code }, pythonPath) {
  if (!code) return 'No code given.';
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'xai-py-'));
  const pre = `import os, sys
os.chdir(${JSON.stringify(work)})
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as _plt
    import matplotlib.figure as _mf
    _n = [0]
    _orig = _mf.Figure.savefig
    def _keep(fig):
        _n[0] += 1
        _orig(fig, os.path.join(${JSON.stringify(work)}, f"xai_chart_{_n[0]}.png"), dpi=130, bbox_inches="tight")
    def _savefig(self, fname, *a, **k):
        r = _orig(self, fname, *a, **k)
        try:
            self._xai_kept = True
            _keep(self)
        except Exception:
            pass
        return r
    _mf.Figure.savefig = _savefig
    def _show(*a, **k):
        for f in _plt.get_fignums():
            fig = _plt.figure(f)
            if not getattr(fig, "_xai_kept", False):
                _keep(fig)
        _plt.close("all")
    _plt.show = _show
except Exception:
    _plt = None
`;
  const post = `\ntry:\n    if _plt and _plt.get_fignums(): _plt.show()\nexcept Exception: pass\n`;
  const file = path.join(work, 'script.py');
  fs.writeFileSync(file, pre + '\n' + code + '\n' + post, 'utf8');
  const r = await runProc(pythonPath || 'python', [file], { cwd: work, timeout: 300000 });
  const images = fs.readdirSync(work).filter((f) => /^xai_chart_\d+\.png$/.test(f)).map((f) => path.join(work, f));
  const text = clip(`Exit code ${r.code}\n` + (r.out ? `Output:\n${r.out.trim()}\n` : '') + (r.err.trim() ? `Errors:\n${r.err.trim().split('\n').slice(-25).join('\n')}\n` : '') + (images.length ? `Saved ${images.length} chart image(s); the user can see them.` : '') + `\nWorking folder: ${work}`);
  return { text, images };
}

module.exports = { run_command, run_python, runProc };
