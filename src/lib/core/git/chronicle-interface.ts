import { execFileSync } from 'node:child_process';
import fsSync from "node:fs";
import path from 'node:path';
import { logger } from '@/lib/core/utils/logger.js';

/**
 * Non-code files the FS fallback still ingests. No language provider declares these — they carry
 * config/documentation context, not structural DNA, so they cannot be derived from the providers.
 */
const NON_CODE_EXTENSIONS = ['.json', '.txt', '.md'];

/**
 * Exact filenames the FS fallback ingests, matched by name instead of extension.
 *
 * `.env` lives here, not in NON_CODE_EXTENSIONS: `path.extname('.env')` returns `''` for a leading-dot
 * file, so the old list's `.env` entry could never match and `.env` was silently skipped.
 */
const NON_CODE_FILENAMES = ['Dockerfile', '.env'];

/**
 * Extensions git discovery refuses outright: binary or media files that cannot carry a symbol.
 *
 * A DENYLIST, not the provider allowlist `getDiscoverySurface()` builds, for two reasons. Deriving the
 * allowlist means importing all 13 language providers, and this is the HOT path — the providers are
 * loaded dynamically precisely so they stay off it (see `getDiscoverySurface`, and the ESM cycle it
 * documents). And a denylist fails SAFE: an unknown extension is still analyzed, so a language added
 * later is never silently skipped, whereas a stale allowlist would drop it.
 *
 * Measured on mentorseed before this existed: 53 `.png` and `.svg` files were read as UTF-8 and given
 * graph nodes — noise in the graph, a wasted read each, and a skew in any per-file ratio taken from the
 * unit count (1,041 "units" against 692 actual code files).
 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif', '.tiff', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.gz', '.tar', '.tgz', '.bz2', '.7z', '.rar',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.mov', '.avi',
  '.wasm', '.node', '.dylib', '.so', '.dll', '.exe', '.bin', '.class', '.jar',
  '.db', '.sqlite', '.sqlite3', '.lock',
]);

interface DiscoverySurface {
  extensions: Set<string>;
  filenames: Set<string>;
}

let discoverySurface: DiscoverySurface | undefined;

/**
 * Derives what the FS fallback accepts from what the language providers actually declare
 * (CONDUCKS-2: `extensions: string[]` per provider). The old hardcoded list silently dropped most
 * supported languages (.rs .tsx .jsx .cs .c .cpp .h .hpp .php .swift) while listing .kt, for which
 * no provider or grammar exists.
 *
 * The providers are pulled in via dynamic `import()`, NOT static imports: typescript/resolver.ts
 * imports the `chronicle` singleton from this very file, so a static provider import here closes an
 * ESM cycle and crashes with a TDZ error on whichever module is evaluated second. Deferring the load
 * to first call breaks the cycle — and this is the cold path (git discovery already failed), so the
 * providers are never loaded in the normal case. Same idiom, same reason, as pulse-worker.ts.
 *
 * Providers are cheap value objects; grammars load lazily via the GrammarRegistry. Some declare bare
 * filenames (Ruby's `Rakefile`, `Gemfile`) alongside real extensions, so the two are split apart to
 * keep `path.extname()` matching correct.
 */
async function getDiscoverySurface(): Promise<DiscoverySurface> {
  if (discoverySurface) return discoverySurface;

  const modules = await Promise.all([
    import("@/lib/core/parsing/languages/python/index.js"),
    import("@/lib/core/parsing/languages/typescript/index.js"),
    import("@/lib/core/parsing/languages/tsx/index.js"),
    import("@/lib/core/parsing/languages/javascript/index.js"),
    import("@/lib/core/parsing/languages/go/index.js"),
    import("@/lib/core/parsing/languages/rust/index.js"),
    import("@/lib/core/parsing/languages/java/index.js"),
    import("@/lib/core/parsing/languages/csharp/index.js"),
    import("@/lib/core/parsing/languages/cpp/index.js"),
    import("@/lib/core/parsing/languages/php/index.js"),
    import("@/lib/core/parsing/languages/ruby/index.js"),
    import("@/lib/core/parsing/languages/swift/index.js"),
    import("@/lib/core/parsing/languages/c/index.js")
  ]);

  const declared = [
    new modules[0].PythonProvider(),
    new modules[1].TypeScriptProvider(),
    new modules[2].TSXProvider(),
    new modules[3].JavaScriptProvider(),
    new modules[4].GoProvider(),
    new modules[5].RustProvider(),
    new modules[6].JavaProvider(),
    new modules[7].CSharpProvider(),
    new modules[8].CPPProvider(),
    new modules[9].PHPProvider(),
    new modules[10].RubyProvider(),
    new modules[11].SwiftProvider(),
    new modules[12].CProvider()
  ].flatMap(p => p.extensions);

  discoverySurface = {
    extensions: new Set([...declared.filter(e => e.startsWith('.')), ...NON_CODE_EXTENSIONS]),
    filenames: new Set([...declared.filter(e => !e.startsWith('.')), ...NON_CODE_FILENAMES])
  };
  return discoverySurface;
}

/**
 * Conducks — Chronicle Interface (Git-Direct)
 *
 * Direct interaction with the Git Object Model for Chronoscopic Mirroring.
 * Replaces the generic filesystem crawler with a high-fidelity Git-native engine.
 */
export class ChronicleInterface {
  private projectDir: string;

  constructor(
    projectDir: string = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd(),
    private readonly execFile: typeof execFileSync = execFileSync
  ) {
    this.projectDir = path.resolve(projectDir);
  }

  /**
   * The ONLY way this class runs git (ADR 0047, CONDUCKS-35).
   *
   * Arguments are passed as an ARRAY, so no value can reach a shell. Every command here used to be
   * a template string run through `execSync`, which is `/bin/sh -c` — and the interpolated value
   * was a repo-relative path from `git ls-files`, i.e. attacker-controlled in any cloned
   * repository. Git allows a filename containing a quote and `$()`, so analysing a hostile repo
   * executed whatever that filename said.
   *
   * The timeout is here rather than at each call site for the same reason (ADR 0049): nine call
   * sites had none, so a corrupted or network-mounted `.git` hung the caller forever. 30s is
   * generous for a local git operation and the first real timeout report is the measurement that
   * corrects it.
   */
  /**
   * Every repository root at or under `this.projectDir`, nearest first.
   *
   * A NESTED repository is invisible to its parent: `git ls-files` in the outer repo does not list
   * a directory that carries its own `.git`, and `--recurse-submodules` only descends into
   * REGISTERED submodules, not a plain `git init` inside a subdirectory. Measured on a fixture —
   * 3 units discovered where 5 exist, the inner service absent from the vault entirely, its code
   * never read (todo29#P0). So each repository has to be asked separately.
   *
   * The walk is bounded and skips the directories the FS fallback already skips, so on the common
   * case — one repository, no nesting — it costs one shallow readdir per directory and returns a
   * single root.
   */
  private async repositoryRoots(maxDepth: number = 6): Promise<string[]> {
    const fs = await import('node:fs/promises');
    const roots: string[] = [];
    const skip = new Set(['node_modules', 'venv', '__pycache__', 'dist', 'build', 'out', '.next']);

    const walk = async (dir: string, depth: number): Promise<void> => {
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      if (entries.some(e => e.name === '.git')) roots.push(dir);
      if (depth >= maxDepth) return;
      for (const e of entries) {
        if (!e.isDirectory() || skip.has(e.name) || e.name.startsWith('.')) continue;
        await walk(path.join(dir, e.name), depth + 1);
      }
    };
    await walk(this.projectDir, 0);
    return roots;
  }

  private git(args: string[], opts: { quiet?: boolean; cwd?: string } = {}): string {
    return this.execFile('git', args, {
      cwd: opts.cwd ?? this.projectDir,
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
      ...(opts.quiet ? { stdio: ['pipe', 'pipe', 'ignore'] as const } : {}),
    }) as unknown as string;
  }

  public setProjectDir(dir: string): void {
    this.projectDir = dir;
  }

  public getProjectDir(): string {
    return this.projectDir;
  }

  /**
   * Discovers all versioned files, including submodules (Federated Progenitors).
   * Fallback: Scans the filesystem directly if not a Git repository.
   */
  public async discoverFiles(stagedOnly: boolean = false): Promise<string[]> {
    const allFiles = new Set<string>();

    // 1. Attempt Git Discovery
    try {
      let commands: string[][] = [
        ['ls-files', '--cached', '--recurse-submodules'],
        ['ls-files', '--others', '--exclude-standard'],
      ];
      if (stagedOnly) {
        commands = [['diff', '--cached', '--name-only']];
      }

      // Ask EVERY repository under the anchor, not only the anchor's own (todo29#P0, ADR 0069).
      // With no nesting this is the single root and the behaviour is byte-identical to before.
      const roots = await this.repositoryRoots();
      const targets = roots.length > 0 ? roots : [this.projectDir];

      for (const root of targets) {
        for (const cmd of commands) {
          try {
            const output = this.git(cmd, { cwd: root });
            (output as string).split('\n')
              .filter(f => f.trim().length > 0)
              .map(f => path.resolve(root, f))
              .filter(f => !f.includes('/node_modules/') && !f.includes('/.git/'))
              .filter(f => !BINARY_EXTENSIONS.has(path.extname(f).toLowerCase()))
              .forEach(f => allFiles.add(f));
          } catch { /* Silent fail for individual git commands */ }
        }
      }

      // A file can sit in the workspace and inside NO repository — the `conducks.json` that
      // DECLARES a workspace whose services each carry their own `.git` is exactly that file
      // (ADR 0069's third topology). Before nested discovery, git failed outright there and the FS
      // scan below caught everything; now git partially succeeds, and returning here silently drops
      // every root-level file. Measured on the fixture: 5 units became 4, and the missing one was
      // the declaration that defines the workspace.
      //
      // So: return early only when the anchor is ITSELF a repository, which is the single-repo case
      // and the entire installed base. Otherwise fall through and merge the FS scan.
      // Coverage is PARTIAL only when files came from nested repositories while the anchor is not
      // itself one — then, and only then, a root-level file can be inside no repository at all.
      // If no nested repository was found, whatever git returned is the whole answer and the FS
      // scan would add nothing but cost.
      const anchorIsRepo = fsSync.existsSync(path.join(this.projectDir, '.git'));
      const partialCoverage = roots.length > 0 && !anchorIsRepo;
      if (allFiles.size > 0 && !partialCoverage) return Array.from(allFiles);
    } catch { /* Full Git failure falls through to FS scan */ }

    // 2. Fallback: Recursive FS Scan (Conducks Universal Discovery)
    if (allFiles.size === 0) {
      console.error(`[Chronicle Interface] Git discovery failed. Falling back to universal FS scan for: ${this.projectDir}`);
    }
    const fs = await import('node:fs/promises');
    const { extensions, filenames } = await getDiscoverySurface();

    const scan = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '.git' && entry.name !== 'node_modules' && entry.name !== 'venv' && entry.name !== '__pycache__') {
            await scan(fullPath);
          }
        } else {
          // Only ingest relevant code/config extensions to prevent bloat
          const ext = path.extname(entry.name);
          if (extensions.has(ext) || filenames.has(entry.name)) {
            allFiles.add(fullPath);
          }
        }
      }
    };

    await scan(this.projectDir).catch(e => console.error(`[Chronicle Interface] FS scan failed: ${e.message}`));
    return Array.from(allFiles);
  }


  /**
   * Kinetic Stream — Async Generator for constant memory footprint.
   * Yields file batches to the Pulse engine.
   */
  public async *streamBatches(filePaths: string[], batchSize: number = 20, fromIndex: boolean = false): AsyncGenerator<Array<{ path: string, source: string }>> {
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const chunk = filePaths.slice(i, i + batchSize);
      const read = await Promise.all(chunk.map(async (f) => {
        const source = await this.readSingleFile(f, fromIndex);
        return { path: f, source };
      }));
      // An unreadable file is DROPPED rather than passed on as empty source. It used to arrive at
      // the parser as a valid empty file: hashed, recorded in the gate, and given a unit node with
      // no symbols — so a permissions error looked exactly like a blank file, and the hash gate
      // then skipped it on every later run.
      const batch = read.filter((r): r is { path: string; source: string } => r.source !== null);
      const dropped = read.length - batch.length;
      if (dropped > 0) {
        const names = read.filter(r => r.source === null).map(r => r.path);
        logger.warn(`🛡️ [Conducks] Skipped ${dropped} unreadable file(s): ${names.join(', ')}`);
      }
      yield batch;
    }
  }

  /**
   * Legacy batch reader — now uses the stream generator internally.
   */
  public async readBatch(filePaths: string[], fromIndex: boolean = false): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    for await (const batch of this.streamBatches(filePaths, 20, fromIndex)) {
      batch.forEach(item => results[item.path] = item.source);
    }
    return results;
  }

  /**
   * Reads the "Essence" (content) of a single file. (Primitive)
   */
  // NULL when the file could not be read; '' only when the file is genuinely empty. Returning ''
  // for both meant an unreadable file entered the parse path as valid empty source, was hashed,
  // and produced a unit node with no symbols — indistinguishable from a real empty file, and
  // recorded in the gate as successfully analysed.
  private async readSingleFile(filePath: string, fromIndex: boolean): Promise<string | null> {
    if (!fromIndex) {
      const fs = await import('node:fs/promises');
      return fs.readFile(filePath, 'utf-8').catch(() => null);
    }

    if (!this.isInsideProject(filePath)) {
      return null;
    }

    try {
      const fixedPath = path.resolve(filePath);
      const projectRoot = path.resolve(this.gitRootFor(filePath));

      // Conducks: Case-agnostic relative path (Critical for macOS/Windows)
      let relativePath = path.relative(projectRoot, fixedPath);
      if (fixedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
        relativePath = fixedPath.slice(projectRoot.length).replace(/^[\\\/]/, '');
      }

      return this.git(['show', `:0:${relativePath}`], { quiet: true });
    } catch {
      return null;
    }
  }

  /**
   * Reads the "Essence" (content) of a file from the Git index or workspace.
   */
  // Keeps returning '' for an unreadable file, deliberately: this is the single-file reader used
  // by callers that want content or nothing, and they have always treated '' that way. The PULSE
  // path is the one that must not confuse the two, and it uses streamBatches, which now drops them.
  public async readFile(filePath: string, fromIndex: boolean = false): Promise<string> {
    return (await this.readSingleFile(filePath, fromIndex)) ?? '';
  }

  /**
   * Identifies all Federated Progenitors (Submodules).
   */
  public async getProgenitors(): Promise<string[]> {
    try {
      const output = this.git(['submodule', 'status']);
      return (output as string).split('\n')
        .filter(l => l.trim().length > 0)
        .map(l => {
          const parts = l.trim().split(' ');
          return path.join(this.projectDir, parts[1]);
        });
    } catch {
      return [];
    }
  }

  /**
   * Conducks — one file's authorship history, from ONE git invocation.
   *
   * `getCommitResonance` and `getAuthorDistribution` below are both still used on their own, and
   * both are correct. The problem is that the reflector calls them BACK TO BACK on every file, and
   * between them they spawn three subprocesses to read one thing:
   *
   *   git rev-list --count HEAD -- <file>   (resonance: how many commits)
   *   git log --format=%ae -- <file>        (resonance: how many distinct authors)
   *   git log --format=%ae -- <file>        (distribution: how many commits per author)
   *
   * The last two are the SAME COMMAND, run twice. And the first is the line count of that
   * command's output — `rev-list --count HEAD -- <path>` and `log -- <path>` walk HEAD with the
   * same path filter and the same default history simplification, so they agree by construction.
   * Verified across two repositories and 140 files, one of them carrying merge commits: zero
   * disagreements.
   *
   * So all three answers come out of one `git log`. This matters because a CPU profile of the
   * parse path attributes **86% of its time to these git subprocesses** and under 1% to
   * tree-sitter — process spawn dominates, and each spawn costs 18-41 ms depending on the
   * repository. Dropping three spawns per file to one is the single largest saving available in
   * the pulse.
   *
   * NULL when git could not be read, on the same reasoning the two methods below already carry:
   * an unreadable file and a file with no history produce identical entropy and identical risk, so
   * they must not produce identical returns.
   */
  public async getFileHistory(filePath: string): Promise<{ count: number, authors: number, distribution: Record<string, number> } | null> {
    if (!this.isInsideProject(filePath)) return null;

    try {
      // The repository that OWNS this file, not the workspace anchor (ADR 0069).
      const repo = this.gitRootFor(filePath);
      const relativePath = this.toRepoRelative(filePath, repo);
      const output = this.git(['log', '--format=%ae', '--', relativePath], { quiet: true, cwd: repo });
      const lines = output.split('\n').map(a => a.trim()).filter(Boolean);

      const distribution: Record<string, number> = {};
      for (const author of lines) distribution[author] = (distribution[author] || 0) + 1;

      return { count: lines.length, authors: Object.keys(distribution).length, distribution };
    } catch {
      return null;
    }
  }

  /**
   * The repo-relative path, case-agnostically (critical on macOS and Windows). This was written out
   * three times in this file, character for character, once per git-reading method.
   */
  /** Cache: absolute directory -> the repository root that owns it, or null. */
  private gitRootCache = new Map<string, string | null>();

  /**
   * The repository that actually owns a file — the nearest `.git` at or above it (ADR 0069).
   *
   * The workspace root and the git root are different questions, and conflating them is silent
   * rather than loud. Measured on a nested fixture: a file with one commit reported
   * `count=0 authors=0`, because git ran SUCCESSFULLY against the outer repository, which
   * truthfully knows nothing about that path. ADR 0049 drew its line at a subprocess that FAILED;
   * this is one that succeeded and answered about the wrong thing, so nothing surfaced.
   *
   * Cached per directory because it is asked once per file, and a repository has one answer for
   * every file beneath it.
   */
  private gitRootFor(filePath: string): string {
    let dir = path.dirname(path.resolve(filePath));
    const seen: string[] = [];
    while (dir && dir !== path.parse(dir).root) {
      const cached = this.gitRootCache.get(dir);
      if (cached !== undefined) {
        const answer = cached ?? this.projectDir;
        for (const d of seen) this.gitRootCache.set(d, cached);
        return answer;
      }
      seen.push(dir);
      if (fsSync.existsSync(path.join(dir, '.git'))) {
        for (const d of seen) this.gitRootCache.set(d, dir);
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    for (const d of seen) this.gitRootCache.set(d, null);
    return this.projectDir;
  }

  private toRepoRelative(filePath: string, root?: string): string {
    const fixedPath = path.resolve(filePath);
    const projectRoot = path.resolve(root ?? this.projectDir);
    if (fixedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
      return fixedPath.slice(projectRoot.length).replace(/^[\\\/]/, '');
    }
    return path.relative(projectRoot, fixedPath);
  }

  /**
   * Conducks — Commit Resonance
   * Extracts commit frequency and author count for a specific structural unit.
   */
  public async getCommitResonance(filePath: string): Promise<{ count: number, authors: number, unavailable?: boolean }> {
    if (!this.isInsideProject(filePath)) {
      return { count: 0, authors: 0, unavailable: true };
    }

    try {
      const fixedPath = path.resolve(filePath);
      const projectRoot = path.resolve(this.gitRootFor(filePath));

      // Conducks: Case-agnostic relative path (Critical for macOS/Windows)
      let relativePath = path.relative(projectRoot, fixedPath);
      if (fixedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
        relativePath = fixedPath.slice(projectRoot.length).replace(/^[\\\/]/, '');
      }

      // 1. Commit Count (Frequency)
      const countOutput = this.git(['rev-list', '--count', 'HEAD', '--', relativePath], { quiet: true, cwd: this.gitRootFor(filePath) });
      const count = parseInt(countOutput.trim(), 10) || 0;

      // 2. Unique Authors (Density)
      // The unique-author count was `git log ... | sort -u | wc -l`, which needs a shell. Counting
      // distinct lines here removes the pipe, and with it the only reason this call needed one.
      const authorLines = this.git(['log', '--format=%ae', '--', relativePath], { quiet: true, cwd: this.gitRootFor(filePath) });
      const authors = new Set(authorLines.split('\n').map(a => a.trim()).filter(Boolean)).size;

      return { count, authors };
    } catch {
      // `unavailable` separates a git failure from a symbol that genuinely has no commits. Both
      // used to return a bare {0,0}, so entropy scored an unreadable file identically to a
      // brand-new one — a real risk signal and its absence, reported the same way.
      return { count: 0, authors: 0, unavailable: true };
    }
  }
  /**
   * Conducks — Authorship Distribution
   * Calculates the commit count per unique author for Shannon Entropy analysis.
   */
  // NULL when git could not be read; an EMPTY MAP when it was read and the file has no authors.
  // Both used to be `{}`, and the two produce identical entropy (0) and identical risk (0) — so an
  // unreadable file scored as a perfectly-owned one, which is the safest-looking answer available.
  public async getAuthorDistribution(filePath: string): Promise<Record<string, number> | null> {
    if (!this.isInsideProject(filePath)) {
      return null;
    }

    try {
      const fixedPath = path.resolve(filePath);
      const projectRoot = path.resolve(this.gitRootFor(filePath));

      // Conducks: Case-agnostic relative path (Critical for macOS/Windows)
      let relativePath = path.relative(projectRoot, fixedPath);
      if (fixedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
        relativePath = fixedPath.slice(projectRoot.length).replace(/^[\\\/]/, '');
      }

      const output = this.git(['log', '--format=%ae', '--', relativePath], { quiet: true, cwd: this.gitRootFor(filePath) });
      const authors = output.split('\n').filter(a => a.trim().length > 0);

      const distribution: Record<string, number> = {};
      for (const author of authors) {
        distribution[author] = (distribution[author] || 0) + 1;
      }
      return distribution;
    } catch (err) {
      return null;
    }
  }

  /**
   * Conducks — Line-Level Blame Mapping
   * Extracts porcelain metadata to attribute history to specific symbols.
   */
  public async getBlameData(filePath: string): Promise<Record<number, { author: string, timestamp: number }>> {
    const blameMap: Record<number, { author: string, timestamp: number }> = {};
    if (!this.isInsideProject(filePath)) {
      return blameMap;
    }

    try {
      const fixedPath = path.resolve(filePath);
      const projectRoot = path.resolve(this.gitRootFor(filePath));

      // Conducks: Case-agnostic relative path (Critical for macOS/Windows)
      let relativePath = path.relative(projectRoot, fixedPath);
      if (fixedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
        relativePath = fixedPath.slice(projectRoot.length).replace(/^[\\\/]/, '');
      }
      const output = this.git(['blame', '--porcelain', '--', relativePath], { quiet: true, cwd: this.gitRootFor(filePath) });
      const lines = output.split('\n');

      let currentAuthor = '';
      let currentTime = 0;
      const hashCommitMeta: Record<string, { author: string, timestamp: number }> = {};

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^[a-f0-9]{40}/)) {
          const parts = line.split(' ');
          const hash = parts[0];
          const finalLine = parseInt(parts[2], 10);

          if (!hashCommitMeta[hash]) {
            // Need to find meta for this hash in subsequent porcelain lines
            let j = i + 1;
            let foundAuthor = '';
            let foundTime = 0;
            while (j < lines.length && !lines[j].match(/^[a-f0-9]{40}/)) {
              if (lines[j].startsWith('author-mail ')) foundAuthor = lines[j].replace('author-mail <', '').replace('>', '').trim();
              if (lines[j].startsWith('author-time ')) foundTime = parseInt(lines[j].replace('author-time ', ''), 10);
              j++;
            }
            hashCommitMeta[hash] = { author: foundAuthor, timestamp: foundTime };
          }

          blameMap[finalLine] = hashCommitMeta[hash];
        }
      }

      return blameMap;
    } catch {
      return {};
    }
  }

  /**
   * Conducks — Sync Staleness Sensor
   * Fetches the current HEAD hash of the repository.
   */
  public getHeadHash(): string | null {
    try {
      const output = this.git(['rev-parse', 'HEAD'], { quiet: true });
      return output.trim();
    } catch {
      return null;
    }
  }

  /**
   * Conducks — Sync Staleness Sensor
   * Returns the number of commits between a base hash and current HEAD.
   */
  public getCommitsBehind(baseHash: string): number | null {
    try {
      const output = this.git(['rev-list', `${baseHash}..HEAD`, '--count'], { quiet: true });
      const parsed = parseInt(output.trim(), 10);
      // NaN means git answered with something this cannot read, which is not "zero commits".
      return Number.isNaN(parsed) ? null : parsed;
    } catch {
      // NULL, not 0. Returning 0 made "git is unreadable" indistinguishable from "you are current",
      // and 0 is the value that silences the staleness banner — so the one case where a user most
      // needs telling produced the reassuring output. Callers decide what to say about null.
      return null;
    }
  }

  private isInsideProject(filePath: string): boolean {
    if (!path.isAbsolute(filePath)) {
      return true;
    }

    const resolved = path.resolve(filePath).toLowerCase();
    const projectDir = this.projectDir.toLowerCase();
    return resolved === projectDir || resolved.startsWith(projectDir + path.sep);
  }

  /**
   * Conducks — Sync Staleness Sensor
   * Retrieves the last pulsed commit from the graph's metadata.
   */
  public getLastPulsedCommit(graph: any): string | null {
    return graph.getMetadata('lastAnalyzedCommit');
  }

  /**
   * Conducks — Sync Staleness Sensor
   * Stores the current commit hash in the graph's metadata.
   */
  public setLastPulsedCommit(graph: any, hash: string): void {
    graph.setMetadata('lastAnalyzedCommit', hash);
  }
}

export const chronicle = new ChronicleInterface();
