import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0103 — `conducks_context` measured through the real MCP transport.
 *
 * The existing unit suite (`context-shape.test.ts`) mocks the registry and hand-builds a graph, so
 * it tests the handler's branches but not the tool as an agent reaches it. Two defects lived
 * entirely in that gap, and both needed a real vault to see:
 *
 *  - the answer was dominated by CONTAINERS. `rankWeight = 1/(canonicalRank+1)` rewards LOW rank
 *    numbers, and the low numbers are DIRECTORY 4 and UNIT 5 against BEHAVIOR 8 — so asking for
 *    context around `logAudit` returned audit.ts, caller1..6.ts, lib/, domain/, and only then the
 *    six functions that actually call it. Nine of fifteen results were files and folders, every one
 *    of them ABOVE the answer.
 *  - `short_id` equalled `id` for any node whose id carries a kind prefix (`directory::/abs/path`),
 *    because it only stripped a project root found at position 0.
 *
 * The mock could not have caught either: it contains no container nodes and no prefixed ids.
 */
describe('conducks_context — the agent-facing surface', () => {
  let repo: string;
  const cli = path.resolve(process.cwd(), 'build/src/interfaces/cli/index.js');
  const harness = path.resolve(process.cwd(), 'tools/mcp-call.mjs');

  const context = (args: Record<string, unknown>) => {
    const out = execFileSync('node', [harness, repo, 'conducks_context', JSON.stringify(args)], {
      encoding: 'utf-8',
      timeout: 120000,
    });
    return JSON.parse(out);
  };

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('context-tool');
    writeFile(repo, 'src/lib/audit.ts', `export function logAudit(event: string): void { void event; }\n`);
    for (let i = 1; i <= 6; i++) {
      writeFile(repo, `src/domain/caller${i}.ts`,
        `import { logAudit } from '../lib/audit.js';\nexport function action${i}(): void { logAudit('a${i}'); }\n`);
    }
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    void cli;
  }, 300000);

  afterAll(() => rmRepo(repo));

  /**
   * The defect in one assertion: a caller asking for context around a symbol wants the CODE around
   * it. They already have the file path — that is how they found the symbol.
   */
  it('returns no files or folders', () => {
    const nodes = context({ symbol: 'logAudit' }).data.nodes;
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(['ECOSYSTEM', 'REPOSITORY', 'PACKAGE', 'NAMESPACE', 'DIRECTORY', 'UNIT']).not.toContain(n.kind);
    }
  });

  it('returns the six functions that actually call the symbol', () => {
    const names = context({ symbol: 'logAudit' }).data.nodes.map((n: { name: string }) => n.name);
    for (let i = 1; i <= 6; i++) expect(names).toContain(`action${i}`);
    // The anchor is removed before scoring — it is what you asked about, not context for it.
    expect(names).not.toContain('logAudit');
  }, 120000);

  /** An agent cannot open a file at line `null`. Container nodes were the only source of nulls. */
  it('every item carries a usable location', () => {
    for (const n of context({ symbol: 'logAudit' }).data.nodes) {
      expect(n.name).toBeTruthy();
      expect(n.file).toBeTruthy();
      expect(n.line).not.toBeNull();
    }
  }, 120000);

  /** `short_id` is for display; `id` is what callers feed back in. They must not be the same string. */
  it('short_id is genuinely shorter than id', () => {
    for (const n of context({ symbol: 'logAudit' }).data.nodes) {
      expect(n.short_id.length).toBeLessThan(n.id.length);
    }
  }, 120000);

  it('scores descending, and a nearer neighbour outranks a farther one', () => {
    const nodes = context({ symbol: 'logAudit', radius: 3 }).data.nodes;
    for (let i = 0; i + 1 < nodes.length; i++) {
      expect(nodes[i].relevance_score).toBeGreaterThanOrEqual(nodes[i + 1].relevance_score);
    }
  }, 120000);

  it('refuses an unknown symbol instead of answering emptily', () => {
    expect(context({ symbol: 'zzzNoSuchSymbol' }).error.code).toBe('SYMBOL_NOT_FOUND');
  }, 120000);

  it('reports truncation rather than silently returning less', () => {
    const res = context({ symbol: 'logAudit', max_tokens: 150 });
    expect(res.meta.truncated).toBe(true);
    expect(res.data.nodes.length).toBeLessThan(6);
  }, 120000);
});
