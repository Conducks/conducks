import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MicroPulseService } from '@/lib/domain/analysis/index.js';
import { registry } from '@/registry/index.js';

/**
 * The micro-pulse parses ONE file and never writes the vault (state-machine audit round 2, Q-06-1).
 *
 * Its write branch could not be reached — its two callers, `status --mode pulse` and the MCP synapse
 * tool's `pulse` mode, both hold a read-only vault, and both say so — and it was wrong if it ever
 * were: the purge committed on its own (no transaction), it deleted the unit's outgoing edges and
 * wrote none back, its node ids were not the ids `analyze` writes, and its rows had no `unitId`, so
 * `purgeUnits` could never find them again (the P-02-3 ghost, a second way). On a write handle it
 * must still write nothing.
 */
describe('MicroPulseService on a WRITE handle', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-micro-'));
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export function foo() { return 1; }\n');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('parses the file and touches no vault table', async () => {
    const writes: string[] = [];
    const vault: any = {
      readOnly: false,
      purgeUnits: async () => { writes.push('purgeUnits'); },
      saveNodes: async () => { writes.push('saveNodes'); },
      saveEdges: async () => { writes.push('saveEdges'); },
      beginPulse: async () => { writes.push('beginPulse'); },
      save: async () => { writes.push('save'); },
    };
    const service = new MicroPulseService(registry.infrastructure.registry as any, vault);
    const result = await service.resonate(path.join(dir, 'a.ts'));

    expect(writes).toEqual([]);
    expect(result).toMatchObject({ success: true, persisted: false });
    expect(result.nodes).toBeGreaterThan(0);
  });
});
