import { describe, it, expect, afterEach } from '@jest/globals';
import { traceMemory, explainScope, assessRoot } from '@/lib/core/utils/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The two utils door exports nothing named (ADR 0150 rules 10 and 12).
 *
 * `mem-trace.ts` was the last leaf in core with no test of any kind. It is one function, and the
 * thing worth pinning is not its arithmetic but its GATE: it must cost nothing when the environment
 * variable is unset. A diagnostic that runs anyway is the failure it was written to avoid — "a pulse
 * should not pay for an instrument nobody asked for" — and an always-on version would pass any test
 * that only checked the output format.
 */
const captured: string[] = [];
const hook = (): (() => void) => {
  const real = process.stderr.write.bind(process.stderr);
  (process.stderr as any).write = (chunk: any) => { captured.push(String(chunk)); return true; };
  return () => { (process.stderr as any).write = real; };
};

const tmp: string[] = [];
afterEach(() => {
  delete process.env.CONDUCKS_MEM_TRACE;
  captured.length = 0;
  while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true });
});

describe('traceMemory is off unless asked for', () => {
  it('writes NOTHING when CONDUCKS_MEM_TRACE is unset', () => {
    delete process.env.CONDUCKS_MEM_TRACE;
    const restore = hook();
    try { traceMemory('stage-one'); } finally { restore(); }

    expect(captured.join('')).not.toContain('MemTrace');
  });

  it('writes the stage label when it IS set — the counter-test', () => {
    // Without this, deleting the function body entirely would pass the case above.
    process.env.CONDUCKS_MEM_TRACE = '1';
    const restore = hook();
    try { traceMemory('stage-one'); } finally { restore(); }

    const out = captured.join('');
    expect(out).toContain('MemTrace');
    expect(out).toContain('stage-one');
  });

  it('reports the NATIVE footprint, which is the number the tool exists to show', () => {
    // Established by measurement and recorded in the file: the peak is NOT the JavaScript heap —
    // the same pulse survives `--max-old-space-size=400` and still exceeds a gigabyte. So `rss`
    // alone is the number that misled five written explanations, and `native` is the one that did
    // not. A trace that dropped it would look complete and answer nothing.
    process.env.CONDUCKS_MEM_TRACE = '1';
    const restore = hook();
    try { traceMemory('stage-two'); } finally { restore(); }

    expect(captured.join('')).toMatch(/native=-?\d+MB/);
  });
});

describe('explainScope renders an assessment a person can act on', () => {
  it('names the target and the file count', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-scope-'));
    tmp.push(dir);
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export const a = 1;\n');

    const text = explainScope(assessRoot(dir));

    expect(text).toContain(dir);
    expect(text).toMatch(/Files.*\d/);
  });

  it('renders every reason the assessment carries, one per line', () => {
    // The reasons are the whole point — a scope refusal that says "too big" without saying WHICH
    // signal fired is one a user cannot act on. Driven through a hand-built assessment so the case
    // does not depend on which directory happens to trip which rule.
    const text = explainScope({
      root: '/somewhere', approxFiles: 12345, cappedAt: true,
      level: 'REFUSE' as never, reasons: ['looks like a home directory', 'no manifest found'],
    } as never);

    expect(text).toContain('looks like a home directory');
    expect(text).toContain('no manifest found');
    expect(text).toContain('stopped counting');
  });
});
