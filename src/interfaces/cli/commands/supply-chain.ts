import { execFileSync } from "node:child_process";
import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
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
  public usage = "conducks supply-chain [--deps-only] [--json]";

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

    const versions = this.readPackageVersions(registry.infrastructure.chronicle.getProjectDir());

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
      const { byPackage: advisories, available } = this.readAdvisories(registry.infrastructure.chronicle.getProjectDir());
      const SEV = { critical: '\x1b[41m', high: '\x1b[31m', moderate: '\x1b[33m', low: '\x1b[2m' } as Record<string, string>;

      for (const p of pkgs) {
        const ver = versions.get(p.pkg);
        const verStr = ver ? `\x1b[2m${ver}\x1b[0m` : `\x1b[33m(not in package.json)\x1b[0m`;
        const adv = advisories.get(p.pkg);
        const advStr = adv ? `  ${SEV[adv.severity] ?? ''}[${adv.severity}]\x1b[0m` : '';
        console.log(`    ${p.pkg.padEnd(32)} ${String(Number(p.importers)).padStart(3)} importers  ${verStr}${advStr}`);
      }

      // Which of the ADVISORIES actually touch imported code — the join the graph exists for.
      // `npm audit` says what is vulnerable; this says how much of your code stands behind it.
      if (!available) {
        console.log(`\n\x1b[2m  Advisories unavailable (no network, no lockfile, or npm audit failed) — vulnerability status is UNKNOWN, not clean.\x1b[0m`);
      } else {
        const reached = pkgs.filter(p => advisories.has(p.pkg));
        const exposure = reached.reduce((n, p) => n + Number(p.importers), 0);
        console.log(reached.length
          ? `\n\x1b[31m  ⚠️  ${reached.length} imported package(s) carry advisories, reached by ${exposure} import(s).\x1b[0m`
          : `\n\x1b[32m  ✅ No advisory affects an imported package (${advisories.size} advisory/advisories exist but none is reached by this code).\x1b[0m`);
      }
      const unpinned = pkgs.filter(p => !versions.get(p.pkg)).length;
      if (unpinned > 0) {
        console.log(`\n\x1b[33m  ⚠️  ${unpinned} imported package(s) are not declared in package.json (phantom dependency).\x1b[0m`);
      }
    }
  }

  /**
   * Known advisories per package, from `npm audit --json` (todo09#P3).
   *
   * This was recorded as blocked on "an advisory database, unreachable from this environment" — and
   * the environment reaches it fine. The blocker was never re-checked, so the task sat parked while
   * `npm audit` worked the whole time.
   *
   * The join is by PACKAGE NAME onto the boundary nodes the graph already holds, which is the point:
   * `npm audit` alone lists what is vulnerable, and this says how much of YOUR code stands behind
   * each one. A high-severity advisory in a package with one importer is a different morning from
   * the same advisory in a package with 139.
   *
   * Returns an EMPTY map on any failure — no network, no lockfile, an npm that does not support
   * `--json`. A supply-chain report that refuses to print because the advisory feed is down is worse
   * than one that prints what it knows, and the caller says which case it is rather than showing a
   * reassuring zero.
   */
  private readAdvisories(projectDir: string): { byPackage: Map<string, { severity: string; count: number }>; available: boolean } {
    const byPackage = new Map<string, { severity: string; count: number }>();
    try {
      const raw = execFileSync('npm', ['audit', '--json'], {
        cwd: projectDir, encoding: 'utf-8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      // `npm audit` EXITS NON-ZERO when it finds vulnerabilities, which is the normal case here.
      // Treating that as failure is how this reports "no advisories" on a project that has them.
      }) as unknown as string;
      return { byPackage: this.parseAudit(raw, byPackage), available: true };
    } catch (err: any) {
      const raw = err?.stdout ? String(err.stdout) : '';
      if (raw.trim().startsWith('{')) return { byPackage: this.parseAudit(raw, byPackage), available: true };
      return { byPackage, available: false };
    }
  }

  private parseAudit(raw: string, out: Map<string, { severity: string; count: number }>): Map<string, { severity: string; count: number }> {
    try {
      const report = JSON.parse(raw);
      for (const [name, v] of Object.entries<any>(report?.vulnerabilities ?? {})) {
        const via = Array.isArray(v?.via) ? v.via.filter((x: any) => typeof x === 'object') : [];
        out.set(name, { severity: String(v?.severity ?? 'unknown'), count: via.length || 1 });
      }
    } catch { /* a malformed report is no report */ }
    return out;
  }

  /** Live-read declared versions from the nearest package.json (dependencies + devDependencies). */
  private readPackageVersions(projectDir: string): Map<string, string> {
    const out = new Map<string, string>();
    try {
      const root = projectDir || process.cwd();
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
