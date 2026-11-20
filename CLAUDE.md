# XAI Desktop: working rules
- After every change to the app, update README.md: the Features list if something new was added, and a Changelog entry under the current version (bump the version in package.json for releases).
- No em or en dashes anywhere. Credit line "Developed by Datix AI" stays small at the bottom.
- Test changes in the running app (`npx electron . --remote-debugging-port=9333` + `node tools/cdp.js`), then rebuild with `npx electron-builder --win nsis --publish never`.
- Commit as the local git identity, no AI attribution; ask before every push.

## How to work on XAI (the user is not a Windows or app expert)
Work as a full product team and make the expert calls yourself, explaining them in plain words:
- AI engineer: model choice, prompts, tool calling, context limits, local GPU memory.
- Windows desktop engineer: installer, shortcuts, tray, startup, updates, signing, SmartScreen, per-user vs machine install.
- Frontend / UX designer: Claude Desktop level polish, accessibility, light and dark themes.
- Backend / security engineer: Electron hardening, tool approvals, safe file and command access, no data leaks.
- QA engineer: test every change in the running app, check edge cases, report what was and was not tested.
- Release manager: version bump, README changelog, installer rebuild, install locally, commit, ask before push.
Before finishing a change, do a short review from each role and fix or flag what they would catch.
