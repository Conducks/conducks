/**
 * Conducks — Coverage Bind 🟩
 *
 * The range-join at the heart of the coverage overlay: an istanbul coverage report → ran-lines
 * and branch arms per file → bound onto each BEHAVIOR node's [lineStart, lineEnd] span → fill %.
 * Pure domain logic, shared by the `coverage` CLI command and the `conducks_coverage` MCP tool
 * (interfaces reuse this via the registry, never duplicate it).
 */
import { readFileSync } from "node:fs";

export interface CovNode { name: string; file: string; lineStart: number; lineEnd: number; }
export interface CovResult {
  name: string; file: string; start: number; end: number;
  pct: number; branchTaken: number; branchTotal: number; bound: boolean;
}
export interface ParsedCoverage {
  ranByFile: Map<string, Set<number>>;
  branchesByFile: Map<string, Array<{ line: number; arms: number[] }>>;
}

/** Parse an istanbul coverage-final.json into ran-lines + branch arms, keyed by lowercased path. */
export function parseIstanbul(covPath: string): ParsedCoverage {
  const cov: Record<string, any> = JSON.parse(readFileSync(covPath, "utf8"));
  const ranByFile = new Map<string, Set<number>>();
  const branchesByFile = new Map<string, Array<{ line: number; arms: number[] }>>();
  for (const [file, d] of Object.entries<any>(cov)) {
    const lines = new Set<number>();
    const sm = d.statementMap || {}, s = d.s || {};
    for (const id of Object.keys(sm)) {
      if ((s[id] || 0) > 0) {
        const st = sm[id];
        const end = (st.end && st.end.line) || st.start.line;
        for (let ln = st.start.line; ln <= end; ln++) lines.add(ln);
      }
    }
    ranByFile.set(file.toLowerCase(), lines);

    const bm = d.branchMap || {}, b = d.b || {};
    const brs: Array<{ line: number; arms: number[] }> = [];
    for (const id of Object.keys(bm)) {
      const loc = bm[id];
      const line = (loc.loc && loc.loc.start && loc.loc.start.line) || loc.line || 0;
      if (line && Array.isArray(b[id])) brs.push({ line, arms: b[id] });
    }
    branchesByFile.set(file.toLowerCase(), brs);
  }
  return { ranByFile, branchesByFile };
}

/** Range-join coverage onto BEHAVIOR node spans → per-function fill % + branch coverage. */
export function bindCoverage(nodes: CovNode[], parsed: ParsedCoverage): CovResult[] {
  const covKeys = [...parsed.ranByFile.keys()];
  // Suffix match only on a path-segment boundary AND only when the suffix carries a directory
  // (≥ dir/basename). `long` ends with `short`, the char before the join is a "/", and `short`
  // itself spans a "/". Prevents a bare basename or a wrong-dir sibling (src/bar/index.ts)
  // binding to src/foo/index.ts — the old fallback lit every same-named file FULL from one file.
  const suffixMatch = (long: string, short: string): boolean =>
    long === short ||
    (short.includes("/") && long.endsWith(short) && long[long.length - short.length - 1] === "/");
  const matchFile = (f: string): string | undefined => {
    const lf = f.toLowerCase();
    return covKeys.find(k => suffixMatch(k, lf) || suffixMatch(lf, k));
  };
  const results: CovResult[] = [];
  for (const n of nodes) {
    const key = matchFile(n.file);
    const span = n.lineEnd - n.lineStart + 1;
    let hit = 0, branchTaken = 0, branchTotal = 0;
    if (key) {
      const ran = parsed.ranByFile.get(key)!;
      for (let ln = n.lineStart; ln <= n.lineEnd; ln++) if (ran.has(ln)) hit++;
      for (const br of parsed.branchesByFile.get(key) || []) {
        if (br.line >= n.lineStart && br.line <= n.lineEnd) {
          branchTotal += br.arms.length;
          branchTaken += br.arms.filter(c => c > 0).length;
        }
      }
    }
    results.push({
      name: n.name, file: n.file, start: n.lineStart, end: n.lineEnd,
      pct: Math.round((hit / span) * 100), branchTaken, branchTotal, bound: !!key,
    });
  }
  return results;
}
