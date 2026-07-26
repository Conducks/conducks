import { execSync } from 'node:child_process';
import path from 'node:path';

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
    private readonly exec: typeof execSync = execSync
  ) {
    this.projectDir = path.resolve(projectDir);
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
      let commands = ['git ls-files --cached --recurse-submodules', 'git ls-files --others --exclude-standard'];
      if (stagedOnly) {
        commands = ['git diff --cached --name-only'];
      }

      for (const cmd of commands) {
        try {
          const output = this.exec(cmd, { cwd: this.projectDir, encoding: 'utf-8' });
          (output as string).split('\n')
            .filter(f => f.trim().length > 0)
            .map(f => path.resolve(this.projectDir, f))
            .filter(f => !f.includes('/node_modules/') && !f.includes('/.git/'))
            .filter(f => !BINARY_EXTENSIONS.has(path.extname(f).toLowerCase()))
            .forEach(f => allFiles.add(f));
        } catch { /* Silent fail for individual git commands */ }
      }

      if (allFiles.size > 0) return Array.from(allFiles);
    } catch { /* Full Git failure falls through to FS scan */ }

    // 2. Fallback: Recursive FS Scan (Conducks Universal Discovery)
    console.error(`[Chronicle Interface] Git discovery failed. Falling back to universal FS scan for: ${this.projectDir}`);
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
      const batch = await Promise.all(chunk.map(async (f) => {
        const source = await this.readSingleFile(f, fromIndex);
        return { path: f, source };
      }));
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
  private async readSingleFile(filePath: string, fromIndex: boolean): Promise<string> {
    if (!fromIndex) {
      const fs = await import('node:fs/promises');
      return fs.readFile(filePath, 'utf-8').catch(() => '');
    }

    if (!this.isInsideProject(filePath)) {
      return '';
    }

    try {
      const fixedPath = path.resolve(filePath);
      const projectRoot = path.resolve(this.projectDir);

      // Conducks: Case-agnostic relative path (Critical for macOS/Windows)
      let relativePath = path.relative(projectRoot, fixedPath);
      if (fixedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
        relativePath = fixedPath.slice(projectRoot.length).replace(/^[\\\/]/, '');
      }

      const command = `git show :0:${relativePath}`;
      const output = this.exec(command, { cwd: this.projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      return output as string;
    } catch {
      return '';
    }
  }

  /**
   * Reads the "Essence" (content) of a file from the Git index or workspace.
   */
  public async readFile(filePath: string, fromIndex: boolean = false): Promise<string> {
    return this.readSingleFile(filePath, fromIndex);
  }

  /**
   * Identifies all Federated Progenitors (Submodules).
   */
  public async getProgenitors(): Promise<string[]> {
    try {
      const command = 'git submodule status';
      const output = this.exec(command, { cwd: this.projectDir, encoding: 'utf-8' });
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
   * Conducks — Commit Resonance
   * Extracts commit frequency and author count for a specific structural unit.
   */
  public async getCommitResonance(filePath: string): Promise<{ count: number, authors: number }> {
    if (!this.isInsideProject(filePath)) {
      return { count: 0, authors: 0 };
    }

    try {
      const fixedPath = path.resolve(filePath);
      const projectRoot = path.resolve(this.projectDir);

      // Conducks: Case-agnostic relative path (Critical for macOS/Windows)
      let relativePath = path.relative(projectRoot, fixedPath);
      if (fixedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
        relativePath = fixedPath.slice(projectRoot.length).replace(/^[\\\/]/, '');
      }

      // 1. Commit Count (Frequency)
      const countCmd = `git rev-list --count HEAD -- "${relativePath}"`;
      const countOutput = this.exec(countCmd, { cwd: this.projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) as string;
      const count = parseInt(countOutput.trim(), 10) || 0;

      // 2. Unique Authors (Density)
      const authorsCmd = `git log --format="%ae" -- "${relativePath}" | sort -u | wc -l`;
      const authorsOutput = this.exec(authorsCmd, { cwd: this.projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) as string;
      const authors = parseInt(authorsOutput.trim(), 10) || 0;

      return { count, authors };
    } catch {
      return { count: 0, authors: 0 };
    }
  }
  /**
   * Conducks — Authorship Distribution
   * Calculates the commit count per unique author for Shannon Entropy analysis.
   */
  public async getAuthorDistribution(filePath: string): Promise<Record<string, number>> {
    if (!this.isInsideProject(filePath)) {
      return {};
    }

    try {
      const fixedPath = path.resolve(filePath);
      const projectRoot = path.resolve(this.projectDir);

      // Conducks: Case-agnostic relative path (Critical for macOS/Windows)
      let relativePath = path.relative(projectRoot, fixedPath);
      if (fixedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
        relativePath = fixedPath.slice(projectRoot.length).replace(/^[\\\/]/, '');
      }

      const command = `git log --format="%ae" -- "${relativePath}"`;
      const output = this.exec(command, { cwd: this.projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) as string;
      const authors = output.split('\n').filter(a => a.trim().length > 0);

      const distribution: Record<string, number> = {};
      for (const author of authors) {
        distribution[author] = (distribution[author] || 0) + 1;
      }
      return distribution;
    } catch (err) {
      return {};
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
      const projectRoot = path.resolve(this.projectDir);

      // Conducks: Case-agnostic relative path (Critical for macOS/Windows)
      let relativePath = path.relative(projectRoot, fixedPath);
      if (fixedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
        relativePath = fixedPath.slice(projectRoot.length).replace(/^[\\\/]/, '');
      }
      const command = `git blame --porcelain -- "${relativePath}"`;
      const output = this.exec(command, { cwd: this.projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) as string;
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
      const output = this.exec('git rev-parse HEAD', { cwd: this.projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) as string;
      return output.trim();
    } catch {
      return null;
    }
  }

  /**
   * Conducks — Sync Staleness Sensor
   * Returns the number of commits between a base hash and current HEAD.
   */
  public getCommitsBehind(baseHash: string): number {
    try {
      const command = `git rev-list ${baseHash}..HEAD --count`;
      const output = this.exec(command, { cwd: this.projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) as string;
      return parseInt(output.trim(), 10) || 0;
    } catch {
      return 0;
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
