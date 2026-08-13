import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Conducks — Doctor Command
 *
 * Checks environment health and reports issues.
 */
export class DoctorCommand implements ConducksCommand {
  public id = "doctor";
  public description = "Check environment health for Conducks";
  public usage = "conducks doctor";

  public async execute(_args: string[], registry: Registry): Promise<void> {
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
      await import('@duckdb/node-api');
      ok('DuckDB loadable');
    } catch (_) {
      fail('DuckDB not loadable — run: npm install @duckdb/node-api');
    }

    // 3. Which parse path is live — and there is only ONE.
    // The native binding is an OPTIONAL dependency (ADR 0027): `tree-sitter` ships no prebuilds, so
    // it compiles at install time and is absent wherever there is no C++ toolchain. This used to say
    // the Gnosis regex extractor covered that, and it did until ADR 0089 DELETED the fallback —
    // native tree-sitter is now the only parse path, and `analyze` refuses outright without it
    // (orchestrator.ts, "Refusing to write a graph rather than writing an empty one that looks real").
    // MEASURED on alpine/musl, where the binding cannot build: doctor promised "Analysis still works,
    // at lower fidelity" and the very next `conducks analyze` refused. A doctor that reports a
    // working environment as working when it does not is worse than no doctor.
    if (registry.infrastructure.isNativeGrammarAvailable()) {
      const languages = [
        'typescript', 'tsx', 'javascript', 'python', 'go', 'rust',
        'java', 'csharp', 'cpp', 'php', 'ruby', 'swift', 'c',
      ];
      await Promise.all(languages.map(id => registry.infrastructure.loadGrammar(id)));
      const missing = languages.filter(id => registry.infrastructure.isGrammarUnavailable(id));
      if (missing.length === 0) {
        ok(`Parse path: native tree-sitter, all ${languages.length} grammars induced`);
      } else {
        warn(`Parse path: native tree-sitter, ${languages.length - missing.length}/${languages.length} grammars induced`);
        warn(`  Not induced: ${missing.join(', ')} — files in those languages are REPORTED UNREAD, not degraded (ADR 0089)`);
      }
    } else {
      fail('Parse path: NONE — the native tree-sitter binding did not load, so `analyze` cannot run');
      fail('  There is no regex fallback (ADR 0089): conducks refuses to write a graph rather than');
      fail('  write an empty one that looks real. Install a C++ toolchain (macOS: xcode-select');
      fail('  --install · Debian: apt install build-essential · Alpine: apk add build-base python3 ·');
      fail('  Windows: VS Build Tools), then reinstall conducks. On Node 23+: CXXFLAGS="-std=c++20" npm install');
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
    const update = await registry.federation.createUpdateCheck().check();
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
