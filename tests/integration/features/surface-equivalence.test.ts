import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * todo61#P2 — the pairs gate checks STRUCTURE; this checks the ANSWER.
 *
 * `paired-surfaces.test.ts` asserts that a capability on both surfaces reaches a shared `registry.*`
 * accessor. That is deliberately weak (its own comment says so) and it cannot see the failure that
 * started todo61: two surfaces reaching the same code and still returning different things, because
 * one truncates, or renders a field the other omits, or defaults an argument differently.
 * `conducks_rename` wrote to disk while the CLI dry-ran, and both "reached the same accessor".
 *
 * So this drives BOTH doors on the same vault at the same moment and compares what comes back.
 *
 * Rendering differs by design (ADR 0148) — the CLI prints source lines for `context`, the tool
 * carries a token budget — so the comparison is on the ANSWER: the set of findings, the status, the
 * counts. Never the payload shape, which is allowed to differ and always will.
 *
 * The MCP side is driven over real stdio JSON-RPC via `tools/mcp-call.mjs`, the same path an agent
 * takes. A mocked handler has no server, no framing and no vault, which is exactly how the pipelined
 * -call defects of todo52 stayed invisible to a green unit suite.
 */

const CALL = path.resolve('tools/mcp-call.mjs');

/**
 * One MCP tool call over stdio. Returns the WHOLE envelope, not `data`, because a refusal comes back
 * as `{ error: { code, message, ... } }` with no `data` at all — and a helper that reached straight
 * for `data` reported the refusal as an empty answer, which is how the first cut of the third case
 * here failed for the wrong reason.
 */
function mcp(repo: string, tool: string, args: Record<string, unknown> = {}): any {
  const out = execFileSync('node', [CALL, repo, tool, JSON.stringify(args)], {
    encoding: 'utf-8',
    timeout: 120000,
  });
  return JSON.parse(out);
}

describe('the two surfaces answer the same question (todo61#P2)', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('surface-equivalence');

    // Deliberately mixed, so the findings are not all one type: a dead export, a dead exported VALUE
    // (todo63), a live symbol, and a stale import to give `prune` something of each kind to disagree
    // about if the two paths ever diverge.
    writeFile(repo, 'src/lib.ts', `
export function usedFn(): number { return 1; }
export function deadFn(): number { return 2; }
export const deadValue = 3;
`);
    writeFile(repo, 'src/main.ts', `
import { usedFn, deadValue } from './lib.js';
export function main(): number { return usedFn(); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    // A SECOND pulse, or `drift` has nothing to compare against and answers INSUFFICIENT_DATA with
    // zero deltas — which made the delta comparison below compare [] to [] and pass no matter what.
    // Caught by mutating the CLI's truncation limit to 3 and watching the test stay green.
    writeFile(repo, 'src/lib.ts', `
export function usedFn(): number { return 1 + 1; }
export function deadFn(): number { return 2; }
export const deadValue = 3;
export function addedLater(): number { return 4; }
`);
    commit(repo, 'second');
    runCli(['analyze', '--yes', '--force'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('prune returns the same finding set through both doors', () => {
    const cli = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout) as Array<{ type: string; symbol: string }>;
    const tool = mcp(repo, 'conducks_prune').data.findings as Array<{ type: string; symbol: string }>;

    // Compared as a SET of type+symbol, sorted: order is rendering, membership is the answer.
    const key = (f: { type: string; symbol: string }) => `${f.type}::${f.symbol}`;
    expect(tool.map(key).sort()).toEqual(cli.map(key).sort());

    // Guard the guard: an empty answer would make the assertion above pass while proving nothing —
    // the exact shape of vacuous test todo56 found in the referential-integrity check.
    expect(cli.length).toBeGreaterThan(0);
  }, 180000);

  it('drift returns the same verdict through both doors', () => {
    // The pair todo61 opened over — and the todo had it WRONG. It read "MCP has drift, the CLI does
    // not" from comparing the `diff` command's flags against the `conducks_diff` tool's parameters.
    // `conducks drift` already existed, on the same `registry.evolution.compare()`, under a different
    // command name. What was actually missing was `--json`: without a machine surface the two answers
    // could only be compared by reading rendered text. Compare what a user can ASK (ADR 0148).
    const cli = JSON.parse(runCli(['drift', '--json'], { cwd: repo }).stdout);
    const envelope = mcp(repo, 'conducks_diff', { mode: 'drift' });
    const tool = envelope.data;

    expect(cli.status).toBe(tool.status);
    expect(cli.summary).toEqual(tool.summary);
    expect(cli.deltas.map((d: any) => d.id).sort()).toEqual(tool.deltas.map((d: any) => d.id).sort());
    // Truncation is part of the ANSWER — a bounded answer must say it is bounded (ADR 0091) — but the
    // two carry it in different envelopes: the tool in `meta`, the CLI in its payload. Same fact,
    // different rendering, so it is compared across the envelopes rather than field-for-field.
    expect(cli.truncated).toBe(envelope.meta.truncated);

    // Guard the guard. With a single pulse `drift` answers INSUFFICIENT_DATA with no deltas, and the
    // comparison above passes on two empty lists — proving nothing. The fixture pulses twice for
    // this reason, and this line fails if that ever stops being true.
    expect(cli.status).not.toBe('INSUFFICIENT_DATA');
    expect(cli.deltas.length).toBeGreaterThan(0);
  }, 180000);

  it('flows returns the same counts through both doors', () => {
    // Found BY this test: the CLI emitted a bare array, so `[]` meant both "no flows" and "4 exist
    // and none matched", while the tool returned `{total, matching, shown}` and the CLI's own
    // RENDERED output said "4 single-symbol flow(s) were not shown". The denominator was present on
    // every surface except the machine-readable one.
    const cli = JSON.parse(runCli(['flows', '--json'], { cwd: repo }).stdout);
    const tool = mcp(repo, 'conducks_flows').data;

    expect(cli.total).toBe(tool.total);
    expect(cli.matching).toBe(tool.matching);
    expect(cli.shown).toBe(tool.shown);
    expect(cli.flows.map((f: any) => f.name).sort()).toEqual(tool.flows.map((f: any) => f.name).sort());

    // Guard the guard: with total 0 every equality above holds trivially.
    expect(cli.total).toBeGreaterThan(0);
  }, 180000);

  it('query returns the same DIRECT matches through both doors, and labels the rest', () => {
    // This caught a difference and the difference turned out to be DESIGNED, which is worth recording
    // so nobody "fixes" it: the CLI returns direct matches PLUS echoes — callers of a match — while
    // the tool returns direct matches only. `query usedFn` gives the CLI `usedFn`, `main` (its
    // caller) and `main.ts` (its unit).
    //
    // That is not drift, because the CLI SAYS which is which: `--json` carries
    // `match: "direct" | "echo"` and the rendered path prints a dim `echo` column. "An ECHO did not
    // match the query — it is a caller of something that did." So the shared answer is the direct
    // set, and the echoes are extra context a person gets in a terminal.
    //
    // ADR 0148 forbids an agent asking what a person cannot. This is the other direction, which the
    // one-directional rule allows.
    const cli = JSON.parse(runCli(['query', 'usedFn', '--json'], { cwd: repo }).stdout) as Array<{ name: string; match: string }>;
    const tool = mcp(repo, 'conducks_query', { q: 'usedFn' }).data.symbols as Array<{ name: string }>;

    const direct = cli.filter(x => x.match === 'direct').map(x => x.name).sort();
    expect(tool.map(x => x.name).sort()).toEqual(direct);
    expect(direct.length).toBeGreaterThan(0);

    // The label is what makes the extra rows honest rather than noise, so its absence is a defect
    // even though the direct sets would still match without it.
    expect(cli.every(x => x.match === 'direct' || x.match === 'echo')).toBe(true);
  }, 180000);

  it('context returns the same scored neighbourhood through both doors', () => {
    // The pair that was GRANTED AN EXCEPTION until todo57, because the two were genuinely different
    // features: a directional flow trace against a scored BFS. Measured then — 2,407 entries against
    // 83, sharing 44 names. Both call `registry.kinetic.context` now.
    //
    // The BOUNDS still differ and that is the design: the tool spends a token budget, the CLI takes a
    // line count. So the shared answer is the SCORED SET and its denominator, and the tool's list must
    // be a prefix of the CLI's — same order, same scores, cut at a different place.
    const cli = JSON.parse(runCli(['context', 'usedFn', '--json', '--limit', '200'], { cwd: repo }).stdout);
    const tool = mcp(repo, 'conducks_context', { symbol: 'usedFn' }).data;

    expect(cli.total_in_radius).toBe(tool.total_in_radius);
    expect(cli.total_in_radius).toBeGreaterThan(0);

    const cliIds = cli.nodes.map((n: any) => n.id);
    const toolIds = tool.nodes.map((n: any) => n.id);
    expect(toolIds.length).toBeGreaterThan(0);
    expect(toolIds.every((id: string, i: number) => cliIds[i] === id)).toBe(true);

    // Scores are the ANSWER, not rendering: a surface that re-ranked would order a reader's attention
    // differently while reporting the same set.
    const byId = new Map(cli.nodes.map((n: any) => [n.id, n.relevance_score]));
    for (const n of tool.nodes) expect(byId.get(n.id)).toBe(n.relevance_score);
  }, 180000);

  it('an unknown enum value is refused by BOTH, with the SAME vocabulary', () => {
    // `prune --type` is a genuinely shared enum, which `diff` is not: the tool's `mode` maps to two
    // different CLI COMMANDS (`diff` and `drift`), so it has no CLI flag to compare against and
    // demanding one would be the parameter-list mistake ADR 0148 names.
    //
    // `impact` once read an unknown direction as upstream and answered a question nobody asked
    // (todo53). A refusal on one surface and a silent default on the other is that defect wearing a
    // disguise, and differing vocabularies make a user reconcile two lists to learn one fact.
    const cli = runCli(['prune', '--type', 'BOGUS'], { cwd: repo, allowFail: true });
    expect(cli.status).not.toBe(0);
    expect(cli.combined).toMatch(/must be one of/i);

    const tool = mcp(repo, 'conducks_prune', { type: 'BOGUS' });
    expect(tool.error?.code).toBe('INVALID_PARAM');
    expect(tool.error.message).toMatch(/must be one of/i);

    // The listed values themselves must match, not merely the fact of refusing.
    const values = (text: string) => (text.match(/must be one of:?\s*([^\n—.]+)/i)?.[1] ?? '')
      .split(/[,\s]+/).map(v => v.replace(/[^A-Z_]/gi, '')).filter(Boolean).sort();
    expect(values(tool.error.message)).toEqual(values(cli.combined));
    expect(values(cli.combined).length).toBeGreaterThan(0);
  }, 180000);
});
