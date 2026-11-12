import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { RegistryBootstrapper } from "@/lib/core/bootstrap/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ConducksGraph } from "@/lib/core/graph/index.js";
import { logger } from "@/lib/core/utils/index.js";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A re-anchor to a project with no vault must not keep logging into the previous project's
 * `mcp.log` (state-machine audit round 2, Q-03-7). The bootstrapper deliberately skips setting a
 * sink there — setting one would create `.conducks/` — and skipping left the old sink in place.
 */
const roots: string[] = [];
afterEach(() => { logger.clearLogFile(); while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); jest.restoreAllMocks(); });

const ctx = (graph: ConducksGraph, persistence: SynapsePersistence) => ({
  graph, persistence,
  ignoreManager: {} as never,
  federationFor: () => ({ hydrate: async () => {} }) as never,
  updatePersistence: () => {},
  updateIgnoreManager: () => {},
});

describe('the log sink follows the anchor', () => {
  it('moving from an analysed project to one with no vault stops writing to the first log', async () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-sink-a-'));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-sink-b-'));
    roots.push(a, b);
    fs.mkdirSync(path.join(a, '.conducks'));
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const boot = new RegistryBootstrapper();
    const graph = new ConducksGraph();
    await boot.initialize({ readOnly: true, root: a, lazy: true }, ctx(graph, new SynapsePersistence(':memory:', true)));
    await boot.initialize({ readOnly: true, root: b, lazy: true }, ctx(graph, new SynapsePersistence(a, true)));
    logger.info('activity in project B');

    const logA = path.join(a, '.conducks', 'mcp.log');
    expect(fs.existsSync(logA) ? fs.readFileSync(logA, 'utf8') : '').not.toContain('activity in project B');
    expect(fs.existsSync(path.join(b, '.conducks'))).toBe(false);
  }, 60000);
});
