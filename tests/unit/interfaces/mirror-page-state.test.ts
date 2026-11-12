/**
 * The mirror page's own state (state-machine audit, 2026-11-12, P-10-15 … P-10-20).
 *
 * The page is plain browser JavaScript with no build step, so it is run here as it is shipped — in a
 * VM context over a small fake DOM and a fake `fetch` whose answers and delays each test controls.
 * Top-level `let` bindings of a classic script are shared by every script run in the same context,
 * which is how a test reads `D`, `scopes` and `detail` and calls the page's own functions.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

class FakeEl {
  children: Array<FakeEl | string> = [];
  attrs: Record<string, string> = {};
  listeners: Record<string, Array<(e: any) => void>> = {};
  className = ''; hidden = false; title = ''; value = ''; scrollTop = 0; style: Record<string, string> = {};
  clientWidth = 1200; clientHeight = 800;
  onclick: any = null; onmouseenter: any = null; onmouseleave: any = null;
  private ownText: string | null = null;
  constructor(public tag: string, public id = '') {}
  get classList() {
    const self = this;
    const set = () => new Set(self.className.split(/\s+/).filter(Boolean));
    return {
      add: (...c: string[]) => { const s = set(); c.forEach(x => s.add(x)); self.className = [...s].join(' '); },
      remove: (...c: string[]) => { const s = set(); c.forEach(x => s.delete(x)); self.className = [...s].join(' '); },
      contains: (c: string) => set().has(c),
      toggle: (c: string, on?: boolean) => { const s = set(); (on ?? !s.has(c)) ? s.add(c) : s.delete(c); self.className = [...s].join(' '); },
    };
  }
  set textContent(t: string) { this.children = []; this.ownText = String(t); }
  get textContent(): string { return (this.ownText ?? '') + this.children.map(c => typeof c === 'string' ? c : c.textContent).join(''); }
  append(...n: Array<FakeEl | string>) { this.children.push(...n.filter(x => x !== undefined && x !== null)); }
  appendChild(n: FakeEl) { this.children.push(n); return n; }
  prepend(...n: Array<FakeEl | string>) { this.children.unshift(...n); }
  insertBefore(n: FakeEl) { this.children.unshift(n); return n; }
  replaceChildren(...n: Array<FakeEl | string>) { this.children = []; this.ownText = null; this.append(...n); }
  remove() { /* detached */ }
  setAttribute(k: string, v: unknown) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  addEventListener(t: string, fn: (e: any) => void) { (this.listeners[t] ??= []).push(fn); }
  dispatch(t: string, e: any) { for (const fn of this.listeners[t] ?? []) fn(e); }
  focus() {} blur() {}
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 1200, height: 800 }; }
  private all(): FakeEl[] { return this.children.flatMap(c => typeof c === 'string' ? [] : [c, ...c.all()]); }
  querySelectorAll(sel: string) { return sel.startsWith('.') ? this.all().filter(e => e.classList.contains(sel.slice(1))) : this.all().filter(e => e.tag === sel); }
  querySelector(sel: string) { return this.querySelectorAll(sel)[0] ?? null; }
}

type Route = { status?: number; body?: unknown; delay?: number };
const OVERVIEW = {
  root: '/r/proj',
  files: [
    { path: 'src/a.ts', lines: 40, symbols: 2, risk: 0.1, complexity: 3 },
    { path: 'src/b.ts', lines: 30, symbols: 1, risk: 0.2, complexity: 2 },
    { path: 'lib/c.ts', lines: 20, symbols: 1, risk: 0.1, complexity: 1 },
  ],
  deps: [[0, 1, 2], [0, 2, 1]], hotspots: [], entries: [{ name: 'main', file: 'src/a.ts' }],
};

function boot(routes: (url: string, n: number) => Route) {
  const ids = new Map<string, FakeEl>();
  const document: any = {
    getElementById: (id: string) => { if (!ids.has(id)) ids.set(id, new FakeEl('div', id)); return ids.get(id); },
    createElement: (t: string) => new FakeEl(t),
    createElementNS: (_ns: string, t: string) => new FakeEl(t),
    activeElement: null,
    listeners: {} as Record<string, Array<(e: any) => void>>,
    addEventListener(t: string, fn: any) { (this.listeners[t] ??= []).push(fn); },
  };
  const calls: string[] = [];
  const counts = new Map<string, number>();
  const fetch = (url: string) => {
    calls.push(url);
    const key = url.split('?')[0];
    const n = (counts.get(key) ?? 0) + 1; counts.set(key, n);
    const r = routes(url, n);
    return new Promise(resolve => setTimeout(() => resolve({
      ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body,
    }), r.delay ?? 0));
  };
  const sources: any[] = [];
  class EventSource { onopen: any; onerror: any; onmessage: any; constructor(public url: string) { sources.push(this); } }
  const window = { addEventListener() {}, innerWidth: 1200, innerHeight: 800 };
  const ctx = vm.createContext({ document, window, fetch, EventSource, setTimeout, clearTimeout, console, requestAnimationFrame: (f: any) => setTimeout(f, 0) });
  vm.runInContext(fs.readFileSync(path.resolve('src/interfaces/web/mirror/public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  const run = (code: string) => vm.runInContext(code, ctx);
  return { run, el: (id: string) => document.getElementById(id) as FakeEl, calls, source: () => sources[0], document };
}
const settle = (ms = 80) => new Promise(r => setTimeout(r, ms));
const ok = (body: unknown, delay = 0): Route => ({ body, delay });
const healthy = (url: string): Route => {
  if (url.startsWith('/api/overview')) return ok(OVERVIEW);
  if (url.startsWith('/api/governance')) return ok({ violations: [], recommendations: [], stats: {} });
  if (url.startsWith('/api/dead')) return ok([]);
  if (url.startsWith('/api/flows')) return ok([]);
  if (url.startsWith('/api/file')) return ok({ path: 'src/a.ts', doc: null, lines: 40, symbols: [] });
  if (url.startsWith('/api/search')) return ok([]);
  return { status: 404, body: { error: 'x' } };
};

describe('the mirror page state', () => {
  it('a check whose data could not be read is shown as unknown, never as a clean zero (P-10-15)', async () => {
    const page = boot(url => url.startsWith('/api/governance') ? { status: 500, body: { error: 'vault busy' } } : healthy(url));
    await settle();
    expect(page.run('lensData("cycles").big')).toBeNull();
    page.run('setLens("cycles")');
    expect(page.el('verdict').textContent).not.toMatch(/^None\./);
    expect(page.el('strip').textContent).not.toMatch(/^clean/);
  });

  it('a live pulse keeps the reader where they were (P-10-16)', async () => {
    const page = boot(healthy);
    await settle();
    page.run('goTo("src")');
    expect(page.run('scopes.length')).toBe(1);
    page.source().onmessage();
    await settle();
    expect(page.run('scopes.length')).toBe(1);
  });

  it('a failed reload does not claim the vault is empty while the old picture stays up (P-10-17)', async () => {
    const page = boot((url, n) => url.startsWith('/api/overview') && n > 1 ? { status: 500, body: { error: 'x' } } : healthy(url));
    await settle();
    page.source().onmessage();
    await settle();
    expect(page.el('project-summary').textContent).not.toMatch(/empty/);
  });

  it('a card re-rendered while its fetch is in flight is filled once, not twice (P-10-18)', async () => {
    const page = boot(url => url.startsWith('/api/file') ? ok({ path: 'src/a.ts', doc: null, lines: 40, symbols: [] }, 60) : healthy(url));
    await settle();
    page.run('openFile("src/a.ts")');
    page.run('render()');
    await settle(200);
    // One fill writes three labelled sections (used by · uses · inside); a doubled fill writes six.
    expect(page.el('card').querySelectorAll('.label').length).toBe(3);
  });

  it('search shows the answer to the CURRENT text, and stays shut once dismissed (P-10-19)', async () => {
    const page = boot(url => {
      if (url.startsWith('/api/search?q=ab') && !url.includes('abc')) return ok([{ id: 's::old', name: 'oldHit', kind: 'function', file: 'src/a.ts', line: 1 }], 400);
      if (url.startsWith('/api/search?q=abc')) return ok([{ id: 's::new', name: 'newHit', kind: 'function', file: 'src/a.ts', line: 2 }], 0);
      return healthy(url);
    });
    await settle();
    const input = page.el('search');
    input.dispatch('input', { target: { value: 'ab' } });
    await settle(200);                                     // 'ab' request is now in flight (slow)
    input.dispatch('input', { target: { value: 'abc' } });
    await settle(700);
    const box = page.el('search-results');
    expect(box.textContent).toContain('newHit');
    expect(box.textContent).not.toContain('oldHit');

    input.dispatch('input', { target: { value: 'ab' } });
    await settle(200);                                     // slow request in flight again
    for (const fn of page.document.listeners.keydown ?? []) fn({ key: 'Escape', preventDefault() {} });
    await settle(500);
    expect(box.hidden).toBe(true);
  });

  it('reconnecting the live channel reloads the page (P-10-20)', async () => {
    const page = boot(healthy);
    await settle();
    page.source().onopen();
    const before = page.calls.filter(u => u.startsWith('/api/overview')).length;
    page.source().onerror();
    page.source().onopen();
    await settle();
    expect(page.calls.filter(u => u.startsWith('/api/overview')).length).toBe(before + 1);
  });
});
