import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * Pipelined MCP tool calls must not answer WRONGLY (found by driving the agent-facing surface).
 *
 * JSON-RPC permits concurrent requests and agents batch tool calls, but everything under a handler is
 * a module-level singleton: one registry, one materialised graph, one vault handle. Two defects
 * followed from that, and the first is the dangerous one:
 *
 *   1. `ensureGraphLoaded` cleared `pendingLoad` BEFORE awaiting the load, so a second caller saw
 *      null, believed the graph was ready, and walked an EMPTY one. Four pipelined `conducks_impact`
 *      calls returned three `SYMBOL_NOT_FOUND` for a symbol that demonstrably exists. It did not
 *      throw — it answered, wrongly, and "no node matched" is indistinguishable from "no nodes at
 *      all" to everything downstream.
 *   2. Every handler closed the shared vault in its own `finally`, so whichever call finished first
 *      hung up on the others: `Connection Error: Connection was never established or has been closed
 *      already`, and after ref-counting that, `Database was already closed` — because
 *      `registry.initialize` SWAPS the persistence object, which no ref-count can make atomic.
 *
 * Tool calls are now serialised at the one wrapper every tool passes through.
 *
 * This drives the REAL server over stdio rather than mocking it, because both defects live in the
 * interaction between calls — a mocked handler has no shared singleton to corrupt.
 */

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');

/** Fire every call without waiting, the way a batching client does, and collect all responses. */
async function pipeline(cwd: string, calls: Array<{ name: string; args: unknown }>): Promise<Map<number, any>> {
  const proc = spawn('node', [CLI, 'mcp'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  proc.stdout.on('data', d => { buf += String(d); });
  try {
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'conc', version: '1' } },
    }) + '\n');

    // No await between writes — that is the point.
    calls.forEach((c, i) => {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0', id: i + 2, method: 'tools/call', params: { name: c.name, arguments: c.args },
      }) + '\n');
    });

    const deadline = Date.now() + 90000;
    const all = () => calls.every((_, i) => buf.includes(`"id":${i + 2}`));
    while (Date.now() < deadline && !all()) await new Promise(r => setTimeout(r, 250));

    const out = new Map<number, any>();
    for (const line of buf.split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      let msg: any; try { msg = JSON.parse(line); } catch { continue; }
      if (!msg.id || msg.id === 1) continue;
      const text = msg.result?.content?.[0]?.text ?? JSON.stringify(msg.error ?? msg.result);
      out.set(msg.id - 2, text);
    }
    return out;
  } finally {
    proc.kill('SIGKILL');
    await new Promise(r => setTimeout(r, 150));
  }
}

describe('concurrent MCP tool calls answer correctly', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('mcpconc');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'mc', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/core.ts', 'export function widgetize(n: number): number { return n * 2; }\n');
    writeFile(repo, 'src/app.ts', "import { widgetize } from './core.js';\nexport function run(): number { return widgetize(21); }\n");
    commit(repo, 'a project to query concurrently');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('a symbol that exists is never reported missing just because calls overlap', async () => {
    // The same symbol asked for repeatedly, all in flight at once. Before the fix, the first call
    // did the graph load and the rest raced past it onto an empty graph.
    const calls = Array.from({ length: 6 }, () => ({ name: 'conducks_impact', args: { symbol: 'widgetize' } }));
    const res = await pipeline(repo, calls);

    expect(res.size).toBe(calls.length);
    for (const [i, text] of res) {
      expect(`call ${i}: ${text}`).not.toMatch(/SYMBOL_NOT_FOUND/);
      expect(`call ${i}: ${text}`).not.toMatch(/already closed|never established/i);
    }
  }, 180000);

  it('overlapping calls across DIFFERENT tools do not close the vault under each other', async () => {
    const calls = [
      { name: 'conducks_impact', args: { symbol: 'widgetize' } },
      { name: 'conducks_trace', args: { symbol: 'widgetize' } },
      { name: 'conducks_explain', args: { symbol: 'widgetize' } },
      { name: 'conducks_query', args: { query: 'widgetize' } },
      { name: 'conducks_status', args: {} },
      { name: 'conducks_audit', args: {} },
    ];
    const res = await pipeline(repo, calls);

    expect(res.size).toBe(calls.length);
    for (const [i, text] of res) {
      expect(`${calls[i].name}: ${text}`).not.toMatch(/already closed|never established|Connection Error/i);
    }
  }, 180000);

  it('a genuinely missing symbol is STILL reported missing — the fix must not swallow real errors', async () => {
    const res = await pipeline(repo, [
      { name: 'conducks_impact', args: { symbol: 'widgetize' } },
      { name: 'conducks_impact', args: { symbol: 'noSuchSymbolAnywhere' } },
    ]);

    expect(res.get(0)).not.toMatch(/SYMBOL_NOT_FOUND/);
    expect(res.get(1)).toMatch(/SYMBOL_NOT_FOUND/);
  }, 180000);
});
