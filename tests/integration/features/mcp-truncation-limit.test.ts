import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `conducks_impact` and `conducks_trace` hard-capped their MCP-side result at 10 with NO `limit`
 * parameter to raise it — a silent, unreachable cap, unlike the CLI's own counterparts:
 *
 *   - `impact.ts --json` returns the FULL `affectedNodes` list, no cap at all.
 *   - `trace.ts` defaults to 15 and accepts `--limit <n>` to go further.
 *
 * MEASURED (found by an isolated research agent, verified live over stdio JSON-RPC against the
 * sofie benchmark subject): `conducks_impact({symbol:"registerIpcHandlers", direction:"downstream"})`
 * returned 10 of 874 affected symbols — 98.9% of the "blast radius" answer was missing, with
 * `truncated: true` the only signal and no parameter to ask for more.
 *
 * Both tools now default to a larger-but-still-bounded page (impact 20, trace matches the CLI's 15)
 * and accept `limit`, bounded like every other paged tool (`PRUNE_LIMIT_BOUNDS`,
 * `QUERY_LIMIT_BOUNDS`). The true count is now stated in `data.total` regardless of the page size, so
 * a caller who needs more knows exactly how much more there is.
 *
 * Driven over the real stdio MCP server against a real analyzed vault — the defect was in the
 * handler's own slicing, which a mocked graph would not exercise realistically at scale.
 */

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');

async function callTool(cwd: string, name: string, args: unknown): Promise<any> {
  const proc = spawn('node', [CLI, 'mcp'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  proc.stdout.on('data', (d) => { buf += String(d); });
  try {
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'trunc', version: '1' } },
    }) + '\n');
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args },
    }) + '\n');

    // A deadline-poll, not a fixed sleep-then-kill: killing the child before its stdout write has
    // fully drained truncates a large JSON-RPC payload mid-string — exactly the pipe-buffer defect
    // this repo's own `audit --json` fix (see tests/integration/cli.test.ts) exists to avoid. Waiting
    // for the closing brace of response id 2 to actually appear sidesteps it here too.
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !buf.includes('"id":2')) await new Promise((r) => setTimeout(r, 100));
    // One more beat once the marker shows up, so a payload that is still streaming has time to finish.
    await new Promise((r) => setTimeout(r, 300));

    for (const line of buf.split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      let msg: any; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== 2) continue;
      const text = msg.result?.content?.[0]?.text ?? JSON.stringify(msg.error ?? msg.result);
      return JSON.parse(text);
    }
    throw new Error(`no response for id 2 within deadline; buffer tail: ${buf.slice(-500)}`);
  } finally {
    proc.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 150));
  }
}

describe('conducks_impact and conducks_trace expose the limit the CLI already has', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('mcp-truncation-limit');

    writeFile(repo, 'package.json', JSON.stringify({ name: 'trunc', version: '1.0.0', type: 'module' }));

    // `hub`: many UPSTREAM callers, for the impact tests (impact's default direction is upstream —
    // "what breaks if I change this").
    writeFile(repo, 'src/hub.ts', 'export function hub(n: number): number { return n; }\n');
    for (let i = 0; i < 30; i++) {
      writeFile(repo, `src/caller${i}.ts`,
        `import { hub } from './hub.js';\nexport function caller${i}(): number { return hub(${i}); }\n`);
    }

    // `wide`: calls 30 distinct DOWNSTREAM targets, for the trace tests — `trace` walks reachability
    // FORWARD from the given symbol, so a symbol with many callers (like `hub`) traces to nothing.
    const leafImports = Array.from({ length: 30 }, (_, i) => `import { leaf${i} } from './leaf${i}.js';`).join('\n');
    const leafCalls = Array.from({ length: 30 }, (_, i) => `  leaf${i}();`).join('\n');
    writeFile(repo, 'src/wide.ts', `${leafImports}\nexport function wide(): void {\n${leafCalls}\n}\n`);
    for (let i = 0; i < 30; i++) {
      writeFile(repo, `src/leaf${i}.ts`, `export function leaf${i}(): number { return ${i}; }\n`);
    }

    commit(repo, 'a wide-fan-out fixture');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('impact states the true total even when the page is capped', async () => {
    const res = await callTool(repo, 'conducks_impact', { symbol: 'hub', direction: 'upstream' });
    expect(res.data.total).toBeGreaterThanOrEqual(30);
    expect(res.data.impact.length).toBeLessThan(res.data.total);
    expect(res.meta.truncated).toBe(true);
  }, 60000);

  it("impact's limit parameter actually raises the page", async () => {
    const small = await callTool(repo, 'conducks_impact', { symbol: 'hub', direction: 'upstream', limit: 5 });
    const big = await callTool(repo, 'conducks_impact', { symbol: 'hub', direction: 'upstream', limit: 100 });
    expect(small.data.impact.length).toBe(5);
    expect(big.data.impact.length).toBeGreaterThan(small.data.impact.length);
    expect(big.data.total).toBe(small.data.total); // the true count does not change with the page size
  }, 60000);

  it('impact refuses a limit outside its declared bounds instead of clamping silently', async () => {
    const res = await callTool(repo, 'conducks_impact', { symbol: 'hub', limit: 99999 });
    expect(res.error?.code).toBe('INVALID_PARAM');
  }, 60000);

  it('trace states the true total even when the page is capped', async () => {
    const res = await callTool(repo, 'conducks_trace', { symbol: 'wide' });
    expect(res.data.total).toBeGreaterThanOrEqual(30);
    expect(res.data.steps.length).toBeLessThan(res.data.total);
    expect(res.meta.truncated).toBe(true);
  }, 60000);

  it("trace's limit parameter actually raises the page", async () => {
    const small = await callTool(repo, 'conducks_trace', { symbol: 'wide', limit: 3 });
    const big = await callTool(repo, 'conducks_trace', { symbol: 'wide', limit: 60 });
    expect(small.data.steps.length).toBe(3);
    expect(big.data.steps.length).toBeGreaterThan(small.data.steps.length);
  }, 60000);

  it('trace path mode is still never truncated, regardless of limit', async () => {
    // The counter-test: path mode has its own guard (`findPath` caps nothing) and must not start
    // being sliced by the new `limit` param, which is documented as ignored there.
    const res = await callTool(repo, 'conducks_trace', { symbol: 'wide', mode: 'path', target: 'leaf0', limit: 1 });
    expect(res.meta.truncated).toBe(false);
  }, 60000);
});
