import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildBoard, agentView } from '@/lib/domain/analysis/docs-board.js';

// The cross-file half of the standard: what a phase builds, what it waits on, and what an old
// decision left unbuilt — facts no single file can hold, so they can only be tested on a tree.
describe('docs-board — links between docs', () => {
  let root: string;

  const adr = (id: string, title: string, extra = '') =>
    `# ${id} — ${title}\nStatus: Accepted\n${extra}- Date: 2026-07-26\n\n## Context\nc\n## Decision\nd\n## Consequences\nq\n`;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'conducks-board-'));
    mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
    mkdirSync(path.join(root, 'docs', 'todos'), { recursive: true });
    const w = (p: string, s: string) => writeFileSync(path.join(root, 'docs', p), s);

    w('decisions/0001-built.md', adr('0001', 'fully built'));
    w('decisions/0002-partial.md', adr('0002', 'half built'));
    w('decisions/0003-enforced.md', adr('0003', 'proven by a test', '- Enforced by: tests/x.test.ts::rule holds\n'));
    w('decisions/0004-orphan.md', adr('0004', 'nobody linked this'));

    w('todos/todo01.md',
      '# todo01 — the work\nStatus: doing\n- Acceptance: everything green\n\n' +
      '## Phase 1 — finished\n- Builds: 0001\n- [x] a\n- [x] b\n\n' +
      '## Phase 2 — half done\n- Builds: 0002\n- [x] c\n- [ ] the next thing\n\n' +
      '## Phase 3 — waiting\n- Depends: todo01#P2\n- [ ] cannot start yet\n\n' +
      '## Phase 4 — nobody claimed this\n- [ ] unlinked work\n');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('rolls an ADR build state up from the phases that declare `- Builds:` it', () => {
    const b = buildBoard(root);
    const byId = Object.fromEntries(b.decisions.map(d => [d.id, d]));
    expect(byId['0001'].buildState).toBe('built');
    expect(byId['0002'].buildState).toBe('partial');
    expect(byId['0002'].openPhases).toEqual(['todo01#P2']);
    // Unlinked is a distinct answer from built — silence must not read as done.
    expect(byId['0004'].buildState).toBe('unlinked');
    expect(b.unlinked).toContain('0004');
    // …but an `- Enforced by:` artifact counts as a link, so it is not reported as unproven.
    expect(b.unlinked).not.toContain('0003');
  });

  it('derives blocked from an unmet `- Depends:` and names the blocker', () => {
    const b = buildBoard(root);
    const phases = b.todos[0].phases;
    expect(phases.map((p: { addr: string }) => p.addr)).toEqual(['todo01#P1', 'todo01#P2', 'todo01#P3', 'todo01#P4']);
    expect(phases[0].state).toBe('done');
    expect(phases[1].state).toBe('doing');
    expect(phases[2].state).toBe('blocked');
    expect(phases[2].blockedBy).toEqual(['todo01#P2']);
    // The live phase is what can start NOW — never the one that is waiting.
    expect(b.todos[0].activeAddr).toBe('todo01#P2');
    expect(b.todos[0].nextTask).toBe('the next thing');
  });

  it('refuses to let a supersede drop the unbuilt remainder in silence', () => {
    writeFileSync(path.join(root, 'docs', 'decisions', '0005-replaces.md'),
      adr('0005', 'replaces the half-built one', '- Supersedes: 0002\n'));
    writeFileSync(path.join(root, 'docs', 'decisions', '0002-partial.md'),
      `# 0002 — half built\nStatus: Superseded by 0005\n- Superseded by: 0005\n- Date: 2026-07-26\n\n## Context\nc\n## Decision\nd\n## Consequences\nq\n`);

    const errs = buildBoard(root).lint.find(l => l.file.includes('0005'))!.errs.join(' ');
    expect(errs).toContain('still has unbuilt work (todo01#P2)');
    expect(errs).toContain('`- Inherits: 0002');

    // Claiming the remainder clears it.
    writeFileSync(path.join(root, 'docs', 'decisions', '0005-replaces.md'),
      adr('0005', 'replaces the half-built one', '- Supersedes: 0002\n- Inherits: 0002 (the unfinished half)\n'));
    expect(buildBoard(root).lint.find(l => l.file.includes('0005'))).toBeUndefined();
  });

  it('projects an agent view that is a fraction of the board and carries no doc prose', () => {
    const b = buildBoard(root);
    const view = agentView(b, 'board') as Record<string, any>;
    expect(JSON.stringify(view).length).toBeLessThan(JSON.stringify(b).length / 2);
    expect(view.constraints).toBeUndefined();                    // read-once layer omitted
    expect(view.open.map((o: { adr: string }) => o.adr)).toEqual(['0002']);   // only decisions owing work
    expect(view.open[0].phases[0]).toEqual({ at: 'todo01#P2', done: '1/2', next: 'the next thing' });
    expect(view.unlinkedWork[0].phases.map((p: { at: string }) => p.at)).toEqual(['todo01#P3', 'todo01#P4']);
    // The blocked phase reports its cause instead of a next task.
    expect(view.unlinkedWork[0].phases[0].blockedBy).toEqual(['todo01#P2']);
    expect(view.unlinkedWork[0].phases[0].next).toBeUndefined();

    expect((agentView(b, 'all') as Record<string, any>).constraints).toBeDefined();
  });

  it('fails a `- Builds:` or `- Depends:` that points at nothing', () => {
    writeFileSync(path.join(root, 'docs', 'todos', 'todo02.md'),
      '# todo02 — broken links\nStatus: todo\n- Acceptance: n/a\n\n## Phase 1 — x\n- Builds: 9999\n- Depends: todo99#P1\n- [ ] a\n');
    const errs = buildBoard(root).lint.find(l => l.file.includes('todo02'))!.errs.join(' ');
    expect(errs).toContain('ADR 9999, which does not exist');
    expect(errs).toContain('todo99#P1` points at a phase that does not exist');
    rmSync(path.join(root, 'docs', 'todos', 'todo02.md'));
  });

  it('warns, without failing the gate, when a claim contradicts the checkboxes', () => {
    writeFileSync(path.join(root, 'docs', 'todos', 'todo03.md'),
      '# todo03 — a lie\nStatus: done\n- Acceptance: n/a\n\n## Phase 1 — x\n- [ ] not actually done\n');
    const b = buildBoard(root);
    const w = b.warns.find(x => x.file.includes('todo03'))!.errs.join(' ');
    expect(w).toContain('1 task(s) are unchecked');
    expect(w).toContain("still in `todos/`");
    expect(b.lint.find(l => l.file.includes('todo03'))).toBeUndefined();   // hygiene never fails the gate
    rmSync(path.join(root, 'docs', 'todos', 'todo03.md'));
  });
});
