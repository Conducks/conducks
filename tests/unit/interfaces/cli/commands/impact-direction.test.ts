/**
 * todo61 — `conducks impact <sym> sideways` silently answered UPSTREAM.
 *
 * The direction is a positional argument read as
 * `args[1] === "downstream" ? "downstream" : "upstream"`, so ANY value that is not exactly
 * "downstream" — a typo, a stray flag, `sideways` — resolves to upstream and the command answers a
 * question nobody asked. It is the same silent substitution fixed on the MCP side in todo53, where
 * `direction: "sideways"` both ran downstream AND echoed the junk back as if it were real.
 *
 * The command already refuses a bad `--depth` for exactly this reason, with a comment saying so: "a
 * depth that does not parse as a positive integer is an error, not a silent default". Two arguments,
 * one rule, applied to one of them.
 *
 * Under the mirror rule (todo61) this matters twice over: the CLI and the tool must answer the same
 * question for the same input, and today one refuses `sideways` while the other analyses upstream.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.unstable_mockModule('@/interfaces/cli/shared/context.js', () => ({
  syncGraph: jest.fn(async () => {}),
}));

// `getImpact` is SYNCHRONOUS here on purpose — the command does not await it, and returning a
// promise would make the falsy check below pass for the wrong reason.
const getImpact = jest.fn(() => ({ affectedNodes: [], impactScore: 0 }));

const node = { id: '/repo/a.ts::sym', properties: { name: 'sym', filePath: '/repo/a.ts' } };
const registry = {
  query: { graph: { getGraph: () => ({
    getNode: () => node,
    findNodesByName: () => [node],
    getAllNodes: () => [node],
  }) } },
  kinetic: { getImpact },
  explain: { calculateCompositeRisk: jest.fn(async () => ({ score: 0, factors: [] })) },
  infrastructure: { persistence: { close: jest.fn(async () => {}) } },
} as never;

const { ImpactCommand } = await import('@/interfaces/cli/commands/impact.js');

describe('conducks impact — an unknown direction is refused, not defaulted', () => {
  let exit: jest.SpiedFunction<typeof process.exit>;
  let err: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();
    exit = jest.spyOn(process, 'exit').mockImplementation((() => { throw new Error('EXIT'); }) as never);
    err = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  const run = async (args: string[]) => {
    try { await new ImpactCommand().execute(args, registry); } catch (e) {
      if ((e as Error).message !== 'EXIT') throw e;
    }
  };

  it('refuses a direction that is neither upstream nor downstream', async () => {
    await run(['someSymbol', 'sideways']);
    expect(exit).toHaveBeenCalled();
    expect(err.mock.calls.flat().join(' ')).toMatch(/upstream|downstream/);
    expect(getImpact).not.toHaveBeenCalled();
  });

  it('names the value it rejected, so a typo is obvious', async () => {
    await run(['someSymbol', 'sidewyas']);
    expect(err.mock.calls.flat().join(' ')).toContain('sidewyas');
  });

  it('still accepts both documented directions', async () => {
    for (const d of ['upstream', 'downstream']) {
      jest.clearAllMocks();
      await run(['someSymbol', d]);
      expect(exit).not.toHaveBeenCalled();
    }
  });

  it('still defaults to upstream when no direction is given at all', async () => {
    await run(['someSymbol']);
    expect(exit).not.toHaveBeenCalled();
  });

  it('does not mistake a FLAG for a direction', async () => {
    await run(['someSymbol', '--json']);
    expect(exit).not.toHaveBeenCalled();
  });
});
