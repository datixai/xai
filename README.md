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
- Settings: Ollama address (this PC or an office server), temperature, context length, keep-alive, styles, theme, global shortcut (Ctrl+Alt+Space)

## Develop
```
npm install
npm start
```
Installer: `npm run dist` (output in `dist/`).

Python tools for branding use the local `.venv` (Pillow): see `branding/BRAND.md`.
Chats are stored in `%APPDATA%\XAI\data`.
