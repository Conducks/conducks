#!/usr/bin/env node
/**
 * Conducks — check that an edge's recorded LINE is the line the reference is written on.
 *
 * `verify-edges.mjs` asks whether an edge is real. This asks whether its POSITION is real, which is
 * a different failure: a line that is present but wrong reads exactly like a correct one to every
 * consumer, and a caller trusting it lands in the wrong place with no signal that anything is off.
 * Presence was never the property worth measuring.
 *
 * Verdicts, same three as the sibling tool:
 *   ok        the recorded line contains the symbol
 *   WRONG     it does not, and the file does elsewhere — a real misplacement
 *   unchecked this shape cannot be located from the target id alone
 *
 * Usage: node tools/verify-edge-lines.mjs <path-to-vault.db> [--show 10]
 */
import { openVault } from './lib/vault.mjs';
import fs from 'node:fs';

const VAULT = process.argv[2];
const show = process.argv.includes('--show') ? Number(process.argv[process.argv.indexOf('--show') + 1]) : 5;
if (!VAULT) { console.error('usage: verify-edge-lines.mjs <vault.db> [--show N]'); process.exit(2); }

const conn = await openVault(VAULT);
const q = (sql) => conn.all(sql);

const cache = new Map();
const lines = (f) => {
  if (!cache.has(f)) { try { cache.set(f, fs.readFileSync(f, 'utf8').split('\n')); } catch { cache.set(f, null); } }
  return cache.get(f);
};
const wordIn = (hay, w) =>
  !!w && new RegExp(`(^|[^\\w$])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w$]|$)`, 'i').test(hay);

const rows = await q(`
  SELECT e.type, e.sourceId s, e.targetId t, e.lineNumber ln, sn.file sf
  FROM edges e JOIN nodes sn ON sn.id = e.sourceId
  WHERE e.lineNumber > 0 AND e.type IN ('CALLS','CONSTRUCTS','TYPE_REFERENCE','EXTENDS','IMPLEMENTS')
`);

let ok = 0, wrong = 0, un = 0;
const bad = [];
for (const r of rows) {
  const src = lines(r.sf);
  if (!src) { un++; continue; }
  const idx = Number(r.ln) - 1;
  if (idx < 0 || idx >= src.length) { wrong++; bad.push({ ...r, why: 'line past end of file' }); continue; }
  // The symbol as WRITTEN — the last dotted segment of the target id's symbol half.
  const symbol = (String(r.t).split('::')[1] ?? '').split('.').pop()?.trim();
  if (!symbol || symbol === 'unit') { un++; continue; }
  // A statement may wrap; tree-sitter reports the row the MATCH starts on, so accept the recorded
  // line plus the two that follow it rather than declaring a wrapped call misplaced.
  const window = src.slice(idx, idx + 3).join('\n');
  if (wordIn(window, symbol)) { ok++; continue; }
  // A renamed import is called by its LOCAL name (ADR 0085), and the resolved id carries the
  // ORIGINAL — so the target's name is genuinely absent at a correct line. Not decidable here.
  // Both spellings of a rename. `import { POST as send }` is the static form; the DESTRUCTURED
  // dynamic form `const { POST: send } = await import(...)` is the one the oracle's T12 uses, and
  // omitting it reported that edge as misplaced when its line was exactly right — the call site.
  // `verify-edges.mjs` already accounts for both; this checker only had the first.
  const whole = src.join('\n');
  if (new RegExp(`\\b${symbol}\\s+as\\s+[\\w$]+`, 'i').test(whole)) { un++; continue; }
  if (new RegExp(`\\b${symbol}\\s*:\\s*[\\w$]+\\s*\\}`, 'i').test(whole)) { un++; continue; }
  // A DELEGATION resolves past the name the call site writes: `registry.audit.guard(...)` is
  // `guard: t => governanceService.shouldBlock(t)`, so the target's own name never appears at the
  // call. Same shape `verify-edges.mjs` already declines to judge.
  //
  // The elsewhere-in-file test has to ignore COMMENTS. Both of this checker's first two findings
  // were prose — `shouldBlock` in a comment on another line, `main` in an import alias — so "the
  // name is in this file, therefore the recorded line is wrong" concluded a defect from a sentence.
  // Checking the checker before trusting it is the standing rule here, and it has now paid twice.
  const code = src.map(l => l.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, ''));
  if (!code.some(l => wordIn(l, symbol))) { un++; continue; }
  wrong++; if (bad.length < 200) bad.push({ ...r, why: 'symbol not on the recorded line' });
}

const decided = ok + wrong;
console.log(`checked ${rows.length} positioned edges   ok ${ok}   WRONG ${wrong}   unchecked ${un}   accuracy ${decided ? ((ok / decided) * 100).toFixed(2) : 'n/a'}%`);
if (bad.length) {
  console.log(`\nfirst ${Math.min(show, bad.length)} misplaced:`);
  for (const b of bad.slice(0, show)) {
    console.log(`  [${b.type}] ${String(b.s).replace(/^.*\/src\//, 'src/')}:${b.ln}  -> ${b.t}   (${b.why})`);
  }
}
process.exit(wrong > 0 ? 1 : 0);
