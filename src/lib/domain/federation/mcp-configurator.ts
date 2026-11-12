import fs from "fs-extra";
import { writeFileSync, renameSync, copyFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

/**
 * Writes a client config atomically, keeping `.bak` as the user's config from BEFORE conducks.
 *
 * Every write used to copy the current file to `.bak`, so a second write — re-registering, or
 * `uninstall` after `setup` — replaced the user's original with a config conducks had already edited,
 * and the original was gone (state-machine audit P-08-12). Only a file conducks has not touched is
 * backed up now. A failed write removes its `.tmp` rather than leaving it behind.
 */
export function writeConfigWithBackup(file: string, config: unknown, backUp: boolean): void {
  const tmpPath = file + '.tmp';
  try {
    writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    if (backUp && existsSync(file)) copyFileSync(file, file + '.bak');
    renameSync(tmpPath, file);
  } catch (err) {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* best effort */ }
    throw err;
  }
}

/** Runs a client's own CLI; throws on a non-zero exit. Injected so tests never run a real one. */
type Exec = (cmd: string, args: string[]) => string;


/**
 * Conducks — MCP Configurator
 */
export class MCPConfigurator {
  private readonly claudeConfigPath: string;

  constructor(
    private readonly fsMock: any = fs,
    private readonly osMock: any = os,
    private readonly exec: Exec = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 })
  ) {
    this.claudeConfigPath = path.join(
      this.osMock.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  }

  /**
   * Registers Conducks in the Claude Desktop configuration.
   */
  public async registerClaude(serverPath: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!(await this.fsMock.pathExists(this.claudeConfigPath))) {
        // Create basic config if not exists
        await this.fsMock.ensureDir(path.dirname(this.claudeConfigPath));
        await this.fsMock.writeJson(this.claudeConfigPath, { mcpServers: {} });
      }

      await this.mergeJson(this.claudeConfigPath, serverPath, { disabled: false });
      return { success: true, message: `✅ Successfully registered Conducks in Claude Desktop.` };
    } catch (err) {
      return { success: false, message: `❌ Claude Setup Failed: ${(err as Error).message}` };
    }
  }

  /** Adds or replaces `mcpServers.conducks` in one JSON config, keeping everything else; backs the old file up. */
  private async mergeJson(file: string, serverPath: string, extra: Record<string, unknown> = {}): Promise<void> {
    const config = (await this.fsMock.pathExists(file)) ? await this.fsMock.readJson(file) : {};
    // Captured BEFORE the edit: a config that already holds a conducks entry is one this tool wrote.
    const alreadyOurs = !!config?.mcpServers?.["conducks"];
    config.mcpServers = config.mcpServers || {};
    config.mcpServers["conducks"] = {
      command: "node",
      // The "mcp" arg is required — serverPath is the CLI entry, and without a command it
      // prints help and exits instead of starting the server.
      args: [serverPath, "mcp"],
      ...extra,
    };
    writeConfigWithBackup(file, config, !alreadyOurs);
  }

  /**
   * Registers conducks in every OTHER MCP client found on this machine, so `setup` is the last
   * step for whichever agent the user runs (todo82#P8). A client counts as installed when its
   * config directory exists; a directory is never created for a client that is not there.
   *
   * Claude Code is registered through its own CLI: it rewrites `~/.claude.json` while it runs, so
   * a second writer would race it. Codex keeps TOML, so its block is appended, never rewritten.
   */
  public async registerDetected(serverPath: string): Promise<Array<{ client: string; success: boolean; message: string }>> {
    const home = this.osMock.homedir();
    const out: Array<{ client: string; success: boolean; message: string }> = [];
    const attempt = async (client: string, fn: () => Promise<string>) => {
      try { out.push({ client, success: true, message: `✅ ${client}: ${await fn()}` }); }
      catch (err) { out.push({ client, success: false, message: `❌ ${client}: ${(err as Error).message}` }); }
    };

    const jsonClients: Array<[string, string]> = [
      ['Cursor', path.join(home, '.cursor', 'mcp.json')],
      ['Windsurf', path.join(home, '.codeium', 'windsurf', 'mcp_config.json')],
      ['Antigravity', path.join(home, '.gemini', 'antigravity', 'mcp_config.json')],
      ['Gemini CLI', path.join(home, '.gemini', 'settings.json')],
    ];
    for (const [client, file] of jsonClients) {
      if (!existsSync(path.dirname(file))) continue;
      await attempt(client, async () => { await this.mergeJson(file, serverPath); return `registered in ${file}`; });
    }

    if (existsSync(path.join(home, '.claude.json'))) {
      await attempt('Claude Code', async () => {
        try { this.exec('claude', ['mcp', 'get', 'conducks']); return 'already registered'; } catch { /* not registered yet */ }
        this.exec('claude', ['mcp', 'add', '--scope', 'user', 'conducks', '--', 'node', serverPath, 'mcp']);
        return 'registered for every project (user scope)';
      });
    }

    const codex = path.join(home, '.codex', 'config.toml');
    if (existsSync(path.dirname(codex))) {
      await attempt('Codex', async () => {
        const current = existsSync(codex) ? await this.fsMock.readFile(codex, 'utf8') : '';
        if (current.includes('[mcp_servers.conducks]')) return 'already registered';
        const block = `\n[mcp_servers.conducks]\ncommand = "node"\nargs = [${JSON.stringify(serverPath)}, "mcp"]\n`;
        writeFileSync(codex, current + (current && !current.endsWith('\n') ? '\n' : '') + block, 'utf8');
        return `registered in ${codex}`;
      });
    }
    return out;
  }
}
