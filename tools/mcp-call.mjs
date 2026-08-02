#!/usr/bin/env node
/**
 * Conducks — call one MCP tool over stdio JSON-RPC and print its result.
 *
 * The MCP tools are the agent-facing surface — `conducks_context`, `conducks_explain`,
 * `conducks_impact` and eleven more — and until now nothing could exercise them end to end. The unit
 * suite mocks the registry and hand-builds a graph, which tests the handler's branches but not the
 * tool as an agent actually reaches it: real server, real vault, real JSON-RPC framing.
 *
 * That gap is how `context-shape.test.ts` ended up asserting against `canonicalRank: 11` — a value
 * it supplies itself, and one the taxonomy stopped producing.
 *
 * Usage:
 *   node tools/mcp-call.mjs <project-dir> <tool-name> '<json-args>'
 *
 * Example:
 *   node tools/mcp-call.mjs ../oracle conducks_context '{"symbol":"logAudit"}'
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [projectDir, toolName, argsJson] = process.argv.slice(2);
if (!projectDir || !toolName) {
  console.error("usage: mcp-call.mjs <project-dir> <tool-name> '<json-args>'");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../build/src/interfaces/cli/index.js');

const server = spawn('node', [cli, 'mcp'], {
  cwd: path.resolve(projectDir),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
const pending = new Map();

server.stdout.on('data', chunk => {
  buffer += chunk.toString();
  // The server writes one JSON object per line. Anything that is not JSON is server chatter and is
  // skipped rather than treated as a protocol error — stdout carries both on this transport.
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line.startsWith('{')) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

const send = (id, method, params) => new Promise((resolve, reject) => {
  pending.set(id, resolve);
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  setTimeout(() => {
    if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout waiting for ${method}`)); }
  }, 120000);
});

try {
  await send(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'conducks-mcp-call', version: '1.0.0' },
  });
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const res = await send(2, 'tools/call', {
    name: toolName,
    arguments: argsJson ? JSON.parse(argsJson) : {},
  });

  // A tool result arrives as content parts; print the text part verbatim so a caller can pipe it
  // into `jq` or a scorer. An error result is printed too rather than swallowed — "the tool refused"
  // is an answer worth scoring.
  const text = res.result?.content?.map(c => c.text).filter(Boolean).join('\n');
  console.log(text ?? JSON.stringify(res.result ?? res.error ?? res, null, 2));
  process.exit(0);
} catch (err) {
  console.error(`mcp-call failed: ${err.message}`);
  process.exit(1);
} finally {
  server.kill();
}
