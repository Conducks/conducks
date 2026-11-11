/**
 * The Mirror page is three static files with no build step, so nothing compiles them against each
 * other: an id the script reaches for and the page does not have fails silently in a browser nobody
 * is watching. This census is the compiler. Rewritten for the single-stage page (todo82#P13).
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('src/interfaces/web/mirror/public');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const defined = (c: string) => new RegExp(`\\.${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,:.{]`).test(css);

describe('the mirror page and its script agree', () => {
  it('every id the script reaches for exists in the page', () => {
    const wanted = [...new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]))];
    const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    expect(wanted.length).toBeGreaterThan(6); // a census over zero ids is not a pass (ADR 0044)
    expect(wanted.filter(id => !htmlIds.has(id))).toEqual([]);
  });

  it('every class in the markup and every class the script sets is defined in the stylesheet', () => {
    const inHtml = [...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/));
    // Quoted and template class strings alike; a template's `${...}` part is a risk step, checked below.
    const inJs = [...js.matchAll(/el\('[a-z0-9]+',\s*['`]([^'`]+)['`]/g)]
      .flatMap(m => m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)).filter(c => !c.endsWith('-'))
      .concat([...js.matchAll(/classList\.add\('([^']+)'\)/g)].map(m => m[1]));
    const used = [...new Set([...inHtml, ...inJs].filter(Boolean))];
    expect(used.length).toBeGreaterThan(40);
    expect(used.filter(c => !defined(c))).toEqual([]);
  });

  it('the three statuses and the diagram classes exist, since the script sets them as attributes', () => {
    for (const c of ['ok', 'warn', 'bad', 'm-box', 'm-node', 'm-edge', 'm-flow', 'm-name', 'm-meta', 'm-size', 'm-badge', 'm-badge-text', 'hub', 'sel', 'hit', 'step', 'dim', 'wrong', 'test', 'leaf', 'port', 'm-cap', 'm-more', 'm-go', 'm-start', 'm-start-box', 'm-start-text', 'm-port', 'm-port-box', 'm-port-text']) expect(defined(c)).toBe(true);
  });

  it('the page loads no external resource and no library: it must render with no network (ADR 0027)', () => {
    const loaded = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
    expect(loaded.sort()).toEqual(['app.js', 'logo.png', 'styles.css']);
    for (const f of loaded) expect(fs.existsSync(path.join(DIR, f))).toBe(true);
    expect(/https?:\/\//.test(js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''))).toBe(false);
  });

  it('every endpoint the script calls is a route the server defines', () => {
    const server = fs.readFileSync(path.resolve('src/interfaces/web/mirror/server.ts'), 'utf8');
    const called = [...new Set([...js.matchAll(/'(\/api\/[a-z]+)/g)].map(m => m[1]))];
    expect(called.length).toBeGreaterThan(4);
    expect(called.filter(route => !server.includes(`'${route}'`))).toEqual([]);
  });
});
