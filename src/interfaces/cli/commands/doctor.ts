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

    // 3. tree-sitter WASM files
    const wasmCandidates = [
      path.resolve(process.cwd(), 'node_modules', 'tree-sitter', 'tree-sitter.wasm'),
      path.resolve(process.cwd(), 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm'),
    ];
    const wasmFound = wasmCandidates.some(p => fs.existsSync(p));
    if (wasmFound) {
      ok('tree-sitter WASM found');
    } else {
      // tree-sitter native (non-WASM) is also valid
      const nativeFound = fs.existsSync(path.resolve(process.cwd(), 'node_modules', 'tree-sitter'));
      if (nativeFound) {
        ok('tree-sitter (native) found');
      } else {
        fail('tree-sitter not found — run: npm install tree-sitter');
      }
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
  }
}
