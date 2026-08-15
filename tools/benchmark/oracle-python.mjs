#!/usr/bin/env node
/**
 * Conducks — score Python `STALE_IMPORT` against Python's own parser. 🏺
 *
 * WHY PYTHON SPECIFICALLY. The worst defects of 2026-08-14/15 were all here: a zero-argument call
 * produced no edge at all, class inheritance produced none ever (17 of 27 findings on the Python
 * subject were imported base classes), and every `self.method()` in the language bound to one
 * synthetic node. Each was found by hand, once. Nothing checks Python.
 *
 * WHY `ast` AND NOT pyright/pyflakes/ruff. None are installed and none should have to be — `ast` is
 * the standard library, so this runs anywhere Python does. More importantly it is a genuinely
 * INDEPENDENT method: it WALKS EVERY NODE of the tree, where conducks matches a hand-written list of
 * shapes. That difference is the entire point. An oracle built the same way as the thing it scores
 * would share its blind spots — which is exactly how thirteen use-positions stayed invisible.
 *
 * WHAT IT CHECKS. For each file: names brought in by `import` / `from … import`, against every
 * identifier the tree actually mentions. An import whose name never appears again is unused.
 *
 * WHICH DIRECTION MATTERS MOST. `EXTRA` — conducks calls an import stale while the parser can see
 * the name used — is a precision bug, and it is checkable without any module resolution at all, so
 * it is exact. `MISSED` needs to know whether the module is IN-PROJECT (conducks never judges a
 * stdlib or third-party import, by design), which is resolved here the same way Python would: a
 * matching file or package directory under the project root.
 *
 * WHAT IT CANNOT SEE, stated rather than found out later:
 *   - a name used only inside a string annotation or `eval`
 *   - re-exports through `__all__`, which are treated as uses here because that is what they are
 *   - `import *`, where nothing can be attributed to a name at all
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const projectDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const isTestPath = (p) =>
  /(^|\/)(tests?|__tests__|fixtures?)\//.test(p) || /(^|\/)test_[^/]*\.py$/.test(p) || /_test\.py$/.test(p);

/**
 * The oracle, in Python, because only Python can parse Python honestly.
 *
 * Emits one JSON record per unused import: the file, the bound name, the module it came from, and
 * whether that module resolves to a file inside this project.
 */
const PY = `
import ast, json, os, sys

root = sys.argv[1]
out = []

# A module counts as in-project only if it is IMPORTABLE AT THE TOP LEVEL from one of this
# project's source roots -- not merely if a file somewhere shares its name.
#
# The first version matched on the bare name and got this wrong in a way that inflated the recall gap
# by 5x: the Python subject really does contain src/core/browser/human/typing.py and src/core/logging/,
# so every 'from typing import Optional' looked project-owned. It is stdlib -- that file is importable
# as core.browser.human.typing and by no shorter name.
SKIP = {'node_modules', '.git', '.conducks', 'venv', '.venv', '__pycache__', 'site-packages', 'dist', 'build'}

roots = [root]
for entry in sorted(os.listdir(root)):
    d = os.path.join(root, entry)
    if entry in SKIP or not os.path.isdir(d): continue
    # a source root is a directory holding importable top-level modules of its own
    if any(f.endswith('.py') for f in os.listdir(d)) or \
       any(os.path.exists(os.path.join(d, sub, '__init__.py')) for sub in os.listdir(d) if os.path.isdir(os.path.join(d, sub))):
        roots.append(d)

def resolves_in_project(mod):
    if not mod: return False
    head = mod.split('.')[0]
    for r in roots:
        if os.path.exists(os.path.join(r, head + '.py')): return True
        if os.path.exists(os.path.join(r, head, '__init__.py')): return True
    return False

for base, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', '.conducks', 'venv', '.venv', '__pycache__')]
    for fn in files:
        if not fn.endswith('.py'): continue
        p = os.path.join(base, fn)
        rel = os.path.relpath(p, root)
        try:
            tree = ast.parse(open(p, encoding='utf-8', errors='ignore').read())
        except Exception:
            continue
        bound = {}   # local name -> module
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    bound[(a.asname or a.name).split('.')[0]] = a.name
            elif isinstance(node, ast.ImportFrom):
                for a in node.names:
                    if a.name == '*': continue
                    bound[a.asname or a.name] = node.module or ''
        if not bound: continue
        # every identifier the tree mentions, minus the import statements themselves
        used = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Name): used.add(node.id)
            elif isinstance(node, ast.Attribute):
                v = node.value
                if isinstance(v, ast.Name): used.add(v.id)
            elif isinstance(node, (ast.Import, ast.ImportFrom)): pass
        # __all__ = ["x"] re-exports the name; that IS a use
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for t in node.targets:
                    if isinstance(t, ast.Name) and t.id == '__all__':
                        for el in getattr(node.value, 'elts', []):
                            if isinstance(el, ast.Constant) and isinstance(el.value, str): used.add(el.value)
        for name, mod in bound.items():
            if name not in used:
                out.append({'file': rel, 'symbol': name, 'module': mod, 'inProject': resolves_in_project(mod)})

print(json.dumps(out))
`;

function oracleUnusedImports() {
  const raw = execFileSync('python3', ['-c', PY, projectDir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const all = JSON.parse(raw).filter(r => !isTestPath(r.file));
  const inProject = new Map();
  const any = new Map();
  for (const r of all) {
    const k = `${r.file.toLowerCase()}::${r.symbol.toLowerCase()}`;
    any.set(k, r);
    if (r.inProject) inProject.set(k, r);
  }
  return { inProject, any };
}

function conducksStale() {
  // RE-ANALYZE FROM AN EMPTY VAULT, ALWAYS. `prune` answers from the vault, and a GRAMMAR change
  // alters no file hash — so `analyze` skips every file as unchanged and the score is taken against
  // the PREVIOUS build. Measured twice while writing this: removing a capture pattern, rebuilding
  // and re-running left the numbers identical and the gate green, first with no analyze at all and
  // then with an analyze that no-opped. A gate that scores stale data is worse than no gate, because
  // it reports success. The vault is derived state and costs seconds to rebuild.
  rmSync(path.join(projectDir, '.conducks'), { recursive: true, force: true });
  execFileSync('node', [CLI, 'analyze'], { cwd: projectDir, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
  const raw = execFileSync('node', [CLI, 'prune', '--json'], { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lowerRoot = projectDir.toLowerCase();
  const found = new Map();
  for (const f of JSON.parse(raw)) {
    if (f.type !== 'STALE_IMPORT') continue;
    const abs = String(f.file).toLowerCase();
    const rel = abs.startsWith(lowerRoot) ? abs.slice(lowerRoot.length).replace(/^[/\\]/, '') : abs;
    if (isTestPath(rel) || !rel.endsWith('.py')) continue;
    found.set(`${rel}::${String(f.symbol).toLowerCase()}`, f);
  }
  return found;
}

const { inProject, any } = oracleUnusedImports();
const ours = conducksStale();

// EXTRA is exact: if conducks says stale and the parser never saw the name unused, the name is used.
const extra = [...ours].filter(([k]) => !any.has(k)).map(([, v]) => v);
const missed = [...inProject].filter(([k]) => !ours.has(k)).map(([, v]) => v);
const agreed = [...inProject].filter(([k]) => ours.has(k)).length;

console.log(`\n--- Python STALE_IMPORT vs python's own ast (${path.basename(projectDir)}) ---`);
console.log(`  ast: unused imports, in-project : ${inProject.size}   (any module: ${any.size})`);
console.log(`  conducks says stale             : ${ours.size}`);
console.log(`  agreed                          : ${agreed}`);
console.log(`  MISSED (ast sees it, conducks silent): ${missed.length}`);
for (const m of missed.slice(0, 12)) console.log(`      ${m.symbol}  from '${m.module}'  ${m.file}`);
if (missed.length > 12) console.log(`      … ${missed.length - 12} more`);
console.log(`  EXTRA (conducks says stale, ast sees the name used): ${extra.length}`);
for (const e of extra.slice(0, 12)) console.log(`      ${e.symbol}  ${e.file}`);

const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::python`;
const prev = baseline[key];

if (any.size === 0) {
  console.error(`\n✖ the oracle found NO unused imports anywhere. For a real Python project that means ` +
    `the walk failed, not that the project is spotless. Refusing to score against a silent oracle.\n`);
  process.exit(1);
}
let failed = false;
if (extra.length > 0) { console.error(`\n✖ ${extra.length} finding(s) python's own parser contradicts.`); failed = true; }
if (prev && missed.length > prev.missed) {
  console.error(`\n✖ RECALL WENT BACKWARDS: ${prev.missed} missed before, ${missed.length} now.`); failed = true;
}
if (failed) process.exit(1);

if (process.argv.includes('--write-baseline') || !prev) {
  baseline[key] = { oracle: inProject.size, missed: missed.length, agreed };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}: oracle=${inProject.size} missed=${missed.length}`);
}
console.log(`\n✓ no Python finding contradicts the parser` + (prev ? `, and recall did not regress.` : `.`) + `\n`);
