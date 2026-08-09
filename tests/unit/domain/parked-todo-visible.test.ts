/**
 * A todo that is deliberately PARKED was invisible on every surface.
 *
 * `todo31` says `Status: todo`, has zero unchecked tasks (every one is `[x]` or `[-]`) and carries
 * three `[>]` reopen-triggers. It is telling the truth: the work is deferred with named conditions,
 * not finished. But `agentView`'s `unlinkedWork` keeps only todos with at least one OPEN phase, so it
 * dropped the record entirely — and the "`Status: todo` but every task is closed" hygiene warning
 * correctly exempts deferred records, so nothing warned either.
 *
 * The result is the exact failure the board exists to prevent, and the one todo53's own context
 * complains about: a file that says "todo" and appears nowhere. Recorded twice during 2026-08-09 and
 * fixed here rather than a third time.
 *
 * A parked record is not open work and must not be listed as such — it gets its own line, so the
 * board can say "this exists and is waiting on a trigger" without inflating the open count.
 */
import { describe, it, expect } from '@jest/globals';
import { agentView } from '@/lib/domain/analysis/docs-board.js';

const board = (todos: any[]) => ({
  todos, decisions: [], other: [], lint: [], warns: [], unlinked: [], crossRefs: [],
} as any);

const parkedTodo = {
  id: 'todo31', title: 'move language queries out of template literals', file: 'docs/todos/todo31.md',
  state: 'todo', deferred: 3,
  phases: [{ addr: 'todo31#P0', state: 'done', done: 3, total: 3, builds: [], blockedBy: [], next: null }],
};

const openTodo = {
  id: 'todo99', title: 'real open work', file: 'docs/todos/todo99.md',
  state: 'todo', deferred: 0,
  phases: [{ addr: 'todo99#P1', state: 'todo', done: 0, total: 2, builds: [], blockedBy: [], next: 'do the thing' }],
};

describe('a parked todo is stated, not hidden', () => {
  it('lists a deferred-but-not-done todo under parked', () => {
    const view: any = agentView(board([parkedTodo]), 'board', 0);
    expect(view.parked).toHaveLength(1);
    expect(view.parked[0]).toMatchObject({ todo: 'todo31', file: 'docs/todos/todo31.md' });
  });

  it('does NOT count it as open work', () => {
    const view: any = agentView(board([parkedTodo]), 'board', 0);
    expect(view.unlinkedWork).toHaveLength(0);
  });

  it('still lists genuinely open work as open, and not as parked', () => {
    const view: any = agentView(board([openTodo]), 'board', 0);
    expect(view.unlinkedWork).toHaveLength(1);
    expect(view.parked ?? []).toHaveLength(0);
  });

  it('omits a finished todo from both', () => {
    const done = { ...parkedTodo, id: 'todo01', state: 'done' };
    const view: any = agentView(board([done]), 'board', 0);
    expect(view.unlinkedWork).toHaveLength(0);
    expect(view.parked ?? []).toHaveLength(0);
  });
});
