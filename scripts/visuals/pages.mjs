// The three pages that used to be hand-written HTML, GENERATED from the .md beside each of them
// (ADR 0154, todo74#P2): docs/visuals/index.md, problems.md, holding.md.
//
// These are prose pages with fields, the same kind of source as a module note (ADR 0140,
// scripts/visuals/notes.mjs) — headings, bold, code spans, links, tables, paragraphs — plus four
// small fenced blocks this narrow dialect needs that plain markdown has no shape for: a callout box
// (`.meta`), a side note (`.elsewhere`), a card grid (`.grid`/`.card`) and the page's own closing
// `<footer>`. `notes.mjs` itself is shared byte-for-byte with other repos (conducks-visuals §0) and
// may not be edited to add these, so this file is a sibling renderer with its own copy of the same
// inline-formatting logic rather than a change to that one.
//
// Grammar:
//   # Title                               first line
//   Provenance: <text>                    optional, right after the title — same declared form as
//                                          conducks-docs §6.13, carried to the rendered page's
//                                          footer rather than left in an invisible HTML comment
//   <plain prose line>                    optional, directly after Provenance (or the title if
//                                          there is none): the page's own <p class="sub">, the same
//                                          "line right after carries a special role if it reads as
//                                          plain prose" convention testing.mjs uses for a section's
//                                          blurb
//   ## Heading                            an <h2>
//   :::meta / :::elsewhere / :::grid / :::footer ... :::
//                                          a fenced block. Inside `meta` and `elsewhere`, blank-line
//                                          separated paragraphs join with <br><br> (matching what
//                                          the original hand-written pages already did) rather than
//                                          becoming separate <p> tags. Inside `grid`, each
//                                          `#### [text](href)` opens a card; the paragraph(s) after
//                                          it are the card's body. `footer` renders its content
//                                          directly inside <footer>, with no wrapping <p> — the
//                                          original footer never had one either.
//   | cell | cell |                       a table: first row is the header, the next row (the
//                                          `---` separator) is consumed and produces nothing, the
//                                          rest are body rows.
//   plain paragraph                       everything else, blank-line terminated, wrapped in <p>.
import { writeFileSync, readFileSync } from 'node:fs';
import { REPO } from './visuals.config.mjs';

/**
 * @typedef {{title: string, provenance: string | null, sub: string, blocksHtml: string}} ParsedPage
 */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bold, code spans and links — the inline vocabulary these three pages actually use. */
const inline = t => esc(t)
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, l, h) => `<a href="${h}">${l}</a>`);

// Blank-line-separated paragraphs inside a fenced block, each inline-formatted and joined with
// <br><br> — the join the source pages already used for a callout with more than one paragraph in
// it, rather than a second <p>.
function paragraphsOf(lines) {
  const paras = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === '') { if (cur.length) { paras.push(cur.join(' ')); cur = []; } }
    else cur.push(l.trim());
  }
  if (cur.length) paras.push(cur.join(' '));
  return paras.map(inline);
}

function renderTable(rows) {
  const cellsOf = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const [head, sep, ...body] = rows;
  if (!/^\|[\s:|-]+\|?$/.test(sep)) throw new Error(`table missing its "---" separator row: ${sep}`);
  const th = cellsOf(head).map(c => `<th>${inline(c)}</th>`).join('');
  const trs = body.map(r => `<tr>${cellsOf(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n');
  return `<table><thead><tr>${th}</tr></thead><tbody>\n${trs}\n</tbody></table>`;
}

function renderFence(name, lines) {
  if (name === 'meta') return `<div class="meta">${paragraphsOf(lines).join('<br><br>')}</div>`;
  if (name === 'elsewhere') return `<p class="elsewhere">${paragraphsOf(lines).join('<br><br>')}</p>`;
  if (name === 'footer') return `<footer>${paragraphsOf(lines).join('<br><br>')}</footer>`;
  if (name === 'grid') {
    const cards = [];
    let i = 0;
    while (i < lines.length) {
      const h = lines[i].match(/^#### \[([^\]]+)\]\(([^)]+)\)/);
      if (!h) throw new Error(`expected "#### [text](href)" inside :::grid, got: ${lines[i]}`);
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith('#### '); i++) body.push(lines[i]);
      cards.push(`<div class="card"><h4><a href="${h[2]}">${esc(h[1])}</a></h4>\n${paragraphsOf(body).map(p => `<p>${p}</p>`).join('\n')}</div>`);
    }
    return `<div class="grid">${cards.join('\n')}</div>`;
  }
  throw new Error(`unknown fenced block ":::${name}"`);
}

/** Parses the body (everything after the title/Provenance/sub) into rendered HTML blocks. */
function parseBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '') { i++; continue; }
    const h2 = l.match(/^## (.*)/);
    if (h2) { out.push(`<h2>${esc(h2[1])}</h2>`); i++; continue; }
    const fence = l.match(/^:::(\S+)/);
    if (fence) {
      const inner = [];
      for (i++; i < lines.length && lines[i].trim() !== ':::'; i++) inner.push(lines[i]);
      if (i >= lines.length) throw new Error(`":::${fence[1]}" block never closed with ":::"`);
      i++; // consume closing ':::'
      out.push(renderFence(fence[1], inner));
      continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      out.push(renderTable(rows));
      continue;
    }
    const para = [l];
    for (i++; i < lines.length && lines[i].trim() !== '' && !/^(##|:::|\|)/.test(lines[i]); i++) para.push(lines[i]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

/**
 * @param {string} md
 * @returns {ParsedPage}
 */
export function parsePage(md) {
  const lines = md.split('\n');
  const titleMatch = lines[0]?.match(/^#\s+(.*)/);
  if (!titleMatch) throw new Error('page .md must open with "# Title"');
  const title = titleMatch[1];
  let i = 1;
  let provenance = null;
  const pm = lines[i]?.match(/^Provenance:\s*(.*)/);
  if (pm) { provenance = pm[1]; i++; }
  while (i < lines.length && lines[i].trim() === '') i++;
  let sub = '';
  if (i < lines.length && lines[i].trim() !== '' && !/^(##|:::|\|)/.test(lines[i])) {
    sub = lines[i].trim();
    i++;
  }
  while (i < lines.length && lines[i].trim() === '') i++;
  const blocksHtml = parseBlocks(lines.slice(i));
  return { title, provenance, sub, blocksHtml };
}

const NAV = [
  { href: 'index.html', label: 'Start here', desc: 'what these pages are, and the rules that bound them' },
  { href: 'architecture.html', label: 'Architecture', desc: 'the whole wiring, one canvas' },
  { href: 'problems.html', label: 'Problems', desc: 'what is broken, and who owns it' },
  { href: 'holding.html', label: 'Holding', desc: 'read, true, not yet placed' },
];

function renderNav(current) {
  const items = NAV.map(n =>
    `  <a href="${n.href}"${n.href === current ? ' class="here"' : ''}><b>${n.label}</b>${n.desc}</a>`);
  return `<nav class="pages">\n${items.join('\n')}\n</nav>`;
}

/**
 * @param {string} md
 * @param {{src: string, titleSuffix: string, current: string}} meta
 * @returns {string}
 */
export function renderPage(md, meta) {
  const { title, provenance, sub, blocksHtml } = parsePage(md);
  return `<!doctype html>
<meta charset="utf-8">
<title>${esc(REPO)} visuals — ${esc(meta.titleSuffix)}</title>
<link rel="stylesheet" href="system.css">
<div class="wrap">
<div class="meta"><b>DERIVED</b> — rendered from <code>${esc(meta.src)}</code> beside this file. An
edit made here is discarded by the next render; edit the .md.</div>
${renderNav(meta.current)}
<h1>${esc(title)}</h1>
<p class="sub">${esc(sub)}</p>
${blocksHtml}
<footer class="readlog">${esc(provenance ?? '')}</footer>
</div>
`;
}

const PAGES = [
  { src: 'index.md', dest: 'index.html', titleSuffix: 'start here', current: 'index.html' },
  { src: 'problems.md', dest: 'problems.html', titleSuffix: 'problems', current: 'problems.html' },
  { src: 'holding.md', dest: 'holding.html', titleSuffix: 'holding', current: 'holding.html' },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of PAGES) {
    const md = readFileSync(`docs/visuals/${p.src}`, 'utf8');
    writeFileSync(`docs/visuals/${p.dest}`, renderPage(md, p));
  }
  console.log(`rendered ${PAGES.length} pages: ${PAGES.map(p => p.dest).join(', ')}`);
}
