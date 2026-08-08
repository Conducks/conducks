import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A tool description must not tell an agent to call a tool that does not exist.
 *
 * FOUND while walking the MCP surface: `conducks_rename` — a DESTRUCTIVE tool — ended its description
 * with "AFTER THIS: Run conducks_analyze to refresh the structural resonance graph." There is no
 * `conducks_analyze` tool. An agent that had just mutated source code was directed at a call that
 * fails, and the graph it was told to refresh stayed stale, still holding the old name. Re-indexing
 * is a CLI step, because the MCP server holds a read-only vault by policy.
 *
 * This is the "documented feature nothing implements" class: `--mode map` shipped in the docs skill
 * while no such mode existed, and the `*` inventory query answered "no symbols found" for a
 * documented feature. A description is a CONTRACT with the agent, and nothing checked it against the
 * surface it describes.
 *
 * Source text rather than a live server on purpose: this must fail at the point someone WRITES the
 * bad reference, not only when a server happens to be running.
 */
describe('every conducks_* named in agent-facing text is a real tool', () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const TOOLS_DIR = path.resolve(HERE, '../../../../src/interfaces/tools/tools');

  /** Tool ids, read from the source that defines them — never a hand-maintained list (CONDUCKS-9). */
  const registered = (): Set<string> => {
    const names = new Set<string>();
    for (const f of readdirSync(TOOLS_DIR).filter(f => f.endsWith('.ts'))) {
      const src = readFileSync(path.join(TOOLS_DIR, f), 'utf8');
      // The declaration form: a key in the exported tools object, e.g. `conducks_impact: {`
      for (const m of src.matchAll(/^\s{2}(conducks_[a-z_]+):\s*\{/gm)) names.add(m[1]);
    }
    return names;
  };

  /** Every conducks_* appearing in a `description:` template literal — what the agent actually reads. */
  const mentionedInDescriptions = (): Array<{ file: string; name: string }> => {
    const found: Array<{ file: string; name: string }> = [];
    for (const f of readdirSync(TOOLS_DIR).filter(f => f.endsWith('.ts'))) {
      const src = readFileSync(path.join(TOOLS_DIR, f), 'utf8');
      for (const d of src.matchAll(/description:\s*`((?:[^`\\]|\\.)*)`/g)) {
        for (const m of d[1].matchAll(/conducks_[a-z_]+/g)) found.push({ file: f, name: m[0] });
      }
    }
    return found;
  };

  it('the registry parse finds the real surface — otherwise this whole suite is vacuous', () => {
    const names = registered();
    // Guard against the check silently passing because it parsed nothing, which is exactly the
    // failure mode this repository keeps rediscovering.
    expect(names.size).toBeGreaterThanOrEqual(10);
    expect(names.has('conducks_rename')).toBe(true);
    expect(names.has('conducks_impact')).toBe(true);
  });

  it('the description scan actually reads text — a zero-mention pass would prove nothing', () => {
    expect(mentionedInDescriptions().length).toBeGreaterThan(0);
  });

  it('no description points at a tool the server does not register', () => {
    const names = registered();
    const bad = mentionedInDescriptions().filter(m => !names.has(m.name));
    expect(bad.map(b => `${b.file}: ${b.name}`)).toEqual([]);
  });

  it('rename directs the agent at the CLI, since re-indexing cannot be a tool', () => {
    const src = readFileSync(path.join(TOOLS_DIR, 'kinetic.ts'), 'utf8');
    const desc = /conducks_rename[\s\S]*?description:\s*`([\s\S]*?)`/.exec(src)?.[1] ?? '';
    expect(desc).toMatch(/conducks analyze/);
    // The specific broken instruction, so this test names what it is preventing.
    expect(desc).not.toMatch(/conducks_analyze/);
  });

  it('the tool docs directory names no phantom tool either', () => {
    // `src/resources/tools/<name>.md` overrides a tool's description at load time (hypertoon), so a
    // phantom reference there reaches the agent by the same route.
    const docs = path.resolve(HERE, '../../../../src/resources/tools/tools');
    if (!existsSync(docs)) return;                       // nothing to check, and it says so
    const names = registered();
    const bad: string[] = [];
    for (const f of readdirSync(docs).filter(f => f.endsWith('.md'))) {
      const text = readFileSync(path.join(docs, f), 'utf8');
      for (const m of text.matchAll(/conducks_[a-z_]+/g)) if (!names.has(m[0])) bad.push(`${f}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
});
