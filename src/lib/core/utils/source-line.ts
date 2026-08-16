import fs from 'node:fs';

/**
 * Conducks — turning a stored `(file, line)` back into the line of code (ADR 0132).
 *
 * The line numbers have been in the vault since ADR 0110 — `edges.lineNumber` plus a `lines[]`
 * property carrying every call site rather than the first. What was missing is reading the source
 * back, which is the whole distance between `execute (cohesion.ts:38)` and a line a reader can act
 * on without opening the file.
 */

/**
 * One line's answer. A BLANK line is `''` rather than null, because "this line is empty" and "this
 * line is unreadable" are different facts and a reader acts differently on each.
 */
export interface SourceLine {
  line: number;
  /** The trimmed line, `''` for a blank line, `null` when it could not be read. */
  text: string | null;
  /** Present only when `text` is null. */
  reason?: 'unreadable' | 'past-end';
}

/**
 * Reads lines at ANSWER time, and caches by file so the cost is one read per distinct file.
 *
 * NOT STORED IN THE VAULT, deliberately: code in the graph would double its size, go stale on every
 * edit, and duplicate what git already holds. `stats()` reports the read count so that claim is
 * checkable rather than asserted.
 *
 * A LINE THAT CANNOT BE READ SAYS SO. A vault older than the working tree points at a line that has
 * moved or gone, and printing whatever now sits at that number is a confident wrong answer — the
 * shape CONDUCKS-37 exists to prevent.
 */
export class SourceLineReader {
  /** path -> lines, or null when the file could not be read. Absence means "not yet attempted". */
  private cache = new Map<string, string[] | null>();
  private fileReads = 0;

  /** How many files were actually opened — the cost this class exists to bound. */
  public stats(): { fileReads: number } {
    return { fileReads: this.fileReads };
  }

  /** One line, 1-based. Never throws — an unreadable file and a line past the end each say which. */
  public read(file: string, line: number): SourceLine {
    const lines = this.load(file);
    if (lines === null) return { line, text: null, reason: 'unreadable' };
    // `line` is 1-based everywhere in this codebase; a 0 or negative reads as "no line recorded".
    if (line < 1 || line > lines.length) return { line, text: null, reason: 'past-end' };
    return { line, text: lines[line - 1].trim() };
  }

  /** Every line from ONE file, in the order asked. One load, however many lines. */
  public readMany(file: string, lines: number[]): SourceLine[] {
    return lines.map(l => this.read(file, l));
  }

  /** The file's lines, read once and cached — including the NULL that records a failed read. */
  private load(file: string): string[] | null {
    const hit = this.cache.get(file);
    if (hit !== undefined) return hit;

    let lines: string[] | null = null;
    try {
      // Node ids and the `file` column are LOWERCASED on write (CONDUCKS-4, for APFS), so on a
      // case-insensitive filesystem this path opens the real file. On a case-sensitive one it will
      // not, and the honest answer is `unreadable` rather than a guess at the original casing —
      // recovering it belongs to todo32, which owns the id-casing question.
      this.fileReads++;
      lines = fs.readFileSync(file, 'utf8').split('\n');
    } catch {
      lines = null;
    }
    this.cache.set(file, lines);
    return lines;
  }
}
