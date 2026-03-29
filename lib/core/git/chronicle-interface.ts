import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Conducks — Chronicle Interface (Git-Direct)
 * 
 * Direct interaction with the Git Object Model for Chronoscopic Mirroring.
 * Replaces the generic filesystem crawler with a high-fidelity Git-native engine.
 */
export class ChronicleInterface {
  constructor(
    private readonly projectDir: string = process.cwd(),
    private readonly exec: typeof execSync = execSync
  ) {}

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

    // 2. Fallback: Recursive FS Scan (Apostle v6 Universal Discovery)
    console.log(`[Chronicle Interface] Git discovery failed. Falling back to universal FS scan for: ${this.projectDir}`);
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
  public async *streamBatches(filePaths: string[], batchSize: number = 20, fromIndex: boolean = false): AsyncGenerator<Array<{path: string, source: string}>> {
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
    
    try {
      const relativePath = path.relative(this.projectDir, filePath);
      const command = `git show :0:${relativePath}`;
      const output = this.exec(command, { cwd: this.projectDir, encoding: 'utf-8' });
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
   * Apostle v2 — Commit Resonance
   * Extracts commit frequency and author count for a specific structural unit.
   */
  public async getCommitResonance(filePath: string): Promise<{ count: number, authors: number }> {
    try {
      const relativePath = path.relative(this.projectDir, filePath);
      
      // 1. Commit Count (Frequency)
      const countCmd = `git rev-list --count HEAD -- "${relativePath}"`;
      const countOutput = this.exec(countCmd, { cwd: this.projectDir, encoding: 'utf-8' }) as string;
      const count = parseInt(countOutput.trim(), 10) || 0;

      // 2. Unique Authors (Density)
      const authorsCmd = `git log --format="%ae" -- "${relativePath}" | sort -u | wc -l`;
      const authorsOutput = this.exec(authorsCmd, { cwd: this.projectDir, encoding: 'utf-8' }) as string;
      const authors = parseInt(authorsOutput.trim(), 10) || 0;

      return { count, authors };
    } catch {
      return { count: 0, authors: 0 };
    }
  }
  /**
   * Apostle v3 — Authorship Distribution
   * Calculates the commit count per unique author for Shannon Entropy analysis.
   */
  public async getAuthorDistribution(filePath: string): Promise<Record<string, number>> {
    try {
      const relativePath = path.relative(this.projectDir, filePath);
      const command = `git log --format="%ae" -- "${relativePath}"`;
      const output = this.exec(command, { cwd: this.projectDir, encoding: 'utf-8' }) as string;
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
}

export const chronicle = new ChronicleInterface();
