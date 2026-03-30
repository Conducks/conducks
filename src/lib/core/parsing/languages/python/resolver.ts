import path from "node:path";

/**
 * Conducks — Python Import Resolver (PEP 328 & 451) 🐍
 * 
 * Resolves Python import paths to absolute file paths.
 */

export class PythonResolver {
  /**
   * Resolves a Python import relative to the current file.
   */
  public resolve(rawImportPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 1. Absolute Resolution (Bare Imports)
    // import x.y -> x/y.py or x/y/__init__.py
    const absolutePath = this.resolveAbsolute(rawImportPath, currentFile, allFiles);
    if (absolutePath) return absolutePath;

    // 2. PEP 328 Relative Resolution (Dots)
    // from .module import X or from ..package import Y
    if (rawImportPath.startsWith('.')) {
      return this.resolveRelative(rawImportPath, currentFile, allFiles);
    }

    return undefined;
  }

  /**
   * Resolves a bare import by walking up the sys.path (project root).
   */
  private resolveAbsolute(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    const segments = rawPath.replace(/\./g, '/').split('/');
    const pathLike = segments.join('/');

    // Proximity check: Try current directory first
    const dir = path.dirname(currentFile);
    const progeny = this.tryExtensions(path.join(dir, pathLike), allFiles);
    if (progeny) return progeny;

    // Walk up to simulate sys.path root finder
    let currentDir = dir;
    while (currentDir !== '/' && currentDir !== '.') {
      const target = path.join(currentDir, pathLike);
      const res = this.tryExtensions(target, allFiles);
      if (res) return res;
      currentDir = path.dirname(currentDir);
    }

    return undefined;
  }

  /**
   * PEP 328: Relative Import resolution.
   */
  private resolveRelative(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    const dotMatch = rawPath.match(/^(\.+)(.*)/);
    if (!dotMatch) return undefined;

    const dotCount = dotMatch[1].length;
    const modulePart = dotMatch[2];

    let currentDir = path.dirname(currentFile);
    // 1 dot = current dir, 2 dots = parent, etc.
    for (let i = 1; i < dotCount; i++) {
      currentDir = path.dirname(currentDir);
    }

    const target = path.join(currentDir, modulePart.replace(/\./g, '/'));
    return this.tryExtensions(target, allFiles);
  }

  /**
   * Checks for .py or __init__.py files.
   */
  private tryExtensions(target: string, allFiles: string[]): string | undefined {
    // PEP 451: package (__init__.py) before module (.py)
    const init = path.join(target, "__init__.py");
    if (allFiles.includes(init)) return init;

    const py = target + ".py";
    if (allFiles.includes(py)) return py;

    return undefined;
  }
}
