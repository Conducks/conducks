/**
 * Conducks — six tool calls sent to ONE server without waiting between them.
 *
 * This is the shape a SHARED MCP server sees when several agents are active at once, and it is the
 * configuration `/mcp` actually uses — `tools/mcp-call.mjs` spawns a server per call, so it cannot
 * see this case at all.
 *
 * It exists because "concurrent vault access blocks multi-agent use" was carried as a tracked
 * limitation and turned out to be false when measured (ADR 0128). Keeping the probe means the claim
 * can be re-checked in one command rather than re-argued.
 *
 * Usage: node tools/mcp-parallel.mjs
 */
import { spawn } from 'node:child_process';
const root = '/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks';
const srv = spawn('node', [`${root}/build/src/interfaces/cli/index.js`, 'mcp'],
  { cwd: root, env: { ...process.env, CONDUCKS_WORKSPACE_ROOT: root }, stdio: ['pipe','pipe','pipe'] });

let buf = '';
const pending = new Map();
srv.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    try { const m = JSON.parse(line); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch {}
  }
});
const send = (id, method, params) => new Promise(res => {
  pending.set(id, res);
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});

await send(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1' } });
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const t0 = Date.now();
const results = await Promise.all([2,3,4,5,6,7].map(id =>
  send(id, 'tools/call', { name: 'conducks_explain', arguments: { symbol: 'IntraLinker' } })));
const ms = Date.now() - t0;

let ok = 0, err = 0;
for (const r of results) {
  const isErr = r.error || r.result?.isError;
  if (isErr) { err++; console.log('  FAILED:', JSON.stringify(r.error ?? r.result?.content?.[0]?.text ?? '').slice(0, 120)); }
  else ok++;
}
console.log(`  6 concurrent calls on ONE server: ok=${ok} failed=${err} in ${ms} ms`);
srv.kill();
process.exit(0);
