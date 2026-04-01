import fs from "fs-extra";
import path from "node:path";
import { minimatch } from "minimatch";

/**
 * Conducks — Ignore Manager (v1.6.5 Hardening) 🛡️
 * 
 * Manages structural exclusions via .conducksignore and default patterns. 
 * Prevents memory blowouts by skipping giant/irrelevant folders.
 */
export class IgnoreManager {
  private patterns: string[] = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/venv/**",
    "**/.venv/**",
    "**/target/**", // Rust
    "**/bin/**",
    "**/obj/**",
    "**/*.d.ts",
    "**/*.map",
    "**/*.db",
    "**/*.sqlite",
    "**/*.log"
  ];

  constructor(private rootDir: string) {
    this.loadCustomIgnores();
  }

  /**
   * Loads user-defined ignore patterns from .conducksignore
   */
  private loadCustomIgnores(): void {
    const ignorePath = path.join(this.rootDir, ".conducksignore");
    if (fs.existsSync(ignorePath)) {
      const content = fs.readFileSync(ignorePath, "utf-8");
      const customPatterns = content
        .split("\n")
        .map(p => p.trim())
        .filter(p => p && !p.startsWith("#"));
      
      this.patterns.push(...customPatterns);
    }
  }

  /**
   * Checks if a given file path should be ignored.
   */
  public isIgnored(filePath: string): boolean {
    const relativePath = path.relative(this.rootDir, filePath);
    
    // Conducks: Strict Normalization for matches
    const normalized = relativePath.replace(/\\/g, "/");

    return this.patterns.some(pattern => {
      return minimatch(normalized, pattern, { dot: true, matchBase: true });
    });
  }

  /**
   * Returns the full list of active patterns.
   */
  public getPatterns(): string[] {
    return [...this.patterns];
  }
}
