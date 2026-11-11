/**
 * Conducks Mirror — one picture of the codebase, read at a glance (todo82#P13).
 *
 * Two earlier designs failed the owner: boxes sized by lines meant nothing, and a menu of questions
 * with tables was wordy and looked dated. This one follows how a person reads a screen. The module
 * diagram is the whole stage, because a spatial picture is understood before any text. A strip of
 * seven readings sits above it; choosing one does not change the page, it lights up the same
 * picture where that problem lives. Colour is kept for problems only, so the eye lands on them
 * first. Detail arrives in one card, on request, six rows at most. Pulses run along each link from
 * the module that uses to the module that is used. No library: plain DOM and SVG.
 */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const svg = (tag, attrs) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const num = (n) => Number(n).toLocaleString('en-US');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const getJson = async (url) => { try { const r = await fetch(url); return r.ok ? r.json() : null; } catch { return null; } };
const isTest = (p) => /(^|\/)(tests?|__tests__|specs?|e2e)\//i.test(p) || /\.(test|spec)\.[a-z]+$/i.test(p);
const baseName = (p) => p.split('/').pop();
const WORST = { ok: 0, warn: 1, bad: 2 };

let D = null;          // everything derived from /api/overview
let lens = null;       // the reading that is lit: a check id, 'read', 'run', or null
let detail = null;     // a file or function shown in the card: { kind, key }
let scopes = [];       // the trail of modules entered: [] is the whole project
let hover = null;      // the box under the pointer, for the change preview
let G = null;          // the graph on the stage right now

// ── The model: modules, links between them, layers, and what is tested ─────────────────────────

function derive(data) {
  const files = data.files;
  const test = files.map(f => isTest(f.path));
  const tested = new Set();
  const users = files.map(() => new Set());
  for (const [a, b] of data.deps) {
    if (test[a] && !test[b]) tested.add(b);
    if (!test[a]) users[b].add(a);
  }
  const code = files.map((f, i) => !test[i] && f.symbols > 0);
  const size = (list) => list.reduce((s, i) => s + Math.max(files[i].lines, 1), 0);

  // Modules: top folders, splitting the largest while one folder still holds most of the code.
  const groups = new Map();
  const put = (k, i) => (groups.get(k) || groups.set(k, []).get(k)).push(i);
  files.forEach((f, i) => { if (code[i]) put(f.path.includes('/') ? f.path.split('/')[0] : '(root files)', i); });
  const total = size([...groups.values()].flat()) || 1;
  for (let round = 0; round < 10 && groups.size < 9; round++) {
    const cand = [...groups]
      .filter(([k, l]) => k !== '(root files)' && l.some(i => files[i].path.split('/').length > k.split('/').length + 1))
      .sort((x, y) => size(y[1]) - size(x[1]))[0];
    if (!cand || (groups.size >= 5 && size(cand[1]) / total < 0.3)) break;
    groups.delete(cand[0]);
    const depth = cand[0].split('/').length;
    for (const i of cand[1]) {
      const parts = files[i].path.split('/');
      put(parts.length > depth + 1 ? parts.slice(0, depth + 1).join('/') : cand[0], i);
    }
  }
  const mods = [...groups].map(([name, list]) => ({
    name, files: list, lines: size(list),
    risk: list.reduce((s, i) => s + files[i].risk * Math.max(files[i].lines, 1), 0) / size(list),
    uses: new Map(), usedBy: new Map(),
  })).sort((a, b) => b.lines - a.lines);
  const modOf = files.map(() => -1);
  mods.forEach((m, k) => m.files.forEach(i => { modOf[i] = k; }));

  const links = new Map();
  for (const [a, b, n] of data.deps) {
    const ma = modOf[a], mb = modOf[b];
    if (ma < 0 || mb < 0 || ma === mb) continue;
    links.set(`${ma}>${mb}`, (links.get(`${ma}>${mb}`) || 0) + n);
  }
  const w = (a, b) => links.get(`${a}>${b}`) || 0;
  for (const [key, n] of links) {
    const [a, b] = key.split('>').map(Number);
    mods[a].uses.set(b, n);
    mods[b].usedBy.set(a, n);
  }
  // Layers: a module sits below everything that mainly uses it, so a clean design reads top to bottom.
  const layer = mods.map(() => 0);
  for (let r = 0; r < mods.length; r++) {
    for (const key of links.keys()) {
      const [a, b] = key.split('>').map(Number);
      if (w(a, b) > w(b, a) && layer[b] < layer[a] + 1 && layer[a] + 1 < mods.length) layer[b] = layer[a] + 1;
    }
  }
  const tangles = [];
  for (const key of links.keys()) {
    const [a, b] = key.split('>').map(Number);
    if (a < b && w(b, a) > 0) tangles.push([a, b]);
  }
  const cross = [...links.values()].reduce((s, n) => s + n, 0) || 1;
  const incoming = mods.map(m => [...m.usedBy.values()].reduce((s, n) => s + n, 0));
  const hub = mods.length > 3 ? incoming.findIndex(n => n / cross > 0.4) : -1;
  const byPath = new Map(files.map((f, i) => [f.path, i]));
  return { data, files, test, tested, users, code, mods, modOf, links, w, layer, tangles, cross, incoming, hub, byPath, gov: undefined, dead: undefined, flows: undefined };
}

// ── The six health checks. `value` is null while its data is still loading ─────────────────────

function checks() {
  const grade = (v, warnUpTo) => (v === null ? null : v === 0 ? 'ok' : v <= warnUpTo ? 'warn' : 'bad');
  const codeFiles = D.files.map((f, i) => i).filter(i => D.code[i]);
  const cycles = D.gov === undefined ? null : (D.gov ? D.gov.violations.filter(v => v.type === 'CIRCULAR').length : null);
  const hubs = codeFiles.filter(i => D.users[i].size > 50);
  const dead = D.dead === undefined ? null : (D.dead ? D.dead.filter(d => d.sure).length : null);
  const untested = codeFiles.filter(i => D.files[i].risk >= 0.75 && !D.tested.has(i));
  const huge = codeFiles.filter(i => D.files[i].lines > 1000);
  return [
    { id: 'tangles', value: D.tangles.length, status: grade(D.tangles.length, 2), name: 'Two-way module links', what: 'pairs of modules that depend on each other', view: 'structure' },
    { id: 'cycles', value: cycles, status: grade(cycles, 0), name: 'Import loops', what: 'groups of files that import each other in a circle', view: 'health' },
    { id: 'hubs', value: hubs.length, status: grade(hubs.length, 2), name: 'Overloaded files', what: 'files that more than 50 other files depend on', view: 'health' },
    { id: 'dead', value: dead, status: grade(dead, 25), name: 'Unused code', what: 'functions and types nothing uses', view: 'dead' },
    { id: 'untested', value: untested.length, status: grade(untested.length, 10), name: 'Risky and untested', what: 'high-risk files no test touches', view: 'risk' },
    { id: 'huge', value: huge.length, status: grade(huge.length, 3), name: 'Oversized files', what: 'files longer than 1,000 lines', view: 'risk' },
  ];
}

const worstOf = (list) => list.reduce((s, c) => (c.status && WORST[c.status] > WORST[s] ? c.status : s), 'ok');

// ── What each reading lights up: a count per file, and at most six rows for the card ─────────

const LABEL = { tangles: 'two-way', cycles: 'loops', hubs: 'overloaded', dead: 'unused', untested: 'untested', huge: 'oversized' };
const codeFiles = () => D.files.map((f, i) => i).filter(i => D.code[i]);

/** A path without the project root, whatever case the graph stored it in. */
function baseDir(t) {
  const root = D.data.root.replace(/\/+$/, '') + '/';
  const at = t.toLowerCase().indexOf(root.toLowerCase());
  return (at < 0 ? t : t.slice(at + root.length)).trim();
}

/** The reading order: from the entry point that reaches the most code, along what it leans on most. */
function readingPath() {
  const out = D.files.map(() => new Map());
  for (const [a, b, n] of D.data.deps) if (D.code[a] && D.code[b]) out[a].set(b, n);
  const reach = (start) => { const seen = new Set([start]); const walk = [start]; while (walk.length) for (const b of out[walk.pop()].keys()) if (!seen.has(b)) { seen.add(b); walk.push(b); } return seen.size; };
  const entries = [...new Set(D.data.entries.map(e => D.byPath.get(e.file)).filter(i => i !== undefined && D.code[i]))];
  const pool = entries.length ? entries : codeFiles().sort((a, b) => out[b].size - out[a].size).slice(0, 5);
  const path = [pool.sort((a, b) => reach(b) - reach(a))[0]];
  while (path.length < 6) {
    const score = new Map();
    for (const a of path) for (const [b, n] of out[a]) if (!path.includes(b)) score.set(b, (score.get(b) || 0) + n * (1 + Math.log2(1 + D.users[b].size)));
    const next = [...score].sort((x, y) => y[1] - x[1])[0];
    if (!next) break;
    path.push(next[0]);
  }
  return path.filter(i => i !== undefined);
}

function lensData(id) {
  const files = new Map();
  const bump = (i, n = 1) => files.set(i, (files.get(i) || 0) + n);
  const fileRow = (i, tag, value, max, kind) => ({ name: baseName(D.files[i].path), sub: D.files[i].path, tag, value, max, kind, open: () => openFile(D.files[i].path) });
  if (id === 'tangles') {
    // Two-way links are read from the graph on the stage, so they are true at whatever depth is open.
    const pairs = G ? G.tangles : [];
    const nodes = new Map();
    for (const [a, b] of pairs) { nodes.set(a, (nodes.get(a) || 0) + 1); nodes.set(b, (nodes.get(b) || 0) + 1); }
    return { title: 'two-way links', big: pairs.length, note: 'Pairs that depend on each other.', none: 'Every link here goes one way.', files, nodes,
      rows: pairs.slice(0, 6).map(([a, b]) => ({ name: `${G.nodes[a].label}  ⇄  ${G.nodes[b].label}`, sub: `${num(G.w(a, b))} one way · ${num(G.w(b, a))} back`, value: 1, max: 1, kind: 'bad', open: () => enter(G.nodes[a]) })) };
  }
  if (id === 'cycles') {
    const loops = D.gov ? D.gov.violations.filter(v => v.type === 'CIRCULAR') : [];
    const rows = loops.map(v => {
      const paths = [...new Set(String(v.message).split(/\s+->\s+|\n/).map(t => baseDir(t.replace(/^\s*\d+\.\s*/, '').replace(/::unit/g, '')).toLowerCase()).filter(t => D.byPath.has(t)))];
      paths.forEach(t => bump(D.byPath.get(t)));
      return { name: `${plural(paths.length, 'file', 'files')} in one loop`, sub: paths.slice(0, 4).map(baseName).join(' → '), value: 1, max: 1, kind: 'bad', open: () => paths[0] && openFile(paths[0]) };
    });
    return { title: 'import loops', big: D.gov === undefined ? null : loops.length, note: 'Files that import each other in a circle.', none: 'No file imports itself in a circle.', files, rows };
  }
  if (id === 'hubs') {
    const top = codeFiles().sort((a, b) => D.users[b].size - D.users[a].size).slice(0, 6);
    const over = codeFiles().filter(i => D.users[i].size > 50);
    over.forEach(i => bump(i));
    return { title: 'overloaded files', big: over.length, note: 'Files that more than 50 other files depend on. Below: the most depended-on.', none: 'No file carries more than 50 others. Below: the most depended-on.', files,
      rows: top.map(i => fileRow(i, `${num(D.users[i].size)} files`, D.users[i].size, D.users[top[0]].size, D.users[i].size > 50 ? 'bad' : '')) };
  }
  if (id === 'dead') {
    const sure = D.dead ? D.dead.filter(d => d.sure) : [];
    const byFile = new Map();
    for (const d of sure) (byFile.get(d.file) || byFile.set(d.file, []).get(d.file)).push(d.symbol);
    const list = [...byFile].sort((a, b) => b[1].length - a[1].length);
    for (const [file, names] of list) { const i = D.byPath.get(file.toLowerCase()); if (i !== undefined) bump(i, names.length); }
    return { title: 'unused code', big: D.dead === undefined ? null : sure.length, note: 'Functions and types that nothing uses.', none: 'Nothing is provably unused.', files,
      rows: list.slice(0, 6).map(([file, names]) => ({ name: baseName(file), sub: names.slice(0, 3).join(' · '), tag: String(names.length), value: names.length, max: list[0][1].length, kind: 'bad', open: () => openFile(file.toLowerCase()) })) };
  }
  if (id === 'untested') {
    const list = codeFiles().filter(i => D.files[i].risk >= 0.75 && !D.tested.has(i)).sort((a, b) => D.users[b].size - D.users[a].size);
    list.forEach(i => bump(i));
    return { title: 'risky, untested', big: list.length, note: 'High-risk files that no test touches. Most depended-on first.', none: 'Every high-risk file has a test touching it.', files,
      rows: list.slice(0, 6).map(i => fileRow(i, `${num(D.users[i].size)} files`, D.users[i].size, Math.max(1, D.users[list[0]].size), 'bad')) };
  }
  if (id === 'huge') {
    const list = codeFiles().filter(i => D.files[i].lines > 1000).sort((a, b) => D.files[b].lines - D.files[a].lines);
    list.forEach(i => bump(i));
    return { title: 'oversized files', big: list.length, note: 'Files longer than 1,000 lines.', none: 'No file is longer than 1,000 lines.', files,
      rows: list.slice(0, 6).map(i => fileRow(i, `${num(D.files[i].lines)} lines`, D.files[i].lines, D.files[list[0]].lines, 'warn')) };
  }
  if (id === 'read') {
    const path = readingPath();
    path.forEach((i, k) => files.set(i, k + 1));
    const others = [...new Set(D.data.entries.map(e => D.byPath.get(e.file)).filter(i => i !== undefined && D.code[i] && i !== path[0]))].slice(0, 5);
    return { title: 'read in this order', big: path.length, note: 'From the entry point, along what it leans on most.', none: '', files, step: true,
      extra: { label: 'other ways in', rows: others.map(i => ({ name: baseName(D.files[i].path), sub: D.files[i].path, open: () => openFile(D.files[i].path) })) },
      rows: path.map((i, k) => ({ name: `${k + 1}   ${baseName(D.files[i].path)}`, sub: D.files[i].path, tag: `${num(D.files[i].lines)} lines`, value: 0, max: 1, open: () => openFile(D.files[i].path) })) };
  }
  const flows = D.flows || [];
  return { title: 'paths it runs', big: D.flows === undefined ? null : flows.length, note: 'Where it starts, then the modules it passes through. Hover a row.', none: 'No entry point calling three or more functions was found.', files, step: true,
    rows: flows.slice(0, 6).map(f => {
      const chain = [];
      for (const sid of f.steps) { const i = D.byPath.get(sid.split('::')[0]); const m = i === undefined ? -1 : D.modOf[i]; if (m >= 0 && !chain.includes(m)) chain.push(m); }
      return { name: f.name, sub: chain.map(m => D.mods[m].name.split('/').pop()).join(' → '), tag: `${num(f.total)} fn`, value: f.total, max: flows[0].total, chain, open: () => openSymbol(f.entry) };
    }) };
}

const statusOf = (id) => (checks().find(c => c.id === id) || {}).status || null;

// ── Any level as a small codebase: its parts, the links between them, and what crosses its edge ─

/** The parts of a scope: its sub-folders and its own files. With no scope, the project's modules. */
function childrenOf(scope) {
  if (!scope) return D.mods.map((m, k) => ({ key: m.name, label: m.name, files: m.files, lines: m.lines, mod: k, scope: { name: m.name, prefix: m.name === '(root files)' ? '' : m.name, files: m.files } }));
  const groups = new Map();
  for (const i of scope.files) {
    const path = D.files[i].path;
    const rel = scope.prefix ? path.slice(scope.prefix.length + 1) : path;
    const isFile = !rel.includes('/');
    const seg = rel.split('/')[0];
    const key = isFile ? path : (scope.prefix ? scope.prefix + '/' : '') + seg;
    (groups.get(key) || groups.set(key, { key, label: seg, files: [], file: isFile ? i : undefined }).get(key)).files.push(i);
  }
  return [...groups.values()].map(g => ({ ...g, lines: g.files.reduce((s, i) => s + Math.max(D.files[i].lines, 1), 0),
    scope: g.file === undefined ? { name: g.key, prefix: g.key, files: g.files } : null })).sort((a, b) => b.lines - a.lines);
}

/** Links between the parts, their layers, and the outside modules that reach in or are reached. */
function wire(scope) {
  const all = childrenOf(scope);
  const nodes = all.slice(0, 40);
  const inScope = new Set(scope ? scope.files : []);
  const nodeOf = new Map();
  nodes.forEach((n, k) => n.files.forEach(i => nodeOf.set(i, k)));
  const links = new Map(), inFrom = new Map(), outTo = new Map();
  const depth = scope && scope.prefix ? scope.prefix.split('/').length : 0;
  const outside = (i) => {            // the nearest folder where an outside file parts ways with this scope
    const parts = D.files[i].path.split('/'), mine = scope.prefix ? scope.prefix.split('/') : [];
    let same = 0;
    while (same < depth && parts[same] === mine[same]) same++;
    return parts.slice(0, Math.min(same + 1, parts.length)).join('/');
  };
  const note = (map, label, k, n) => { const m = map.get(label) || map.set(label, new Map()).get(label); m.set(k, (m.get(k) || 0) + n); };
  for (const [a, b, n] of D.data.deps) {
    const ka = nodeOf.get(a), kb = nodeOf.get(b);
    if (ka !== undefined && kb !== undefined) { if (ka !== kb) links.set(`${ka}>${kb}`, (links.get(`${ka}>${kb}`) || 0) + n); }
    else if (!scope) continue;
    else if (kb !== undefined && D.code[a] && !inScope.has(a)) note(inFrom, outside(a), kb, n);
    else if (ka !== undefined && D.code[b] && !inScope.has(b)) note(outTo, outside(b), ka, n);
  }
  const w = (a, b) => links.get(`${a}>${b}`) || 0;
  const usedBy = nodes.map(() => new Set()), uses = nodes.map(() => new Set());
  for (const key of links.keys()) { const [a, b] = key.split('>').map(Number); uses[a].add(b); usedBy[b].add(a); }
  const layer = nodes.map(() => 0);
  for (let r = 0; r < nodes.length; r++) {
    for (const key of links.keys()) {
      const [a, b] = key.split('>').map(Number);
      if (w(a, b) > w(b, a) && layer[b] < layer[a] + 1 && layer[a] + 1 < nodes.length) layer[b] = layer[a] + 1;
    }
  }
  const tangles = [];
  for (const key of links.keys()) { const [a, b] = key.split('>').map(Number); if (a < b && w(b, a) > 0) tangles.push([a, b]); }
  const wrong = (a, b) => (w(b, a) > 0 && w(a, b) <= w(b, a)) || layer[b] < layer[a];
  const reach = (k) => { const hit = new Set(); const walk = [k]; while (walk.length) for (const u of usedBy[walk.pop()]) if (u !== k && !hit.has(u)) { hit.add(u); walk.push(u); } return hit; };
  return { scope, nodes, hidden: all.length - nodes.length, links, w, layer, tangles, wrong, reach, uses, usedBy, inFrom, outTo };
}

/** The file the program starts in: the entry point that reaches the most code. */
function entryFile() {
  if (D.entry === undefined) D.entry = readingPath()[0];
  return D.entry;
}

/** One link between two boxes, with the pulse that shows its direction. */
function linkPaths(d, extra, width, a, b) {
  const tag = a === undefined ? {} : { 'data-a': a, 'data-b': b };
  return [svg('path', { d, class: `m-edge${extra}`, 'data-base': `m-edge${extra}`, 'stroke-width': width, ...tag }), svg('path', { d, class: `m-flow${extra}`, 'data-base': `m-flow${extra}`, ...tag })];
}

/**
 * One file in the middle, the files that use it above, the files it uses below. This is how a
 * reader walks the code: start at the entry, look down at what it calls, click, repeat.
 */
function drawFileStage(host, W, H, usable, i) {
  const f = D.files[i];
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  // Ties are broken by path, so the same seven files show on every load.
  const byName = (x, y) => (D.files[x].path < D.files[y].path ? -1 : 1);
  const above = D.data.deps.filter(d => d[1] === i).sort((a, b) => (D.test[a[0]] - D.test[b[0]]) || b[2] - a[2] || byName(a[0], b[0]));
  const below = D.data.deps.filter(d => d[0] === i).sort((a, b) => b[2] - a[2] || byName(a[1], b[1]));
  const SHOW = 7, BH = 56;
  const cx = usable / 2, cy = Math.max(300, H / 2 - BH / 2);
  const lay = (list, y) => {
    const shown = list.slice(0, SHOW), n = shown.length + (list.length > SHOW ? 1 : 0);
    const bw = Math.max(110, Math.min(190, Math.floor((usable - 60) / Math.max(n, 1)) - 16));
    return { bw, y, more: list.length - shown.length, items: shown.map((d, k) => ({ d, x: (usable * (k + 1)) / (n + 1) })), moreX: (usable * n) / (n + 1) };
  };
  const up = lay(above, cy - 200), down = lay(below, cy + 200);
  const CW = 230;

  const box = (x, y, bw, idx, cls, onclick) => {
    const file = D.files[idx];
    const g = svg('g', { class: `m-node${cls}` });
    g.append(svg('rect', { x: x - bw / 2, y, width: bw, height: BH, rx: 12, class: 'm-box' }));
    const room = Math.floor((bw - 26) / 7.2);
    const name = svg('text', { x: x - bw / 2 + 14, y: y + 24, class: 'm-name' });
    const label = baseName(file.path);
    name.textContent = label.length > room ? label.slice(0, room - 1) + '…' : label;
    const dir = file.path.split('/').slice(-3, -1).join('/');
    const meta = svg('text', { x: x - bw / 2 + 14, y: y + 41, class: 'm-meta' });
    meta.textContent = (D.test[idx] ? 'TEST · ' : '') + (dir.length > room + 4 ? '…' + dir.slice(-(room + 2)) : dir).toUpperCase();
    const tip = svg('title', {});
    tip.textContent = file.path;
    g.append(name, meta, tip);
    if (idx === entryFile()) g.append(startTag(x - bw / 2 + 2, y - 12));
    if (onclick) g.addEventListener('click', onclick);
    return g;
  };
  const caption = (text, y) => { const t = svg('text', { x: 28, y, class: 'm-cap' }); t.textContent = text; root.append(t); };
  const moreBox = (x, y, bw, n) => { const t = svg('text', { x, y: y + BH / 2 + 4, class: 'm-more' }); t.textContent = `+${num(n)} more`; root.append(t); };

  for (const it of up.items) root.append(...linkPaths(`M${it.x} ${up.y + BH} C${it.x} ${(up.y + BH + cy) / 2}, ${cx} ${(up.y + BH + cy) / 2}, ${cx} ${cy}`, '', (0.8 + Math.log2(1 + it.d[2]) * 0.5).toFixed(1)));
  for (const it of down.items) root.append(...linkPaths(`M${cx} ${cy + BH} C${cx} ${(cy + BH + down.y) / 2}, ${it.x} ${(cy + BH + down.y) / 2}, ${it.x} ${down.y}`, '', (0.8 + Math.log2(1 + it.d[2]) * 0.5).toFixed(1)));
  caption(`USED BY · ${num(above.length)}`, up.y - 18);
  caption(`USES · ${num(below.length)}`, down.y + BH + 28);
  for (const it of up.items) root.append(box(it.x, up.y, up.bw, it.d[0], D.test[it.d[0]] ? ' test' : '', () => openFile(D.files[it.d[0]].path)));
  if (up.more > 0) moreBox(up.moreX, up.y, up.bw, up.more);
  for (const it of down.items) root.append(box(it.x, down.y, down.bw, it.d[1], '', () => openFile(D.files[it.d[1]].path)));
  if (down.more > 0) moreBox(down.moreX, down.y, down.bw, down.more);
  root.append(box(cx, cy, CW, i, ' sel', null));

  host.replaceChildren(root);
}

/** The small START label that marks where the program begins; with a word, a plain white label. */
function startTag(x, y, word) {
  const w = word ? 84 : 54;
  const g = svg('g', { class: word ? 'm-start plain' : 'm-start' });
  g.append(svg('rect', { x, y, width: w, height: 20, rx: 6, class: 'm-start-box' }));
  const t = svg('text', { x: x + w / 2, y: y + 14, class: 'm-start-text' });
  t.textContent = word || 'START';
  g.append(t);
  return g;
}

/** A row of outside modules along one edge of the stage: who reaches in (top) or is reached (bottom). */
function ports(root, map, y, usable, pos, BH, incoming) {
  const list = [...map].map(([label, to]) => ({ label, to, total: [...to.values()].reduce((s, n) => s + n, 0) })).sort((a, b) => b.total - a.total);
  const shown = list.slice(0, 6), n = shown.length + (list.length > 6 ? 1 : 0);
  shown.forEach((p, k) => {
    const x = 150 + ((usable - 150) * (k + 1)) / (n + 1), text = p.label.length > 26 ? '…' + p.label.slice(-25) : p.label, w = text.length * 6.7 + 26;
    const mine = [];
    for (const [node, count] of [...p.to].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      const q = pos.get(node);
      const d = incoming ? `M${x} ${y + 26} C${x} ${(y + 26 + q.y) / 2}, ${q.x} ${(y + 26 + q.y) / 2}, ${q.x} ${q.y}` : `M${q.x} ${q.y + BH} C${q.x} ${(q.y + BH + y) / 2}, ${x} ${(q.y + BH + y) / 2}, ${x} ${y}`;
      const pair = linkPaths(d, ' port', (0.7 + Math.log2(1 + count) * 0.35).toFixed(1));
      mine.push(...pair);
      root.prepend(...pair);
    }
    const g = svg('g', { class: 'm-port' });
    g.append(svg('rect', { x: x - w / 2, y, width: w, height: 26, rx: 8, class: 'm-port-box' }));
    const t = svg('text', { x, y: y + 17, class: 'm-port-text' });
    t.textContent = text;
    const tip = svg('title', {});
    tip.textContent = incoming ? `${p.label} uses this in ${num(p.total)} places` : `this uses ${p.label} in ${num(p.total)} places`;
    g.append(t, tip);
    g.addEventListener('click', () => goTo(p.label));
    // Its lines stay faint until the pointer asks: then they light up, with the parts they touch.
    g.addEventListener('mouseenter', () => { mine.forEach(e => e.classList.add('on')); for (const node of p.to.keys()) root.querySelector(`.m-node[data-k="${node}"]`)?.classList.add('step'); });
    g.addEventListener('mouseleave', () => { mine.forEach(e => e.classList.remove('on')); for (const node of p.to.keys()) root.querySelector(`.m-node[data-k="${node}"]`)?.classList.remove('step'); });
    root.append(g);
  });
  if (list.length > 6) { const t = svg('text', { x: 150 + ((usable - 150) * n) / (n + 1), y: y + 17, class: 'm-more' }); t.textContent = `+${list.length - 6} more`; root.append(t); }
  const cap = svg('text', { x: 28, y: y + 17, class: 'm-cap' });
  cap.textContent = incoming ? `USED BY · ${list.length}` : `USES · ${list.length}`;
  root.append(cap);
}

function drawStage() {
  const host = $('stage');
  const W = host.clientWidth, H = host.clientHeight;
  if (detail) {
    const i = D.byPath.get(detail.kind === 'file' ? detail.key : detail.key.split('::')[0]);
    if (i !== undefined) { G = null; drawFileStage(host, W, H, W > 1180 ? W - 400 : W, i); return; }
  }
  const scope = scopes[scopes.length - 1] || null;
  const cardOpen = !!scope || !!lens;
  const usable = W > 1180 ? W - (cardOpen ? 400 : 220) : W;
  G = wire(scope);
  const hasIn = G.inFrom.size > 0, hasOut = G.outTo.size > 0;

  const perRow = Math.max(3, Math.floor((usable - 60) / 150));
  const rows = [];
  const byLayer = [];
  G.nodes.forEach((n, k) => (byLayer[G.layer[k]] = byLayer[G.layer[k]] || []).push(k));
  for (const group of byLayer.filter(Boolean)) for (let at = 0; at < group.length; at += perRow) rows.push(group.slice(at, at + perRow));
  const widest = Math.max(1, ...rows.map(r => r.length));
  const BW = Math.max(118, Math.min(196, Math.floor((usable - 60) / widest) - 18)), BH = rows.length > 5 ? 50 : 62;
  const top = 138 + (hasIn ? 70 : 0), bottom = 118 + (hasOut ? 66 : 0);
  const gap = rows.length > 1 ? Math.max(BH + 12, Math.min(150, (H - top - bottom - BH) / (rows.length - 1))) : 0;
  const y0 = top + Math.max(0, (H - top - bottom - BH - gap * (rows.length - 1)) / 2);
  const pos = new Map();
  rows.forEach((row, r) => {
    const centre = (k) => { const n = [...G.uses[k], ...G.usedBy[k]].filter(x => pos.has(x)); return n.length ? n.reduce((s, x) => s + pos.get(x).x, 0) / n.length : usable / 2; };
    if (r) row.sort((a, b) => centre(a) - centre(b));
    row.forEach((k, at) => pos.set(k, { x: (usable * (at + 1)) / (row.length + 1), y: y0 + r * gap }));
  });

  const data = lens && lens !== 'score' ? lensData(lens) : null;
  const tone = lens === 'read' || lens === 'run' ? 'step' : statusOf(lens) === 'warn' ? 'warn' : 'bad';
  const countOf = (k) => {
    if (!data) return 0;
    if (data.nodes) return data.nodes.get(k) || 0;
    const values = G.nodes[k].files.map(i => data.files.get(i)).filter(v => v !== undefined);
    return !values.length ? 0 : data.step ? Math.min(...values) : values.reduce((s, v) => s + v, 0);
  };
  const lit = data ? G.nodes.map((n, k) => countOf(k)) : null;
  const anyLit = !!lit && lit.some(Boolean);
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

  for (const [key, n] of G.links) {
    const [a, b] = key.split('>').map(Number);
    const p = pos.get(a), q = pos.get(b), bad = G.wrong(a, b);
    let d;
    if (q.y > p.y) d = `M${p.x} ${p.y + BH} C${p.x} ${(p.y + BH + q.y) / 2}, ${q.x} ${(p.y + BH + q.y) / 2}, ${q.x} ${q.y}`;
    else if (q.y < p.y) d = `M${p.x + 16} ${p.y} C${p.x + 16} ${(p.y + q.y + BH) / 2}, ${q.x + 16} ${(p.y + q.y + BH) / 2}, ${q.x + 16} ${q.y + BH}`;
    else d = `M${p.x} ${p.y + BH} C${p.x} ${p.y + BH + 40}, ${q.x} ${q.y + BH + 40}, ${q.x} ${q.y + BH}`;
    const paths = linkPaths(d, `${bad ? ' wrong' : ''}${data && lens !== 'tangles' ? ' dim' : ''}`, (0.8 + Math.log2(1 + n) * 0.5).toFixed(1), a, b);
    const tip = svg('title', {});
    tip.textContent = `${G.nodes[a].label} uses ${G.nodes[b].label} · ${num(n)} places`;
    paths[0].append(tip);
    root.append(...paths);
  }
  const maxLines = Math.max(1, ...G.nodes.map(n => n.lines));
  const entry = entryFile();
  G.nodes.forEach((n, k) => {
    const { x, y } = pos.get(k);
    const base = `m-node${n.file !== undefined ? ' leaf' : ''}${!scope && n.mod === D.hub ? ' hub' : ''}${anyLit ? (lit[k] ? ` ${tone}` : ' dim') : ''}`;
    const g = svg('g', { class: base, 'data-base': base, 'data-k': k });
    if (n.mod !== undefined) g.setAttribute('data-mod', n.mod);
    g.append(svg('rect', { x: x - BW / 2, y, width: BW, height: BH, rx: 12, class: 'm-box' }));
    const room = Math.floor((BW - 30) / 7.4);
    const name = svg('text', { x: x - BW / 2 + 16, y: y + (BH > 55 ? 26 : 21), class: 'm-name' });
    name.textContent = n.label.length > room ? (n.file !== undefined ? n.label.slice(0, room - 1) + '…' : '…' + n.label.slice(-(room - 1))) : n.label;
    const meta = svg('text', { x: x - BW / 2 + 16, y: y + (BH > 55 ? 43 : 37), class: 'm-meta' });
    meta.textContent = n.file !== undefined ? `${num(D.files[n.file].lines)} LINES` : `${num(n.files.length)} FILES`;
    const tip = svg('title', {});
    tip.textContent = `${n.key} · ${num(n.lines)} lines · uses ${G.uses[k].size} · used by ${G.usedBy[k].size}`;
    g.append(name, meta, tip);
    if (BH > 55) g.append(svg('line', { x1: x - BW / 2 + 16, y1: y + BH - 9, x2: x - BW / 2 + 16 + (BW - 32) * Math.max(0.04, n.lines / maxLines), y2: y + BH - 9, class: 'm-size' }));
    if (n.file === undefined) { const go = svg('text', { x: x + BW / 2 - 18, y: y + BH / 2 + 5, class: 'm-go' }); go.textContent = '›'; g.append(go); }
    if (entry !== undefined && n.files.includes(entry) && !anyLit) g.append(startTag(x - BW / 2 + 12, y - 11));
    // The module the most links point at is named on the picture, in plain words.
    if (!scope && n.mod === D.hub && !anyLit) g.append(startTag(x + BW / 2 - 96, y - 11, 'MOST USED'));
    if (anyLit && lit[k]) {
      g.append(svg('circle', { cx: x + BW / 2 - 4, cy: y + 4, r: 13, class: `m-badge${tone === 'bad' ? '' : ' ' + tone}` }));
      const t = svg('text', { x: x + BW / 2 - 4, y: y + 8, class: 'm-badge-text' });
      t.textContent = lit[k] > 99 ? '99+' : String(lit[k]);
      g.append(t);
    }
    g.addEventListener('click', () => enter(n));
    g.addEventListener('mouseenter', () => preview(k));
    g.addEventListener('mouseleave', () => preview(null));
    root.append(g);
  });
  if (hasIn) ports(root, G.inFrom, 138, usable, pos, BH, true);
  if (hasOut) ports(root, G.outTo, H - bottom + 30, usable, pos, BH, false);
  if (G.hidden > 0) { const t = svg('text', { x: usable / 2, y: y0 + (rows.length - 1) * gap + BH + 26, class: 'm-more' }); t.textContent = `+${num(G.hidden)} smaller parts not shown`; root.append(t); }
  host.replaceChildren(root);
}

/** While the pointer rests on a box: light it, everything a change to it can reach, and nothing else. */
function preview(k) {
  if (!G || (lens && lens !== 'score')) return;
  hover = k;
  const hit = k === null ? null : G.reach(k);
  const on = (x) => x === k || hit.has(x);
  for (const g of $('stage').querySelectorAll('.m-node')) {
    const x = Number(g.getAttribute('data-k'));
    g.setAttribute('class', g.getAttribute('data-base') + (k === null ? '' : x === k ? ' sel' : hit.has(x) ? ' hit' : ' dim'));
  }
  for (const e of $('stage').querySelectorAll('[data-a]')) {
    e.setAttribute('class', e.getAttribute('data-base') + (k === null || (on(Number(e.getAttribute('data-a'))) && on(Number(e.getAttribute('data-b')))) ? '' : ' dim'));
  }
  drawVerdict();
}

/** Lights one chain of modules while a "paths" row is hovered, without redrawing the stage. */
function lightChain(chain) {
  for (const g of $('stage').querySelectorAll('.m-node[data-mod]')) {
    const m = Number(g.getAttribute('data-mod'));
    g.setAttribute('class', 'm-node' + (!chain ? '' : chain.includes(m) ? ' step' : ' dim'));
  }
}

// ── The trail, the strip of readings with its two guides, and the one-line verdict ─────────────

function drawCrumbs() {
  const nav = $('crumbs');
  nav.replaceChildren();
  if (!scopes.length && !detail) return;
  const add = (label, onclick, here) => {
    if (nav.children.length) nav.append(el('span', 'crumb-sep', '›'));
    const b = el('button', 'crumb', label);
    if (here) b.classList.add('here'); else b.onclick = onclick;
    nav.append(b);
  };
  add('all', () => { scopes = []; detail = null; render(); }, false);
  scopes.forEach((sc, at) => add(at ? baseName(sc.name) : sc.name, () => { scopes = scopes.slice(0, at + 1); detail = null; render(); }, !detail && at === scopes.length - 1));
  if (detail) add(baseName(detail.key.split('::')[0]), null, true);
}

function drawStrip() {
  const list = checks();
  const known = list.filter(c => c.status);
  const passed = known.filter(c => c.status === 'ok').length;
  const overall = worstOf(list);
  const strip = $('strip');
  strip.replaceChildren();
  const score = el('button', 'chip score');
  if (lens === 'score') score.classList.add('on');
  const ring = svg('svg', { width: 38, height: 38, viewBox: '0 0 38 38' });
  const C = 2 * Math.PI * 15;
  ring.append(svg('circle', { cx: 19, cy: 19, r: 15, fill: 'none', stroke: 'rgba(255,255,255,0.12)', 'stroke-width': 3 }));
  ring.append(svg('circle', { cx: 19, cy: 19, r: 15, fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round', transform: 'rotate(-90 19 19)',
    stroke: overall === 'ok' ? '#4ade9a' : overall === 'warn' ? '#ff8a3d' : '#ff5d6c', 'stroke-dasharray': `${(C * passed) / (known.length || 1)} ${C}` }));
  const text = el('span', 'score-text');
  text.append(el('span', 'chip-label', overall === 'ok' ? 'clean' : overall === 'warn' ? 'nearly clean' : 'needs work'), el('span', 'chip-num', `${passed}/${known.length}`));
  score.append(ring, text);
  score.onclick = () => setLens('score');
  strip.append(score);
  for (const c of list) {
    const b = el('button', 'chip');
    if (c.status) b.classList.add(c.status);
    if (lens === c.id) b.classList.add('on');
    b.title = c.what;
    b.append(el('span', 'chip-label', LABEL[c.id]), el('span', 'chip-num', c.value === null ? '·' : num(c.value)));
    b.onclick = () => setLens(c.id);
    strip.append(b);
  }
  strip.append(el('span', 'strip-gap'));
  for (const [id, label] of [['read', 'where to start'], ['run', 'how it runs']]) {
    const m = el('button', 'mode', label);
    if (lens === id) m.classList.add('on');
    m.onclick = () => setLens(id);
    strip.append(m);
  }
}

function drawVerdict() {
  const v = $('verdict');
  v.replaceChildren();
  const say = (cls, strong, rest) => { v.append(el('span', cls, strong), rest); };
  if (detail) {
    const i = D.byPath.get(detail.kind === 'file' ? detail.key : detail.key.split('::')[0]);
    if (i !== undefined) {
      const uses = D.data.deps.filter(d => d[0] === i).length, usedBy = D.data.deps.filter(d => d[1] === i).length;
      say(i === entryFile() ? 'ok-text' : '', i === entryFile() ? 'It starts here.' : baseName(D.files[i].path), ` Used by ${plural(usedBy, 'file', 'files')}, uses ${num(uses)}.`);
      return;
    }
  }
  if (hover !== null && G && G.nodes[hover]) {
    const n = G.reach(hover).size;
    say(n === 0 ? 'ok-text' : n <= 2 ? 'warn-text' : 'bad-text', n === 0 ? 'Safe to change.' : `Touches ${plural(n, 'part', 'parts')}.`,
      n === 0 ? ` Nothing here uses ${G.nodes[hover].label}.` : ` A change to ${G.nodes[hover].label} can reach them.`);
    return;
  }
  if (lens === 'score') {
    const list = checks().filter(c => c.status), passed = list.filter(c => c.status === 'ok').length, overall = worstOf(list);
    say(`${overall}-text`, overall === 'ok' ? 'Clean.' : overall === 'warn' ? 'Nearly clean.' : 'Needs work.', ` ${passed} of ${list.length} checks pass.`);
    return;
  }
  if (lens) {
    const d = lensData(lens);
    const status = statusOf(lens);
    if (d.big === null) { say('', 'Checking…', ''); return; }
    const zero = d.big === 0 && lens !== 'read' && lens !== 'run';
    say(zero ? 'ok-text' : status === 'warn' ? 'warn-text' : status === 'bad' ? 'bad-text' : '', zero ? 'None.' : `${num(d.big)}`, zero ? ` ${d.none}` : ` ${d.title}.`);
    return;
  }
  const two = G ? G.tangles.length : 0;
  say(two === 0 ? 'ok-text' : 'bad-text', two === 0 ? (scopes.length ? 'Clean inside.' : 'Modular.') : `Tangled in ${plural(two, 'place', 'places')}.`,
    two === 0 ? ' Every link here goes one way.' : ' Some parts depend on each other.');
}

/** The counts beside the name: the whole project, or the level that is open. */
function drawSummary() {
  const scope = scopes[scopes.length - 1];
  const files = scope ? scope.files : D.files.map((f, i) => i);
  const lines = files.reduce((s, i) => s + D.files[i].lines, 0);
  const parts = G ? ` · ${plural(G.nodes.length + G.hidden, scope ? 'part' : 'module', scope ? 'parts' : 'modules')} · ${plural(G.links.size, 'link', 'links')}` : '';
  $('project-summary').textContent = `${plural(files.length, 'file', 'files')} · ${num(lines)} lines${parts}`;
}

// ── The card: one thing at a time, six rows at most ────────────────────────────────────────────

function cardShell(kicker, onClose) {
  const c = $('card');
  c.hidden = false;
  c.replaceChildren();
  c.scrollTop = 0;
  const top = el('div', 'card-top');
  const x = el('button', 'card-x', detail ? '←' : '×');
  x.onclick = onClose;
  top.append(el('span', 'card-kicker', kicker), x);
  c.append(top);
  return c;
}
function rowsOf(parent, label, items, emptyText) {
  if (label) parent.append(el('p', 'label', label));
  if (!items.length) { if (emptyText) parent.append(el('p', 'empty', emptyText)); return; }
  const ul = el('ul', 'rows');
  for (const r of items) {
    const b = el('button', 'row');
    const line = el('span', 'row-line');
    line.append(el('span', 'row-name', r.name));
    if (r.tag) line.append(el('span', 'row-tag', r.tag));
    b.append(line);
    if (r.sub) b.append(el('span', 'row-sub', r.sub));
    if (r.max) { const m = el('span', 'meter'); const f = el('span', 'meter-fill'); if (r.kind) f.classList.add(r.kind); f.style.width = `${Math.max(3, Math.round((r.value / r.max) * 100))}%`; m.append(f); b.append(m); }
    b.onclick = r.open;
    if (r.chain) { b.onmouseenter = () => lightChain(r.chain); b.onmouseleave = () => lightChain(null); }
    const li = el('li');
    li.append(b);
    ul.append(li);
  }
  parent.append(ul);
}
function trio(parent, cells) {
  const t = el('div', 'trio');
  for (const [n, label] of cells) { const c = el('div', 'trio-cell'); c.append(el('span', 'trio-num', n), el('span', 'trio-label', label)); t.append(c); }
  parent.append(t);
}

function drawCard() {
  if (detail) { (detail.kind === 'file' ? fileCard : symbolCard)(detail.key); return; }
  if (lens === 'score') {
    // What "needs work" means: the six checks, which pass, and a way into each.
    const list = checks(), known = list.filter(c => c.status), passed = known.filter(c => c.status === 'ok').length;
    const c = cardShell('the six checks', () => setLens('score'));
    c.append(el('p', 'card-big', `${passed}/${known.length}`), el('p', 'card-note', 'Green passes. Red and orange need work. Click one to see where.'));
    rowsOf(c, '', list.map(k => ({ name: k.name, sub: k.what, tag: k.value === null ? '…' : num(k.value), value: 1, max: 1, kind: k.status || '', open: () => setLens(k.id) })), '');
    return;
  }
  if (lens) {
    const d = lensData(lens);
    const c = cardShell(d.title, () => setLens(lens));
    c.append(el('p', 'card-big', d.big === null ? '·' : num(d.big)), el('p', 'card-note', d.big === 0 ? d.none : d.note));
    rowsOf(c, '', d.rows, '');
    if (d.extra) rowsOf(c, d.extra.label, d.extra.rows, '');
    return;
  }
  const scope = scopes[scopes.length - 1];
  if (!scope) { $('card').hidden = true; return; }
  const c = cardShell('module', () => { scopes.pop(); render(); });
  c.append(el('h2', 'card-title', scope.name));
  const inside = new Set(scope.files);
  const outsideUsers = (i) => [...D.users[i]].filter(u => !inside.has(u)).length;
  trio(c, [[num(scope.files.length), 'files'], [num(scope.files.reduce((s, i) => s + D.files[i].lines, 0)), 'lines'], [num(G.nodes.length + G.hidden), 'parts']]);
  const tagList = (label, map) => {
    c.append(el('p', 'label', label));
    const tags = el('div', 'tags');
    if (!map.size) tags.append(el('span', 'tag', 'nothing'));
    for (const name of [...map.keys()].slice(0, 12)) { const t = el('button', 'tag', name); t.onclick = () => goTo(name); tags.append(t); }
    c.append(tags);
  };
  tagList('used by, from outside', G.inFrom);
  tagList('it uses, outside', G.outTo);
  const doors = scope.files.filter(i => outsideUsers(i) > 0).sort((a, b) => outsideUsers(b) - outsideUsers(a));
  rowsOf(c, `its doors · ${doors.length} of ${scope.files.length} files are used from outside`,
    doors.slice(0, 6).map(i => ({ name: baseName(D.files[i].path), sub: D.files[i].path, tag: `${num(outsideUsers(i))} files`, value: outsideUsers(i), max: outsideUsers(doors[0]), open: () => openFile(D.files[i].path) })),
    'No file in here is used from outside.');
}

function openFile(path) { detail = { kind: 'file', key: path }; hover = null; render(); }
function openSymbol(id) { detail = { kind: 'symbol', key: id }; hover = null; render(); }

async function fileCard(path) {
  const c = cardShell('file', () => { detail = null; render(); });
  c.append(el('h2', 'card-title', baseName(path)), el('p', 'card-path', path));
  const f = await getJson('/api/file?path=' + encodeURIComponent(path));
  if (!detail || detail.key !== path) return;
  if (!f) { c.append(el('p', 'card-note', 'Not in the graph. Run conducks analyze.')); return; }
  if (f.doc) c.append(el('p', 'card-doc', f.doc));
  const i = D.byPath.get(path);
  trio(c, [[num(f.lines), 'lines'], [num(f.symbols.length), 'functions'], [i === undefined ? '0' : num(D.users[i].size), 'used by']]);
  const side = (from, to) => D.data.deps.filter(d => d[from] === i).sort((a, b) => b[2] - a[2]).slice(0, 5)
    .map(d => ({ name: baseName(D.files[d[to]].path), sub: D.files[d[to]].path, tag: `${num(d[2])}×`, open: () => openFile(D.files[d[to]].path) }));
  rowsOf(c, 'used by', side(1, 0), 'No other file uses it.');
  rowsOf(c, 'uses', side(0, 1), 'It uses no other file here.');
  const inside = f.symbols.slice().sort((a, b) => b.usedBy - a.usedBy).slice(0, 8);
  rowsOf(c, 'inside', inside.map(s => ({ name: s.name, sub: s.doc ? s.doc.split('\n')[0] : `${s.kind} · line ${s.line}`, tag: s.usedBy ? `${num(s.usedBy)}×` : 'unused', open: () => openSymbol(s.id) })), 'No function or type found.');
}

async function symbolCard(id) {
  const c = cardShell('function', () => { detail = null; render(); });
  const s = await getJson('/api/symbol?id=' + encodeURIComponent(id));
  if (!detail || detail.key !== id) return;
  if (!s) { c.append(el('p', 'card-note', 'Not in the graph. Run conducks analyze.')); return; }
  c.querySelector('.card-kicker').textContent = s.kind;
  c.append(el('h2', 'card-title', s.name), el('p', 'card-path', `${s.file}:${s.line}`));
  if (s.doc) c.append(el('p', 'card-doc', s.doc));
  trio(c, [[`${Math.round(s.risk * 100)}%`, 'risk'], [num(s.complexity), 'complexity'], [num(s.lineEnd - s.line + 1), 'lines']]);
  const rows = (sideOf) => sideOf.items.slice(0, 6).map(x => ({ name: x.name, sub: `${x.file}:${x.line}`, open: () => openSymbol(x.id) }));
  rowsOf(c, `used by · ${num(s.usedBy.total)}`, rows(s.usedBy), 'Nothing uses it. An entry point, or dead.');
  rowsOf(c, `uses · ${num(s.uses.total)}`, rows(s.uses), 'It calls nothing else here.');
  rowsOf(c, 'in file', [{ name: baseName(s.file), sub: s.file, open: () => openFile(s.file) }], '');
}

// ── Moving around, search, live updates, start ─────────────────────────────────────────────────

function render() { drawStage(); drawSummary(); drawCrumbs(); drawStrip(); drawVerdict(); drawCard(); }
function setLens(id) { lens = lens === id ? null : id; detail = null; hover = null; render(); }

/** Go inside a part: a folder becomes the stage, a file opens its own view. A lone sub-folder is stepped through. */
function enter(node) {
  hover = null;
  if (node.file !== undefined) { openFile(D.files[node.file].path); return; }
  let scope = node.scope;
  for (;;) {
    const kids = childrenOf(scope);
    if (kids.length !== 1 || kids[0].file !== undefined) break;
    scope = kids[0].scope;
  }
  scopes.push(scope);
  detail = null;
  render();
}

/** Jump to a folder or file named on a port or a tag, building the trail down to it. */
function goTo(label) {
  if (D.byPath.has(label)) { openFile(label); return; }
  const mod = D.mods.find(m => label === m.name || label.startsWith(m.name + '/'));
  if (!mod) return;
  const trail = [{ name: mod.name, prefix: mod.name, files: mod.files }];
  const parts = label.split('/');
  for (let depth = mod.name.split('/').length + 1; depth <= parts.length; depth++) {
    const prefix = parts.slice(0, depth).join('/');
    const files = mod.files.filter(i => D.files[i].path.startsWith(prefix + '/'));
    if (!files.length) break;
    trail.push({ name: prefix, prefix, files });
  }
  scopes = trail;
  detail = null;
  hover = null;
  render();
}

let searchTimer = 0;
$('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const text = e.target.value.trim();
  const box = $('search-results');
  if (text.length < 2) { box.hidden = true; return; }
  searchTimer = setTimeout(async () => {
    const hits = (await getJson('/api/search?q=' + encodeURIComponent(text))) || [];
    box.replaceChildren();
    if (hits.length) rowsOf(box, '', hits.slice(0, 8).map(h => ({ name: h.name, sub: `${h.file}:${h.line}`, tag: h.kind, open: () => { box.hidden = true; openSymbol(h.id); } })), '');
    else box.append(el('li', 'empty', 'Nothing has that in its name.'));
    box.hidden = false;
  }, 160);
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== $('search')) { e.preventDefault(); $('search').focus(); }
  if (e.key === 'Escape' && D) {
    $('search-results').hidden = true;
    $('search').blur();
    if (detail) detail = null; else if (lens) lens = null; else scopes.pop();
    hover = null;
    render();
  }
});
window.addEventListener('resize', () => { if (D) drawStage(); });

async function load() {
  const fresh = await getJson('/api/overview');
  if (!fresh || !fresh.files.length) { $('project-summary').textContent = 'empty · run conducks analyze'; return; }
  D = derive(fresh);
  scopes = [];
  hover = null;
  $('project-name').textContent = baseName(fresh.root.replace(/\/+$/, '')) || 'project';
  render();
  // One at a time: all three walk the graph. Each fills in the readings that wait for it.
  const model = D;
  model.gov = await getJson('/api/governance'); if (D === model) render();
  model.dead = await getJson('/api/dead'); if (D === model) render();
  model.flows = await getJson('/api/flows'); if (D === model) render();
}

const pulse = new EventSource('/api/pulse');
pulse.onopen = () => $('live').classList.add('on');
pulse.onerror = () => $('live').classList.remove('on');
pulse.onmessage = () => load();
load();
