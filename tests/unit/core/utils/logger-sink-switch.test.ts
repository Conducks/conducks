import { describe, it, expect, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Logger } from '@/lib/core/utils/logger.js';

/**
 * The log sink follows the project the process is anchored to (state-machine audit round 2, Q-03-7).
 *
 * The bootstrapper points the sink at `<root>/.conducks/mcp.log` on every anchor. When the next
 * anchor's sink could not be set — its directory could not be made, or (read-only, never analysed)
 * the bootstrapper skipped it so as not to create a vault — the OLD path stayed: an MCP server that
 * moved from project A to project B kept writing B's activity into A's log.
 */
let dir = '';
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); jest.restoreAllMocks(); });

describe('log sink switch', () => {
  it('a sink that cannot be set does not leave the previous one in place', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-logsink-'));
    const first = path.join(dir, 'a', 'mcp.log');
    const blocker = path.join(dir, 'not-a-dir');
    fs.writeFileSync(blocker, '');                       // a FILE where a directory is needed
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const log = new Logger('T');
    log.setLogFile(first);
    log.info('for A');
    log.setLogFile(path.join(blocker, 'b', 'mcp.log'));  // mkdir fails
    log.info('for B');
    expect(fs.readFileSync(first, 'utf8')).not.toContain('for B');
  });

  it('clearLogFile stops writing to the previous sink', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-logsink-'));
    const first = path.join(dir, 'a', 'mcp.log');
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const log = new Logger('T');
    log.setLogFile(first);
    log.info('for A');
    log.clearLogFile();
    log.info('for B');
    expect(fs.readFileSync(first, 'utf8')).not.toContain('for B');
  });
});
