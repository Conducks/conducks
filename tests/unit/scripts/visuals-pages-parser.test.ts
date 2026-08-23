/**
 * The parser/renderer for docs/visuals/index.md, problems.md, holding.md (ADR 0154, todo74#P2).
 *
 * Each case names the mutation that would break it, per the rule this repo already holds itself to:
 * a test that passes whichever way the code goes proves nothing.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePage, renderPage } from '../../../scripts/visuals/pages.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/visuals-pages');
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
const BASE = read('base.md');
const META = { src: 'base.md', titleSuffix: 'fixture', current: 'index.html' };

describe('parsePage — reads the grammar', () => {
  it('reads title, provenance and the sub line', () => {
    const parsed = parsePage(BASE);
    // Mutation this catches: reading the wrong line for the title, or treating "Provenance:" as
    // part of the sub instead of consuming it first, would make one of these wrong or undefined.
    expect(parsed.title).toBe('Fixture Page');
    expect(parsed.provenance).toMatch(/^authored/);
    expect(parsed.sub).toBe('A short sub line with a `code span` in it.');
  });

  it('renders a :::meta block as one div, with blank-line paragraphs joined by <br><br>', () => {
    const html = parsePage(BASE).blocksHtml;
    // Mutation this catches: emitting a separate <p> per paragraph instead of one <div class="meta">
    // with a <br><br> join — the join is what the original hand-written pages used.
    expect(html).toContain(
      '<div class="meta"><b>First paragraph.</b> With some prose.<br><br>' +
      '<b>Second paragraph.</b> Joined to the first with a line break, not a new tag.</div>');
  });

  it('renders a :::grid block as one card per "#### [text](href)", body text included', () => {
    const html = parsePage(BASE).blocksHtml;
    expect(html).toContain('<div class="grid"><div class="card"><h4><a href="one.html">Card one</a></h4>');
    expect(html).toContain('<p>Body text for card one.</p>');
    // Mutation this catches: not joining a card's wrapped body lines into one paragraph would leave
    // "Second line of the same paragraph." as its own untagged fragment instead of inside the <p>.
    expect(html).toContain('<p>Body text for card two. Second line of the same paragraph.</p>');
  });

  it('renders :::elsewhere as a <p class="elsewhere">, not a <div>', () => {
    const html = parsePage(BASE).blocksHtml;
    expect(html).toContain(
      '<p class="elsewhere">A side note — with an em-dash in it, but no Pass-style clause.</p>');
  });

  it('renders a table with the first row as <thead>, the "---" row consumed, the rest as <tbody>', () => {
    const html = parsePage(BASE).blocksHtml;
    expect(html).toContain('<thead><tr><th>left header</th><th>right header</th></tr></thead>');
    // Mutation this catches: treating the separator row as data would produce a spurious <tr> full
    // of dashes between the header and the first real row.
    expect(html).toContain(
      '<tbody>\n<tr><td>row one, left</td><td>row one, right</td></tr>');
    expect(html).toContain('<td>row two, <b>bold</b> and <code>code</code></td>');
  });

  it('renders :::footer with no wrapping <p>', () => {
    const html = parsePage(BASE).blocksHtml;
    expect(html).toContain('<footer>Footer text with a <code>code span</code> and no wrapping paragraph tag.</footer>');
  });

  it('refuses a table with no "---" separator row', () => {
    // Mutation this catches: a renderer that treats row 2 as the separator whatever it contains
    // would silently swallow "row one, left" as formatting instead of as data.
    expect(() => parsePage(read('bad-table.md')).blocksHtml).toThrow(/separator row/);
  });

  it('refuses a fenced block with no closing ":::"', () => {
    // Mutation this catches: a parser that stops at end-of-file with no error would silently drop
    // whatever content was meant to follow the unclosed block, with no signal to the author.
    expect(() => parsePage(read('unclosed-fence.md')).blocksHtml).toThrow(/never closed/);
  });
});

describe('renderPage — the render carries the DERIVED marker and is reproducible', () => {
  it('renders the same bytes twice for the same source (drift-gate requirement)', () => {
    expect(renderPage(BASE, META)).toBe(renderPage(BASE, META));
  });

  it('carries "DERIVED — ... edit the .md" naming the given src (ADR 0011)', () => {
    expect(renderPage(BASE, META)).toMatch(/DERIVED.*rendered from <code>base\.md<\/code>.*edit the \.md/s);
  });

  it('links system.css rather than shipping a private <style> block', () => {
    const html = renderPage(BASE, META);
    expect(html).toMatch(/<link rel="stylesheet" href="system\.css">/);
    expect(html).not.toMatch(/<style/);
  });

  it('marks the current page "here" in the nav and no other page', () => {
    const html = renderPage(BASE, META);
    // Mutation this catches: a nav renderer that marks every item, or the wrong item, "here".
    expect(html).toMatch(/<a href="index\.html" class="here">/);
    expect(html).not.toMatch(/<a href="problems\.html" class="here">/);
    expect(html).not.toMatch(/<a href="holding\.html" class="here">/);
    expect(html).not.toMatch(/<a href="architecture\.html" class="here">/);
  });

  it('puts the source Provenance line in a footer.readlog, not back in an HTML comment', () => {
    const html = renderPage(BASE, META);
    expect(html).toContain(
      '<footer class="readlog">authored — exercises every construct of the pages.md grammar (todo74#P2).</footer>');
    expect(html).not.toMatch(/<!--\s*Provenance/);
  });
});
