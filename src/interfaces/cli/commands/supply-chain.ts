import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import fs from "node:fs";
import path from "node:path";

/**
 * Conducks — Supply-Chain Command (System 2, ADR 0014)
 *
 * Surfaces the boundary-origin classification: how much of the graph leaves the repo, split into
 * trusted-unversioned stdlib vs versioned third-party dependencies, and which packages carry the
 * widest blast radius (most importing files). Versions are joined live from package.json.
 */
export class SupplyChainCommand implements ConducksCommand {
  public id = "supply-chain";
  public description = "Report the dependency / boundary surface (stdlib vs versioned deps)";
  public usage = "conducks supply-chain [--deps-only]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const depsOnly = args.includes("--deps-only");
    const persistence = registry.infrastructure.persistence;

    const summary = await persistence.query<{ origin: string; edges: number; surfaces: number }>(
      `SELECT json_extract_string(properties,'$.origin') AS origin,
              COUNT(*) AS edges, COUNT(DISTINCT targetId) AS surfaces
       FROM edges WHERE type = 'DEPENDS_ON'
         AND json_extract_string(properties,'$.origin') IS NOT NULL
       GROUP BY 1 ORDER BY 2 DESC`
    );

    if (summary.length === 0) {
      console.log(`\x1b[33m⚠️  No boundary edges found. Run 'conducks analyze' first.\x1b[0m`);
      return;
    }

    const versions = this.readPackageVersions();

    console.log(`\n\x1b[1m--- 🏺 Supply-Chain Surface (System 2) ---\x1b[0m`);
    for (const row of summary) {
      if (depsOnly && row.origin !== "dependency") continue;
      const tag = row.origin === "dependency" ? "\x1b[31m" : row.origin === "stdlib" ? "\x1b[36m" : "\x1b[2m";
      console.log(`${tag}  ${row.origin.padEnd(11)}\x1b[0m ${Number(row.edges)} edges · ${Number(row.surfaces)} distinct`);
    }

    const pkgs = await persistence.query<{ pkg: string; importers: number }>(
      `SELECT json_extract_string(properties,'$.package') AS pkg,
              COUNT(DISTINCT sourceId) AS importers
       FROM edges WHERE type = 'DEPENDS_ON'
         AND json_extract_string(properties,'$.origin') = 'dependency'
         AND json_extract_string(properties,'$.package') IS NOT NULL
       GROUP BY 1 ORDER BY 2 DESC`
    );

    if (pkgs.length > 0) {
      console.log(`\n\x1b[1m  Dependencies by blast radius (importing files):\x1b[0m`);
      for (const p of pkgs) {
        const ver = versions.get(p.pkg);
        const verStr = ver ? `\x1b[2m${ver}\x1b[0m` : `\x1b[33m(not in package.json)\x1b[0m`;
        console.log(`    ${p.pkg.padEnd(32)} ${String(Number(p.importers)).padStart(3)} importers  ${verStr}`);
      }
      const unpinned = pkgs.filter(p => !versions.get(p.pkg)).length;
      if (unpinned > 0) {
        console.log(`\n\x1b[33m  ⚠️  ${unpinned} imported package(s) are not declared in package.json (phantom dependency).\x1b[0m`);
      }
    }
  }

  /** Live-read declared versions from the nearest package.json (dependencies + devDependencies). */
  private readPackageVersions(): Map<string, string> {
    const out = new Map<string, string>();
    try {
      const root = chronicle.getProjectDir() || process.cwd();
      const pkgPath = path.join(root, "package.json");
      if (!fs.existsSync(pkgPath)) return out;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      for (const block of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
        if (block && typeof block === "object") {
          for (const [name, ver] of Object.entries(block)) out.set(name, String(ver));
        }
      }
    } catch { /* best-effort — no versions if package.json is unreadable */ }
    return out;
  }
}
