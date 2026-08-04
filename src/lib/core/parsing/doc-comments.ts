/**
 * Conducks — Doc Comment Harvest 📖
 *
 * Attaches the comment an author wrote ABOUT a symbol to that symbol (ADR 0133).
 *
 * The graph has always stored structure and no meaning, so "what does it do" — the first question
 * anyone asks about an unfamiliar function — had no answer from conducks OR from grep. The meaning
 * was already written and already parsed: every grammar here captures comments as `@comment`
 * (Python additionally captures `(expression_statement (string))`, its docstring form), the reflector
 * already receives them for debt markers, and the text was discarded.
 *
 * THE JOIN IS BY LINE, not by tree navigation, because the two conventions sit on opposite sides of
 * the declaration:
 *
 *     /** Trims a name. *\/        <- JSDoc, Go, Rust, Java, C#, C++, PHP, Swift: ABOVE
 *     export function format() {}
 *
 *     def format(name):
 *         """Trims a name."""      <- Python: INSIDE the body, the first statement
 *
 * A row comparison covers both without asking each grammar for a different parent walk, and a
 * grammar that captures nothing simply contributes nothing.
 */

export interface HarvestedComment {
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  text: string;
}

export interface DocTarget {
  /** 1-based line the declaration starts on. */
  lineStart: number;
  /**
   * Who wins when two targets SHARE a line. Lower wins; absent means 0.
   *
   * A parameter sits on its function's own line, and without this it out-claimed the function:
   * measured on a frozen Python subject, 606 functions carried a docstring and 198 kept it, because
   * a comment is claimed by at most one symbol and the parameter was reached first. A function with
   * no parameters kept its doc, which made the loss look random rather than total.
   *
   * Rank only breaks a TIE. A nearer declaration still beats a further, better-ranked one.
   */
  rank?: number;
  /**
   * 1-based line the declaration ENDS on, when it is known.
   *
   * A docstring sits under the signature, and a signature can wrap over several lines — measured on
   * the frozen Python subject, 89 functions carried their docstring more than two lines below the
   * `def`. Knowing where the declaration ends is what lets the search reach them without a bigger
   * constant, which would let a nested function's docstring reach its parent.
   */
  lineEnd?: number;
}

/**
 * How far ABOVE a declaration a comment may sit and still be its doc.
 *
 * One blank line between a docstring and its function is common formatting; two suggests the comment
 * belongs to something else — a section banner, or the previous symbol's trailing note. Attaching a
 * paragraph to the wrong function is worse than attaching nothing, because the reader has no way to
 * tell it apart from a correct one.
 */
const MAX_GAP_ABOVE = 2;

/** Strip the comment syntax and leave the author's prose. */
export function cleanDocText(raw: string): string {
  let s = raw.trim();

  // Block form: /** … */ or /* … */
  if (s.startsWith('/*')) {
    s = s.replace(/^\/\*+/, '').replace(/\*+\/$/, '');
    // Each continuation line usually opens with ` * `; removing it is what turns a rendered block
    // back into prose.
    s = s.split('\n').map(l => l.replace(/^\s*\*\s?/, '')).join('\n');
  } else if (s.startsWith('"""') || s.startsWith("'''")) {
    // Python docstring.
    s = s.replace(/^("""|''')/, '').replace(/("""|''')$/, '');
  } else {
    // Line form: //, ///, #. A run of them arrives as one capture per line in some grammars and as
    // one multi-line node in others, so both shapes are handled the same way.
    s = s.split('\n').map(l => l.replace(/^\s*(\/\/\/?|#)\s?/, '')).join('\n');
  }

  return s.split('\n').map(l => l.trimEnd()).join('\n').trim();
}

/**
 * Does this text say anything ABOUT the symbol?
 *
 * `# ------------------------------` is a section rule, not a description, and it was being attached
 * as documentation — seventeen times on the frozen Python subject, where it also beat the real
 * docstring whenever the signature wrapped. A comment with no letter in it describes nothing, and
 * printing it under a symbol is worse than printing nothing: the reader cannot tell it apart from a
 * function whose author wrote a useless docstring.
 */
export function isDescriptive(text: string): boolean {
  return /\p{L}/u.test(text);
}

/**
 * The FIRST LINE of a doc, for a header where there is room for one line and no more.
 *
 * Stops at the first blank line rather than the first newline: a docstring whose opening sentence
 * wraps would otherwise be cut mid-clause, which reads as a truncation bug rather than a summary.
 */
export function firstLineOf(doc: string): string {
  const para = doc.split(/\n\s*\n/)[0] ?? '';
  return para.split('\n').map(l => l.trim()).filter(Boolean).join(' ').trim();
}

/**
 * Find the comment that documents a declaration, or null.
 *
 * Preference order is deliberate: a comment INSIDE the body (Python's docstring) beats one above it,
 * because when both exist the inner one is the language's own convention and the outer one is
 * usually a section banner.
 */
export function docFor(
  target: DocTarget,
  comments: HarvestedComment[],
  /** Last line the INSIDE search may reach. Defaults to two lines under the declaration. */
  insideUntil?: number
): HarvestedComment | null {
  const decl = target.lineStart;
  if (!decl || decl < 1) return null;
  const until = Math.max(decl + 2, insideUntil ?? 0);

  // INSIDE: the first statement of the body, on the declaration's own line or just after it.
  //
  // The window starts AT the declaration, not after it, because a MODULE's docstring begins on the
  // same line the unit is recorded at. With a strictly-greater window every module docstring was
  // excluded — measured on the frozen Python subject, 69 modules carried one and exactly 1 was
  // attached.
  const inside = comments
    .filter(c => c.startLine >= decl && c.startLine <= until)
    .sort((a, b) => a.startLine - b.startLine)[0];
  if (inside && /^\s*("""|''')/.test(inside.text)) return inside;

  // ABOVE: the comment whose LAST line is nearest the declaration, within the gap.
  const above = comments
    .filter(c => c.endLine < decl && decl - c.endLine <= MAX_GAP_ABOVE)
    .sort((a, b) => b.endLine - a.endLine)[0];
  return above ?? null;
}

/**
 * Attach docs to a set of targets, returning the text per index.
 *
 * A comment is claimed by AT MOST ONE symbol. Without that, a banner above a class would be handed
 * to the class and to its first method, and the same paragraph would then describe two different
 * things — which is exactly the kind of confident-and-wrong answer this project keeps removing.
 */
export function attachDocs<T extends DocTarget>(
  targets: T[],
  comments: HarvestedComment[]
): Map<T, string> {
  const out = new Map<T, string>();
  const claimed = new Set<HarvestedComment>();

  // Nearest declaration wins: sorting by line means an inner symbol claims a comment before an
  // outer one further up the file can. Rank breaks a tie WITHIN a line, so a function outranks the
  // parameter that shares its declaration line — see `DocTarget.rank`.
  const ordered = [...targets].sort((a, b) => a.lineStart - b.lineStart || (a.rank ?? 0) - (b.rank ?? 0));

  // Where each declaration's INSIDE search may reach: its own end, but never into the next
  // declaration's body. A constant window cannot express that — too small and a wrapped signature
  // hides its docstring, too large and an inner function's docstring is handed to its parent.
  const declLines = ordered.filter(t => (t.rank ?? 0) === 0).map(t => t.lineStart);
  const reachOf = (t: DocTarget): number | undefined => {
    if (t.lineEnd === undefined) return undefined;
    const nextDecl = declLines.find(l => l > t.lineStart);
    return nextDecl === undefined ? t.lineEnd : Math.min(t.lineEnd, nextDecl - 1);
  };

  for (const t of ordered) {
    const hit = docFor(t, comments.filter(c => !claimed.has(c)), reachOf(t));
    if (!hit) continue;
    const text = cleanDocText(hit.text);
    if (!text || !isDescriptive(text)) continue;
    claimed.add(hit);
    out.set(t, text);
  }
  return out;
}
