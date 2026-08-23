/**
 * The parser for docs/visuals/testing.md (ADR 0154, todo74#P1). This is the load-bearing suite:
 * `tests/fixtures/visuals-testing/*.md` is the SAME fixture a second, Rust reader (todo74#P3) will
 * be tested against, so "one owner of the grammar" is something this test checks rather than a
 * claim in a decision record.
 *
 * Each case names the mutation that would break it, per the rule this repo already holds itself to:
 * a test that passes whichever way the code goes proves nothing.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTesting, detectRenumbering, taskMap, renderTesting } from '../../../scripts/visuals/testing.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/visuals-testing');
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
const BASE = read('base.md');

describe('parseTesting — reads the grammar', () => {
  it('reads title, provenance, sections, features and tasks', () => {
    const parsed = parseTesting(BASE);
    // Mutation this catches: swap the title regex to read the wrong line, or drop the
    // Provenance scan before the first `## ` — either makes one of these three undefined.
    expect(parsed.title).toBe('Testing — Fixture Repo');
    expect(parsed.provenance).toMatch(/^authored/);
    expect(parsed.sections.map(s => s.title)).toEqual(['The window', 'Anything else']);
  });

  it('reads a section blurb only when the line right after the heading is plain prose', () => {
    const parsed = parseTesting(BASE);
    // Mutation this catches: treating the line after `## Anything else` (which is blank, then a
    // `### `) as a blurb would either crash or wrongly attach "### F3 ..." as blurb text.
    expect(parsed.sections[0].blurb).toBe('chrome that has to earn its pixels');
    expect(parsed.sections[1].blurb).toBe('');
  });

  it('reads How and Note as fields, and tolerates a feature with no Note', () => {
    const parsed = parseTesting(BASE);
    const f1 = parsed.sections[0].features[0];
    const f2 = parsed.sections[0].features[1];
    expect(f1.how).toBe('One row, full window width.');
    expect(f1.note).toBe('A known gap, carried on purpose so the parser is proven to read it.');
    // Mutation this catches: defaulting a missing field to the PREVIOUS feature's note (a
    // classic off-by-one in a line-by-line parser) rather than the empty string.
    expect(f2.note).toBe('');
  });

  it('splits a task on " — Pass: " only when the source actually wrote one', () => {
    const parsed = parseTesting(BASE);
    const [t1, t2] = parsed.sections[0].features[0].tasks;
    expect(t1.text).toBe('The row runs edge to edge.');
    expect(t1.pass).toBe('no gap on either side, at any window width.');
    expect(t2.pass).toBeNull();
  });

  it('does not mistake a bare em-dash in task text for a Pass clause', () => {
    const parsed = parseTesting(BASE);
    const f3 = parsed.sections[1].features[0];
    // "Overall feel — does anything look wrong..." contains an em-dash with no "Pass:" after it.
    // Mutation this catches: splitting on any " — " instead of the literal " — Pass: " token would
    // truncate this task's text and invent a false pass condition out of its second half.
    expect(f3.tasks[0].text).toContain('Overall feel — does anything look wrong');
    expect(f3.tasks[0].pass).toBeNull();
  });

  it('assigns every task a globally unique, stable id', () => {
    const parsed = parseTesting(BASE);
    const ids = parsed.sections.flatMap(s => s.features.flatMap(f => f.tasks.map(t => t.id)));
    expect(ids).toEqual(['F1.T1', 'F1.T2', 'F2.T1', 'F3.T1', 'F3.T2']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses a duplicate task id rather than silently keeping the last one', () => {
    // Mutation this catches: a parser that overwrites `seenIds` instead of checking it first would
    // read this fixture with no error and report only one F1.T1 — two different questions folded
    // into one, invisibly.
    expect(() => parseTesting(read('duplicate-id.md'))).toThrow(/duplicate task id F1\.T1/);
  });
});

describe('detectRenumbering — the append-not-renumber check (conducks-visuals §0 rule 3)', () => {
  it('flags a task whose text moved to a different id (a shift)', () => {
    const before = taskMap(parseTesting(BASE));
    const after = taskMap(parseTesting(read('renumbered.md')));
    const violations = detectRenumbering(before, after);
    // F1.T1 and F1.T2's text swapped between the two fixtures — both directions must be caught,
    // or a renumber that merely reorders (rather than drops one) slips through half-checked.
    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'F1.T1', movedFrom: ['F1.T2'] }),
      expect.objectContaining({ id: 'F1.T2', movedFrom: ['F1.T1'] }),
    ]));
    expect(violations).toHaveLength(2);
  });

  it('does NOT flag an appended task, or a same-id wording fix — the counter-test', () => {
    const before = taskMap(parseTesting(BASE));
    const appended = new Map(before);
    appended.set('F3.T3', 'A brand new task appended after the highest existing id.');
    appended.set('F1.T1', 'The row runs edge to edge, reworded for clarity.'); // same id, new wording
    // Mutation this catches: a detector broad enough to flag every changed line (rather than only
    // a text that MOVED to a different id) would fail on ordinary editing and get switched off.
    expect(detectRenumbering(before, appended)).toEqual([]);
  });
});

describe('renderTesting — the render carries the DERIVED marker and is reproducible', () => {
  it('renders the same bytes twice for the same source (drift-gate requirement)', () => {
    // Mutation this catches: anything non-deterministic in the renderer (Date.now(), object key
    // order, a git hash) — the drift gate re-runs the generator and diffs bytes against what was
    // committed, so a renderer that is not idempotent fails every commit, not just a real edit.
    expect(renderTesting(BASE)).toBe(renderTesting(BASE));
  });

  it('carries "DERIVED — edit testing.md" in the page\'s own text (ADR 0011)', () => {
    expect(renderTesting(BASE)).toMatch(/DERIVED.*edit the \.md/s);
  });

  it('links system.css rather than shipping a private <style> block', () => {
    const html = renderTesting(BASE);
    // Mutation this catches: adding an inline <style> block (the exact failure conducks-visuals §0
    // names for a testing page, since it is mostly form controls) rather than the shared stylesheet.
    expect(html).toMatch(/<link rel="stylesheet" href="system\.css">/);
    expect(html).not.toMatch(/<style/);
  });

  it('renders every task from every feature, in order', () => {
    const html = renderTesting(BASE);
    for (const id of ['F1.T1', 'F1.T2', 'F2.T1', 'F3.T1', 'F3.T2']) {
      expect(html).toContain(`data-tid="${id}"`);
    }
  });

  // The large fixture is a FROZEN SNAPSHOT of a real 622-line testing source.
  // The Rust reader in plugins/checklist asserts these same three numbers
  // against these same bytes, which is the whole mechanism that keeps two
  // readers of one grammar honest — see ADR 0154.
  //
  // It exists because the small fixture cannot catch what scale catches: a
  // heading rule that is slightly too loose parses a short document correctly
  // and miscounts a long one. Both readers previously checked a large document
  // separately or not at all; now they check the same one.
  it('agrees with the Rust reader on the large shared fixture', () => {
    const md = readFileSync(join(FIXTURES, 'large.md'), 'utf8');
    const parsed = parseTesting(md);
    const features = parsed.sections.reduce((n, s) => n + s.features.length, 0);
    const tasks = parsed.sections.reduce(
      (n, s) => n + s.features.reduce((m, f) => m + f.tasks.length, 0), 0);
    expect(parsed.sections.length).toBe(8);
    expect(features).toBe(54);
    expect(tasks).toBe(405);
  });
});
