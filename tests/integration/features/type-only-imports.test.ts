import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";

/**
 * A type-only import is erased by the compiler, so it is not a runtime dependency and must not
 * count toward a cycle or a hub finding (ADR 0016). todo48#P3 recorded this as working for TS/TSX
 * and blind in "the other eleven languages" — a scoping claim worth measuring rather than
 * believing, because most of those languages have no type-only import CONSTRUCT to detect.
 *
 * Python is the one real second case: `if TYPE_CHECKING:` imports exist precisely so a name can be
 * annotated without being imported at runtime, and they are the standard fix for an import cycle in
 * Python — which is exactly the finding a type-only edge would otherwise pollute.
 *
 * Marking is INFERRED from use, not from syntax: a binding referenced only in type positions is
 * type-only whatever keyword introduced it. So the fixtures below are written to be unambiguous in
 * both directions, and each language asserts BOTH — a type-only import marked, and a value import
 * left alone. A test that only asserted the first would pass with everything marked type-only.
 */
describe('type-only imports are marked where the language has them', () => {
  let repo: string;
  let vault: SynapsePersistence;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('typeonly');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'to', version: '1.0.0', type: 'module' }));

    writeFile(repo, 'src/shapes.ts', 'export interface Shape { area(): number; }\nexport function draw(): number { return 1; }\n');
    writeFile(repo, 'src/use.ts', `
import { Shape, draw } from './shapes.js';
export function run(s: Shape): number { return draw(); }
`);

    writeFile(repo, 'src/models.py', 'class Order:\n    pass\n');
    writeFile(repo, 'src/helpers.py', 'def compute():\n    return 1\n');
    writeFile(repo, 'src/service.py', `
from typing import TYPE_CHECKING
from helpers import compute

if TYPE_CHECKING:
    from models import Order


def handle(order: "Order") -> int:
    return compute()
`);

    commit(repo, 'type-only and value imports in ts and python');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    vault = new SynapsePersistence(repo, true);
  });

  afterAll(async () => {
    await vault.close();
    rmRepo(repo);
  });

  /** Per-binding IMPORTS edges out of one file. Binding names are stored LOWERCASED (APFS id rule). */
  const imports = async (file: string) => vault.query<{ bindingName: string; isTypeOnly: boolean }>(
    `SELECT json_extract_string(properties, '$.bindingName') AS bindingName,
            json_extract_string(properties, '$.isTypeOnly') = 'true' AS isTypeOnly
     FROM edges WHERE type = 'IMPORTS' AND sourceId LIKE '%${file}%'
       AND json_extract_string(properties, '$.bindingName') IS NOT NULL`);

  it('TypeScript: a binding used only in a type position is type-only, a called one is not', async () => {
    const rows = await imports('use.ts');
    expect(rows.find(r => r.bindingName === 'shape')?.isTypeOnly).toBe(true);
    expect(rows.find(r => r.bindingName === 'draw')?.isTypeOnly).toBe(false);
  });

  it('Python: a TYPE_CHECKING import is type-only, a runtime one is not', async () => {
    const rows = await imports('service.py');
    expect(rows.find(r => r.bindingName === 'order')?.isTypeOnly).toBe(true);
    expect(rows.find(r => r.bindingName === 'compute')?.isTypeOnly).toBe(false);
  });
});
