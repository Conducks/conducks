import { describe, it, expect, afterEach } from '@jest/globals';
import fsExtra from 'fs-extra';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MCPConfigurator } from '@/lib/domain/federation/mcp-configurator.js';

/**
 * The MCP configurator after round 1's P-05-5 fix (state-machine audit round 2, Q-05-7..Q-05-9).
 * Every case runs against a temporary home and an injected `exec`: nothing here runs a real client CLI.
 */
const tmp: string[] = [];
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });
const mkHome = (): string => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-mcpcfg-r2-')); tmp.push(d); return d; };

const calls: string[][] = [];
afterEach(() => { calls.length = 0; });
const makeWith = (home: string, exec: (cmd: string, args: string[]) => string) =>
  new MCPConfigurator(fsExtra, { homedir: () => home }, (cmd, args) => { calls.push([cmd, ...args]); return exec(cmd, args); });

const claudeHome = () => { const h = mkHome(); fs.writeFileSync(path.join(h, '.claude.json'), '{}'); return h; };

describe('Claude Code (Q-05-7)', () => {
  it('a failed add after removing the old entry says the entry is gone and how to add it', async () => {
    // Remove, then add: when the add failed the user had NO entry, under a message naming only the
    // add's error.
    const home = claudeHome();
    const res = await makeWith(home, (_c, args) => {
      if (args[1] === 'get') return 'conducks:\n  Scope: User config\n  Args: /old/cli.js mcp\n';
      if (args[1] === 'add') throw new Error('claude: timed out');
      return '';
    }).registerDetected('/opt/conducks/cli.js');

    expect(res[0].success).toBe(false);
    expect(res[0].message).toMatch(/removed/i);
    expect(res[0].message).toContain('claude mcp add --scope user conducks -- node /opt/conducks/cli.js mcp');
  });

  it('an entry naming a LONGER path that starts with this one is not this install', async () => {
    const home = claudeHome();
    const res = await makeWith(home, (_c, args) => args[1] === 'get' ? 'conducks:\n  Scope: User config\n  Args: /opt/conducks/cli.js.old mcp\n' : '')
      .registerDetected('/opt/conducks/cli.js');

    expect(res[0].message).not.toContain('already registered');
    expect(calls.map(c => c[2])).toEqual(['get', 'remove', 'add']);
  });

  it('an entry in another scope is not removed with --scope user', async () => {
    // `remove --scope user` fails for a local- or project-scope entry; the user's entry is theirs.
    const home = claudeHome();
    const res = await makeWith(home, (_c, args) => args[1] === 'get' ? 'conducks:\n  Scope: Local config (private to you in this project)\n  Args: /old/cli.js mcp\n' : '')
      .registerDetected('/opt/conducks/cli.js');

    expect(calls.map(c => c[2])).toEqual(['get']);
    expect(res[0].success).toBe(false);
    expect(res[0].message).toMatch(/Local config/);
  });
});

describe('Codex (Q-05-8)', () => {
  const codexHome = (toml: string) => {
    const h = mkHome();
    fs.mkdirSync(path.join(h, '.codex'));
    fs.writeFileSync(path.join(h, '.codex', 'config.toml'), toml);
    return h;
  };
  const read = (h: string) => fs.readFileSync(path.join(h, '.codex', 'config.toml'), 'utf8');

  it('does not say "updated" when the block has no args line it can rewrite', async () => {
    const toml = '[mcp_servers.conducks]\ncommand = "node"\nargs = [\n  "/old/cli.js",\n  "mcp",\n]\n';
    const home = codexHome(toml);

    const res = await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');

    expect(res[0].success).toBe(false);
    expect(res[0].message).not.toMatch(/updated/);
    expect(read(home)).toBe(toml);
  });

  it('rewrites a spaceless `args=` line too', async () => {
    const home = codexHome('[mcp_servers.conducks]\ncommand = "node"\nargs=["/old/cli.js", "mcp"]\n');
    await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');
    expect(read(home)).toContain('args = ["/opt/conducks/cli.js", "mcp"]');
    expect(read(home)).not.toContain('/old/cli.js');
  });

  it('a CRLF file is updated in place, not given a second conducks table', async () => {
    const home = codexHome('model = "x"\r\n\r\n[mcp_servers.conducks]\r\ncommand = "node"\r\nargs = ["/old/cli.js", "mcp"]\r\n');
    await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');
    const text = read(home);
    expect(text.match(/\[mcp_servers\.conducks\]/g)).toHaveLength(1);
    expect(text).toContain('/opt/conducks/cli.js');
    expect(text).not.toContain('/old/cli.js');
  });

  it('a path holding `$` patterns is written literally', async () => {
    const home = codexHome('a = 1\n\n[mcp_servers.conducks]\ncommand = "node"\nargs = ["/old/cli.js", "mcp"]\n');
    await makeWith(home, () => '').registerDetected("/opt/$'x$&/cli.js");
    expect(read(home)).toContain(`args = ["/opt/$'x$&/cli.js", "mcp"]`);
    expect(read(home).startsWith('a = 1\n')).toBe(true);
  });
});

describe('JSON configs (Q-05-9)', () => {
  it("backs up a user's own `conducks` entry before replacing it", async () => {
    // `alreadyOurs` meant "an entry named conducks exists", so a hand-written server of that name was
    // overwritten with no `.bak`.
    const home = mkHome();
    fs.mkdirSync(path.join(home, '.cursor'));
    const file = path.join(home, '.cursor', 'mcp.json');
    const original = JSON.stringify({ mcpServers: { conducks: { command: 'python', args: ['my_server.py'] } } });
    fs.writeFileSync(file, original);

    await makeWith(home, () => '').registerDetected('/opt/conducks/cli.js');

    expect(fs.readFileSync(`${file}.bak`, 'utf8')).toBe(original);
  });

  it('still keeps the pre-conducks backup when re-registering over its own entry', async () => {
    const home = mkHome();
    fs.mkdirSync(path.join(home, '.cursor'));
    const file = path.join(home, '.cursor', 'mcp.json');
    fs.writeFileSync(file, JSON.stringify({ mcpServers: {}, marker: 'original' }));

    await makeWith(home, () => '').registerDetected('/opt/conducks/a.js');
    await makeWith(home, () => '').registerDetected('/opt/conducks/b.js');

    const bak = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
    expect(bak.marker).toBe('original');
    expect(bak.mcpServers.conducks).toBeUndefined();
  });
});
