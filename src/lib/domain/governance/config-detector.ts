import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Conducks — High-Fidelity Infrastructure Discovery
 * 
 * Automatically detects Config Files (package.json, go.mod, etc.) 
 * and identifies project Entry Points (main.py, index.ts).
 */
export class ConfigDetector {
  private anchorFiles = [
    'package.json',
    'tsconfig.json',
    'go.mod',
    'requirements.txt',
    'Gemfile',
    'pom.xml',
    'Cargo.toml'
  ];

  private entryPointMarkers = [
    'index.ts',
    'index.js',
    'main.py',
    'main.go',
    'app.py',
    'server.ts'
  ];

  /**
   * Scans a directory for project configuration nodes.
   */
  public async discover(dirPath: string): Promise<{ configs: string[], entries: string[] }> {
    const results = {
      configs: [] as string[],
      entries: [] as string[]
    };

    try {
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        if (this.anchorFiles.includes(file)) {
          results.configs.push(path.join(dirPath, file));
        }
        if (this.entryPointMarkers.includes(file)) {
          results.entries.push(path.join(dirPath, file));
        }
      }
    } catch (err) {
      console.warn(`[ConfigDetector] Failed to scan dir: ${dirPath}`);
    }

    return results;
  }
}
