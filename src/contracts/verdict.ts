/**
 * Conducks — a result that CANNOT claim clean without saying what it looked at 🧮
 *
 * ADR 0124 says "nothing to check is not a pass". It was written down, accepted, and then violated
 * eight more times, because it was a PRINCIPLE and every report site independently decided what to
 * say when it held nothing. Measured at the time this file was written: 17 of 132 memory entries are
 * this one defect, and 32 `length === 0` branches sit in the CLI commands alone, each free to get it
 * wrong on its own.
 *
 * Instances found by hand, all the same sentence — nothing was examined, and that was reported as a
 * negative finding rather than as nothing:
 *
 *   - a vault with 0 symbols printed `Status: READY` / `Staleness: SYNCHRONIZED`
 *   - `conducks_status` sent `"stale": false` to agents with no verdict in the payload at all
 *   - a file created after `watch` started produced no output, because git attributed no lines
 *   - a graph-load race answered `SYMBOL_NOT_FOUND` for a symbol that exists
 *   - a benchmark that never ran a first analyze reported a green baseline
 *   - tests that compared `NaN` to `NaN`, replicated the guard they tested, or mocked away the
 *     singleton whose corruption was the bug
 *
 * A grep cannot catch this. "A backtick inside a template literal" is an unambiguous syntactic fact,
 * which is why ADR 0089's build gate works; "this branch lies about emptiness" is not, and a fuzzy
 * lint that cries wolf gets switched off. So the enforcement lives where the COMPILER can see it.
 *
 * THE POINT OF THE SHAPE: `clean` cannot be constructed without `examined`, and `nothing-to-check` is
 * a separate variant rather than a special case of clean. A renderer that switches on `kind` gets a
 * compile error the moment it forgets the empty case. The defect stops being something to remember
 * and becomes something that does not build.
 */

/** What a check concluded, carrying the denominator that makes the conclusion mean anything. */
export type Verdict<T> =
  /**
   * There was no denominator: no docs tree, no vault, no dependencies, no coverage file. NOT a pass
   * and NOT a failure — the check did not run. `why` is shown to the reader, so this can never
   * render as a bare tick.
   */
  | { kind: 'nothing-to-check'; why: string }
  /** `examined` things were looked at and none of them were findings. This is the only honest pass. */
  | { kind: 'clean'; examined: number }
  /** `examined` things were looked at and these were findings. */
  | { kind: 'findings'; examined: number; found: readonly T[] };

/**
 * Build a verdict from a denominator and the findings against it.
 *
 * The ONE place the "did anything get examined" question is answered, so no caller re-decides it.
 * Note the order: emptiness of `examined` is checked BEFORE emptiness of `found`, because that is
 * precisely the inversion every instance of this bug made — they asked "were there findings?" first,
 * and an empty finding list looks identical whether you examined ten thousand things or zero.
 */
export function verdict<T>(examined: number, found: readonly T[], whyNothing: string): Verdict<T> {
  if (examined <= 0) return { kind: 'nothing-to-check', why: whyNothing };
  if (found.length === 0) return { kind: 'clean', examined };
  return { kind: 'findings', examined, found };
}

/** Findings if there are any, otherwise none — so callers need not re-switch to read the list. */
export function findingsOf<T>(v: Verdict<T>): readonly T[] {
  return v.kind === 'findings' ? v.found : [];
}

/** How many things were looked at. Zero exactly when nothing was checked. */
export function examinedOf<T>(v: Verdict<T>): number {
  return v.kind === 'nothing-to-check' ? 0 : v.examined;
}

/**
 * Render a verdict to one line, and make the empty case IMPOSSIBLE to omit.
 *
 * Every branch is required: `describe` has no default, so adding a fourth variant to `Verdict` breaks
 * every renderer at compile time rather than silently falling through to whichever branch was
 * written last — which is how `conducks_status` came to send agents a payload with the verdict
 * missing entirely while the value itself was computed correctly one layer down.
 */
export function renderVerdict<T>(
  v: Verdict<T>,
  describe: {
    nothing: (why: string) => string;
    clean: (examined: number) => string;
    findings: (found: readonly T[], examined: number) => string;
  },
): string {
  switch (v.kind) {
    case 'nothing-to-check': return describe.nothing(v.why);
    case 'clean': return describe.clean(v.examined);
    case 'findings': return describe.findings(v.found, v.examined);
  }
}

/**
 * The JSON shape for a machine reader — an agent, the MCP surface, a script.
 *
 * `checked` is ALWAYS present, including in the nothing-to-check case where it is 0. An agent reading
 * `{ clean: true }` with no denominator cannot tell a real pass from an absent one, and it acts on
 * the answer silently — which is strictly worse than a human misreading a terminal line.
 */
export function verdictToJson<T>(v: Verdict<T>): { status: Verdict<T>['kind']; checked: number; found: readonly T[]; why?: string } {
  return {
    status: v.kind,
    checked: examinedOf(v),
    found: findingsOf(v),
    ...(v.kind === 'nothing-to-check' ? { why: v.why } : {}),
  };
}
