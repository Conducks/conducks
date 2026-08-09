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

// SIX DIFFERENT TOOLS, not six copies of one call.
//
// The original probe issued six identical `conducks_explain` requests, so it exercised a single code
// path — and the failures found on 2026-08-08 needed different tools in flight together (todo52#P3).
// `IntraLinker` is a symbol this repo genuinely holds, so any "not found" here is a real defect.
const SYMBOL = process.env.PROBE_SYMBOL || 'IntraLinker';
const CALLS = [
  { name: 'conducks_explain', arguments: { symbol: SYMBOL } },
  { name: 'conducks_impact',  arguments: { symbol: SYMBOL } },
  { name: 'conducks_trace',   arguments: { symbol: SYMBOL } },
  { name: 'conducks_context', arguments: { symbol: SYMBOL } },
  { name: 'conducks_status',  arguments: {} },
  { name: 'conducks_query',   arguments: { q: SYMBOL } },
];

const t0 = Date.now();
const results = await Promise.all(CALLS.map((c, i) => send(i + 2, 'tools/call', c)));
const ms = Date.now() - t0;

/**
 * A tool-level refusal is a FAILURE, and the old test could not see one.
 *
 * `r.error || r.result?.isError` catches transport failures only. `mcpErr` returns `{error: {...}}`
 * INSIDE the tool payload and sets neither, so a false `SYMBOL_NOT_FOUND` — precisely the wrong
 * answer this probe exists to detect — was counted as `ok`. The probe could not judge the fix it was
 * meant to measure (ADR 0146's own "why the probe did not catch this", todo52#P3).
 */
const failureOf = (r) => {
  if (r.error) return JSON.stringify(r.error);
  if (r.result?.isError) return JSON.stringify(r.result);
  const text = r.result?.content?.map(c => c.text).filter(Boolean).join('\n') ?? '';
  let payload;
  try { payload = JSON.parse(text); } catch { return null; }   // not JSON: nothing to judge
  if (payload?.error) return `${payload.error.code}: ${payload.error.message}`;
  return null;
};

let ok = 0, err = 0;
results.forEach((r, i) => {
  const failure = failureOf(r);
  if (failure) { err++; console.log(`  FAILED ${CALLS[i].name}:`, failure.slice(0, 140)); }
  else ok++;
});
console.log(`  ${CALLS.length} concurrent calls on ONE server: ok=${ok} failed=${err} in ${ms} ms`);
console.log(`  baseline: 274 ms concurrent (ADR 0128) / 2,135 ms serialised (ADR 0146)`);
if (err > 0) process.exitCode = 1;
srv.kill();
process.exit(0);
