#!/usr/bin/env node
/**
 * Conducks — check resolved edges against the SOURCE, not against the graph.
 *
 * `verify-resolutions.mjs` checks one shape: a CALLS edge landing on a class member. That is 7.1% of
 * the edges on this repository. Everything else — ACCESSES, IMPORTS, CONSTRUCTS, TYPE_REFERENCE — has
 * never been checked at all, and an unverified edge is not a correct one, it is an unknown one.
 *
 * The graph cannot be its own witness: asking the vault whether an edge is right re-runs the rule
 * that produced it. Every check below reads the FILES.
 *
 * A check may only report three things:
 *   ok        the source supports the edge
 *   WRONG     the source contradicts it — the expensive kind, invisible to every count
 *   unchecked this checker cannot decide, stated rather than counted as a pass
 *
 * `unchecked` exists so the score cannot be inflated by narrowing what is examined. A checker that
 * quietly skips the hard cases reports 100% and means nothing.
 *
 * Usage: node tools/verify-edges.mjs <path-to-vault.db> [--type CALLS] [--show 10]
 */
import duckdb from 'duckdb';
import fs from 'node:fs';

const VAULT = process.argv[2];
const only = process.argv.includes('--type') ? process.argv[process.argv.indexOf('--type') + 1] : null;
const show = process.argv.includes('--show') ? Number(process.argv[process.argv.indexOf('--show') + 1]) : 5;
if (!VAULT) { console.error('usage: verify-edges.mjs <vault.db> [--type T] [--show N]'); process.exit(2); }

const db = new duckdb.Database(VAULT, duckdb.OPEN_READONLY);
const conn = db.connect();
const q = (sql) => new Promise((res, rej) => conn.all(sql, (e, r) => e ? rej(e) : res(r)));

const cache = new Map();
const read = (f) => {
  if (!cache.has(f)) { try { cache.set(f, fs.readFileSync(f, 'utf8')); } catch { cache.set(f, null); } }
  return cache.get(f);
};
/** The declaring span of a node, or the whole file for a UNIT (which records lineStart=1). */
const spanOf = (row) => {
  // A SYNTHETIC node — a route or a request minted by the cross-service binder — stands for an
  // endpoint, not for a span of text. There is nothing to read, so its edges are `unchecked` rather
  // than counted either way. `page.tsx::request::/api/x::get -> route.ts::route::/api/x::get` is a
  // binder pair whose evidence is a `fetch('/api/x')` elsewhere in the file, which this shape cannot
  // reconstruct.
  if (/::(request|route)::/.test(String(row.s))) return null;
  const src = read(row.sf);
  if (!src) return null;
  if (String(row.s).endsWith('::unit')) return src;
  const lines = src.split('\n');
  return lines.slice(Math.max(0, Number(row.sl) - 1), Number(row.se || row.sl)).join('\n');
};
const lastSeg = (id) => {
  const sym = String(id).split('::')[1] ?? '';
  return (sym.split('.').pop() || '').trim();
};
const wordIn = (hay, word) =>
  !!word && new RegExp(`(^|[^\\w$])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w$]|$)`, 'i').test(hay);

/**
 * One entry per edge type. `check` returns 'ok' | 'wrong' | null (unchecked).
 *
 * Each is deliberately CONSERVATIVE: it answers 'wrong' only when the source positively contradicts
 * the edge, and null when it cannot tell. Guessing in either direction would make the number worse
 * than not having one.
 */
const CHECKS = {
  /** The call site must actually write `.<member>(` or `<name>(`. */
  CALLS: (row) => {
    const body = spanOf(row); if (!body) return null;
    const name = lastSeg(row.t); if (!name) return null;
    // `name(`, `name<T>(`, `name?.(`  — the call itself.
    if (new RegExp(`(^|[^\\w$])${name}\\s*(<[^;\\n]*>)?\\s*\\??\\.?\\s*\\(`, 'i').test(body)) return 'ok';
    // A GLOBAL/namespace target is the RECEIVER, not the callee: the edge `unit -> global::console`
    // is supported by `console.log(...)`, and demanding `console(` reports 619 false alarms on this
    // repository. Checking the checker before trusting its findings is the rule ADR 0090 records.
    if (/^(global|lib|ecosystem)::/.test(String(row.t)) && new RegExp(`(^|[^\\w$])${name}\\s*\\??\\.`, 'i').test(body)) return 'ok';
    // An endpoint TARGET is evidenced by its PATH, not by a symbol name. `-> request::/api/logs::get`
    // is supported by `fetch('/api/logs')`, and the last segment is the HTTP METHOD, which is never
    // written as a callee.
    const endpoint = /(?:^|::)(?:request|route)::(.+)::[a-z]+$/i.exec(String(row.t));
    if (endpoint) {
      const path = endpoint[1].split('?')[0];
      return body.includes(path) ? 'ok' : 'wrong';
    }
    // JSX is a call. `<Button />` compiles to `Button(...)`, and a member form `<motion.div>` to a
    // property call — demanding a literal paren reported 233 false alarms on a React subject.
    if (new RegExp(`<\\s*[\\w.$]*\\b${name}\\b`, 'i').test(body)) return 'ok';
    // A RENAMED import is called by its LOCAL name, so the target's own name never appears at the
    // call site. Both spellings count — `import { POST as send }` and the destructured dynamic form
    // `const { POST: send } = await import(...)`, which mentorseed's lifecycle tests use throughout.
    // The edge is right; ADR 0085 is what makes it right, and this checker cannot follow the rename
    // without re-resolving the import.
    const whole = read(row.sf) || '';
    if (new RegExp(`\\b${name}\\s+as\\s+[\\w$]+`, 'i').test(whole)) return null;
    if (new RegExp(`\\b${name}\\s*:\\s*[\\w$]+\\s*\\}`, 'i').test(whole)) return null;
    return 'wrong';
  },
  /** A construction must write `new <Type>` — or be a call the processor classified by capitalisation. */
  CONSTRUCTS: (row) => {
    const body = spanOf(row); if (!body) return null;
    const name = lastSeg(row.t); if (!name) return null;
    if (new RegExp(`new\\s+[\\w.$]*\\b${name}\\b`, 'i').test(body)) return 'ok';
    // `isConstructor()` files an uppercase call as CONSTRUCTS, and the instance-type edge (ADR 0090)
    // has no textual `new` at the SOURCE node at all — both are real edges this shape cannot see.
    return wordIn(body, name) ? 'ok' : null;
  },
  /** A reference-as-value must name the symbol somewhere in the referring span. */
  ACCESSES: (row) => {
    const body = spanOf(row); if (!body) return null;
    const name = lastSeg(row.t); if (!name) return null;
    return wordIn(body, name) ? 'ok' : 'wrong';
  },
  /** An import must name either the bound symbol or the target file's basename. */
  IMPORTS: (row) => {
    const src = read(row.sf); if (!src) return null;
    const name = lastSeg(row.t);
    const base = String(row.tf || '').split('/').pop()?.replace(/\.[^.]+$/, '');
    if (name && name !== 'unit' && wordIn(src, name)) return 'ok';
    if (base && new RegExp(`from\\s+['"][^'"]*${base}`, 'i').test(src)) return 'ok';
    return null;   // external packages and barrels resolve through paths this cannot reconstruct
  },
  /** A type reference must name the type in the referring span. */
  TYPE_REFERENCE: (row) => {
    const body = spanOf(row); if (!body) return null;
    const name = lastSeg(row.t); if (!name) return null;
    return wordIn(body, name) ? 'ok' : 'wrong';
  },
};

const types = only ? [only] : Object.keys(CHECKS);
let gOk = 0, gWrong = 0, gUnchecked = 0;
const wrongs = [];

for (const type of types) {
  const rows = await q(`
    SELECT e.sourceId s, e.targetId t, n.file tf, sn.file sf, sn.lineStart sl, sn.lineEnd se
    FROM edges e
    JOIN nodes n  ON n.id  = e.targetId
    JOIN nodes sn ON sn.id = e.sourceId
    WHERE e.type = '${type}'
  `);
  let ok = 0, wrong = 0, un = 0;
  for (const row of rows) {
    const verdict = CHECKS[type](row);
    if (verdict === 'ok') ok++;
    else if (verdict === 'wrong') { wrong++; if (wrongs.length < 200) wrongs.push({ type, ...row }); }
    else un++;
  }
  gOk += ok; gWrong += wrong; gUnchecked += un;
  const decided = ok + wrong;
  const pct = decided ? ((ok / decided) * 100).toFixed(1) : 'n/a';
  console.log(`${type.padEnd(15)} ${String(rows.length).padStart(6)} edges   ok ${String(ok).padStart(5)}   WRONG ${String(wrong).padStart(4)}   unchecked ${String(un).padStart(5)}   precision ${pct}%`);
}

const decided = gOk + gWrong;
console.log('-'.repeat(96));
console.log(`TOTAL           ${String(decided + gUnchecked).padStart(6)} edges   ok ${String(gOk).padStart(5)}   WRONG ${String(gWrong).padStart(4)}   unchecked ${String(gUnchecked).padStart(5)}   precision ${decided ? ((gOk / decided) * 100).toFixed(2) : 'n/a'}%`);

if (wrongs.length) {
  console.log(`\nfirst ${Math.min(show, wrongs.length)} contradicted by source:`);
  for (const w of wrongs.slice(0, show)) {
    const short = (x) => String(x).replace(/^.*\/(src|app|packages|tests)\//, '$1/');
    console.log(`  [${w.type}] ${short(w.s)}\n        -> ${short(w.t)}`);
  }
}
process.exit(gWrong > 0 ? 1 : 0);
