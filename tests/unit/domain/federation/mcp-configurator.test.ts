import { describe, it, expect, afterEach } from '@jest/globals';
import fsExtra from 'fs-extra';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MCPConfigurator } from '@/lib/domain/federation/mcp-configurator.js';

/**
 * Registering conducks in Claude Desktop's config — 60 lines, 0% covered, and it EDITS A FILE THE
 * USER OWNS. That combination is the reason this is the first thing tested in domain.
 *
 * The failure that matters is not "it did not register". It is "it registered, and removed something
 * else". A config that loses an unrelated MCP server takes another tool offline, and the person who
 * ran `conducks setup` has no reason to connect the two.
 *
 * EVERY CASE RUNS AGAINST A TEMPORARY HOME. `homedir()` is injected, and the configurator derives its
 * path from it — so nothing here can reach the real `~/Library/Application Support/Claude`. That is a
 * requirement of the test, not a convenience: a suite that writes to a developer's actual config is
 * one nobody can run twice.
 */
const tmp: string[] = [];
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

const mkHome = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-mcpcfg-'));
  tmp.push(d);
  return d;
};

const configPath = (home: string) =>
  path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

const make = (home: string) => new MCPConfigurator(fsExtra, { homedir: () => home });

const read = (home: string) => JSON.parse(fs.readFileSync(configPath(home), 'utf8'));

describe('registering conducks in Claude Desktop', () => {
  it('creates the config when there is none', async () => {
    const home = mkHome();

    const res = await make(home).registerClaude('/opt/conducks/cli.js');

    expect(res.success).toBe(true);
    expect(read(home).mcpServers.conducks).toBeDefined();
  }, 30000);

  it('KEEPS every other server already registered', async () => {
    // The case worth having. A config that loses an unrelated server takes another tool offline, and
    // nobody connects that to having run `conducks setup`.
    const home = mkHome();
    fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
    fs.writeFileSync(configPath(home), JSON.stringify({
      mcpServers: { somethingElse: { command: 'node', args: ['/other/server.js'] } },
      otherTopLevelKey: 'must survive',
    }, null, 2));

    await make(home).registerClaude('/opt/conducks/cli.js');

    const after = read(home);
    expect(after.mcpServers.somethingElse).toEqual({ command: 'node', args: ['/other/server.js'] });
    expect(after.otherTopLevelKey).toBe('must survive');
    expect(after.mcpServers.conducks).toBeDefined();
  }, 30000);

  it('passes the `mcp` argument, without which the server never starts', async () => {
    // `serverPath` is the CLI entry. Registered without a command it prints help and exits, so the
    // server appears configured and is dead — a failure with no error anywhere.
    const home = mkHome();

    await make(home).registerClaude('/opt/conducks/cli.js');

    expect(read(home).mcpServers.conducks.args).toEqual(['/opt/conducks/cli.js', 'mcp']);
  }, 30000);

  it('backs the old config up before replacing it', async () => {
    const home = mkHome();
    fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
    fs.writeFileSync(configPath(home), JSON.stringify({ mcpServers: {}, marker: 'original' }));

    await make(home).registerClaude('/opt/conducks/cli.js');

    const backup = JSON.parse(fs.readFileSync(configPath(home) + '.bak', 'utf8'));
    expect(backup.marker).toBe('original');
  }, 30000);

  it('re-registering is idempotent rather than additive', async () => {
    const home = mkHome();
    await make(home).registerClaude('/opt/conducks/a.js');
    await make(home).registerClaude('/opt/conducks/b.js');

    const after = read(home);
    expect(Object.keys(after.mcpServers)).toEqual(['conducks']);
    expect(after.mcpServers.conducks.args[0]).toBe('/opt/conducks/b.js');
  }, 30000);

  it('REPORTS a failure rather than throwing', async () => {
    // `setup` runs several steps; one throwing takes the rest with it. A returned verdict lets the
    // caller print what failed and carry on.
    const home = mkHome();
    const broken = { ...fsExtra, pathExists: async () => { throw new Error('disk on fire'); } };

    const res = await new MCPConfigurator(broken, { homedir: () => home }).registerClaude('/x.js');

    expect(res.success).toBe(false);
    expect(res.message).toContain('disk on fire');
  }, 30000);
});
