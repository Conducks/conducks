/**
 * Conducks — the file set the TypeScript oracles score, and why it is not just the tsconfig.
 *
 * A tsconfig is the project's build story, not an inventory of its source. Three subjects showed
 * three different ways that leaves JavaScript uncovered:
 *
 *   scraper       33 js/mjs files and NO tsconfig at all — every TS oracle refused to run
 *   orchestrator  45, with no ROOT tsconfig; the workspaces have their own and nothing covers the rest
 *   sofie         17, with `include: ["src/**\/*"]`, so anything outside src/ is outside the program
 *
 * So the JS in the subjects was riding on TypeScript's coverage rather than having its own, and
 * "complete for TS/JS" was half true. This unions the tsconfig file set with a walk for JS-family
 * files, and builds the program with `allowJs`.
 *
 * Shared rather than copied into all three oracles: the same question asked three ways drifts, and
 * this one already had three different wrong answers.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.conducks', '.next', 'venv', '.venv', '__pycache__']);
const JS_EXT = /\.(js|jsx|mjs|cjs)$/;

/** Every tsconfig at the root or one level down — the shape a monorepo has. */
export function configPathsOf(projectDir) {
  const found = [];
  const root = path.join(projectDir, 'tsconfig.json');
  if (existsSync(root)) found.push(root);
  for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const nested = path.join(projectDir, entry.name, 'tsconfig.json');
    if (existsSync(nested)) found.push(nested);
  }
  return found;
}

function walkJs(dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walkJs(path.join(dir, e.name), out);
    } else if (JS_EXT.test(e.name)) {
      out.add(path.join(dir, e.name));
    }
  }
}

/**
 * The program to score, plus what went into it.
 *
 * Returns `null` when there is nothing at all to read — a project with no tsconfig and no JS is not
 * this oracle's business, and saying so beats scoring an empty program as a pass.
 */
export function buildProgram(projectDir) {
  const configPaths = configPathsOf(projectDir);
  const fileNames = new Set();
  for (const cfg of configPaths) {
    try {
      const parsed = ts.parseJsonConfigFileContent(
        ts.readConfigFile(cfg, ts.sys.readFile).config, ts.sys, path.dirname(cfg));
      for (const f of parsed.fileNames) fileNames.add(f);
    } catch { /* reported through the counts the caller prints */ }
  }
  const fromConfig = fileNames.size;

  const js = new Set();
  walkJs(projectDir, js);
  for (const f of js) fileNames.add(f);

  if (fileNames.size === 0) return null;
  return {
    program: ts.createProgram([...fileNames], { allowJs: true, noEmit: true, skipLibCheck: true }),
    configPaths,
    fromConfig,
    jsAdded: [...js].filter(f => {
      try { return statSync(f).isFile(); } catch { return false; }
    }).length,
  };
}
