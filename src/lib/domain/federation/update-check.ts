import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { fileURLToPath } from "node:url";

/**
 * Conducks — Update Notice
 *
 * Compares the installed version against the latest GitHub release and TELLS the user. It never
 * upgrades anything: an analysis tool that rewrites its own install behind the user's back is a
 * supply-chain surprise, not a convenience (todo16 Phase 3).
 *
 * This is the ONLY outbound network call in conducks. Everything else is local by construction, so
 * this one is deliberately weak: a 24-hour cache, a 2-second timeout, no retry, every failure
 * swallowed, and `CONDUCKS_NO_UPDATE_CHECK=1` to switch it off. A version notice is never worth
 * making a command slower or noisier.
 */

const RELEASES_URL = "https://api.github.com/repos/Conducks/conducks/releases/latest";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2000;

export interface UpdateStatus {
  installed: string;
  /** undefined when no release is published yet — a different fact from a failed check. */
  latest?: string;
  behind: boolean;
  /** The upgrade command that matches HOW this copy was installed. */
  upgradeCommand: string;
  /** True when the answer came from cache rather than the network. */
  cached: boolean;
  /**
   * Why there is no `latest`. `published` means one exists. `none` means the repo has no releases —
   * expected before the first release and NOT a problem to report. `unreachable` means the check
   * itself failed.
   */
  release: "published" | "none" | "unreachable";
}

interface CacheFile {
  /** Absent means "checked, and no release is published" — a cacheable answer, not a missing one. */
  latest?: string;
  checkedAt: number;
}

export class UpdateCheck {
  /**
   * The cache is per-INSTALL, not per-project: the installed version is the same whichever repo you
   * run in, so `~/.conducks/` is the honest home for it — a project vault would re-ask once per
   * project. (todo16 Phase 3 said `.conducks/`; this is that directory at the level the fact lives.)
   */
  private cachePath: string;

  /** `cacheDir` is injectable so tests never read or write the real home directory. */
  constructor(cacheDir: string = path.join(os.homedir(), ".conducks")) {
    this.cachePath = path.join(cacheDir, "update-check.json");
  }

  /**
   * Returns null only when the check is switched off or this copy's own version is unreadable.
   * Otherwise the result carries WHY there is no version to compare against — a repo with no
   * releases and a machine with no network are different facts and must not print the same line.
   */
  public async check(): Promise<UpdateStatus | null> {
    if (process.env.CONDUCKS_NO_UPDATE_CHECK === "1") return null;

    const installed = this.readInstalledVersion();
    if (!installed) return null;

    const cached = this.readCache();
    if (cached) {
      return cached.latest
        ? this.compare(installed, cached.latest, true)
        : { installed, behind: false, upgradeCommand: this.resolveUpgradeCommand(), cached: true, release: "none" };
    }

    const result = await this.fetchLatestRelease();
    if (result.kind === "unreachable") {
      return { installed, behind: false, upgradeCommand: this.resolveUpgradeCommand(), cached: false, release: "unreachable" };
    }

    // Cache "no release yet" too: before the first release that is the steady state, and re-asking
    // GitHub on every command to be told 404 again is the cost this cache exists to avoid.
    this.writeCache(result.kind === "published" ? result.tag : undefined);

    return result.kind === "published"
      ? this.compare(installed, result.tag, false)
      : { installed, behind: false, upgradeCommand: this.resolveUpgradeCommand(), cached: false, release: "none" };
  }

  /**
   * The version of THIS copy, read from the package.json the build stages beside the compiled tree.
   * Walking up from the compiled file — not `process.cwd()` — because the CLI runs inside whatever
   * project is being analyzed, whose package.json describes that project instead (the same trap
   * `setup` documents for the MCP entry path).
   */
  private readInstalledVersion(): string | undefined {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let hops = 0; hops < 8; hops++) {
      const candidate = path.join(dir, "package.json");
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (pkg.name === "conducks" && typeof pkg.version === "string") return pkg.version;
      } catch { /* not this level — keep walking */ }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return undefined;
  }

  /**
   * How this copy was installed decides the upgrade command, so the notice cannot tell a linked
   * contributor to run `npm i -g`.
   */
  private resolveUpgradeCommand(): string {
    const here = fileURLToPath(import.meta.url);
    // A global install lives under a node_modules/conducks/ path; a linked checkout does not.
    if (here.includes(`${path.sep}node_modules${path.sep}conducks${path.sep}`)) {
      return "npm i -g conducks@latest";
    }
    return "git pull && npm install && npm run build   (linked from source)";
  }

  private compare(installed: string, latest: string, cached: boolean): UpdateStatus {
    return {
      installed,
      latest,
      behind: this.isBehind(installed, latest),
      upgradeCommand: this.resolveUpgradeCommand(),
      cached,
      release: "published",
    };
  }

  /** Numeric semver compare. Anything unparseable counts as NOT behind — silence beats a false alarm. */
  private isBehind(installed: string, latest: string): boolean {
    const parse = (v: string): number[] | undefined => {
      const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
    };
    const a = parse(installed);
    const b = parse(latest);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
      if (b[i] > a[i]) return true;
      if (b[i] < a[i]) return false;
    }
    return false;
  }

  private readCache(): CacheFile | undefined {
    try {
      const raw = JSON.parse(fs.readFileSync(this.cachePath, "utf8")) as CacheFile;
      if (typeof raw.checkedAt !== "number") return undefined;
      if (raw.latest !== undefined && typeof raw.latest !== "string") return undefined;
      if (Date.now() - raw.checkedAt > CACHE_TTL_MS) return undefined;
      return raw;
    } catch {
      return undefined;
    }
  }

  private writeCache(latest: string | undefined): void {
    try {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify({ latest, checkedAt: Date.now() } satisfies CacheFile));
    } catch { /* an uncacheable check is still a valid check */ }
  }

  /**
   * A 404 means the repo has no releases — a real answer. Everything else (offline, rate-limited,
   * malformed body, timeout) is `unreachable`: no answer, and not worth a retry.
   */
  private fetchLatestRelease(): Promise<{ kind: "published"; tag: string } | { kind: "none" } | { kind: "unreachable" }> {
    type Result = { kind: "published"; tag: string } | { kind: "none" } | { kind: "unreachable" };
    return new Promise(resolve => {
      let settled = false;
      const done = (value: Result) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const req = https.get(
        RELEASES_URL,
        {
          // GitHub rejects requests with no User-Agent outright.
          headers: { "User-Agent": "conducks-update-check", Accept: "application/vnd.github+json" },
          timeout: REQUEST_TIMEOUT_MS,
        },
        res => {
          if (res.statusCode === 404) {
            res.resume();
            return done({ kind: "none" });
          }
          if (res.statusCode !== 200) {
            res.resume();
            return done({ kind: "unreachable" });
          }
          let body = "";
          res.setEncoding("utf8");
          res.on("data", chunk => { body += chunk; });
          res.on("end", () => {
            try {
              const tag = JSON.parse(body).tag_name;
              done(typeof tag === "string" && tag.length > 0 ? { kind: "published", tag } : { kind: "unreachable" });
            } catch {
              done({ kind: "unreachable" });
            }
          });
        }
      );

      req.on("timeout", () => { req.destroy(); done({ kind: "unreachable" }); });
      req.on("error", () => done({ kind: "unreachable" }));
    });
  }
}
