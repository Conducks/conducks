// Module-note pages, GENERATED from the .md sources beside them (ADR 0140 in conducks).
//
// The .md under docs/visuals/modules/ is the SOURCE — authored module memory, the agent surface,
// anchor-checked by `conducks visuals-lint`. This renders each note into the styled page a human
// reads, so the same fact needs no second copy. The render carries a DERIVED header because an edit
// made to the .html is discarded by the next render — the header is the only warning a reader gets.
import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, basename, resolve } from 'node:path';
import { BANDS } from './graph.mjs';
import { deriveNoteMap } from './note-map.mjs';
import { REPO } from './visuals.config.mjs';

const ROOT = 'docs/visuals/modules';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The subset of markdown the notes actually use: headings, bold, code spans, links, lists, tables,
// fenced blocks, paragraphs. Deliberately not a full parser — a construct this misses renders as
// visible plain text, which is an honest failure a reader reports.
// `srcDir` is the note's own folder, and it is not optional decoration. A `.md` link was rewritten
// to `.html` unconditionally, which is right for a sibling note — that IS rendered — and wrong for
// everything else in `docs/`. A note citing `../../../decisions/0009-*.md` shipped a link to a
// `.html` that has never existed and never will: four dead links on one page, and `visuals-lint`
// passed the whole time, because a markdown link is not an anchor.
function mdToHtml(md, srcDir) {
  const rendered = h => {                    // does this link point at a note we actually render?
    if (!h.endsWith('.md') || /^[a-z]+:/.test(h) || h.startsWith('/')) return false;
    return !relative(ROOT, resolve(srcDir, h)).startsWith('..');
  };
  const inline = t => esc(t)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, l, h) =>
      `<a href="${rendered(h) ? h.replace(/\.md$/, '.html') : h}">${l}</a>`);

  const out = [];
  const lines = md.split('\n');
  let i = 0, list = null, table = false;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeTable = () => { if (table) { out.push('</tbody></table>'); table = false; } };
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      closeList(); closeTable();
      const fence = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) fence.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`);
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { closeList(); closeTable(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*[-*]\s+/.test(l)) {
      closeTable();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`); i++; continue;
    }
    if (/^\|/.test(l)) {
      closeList();
      if (/^\|[\s:|-]+\|$/.test(l)) { i++; continue; } // separator row
      const cells = l.split('|').slice(1, -1).map(c => inline(c.trim()));
      if (!table) { out.push('<table><tbody>'); table = true; }
      out.push(`<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`); i++; continue;
    }
    if (l.trim() === '') { closeList(); closeTable(); i++; continue; }
    closeList(); closeTable();
    const para = [l];
    for (i++; i < lines.length && lines[i].trim() !== '' && !/^(#|```|\s*[-*]\s|\|)/.test(lines[i]); i++) para.push(lines[i]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  closeList(); closeTable();
  return out.join('\n');
}

function* mdFiles(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* mdFiles(p);
    else if (name.endsWith('.md')) yield p;
  }
}

// Reverse of the block pages' derived links: which canvas blocks cite THIS module. Same map,
// inverted, so the two directions cannot disagree.
const blockMap = new Map();
{
  const fwd = deriveNoteMap(BANDS);
  // Same page-name rule as render.mjs's linkFor — c_tg's page is telegram.html.
  const PAGE = { c_tg: 'telegram' };
  for (const band of BANDS) for (const c of band.containers) {
    for (const note of (fwd.get(c.id) ?? [])) {
      if (!blockMap.has(note)) blockMap.set(note, []);
      blockMap.get(note).push({ page: `${PAGE[c.id] ?? c.id.replace(/^c_/, '')}.html`, title: c.title });
    }
  }
}

let made = 0;
for (const src of mdFiles(ROOT)) {
  const dest = src.replace(/\.md$/, '.html');
  const md = readFileSync(src, 'utf8');
  const up = relative(dirname(src), 'docs/visuals');
  const title = (md.match(/^#\s+(.*)/m) || [, basename(src, '.md')])[1];
  writeFileSync(dest, `<!doctype html>
<meta charset="utf-8">
<title>${esc(REPO)} — ${esc(title)}</title>
<link rel="stylesheet" href="${up}/system.css">
<div class="wrap">
<div class="meta"><b>DERIVED</b> — rendered from <code>${esc(basename(src))}</code> beside this file.
An edit made here is discarded by the next render; edit the .md.</div>
<a class="back" href="${up}/architecture.html">&larr; back to the architecture</a>
${mdToHtml(md, dirname(src))}
${(() => {
  const mod = relative(ROOT, src).slice(0, -3);
  const blocks = blockMap.get(mod) ?? [];
  if (blocks.length === 0) return '';
  const rel = relative(dirname(src), ROOT);
  const links = blocks.map(b => `<a href="${rel ? rel + '/' : ''}${b.page}">${esc(b.title)}</a>`).join(' · ');
  return `<h2>On the canvas</h2>\n<p>cited by ${links} — derived from the block anchors, not curated</p>\n`;
})()}<footer>Source: <code>${esc(src)}</code> — anchors checked by <code>conducks visuals-lint</code>.</footer>
</div>
`);
  made++;
}
// The index — every note one click away, grouped by top-level module. Without it, only the notes
// a canvas block happens to cite are reachable at all (measured: 24 of 94), and an unreachable
// page might as well not exist.
{
  const groups = new Map();
  for (const src of mdFiles(ROOT)) {
    const mod = relative(ROOT, src).slice(0, -3);
    const top = mod.split('/')[0];
    if (!groups.has(top)) groups.set(top, []);
    const firstLine = (readFileSync(src, 'utf8').match(/^#\s+(.*)/m) || [, mod])[1];
    groups.get(top).push({ mod, title: firstLine });
  }
  const secs = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([top, items]) =>
    `<h2>${esc(top)}</h2>\n<ul>\n` + items.sort((a, b) => a.mod.localeCompare(b.mod))
      .map(i => `  <li><a href="${i.mod}.html"><code>${esc(i.mod)}</code></a> — ${esc(i.title.replace(/^[\w/.-]+\s*[—-]\s*/, ''))}</li>`).join('\n')
    + `\n</ul>`).join('\n');
  writeFileSync(join(ROOT, 'index.html'), `<!doctype html>
<meta charset="utf-8">
<title>${esc(REPO)} — module notes</title>
<link rel="stylesheet" href="../system.css">
<div class="wrap">
<div class="meta"><b>DERIVED</b> — generated index of every module note. Edit the .md files, not this page.</div>
<a class="back" href="../architecture.html">&larr; back to the architecture</a>
<h1>Module notes — the authored memory, one per module that earned one</h1>
<p class="sub">${made} notes. Each is SOURCE (.md) rendered to a page; anchors checked by conducks visuals-lint.</p>
${secs}
</div>
`);
}
console.log(`rendered ${made} module notes + index`);
