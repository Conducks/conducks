import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * One MCP server, calls that name DIFFERENT projects (state-machine audit, 2026-11-12, area B).
 *
 *   P-10-1  re-anchoring closed and swapped the shared vault under calls still in flight for the
 *           other project: wrong-project answers, SYMBOL_NOT_FOUND, or "already closed".
 *   P-10-5  a call with `path` re-anchored TWICE — tool-registry to the launch directory, then the
 *           wrapper to `path` — and reloaded the whole graph on every such call.
 *   P-10-10 the wrapper anchored to a refused path BEFORE the path guard refused it.
 *   P-10-8  a call with no `arguments` threw on `args.path`.
 *   P-10-4  `resources/read` on a fresh server read a deferred graph and failed for every resource.
 *   P-10-3  the server never reloaded its graph after an outside `analyze`.
 */
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');

type Msg = { method?: string; params?: unknown; raw?: string };

/** Start the server, send `messages` (all at once, or one by one with `between`), collect replies by id. */
async function session(cwd: string, messages: Msg[], opts: { sequential?: boolean; between?: (i: number) => void } = {}) {
  const proc = spawn('node', [CLI, 'mcp'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = ''; let err = '';
  proc.stdout.on('data', d => { out += String(d); });
  proc.stderr.on('data', d => { err += String(d); });
  const send = (o: unknown) => proc.stdin.write(JSON.stringify(o) + '\n');
  const has = (id: number) => out.split('\n').some(l => l.includes(`"id":${id},`) || l.includes(`"id":${id}}`));
  const wait = async (ids: number[]) => {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !ids.every(has)) await new Promise(r => setTimeout(r, 200));
  };
  try {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    await wait([1]);
    const ids = messages.map((_, i) => i + 2);
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      send({ jsonrpc: '2.0', id: i + 2, method: m.method, ...(m.params === undefined ? {} : { params: m.params }) });
      if (opts.sequential) { await wait([i + 2]); opts.between?.(i); }
    }
    await wait(ids);
    const replies = new Map<number, string>();
    for (const line of out.split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      let msg: any; try { msg = JSON.parse(line); } catch { continue; }
      if (typeof msg.id !== 'number' || msg.id === 1) continue;
      replies.set(msg.id - 2, msg.result?.content?.[0]?.text ?? msg.result?.contents?.[0]?.text ?? JSON.stringify(msg.error ?? msg.result));
    }
    return { replies, stderr: err };
  } finally {
    proc.kill('SIGKILL');
    await new Promise(r => setTimeout(r, 150));
  }
}
const call = (name: string, args?: unknown): Msg => ({ method: 'tools/call', params: args === undefined ? { name } : { name, arguments: args } });

describe('one MCP server, several projects', () => {
  let a: string; let b: string; let outside: string;

  beforeAll(() => {
    ensureBuild();
    a = mkGitRepo('mcp-anchor-a');
    writeFile(a, 'package.json', JSON.stringify({ name: 'pa', version: '1.0.0', type: 'module' }));
    writeFile(a, 'src/a.ts', 'export function alphaOnly(n: number): number { return n + 1; }\nexport function useAlpha(): number { return alphaOnly(1); }\n');
    commit(a, 'a');
    runCli(['analyze', '--yes'], { cwd: a });
    b = mkGitRepo('mcp-anchor-b');
    writeFile(b, 'package.json', JSON.stringify({ name: 'pb', version: '1.0.0', type: 'module' }));
    writeFile(b, 'src/b.ts', 'export function betaOnly(n: number): number { return n * 3; }\nexport function useBeta(): number { return betaOnly(1); }\n');
    commit(b, 'b');
    runCli(['analyze', '--yes'], { cwd: b });
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-int-not-a-project-'));
  }, 240000);

  afterAll(() => { rmRepo(a); rmRepo(b); fs.rmSync(outside, { recursive: true, force: true }); });

  it('overlapping calls for two projects each answer from their own project (P-10-1)', async () => {
    // Each answer must come from the project it named: SQL reads the vault the handle points at,
    // so an answer from the OTHER project's vault shows up as the other project's symbol.
    const sql = "SELECT name FROM nodes WHERE name IN ('alphaOnly', 'betaOnly')";
    const msgs: Msg[] = [];
    for (let i = 0; i < 6; i++) {
      msgs.push(call('conducks_impact', { symbol: 'alphaOnly', path: a }));
      msgs.push(call('conducks_graph_query', { sql, path: b }));
      msgs.push(call('conducks_impact', { symbol: 'betaOnly', path: b }));
      msgs.push(call('conducks_graph_query', { sql, path: a }));
    }
    const { replies } = await session(a, msgs);
    expect(replies.size).toBe(msgs.length);
    const wrong: string[] = [];
    for (const [i, text] of replies) {
      const kind = i % 4;
      if (/SYMBOL_NOT_FOUND|already closed|never established|Connection Error/i.test(text)) wrong.push(`call ${i}: ${text.slice(0, 160)}`);
      if (kind === 1 && (!text.includes('betaOnly') || text.includes('alphaOnly'))) wrong.push(`call ${i} (sql in b): ${text.slice(0, 160)}`);
      if (kind === 3 && (!text.includes('alphaOnly') || text.includes('betaOnly'))) wrong.push(`call ${i} (sql in a): ${text.slice(0, 160)}`);
    }
    expect(wrong).toEqual([]);
  }, 180000);

  it('a call with `path` anchors once, not to the launch directory and back (P-10-5)', async () => {
    const { replies, stderr } = await session(b, [
      call('conducks_impact', { symbol: 'alphaOnly', path: a }),
      call('conducks_impact', { symbol: 'alphaOnly', path: a }),
    ], { sequential: true });
    expect(replies.get(1)).not.toMatch(/SYMBOL_NOT_FOUND/);
    const anchorsToA = stderr.split('\n').filter(l => l.includes(`Anchoring structural synapse at: ${a}`)).length;
    expect(anchorsToA).toBe(1);
  }, 180000);

  it('a refused path is refused before anything is anchored to it (P-10-10)', async () => {
    const { replies, stderr } = await session(a, [call('conducks_status', { path: outside })]);
    expect(replies.get(0)).toMatch(/Refusing to anchor/);
    expect(stderr).not.toContain(`Anchoring structural synapse at: ${outside}`);
  }, 180000);

  it('a call with no arguments object is answered, not a TypeError (P-10-8)', async () => {
    const { replies } = await session(a, [call('conducks_status')]);
    expect(replies.get(0)).not.toMatch(/Cannot read properties of undefined/);
  }, 180000);

  it('resources/read answers on a fresh server, before any tool call (P-10-4)', async () => {
    const { replies } = await session(a, [{ method: 'resources/read', params: { uri: 'resource://conducks/symbols' } }]);
    expect(replies.get(0)).not.toMatch(/not materialised|Failed to read resource/);
    expect(JSON.parse(replies.get(0)!).totalCount).toBeGreaterThan(0);
  }, 180000);

  it('a symbol added by an outside analyze is found by the running server (P-10-3)', async () => {
    const { replies } = await session(a, [
      call('conducks_impact', { symbol: 'alphaOnly' }),
      call('conducks_impact', { symbol: 'addedLater' }),
    ], {
      sequential: true,
      between: i => {
        if (i !== 0) return;
        writeFile(a, 'src/later.ts', 'import { alphaOnly } from "./a.js";\nexport function addedLater(): number { return alphaOnly(2); }\n');
        runCli(['analyze', '--yes'], { cwd: a });
      },
    });
    expect(replies.get(0)).not.toMatch(/SYMBOL_NOT_FOUND/);
    expect(replies.get(1)).not.toMatch(/SYMBOL_NOT_FOUND/);
  }, 240000);
});
