import { describe, it, expect, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTestingPage, renderTarget } from "@/lib/domain/docs/testing-page.js";

/**
 * Where the manual checklist is, how far through it anyone is, and which surface to send them to.
 *
 * Every case here is a way the answer goes quietly wrong: a count taken from the generated page
 * instead of the source, a repo with no checklist treated as broken, a shell ForgeTerm did not start
 * being told about a pane it cannot open.
 */

const made: string[] = [];

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'conducks-testing-'));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const SOURCE = [
  '# Testing',
  '',
  '## F1 — a feature',
  '',
  '- [ ] F1.T1 not run',
  '- [x] F1.T2 done',
  '- [x] F1.T3 done',
  '- [>] F1.T4 deferred — still owed',
  '- [-] F1.T5 dropped — not coming back',
  '',
].join('\n');

describe('the testing checklist', () => {
  it('counts every task, and counts done separately', () => {
    const root = repo({ 'docs/visuals/testing.md': SOURCE, 'docs/visuals/testing.html': '<h1>x</h1>' });
    const page = readTestingPage(root);
    expect(page.total).toBe(5);
    expect(page.done).toBe(2);
    expect(page.source).toBe(path.join(root, 'docs/visuals/testing.md'));
    expect(page.page).toBe(path.join(root, 'docs/visuals/testing.html'));
  });

  /**
   * **Counted from the SOURCE, never the rendered page.** The page is generated, so counting it
   * makes the number wrong for exactly as long as somebody has edited the source and not re-run the
   * generator — which is the moment the count is most likely to be looked at.
   */
  it('counts the source even when the rendered page disagrees', () => {
    const root = repo({
      'docs/visuals/testing.md': SOURCE,
      'docs/visuals/testing.html': '- [ ] one\n- [ ] two\n',
    });
    expect(readTestingPage(root).total).toBe(5);
  });

  /** A repo with no checklist is a finished state, not a broken one (`conducks-visuals` §0). */
  it('says nothing is there rather than throwing', () => {
    const page = readTestingPage(repo({ 'README.md': 'x' }));
    expect(page.source).toBeNull();
    expect(page.page).toBeNull();
    expect(page.total).toBe(0);
    expect(page.done).toBe(0);
  });

  /** A source with no generated page yet: the source is still the answer to "where is it". */
  it('reports a source with nothing rendered from it', () => {
    const page = readTestingPage(repo({ 'docs/visuals/testing.md': SOURCE }));
    expect(page.source).not.toBeNull();
    expect(page.page).toBeNull();
    expect(page.total).toBe(5);
  });

  /** An empty file is a checklist with no tasks, which is not the same as no checklist. */
  it('tells an empty checklist apart from a missing one', () => {
    const page = readTestingPage(repo({ 'docs/visuals/testing.md': '# Testing\n' }));
    expect(page.source).not.toBeNull();
    expect(page.total).toBe(0);
  });

  it('reads an indented task, which the grammar allows', () => {
    const page = readTestingPage(repo({ 'docs/visuals/testing.md': '  - [x] indented\n' }));
    expect(page.total).toBe(1);
    expect(page.done).toBe(1);
  });

  /**
   * A line that merely CONTAINS a checkbox is prose, not a task — otherwise a page explaining the
   * grammar counts its own examples.
   */
  it('does not count a checkbox in the middle of a line', () => {
    const page = readTestingPage(repo({ 'docs/visuals/testing.md': 'write it as - [ ] like this\n' }));
    expect(page.total).toBe(0);
  });
});

describe('where to read it', () => {
  it('sends a ForgeTerm pane to ForgeTerm', () => {
    expect(renderTarget({ FORGETERM: '1' })).toBe('forgeterm');
  });

  /**
   * **A shell ForgeTerm did not start gets the browser**, even with a ForgeTerm window open
   * elsewhere on the machine. Right answer rather than a gap: the pane would open in a window the
   * person is not looking at.
   */
  it('sends everything else to the browser', () => {
    expect(renderTarget({})).toBe('browser');
    expect(renderTarget({ TERM: 'xterm-256color' })).toBe('browser');
    expect(renderTarget({ FORGETERM_TAB: 'forgeterm' })).toBe('browser');
  });
});
