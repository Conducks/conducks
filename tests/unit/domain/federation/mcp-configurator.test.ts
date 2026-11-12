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

  it('keeps the PRE-conducks backup when it re-registers over its own entry', async () => {
    // State-machine audit P-08-12: every write copied the current file to `.bak`, so the second write
    // replaced the user's original with a config conducks had already edited.
    const home = mkHome();
    fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
    fs.writeFileSync(configPath(home), JSON.stringify({ mcpServers: {}, marker: 'original' }));

    await make(home).registerClaude('/opt/conducks/a.js');
    await make(home).registerClaude('/opt/conducks/b.js');

    const backup = JSON.parse(fs.readFileSync(configPath(home) + '.bak', 'utf8'));
    expect(backup.marker).toBe('original');
    expect(backup.mcpServers.conducks).toBeUndefined();
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

/**
 * todo82#P8 — `setup` registers conducks in every other MCP client that is installed, so no config
 * is edited by hand. The two failures that matter: writing into a client that is not installed
 * (a stray config directory in the user's home), and running a real client CLI from a test.
 */
describe('registering conducks in the other detected clients', () => {
  const calls: string[][] = [];
  const makeWith = (home: string, exec: (cmd: string, args: string[]) => string) =>
    new MCPConfigurator(fsExtra, { homedir: () => home }, (cmd, args) => { calls.push([cmd, ...args]); return exec(cmd, args); });
  afterEach(() => { calls.length = 0; });

  it('writes nothing and runs nothing when no client is installed', async () => {
    const home = mkHome();
    const res = await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');
    expect(res).toEqual([]);
    expect(fs.readdirSync(home)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('adds conducks to an installed Cursor and keeps its other servers', async () => {
    const home = mkHome();
    fs.mkdirSync(path.join(home, '.cursor'));
    fs.writeFileSync(path.join(home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));

    const res = await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');

    const after = JSON.parse(fs.readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8'));
    expect(res.map(r => [r.client, r.success])).toEqual([['Cursor', true]]);
    expect(after.mcpServers.other).toEqual({ command: 'x' });
    expect(after.mcpServers.conducks).toEqual({ command: 'node', args: ['/opt/conducks/cli.js', 'mcp'] });
  });

  it('registers Claude Code through its own CLI, and only when it is not registered yet', async () => {
    const home = mkHome();
    fs.writeFileSync(path.join(home, '.claude.json'), '{}');
    const before = fs.readFileSync(path.join(home, '.claude.json'), 'utf8');

    await makeWith(home, (_c, args) => { if (args[1] === 'get') throw new Error('not found'); return ''; }).registerDetected('/opt/conducks/cli.js');
    expect(calls[1]).toEqual(['claude', 'mcp', 'add', '--scope', 'user', 'conducks', '--', 'node', '/opt/conducks/cli.js', 'mcp']);
    expect(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).toBe(before); // never edited directly

    calls.length = 0;
    const again = await makeWith(home, () => 'conducks:\n  Command: node\n  Args: /opt/conducks/cli.js mcp\n').registerDetected('/opt/conducks/cli.js');
    expect(calls).toEqual([['claude', 'mcp', 'get', 'conducks']]);
    expect(again[0].message).toContain('already registered');
  });

  /**
   * State-machine audit P-05-5: an entry that EXISTS was taken as current. After a reinstall moved the
   * CLI (another node version, another global prefix), `setup` said "already registered" and Claude
   * Code and Codex kept starting conducks from the old, removed path.
   */
  it('re-registers Claude Code when its entry points at another install', async () => {
    const home = mkHome();
    fs.writeFileSync(path.join(home, '.claude.json'), '{}');
    const res = await makeWith(home, (_c, args) => args[1] === 'get' ? 'conducks:\n  Args: /old/node20/conducks/cli.js mcp\n' : '')
      .registerDetected('/opt/conducks/cli.js');
    expect(calls).toEqual([
      ['claude', 'mcp', 'get', 'conducks'],
      ['claude', 'mcp', 'remove', '--scope', 'user', 'conducks'],
      ['claude', 'mcp', 'add', '--scope', 'user', 'conducks', '--', 'node', '/opt/conducks/cli.js', 'mcp'],
    ]);
    expect(res[0].message).toContain('updated');
  });

  it('rewrites a Codex block that points at another install, keeping the rest of the TOML', async () => {
    const home = mkHome();
    fs.mkdirSync(path.join(home, '.codex'));
    const toml = path.join(home, '.codex', 'config.toml');
    fs.writeFileSync(toml, 'model = "x"\n\n[mcp_servers.conducks]\ncommand = "node"\nargs = ["/old/cli.js", "mcp"]\n\n[other]\nk = 1\n');

    await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');

    const text = fs.readFileSync(toml, 'utf8');
    expect(text).toContain('args = ["/opt/conducks/cli.js", "mcp"]');
    expect(text).not.toContain('/old/cli.js');
    expect(text.match(/\[mcp_servers\.conducks\]/g)).toHaveLength(1);
    expect(text).toContain('[other]\nk = 1');
    expect(text.startsWith('model = "x"')).toBe(true);
  });

  it('appends one Codex block, keeps the rest of the TOML, and does not append twice', async () => {
    const home = mkHome();
    fs.mkdirSync(path.join(home, '.codex'));
    const toml = path.join(home, '.codex', 'config.toml');
    fs.writeFileSync(toml, 'model = "x"');

    await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');
    await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');

    const text = fs.readFileSync(toml, 'utf8');
    expect(text.startsWith('model = "x"\n')).toBe(true);
    expect(text.match(/\[mcp_servers\.conducks\]/g)).toHaveLength(1);
    expect(text).toContain('args = ["/opt/conducks/cli.js", "mcp"]');
  });

  it('reports a client that fails and still handles the others', async () => {
    const home = mkHome();
    fs.mkdirSync(path.join(home, '.cursor'));
    fs.writeFileSync(path.join(home, '.cursor', 'mcp.json'), '{ not json');
    fs.mkdirSync(path.join(home, '.codex'));

    const res = await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');

    expect(res.map(r => [r.client, r.success])).toEqual([['Cursor', false], ['Codex', true]]);
    expect(fs.readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8')).toBe('{ not json'); // left as it was
  });
});
