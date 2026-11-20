# XAI Desktop

A Windows desktop AI assistant (Electron) that works like a familiar chat desktop app but runs only on local Ollama models. No cloud, no tokens. Developed by Datix AI.

## Features
- Chat with streaming replies, Markdown, code highlighting, copy, retry, edit and resend
- Model picker with every installed Ollama model and its abilities (vision, thinking, tools)
- Extended thinking display (gpt-oss reasoning effort low / medium / high)
- Preview panel for HTML, SVG and Markdown, plus a code view for long code (copy, download, resize)
- File and image attachments: drag and drop, paste screenshots, PDF, Word, text and code
- Projects with custom instructions and knowledge files
- Chat history: search (Ctrl+K), star, rename, move, export to Markdown, auto titles
- Tools: files and folders, web search, Python analysis with charts, PowerShell, with approval before changes
- Connectors (MCP): add stdio or HTTP servers, or import them from Claude Desktop and Claude Code
- Project knowledge: index files or whole folders with a local embedding model and retrieve by meaning
- Memory across chats, voice dictation (local Whisper) and read aloud (Windows voices or Kokoro)
- Quick entry window (Ctrl+Alt+X), system tray, start with Windows, screenshots into chat
- Message branching (edit or retry keeps versions), context meter with automatic summarizing
- Previews for HTML, SVG, Markdown, Mermaid and React (TSX) with versions; export chats to PDF or Word
- Model manager (download and delete Ollama models), auto-update from GitHub releases, office mode
- Settings: Ollama address (this PC or an office server), temperature, context length, keep-alive, styles, theme, global shortcut (Ctrl+Alt+X)

## Develop
```
npm install
npm start
```
Tests: `npm test`. Installer: `npm run dist` (runs the tests first, output in `dist/`).

Python tools for branding use the local `.venv` (Pillow): see `branding/BRAND.md`.
Chats are stored in `%APPDATA%\XAI\data`.

## Install on this PC
Run `dist\XAI Setup <version>.exe` (or silently: `"XAI Setup 1.1.0.exe" /S`). It installs per user to `%LOCALAPPDATA%\Programs\XAI` with Start menu and desktop shortcuts. To pin: open XAI, right-click its taskbar icon, choose **Pin to taskbar**.

## Changelog
### 1.1.2 (2026-11-20)
- Long dashes are now removed from every reply and chat title automatically (code is left untouched), not only discouraged in the prompt
- Instructions sent to the model always match the model that actually answers, including after an automatic fallback
### 1.1.1 (2026-11-20)
- Security: running code or commands now asks every time; tool results from web pages, files and connectors are marked as data so hidden instructions in them are ignored; extra warning when a risky action follows outside content
- Reliability: if a model fails to start on the GPU, XAI retries the reply with the next best working model and says so
- Error log (Settings > About > Open error log) records crashes and model failures
- Automated test suite (`npm test`), which now runs before every installer build
- Replies are told to avoid long dashes
### 1.1.0 (2026-11-20)
- Connectors (MCP) with import from Claude Desktop and Claude Code
- Run code tools: Python with chart capture, PowerShell, both with approval
- Project knowledge with local embeddings (files or whole folders)
- Memory across chats, voice dictation and read aloud
- Quick entry (Ctrl+Alt+X), tray, start with Windows, screenshots into chat
- Message branching, context meter, automatic summarizing of long chats
- Mermaid and React previews with versions, export to PDF and Word
- Model manager, auto-update setup, office mode, clearer GPU error messages

### 1.0.1
- File and web tools: list, search, read, create folders and files, move, open; web search and page reading; approval before changes

### 1.0.0
- First release: chat, streaming, thinking, previews, projects, search, settings, branding
