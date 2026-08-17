// Detail pages, GENERATED from the same data the canvas is drawn from.
//
// Every block on the canvas should open somewhere. Hand-writing a page per block would guarantee
// drift — the hover would say one thing and the page another — so the page is built from `graph.mjs`
// and cannot disagree with the picture by construction. Prose that is worth more than the anchor
// still lives in the hand-written pages under `modules/`; this fills the gap for the rest.
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { BANDS, pageFor } from './graph.mjs';
import { deriveNoteMap } from './note-map.mjs';
import { REPO, HAND_WRITTEN } from './visuals.config.mjs';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NAV = `<nav class="pages">
  <a href="../index.html"><b>Start here</b>what these pages are, and the rules that bound them</a>
  <a href="../architecture.html"><b>Architecture</b>the whole wiring, one canvas</a>
  <a href="../problems.html"><b>Problems</b>what is broken, and who owns it</a>
  <a href="../holding.html"><b>Holding</b>read, true, not yet placed</a>
</nav>
`;


mkdirSync('docs/visuals/modules', { recursive: true });
const NOTE_MAP = deriveNoteMap(BANDS);
let made = 0, blocks = 0;

for (const band of BANDS) {
  for (const c of band.containers) {
    if (HAND_WRITTEN.has(c.id)) continue;
    const file = pageFor(c.id);
    const secs = c.nodes.map(n => {
      // The anchor is the first file:line-ish token; the rest of the hover is the explanation.
      const m = n.hov.match(/^([^—]+?)(?:\s+—\s+([\s\S]+))?$/);
      const where = (m ? m[1] : n.hov).trim();
      const why = (m && m[2] ? m[2] : '').trim();
      return `<div class="det" id="${n.id}">
  <h3>${esc(n.t)}</h3>
  <div class="where">${esc(where)}</div>
${why ? `  <p>${esc(why)}</p>\n` : ''}${n.s ? `  <p class="file">on the canvas: ${esc(n.s)}</p>\n` : ''}</div>
`;
    }).join('\n');
    const edges = c.edges.length
      ? `<h2>How these connect</h2>\n<table>\n  <thead><tr><th>from</th><th>to</th><th>when</th></tr></thead>\n  <tbody>\n`
        + c.edges.map(([s, t, l]) => {
            const nm = id => esc(c.nodes.find(n => n.id === id)?.t ?? id);
            return `    <tr><td>${nm(s)}</td><td>${nm(t)}</td><td>${l ? esc(l) : '—'}</td></tr>`;
          }).join('\n')
        + `\n  </tbody>\n</table>\n`
      : '';
    const noteLinks = (NOTE_MAP.get(c.id) ?? [])
      .map(n => `  <a href="${n}.html"><code>${esc(n)}</code></a>`).join('\n');
    const notesSec = noteLinks
      ? `<h2>Module notes</h2>\n<p class="sub">the authored memory of the modules this block cites — derived from the anchors above, not curated</p>\n<p>\n${noteLinks}\n</p>\n`
      : '';
    writeFileSync(`docs/visuals/modules/${file}`, `<!doctype html>
<meta charset="utf-8">
<title>${esc(REPO)} — ${esc(c.title.toLowerCase())}</title>
<link rel="stylesheet" href="../system.css">
<div class="wrap">
${NAV}<a class="back" href="../architecture.html">&larr; back to the architecture</a>
<h1>${esc(c.title)}</h1>
<p class="sub">${esc(c.sub || '')}</p>
<div class="meta">
  <b>DERIVED</b> — generated from the same data the canvas is drawn from (scripts/visuals/graph.mjs),
  so a block's hover and its entry here cannot disagree. An edit made here is discarded by the next
  render. <b>Arrived by clicking a block?</b> It is highlighted below.
</div>

${secs}${edges}${notesSec}<footer>
  Every anchor on this page is checked by <code>conducks visuals-lint</code>.
</footer>
</div>
`);
    made++; blocks += c.nodes.length;
  }
}
console.log(`generated ${made} detail pages covering ${blocks} blocks`);

// The five HAND-WRITTEN pages get their note links injected, not typed.
//
// They are skipped by the generator above because their prose says more than the data can — and that
// skip cost them the one part of the page that must NOT be hand-written. Every generated page linked
// on to the module notes for the files its blocks cite; the entry pages, which are where a reader
// actually starts, dead-ended. The chain ran canvas → block → detail → nothing.
//
// So the prose stays authored and the links stay derived (§8), separated by a marker block that is
// rewritten every run. Idempotent by construction: the block is replaced, never appended, so this
// cannot slowly grow copies of itself.
{
  const OPEN = '<!-- notes:derived — rewritten by detail.mjs; do not edit between these markers -->';
  const CLOSE = '<!-- /notes:derived -->';
  let injected = 0;
  for (const band of BANDS) for (const c of band.containers) {
    if (!HAND_WRITTEN.has(c.id)) continue;
    const file = `docs/visuals/modules/${pageFor(c.id)}`;
    if (!existsSync(file)) continue;
    const notes = NOTE_MAP.get(c.id) ?? [];
    let page = readFileSync(file, 'utf8');
    // Always strip the previous block first — a container whose blocks stopped citing a noted
    // module must LOSE its links, or the page keeps advertising a connection that no longer exists.
    // Eat ALL surrounding newlines on the way out and write back an exact count on the way in.
    // With `\n?` on the strip and a `\n` on the insert the two did not balance, so every run added
    // one blank line: the page was never wrong, and never twice the same — which the drift gate
    // reported as permanently stale. An injector has to be a fixed point, not merely correct once.
    page = page.replace(new RegExp(`\\n*${OPEN}[\\s\\S]*?${CLOSE}\\n*`), '\n');
    if (notes.length) {
      const body = `${OPEN}\n<h2>Module notes</h2>\n`
        + `<p class="sub">the authored memory of the modules this page cites — derived from its anchors, not curated</p>\n<p>\n`
        + notes.map(n => `  <a href="${n}.html"><code>${esc(n)}</code></a>`).join('\n')
        + `\n</p>\n${CLOSE}\n`;
      page = page.replace(/\n*(<footer>)/, `\n${body}$1`);
      injected++;
    }
    writeFileSync(file, page);
  }
  console.log(`injected note links into ${injected} hand-written page(s)`);
}

// EVERY LINK MUST LAND, not merely resolve.
//
// `visuals-lint` checks the anchors a page CLAIMS about the code. Nothing checked the links the
// canvas makes to its own pages, and that hid a real break: the container `c_cli` derived
// `modules/cli.html`, the module note `modules/cli.md` rendered to the same path, the note won, and
// the hand-written entry page was overwritten. Three canvas blocks then opened a page with no
// `#cmd`, `#cown` or `#cvoice` in it. Every gate passed — the file existed, so a file-level check
// saw nothing, and the anchors inside the surviving page were all true.
//
// Two failures, one cause: a shared namespace between the DERIVED canvas pages and the MIRRORED
// note tree. Check both, because the collision is silent and the broken fragment is its symptom.
{
  const bad = [];

  // 1 · a canvas page and a module note may never claim the same path
  const derived = new Set(BANDS.flatMap(b => b.containers.map(c => pageFor(c.id))));
  for (const f of readdirSync('docs/visuals/modules'))
    if (f.endsWith('.md') && derived.has(f.replace(/\.md$/, '.html')))
      bad.push(`collision: modules/${f} and a canvas container both render to ${f.replace(/\.md$/, '.html')}`);

  // 2 · every fragment the canvas links to must exist in the page it opens
  const page = readFileSync('docs/visuals/architecture.html', 'utf8');
  for (const [, file, frag] of page.matchAll(/href="((?!\.\.|https?:)[^"#]+)#([^"]+)"/g)) {
    const p = `docs/visuals/${file}`;
    if (!existsSync(p)) { bad.push(`missing page: ${file} (linked with #${frag})`); continue; }
    if (!readFileSync(p, 'utf8').includes(`id="${frag}"`)) bad.push(`dead link: ${file}#${frag}`);
  }

  if (bad.length) {
    console.error('DETAIL PAGES REFUSED:');
    for (const b of [...new Set(bad)]) console.error('  -', b);
    process.exit(1);
  }
}
