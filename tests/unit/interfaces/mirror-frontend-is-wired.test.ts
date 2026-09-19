import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The mirror's renderer is 77% of the mirror and had no test of any kind.
 *
 * Three controls shipped dead and nobody noticed, because a dead control in this
 * codebase is SILENT: `document.getElementById('ctrl-gravity')` returns null, the
 * handler returns early, and the page renders. Measured on 2026-09-05 — a gravity
 * slider and a reset-physics button both bound to elements that were not in the
 * markup, and a Settings button in the markup with no handler and no panel, so
 * clicking it did nothing at all.
 *
 * Checked statically. Booting a browser to assert an id exists would test the
 * harness; the rule is a text one — every id the script reaches must be in the
 * page, and every class it sets must be in the stylesheet.
 *
 * What this does NOT cover, deliberately: whether a handler does the right thing,
 * whether the graph draws, or whether a style is the intended one. It covers the
 * class of defect that shipped, and says so rather than implying more.
 */
const DIR = path.resolve('src/interfaces/web/mirror/public');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'styles.css'), 'utf8');
const js = ['ui.js', 'resonance.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
/** Ids the scripts CREATE at runtime are not expected in the markup. */
const madeInJs = new Set([...js.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m => m[1]));
const wanted = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);

describe('the mirror page and its scripts agree', () => {
  it('found something to check — a census over zero ids is not a pass (ADR 0044)', () => {
    expect(wanted.length).toBeGreaterThan(15);
    expect(htmlIds.size).toBeGreaterThan(15);
  });

  it('every id the scripts reach for exists in the page, or is created by them', () => {
    const missing = [...new Set(wanted)].filter(id => !htmlIds.has(id) && !madeInJs.has(id));
    expect(missing).toEqual([]);
  });

  it('every class the scripts set is defined in the stylesheet', () => {
    // Only literal class names assigned via className — a computed one cannot be checked here.
    const set = [...js.matchAll(/className\s*=\s*'([^']+)'/g)]
      .flatMap(m => m[1].split(/\s+/))
      .filter(Boolean);
    const undefinedClasses = [...new Set(set)].filter(c => !new RegExp(`\\.${c}[\\s,:.{]`).test(css));
    expect(undefinedClasses).toEqual([]);
  });

  /**
   * The markup half of the same rule, and the half that mattered most. `index.html`
   * was written against Tailwind utilities and Tailwind was never loaded, so 41
   * classes were inert — the inspector's entire type hierarchy, the status bar, and
   * the loading overlay, which therefore rendered as a line of text at the top of
   * the page instead of covering it. Nothing failed; it just quietly looked wrong.
   */
  it('every class in the markup is defined in the stylesheet', () => {
    const used = [...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean);
    expect(used.length).toBeGreaterThan(20);
    const undefinedClasses = [...new Set(used)].filter(
      c => !new RegExp(`\\.${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,:.{]`).test(css));
    expect(undefinedClasses).toEqual([]);
  });

  /**
   * The layer ramp lives twice and must not drift.
   *
   * The nine layers are ordinal, so their colours are a SCALE — `--layer-0..8` in the
   * stylesheet for the sidebar legend, and the same nine on `MirrorState.layers` for
   * the nodes the graph draws. Two copies of one fact is how this repository has been
   * bitten before (ADR 0079, the clustering rule); here a drift would make the legend
   * and the graph disagree about what a colour means, and neither would look broken.
   */
  it('the layer ramp in the stylesheet and in the graph are the same nine colours', () => {
    const fromCss = [...css.matchAll(/--layer-([0-8]):\s*(#[0-9a-f]{6})/g)]
      .sort((a, b) => Number(a[1]) - Number(b[1])).map(m => m[2]);
    const fromJs = [...js.matchAll(/\{\s*id:\s*([0-8]),[^}]*color:\s*'(#[0-9a-f]{6})'/g)]
      .sort((a, b) => Number(a[1]) - Number(b[1])).map(m => m[2]);
    expect(fromCss).toHaveLength(9);
    expect(fromJs).toHaveLength(9);
    expect(fromJs).toEqual(fromCss);
  });

  it('the page loads no external resource — it must render with no network (ADR 0027)', () => {
    const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
    expect(external).toEqual([]);
  });

  /**
   * The wave's own honesty fields. `getVisualWave` returns `truncated` and
   * `totalNodes` because ADR 0054 decided a capped picture must not pass for a
   * whole one — and the browser discarded both, so the only notice was a
   * `logger.info` in the terminal nobody watching the dashboard can see. Measured
   * 2026-09-05 on this repository: 1,500 nodes drawn of 4,561 eligible, with
   * nothing on screen saying so.
   *
   * This asserts the renderer still READS them. It cannot assert the reader
   * understood what was shown.
   */
  it('the renderer reads the truncation the server reports (ADR 0054)', () => {
    // Comments stripped first. The first version of this test asked whether the
    // WORD appeared anywhere in the scripts, and passed against a build with the
    // whole readout deleted — the explanatory comment above it still said
    // "truncated". A test that a comment can satisfy is not a test.
    const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const field of ['truncated', 'totalNodes']) {
      expect(new RegExp(`\\.${field}\\b`).test(code)).toBe(true);
    }
  });

  it('every cross-file call into the other script resolves to a declaration there', () => {
    const ui = fs.readFileSync(path.join(DIR, 'ui.js'), 'utf8');
    const res = fs.readFileSync(path.join(DIR, 'resonance.js'), 'utf8');
    const called = [...new Set([...ui.matchAll(/window\.([a-zA-Z]\w*)\s*\(/g)].map(m => m[1]))];
    expect(called.length).toBeGreaterThan(3);
    const unresolved = called.filter(n =>
      !new RegExp(`^(?:async )?function ${n}\\b`, 'm').test(res) &&
      !new RegExp(`^window\\.${n}\\s*=`, 'm').test(res));
    expect(unresolved).toEqual([]);
  });
});
