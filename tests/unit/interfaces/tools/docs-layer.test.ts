import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { synapseTools } from '@/interfaces/tools/tools/synapse.js';
import { kineticTools } from '@/interfaces/tools/tools/kinetic.js';
import { ToolRegistry } from '@/registry/tool-registry.js';

/**
 * ADR 0023 — the docs/code split is a DEPENDENCY boundary, not a label. A docs tool reads authored
 * markdown, so it must answer on a folder that was never analyzed: no graph, no DuckDB, no lock for
 * another agent to queue behind. Before this, `conducks_docs` called `ensureAnchor` and booted the
 * whole registry just to read markdown.
 */
describe('MCP docs layer — markdown only, no graph', () => {
  let root = '';
  const prevRoot = process.env.CONDUCKS_WORKSPACE_ROOT;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'conducks-docslayer-'));
    mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
    mkdirSync(path.join(root, 'docs', 'todos'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'decisions', '0001-x.md'),
      '# 0001 — a decision\nStatus: Accepted\n- Date: 2026-07-26\n\n## Context\nc\n## Decision\nd\n## Consequences\nq\n');
    writeFileSync(path.join(root, 'docs', 'todos', 'todo01.md'),
      '# todo01 — work\nStatus: doing\n- Acceptance: it works\n\n## Phase 1 — p\n- Builds: 0001\n- [ ] the open task\n');
    // The MCP path guard resolves against the workspace root, so point it at the fixture.
    process.env.CONDUCKS_WORKSPACE_ROOT = root;
  });

  afterAll(() => {
    if (prevRoot === undefined) delete process.env.CONDUCKS_WORKSPACE_ROOT;
    else process.env.CONDUCKS_WORKSPACE_ROOT = prevRoot;
    rmSync(root, { recursive: true, force: true });
  });

  it('answers on a folder that was never analyzed, and writes no vault', async () => {
    const res = await synapseTools.conducks_docs.handler({ path: root, layer: 'board' });
    const view = (res as { content?: unknown; data?: any }).data ?? res;
    const payload = JSON.parse(JSON.stringify(view));
    const text = JSON.stringify(payload);

    expect(text).toContain('todo01#P1');       // the board was built
    expect(text).toContain('0001');            // …and the ADR link resolved
    // The whole point: no analysis happened, so no vault was created.
    expect(existsSync(path.join(root, '.conducks'))).toBe(false);
  });

  it('is the only tool on the docs layer; everything else answers from the graph', () => {
    const all = { ...synapseTools, ...kineticTools };
    const docs = Object.values(all).filter(t => (t as { layer?: string }).layer === 'docs').map(t => t.name);
    const code = Object.values(all).filter(t => ((t as { layer?: string }).layer ?? 'code') === 'code');
    expect(docs).toEqual(['conducks_docs']);
    expect(code.length).toBeGreaterThan(10);
    // Every tool declares its side explicitly — an unset layer would silently default to code.
    for (const t of Object.values(all)) expect((t as { layer?: string }).layer).toBeDefined();
  });

  /**
   * The advertised description is the ONLY place an agent learns the vault's concurrency limit, and the
   * limit is counter-intuitive: many agents can read one vault at once, but while a pulse writes it every
   * read FAILS rather than queues (measured — ADR 0032). An agent that does not know that reads a lock
   * error as "conducks is broken" and stops calling the tool.
   */
  describe('the advertised tool list states the concurrency limit', () => {
    const toolRegistry = new ToolRegistry();
    for (const tool of Object.values({ ...synapseTools, ...kineticTools })) toolRegistry.register(tool as never);
    const advertised = toolRegistry.getTools();

    it('warns on every code-layer tool that a running pulse makes reads fail, not queue', () => {
      const code = advertised.filter(t => !(t.description ?? '').includes('[docs layer'));
      expect(code.length).toBeGreaterThan(10);
      for (const t of code) {
        expect(t.description).toMatch(/FAILS? rather than queue/i);
        expect(t.description).toMatch(/conducks_docs/);          // and what still works meanwhile
      }
    });

    it('tells an agent the docs layer is safe for any number of concurrent callers', () => {
      const docs = advertised.filter(t => (t.description ?? '').includes('[docs layer'));
      expect(docs).toHaveLength(1);
      expect(docs[0].description).toMatch(/concurrent/i);
      expect(docs[0].description).toMatch(/opens no database/);
    });
  });
});

/**
 * A monorepo keeps a `docs/` per deployable unit, and a docs tree resolves from ONE path. A tool that
 * silently reads only the root reports a fraction of the authored intent as if it were all of it — the
 * same failure the CLI had, where a root run said "43 governed docs clean" and exited 0 while a broken
 * phase sat unread in `app/docs/`.
 *
 * Trees are returned SEPARATE, never merged: `todo01#P2` only resolves inside its own tree, and merging
 * would lose which unit each address belongs to.
 */
describe('conducks_docs — monorepo and single repo', () => {
  let mono = '';
  let single = '';
  const prevRoot = process.env.CONDUCKS_WORKSPACE_ROOT;

  const seed = (base: string, rel: string) => {
    const dir = path.join(base, rel, 'docs', 'todos');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'todo01.md'),
      '# todo01 — work\n\nStatus: doing\n- Acceptance: it works\n\n## Phase 1 — p\n- [ ] the open task\n');
  };

  beforeAll(() => {
    mono = mkdtempSync(path.join(tmpdir(), 'conducks-mono-'));
    seed(mono, '.');
    seed(mono, 'app');
    seed(mono, 'packages/core');

    single = mkdtempSync(path.join(tmpdir(), 'conducks-single-'));
    seed(single, '.');
  });

  afterAll(() => {
    if (prevRoot === undefined) delete process.env.CONDUCKS_WORKSPACE_ROOT;
    else process.env.CONDUCKS_WORKSPACE_ROOT = prevRoot;
    rmSync(mono, { recursive: true, force: true });
    rmSync(single, { recursive: true, force: true });
  });

  const call = async (root: string, args: Record<string, unknown> = {}) => {
    process.env.CONDUCKS_WORKSPACE_ROOT = root;
    const res = await synapseTools.conducks_docs.handler({ path: root, layer: 'board', ...args });
    return (res as { data?: unknown }).data ?? res;
  };

  it('returns one board per tree for a monorepo', async () => {
    const out = await call(mono) as { monorepo?: boolean; trees?: Record<string, unknown> };

    expect(out.monorepo).toBe(true);
    expect(Object.keys(out.trees ?? {}).sort()).toEqual(['(root)', 'app', 'packages/core']);
  });

  it('returns the board UNWRAPPED for a single repo — the common shape never changes', async () => {
    const out = await call(single) as Record<string, unknown>;

    expect(out.monorepo).toBeUndefined();
    expect(out.trees).toBeUndefined();
    expect(out).toHaveProperty('open');
    expect(out).toHaveProperty('health');
  });

  it('scope="root" gives the single-tree shape even in a monorepo', async () => {
    const out = await call(mono, { scope: 'root' }) as Record<string, unknown>;

    expect(out.trees).toBeUndefined();
    expect(out).toHaveProperty('open');
  });

  it('scope=<unit> reads exactly that unit', async () => {
    const out = await call(mono, { scope: 'app' }) as Record<string, unknown>;

    expect(out.trees).toBeUndefined();
    expect(out).toHaveProperty('open');
  });

  it('an unknown scope is refused, and the error names the trees that exist', async () => {
    process.env.CONDUCKS_WORKSPACE_ROOT = mono;
    const res = await synapseTools.conducks_docs.handler({ path: mono, scope: 'nope' }) as any;

    expect(res.error?.code).toBe('UNKNOWN_SCOPE');
    expect(res.error?.suggestion).toMatch(/app/);
    expect(res.error?.retryable).toBe(false);
  });
});
