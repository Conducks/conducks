import { describe, it, expect } from '@jest/globals';
import { inferType, parseBody, shape, lint, readStatus, readRelations } from '@/lib/domain/analysis/docs-grammar.js';
import { crossCheckDecisions } from '@/lib/domain/analysis/docs-board.js';

// Gate 2 (conducks-docs): the parser must classify EVERY file/folder the standard defines —
// no part of the format reads as "unknown". "unknown" is reserved for files not in the standard.
describe('docs-grammar — full-format classification', () => {
  it('classifies handover.md as a governed record', () => {
    expect(inferType('docs/handover.md')).toBe('handover');
  });

  it('classifies any non-governed doc as soft prose — no whitelist, never unknown', () => {
    for (const fp of [
      'docs/product/x.md', 'docs/business/x.md', 'docs/design/x.md', 'docs/process/x.md',
      'docs/parity-audit/x.md', 'docs/hypothesis/x.md', 'docs/research/x.md',
      'docs/README.md', 'docs/business_plan.md', 'docs/coverage.md',
    ]) {
      expect(inferType(fp)).toBe('prose');
    }
  });

  it('classifies architecture as AUTHORED (file OR folder OR MODULE.md), not derived — ADR 0015', () => {
    expect(inferType('docs/architecture.md')).toBe('architecture');            // overview file
    expect(inferType('docs/architecture/auth.md')).toBe('architecture');       // per-subsystem detail
    expect(inferType('docs/architecture/electron/MODULE.md')).toBe('architecture');
    expect(inferType('app/docs/architecture/kernel.MODULE.md')).toBe('architecture');
  });

  it('keeps map/drift/progress as derived — query it, never author it', () => {
    expect(inferType('docs/map.md')).toBe('derived');
    expect(inferType('docs/drift.md')).toBe('derived');
    // ADR 0024: what shipped is already carried by dated ADRs and closed todos, so a progress file
    // is a third copy. Existing ones classify as derived — never governed, never linted, never read.
    expect(inferType('docs/progress.md')).toBe('derived');
  });

  it('still classifies the governed types', () => {
    expect(inferType('docs/todos/todo01.md')).toBe('todo');
    expect(inferType('docs/decisions/0001-x.md')).toBe('decision');
    expect(inferType('docs/features.md')).toBe('features');
    expect(inferType('docs/memory.md')).toBe('memory');
    expect(inferType('docs/conventions.md')).toBe('conventions');
    expect(inferType('docs/handover.md')).toBe('handover');
  });

  it('lints handover for a missing Status and shapes it when present', () => {
    expect(lint('handover', parseBody('# Handover — 2026-07-18\n'))).toContain('missing `Status:` (current | stale)');
    const shaped = shape('handover', parseBody('# Handover — 2026-07-18\nStatus: current\n\n## Where it stands\n'), 'docs/handover.md');
    expect(shaped.status).toBe('current');
    expect(shaped.sections).toContain('Where it stands');
  });
});

// The grammar is LINE-ATOMIC: the value is the whole line after its marker, never split on
// whitespace, and never continued onto a second line.
describe('docs-grammar — line-atomic values', () => {
  const ADR = (status: string) => `# 0003 — x\nStatus: ${status}\n- Date: 2026-07-17\n\n## Context\nc\n## Decision\nd\n## Consequences\nq\n`;

  it('keeps the whole status line and derives state + refs from it', () => {
    expect(readStatus('Amended by 0016, 0017')).toEqual({
      status: 'Amended by 0016, 0017', state: 'Amended', statusRefs: ['0016', '0017'],
    });
    expect(readStatus('Accepted')).toEqual({ status: 'Accepted', state: 'Accepted', statusRefs: [] });
    expect(readStatus(null)).toEqual({ status: null, state: null, statusRefs: [] });
  });

  it('does not truncate a superseded ADR to its first word — the ref survives', () => {
    const d = shape('decision', parseBody(ADR('Superseded by 0012')), 'decisions/0003-x.md');
    expect(d.status).toBe('Superseded by 0012');   // whole line, not "Superseded"
    expect(d.state).toBe('Superseded');
    expect(d.statusRefs).toEqual(['0012']);
  });

  it('flags a value wrapped onto the next line — it would otherwise be dropped in silence', () => {
    const wrapped = '# 0003 — x\nStatus: Amended by 0012 — a reason that runs on\nand wraps here.\n- Date: 2026-07-17\n\n## Context\nc\n## Decision\nd\n## Consequences\nq\n';
    const errs = lint('decision', parseBody(wrapped), wrapped);
    expect(errs.some(e => e.startsWith('value wrapped'))).toBe(true);
    // …and a well-formed file stays clean (no false positive on ordinary prose)
    expect(lint('decision', parseBody(ADR('Accepted')), ADR('Accepted'))).toEqual([]);
  });

  it('rejects a status value outside its type vocabulary', () => {
    expect(lint('decision', parseBody(ADR('banana')), ADR('banana')).join()).toContain('not a valid decision status');
    // Amendment is a relation, not a life state — it belongs in a field, so Status must reject it.
    expect(lint('decision', parseBody(ADR('Amended by 0012')), ADR('Amended by 0012')).join()).toContain('not a valid decision status');
    expect(lint('decision', parseBody(ADR('Superseded by 0009')), ADR('Superseded by 0009'))).toEqual([]);
    const todo = (s: string) => `# todo01 — x\nStatus: ${s}\n- Acceptance: it works\n\n## Phase 1 — p\n- [x] a\n`;
    expect(lint('todo', parseBody(todo('doing')), todo('doing'))).toEqual([]);
    expect(lint('todo', parseBody(todo('in progress')), todo('in progress')).join()).toContain('not a valid todo status');
  });

  it('ignores primitives inside a fenced block — a ``` sample is illustration, not grammar', () => {
    const body = parseBody('# x\n\n## Real\n```markdown\n## Fake\nStatus: done\n- [ ] fake task\n```\n');
    expect(body.sections.map(s => s.head)).toEqual(['Real']);
    expect(body.status).toBeNull();
  });

  it('reads cross-ADR relations from the fields, and leaves an amended record binding', () => {
    const src = '# 0010 — x\nStatus: Accepted\n- Amended by: 0016, 0017 (both rescoped it — note the 9999 in this prose)\n- Date: 2026-07-18\n\n## Context\nc\n## Decision\nd\n## Consequences\nq\n';
    const d = shape('decision', parseBody(src), 'decisions/0010-x.md');
    expect(d.amendedBy).toEqual(['0016', '0017']);   // the trailing prose is not harvested for refs
    expect(d.id).toBe('0010');
    expect(d.status).toBe('Accepted');               // amended ≠ dead: still binding
    expect(d.state).toBe('Amended');                 // …but grouped apart on the board
    expect(readRelations({ 'Promoted': 'docs/memory.md (see 1234)' }).amends).toEqual([]);
  });

  it('fails a one-way or dangling ADR stamp — the drift an index used to hide', () => {
    const adr = (id: string, fields: Record<string, string>) =>
      shape('decision', { title: `${id} — x`, status: 'Accepted', fields, sections: [] }, `decisions/${id}-x.md`);

    expect(crossCheckDecisions([adr('0001', { 'Amended by': '0002' }), adr('0002', {})])[0].errs[0])
      .toContain('ADR 0002 needs `- Amends: 0001`');
    expect(crossCheckDecisions([adr('0003', { 'Supersedes': '0099' })])[0].errs[0])
      .toContain('does not exist');
    // Stamped at both ends → clean.
    expect(crossCheckDecisions([adr('0001', { 'Amended by': '0002' }), adr('0002', { 'Amends': '0001' })])).toEqual([]);
  });

  it('surfaces the live phase and the next open task, not just the total %', () => {
    const src = '# todo01 — x\nStatus: doing\n\n## Phase 1 — done bit\n- [x] a\n\n## Phase 2 — live bit\n- [x] b\n- [ ] the next thing\n';
    const t = shape('todo', parseBody(src), 'todos/todo01.md');
    expect(t.overallPct).toBe(67);
    expect(t.activePhase).toBe('Phase 2 — live bit');
    expect(t.nextTask).toBe('the next thing');
  });
});

/**
 * A phase with no checkboxes cannot report progress: the checkbox IS the task's state, so the board can
 * only print `0/0 → (no open task)`. That reads as "nothing to do" whether the phase is finished, not
 * started, or written as prose — three different facts collapsed into one silent, wrong answer.
 *
 * Found on mentorseed, where three todos marked phases done with `[✅ DONE 2026-07-18]` in the heading
 * and carried no tasks at all. Lint passed; the board showed 0/0 for 23 phases.
 */
describe('docs-grammar — a phase must carry tasks', () => {
  const todo = (phases: string) =>
    `# todo01 — a thing\n\nStatus: doing\n- Acceptance: it works\n\n${phases}`;

  const lintTodo = (body: string) => lint('todo', parseBody(body), body);

  it('fails a phase with no checkboxes', () => {
    const errs = lintTodo(todo('## Phase 1 — do it\nSome prose about what happened.\n'));
    expect(errs.join(' ')).toMatch(/`## Phase 1` has no tasks/);
  });

  it('names the `[✅ DONE]` marker when that is what replaced the tasks', () => {
    const errs = lintTodo(todo('## Phase 1 — do it `[✅ DONE 2026-07-18]`\nShipped via the hook.\n'));
    const joined = errs.join(' ');
    expect(joined).toMatch(/has no tasks/);
    expect(joined).toMatch(/marker in the heading is not a task/);
  });

  it('accepts a phase whose tasks are all done — ticked boxes, not a heading marker', () => {
    const errs = lintTodo(todo('## Phase 1 — do it\n- [x] shipped the hook\n- [x] gate green\n'));
    expect(errs.join(' ')).not.toMatch(/has no tasks/);
  });

  it('accepts a phase carrying a field alongside its tasks', () => {
    const errs = lintTodo(todo('## Phase 1 — do it\n- Builds: 0001\n- [ ] the open task\n'));
    expect(errs.join(' ')).not.toMatch(/has no tasks/);
  });

  it('reports every empty phase, not just the first', () => {
    const errs = lintTodo(todo('## Phase 1 — a\nprose\n\n## Phase 2 — b\nprose\n\n## Phase 3 — c\n- [ ] real\n'));
    const empties = errs.filter(e => /has no tasks/.test(e));
    expect(empties).toHaveLength(2);
    expect(errs.join(' ')).toMatch(/Phase 1/);
    expect(errs.join(' ')).toMatch(/Phase 2/);
    expect(errs.join(' ')).not.toMatch(/`## Phase 3` has no tasks/);
  });
});

/**
 * `- Depends:` is same-tree only (conducks-docs §6). Cross-service coupling goes through a root epic
 * and nowhere else: an inline cross-tree dep is invisible from the other tree, so that side ships
 * without knowing it was depended on. It also parses as nothing, so it reads as NO dependency at all.
 */
describe('- Depends: does not cross a docs tree', () => {
  const todo = (dep: string) =>
    `# todo01 — a thing\nStatus: doing\n- Acceptance: it works\n\n## Phase 1 — p\n- [x] done\n\n## Phase 2 — q\n- Depends: ${dep}\n- [ ] blocked\n`;

  it('accepts a bare same-tree address', () => {
    expect(lint('todo', parseBody(todo('todo01#P1')))).toEqual([]);
  });

  it('fails a service-qualified address', () => {
    expect(lint('todo', parseBody(todo('app:todo42#P1'))).join('\n')).toMatch(/crosses a docs tree/);
  });

  it('fails a root-qualified address', () => {
    expect(lint('todo', parseBody(todo('(root):todo41#P1'))).join('\n')).toMatch(/crosses a docs tree/);
  });

  it('names the root epic as the way to express the coupling instead', () => {
    expect(lint('todo', parseBody(todo('admin:todo43#P2'))).join('\n')).toMatch(/root epic that lists both slices/);
  });
});

/** `modules/` replaced `architecture/modules/`; both still classify as authored architecture. */
describe('module notes classify as architecture', () => {
  it('classifies a note under the new modules/ path', () => {
    expect(inferType('docs/modules/core/parsing/MODULE.md')).toBe('architecture');
  });

  it('still classifies a note under the legacy architecture/ path', () => {
    expect(inferType('docs/architecture/modules/core/MODULE.md')).toBe('architecture');
  });

  it('classifies the graph file itself', () => {
    expect(inferType('app/docs/architecture.md')).toBe('architecture');
  });
});
