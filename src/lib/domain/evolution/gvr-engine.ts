import fs from 'node:fs/promises';
import { ConducksAdjacencyList, NodeId } from '@/lib/core/graph/adjacency-list.js';

export interface RefactorResult {
  success: boolean;
  affectedFiles: string[];
  message: string;
  dryRun?: boolean;
  /** Reference sites that exist but carry no line, so they cannot be edited safely. */
  unlocated?: string[];
}

/**
 * Conducks — Graph-Verified Refactoring (GVR) Engine
 *
 * A rename is the only thing this project does that WRITES to a user's source. A wrong answer
 * anywhere else misleads a reader; a wrong answer here edits code they did not ask about, and the
 * only record of it is their VCS diff.
 *
 * The name promised graph verification and the write step used none (ADR 0106). It collected files
 * two ways — upstream edges, plus **every node in the project sharing the symbol's name** — and then
 * ran `content.replace(/\bname\b/g, newName)` across each whole file. Measured on a fixture:
 *
 *   - `phone.ts::validate`, an unrelated function that merely shared a name, was renamed
 *   - `console.log('validate failed')` became `'checkEmail failed'`
 *   - a comment reading "the word validate must survive" was rewritten
 *   - renaming `target` onto an existing `existing` produced two functions with one name, and the
 *     command printed "✅ Successfully renamed"
 *
 * Every one of those is the same missing thing: the writer knew WHICH FILES and nothing about
 * WHERE. Position data exists — nodes carry `lineStart`, and every reference edge carries a line
 * (ADR 0099) — so a rename now edits the lines the graph actually points at, and refuses when it
 * cannot locate a reference or when the new name is already taken.
 */
export class GVREngine {
  constructor(private readonly fileSystem: any = fs) {}

  /**
   * Executes a safe rename of a symbol across the entire project.
   * @param dryRun - If true, only reports affected sites without writing to disk.
   */
  public async renameSymbol(
    graph: ConducksAdjacencyList,
    symbolId: NodeId,
    newName: string,
    dryRun: boolean = false
  ): Promise<RefactorResult> {
    const node = graph.getNode(symbolId);
    if (!node) {
      return { success: false, affectedFiles: [], message: `Symbol ${symbolId} not found.` };
    }

    const oldName = String(node.properties.name ?? '');
    if (!oldName) {
      return { success: false, affectedFiles: [], message: `Symbol ${symbolId} has no name to rename.` };
    }
    if (oldName === newName) {
      return { success: false, affectedFiles: [], message: `'${oldName}' is already its own name.` };
    }

    // 1. REFERENCE SITES, from edges only — file -> the lines that actually name this symbol.
    //
    // A same-name match is NOT a reference. That test is what renamed an unrelated `validate` in
    // another file, and it is gone: a site enters this map only by way of an edge the linker
    // resolved, or by being the declaration itself.
    const sites = new Map<string, Set<number>>();
    const addSite = (file: unknown, line: unknown): boolean => {
      const f = String(file ?? '');
      const l = Number(line ?? 0);
      if (!f || !Number.isFinite(l) || l < 1) return false;
      if (!sites.has(f)) sites.set(f, new Set());
      sites.get(f)!.add(l);
      return true;
    };

    const declLine = (node.properties as any)?.range?.start?.line ?? (node.properties as any)?.lineStart;
    addSite(node.properties.filePath, declLine);

    // A reference the graph knows about but cannot place. Reported, never silently skipped — an
    // unedited call site is a broken build, and the user needs to know which one.
    const unlocated: string[] = [];
    for (const edge of graph.getNeighbors(symbolId, 'upstream')) {
      const source = graph.getNode(edge.sourceId);
      if (!source?.properties?.filePath) continue;
      const line = (edge as any).properties?.line;
      if (!addSite(source.properties.filePath, line)) {
        unlocated.push(`${source.properties.filePath} (${edge.type} from ${source.properties.name ?? edge.sourceId})`);
      }
    }

    const affectedFiles = Array.from(sites.keys());

    // 2. COLLISION — refuse rather than merge two symbols into one name.
    //
    // Renaming `target` onto an existing `existing` produced a file declaring `existing` twice and
    // reported success. That is not recoverable from the tool's own output.
    const collisions = Array.from(graph.getAllNodes())
      .filter(n => n.id !== symbolId
        && String(n.properties?.name ?? '') === newName
        && sites.has(String(n.properties?.filePath ?? '')))
      .map(n => `${n.properties.filePath}::${newName}`);
    if (collisions.length > 0) {
      return {
        success: false,
        affectedFiles,
        message: `'${newName}' already exists in ${collisions.length} affected file(s) — renaming would declare one name twice. Pick another name.\n  ${collisions.join('\n  ')}`,
      };
    }

    if (unlocated.length > 0) {
      return {
        success: false,
        affectedFiles,
        unlocated,
        message: `Refusing: ${unlocated.length} reference(s) to '${oldName}' carry no source line, so they cannot be rewritten and would be left behind.\n  ${unlocated.join('\n  ')}`,
      };
    }

    const siteCount = Array.from(sites.values()).reduce((n, s) => n + s.size, 0);
    this.log(`[GVR] ${siteCount} site(s) across ${affectedFiles.length} file(s).`);

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        affectedFiles,
        message: `[DRY RUN] Would rename '${oldName}' → '${newName}' at ${siteCount} site(s) in ${affectedFiles.length} file(s). No changes made.`
      };
    }

    // 3. Atomic batch write with rollback. Every file is read and backed up before any is written,
    // so a failure part-way through can restore all of them.
    const backups = new Map<string, string>();
    try {
      for (const filePath of affectedFiles) {
        backups.set(filePath, await this.fileSystem.readFile(filePath, 'utf-8'));
      }

      for (const [filePath, content] of backups) {
        const lines = content.split('\n');
        for (const lineNo of sites.get(filePath)!) {
          const idx = lineNo - 1;
          if (idx < 0 || idx >= lines.length) continue;
          lines[idx] = GVREngine.replaceInCode(lines[idx], oldName, newName);
        }
        await this.fileSystem.writeFile(filePath, lines.join('\n'), 'utf-8');
      }

      return {
        success: true,
        affectedFiles,
        message: `Successfully renamed '${oldName}' → '${newName}' at ${siteCount} site(s).`
      };

    } catch (err) {
      this.log(`[GVR] Refactor failed. Rolling back...`, err);
      for (const [filePath, originalContent] of backups) {
        try {
          await this.fileSystem.writeFile(filePath, originalContent, 'utf-8');
        } catch (rollbackErr) {
          console.error(`[GVREngine] ROLLBACK FAILED for ${filePath}:`, rollbackErr);
        }
      }
      throw err;
    }
  }

  /**
   * Replace whole-word `oldName` in one line, skipping string literals and comments.
   *
   * Restricting edits to the lines the graph points at is most of the fix, but not all of it: a real
   * call and a mention in a string can share a line, and a declaration usually sits directly under a
   * doc comment naming it.
   *
   * Deliberately a small scanner rather than a regex — quoting rules cannot be expressed as one, and
   * a regex that half-handled them would fail silently on the cases it missed, which is the failure
   * mode this whole engine is being fixed for.
   */
  public static replaceInCode(line: string, oldName: string, newName: string): string {
    let out = '';
    let i = 0;
    let quote: string | null = null;

    while (i < line.length) {
      const ch = line[i];

      if (quote) {
        out += ch;
        if (ch === '\\') { out += line[i + 1] ?? ''; i += 2; continue; }
        if (ch === quote) quote = null;
        i++;
        continue;
      }

      // A line comment ends the code portion of the line.
      if (ch === '/' && line[i + 1] === '/') { out += line.slice(i); break; }
      // A block comment: copy to its close, or to end of line if it does not close here.
      if (ch === '/' && line[i + 1] === '*') {
        const end = line.indexOf('*/', i + 2);
        if (end === -1) { out += line.slice(i); break; }
        out += line.slice(i, end + 2);
        i = end + 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i++; continue; }

      // An identifier: take the whole word, then decide.
      if (/[A-Za-z_$]/.test(ch)) {
        let j = i;
        while (j < line.length && /[\w$]/.test(line[j])) j++;
        const word = line.slice(i, j);
        out += word === oldName ? newName : word;
        i = j;
        continue;
      }

      out += ch;
      i++;
    }

    return out;
  }

  private log(...args: unknown[]): void {
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.error(...args);
    }
  }
}
