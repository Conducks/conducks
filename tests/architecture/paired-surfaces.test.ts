/**
 * A question must not have two answers depending on which door it came through.
 *
 * Twelve capabilities exist on BOTH surfaces — `conducks diff` and `conducks_diff`, `conducks prune`
 * and `conducks_prune`, and so on. Four times in one day (2026-08-09) a fix landed on one and never
 * reached its twin, and the twin had silently absorbed none of the other's history:
 *
 *   - `diff` — the MCP copy had received NEITHER of the CLI's two fixes and reported 0 impacted
 *     symbols where the CLI reported 7, on the same tree at the same moment
 *   - `docs` — the denominator was hand-written in two CLI commands and absent from the tool, so a
 *     project with no docs/ read as healthy
 *   - `resolveSymbolId` — four copies inside the MCP layer alone
 *   - the dead-code type list — four copies, and the summary stopped adding up to its own total
 *
 * The layer rule (`boundaries.test.ts`) works because a TEST enforces it. "One owner per fact" was
 * only ever a habit, and habits lost four times. This is the same idea applied to the pairs: if the
 * two surfaces answer the same question, they must reach the same domain code to do it.
 *
 * The check is deliberately WEAK — one shared `registry.*` accessor is enough. A strong version would
 * need the call graph and would fail on legitimate differences in presentation. Weak and enforced
 * beats strong and aspirational: every defect above would have been caught by this.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// Resolved from the repo root, as `boundaries.test.ts` does — ESM has no `__dirname`.
const SRC = path.resolve('src');
const CLI_DIR = path.join(SRC, 'interfaces/cli/commands');
const TOOLS_DIR = path.join(SRC, 'interfaces/tools/tools');

/**
 * Pairs that legitimately do NOT share domain code, each with a reason and a record.
 *
 * Kept as a list rather than deleted from the check, so granting the next one is a visible diff —
 * the same discipline `boundaries.test.ts` uses for its (still empty) exception array.
 */
const GRANTED: ReadonlyArray<{ pair: string; why: string }> = [
  // EMPTY, and it stays declared so that granting one is a visible diff — the discipline
  // `boundaries.test.ts` uses for its own (still empty) exception array.
  //
  // `context` was the one entry. It was not drift but two different features under one name: a
  // directional flow trace with source lines against a scored BFS with a token budget. todo57
  // extracted the BFS into `registry.kinetic.context`, both surfaces call it, and the CLI keeps
  // source lines as the rendering ADR 0148 names. Measured before: 2,407 entries against 83, sharing
  // 44 names. Measured after: identical `total_in_radius`, the tool's list a prefix of the CLI's.
];

const accessors = (text: string): Set<string> => {
  const found = new Set<string>();
  for (const m of text.matchAll(/registry\.(\w+)\.(\w+)/g)) found.add(`${m[1]}.${m[2]}`);
  return found;
};

const mcpTools = (): Map<string, string> => {
  const all = fs.readdirSync(TOOLS_DIR)
    .filter(f => f.endsWith('.ts'))
    .map(f => fs.readFileSync(path.join(TOOLS_DIR, f), 'utf8'))
    .join('\n');
  const parts = all.split(/\n {2}(conducks_\w+): \{/);
  const out = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i].replace('conducks_', ''), parts[i + 1]);
  return out;
};

const pairs = (): Array<{ name: string; cli: Set<string>; mcp: Set<string> }> => {
  const tools = mcpTools();
  const out: Array<{ name: string; cli: Set<string>; mcp: Set<string> }> = [];
  for (const [name, toolBody] of tools) {
    const cliFile = path.join(CLI_DIR, `${name}.ts`);
    if (!fs.existsSync(cliFile)) continue;             // MCP-only tool: nothing to drift from
    out.push({ name, cli: accessors(fs.readFileSync(cliFile, 'utf8')), mcp: accessors(toolBody) });
  }
  return out;
};

describe('paired CLI/MCP surfaces answer through the same domain code', () => {
  it('finds the pairs at all — a check that scans nothing passes for the wrong reason', () => {
    expect(pairs().length).toBeGreaterThanOrEqual(10);
  });

  it('every pair shares at least one registry accessor', () => {
    const granted = new Set(GRANTED.map(g => g.pair));
    const split = pairs()
      .filter(p => !granted.has(p.name))
      .filter(p => [...p.cli].every(a => !p.mcp.has(a)))
      .map(p => `${p.name}: CLI uses [${[...p.cli].join(', ')}] and the tool uses [${[...p.mcp].join(', ')}] — no overlap`);
    expect(split).toEqual([]);
  });

  it('every granted exception names a real pair, so the list cannot rot', () => {
    const names = new Set(pairs().map(p => p.name));
    for (const g of GRANTED) expect(names.has(g.pair)).toBe(true);
  });
});
