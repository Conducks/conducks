import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { GatewayService } from '@/lib/domain/mirror/index.js';
import { ConducksGraph } from '@/lib/core/graph/index.js';
import { initGlobalMirror } from '@/interfaces/web/mirror/server.js';

/**
 * The mirror server's own start/stop (state-machine audit round 2, Q-10-8).
 *
 *   - `start()` resolved on listen and retried on EADDRINUSE; any OTHER listen error was logged and
 *     the promise never settled, so `conducks mirror --host <address it cannot bind>` hung silently.
 *   - `stop()` closed the listener but not the open `/api/pulse` streams, and `server.close()` waits
 *     for every open connection, so a stopped mirror kept its port while a page was open.
 */
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });

function mirror() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-mirror-life-'));
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  const persistence = { close: async () => {}, query: async () => [] };
  return initGlobalMirror(new GatewayService(new ConducksGraph(), persistence as any, root));
}

const portFree = (port: number) => new Promise<boolean>(resolve => {
  const probe = net.createServer().once('error', () => resolve(false)).listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});

describe('the mirror server lifecycle', () => {
  it('a listen error other than "port in use" rejects instead of hanging', async () => {
    const server = mirror();
    cleanups.push(() => server.stop());
    // TEST-NET-3: never assigned to this machine, so binding it fails with EADDRNOTAVAIL.
    const outcome = await Promise.race([
      server.start(4400 + Math.floor(Math.random() * 400), '203.0.113.7').then(() => 'listening', () => 'rejected'),
      new Promise(r => setTimeout(() => r('hung'), 3000)),
    ]);
    expect(outcome).toBe('rejected');
  }, 20000);

  it('stop() releases the port even while a page holds the live channel open', async () => {
    const server = mirror();
    const port = await server.start(4800 + Math.floor(Math.random() * 400));
    const req = http.get({ host: '127.0.0.1', port, path: '/api/pulse' });
    req.on('error', () => { /* ended by the server */ });
    await new Promise(r => setTimeout(r, 200));
    await server.stop();
    await new Promise(r => setTimeout(r, 200));
    const free = await portFree(port);
    req.destroy();
    expect(free).toBe(true);
  }, 20000);
});
