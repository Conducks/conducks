import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DriftEngine } from '@/lib/domain/evolution/drift-engine.js';
import type { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ConducksReflector } from "@/lib/core/parsing/index.js";
import { AnalyzeContext } from "@/lib/core/parsing/index.js";

/**
 * todo26 — the structural DNA columns todo4 declared finished.
 *
 * Two independent gaps, proven by measuring the live vault (docs/todos/todo26.md):
 *
 * 1. drift-engine.ts treated an ABSENT fingerprint as an UNCHANGED one. `null !== null` is false
 *    in JS, so a node_history row with no fingerprint on either side reported isModified=false —
 *    and the velocity filter then dropped it from `deltas` entirely, so it never appeared in
 *    output at all. Same class of bug as ADR 0044 ("a check that ran on nothing is not a pass"),
 *    on drift's OTHER join key.
 *
 * 2. reflector.ts left real declarations without a fingerprint: an HTTP route/request virtual
 *    node (FlowProcessor pushes these straight onto spectrum.nodes, bypassing the nodeCache path
 *    that computes fingerprint/layer_path for every other definition), and a Gnosis-fallback
 *    class/function (the regex extractor never computed either field at all). Both are real,
 *    file-backed symbols — todo26 Phase 0 exempts only UNIT/DIRECTORY/ECOSYSTEM/REPOSITORY, not
 *    these.
 */

// ─── Part 1: drift-engine must not read a fingerprint gap as "stable" ─────────────────────────

function mockPersistence(rows: {
  pulses: Array<{ id: string; timestamp: number }>;
  exact: any[];
  moves?: any[];
}): SynapsePersistence {
  let call = 0;
  const query = async (sql: string) => {
    if (sql.includes('FROM pulses')) return rows.pulses;
    if (sql.includes('JOIN node_history p ON c.fingerprint = p.fingerprint')) return rows.moves ?? [];
    if (sql.includes('FROM node_history c')) return rows.exact;
    return [];
  };
  return { query } as unknown as SynapsePersistence;
}

describe('DriftEngine — a NULL fingerprint is a gap, not a pass', () => {
  const pulses = [{ id: 'p2', timestamp: 200 }, { id: 'p1', timestamp: 100 }];

  it('a row with no fingerprint on either side is NOT silently dropped from deltas', async () => {
    const persistence = mockPersistence({
      pulses,
      exact: [{
        id: 'n1', name: 'legacyUnit', file: 'a.ts',
        current_fingerprint: null, prev_fingerprint: null,
        current_gravity: 1, prev_gravity: 1,
        current_complexity: 1, prev_complexity: 1,
      }],
    });
    const result = await new DriftEngine(persistence).compare();

    // This is the RED-before-fix assertion: with the unfixed filter
    // (`Math.abs(velocity) > 0.001 || isModified`), a gap row with zero gravity/complexity delta
    // and isModified=false (null !== null is false) never reaches `deltas` — length would be 0.
    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0].identityGap).toBe(true);
    // A gap is not a confirmed "no change" — it must not be reported as a structural shift either,
    // since nothing was actually compared.
    expect(result.deltas[0].isModified).toBe(false);
  });

  it('a real fingerprint change is still reported as modified, gap-free', async () => {
    const persistence = mockPersistence({
      pulses,
      exact: [{
        id: 'n2', name: 'realChange', file: 'b.ts',
        current_fingerprint: 'aaa', prev_fingerprint: 'bbb',
        current_gravity: 1, prev_gravity: 1,
        current_complexity: 1, prev_complexity: 1,
      }],
    });
    const result = await new DriftEngine(persistence).compare();

    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0].identityGap).toBe(false);
    expect(result.deltas[0].isModified).toBe(true);
  });

  it('a matching fingerprint on both sides is unmodified AND not a gap', async () => {
    const persistence = mockPersistence({
      pulses,
      exact: [{
        id: 'n3', name: 'stableSymbol', file: 'c.ts',
        current_fingerprint: 'same', prev_fingerprint: 'same',
        current_gravity: 1, prev_gravity: 1,
        current_complexity: 1, prev_complexity: 1,
      }],
    });
    const result = await new DriftEngine(persistence).compare();

    // A row with real velocity change would still appear via the velocity clause; here both are
    // equal so this also proves the filter's `d.identityGap` branch isn't swallowing genuinely
    // stable, fully-compared rows into the output by accident.
    expect(result.deltas).toHaveLength(0);
  });

  it('the summary and message surface the gap count rather than staying silent about it', async () => {
    const persistence = mockPersistence({
      pulses,
      exact: [{
        id: 'n1', name: 'legacyUnit', file: 'a.ts',
        current_fingerprint: null, prev_fingerprint: null,
        current_gravity: 1, prev_gravity: 1,
        current_complexity: 1, prev_complexity: 1,
      }],
    });
    const result = await new DriftEngine(persistence).compare();

    expect(result.summary?.identity_gap_count).toBe(1);
    expect(result.message).toMatch(/no fingerprint/i);
  });
});

// ─── Part 2: reflector.ts — real symbols must not be left without a fingerprint ────────────────

// REMOVED with the Gnosis regex fallback (ADR 0089). The native describe below asserts the same
// two properties — a fingerprint and a layer_path on every emitted node — against the path that is
// actually taken.

// ─── Part 3: full native pipeline — UNIT.unitId is null, and a route gets a fingerprint ───────

const ROUTE_SOURCE = `
export function handler(req, res) { res.send('ok'); }
app.get('/users', handler);
`;

const CHILD = `
(async () => {
  const [filePath, source] = JSON.parse(process.argv[1]);
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');
  const { TypeScriptProvider } = await import('./src/lib/core/parsing/languages/typescript/index.ts');

  await grammars.loadLanguage('typescript');
  const file = { path: filePath, source };
  const s = await new ConducksReflector().reflect(file, new TypeScriptProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    nodes: s.nodes.map((n) => ({
      name: n.name,
      canonicalKind: n.canonicalKind,
      unitId: (n.metadata && n.metadata.unitId) ?? null,
      fingerprint: (n.metadata && n.metadata.fingerprint) ?? null,
      layer_path: (n.metadata && n.metadata.layer_path) ?? null,
    })),
  }));
})();
`;

type Node = { name: string; canonicalKind: string; unitId: string | null; fingerprint: string | null; layer_path: string | null };
let nodes: Node[] = [];

beforeAll(() => {
  const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const out = execFileSync(tsx, ['-e', CHILD, JSON.stringify(['/repo/a.ts', ROUTE_SOURCE])], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const line = out.split('\n').find(l => l.includes('__RESULT__'));
  if (!line) throw new Error(`reflect child produced no result:\n${out}`);
  nodes = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length)).nodes;
});

describe('ConducksReflector — native path: UNIT identity and route fingerprints', () => {
  it('parses the fixture at all', () => {
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('the UNIT (file) node has unitId=null — it IS the unit, it does not belong to one', () => {
    const unit = nodes.find(n => n.canonicalKind === 'UNIT');
    expect(unit).toBeDefined();
    expect(unit!.unitId).toBeNull();
  });

  // ADR 0064: a UNIT is exempt from `fingerprint` by design — its identity is already its own
  // file path, and the hash's inputs (name + dna) don't describe a file. This pins that as an
  // intentional absence so nobody "fixes" it into a redundant hash of the path later.
  it('the UNIT (file) node has NO fingerprint — exempt by design (ADR 0064), not a gap', () => {
    const unit = nodes.find(n => n.canonicalKind === 'UNIT');
    expect(unit).toBeDefined();
    expect(unit!.fingerprint).toBeNull();
  });

  it('a virtual ROUTE node gets a fingerprint and a layer_path, same as any other definition', () => {
    const route = nodes.find(n => n.name.startsWith('ROUTE::'));
    expect(route).toBeDefined();
    expect(route!.fingerprint).toBeTruthy();
    expect(route!.layer_path).toBeTruthy();
  });

  it('a real function symbol still gets its own unitId pointing at the containing file', () => {
    const handler = nodes.find(n => n.name === 'handler');
    expect(handler).toBeDefined();
    expect(handler!.unitId).toBe('/repo/a.ts::unit');
  });
});
