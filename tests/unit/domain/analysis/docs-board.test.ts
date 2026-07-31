import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildBoard, agentView, crossTreeLint, treeShapeLint } from '@/lib/domain/analysis/docs-board.js';

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
    // An ADR whose open question a successor took over. It has no `- Builds:` phase and no
    // `- Enforced by:` on purpose — the successor carries the work, so demanding proof here asks it
    // to show work it deliberately handed on.
    w('decisions/0006-handed-on.md', adr('0006', 'resolved elsewhere', '- Resolved by: 0007\n'));

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
    // …and neither does an ADR a successor resolved. This was a PERMANENT false positive: ADR 0012
    // is `Status: Accepted` with `- Resolved by: 0013` and was reported on every single run. A
    // warning that can never be cleared trains the reader to skip the whole line.
    expect(b.unlinked).not.toContain('0006');
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

/**
 * ADR 0034: a phase-level `- Blocked by:` blocks THAT PHASE without needing a `- Depends:` — todo09#P3
 * is blocked on a network advisory database and 21 of its 24 tasks are not, so the file-level field
 * alone (the only carrier before this ADR) would mark the whole todo blocked when only one phase is.
 */
describe('docs-board — ADR 0034: phase-level `- Blocked by:`', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'conducks-blockedby-'));
    mkdirSync(path.join(root, 'docs', 'todos'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'todos', 'todo09.md'),
      '# todo09 — advisories\nStatus: doing\n- Acceptance: it works\n\n' +
      '## Phase 1 — unrelated work\n- [ ] carry on as normal\n\n' +
      '## Phase 3 — needs the CVE feed\n- Blocked by: CVE database offline\n- [ ] cannot start\n');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('blocks the phase carrying `- Blocked by:` and leaves its sibling untouched', () => {
    const b = buildBoard(root);
    const phases = b.todos[0].phases;
    const p1 = phases.find((p: { addr: string }) => p.addr === 'todo09#P1');
    const p3 = phases.find((p: { addr: string }) => p.addr === 'todo09#P3');
    expect(p3.state).toBe('blocked');
    expect(p3.blockedReason).toBe('CVE database offline');
    expect(p1.state).not.toBe('blocked');
  });

  it('does not warn `Status: blocked with neither Depends nor Blocked by` when only a phase has one', () => {
    writeFileSync(path.join(root, 'docs', 'todos', 'todo09.md'),
      '# todo09 — advisories\nStatus: blocked\n- Acceptance: it works\n\n' +
      '## Phase 3 — needs the CVE feed\n- Blocked by: CVE database offline\n- [ ] cannot start\n');
    const b = buildBoard(root);
    const w = b.warns.find(x => x.file.includes('todo09'));
    expect(w?.errs.join(' ') ?? '').not.toMatch(/neither an unmet/);
  });
});

/**
 * Numbers are per tree (conducks-docs §4): `app` and `admin` may each hold a `todo123` and they are
 * different records, so no collision check is possible. What CAN be wrong is an address — a wrong
 * tree label, or a record that was renamed or moved to `completed/`. Left unchecked, `- [ ] app:todo42`
 * in a root epic reads as real, open work forever.
 */
describe('cross-tree addresses', () => {
  let root: string;

  const build = (label: string, rel: string, body: string) => {
    const dir = path.join(root, label === '(root)' ? '' : label, 'docs', path.dirname(rel));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, path.basename(rel)), body);
  };

  const todo = (id: string, extra = '') =>
    `# ${id} — a thing\nStatus: doing\n- Acceptance: it works\n\n## Phase 1 — p\n${extra}- [ ] the task\n`;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'conducks-cross-'));
    build('(root)', 'todos/todo41.md',
      '# todo41 — payouts move behind one port\nStatus: doing\n- Acceptance: both read through the port\n\n' +
      '## Phase 1 — the two slices, in order\n- [x] app:todo42\n- [ ] admin:todo99\n');
    build('app', 'todos/todo42.md', todo('todo42'));
    build('admin', 'todos/todo43.md', todo('todo43'));
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const boards = () => [
    { label: '(root)', board: buildBoard(root) },
    { label: 'app', board: buildBoard(path.join(root, 'app')) },
    { label: 'admin', board: buildBoard(path.join(root, 'admin')) },
  ];

  it('resolves an address that names a real record in another tree', () => {
    const errs = crossTreeLint(boards()).flatMap(x => x.errs);
    expect(errs.join('\n')).not.toMatch(/app:todo42/);
  });

  it('fails an address pointing at a record that does not exist in the named tree', () => {
    const found = crossTreeLint(boards());
    expect(found).toHaveLength(1);
    expect(found[0].label).toBe('(root)');
    expect(found[0].errs[0]).toMatch(/admin:todo99.*does not exist in `admin`/);
  });

  it('fails an address naming a tree that does not exist at all', () => {
    build('(root)', 'todos/todo44.md', todo('todo44', '- Builds: 0001\n') + '\nblocked on billing:todo01.\n');
    const found = crossTreeLint(boards()).find(x => x.file.includes('todo44'));
    expect(found?.errs[0]).toMatch(/names docs tree `billing`, which does not exist/);
  });

  it('reads the SAME number in two trees as two different records, not a collision', () => {
    build('app', 'todos/todo50.md', todo('todo50'));
    build('admin', 'todos/todo50.md', todo('todo50'));
    // Both exist, neither is addressed from elsewhere: nothing to report.
    expect(crossTreeLint(boards()).flatMap(x => x.errs).join('\n')).not.toMatch(/todo50/);
  });
});

/**
 * Where a file SITS, as opposed to what is inside it. `walkDocs` skips README entirely and a
 * `conventions.md` in a service tree parses perfectly — so neither is reachable from the grammar.
 */
describe('tree shape', () => {
  let root: string;
  const w = (rel: string, body = '# doc\n') => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };

  beforeAll(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-shape-')); });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('fails a root-only file sitting in a service tree', () => {
    w('docs/conventions.md');
    w('docs/memory.md');
    const { errs } = treeShapeLint(root, false);
    expect(errs.map(e => e.file).sort()).toEqual(['conventions.md', 'memory.md']);
    expect(errs[0].errs[0]).toMatch(/ROOT-ONLY/);
  });

  it('allows the same files at the root tree', () => {
    expect(treeShapeLint(root, true).errs).toEqual([]);
  });

  it('fails a README anywhere in the tree', () => {
    w('docs/README.md');
    expect(treeShapeLint(root, true).errs[0].errs[0]).toMatch(/not part of the standard/);
  });

  it('warns rather than fails on a derived file inherited from before the standard', () => {
    rmSync(path.join(root, 'docs', 'README.md'));
    w('docs/progress.md');
    const { errs, warns } = treeShapeLint(root, true);
    expect(errs).toEqual([]);
    expect(warns[0].errs[0]).toMatch(/derived, not authored/);
  });
});

/**
 * Deferring is legal. Deferring your way to "done" is not finishing.
 *
 * A todo whose every task is `[>]` owes nothing, so it reads 100% and drops off the open board —
 * the same "0/0 means nothing to do" ambiguity the empty-phase rule refuses, reached through
 * deferral instead of prose. It must not close silently.
 */
describe('a todo that deferred everything', () => {
  let root: string;
  const w = (rel: string, body: string) => {
    const full = path.join(root, 'docs', rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };

  beforeAll(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-deferall-')); });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const warnsOf = (file: string) =>
    buildBoard(root).warns.filter(w => w.file === file).flatMap(w => w.errs).join('\n');

  it('warns when every task is deferred and none is complete', () => {
    w('todos/todo01.md',
      '# todo01 — all pushed\nStatus: done\n- Acceptance: nothing was built\n\n' +
      '## Phase 1 — p\n- [>] first — pushed\n- [>] second — also pushed\n');
    expect(warnsOf('todos/todo01.md')).toMatch(/this is a deferral, not a completion/);
  });

  it('does NOT warn when real work finished and only the remainder was deferred', () => {
    w('todos/todo02.md',
      '# todo02 — shipped most of it\nStatus: done\n- Acceptance: the port exists\n\n' +
      '## Phase 1 — p\n- [x] built the port\n- [>] the nice-to-have — pushed, low value\n');
    expect(warnsOf('todos/todo02.md')).not.toMatch(/deferral, not a completion/);
  });

  it('drops a `[-]` task from the arithmetic entirely, unlike a deferral', () => {
    w('todos/todo03.md',
      '# todo03 — one dropped\nStatus: doing\n- Acceptance: it works\n\n' +
      '## Phase 1 — p\n- [x] done it\n- [-] never doing this — decided against\n');
    const t = buildBoard(root).todos.find(x => x.id === 'todo03');
    expect(`${t.done}/${t.total}`).toBe('1/1');
    expect(t.deferred ?? 0).toBe(0);
  });
});

/**
 * `completed/` is not scanned. So a deferred task filed there is work nobody will ever be shown
 * again — a silent delete wearing a completion's clothes. Closing must not be the way deferred work
 * disappears.
 */
describe('closing a todo that still holds deferred work', () => {
  let root: string;
  const w = (rel: string, body: string) => {
    const full = path.join(root, 'docs', rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };

  beforeAll(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-closedefer-')); });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const warnsOf = (file: string) =>
    buildBoard(root).warns.filter(x => x.file === file).flatMap(x => x.errs).join('\n');

  it('warns that completed/ would bury the deferred tasks', () => {
    w('todos/todo01.md',
      '# todo01 — shipped, with a remainder\nStatus: done\n- Acceptance: the port exists\n\n' +
      '## Phase 1 — p\n- [x] built the port\n- [>] the overlay — needs a separate instrumented app\n');
    expect(warnsOf('todos/todo01.md')).toMatch(/completed\/` is not scanned, so closing this buries them/);
  });

  it('does not warn when the remainder was dropped rather than deferred', () => {
    w('todos/todo02.md',
      '# todo02 — shipped, remainder abandoned\nStatus: done\n- Acceptance: the port exists\n\n' +
      '## Phase 1 — p\n- [x] built the port\n- [-] the overlay — decided against, no target app\n');
    expect(warnsOf('todos/todo02.md')).not.toMatch(/buries them/);
  });
});

/**
 * A reference written in PROSE is followed exactly like a field, and until now nothing resolved one.
 *
 * ADR 0069 wrote "Carried by todo29#P3" before todo29 existed, and the gate passed. ADR 0060
 * pointed at `todo23#P5` after that phase had moved. Twice in two days, caught by a human both
 * times — which is the definition of a rule the tooling should own (todo29#P4, todo22#P4).
 */
describe('prose references resolve, or the gate fails', () => {
  let root: string;
  const w = (rel: string, body: string) => {
    const full = path.join(root, 'docs', rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };
  const adr2 = (id: string, title: string, prose: string) =>
    `# ${id} — ${title}\nStatus: Accepted\n- Date: 2026-07-31\n\n## Context\nc\n## Decision\nd\n## Consequences\n${prose}\n`;

  const errsOf = (file: string) =>
    buildBoard(root).lint.filter(x => x.file === file).flatMap(x => x.errs).join('\n');

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'conducks-prose-'));
    w('todos/todo01.md',
      '# todo01 — real work\nStatus: doing\n- Acceptance: green\n\n' +
      '## Phase 1 — p\n- [x] a\n\n## Phase 2 — q\n- [ ] b\n');
    // A CLOSED todo is still a legitimate address. `walkDocs` skips `completed/` because a closed
    // record is not linted, and resolving against open todos alone would fail every correct
    // reference to finished work.
    w('todos/completed/todo05.md',
      '# todo05 — finished work\nStatus: done\n- Acceptance: green\n\n## Phase 3 — p\n- [x] a\n');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('fails on a phase number nobody wrote — the ADR 0069 failure', () => {
    w('decisions/0010-invented.md', adr2('0010', 'invents a number', 'Carried by todo01#P9.'));
    expect(errsOf('decisions/0010-invented.md')).toMatch(/`todo01#P9`, which does not exist/);
  });

  it('fails on a phase whose todo does not exist at all', () => {
    w('decisions/0011-notodo.md', adr2('0011', 'names a missing todo', 'Carried by todo77#P1.'));
    expect(errsOf('decisions/0011-notodo.md')).toMatch(/`todo77#P1`, which does not exist/);
  });

  it('fails on an ADR number nobody wrote', () => {
    w('decisions/0012-badadr.md', adr2('0012', 'cites a missing ADR', 'This follows ADR 8888.'));
    expect(errsOf('decisions/0012-badadr.md')).toMatch(/`ADR 8888`, which does not exist/);
  });

  it('accepts a phase that exists, including one in a COMPLETED todo', () => {
    w('decisions/0013-good.md', adr2('0013', 'points at real records', 'See todo01#P2, todo05#P3 and ADR 0010.'));
    expect(errsOf('decisions/0013-good.md')).toBe('');
  });

  it('ignores a reference inside a fenced block — that is illustration, not an address', () => {
    w('decisions/0014-fenced.md', adr2('0014', 'shows an example', 'Write it like this:\n\n```\nCarried by todo01#P9\n```\n'));
    expect(errsOf('decisions/0014-fenced.md')).toBe('');
  });

  /**
   * A qualified address belongs to `crossTreeLint`, which knows what the other trees hold. Read here
   * as well, `app:todo42#P1` would also be tested as a same-tree `todo42#P1` and fail against THIS
   * tree's numbering — the exact confusion conducks-docs §4 exists to prevent.
   */
  it('leaves a cross-tree address alone rather than resolving it against this tree', () => {
    w('decisions/0015-crosstree.md', adr2('0015', 'addresses another tree', 'Carried by app:todo42#P1.'));
    expect(errsOf('decisions/0015-crosstree.md')).not.toMatch(/todo42#P1`, which does not exist/);
  });

  /**
   * The stated gap, pinned so it is a decision rather than a hole someone finds later. A bare
   * four-digit number is not an address: `0.05`, `1,500` and a byte count all appear in these docs,
   * and a rule that guessed which were ADR ids would fail the gate on measurements.
   */
  it('does NOT resolve a bare four-digit number — too ambiguous to check', () => {
    w('decisions/0016-bare.md', adr2('0016', 'writes a bare number', 'Superseded in spirit by 8888, and the cap is 1500.'));
    expect(errsOf('decisions/0016-bare.md')).toBe('');
  });
});
