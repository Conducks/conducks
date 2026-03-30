import { execSync } from 'node:child_process';
import path from 'node:path';

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
            .forEach(f => allFiles.add(f));
        } catch { /* Silent fail for individual git commands */ }
      }

      if (allFiles.size > 0) return Array.from(allFiles);
    } catch { /* Full Git failure falls through to FS scan */ }

    // 2. Fallback: Recursive FS Scan (Conducks Universal Discovery)
    console.error(`[Chronicle Interface] Git discovery failed. Falling back to universal FS scan for: ${this.projectDir}`);
    const fs = await import('node:fs/promises');

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
          if (['.py', '.js', '.ts', '.java', '.kt', '.go', '.rb', '.json', '.txt', '.md', '.env', 'Dockerfile'].includes(ext) || entry.name === 'Dockerfile') {
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
      const relativePath = path.relative(this.projectDir, filePath);
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
      const relativePath = path.relative(this.projectDir, filePath);

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
      const relativePath = path.relative(this.projectDir, filePath);
      const command = `git log --format="%ae" -- "${relativePath}"`;
      const output = this.exec(command, { cwd: this.projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) as string;
      const authors = output.split('\n').filter(a => a.trim().length > 0);

      const distribution: Record<string, number> = {};
      for (const author of authors) {
        distribution[author] = (distribution[author] || 0) + 1;
      }
      return distribution;
    } catch {
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
      const relativePath = path.relative(this.projectDir, filePath);
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

    const resolved = path.resolve(filePath);
    return resolved === this.projectDir || resolved.startsWith(this.projectDir + path.sep);
  }

  /**
   * Conducks — Sync Staleness Sensor
   * Retrieves the last pulsed commit from the graph's metadata.
   */
  public getLastPulsedCommit(graph: any): string | null {
    return graph.getMetadata('lastPulsedCommit');
  }

  /**
   * Conducks — Sync Staleness Sensor
   * Stores the current commit hash in the graph's metadata.
   */
  public setLastPulsedCommit(graph: any, hash: string): void {
    graph.setMetadata('lastPulsedCommit', hash);
  }
}

export const chronicle = new ChronicleInterface();
