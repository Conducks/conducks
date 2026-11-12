import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `conducks mcp --sse` kept its transport in one slot that every GET /sse overwrote and nothing
 * cleared (state-machine audit P-10-6): a POST before any GET was never answered, a second client
 * took over the first one's replies, and a closed client left POSTs going to a dead stream.
 */
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');

/** Status of a request, or 'HUNG' when nothing answers within `ms`. */
const status = (port: number, method: string, p: string, ms = 3000) => new Promise<number | 'HUNG'>(resolve => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'content-type': 'application/json' } }, res => {
    resolve(res.statusCode ?? 0);
    res.destroy();
  });
  req.on('error', () => resolve(0));
  const t = setTimeout(() => { req.destroy(); resolve('HUNG'); }, ms);
  req.on('close', () => clearTimeout(t));
  req.end(method === 'POST' ? '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' : undefined);
});

/** Open an SSE stream; resolves with its status and a way to close it. */
const openStream = (port: number) => new Promise<{ code: number; close: () => void }>(resolve => {
  const req = http.get({ host: '127.0.0.1', port, path: '/sse' }, res => resolve({ code: res.statusCode ?? 0, close: () => req.destroy() }));
  req.on('error', () => resolve({ code: 0, close: () => {} }));
});

describe('mcp --sse sessions', () => {
  let repo: string; let proc: ChildProcess; const port = 4500 + Math.floor(Math.random() * 400);

  beforeAll(async () => {
    ensureBuild();
    repo = mkGitRepo('mcp-sse');
    writeFile(repo, 'src/a.ts', 'export function a(): number { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    proc = spawn('node', [CLI, 'mcp', '--sse'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CONDUCKS_SSE_PORT: String(port) } });
    let buf = '';
    proc.stderr!.on('data', d => { buf += String(d); });
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline && !/Running on SSE/.test(buf)) await new Promise(r => setTimeout(r, 200));
  }, 120000);

  afterAll(() => { proc?.kill('SIGKILL'); rmRepo(repo); });

  it('a POST with no client connected is answered, not left hanging', async () => {
    const code = await status(port, 'POST', '/messages?sessionId=nope');
    expect(code).not.toBe('HUNG');
    expect(code).toBeGreaterThanOrEqual(400);
  }, 30000);

  it('a second client is refused while the first is connected, and admitted once it leaves', async () => {
    const first = await openStream(port);
    expect(first.code).toBe(200);
    const second = await openStream(port);
    expect(second.code).toBe(409);
    second.close();

    first.close();
    await new Promise(r => setTimeout(r, 500));
    const third = await openStream(port);
    expect(third.code).toBe(200);
    third.close();
  }, 30000);
});
