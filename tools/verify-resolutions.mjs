/**
 * Independent check of every typed-receiver resolution, from SOURCE rather than from the graph.
 *
 * The graph cannot be its own witness: it produced these edges, so asking it whether they are right
 * only re-runs the rule. This reads the files instead and asks two questions per edge:
 *   1. does the call site really contain `<receiver>.<member>` ?
 *   2. does the target file really declare `<member>` inside `class <Type>` (or is it inherited) ?
 * A resolution failing either is a WRONG edge, not a missing one.
 */
import { openVault } from './lib/vault.mjs';
import fs from 'node:fs';

const c = await openVault(process.argv[2]);
const q = s => c.all(s);

// Every edge whose target is a class MEMBER — the shape the two new rules produce.
const edges = await q(`
  SELECT e.sourceId s, e.targetId t, n.file tf, n.lineStart tl, n.semantic_kind tk,
         sn.file sf, sn.lineStart sl, sn.lineEnd se
  FROM edges e
  JOIN nodes n ON n.id = e.targetId
  LEFT JOIN nodes sn ON sn.id = e.sourceId
  WHERE e.type = 'CALLS' AND n.semantic_kind = 'method' AND position('.' in split_part(e.targetId,'::',2)) > 0
`);

const src = new Map();
const read = f => { if (!src.has(f)) { try { src.set(f, fs.readFileSync(f,'utf8').split('\n')); } catch { src.set(f, null); } } return src.get(f); };

let checked = 0, memberOk = 0, callOk = 0;
const badMember = [], badCall = [];

for (const e of edges) {
  const [, sym] = String(e.t).split('::');
  const member = sym.split('.').pop();
  const lines = read(e.tf);
  if (!lines) continue;
  checked++;

  // 1. the target line really declares this member
  const line = lines[Number(e.tl) - 1] ?? '';
  const declares = new RegExp(`(^|[^\\w$])${member}\\s*[(<:=]`, 'i').test(line);
  if (declares) memberOk++; else badMember.push(`${e.t}  @${e.tf.split('/').pop()}:${e.tl}  line="${line.trim().slice(0,80)}"`);

  // 2. the call site really writes `<something>.<member>(`
  const sl = read(e.sf);
  if (sl && e.sl) {
    // A UNIT source node spans the file but records lineStart=lineEnd=1, so slicing its "span"
    // reads one line and reports a mismatch that is the checker's, not the graph's.
    const isUnit = String(e.s).endsWith('::unit');
    const body = isUnit ? sl.join('\n') : sl.slice(Math.max(0, Number(e.sl)-1), Number(e.se||e.sl)).join('\n');
    if (new RegExp(`\\.\\s*${member}\\s*(<[^;\\n]*>)?\\s*\\??\\.?\\s*\\(`, 'i').test(body)) callOk++;
    else badCall.push(`${e.s.split('::').pop()} -> ${member}  @${String(e.sf).split('/').pop()}:${e.sl}`);
  }
}

console.log(`member-call edges checked: ${checked}`);
console.log(`  target line declares the member : ${memberOk}/${checked} (${(memberOk/checked*100).toFixed(1)}%)`);
console.log(`  call site writes .<member>(     : ${callOk}/${checked} (${(callOk/checked*100).toFixed(1)}%)`);
if (badMember.length) { console.log(`\nWRONG TARGET (${badMember.length}):`); badMember.slice(0,10).forEach(x=>console.log('  '+x)); }
if (badCall.length)   { console.log(`\nCALL SITE MISMATCH (${badCall.length}):`); badCall.slice(0,10).forEach(x=>console.log('  '+x)); }
process.exit(0);
