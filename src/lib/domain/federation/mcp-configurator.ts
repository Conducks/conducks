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
    // Captured BEFORE the edit: a config whose conducks entry has the shape this tool writes is one
    // this tool already edited, and its `.bak` holds the user's original (P-08-12). An entry merely
    // NAMED conducks is not proof of that — a user's own server of that name was overwritten with no
    // backup (state-machine audit round 2, Q-05-9).
    const entry = config?.mcpServers?.["conducks"];
    const alreadyOurs = !!entry && entry.command === "node" && Array.isArray(entry.args)
      && entry.args.length === 2 && entry.args[1] === "mcp";
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
      // An entry that EXISTS is not necessarily CURRENT: a reinstall under another node version or
      // global prefix moves the CLI, and "already registered" left Claude Code starting conducks from
      // the old, removed path (state-machine audit P-05-5). The entry is kept only when it names this
      // install; otherwise it is replaced.
      await attempt('Claude Code', async () => {
        const addArgs = ['mcp', 'add', '--scope', 'user', 'conducks', '--', 'node', serverPath, 'mcp'];
        let existing: string | null = null;
        try { existing = String(this.exec('claude', ['mcp', 'get', 'conducks']) ?? ''); } catch { /* not registered yet */ }
        if (existing === null) {
          this.exec('claude', addArgs);
          return 'registered for every project (user scope)';
        }
        // This install is named as a whole argument, not as a substring: `/a/cli.js` is not
        // `/a/cli.js.old` (state-machine audit round 2, Q-05-7).
        const argsLine = existing.split('\n').find(l => /^\s*Args:/i.test(l)) ?? '';
        if (argsLine.replace(/^\s*Args:/i, '').trim().split(/\s+/).includes(serverPath)) return 'already registered';
        // Only a USER-scope entry is replaced. `remove --scope user` fails for a local or project entry,
        // and that entry is the user's to change, not ours.
        const scope = existing.split('\n').find(l => /^\s*Scope:/i.test(l))?.replace(/^\s*Scope:/i, '').trim();
        if (scope && !/^user/i.test(scope)) {
          throw new Error(`a conducks entry in ${scope} points at another install; not changed. Run: claude ${addArgs.join(' ')} after removing it`);
        }
        this.exec('claude', ['mcp', 'remove', '--scope', 'user', 'conducks']);
        try { this.exec('claude', addArgs); }
        catch (err) {
          // The old entry is already gone: say so, and how to finish, rather than only the add's error.
          throw new Error(`removed the entry for another install, then adding this one failed (${(err as Error).message}). Claude Code has NO conducks entry now. Run: claude ${addArgs.join(' ')}`);
        }
        return 'updated to this install (user scope)';
      });
    }

    const codex = path.join(home, '.codex', 'config.toml');
    if (existsSync(path.dirname(codex))) {
      await attempt('Codex', async () => {
        const current = existsSync(codex) ? await this.fsMock.readFile(codex, 'utf8') : '';
        const argsLine = `args = [${JSON.stringify(serverPath)}, "mcp"]`;
        // The block runs from its header to the next table header (or the end of the file). `\r?` so
        // a CRLF file is found too: it was not, and a second `[mcp_servers.conducks]` table was
        // appended — invalid TOML (state-machine audit round 2, Q-05-8).
        const existing = current.match(/(^|\r?\n)\[mcp_servers\.conducks\]\r?\n[\s\S]*?(?=\r?\n\[|$)/);
        if (existing) {
          if (existing[0].includes(argsLine)) return 'already registered';
          // Same P-05-5 fault as Claude Code: rewrite the block's args to this install, touch nothing else.
          // Replacements are FUNCTIONS: a string replacement expands `$&` and `$'` inside the path.
          // Only a COMPLETE one-line array: the first line of a multi-line one is `args = [`, and
          // replacing it alone would leave the rest of the array behind as broken TOML.
          const updated = existing[0].replace(/^args\s*=\s*\[.*\]([ \t]*\r?)$/m, (_m: string, eol: string) => argsLine + eol);
          if (!updated.includes(argsLine)) {
            // No single-line `args =` to rewrite (a multi-line array): the file is left as it was, and
            // that is said — it used to report "updated" over an unchanged file.
            throw new Error(`the conducks block in ${codex} has no single-line \`args = [...]\`; not changed. Set it to: ${argsLine}`);
          }
          writeFileSync(codex, current.replace(existing[0], () => updated), 'utf8');
          return `updated to this install in ${codex}`;
        }
        const block = `\n[mcp_servers.conducks]\ncommand = "node"\n${argsLine}\n`;
        writeFileSync(codex, current + (current && !current.endsWith('\n') ? '\n' : '') + block, 'utf8');
        return `registered in ${codex}`;
      });
    }
    return out;
  }
}
