# Contributing to Conducks 🧬

First off, thank you for considering contributing to Conducks! It's people like you that make Conducks a high-fidelity structural engine for everyone.

## 🏺 Our Vision
Conducks aims to be the standard structural intelligence layer for AI-native engineering. We value precision, resonance, and architectural integrity.

## 🚀 How Can I Contribute?

### Reporting Bugs
- Use the GitHub issue tracker.
- Provide a clear, descriptive title.
- Include steps to reproduce and any relevant structural pulses (`.conducks/mcp.log`).

### Suggesting Enhancements
- Check if the enhancement is already suggested.
- Explain why this enhancement would improve the structural resonance of the project.

### Pull Requests
1. **Fork the repo** and create your branch from `main`.
2. **Install dependencies**: `npm install`.
3. **Build the project**: `npm run build`.
4. **Run tests**: `npm test`.
5. **Format your code**: We follow strict high-contrast formatting standards.
6. **Submit the PR**: Ensure your description clearly explains the structural change.

## 🏷️ Releasing

One number, written the same everywhere. Order:
1. Pick the number (`npm version <x.y.z> --no-git-tag-version`; this also updates `package-lock.json`).
2. Move `[Unreleased]` in `CHANGELOG.md` under `## [x.y.z] — YYYY-MM-DD`.
3. Update the website's two version cells, then commit.
4. `npm run release:check -- --website ../website` must print OK. It checks the lockfile, changelog, build, `conducks --version`, the website numbers, a clean tree, the tag and that npm doesn't already have it.
5. `npm publish` (runs the build and the same check first).
6. `git tag vX.Y.Z && git push origin vX.Y.Z`, then deploy the website.

## 🛡️ Sentinel Policies
All contributions must pass the existing `sentinel.json` audits. If you are adding a new core service, ensure it follows the canonical taxonomy — 9 kinds are persisted (13 are declared).

## 📜 Code of Conduct
By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---
© 2026 Gospel of Technology. Resonance through collaboration.
