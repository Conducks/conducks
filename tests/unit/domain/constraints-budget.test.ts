/**
 * `conducks_docs` at its DEFAULT layer returned ~49 KB, and 96% of it was the constraint set.
 *
 * Measured on this repo: 48,966 bytes total, of which `constraints` is 47,488 — 159 memory entries
 * (31,087 bytes) and 41 conventions (16,286). The raw board was capped in todo54 to ~23 KB, so the
 * DEFAULT response was twice the size of the one everybody agreed was too big, and it grows every
 * time a lesson is written down. The tool's own `coverage` sibling documents ~25 KB as what an MCP
 * response carries.
 *
 * Silently dropping constraints is not acceptable — they are the rules an agent must not break, and a
 * truncated list that does not say it is truncated is the same lie this codebase keeps paying for. So
 * the cap REPORTS: what was omitted, and where to read the rest.
 */
import { describe, it, expect } from '@jest/globals';
import { agentView } from '@/lib/domain/analysis/docs-board.js';

const entries = (n: number, size = 200) =>
  Array.from({ length: n }, (_, i) => ({ name: `entry${i}`, Rule: 'x'.repeat(size), Gotcha: 'x'.repeat(size) }));

const board = (conventions: number, memory: number) => ({
  todos: [], decisions: [], lint: [], warns: [], unlinked: [], crossRefs: [],
  other: [
    { type: 'conventions', entries: entries(conventions) },
    { type: 'memory', entries: entries(memory) },
  ],
} as any);

describe('the constraint set is bounded and says what it dropped', () => {
  it('keeps a small constraint set whole and reports nothing omitted', () => {
    const view: any = agentView(board(3, 3), 'all', 0);
    expect(view.constraints.conventions).toHaveLength(3);
    expect(view.constraints.memory).toHaveLength(3);
    expect(view.constraints.omitted).toBeUndefined();
  });

  it('caps a large constraint set and names the count it held back', () => {
    const view: any = agentView(board(41, 159), 'all', 0);
    const size = JSON.stringify(view.constraints).length;
    expect(size).toBeLessThan(20000);
    expect(view.constraints.omitted).toBeDefined();
    expect(view.constraints.omitted.memory).toBeGreaterThan(0);
  });

  it('points at the files that hold the rest, rather than dropping them silently', () => {
    const view: any = agentView(board(41, 159), 'all', 0);
    expect(JSON.stringify(view.constraints.omitted)).toMatch(/memory\.md|conventions\.md/);
  });

  it('keeps the NEWEST entries — a lesson written today outranks one from months ago', () => {
    const view: any = agentView(board(2, 40), 'all', 0);
    // memory.md is appended to, so the last entries are the most recent.
    expect(view.constraints.memory[view.constraints.memory.length - 1]).toContain('entry39');
  });

  it('leaves layer "board" alone — it ships no constraints at all', () => {
    const view: any = agentView(board(41, 159), 'board', 0);
    expect(view.constraints).toBeUndefined();
  });
});
