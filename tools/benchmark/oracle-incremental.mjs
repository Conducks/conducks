#!/usr/bin/env node
/**
 * Conducks — is an incremental pulse the same graph as a cold one? 🏺
 *
 * `analyze` is incremental by mtime: a file untouched since the last pulse is not re-parsed. That is
 * the whole reason the tool is usable on a large repository, and it is also a standing invariant
 * nothing checked — **the graph after an incremental pulse must equal the graph after a cold one.**
 *
 * The failure mode is the worst kind. An incremental graph that is missing edges answers every
 * question CONFIDENTLY and slightly wrongly, and nothing downstream can tell: `prune` reports a
 * symbol dead because its caller was not re-parsed, `impact` reports a smaller blast radius, `trace`
 * stops early. ADR 0107 records this happening — import specifiers were resolved against the DIRTY
 * set, so on an incremental run the file being imported FROM was absent and the edge was never made.
 *
 * It is also the defect a suite cannot see. Every test analyzes once, from empty, so every test runs
 * the cold path. ADR 0107's own lesson: *run it twice, with an edit in between.*
 *
 * THE ORACLE IS CONDUCKS ITSELF, in its other mode. Not an independent parser — the question is not
 * "is the graph right" but "does one mode agree with the other", and the cold pulse is the reference
 * because it re-reads everything. A disagreement is a defect whichever side is wrong.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { DuckDBInstance } from '@duckdb/node-api';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

async function snapshot(repo) {
  const db = await DuckDBInstance.create(path.join(repo, '.conducks', 'conducks-synapse.db'));
  const conn = await db.connect();
  const n = await (await conn.run(`SELECT id FROM nodes`)).getRowObjects();
  const e = await (await conn.run(`SELECT sourceId, targetId, type FROM edges`)).getRowObjects();
  try { conn.closeSync?.(); db.closeSync?.(); } catch { /* read is done */ }
  return {
    nodes: new Set(n.map(x => String(x.id))),
    edges: new Set(e.map(x => `${x.sourceId}|${x.targetId}|${x.type}`)),
  };
}

const analyze = (repo, cold) =>
  execFileSync('node', [CLI, 'analyze', ...(cold ? ['--force'] : []), '--yes'],
    { cwd: repo, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });

/**
 * Each case is a WAVE: a first state, then an edit. The edit shapes are the ones ADR 0107 named —
 * a new file importing an existing one is the exact case that lost its IMPORTS edge.
 */
const CASES = [
  {
    name: 'a new file importing an existing one',
    first: {
      'src/lib.ts': `export function helper(): number { return 1; }\n`,
      'src/main.ts': `import { helper } from './lib.js';\nexport function boot(): number { return helper(); }\n`,
    },
    then: {
      'src/added.ts': `import { helper } from './lib.js';\nexport function added(): number { return helper() + 1; }\n`,
      'src/main.ts': `import { helper } from './lib.js';\nimport { added } from './added.js';\nexport function boot(): number { return helper() + added(); }\n`,
    },
  },
  {
    name: 'an existing file gaining a call into another',
    first: {
      'src/a.ts': `export function one(): number { return 1; }\n`,
      'src/b.ts': `export function two(): number { return 2; }\n`,
      'src/main.ts': `import { one } from './a.js';\nexport function boot(): number { return one(); }\n`,
    },
    then: {
      'src/a.ts': `import { two } from './b.js';\nexport function one(): number { return two(); }\n`,
    },
  },
  {
    name: 'the same wave in Python',
    first: {
      'src/pkg/__init__.py': ``,
      'src/pkg/lib.py': `def helper():\n    return 1\n`,
      'src/main.py': `from pkg.lib import helper\n\n\ndef boot():\n    return helper()\n`,
    },
    then: {
      'src/pkg/added.py': `from pkg.lib import helper\n\n\ndef added():\n    return helper() + 1\n`,
      'src/main.py': `from pkg.lib import helper\nfrom pkg.added import added\n\n\ndef boot():\n    return helper() + added()\n`,
    },
  },
  {
    name: 'THREE waves, with external scaffolding',
    why: 'the standing open defect names multi-wave projects and ~25 nodes of external scaffolding. A single edit is not that shape, and the first three cases here are single edits',
    first: {
      'src/base.ts': `import { readFileSync } from 'node:fs';\nexport function readIt(p: string): string { return readFileSync(p, 'utf8'); }\n`,
      'src/main.ts': `import { readIt } from './base.js';\nexport function boot(): string { return readIt('x'); }\n`,
    },
    waves: [
      {
        'src/mid.ts': `import { readIt } from './base.js';\nimport path from 'node:path';\nexport function mid(p: string): string { return readIt(path.resolve(p)); }\n`,
        'src/main.ts': `import { readIt } from './base.js';\nimport { mid } from './mid.js';\nexport function boot(): string { return readIt('x') + mid('y'); }\n`,
      },
      {
        'src/top.ts': `import { mid } from './mid.js';\nimport { EOL } from 'node:os';\nexport function top(p: string): string { return mid(p) + EOL; }\n`,
        'src/main.ts': `import { readIt } from './base.js';\nimport { mid } from './mid.js';\nimport { top } from './top.js';\nexport function boot(): string { return readIt('x') + mid('y') + top('z'); }\n`,
      },
      {
        'src/base.ts': `import { readFileSync, existsSync } from 'node:fs';\nexport function readIt(p: string): string { return existsSync(p) ? readFileSync(p, 'utf8') : ''; }\n`,
      },
    ],
  },
];

function write(repo, files) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(repo, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
}

console.log(`\n--- an incremental pulse vs a cold one ---\n`);
let failures = 0;
for (const c of CASES) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-inc-'));
  try {
    write(repo, c.first);
    for (const cmd of [['init'], ['config', 'user.email', 'b@b'], ['config', 'user.name', 'b'], ['add', '-A'], ['commit', '-m', 'i']]) {
      execFileSync('git', cmd, { cwd: repo, stdio: 'ignore' });
    }
    analyze(repo, true);

    // THE EDITS, each followed by an INCREMENTAL pulse — the path every test skips. A case may carry
    // one edit (`then`) or several (`waves`); the defect this exists for is named on MULTI-wave
    // projects, and one edit is not that shape.
    for (const w of (c.waves ?? [c.then])) {
      write(repo, w);
      analyze(repo, false);
    }
    const inc = await snapshot(repo);

    // The same tree, read from scratch. This is the reference.
    analyze(repo, true);
    const cold = await snapshot(repo);

    const missNodes = [...cold.nodes].filter(x => !inc.nodes.has(x));
    const missEdges = [...cold.edges].filter(x => !inc.edges.has(x));
    const extraNodes = [...inc.nodes].filter(x => !cold.nodes.has(x));
    const extraEdges = [...inc.edges].filter(x => !cold.edges.has(x));
    const bad = missNodes.length + missEdges.length + extraNodes.length + extraEdges.length;

    if (bad === 0) {
      console.log(`  ✓ ${c.name}  (${cold.nodes.size} nodes, ${cold.edges.size} edges, identical)`);
    } else {
      failures++;
      console.log(`  ✖ ${c.name}`);
      console.log(`      cold ${cold.nodes.size}n/${cold.edges.size}e   incremental ${inc.nodes.size}n/${inc.edges.size}e`);
      for (const x of missNodes.slice(0, 3)) console.log(`      MISSING NODE ${String(x).slice(-64)}`);
      for (const x of missEdges.slice(0, 4)) console.log(`      MISSING EDGE ${String(x).split('|').map(s => s.slice(-30)).join(' -> ')}`);
      for (const x of extraNodes.slice(0, 3)) console.log(`      EXTRA NODE   ${String(x).slice(-64)}`);
      for (const x of extraEdges.slice(0, 3)) console.log(`      EXTRA EDGE   ${String(x).split('|').map(s => s.slice(-30)).join(' -> ')}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n  ${CASES.length - failures} of ${CASES.length} waves agree.`);
if (failures > 0) {
  console.error(`\n✖ an incremental pulse does not produce the graph a cold one does.\n`);
  process.exit(1);
}
console.log(`\n✓ an incremental pulse produces exactly the graph a cold pulse does.\n`);
