import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { UpdateCheck } from "@/lib/domain/federation/update-check.js";

/**
 * Conducks — Doctor Command
 *
 * Checks environment health and reports issues.
 */
export class DoctorCommand implements ConducksCommand {
  public id = "doctor";
  public description = "Check environment health for Conducks";
  public usage = "conducks doctor";

  public async execute(_args: string[], _registry: Registry): Promise<void> {
    const ok = (msg: string) => console.log(`[✓] ${msg}`);
    const fail = (msg: string) => console.log(`[✗] ${msg}`);
    const warn = (msg: string) => console.log(`[!] ${msg}`);

    // 1. Node.js version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (nodeMajor >= 18) {
      ok(`Node.js ${nodeVersion}`);
    } else {
      warn(`Node.js ${nodeVersion} — version 18+ recommended`);
    }

    // 2. DuckDB loadable
    try {
      await import('duckdb');
      ok('DuckDB loadable');
    } catch (_) {
      fail('DuckDB not loadable — run: npm install duckdb');
    }

    // 3. Which parse path is live.
    // The native binding is an OPTIONAL dependency (ADR 0027): `tree-sitter` ships no prebuilds, so
    // it compiles at install time and is absent wherever there is no C++ toolchain. Conducks still
    // analyzes there, through the Gnosis regex extractor — at lower fidelity. Say which one is running.
    if (grammars.isNativeAvailable()) {
      const languages = [
        'typescript', 'tsx', 'javascript', 'python', 'go', 'rust',
        'java', 'csharp', 'cpp', 'php', 'ruby', 'swift', 'c',
      ];
      await Promise.all(languages.map(id => grammars.loadLanguage(id)));
      const missing = languages.filter(id => grammars.isLanguageUnavailable(id));
      if (missing.length === 0) {
        ok(`Parse path: native tree-sitter, all ${languages.length} grammars induced`);
      } else {
        warn(`Parse path: native tree-sitter, ${languages.length - missing.length}/${languages.length} grammars induced`);
        warn(`  Gnosis regex fallback covers: ${missing.join(', ')}`);
      }
    } else {
      warn('Parse path: Gnosis regex fallback — the native tree-sitter binding did not load');
      warn('  Analysis still works, at lower fidelity. For full fidelity install a C++ toolchain');
      warn('  (macOS: xcode-select --install · Debian: apt install build-essential · Windows:');
      warn('  VS Build Tools), then reinstall conducks.');
    }

    // 4. git available
    try {
      execSync('which git', { stdio: 'ignore' });
      ok('git available');
    } catch (_) {
      fail('git not found — install git to enable history analysis');
    }

    // 5. Conducks vault location
    const projectRoot = _args[0] ? path.resolve(_args[0]) : process.cwd();
    const vaultPath = path.resolve(projectRoot, '.conducks');
    if (fs.existsSync(vaultPath)) {
      // 6. Last pulse timestamp
      const dbCandidates = [
        path.join(vaultPath, 'conducks-synapse.db'),
        path.join(vaultPath, 'synapse.db'),
        path.join(vaultPath, 'conducks.db'),
      ];
      const dbPath = dbCandidates.find(p => fs.existsSync(p));
      if (dbPath) {
        const stat = fs.statSync(dbPath);
        const ageMs = Date.now() - stat.mtimeMs;
        const ageHours = ageMs / (1000 * 60 * 60);
        const ageStr = ageHours < 1
          ? `${Math.round(ageMs / 60000)} minutes ago`
          : ageHours < 24
          ? `${Math.round(ageHours)} hours ago`
          : `${Math.round(ageHours / 24)} days ago`;
        ok(`Vault at .conducks/ (last pulse: ${ageStr})`);
      } else {
        ok('Vault at .conducks/ (no DB yet — run: conducks analyze <path>)');
      }
    } else {
      fail('No vault found — run: conducks analyze <path>');
    }

    // 7. Version notice. Reported, never acted on — see UpdateCheck for why this is the one
    // outbound call and how it stays cheap. `null` means "no information", not "up to date".
    const update = await new UpdateCheck().check();
    if (!update) {
      ok('Version: update check skipped');
    } else if (update.release === 'unreachable') {
      warn(`Version: ${update.installed} installed — could not reach GitHub to check for updates`);
    } else if (update.release === 'none') {
      ok(`Version: ${update.installed} (no release published yet)`);
    } else if (update.behind) {
      warn(`Version: ${update.installed} installed, ${update.latest} available`);
      warn(`  Upgrade with: ${update.upgradeCommand}`);
    } else {
      ok(`Version: ${update.installed} (latest)`);
    }
  }
}
