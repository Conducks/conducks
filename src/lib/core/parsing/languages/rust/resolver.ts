import fs from "node:fs";
import path from "node:path";

/**
 * Conducks — Rust Module Resolver 🏺 🟦
 *
 * Maps a `use` path, a scoped call path or a `mod x;` declaration to the FILE that declares it.
 *
 * A Rust path has an anchor and a module tail: `crate::a::b` starts at the crate's `src/`,
 * `self::a` at the current module, `super::a` one module up, `core_lib::a` at the `src/` of the
 * workspace crate NAMED `core-lib` (Cargo spells the name with `-` and the code with `_`), and a
 * bare `a` is a child module of the current one. The tail is walked longest-prefix first, because
 * `use crate::util::helper` names a FUNCTION in `util.rs` and the resolver's answer is the file.
 *
 * MEASURED before this on a 27-crate workspace (945 files): zero call edges between `crates/cli`
 * and `crates/docs`, which it uses on every command, and `impact run_offline` found 0 callers for a
 * function called from `ports/boot.rs` via `cli::run_offline`. Only `crate::` and `mod x;` were
 * understood, so every crate name became a phantom `external://` node.
 */
export class RustResolver {
  /** Every `<crate src dir>` declaring each crate name as written in code, per file list. */
  private cratesFor: { key: string; list: string[]; byName: Map<string, string[]> } | null = null;
  /** Cargo.toml package name per crate dir; null when there is no manifest or no name. */
  private manifestName = new Map<string, string | null>();
  /** The nearest enclosing `[workspace]` root per directory; null when there is none. */
  private workspaceRoot = new Map<string, string | null>();

  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    const segs = rawPath.replace(/^::/, '').split('::').filter(Boolean);
    if (segs.length === 0) return undefined;
    const files = RustResolver.index(allFiles);
    const srcRoot = RustResolver.srcRootOf(currentFile, RustResolver.index([...allFiles, currentFile]));
    let base: string | undefined;   // the module DIRECTORY the tail is relative to
    let i = 0;
    if (segs[0] === 'crate') { base = srcRoot; i = 1; }
    else if (segs[0] === 'self') { base = RustResolver.moduleDirOf(currentFile); i = 1; }
    else if (segs[0] === 'super') {
      base = RustResolver.moduleDirOf(currentFile);
      while (segs[i] === 'super') { base = path.dirname(base); i++; }
    } else {
      const crateSrc = this.crateSrcByName(segs[0], currentFile, allFiles, files);
      if (crateSrc) { base = crateSrc; i = 1; }
      else base = RustResolver.moduleDirOf(currentFile);   // `mod helper;`, `helper::alpha()`
    }
    if (!base) return undefined;
    const tail = segs.slice(i);
    // Longest prefix of the tail that is a module file; the rest names an item inside it.
    for (let k = tail.length; k >= 1; k--) {
      const mod = path.join(base, ...tail.slice(0, k));
      const hit = files.lookup(`${mod}.rs`) ?? files.lookup(path.join(mod, 'mod.rs'));
      if (hit) return hit;
    }
    // The tail named nothing below the anchor: the anchor's own file (`use crate::X`, `super::*`).
    if (i > 0) return RustResolver.moduleFileOf(base, files);
    return undefined;
  }

  /** The `src/` directory of the crate that owns `file`: the nearest ancestor holding lib.rs or main.rs. */
  private static srcRootOf(file: string, files: FileIndex): string | undefined {
    for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
      if (files.lookup(path.join(dir, 'lib.rs')) || files.lookup(path.join(dir, 'main.rs'))) return dir;
      if (dir === path.dirname(dir)) return undefined;
    }
  }

  /** The directory whose children are this file's child modules. */
  private static moduleDirOf(file: string): string {
    const name = path.basename(file);
    if (name === 'mod.rs' || name === 'lib.rs' || name === 'main.rs') return path.dirname(file);
    return path.join(path.dirname(file), name.replace(/\.rs$/, ''));
  }

  /** The file that declares the module living at `dir`: a crate root (lib.rs/main.rs), `<dir>.rs` or `<dir>/mod.rs`. */
  private static moduleFileOf(dir: string, files: FileIndex): string | undefined {
    return files.lookup(path.join(dir, 'lib.rs')) ?? files.lookup(path.join(dir, 'main.rs'))
      ?? files.lookup(`${dir}.rs`) ?? files.lookup(path.join(dir, 'mod.rs'));
  }

  /**
   * The `src/` of the crate used as `name` in code, from each crate's Cargo.toml.
   *
   * A name means the crate of that name IN THE IMPORTER'S WORKSPACE, which is how Cargo resolves it.
   * A tree can hold the same name many times over: a gate's test fixtures are whole workspaces of
   * their own, and on the 27-crate workspace `cli` is declared 8 times and `docs` about 60. Keyed by
   * name alone, the last one indexed won, and `cli::run_offline` from the real `cli` crate resolved
   * into a fixture. A name declared once is taken as is (a path dependency outside any workspace);
   * a name the workspace still cannot tell apart is refused rather than guessed.
   */
  private crateSrcByName(name: string, currentFile: string, allFiles: string[], files: FileIndex): string | undefined {
    // The WHOLE list keys the index. `length:first:last` let two lists of one length and the same ends
    // share an index, so a crate swapped in the middle was answered from the old list (state-machine
    // audit P-04-1). Same array as last time is the fast path; otherwise one pass over the paths,
    // the same order of work as the `index()` every resolve already does.
    if (this.cratesFor?.list !== allFiles) {
      const key = allFiles.join('\n');
      if (this.cratesFor && this.cratesFor.key === key) this.cratesFor.list = allFiles;
      else this.cratesFor = null;
    }
    if (!this.cratesFor) {
      const key = allFiles.join('\n');
      const byName = new Map<string, string[]>();
      for (const f of files.all) {
        if (!/\/src\/(lib|main)\.rs$/i.test(f)) continue;
        const src = path.dirname(f);
        const manifest = this.packageName(path.dirname(src));
        if (!manifest) continue;
        const crate = manifest.replace(/-/g, '_').toLowerCase();
        const list = byName.get(crate) ?? [];
        if (!list.includes(src)) list.push(src);   // lib.rs and main.rs share one src/
        byName.set(crate, list);
      }
      this.cratesFor = { key, list: allFiles, byName };
    }
    const candidates = this.cratesFor.byName.get(name.toLowerCase());
    if (!candidates?.length) return undefined;
    if (candidates.length === 1) return candidates[0];
    const home = this.workspaceOf(path.dirname(currentFile));
    const same = candidates.filter(src => this.workspaceOf(path.dirname(src)) === home);
    return same.length === 1 ? same[0] : undefined;
  }

  /** The nearest directory at or above `dir` whose Cargo.toml declares `[workspace]`. */
  private workspaceOf(dir: string): string | null {
    const cached = this.workspaceRoot.get(dir);
    if (cached !== undefined) return cached;
    let root: string | null = null;
    try {
      if (/^\s*\[workspace\]/m.test(fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf-8'))) root = dir;
    } catch { /* no manifest here */ }
    if (root === null && path.dirname(dir) !== dir) root = this.workspaceOf(path.dirname(dir));
    this.workspaceRoot.set(dir, root);
    return root;
  }

  private packageName(crateDir: string): string | null {
    const cached = this.manifestName.get(crateDir);
    if (cached !== undefined) return cached;
    let name: string | null = null;
    try {
      const toml = fs.readFileSync(path.join(crateDir, 'Cargo.toml'), 'utf-8');
      const pkg = toml.split(/^\s*\[/m).find(s => s.startsWith('package]'));
      name = pkg?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? null;
    } catch { /* no manifest: not a crate root */ }
    this.manifestName.set(crateDir, name);
    return name;
  }

  private static index(allFiles: string[]): FileIndex {
    const byLower = new Map<string, string>();
    for (const f of allFiles) byLower.set(f.toLowerCase(), f);
    return { all: allFiles, lookup: (p) => byLower.get(p.toLowerCase()) };
  }
}

/** The file list, matched case-insensitively: ids in the vault are lower-cased, paths on disk are not. */
interface FileIndex { all: string[]; lookup(p: string): string | undefined }
