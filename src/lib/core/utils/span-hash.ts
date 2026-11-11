import { createHash } from "node:crypto";

const sha = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * Hash of exactly what a range cites — the narrowest span that can carry the claim.
 *
 * `:line` hashes that one line, `:a-b` the range, `::symbol` the definition block (the definition
 * line plus every following line indented deeper — a heuristic, but a hash only needs to CHANGE
 * when the code does, not to parse it). A bare file hashes whole. Lines are trimmed so a pure
 * re-indent does not fire a flag.
 */
export function spanHashOf(source: string, a: { line?: number; endLine?: number; symbol?: string }): string {
  const lines = source.split("\n");
  if (a.line !== undefined) {
    const from = a.line - 1;
    const to = a.endLine !== undefined ? a.endLine - 1 : from;
    return sha(lines.slice(from, to + 1).map(l => l.trim()).join("\n"));
  }
  if (a.symbol) {
    const n = a.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const defRe = new RegExp(`\\b(?:function|class|const|let|var|interface|type|enum|def)\\s+${n}\\b|^\\s*(?:export\\s+)?(?:public|private|protected|static|async|\\*)?\\s*${n}\\s*[(<:=]`);
    const at = lines.findIndex(l => defRe.test(l));
    if (at === -1) return sha(source);
    // Decorators directly above the definition are part of what the claim describes — `@lru_cache`
    // appearing or vanishing changes behaviour as surely as an edit to the body.
    let start = at;
    while (start > 0 && lines[start - 1].trim().startsWith("@")) start--;
    const indent = lines[at].match(/^\s*/)![0].length;
    let end = at;
    for (let i = at + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === "") continue;
      if (l.match(/^\s*/)![0].length <= indent) break;
      end = i;
    }
    return sha(lines.slice(start, end + 1).map(l => l.trim()).join("\n"));
  }
  return sha(lines.map(l => l.trim()).join("\n"));
}
