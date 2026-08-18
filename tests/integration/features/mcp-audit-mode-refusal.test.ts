import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `conducks_audit`'s `mode:"fallback"` was validated as LEGAL — `AUDIT_MODES` (used by the enum
 * guard) listed it, and the tool's own description told a caller it would "analyze fallback
 * patterns and identify legacy fallbacks vs legitimate ones" — but no handler branch existed for it,
 * so it fell through to `scan` silently and returned a full, plausible answer to a question that was
 * never asked. Exactly the "an unknown mode is an error, not a default" defect this codebase has
 * fixed everywhere else, except this mode was never unknown to the enum — just unimplemented.
 *
 * No domain-layer fallback-pattern analysis exists anywhere (`grep -rn fallback src/lib/domain`
 * turns up only unrelated uses of the plain English word), and the CLI itself removed its own
 * `conducks fallback` command outright — found during benchmark verification. The mode is removed
 * here to match that decision, rather than invented to match the description.
 */
describe('conducks_audit refuses an advertised-but-unimplemented mode', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('mcp-audit-mode-refusal');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'a', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/main.ts', 'export function boot(): number { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');

  async function callTool(name: string, args: unknown): Promise<any> {
    const proc = spawn('node', [CLI, 'mcp'], { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    proc.stdout.on('data', (d) => { buf += String(d); });
    try {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'auditmode', version: '1' } },
      }) + '\n');
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }) + '\n');

      const deadline = Date.now() + 20000;
      while (Date.now() < deadline && !buf.includes('"id":2')) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 300));

      for (const line of buf.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        let msg: any; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== 2) continue;
        const text = msg.result?.content?.[0]?.text ?? JSON.stringify(msg.error ?? msg.result);
        return JSON.parse(text);
      }
      throw new Error('no response for id 2 within deadline');
    } finally {
      proc.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  it('refuses mode:"fallback" instead of silently running scan', async () => {
    const res = await callTool('conducks_audit', { mode: 'fallback' });
    expect(res.error?.code).toBe('INVALID_PARAM');
    // The failure mode being fixed: a scan-shaped answer under a fallback-shaped request.
    expect(res.data?.violations).toBeUndefined();
  }, 60000);

  it('still runs the real modes correctly', async () => {
    // The counter-test: refusing "fallback" must not have broken the modes that exist.
    for (const mode of ['scan', 'advice', 'guard', 'archeology']) {
      const res = await callTool('conducks_audit', { mode });
      expect(res.error).toBeUndefined();
    }
  }, 60000);
});
