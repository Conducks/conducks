/**
 * todo61 — the MCP tool could filter dead-code findings by type and cap the list; the CLI could not.
 *
 * `conducks_prune` takes `type` (validated against DEAD_CODE_TYPES, plus `all`) and `limit`. The CLI
 * took `[--json]` and nothing else, so "show me only the stale imports" was answerable from one
 * surface only — and the two surfaces answering different questions for the same intent is what the
 * mirror rule exists to stop.
 *
 * The type list is `contracts/dead-code-types.ts`, the same constant the tool's enum spreads, so a
 * sixth finding type reaches both surfaces at once rather than being remembered into one of them
 * (todo53 — the tool used to hard-code three of five, and its summary totalled 95 against a stated
 * total of 99).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DEAD_CODE_TYPES } from '@/contracts/dead-code-types.js';

jest.unstable_mockModule('@/interfaces/cli/shared/context.js', () => ({
  syncGraph: jest.fn(async () => {}),
}));

const findings = [
  { type: 'ORPHAN', symbol: 'a', file: '/repo/a.ts', message: 'x' },
  { type: 'ORPHAN', symbol: 'b', file: '/repo/b.ts', message: 'x' },
  { type: 'STALE_IMPORT', symbol: 'c', file: '/repo/c.ts', message: 'x' },
  { type: 'UNIMPORTED_MODULE', symbol: 'd', file: '/repo/d.ts', message: 'x' },
];

const registry = {
  explain: { prune: () => findings },
  infrastructure: { persistence: { close: jest.fn(async () => {}) } },
} as never;

const { PruneCommand } = await import('@/interfaces/cli/commands/prune.js');

describe('conducks prune mirrors the tool: --type and --limit — todo61', () => {
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
    try { await new PruneCommand().execute(args, registry); } catch (e) {
      if ((e as Error).message !== 'EXIT') throw e;
    }
  };

  it('filters to one finding type', async () => {
    await run(['--type', 'ORPHAN', '--json']);
    const got = JSON.parse(out);
    expect(got).toHaveLength(2);
    expect(got.every((f: any) => f.type === 'ORPHAN')).toBe(true);
  });

  it('accepts every type the domain can emit, so a new one is not a CLI-only gap', async () => {
    for (const t of DEAD_CODE_TYPES) {
      out = ''; jest.clearAllMocks();
      await run(['--type', t, '--json']);
      expect(exit).not.toHaveBeenCalled();
    }
  });

  it('refuses a type that is not a finding type, naming the valid ones', async () => {
    await run(['--type', 'BOGUS', '--json']);
    expect(exit).toHaveBeenCalled();
    expect(err.mock.calls.flat().join(' ')).toContain('ORPHAN');
  });

  it('treats "all" as no filter, like the tool', async () => {
    await run(['--type', 'all', '--json']);
    expect(JSON.parse(out)).toHaveLength(findings.length);
  });

  it('caps the list with --limit', async () => {
    await run(['--limit', '2', '--json']);
    expect(JSON.parse(out)).toHaveLength(2);
  });

  it('refuses a limit that is not a positive integer, rather than defaulting', async () => {
    await run(['--limit', 'lots', '--json']);
    expect(exit).toHaveBeenCalled();
  });

  it('still returns everything with no flags', async () => {
    await run(['--json']);
    expect(JSON.parse(out)).toHaveLength(findings.length);
  });

  it('keeps the verdict/question split (ADR 0104)', async () => {
    await run(['--json']);
    const got = JSON.parse(out);
    expect(got.find((f: any) => f.type === 'UNIMPORTED_MODULE').claim).toBe('question');
    expect(got.find((f: any) => f.type === 'ORPHAN').claim).toBe('verdict');
  });
});
