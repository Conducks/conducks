/**
 * todo61 — `trace`'s `path` mode was reachable from the MCP tool and NOT from the CLI.
 *
 * The tool takes `mode: reachability | execution | path` plus a `target`, and answers the shortest
 * structural path between two symbols. The CLI took `<symbol> [--flow] [--limit] [--json]` and had no
 * way to ask that question at all — so "every MCP tool is a CLI command, and where both exist they
 * mirror" was false for the most useful thing this command does.
 *
 * The refusals mirror the tool's, which todo53 established: an unknown mode is an error rather than a
 * silent fall-through to reachability, and `path` without a `target` is a refusal rather than a
 * reachability answer returned under a request for a path.
 *
 * `--flow` stays CLI-only. The rule is one-directional — every MCP capability must exist on the CLI,
 * not the reverse.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.unstable_mockModule('@/interfaces/cli/shared/context.js', () => ({
  syncGraph: jest.fn(async () => {}),
}));

const A = '/repo/a.ts::alpha';
const B = '/repo/b.ts::beta';
const nodes: Record<string, any> = {
  [A]: { id: A, label: 'BEHAVIOR', properties: { name: 'alpha', filePath: '/repo/a.ts' } },
  [B]: { id: B, label: 'BEHAVIOR', properties: { name: 'beta', filePath: '/repo/b.ts' } },
};

const trace = jest.fn(() => [B]);
const findPath = jest.fn(async () => [A, B]);

// `findNodesByName` is part of the graph contract `resolveSymbol` relies on, and this double did not
// carry it — the command used to resolve with `getNode` plus a one-result `query()` and kept the raw
// input when both missed, which is exactly the silent-empty-trace bug that made it use the shared
// resolver instead. A double missing a method the real graph has does not prove the command works.
const findNodesByName = (name: string) =>
  Object.values(nodes).filter((n) => n.properties.name.toLowerCase() === name.toLowerCase());

const registry = {
  query: {
    graph: { getGraph: () => ({ getNode: (id: string) => nodes[id] ?? null, findNodesByName }) },
    query: jest.fn(async (q: string) => (q === 'alpha' ? [{ id: A }] : q === 'beta' ? [{ id: B }] : [])),
  },
  kinetic: { trace, findPath, flow: () => ({ steps: [] }) },
  infrastructure: { persistence: { close: jest.fn(async () => {}) } },
} as never;

const { TraceCommand } = await import('@/interfaces/cli/commands/trace.js');

describe('conducks trace mirrors the tool: --mode and --target — todo61', () => {
  let exit: jest.SpiedFunction<typeof process.exit>;
  let err: jest.SpiedFunction<typeof console.error>;
  let out: string;

  beforeEach(() => {
    jest.clearAllMocks();
    out = '';
    exit = jest.spyOn(process, 'exit').mockImplementation((() => { throw new Error('EXIT'); }) as never);
    err = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(((s: string) => { out += s; return true; }) as never);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  const run = async (args: string[]) => {
    try { await new TraceCommand().execute(args, registry); } catch (e) {
      if ((e as Error).message !== 'EXIT') throw e;
    }
  };

  it('refuses an unknown mode rather than falling through to reachability', async () => {
    await run(['alpha', '--mode', 'banana']);
    expect(exit).toHaveBeenCalled();
    expect(err.mock.calls.flat().join(' ')).toMatch(/reachability|path/);
    expect(trace).not.toHaveBeenCalled();
  });

  it('refuses --mode path with no --target, instead of answering with reachability', async () => {
    await run(['alpha', '--mode', 'path']);
    expect(exit).toHaveBeenCalled();
    expect(err.mock.calls.flat().join(' ')).toMatch(/target/i);
    expect(findPath).not.toHaveBeenCalled();
  });

  it('walks the shortest path when both are given', async () => {
    await run(['alpha', '--mode', 'path', '--target', 'beta', '--json']);
    expect(exit).not.toHaveBeenCalled();
    expect(findPath).toHaveBeenCalled();
    expect(JSON.parse(out).mode).toBe('path');
  });

  it('accepts "execution" as the deprecated alias, like the tool (ADR 0066)', async () => {
    await run(['alpha', '--mode', 'execution', '--json']);
    expect(exit).not.toHaveBeenCalled();
    expect(trace).toHaveBeenCalled();
  });

  it('still traces reachability with no mode at all', async () => {
    await run(['alpha', '--json']);
    expect(exit).not.toHaveBeenCalled();
    expect(trace).toHaveBeenCalled();
  });

  it('does not mistake --target\'s VALUE for the symbol to trace', async () => {
    await run(['alpha', '--target', 'beta', '--mode', 'path', '--json']);
    expect(JSON.parse(out).symbolId).toBe(A);
  });

  it('traces from the RESOLVED id, never from the raw input string', async () => {
    // The bug this replaces: when `getNode(input)` missed and the one-result `query()` found
    // nothing, the raw input was kept and the walk started from an id no node is keyed by — so the
    // command printed its heading with no steps under it, which reads as "this symbol depends on
    // nothing" rather than "the symbol was never found".
    //
    // MEASURED on a two-file Python fixture whose `run` calls `used_fn` over a direct CALLS edge:
    // `trace pkg/main.py::run` printed nothing, `impact` on the same symbol reported the call, and
    // the same command handed the fully-qualified id returned six steps.
    await run(['alpha', '--json']);
    expect(JSON.parse(out).symbolId).toBe(A);
    expect((trace.mock.calls[0] as unknown[])[0]).toBe(A);
  });

  it('REFUSES an unknown symbol instead of printing an empty trace', async () => {
    await run(['no_such_symbol', '--json']);
    expect(exit).toHaveBeenCalled();
    expect(trace).not.toHaveBeenCalled();
    // Silence and absence used to be identical here: an empty step list is what a real symbol with
    // no dependencies looks like, so a lookup that never landed was indistinguishable from an
    // answer (ADR 0044).
    expect(out).toBe('');
  });
});
