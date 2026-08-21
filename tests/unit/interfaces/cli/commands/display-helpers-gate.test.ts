/**
 * Conducks — the gate that makes forgetting `displayId`/`displayPath` impossible (F-08).
 *
 * Node ids and file paths are lowercased at store time in `reflector.ts` (~20 sites, deliberate —
 * CONDUCKS-4, APFS is case-insensitive). Real casing is recovered only at render, by an author
 * remembering to route a printed id/path through `displayId`/`displayPath`
 * (`src/interfaces/cli/shared/display-path.ts`). A human census of "which command files still
 * print raw" has been done twice by hand and been wrong both times — a "9 sites" pass missed 5.
 *
 * This test is that census, mechanised: it scans every command file's TERMINAL output (not its
 * `--json` output — `display-path.ts`'s own header says JSON stays raw for machine consumers, and
 * this gate agrees) for a raw node id or file path reaching `console.log`/`console.error` without
 * passing through `displayId`, `displayPath`, or a same-file wrapper built from them (`rel(...)`,
 * `formatId(...)`, `label(...)` are allowed ONLY when their own definition calls one of the two
 * helpers — checked below, not assumed).
 *
 * WHAT THIS CANNOT SEE: it is a regex/text scan, not a real parser, so it cannot always tell a
 * genuine `.id` (a node id) from a same-named field that ISN'T one (a pulse id, an unrelated
 * counter). Two narrow, explicit escapes exist for exactly that — see NON_NODE_ID_NAMES and
 * ALLOWED_WRAPPERS below — and any new escape must be justified in a comment beside it, the same
 * as the KNOWN-DEBT list is for whole files. Anything not on an explicit allowlist is a violation,
 * full stop: the entire point is that nothing is silently exempted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from '@jest/globals';

const COMMANDS_DIR = path.resolve(process.cwd(), 'src/interfaces/cli/commands');

/**
 * KNOWN-DEBT — files this scanner FLAGS today that this pass (W1, phase1 render fixes) does not
 * fix. This is the output of actually RUNNING the scanner against the base commit (31535f4), not a
 * hand-written guess — the two prior hand-census passes on this codebase were each wrong (a
 * "9 sites" pass missed 5), which is the entire reason this gate exists as code instead of a list.
 *
 * Never delete a file from here silently: if it starts passing, remove its entry as part of the
 * commit that fixed it, not as a side effect of loosening the scanner.
 */
const KNOWN_DEBT: Record<string, string> = {
  // W2-owned this phase (see .claude/agent-runs/phaseR-2026-08-21) — touching it would violate
  // this run's file-ownership split, not because the debt isn't real.
  'audit.ts': 'W2-owned this phase (governance domain layer); L33 prints a raw ${h.file} hotspot path.',

  // Flagged, not owned by either W1 or W2 this phase, and out of scope for the F-08 task brief
  // (query/rename/diff/trace only). Recorded so the debt stays visible rather than silently
  // passing; a future pass should sweep these the same way this one swept its own four files.
  'context.ts': 'Not W1-owned this phase; L87 prints a raw ${resolvedId} in its "not found" message.',
  'coverage.ts': 'Not W1-owned this phase; L111 prints a raw ${d.file} in its report.',
  'docs-lint.ts': 'Not W1-owned this phase; L65/L81 print a raw ${l.file} lint-finding path.',
  'docs-status.ts': 'Not W1-owned this phase; L160 prints a raw ${w.file} warning path (its L126 ${d.id} is a docs-board entry id, not a graph node id — see SCANNER_EXEMPTIONS).',
  'explain.ts': 'Not W1-owned this phase; L57/L65 print a raw ${symbolId} in error messages.',
  'guard.ts': 'Not W1-owned this phase; L67 prints a raw ${h.file} rejected-hotspot path.',
  'impact.ts': 'Not W1-owned this phase; L71 prints raw ${resolvedId}/${symbolId}, L257 a raw ${rootId}.',

  // Flagged by the scanner but NOT owned this phase, and — unlike the entries above — the flag
  // itself is very likely a FALSE POSITIVE rather than real F-08 debt: `path.basename(projectRoot)`
  // derives a short label from a directory the user passed or `process.cwd()` returned, not from a
  // lowercased graph-stored path, so there is no case to repair. Recorded rather than silently
  // dropped because this scanner cannot prove that without deeper analysis of `projectRoot`'s
  // origin in each file, and asserting it confidently is exactly the kind of hand-judgment this
  // gate exists to not rely on.
  'bootstrap-docs.ts': 'Not W1-owned this phase; L25 path.basename(projectRoot) — likely a false positive (project label, not a stored path), unconfirmed.',
  'record.ts': 'Not W1-owned this phase; L46 path.basename(projectRoot) — likely a false positive (project label, not a stored path), unconfirmed.',

  // help.ts's `${cmd.id}` is a CLI COMMAND id (`"query"`, `"rename"`, ...) — a fixed, always-
  // lowercase vocabulary this tool defines itself, never a file-path-derived, case-losing node id.
  // Recorded as a confirmed scanner false positive rather than silently exempted, so the reasoning
  // is visible next to the file it excuses.
  'help.ts': "Confirmed false positive: L95/L117 ${cmd.id} is this CLI's own command id (e.g. \"rename\"), never a graph node id.",
};

/**
 * Identifiers ending in `Id`/`id` that are NOT node ids and so are not subject to the
 * display-repair rule — a pulse id (`baseId`, `headId`, `headPulse`) is an opaque version marker
 * with no file/case component, not a `<path>::<symbol>` node id. Each entry names exactly the
 * bare-variable spelling it exempts, not a pattern, so a real node id spelled similarly still
 * trips the gate.
 */
const NON_NODE_ID_NAMES = new Set(['baseId', 'headId', 'headPulse', 'basePulseId', 'headPulseId', 'pulseId']);

/** Wrapper function names whose OWN body must call `displayId`/`displayPath` to count as safe. */
const ALLOWED_WRAPPER_NAMES = ['rel', 'formatId', 'label', 'displayId', 'displayPath', 'displayMessage'];

/**
 * CONFIRMED scanner false positives, narrowed to an exact (file, line, matched-text) triple so
 * nothing broader is silently waved through. Each entry must say WHY the flagged value is not a
 * lowercased, file-path-derived node id.
 *
 * `query.ts`'s `templateId`/`t.id` are Oracle template ids (`registry.analyze.query`'s own fixed
 * vocabulary, e.g. `"hotspot-report"`) — a separate namespace from graph node ids, never derived
 * from a file path, never lowercased by `reflector.ts`. There is nothing for `displayId` to repair.
 */
const SCANNER_EXEMPTIONS: Array<{ file: string; line: number; text: string; reason: string }> = [
  { file: 'query.ts', line: 182, text: '${templateId}', reason: 'Oracle template id, not a graph node id — no file path, never lowercased.' },
  { file: 'query.ts', line: 198, text: '${t.id}', reason: 'Oracle template id (from listTemplates()), not a graph node id.' },
];

function readCommandFiles(): Array<{ file: string; source: string }> {
  return fs.readdirSync(COMMANDS_DIR)
    .filter(f => f.endsWith('.ts'))
    .map(file => ({ file, source: fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf-8') }));
}

/**
 * Strips out `--json` branches: any `console.log`/`process.stdout.write` statement whose argument
 * list contains `JSON.stringify(` is machine output and is explicitly out of scope (`--json` is
 * intentionally raw — display-path.ts's own header says so).
 *
 * Statements are found by locating each output-call token and then balancing parens from its
 * opening `(` to the matching close — a full parser would do this more precisely, but the calls in
 * this codebase do not nest unbalanced parens inside string literals in ways that would fool this.
 */
function stripJsonCalls(source: string): string {
  const callStarts = /(?:console\.(?:log|error)|process\.(?:stdout|stderr)\.write)\s*\(/g;
  let out = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = callStarts.exec(source))) {
    const openParenIdx = m.index + m[0].length - 1;
    let depth = 1;
    let i = openParenIdx + 1;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
    }
    const wholeCall = source.slice(m.index, i);
    out += source.slice(cursor, m.index);
    if (wholeCall.includes('JSON.stringify(')) {
      // Replace with blank lines of the same length so line numbers in reported violations still
      // line up with the original file.
      out += wholeCall.replace(/[^\n]/g, ' ');
    } else {
      out += wholeCall;
    }
    cursor = i;
    callStarts.lastIndex = i;
  }
  out += source.slice(cursor);
  return out;
}

/** Which of `ALLOWED_WRAPPER_NAMES` are actually implemented, in THIS file, by calling the real helper. */
function realWrappers(source: string): Set<string> {
  const real = new Set<string>();
  for (const name of ALLOWED_WRAPPER_NAMES) {
    if (name === 'displayId' || name === 'displayPath' || name === 'displayMessage') { real.add(name); continue; }
    // `const rel = (p) => ... displayPath(...)` or `const formatId = (id) => displayId(...)`
    const def = new RegExp(`const\\s+${name}\\s*=[^;]*?(displayId|displayPath|displayMessage)\\(`, 's');
    if (def.test(source)) real.add(name);
  }
  return real;
}

interface Violation { file: string; line: number; snippet: string; reason: string }

function scanFile(file: string, source: string): Violation[] {
  const wrappers = realWrappers(source);
  const stripped = stripJsonCalls(source);
  const lines = stripped.split('\n');
  const violations: Violation[] = [];

  // `path.basename(x)` on a value that came from a node/file path — always a violation: it
  // discards the directory AND never repairs case, so it is strictly worse than printing raw.
  const basenameRe = /path\.basename\(/g;
  // `${...X.id}` — a property access ending in `.id`, the shape a node id is actually held in
  // (`r.id`, `best.id`, `n.id`, `d.id`). Excludes `.id` used as an object KEY (`{ id: ... }`) by
  // requiring the `${` opener.
  const dotIdRe = /\$\{[^}]*\.id\}/g;
  // `${symbolId}` / `${targetId}` / bare identifiers ending in `Id` — the shape `resolveSymbol`'s
  // return value and similar locals take.
  const bareIdRe = /\$\{([a-zA-Z_][a-zA-Z0-9_]*Id)\}/g;
  // `${...filePath}` / `${...\.file\}` — the file-path property shape.
  const filePathRe = /\$\{[^}]*(?:filePath|\.file)\}/g;

  const isExempt = (lineNo: number, text: string) =>
    SCANNER_EXEMPTIONS.some(e => e.file === file && e.line === lineNo && e.text === text);

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    // A comment line (`//...`, or inside a `/* ... */` / `/** ... */` block) is prose, not a
    // print call — this scanner is text-based, not a real parser, and a comment EXPLAINING a
    // fixed violation (as this very file's own commit messages do, e.g. rename.ts) would
    // otherwise be flagged as if it were the violation itself.
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

    for (const m of line.matchAll(basenameRe)) {
      violations.push({ file, line: lineNo, snippet: line.trim(), reason: 'path.basename() on a path — loses directory and never repairs case' });
    }

    for (const m of line.matchAll(dotIdRe)) {
      const text = m[0];
      if (wrappers.size && [...wrappers].some(w => text.includes(`${w}(`))) continue;
      if (text.includes('displayId(') || text.includes('formatId(')) continue;
      if (isExempt(lineNo, text)) continue;
      violations.push({ file, line: lineNo, snippet: line.trim(), reason: `raw node id printed: ${text}` });
    }

    for (const m of line.matchAll(bareIdRe)) {
      const varName = m[1];
      if (NON_NODE_ID_NAMES.has(varName)) continue;
      const text = m[0];
      // A wrapped call reads `${formatId(symbolId)}` — the bare-id regex above only matches a
      // template hole containing NOTHING but the identifier, so a wrapped call never matches this
      // pattern in the first place; this guard is for the (unused today) case of a wrapper with a
      // one-arg call written without parens-adjacent spacing tricks slipping through.
      if ([...wrappers].some(w => line.includes(`${w}(${varName})`))) continue;
      if (isExempt(lineNo, text)) continue;
      violations.push({ file, line: lineNo, snippet: line.trim(), reason: `raw node id printed: ${text}` });
    }

    for (const m of line.matchAll(filePathRe)) {
      const text = m[0];
      if (wrappers.size && [...wrappers].some(w => text.includes(`${w}(`))) continue;
      if (text.includes('displayPath(')) continue;
      if (isExempt(lineNo, text)) continue;
      violations.push({ file, line: lineNo, snippet: line.trim(), reason: `raw file path printed: ${text}` });
    }
  });

  return violations;
}

describe('render gate: every command prints ids/paths through displayId/displayPath (F-08)', () => {
  const files = readCommandFiles();

  it('census: the files this scan flags today are exactly the recorded KNOWN-DEBT set (plus zero unexpected ones)', () => {
    const flaggedFiles = new Set<string>();
    for (const { file, source } of files) {
      if (scanFile(file, source).length > 0) flaggedFiles.add(file);
    }
    const unexpected = [...flaggedFiles].filter(f => !(f in KNOWN_DEBT));
    // A file flagged here and not in KNOWN_DEBT is either a fix this run missed, or a genuinely new
    // debt site — either way it must be looked at, not silently passed.
    expect(unexpected).toEqual([]);
  });

  it('the files THIS run owns and fixed (query, rename, diff, trace) print nothing raw', () => {
    const owned = ['query.ts', 'rename.ts', 'diff.ts', 'trace.ts'];
    for (const { file, source } of files) {
      if (!owned.includes(file)) continue;
      const violations = scanFile(file, source);
      expect({ file, violations }).toEqual({ file, violations: [] });
    }
  });

  it('every KNOWN-DEBT entry names a file that actually exists in commands/', () => {
    const names = new Set(files.map(f => f.file));
    for (const debtFile of Object.keys(KNOWN_DEBT)) {
      expect(names.has(debtFile)).toBe(true);
    }
  });
});
