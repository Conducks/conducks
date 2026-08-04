#!/usr/bin/env node
/**
 * Conducks — is the doc coverage a TOOL gap or an AUTHOR gap?
 *
 * `health.mjs` reports how many symbols carry a doc. That number alone cannot tell two very different
 * situations apart: the authors wrote nothing, or conducks lost what they wrote. On the Python subject
 * the answer looked like "the authors wrote nothing" at 17.7%, and it was a bug that cost two thirds
 * of the docstrings.
 *
 * So the count is scored against the SOURCE, per symbol, on both axes:
 *
 *     matched   the vault's text is the author's text
 *     WRONG     a doc is attached and it is not the author's — the expensive kind, invisible to a count
 *     missed    the author wrote one and the vault has none
 *     no node   conducks recorded no symbol at that line, which is a different defect entirely
 *
 * Python truth comes from `ast`; TypeScript truth comes from the TypeScript compiler. Neither asks
 * conducks anything, which is the point — the graph cannot be its own witness.
 *
 * Usage: node tools/benchmark/doc-truth.mjs [--only scraper]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import duckdb from 'duckdb';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, 'projects.json'), 'utf8'));
const ROOT = path.resolve(HERE, CONFIG.root);
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

const SKIP_DIRS = /(^|\/)(node_modules|\.next|\.conducks|dist|build|out|coverage|\.git)(\/|$)/;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP_DIRS.test(p)) continue;
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** The author's JSDoc per declaration, straight from the TypeScript parser. */
function typescriptTruth(root) {
  const out = [];
  for (const file of walk(root)) {
    if (!/\.[cm]?[jt]sx?$/.test(file) || /\.d\.ts$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

    const visit = (node) => {
      const named = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
        ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
        ts.isArrowFunction(node) || ts.isFunctionExpression(node);
      if (named) {
        const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
        const doc = docs.map(d => (typeof d.comment === 'string' ? d.comment : (d.comment ?? []).map(c => c.text).join(''))).join('\n').trim();
        if (doc) {
          // The line conducks records is the DECLARATION's, and for an arrow function assigned to a
          // name that is the variable statement, not the arrow. Both are recorded so a hit on either
          // counts — this checker is measuring the doc, not the line-anchoring rule.
          const lines = new Set();
          for (const n of [node, node.parent, node.parent?.parent]) {
            if (!n) continue;
            lines.add(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
          }
          out.push({ file: file.toLowerCase(), lines: [...lines], doc });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

/** The author's docstring per def/class, straight from Python's own parser. */
function pythonTruth(root) {
  const raw = execFileSync('python3', ['-c', `
import ast, pathlib, json, os
os.chdir(${JSON.stringify(root)})
out=[]
for p in pathlib.Path('.').rglob('*.py'):
    if any(s in str(p) for s in ('.conducks','node_modules','.git')): continue
    try: t=ast.parse(p.read_text(encoding='utf8'))
    except Exception: continue
    for n in ast.walk(t):
        if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):
            d=ast.get_docstring(n)
            if d: out.append({"file":str(p.resolve()).lower(),"lines":[n.lineno],"doc":d})
print(json.dumps(out))
`], { encoding: 'utf8', maxBuffer: 256e6 });
  return JSON.parse(raw);
}

const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

for (const project of CONFIG.projects) {
  if (only && project.name !== only) continue;
  const dir = path.join(ROOT, project.name);

  const db = new duckdb.Database(path.join(dir, '.conducks/conducks-synapse.db'), duckdb.OPEN_READONLY).connect();
  const rows = await new Promise((res, rej) => db.all(
    `SELECT file, lineStart, coalesce(doc,'') AS doc FROM nodes
      WHERE canonicalKind IN ('BEHAVIOR','STRUCTURE') AND file NOT LIKE 'external://%'`,
    (e, r) => e ? rej(e) : res(r)));

  const vault = new Map();
  for (const r of rows) vault.set(`${String(r.file).toLowerCase()}:${Number(r.lineStart)}`, String(r.doc));

  const truth = project.language === 'python' ? pythonTruth(dir) : typescriptTruth(dir);

  let matched = 0, wrong = 0, missed = 0, noNode = 0;
  const wrongEx = [], missedEx = [];
  for (const t of truth) {
    const got = t.lines.map(l => vault.get(`${t.file}:${l}`)).filter(v => v !== undefined);
    if (got.length === 0) { noNode++; continue; }
    const best = got.find(v => v && norm(v) === norm(t.doc)) ?? got.find(v => v) ?? '';
    if (!best) { missed++; if (missedEx.length < 4) missedEx.push(`${t.file}:${t.lines[0]} ${norm(t.doc).slice(0, 55)}`); continue; }
    // The vault holds the whole comment; the compiler hands back only the description, so a doc that
    // opens with the author's text is a match. Anything else is a DIFFERENT comment.
    if (norm(best) === norm(t.doc) || norm(best).startsWith(norm(t.doc)) || norm(t.doc).startsWith(norm(best))) matched++;
    else { wrong++; if (wrongEx.length < 4) wrongEx.push(`${t.file}:${t.lines[0]}\n      author: ${norm(t.doc).slice(0, 55)}\n      vault : ${norm(best).slice(0, 55)}`); }
  }

  const total = truth.length;
  console.log(`\n=== ${project.name} (${project.language}) ===`);
  console.log(`  symbols the AUTHOR documented: ${total}`);
  console.log(`    vault text matches:          ${matched}  (${((matched / total) * 100).toFixed(1)}%)`);
  console.log(`    vault text DIFFERS:          ${wrong}   <- false attachment`);
  console.log(`    vault has no doc:            ${missed}`);
  console.log(`    no node at that line:        ${noNode}`);
  wrongEx.forEach(e => console.log(`    ${e}`));
  missedEx.forEach(e => console.log(`    missed ${e}`));
}
