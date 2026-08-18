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
/**
 * Python packages whose IMPORT name is not their DISTRIBUTION name.
 *
 * `import yaml` is declared as `pyyaml`, `import bs4` as `beautifulsoup4`. The graph records what the
 * code imports and the manifest records what pip installs, so without this map a correctly declared
 * dependency is reported as undeclared — the same false alarm the root-manifest-only read produced,
 * one layer down. Kept to the well-known cases; an unknown mismatch reads as undeclared, which is
 * the honest answer for a name nothing in the tree declares.
 */
const PY_DIST_NAMES: Record<string, string> = {
  yaml: 'pyyaml', bs4: 'beautifulsoup4', PIL: 'pillow', cv2: 'opencv-python',
  sklearn: 'scikit-learn', dotenv: 'python-dotenv', jwt: 'pyjwt', dateutil: 'python-dateutil',
  serial: 'pyserial', OpenSSL: 'pyopenssl', pkg_resources: 'setuptools', attr: 'attrs',
  magic: 'python-magic', win32com: 'pywin32',
};

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

    const useJson = args.includes("--json");

    if (summary.length === 0) {
      // TWO different states used to print one sentence. "No boundary edges" is the honest answer
      // for a project with no third-party imports — telling that user to run `analyze` sends them to
      // repeat work they already did, and reads as a tool failure rather than a true empty answer.
      // An UNANALYSED project is a different case and still gets the instruction. The graph itself
      // is what tells them apart: a vault with nodes has been analyzed.
      const [{ n }] = await persistence.query<{ n: number }>('SELECT count(*)::INT AS n FROM nodes');
      const analysed = Number(n) > 0;
      if (useJson) {
        process.stdout.write(JSON.stringify({ origins: [], packages: [], analysed, advisories: { available: false } }, null, 2) + '\n');
        return;
      }
      console.log(analysed
        ? `  ·  No third-party dependencies — every import in this project resolves inside it.\n     That is the answer, not a missing analysis.`
        : `\x1b[33m⚠️  No boundary edges, and this project has not been analyzed. Run 'conducks analyze' first.\x1b[0m`);
      return;
    }

    const versions = this.readPackageVersions(registry.infrastructure.chronicle.getProjectDir());

    // `--json` was ADVERTISED in this command's usage before it existed. ADR 0119 derived each
    // command's flag set with a regex over its source, and here that pattern matched
    // `json_extract_string(...)` inside a SQL string rather than a flag read — so `[--json]` was
    // added to the usage of a command that had no such flag, and the dispatcher then accepted it
    // and printed human output. Implementing it makes the advertisement true (ADR 0122).
    //
    // `advisories.available` travels in the payload because the human branch already says it out
    // loud: unavailable advisories mean vulnerability status is UNKNOWN, not clean, and a machine
    // reader needs that distinction as much as a person does.
    if (useJson) {
      const pkgRows = await persistence.query<{ pkg: string; importers: number }>(
        `SELECT json_extract_string(properties,'$.package') AS pkg,
                COUNT(DISTINCT sourceId) AS importers
         FROM edges WHERE type = 'DEPENDS_ON'
           AND json_extract_string(properties,'$.origin') = 'dependency'
           AND json_extract_string(properties,'$.package') IS NOT NULL
         GROUP BY 1 ORDER BY 2 DESC`
      );
      const { byPackage, available } = this.readAdvisories(registry.infrastructure.chronicle.getProjectDir());
      process.stdout.write(JSON.stringify({
        origins: summary
          .filter(r => !depsOnly || r.origin === 'dependency')
          .map(r => ({ origin: r.origin, edges: Number(r.edges), distinctSurfaces: Number(r.surfaces) })),
        packages: pkgRows.map(p => ({
          package: p.pkg,
          importers: Number(p.importers),
          version: versions.get(p.pkg) ?? versions.get(PY_DIST_NAMES[p.pkg] ?? '') ?? null,
          advisory: byPackage.get(p.pkg) ?? null,
        })),
        advisories: { available },
      }, null, 2) + '\n');
      return;
    }

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
        const ver = versions.get(p.pkg) ?? versions.get(PY_DIST_NAMES[p.pkg] ?? '');
        // "not in package.json" was wrong twice over: on a Python project there is no package.json,
        // and in a monorepo the declaration lives one directory down. The manifests are all read
        // now, so the honest word for a package none of them names is UNDECLARED.
        const verStr = ver ? `\x1b[2m${ver}\x1b[0m` : `\x1b[33m(undeclared)\x1b[0m`;
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
  /**
   * Every dependency this repository DECLARES, from every manifest in the tree.
   *
   * This used to read the ROOT `package.json` and nothing else, which is wrong in the two layouts
   * that matter most:
   *
   *   - An npm WORKSPACES monorepo declares per workspace. On the orchestrator subject the root
   *     declares two packages (`react`, `react-dom`) while `app/package.json` declares 33 and
   *     `admin/package.json` 30 — so `next` (224 importers), `next-auth` (63) and `vitest` (115)
   *     were all reported "(not in package.json)", two of them decorated with a `[critical]`
   *     advisory badge. The command's loudest output was produced BY the project doing it right.
   *
   *   - A PYTHON project has no `package.json` at all. On the scraper subject every one of the 91
   *     reported packages was annotated "(not in package.json)" — including its five real
   *     `pyproject.toml` dependencies.
   *
   * Read from the filesystem rather than the graph because the graph does not keep declared
   * versions: `EssenceLens` parses them and neither the ECOSYSTEM node nor the DEPENDS_ON edge
   * retains the `version` it was given (verified against both subjects' vaults).
   */
  private readPackageVersions(projectDir: string): Map<string, string> {
    const out = new Map<string, string>();
    const root = projectDir || process.cwd();
    const SKIP = new Set(['node_modules', '.git', '.conducks', 'dist', 'build', 'coverage',
                          'venv', '.venv', '__pycache__', 'vendor', 'target']);

    const walk = (dir: string, depth: number): void => {
      if (depth > 4) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), depth + 1);
          continue;
        }
        const full = path.join(dir, e.name);
        try {
          if (e.name === 'package.json') this.mergePackageJson(full, out);
          else if (e.name === 'requirements.txt') this.mergeRequirements(full, out);
          else if (e.name === 'pyproject.toml') this.mergePyproject(full, out);
        } catch { /* a manifest that will not parse declares nothing */ }
      }
    };
    walk(root, 0);
    return out;
  }

  private mergePackageJson(file: string, out: Map<string, string>): void {
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const block of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
      if (block && typeof block === "object") {
        // FIRST declaration wins, so the root's pin is not overwritten by a workspace's range.
        for (const [name, ver] of Object.entries(block)) if (!out.has(name)) out.set(name, String(ver));
      }
    }
  }

  private mergeRequirements(file: string, out: Map<string, string>): void {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('-')) continue;
      const name = t.split(/[<>=!~;[\s]/)[0].trim();
      const ver = t.slice(name.length).trim() || 'declared';
      if (name && !out.has(name)) out.set(name, ver);
    }
  }

  /**
   * PEP 621 / Poetry dependency declarations.
   *
   * Read with a scanner rather than a TOML parser because the only question here is "is this name
   * declared, and at what constraint" — and adding a TOML dependency to answer it would be a
   * supply-chain decision made by the supply-chain command.
   */
  private mergePyproject(file: string, out: Map<string, string>): void {
    const src = fs.readFileSync(file, "utf8");

    // `dependencies = ["duckdb>=1.5.4", ...]`, `dev = [...]`, `optional-dependencies` tables.
    for (const m of src.matchAll(/^\s*(?:[\w.-]+\s*=\s*)?\[([^\]]*)\]/gms)) {
      const body = m[1];
      if (!body.includes('"') && !body.includes("'")) continue;
      for (const q of body.matchAll(/["']([^"']+)["']/g)) {
        const spec = q[1].trim();
        const name = spec.split(/[<>=!~;[\s]/)[0].trim();
        const ver = spec.slice(name.length).trim() || 'declared';
        if (/^[A-Za-z][\w.-]*$/.test(name) && !out.has(name)) out.set(name, ver);
      }
    }

    // Poetry's table form: `[tool.poetry.dependencies]` followed by `name = "^1.2"` lines.
    const poetry = src.match(/\[tool\.poetry\.(?:dev-)?dependencies\]([\s\S]*?)(?=\n\[|$)/);
    if (poetry) {
      for (const line of poetry[1].split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z][\w.-]*)\s*=\s*(.+)$/);
        if (m && !out.has(m[1])) out.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
      }
    }
  }
}
