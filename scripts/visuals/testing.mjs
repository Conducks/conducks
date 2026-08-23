// The testing page, GENERATED from docs/visuals/testing.md (ADR 0154, todo74#P1).
//
// testing.md is the SOURCE — a human writes it, a human reads it in a diff. This file is the one
// parser for that grammar and the one renderer of it; a second reader (the ForgeTerm terminal
// plugin, todo74#P3) is tested against the SAME FIXTURE this file's own tests use, so "one owner"
// is something a test checks rather than something the two repos merely promise.
//
// Grammar (a narrowed dialect of the line grammar `conducks-docs` §5 already lints, since testing.md
// is not one of the six linted file types — deviations are named where they diverge):
//   # Title                              first line
//   Provenance: authored | ...           before the first `##`, same declared form as §6.13
//   ## Section                           a group of features; the line right after it, if it is
//                                        plain prose (not `###`/`-`/blank), is the section's blurb
//   ### <id> — <name>                    a feature. `###` groups tasks under a `##` the same way
//                                        `conducks-docs` §5.1 already lets it group a todo phase —
//                                        it is not a second-level SECTION here either.
//   - How: <text>                        one field, required
//   - Note: <text>                       one field, optional
//   - [ ] <id> <task text>               a task. DEVIATION 1: the id is written as the task's own
//                                        first token, because docs-lint's `- [ ]` carries no
//                                        per-task address at all — one is required here so a
//                                        tester's tick stays attached to the same question across
//                                        edits (conducks-visuals §0 rule 3).
//   ... <task text> — Pass: <expected>   DEVIATION 2: the em-dash clause docs-lint reserves for a
//                                        `[>]`/`[-]` REASON is reused here for a task's PASS
//                                        condition. Only tasks the source split on `||` carry one;
//                                        for the rest the task's own wording IS the pass condition
//                                        (todo74#P1 asks for "what a pass looks like" per task, and
//                                        writing a second, redundant sentence for every one of the
//                                        332 tasks that already say it plainly would be inventing
//                                        text the source never had).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { REPO } from './visuals.config.mjs';

/**
 * @typedef {{id: string, marker: string, text: string, pass: string | null}} Task
 * @typedef {{id: string, name: string, how: string, note: string, tasks: Task[]}} Feature
 * @typedef {{title: string, blurb: string, features: Feature[]}} Section
 * @typedef {{title: string, provenance: string | null, build: string | null, sections: Section[]}} ParsedTesting
 * @typedef {{id: string, text: string, movedFrom: string[]}} RenumberViolation
 */

/** @param {unknown} s @returns {string} */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Parse testing.md into { title, provenance, sections }. Throws on the one thing that would make
 * the rest of this file silently wrong: a duplicate task id, anywhere in the document. Everything
 * else in the grammar above is easy to write correctly by hand; a repeated id is not, and it is
 * exactly the failure mode of a bad renumber (two tasks now sharing one address).
 *
 * @param {string} md
 * @returns {ParsedTesting}
 */
export function parseTesting(md) {
  const lines = md.split('\n');
  let i = 0;
  const titleMatch = lines[0]?.match(/^#\s+(.*)/);
  if (!titleMatch) throw new Error('testing.md must open with "# Title"');
  const title = titleMatch[1];
  i = 1;
  let provenance = null;
  let build = null;
  while (i < lines.length && !lines[i].startsWith('## ')) {
    const m = lines[i].match(/^Provenance:\s*(.*)/);
    if (m) provenance = m[1];
    // Which BUILD this pass is against — set by the person running it. See the
    // long note at `renderTesting`: it is authored rather than derived, because
    // both automatic answers are wrong in different ways.
    const b = lines[i].match(/^Build:\s*(\S+)/);
    if (b) build = b[1];
    i++;
  }

  const sections = [];
  const seenIds = new Map(); // task id -> "F<n> — first words", for the duplicate check

  while (i < lines.length) {
    const secH = lines[i].match(/^## (.*)/);
    if (!secH) { i++; continue; }
    const section = { title: secH[1], blurb: '', features: [] };
    i++;
    if (i < lines.length && lines[i].trim() !== '' && !/^(###|-|##)/.test(lines[i])) {
      section.blurb = lines[i].trim();
      i++;
    }
    while (i < lines.length && lines[i].trim() === '') i++;

    while (i < lines.length && lines[i].startsWith('### ')) {
      const fh = lines[i].match(/^### (\S+) — (.*)/);
      if (!fh) throw new Error(`bad feature heading, expected "### <id> — <name>": ${lines[i]}`);
      const feature = { id: fh[1], name: fh[2], how: '', note: '', tasks: [] };
      i++;
      while (i < lines.length && lines[i].startsWith('- ')) {
        const how = lines[i].match(/^- How: (.*)/);
        const note = lines[i].match(/^- Note: (.*)/);
        const task = lines[i].match(/^- \[([ xX>-])\] (\S+) (.*)/);
        if (how) feature.how = how[1];
        else if (note) feature.note = note[1];
        else if (task) {
          const [, marker, id, rest] = task;
          if (seenIds.has(id)) {
            throw new Error(
              `duplicate task id ${id} (also used by "${seenIds.get(id)}") — ids must be unique ` +
              `and are never reused, see conducks-visuals §0 rule 3`);
          }
          seenIds.set(id, rest.slice(0, 40));
          const passSplit = rest.split(' — Pass: ');
          feature.tasks.push({
            id, marker,
            text: passSplit[0],
            pass: passSplit.length > 1 ? passSplit.slice(1).join(' — Pass: ') : null,
          });
        } else {
          throw new Error(`unrecognised line under ${feature.id}: ${lines[i]}`);
        }
        i++;
      }
      section.features.push(feature);
      while (i < lines.length && lines[i].trim() === '') i++;
    }
    sections.push(section);
  }
  return { title, provenance, build, sections };
}

/**
 * Detects a renumbering: a task's TEXT moved to a different id than the one that carried it
 * before. That is the one shape `conducks-visuals` §0 rule 3 forbids ("append tasks, never
 * renumber them, or a tester's saved progress moves to a different question") — a tester's tick is
 * keyed by id, so if id F2.T5 used to mean "the sidebar icon reappears" and now means whatever used
 * to be F2.T4, a saved tick silently answers the wrong question. A same-id wording fix, or a
 * brand-new appended id, produces no match here and is not flagged.
 *
 * `oldTasks`/`newTasks` are Map<id, text> (build one with `taskMap(parseTesting(md))`).
 *
 * @param {Map<string, string>} oldTasks
 * @param {Map<string, string>} newTasks
 * @returns {RenumberViolation[]}
 */
export function detectRenumbering(oldTasks, newTasks) {
  const oldTextOwners = new Map(); // text -> [ids] that held it before
  for (const [id, text] of oldTasks) {
    if (!oldTextOwners.has(text)) oldTextOwners.set(text, []);
    oldTextOwners.get(text).push(id);
  }
  const violations = [];
  for (const [id, text] of newTasks) {
    if (oldTasks.get(id) === text) continue; // same id, same text: untouched
    const owners = oldTextOwners.get(text);
    if (owners && !owners.includes(id)) {
      violations.push({ id, text, movedFrom: owners });
    }
  }
  return violations;
}

/**
 * Flattens a parsed document to Map<task id, task text> for `detectRenumbering`.
 * @param {ParsedTesting} parsed
 * @returns {Map<string, string>}
 */
export function taskMap(parsed) {
  const m = new Map();
  for (const sec of parsed.sections) for (const f of sec.features) for (const t of f.tasks) m.set(t.id, t.text);
  return m;
}

function renderTask(t) {
  const passLine = t.pass ? `<span class="pass">Pass: ${t.pass}</span>` : '';
  return `<li data-tid="${esc(t.id)}">
  <input type="checkbox" id="c-${esc(t.id)}">
  <label for="c-${esc(t.id)}"><b>${esc(t.id)}</b> ${t.text}${passLine}</label>
  <input type="text" id="n-${esc(t.id)}" placeholder="worked? leave blank. problem? describe it">
</li>`;
}

function renderFeature(f) {
  return `<article data-fid="${esc(f.id)}">
<h3><b>${esc(f.id)}</b> ${esc(f.name)} <span class="tally">0/${f.tasks.length}</span></h3>
<p class="sub">${f.how}</p>
${f.note ? `<p class="sub">${f.note}</p>` : ''}
<ul>${f.tasks.map(renderTask).join('\n')}</ul>
</article>`;
}

// The client-side behaviour is intentionally the load-bearing part of §0's rules 2, 3 and 6 only:
// a tick AND a note per task, kept in localStorage keyed by this build, and a report that OMITS
// what nobody touched (rule 4). §6b's cross-browser clipboard/file continuity is NOT ported here —
// that is more machinery than todo74#P1 asks for (the parser and the first source) and is named as
// a gap in the phase's own report rather than built silently.
function clientScript(build) {
  return `
const BUILD = ${JSON.stringify(build)};
const KEY = "conducks-testing:" + BUILD + ":";
const tasks = () => [...document.querySelectorAll('article > ul > li')];
const box = t => t.querySelector('input[type=checkbox]');
const note = t => t.querySelector('input[type=text]');
function load() {
  tasks().forEach(t => {
    box(t).checked = localStorage.getItem(KEY + t.dataset.tid + ':c') === '1';
    note(t).value = localStorage.getItem(KEY + t.dataset.tid + ':n') || '';
  });
}
function save(t) {
  localStorage.setItem(KEY + t.dataset.tid + ':c', box(t).checked ? '1' : '0');
  localStorage.setItem(KEY + t.dataset.tid + ':n', note(t).value);
  if (typeof writeSoon === 'function') writeSoon();
}
function refresh() {
  let total = 0, done = 0, issues = 0;
  document.querySelectorAll('article').forEach(art => {
    const ts = [...art.querySelectorAll('li')];
    let d = 0, n = 0;
    ts.forEach(t => { if (box(t).checked) d++; if (note(t).value.trim()) n++; });
    total += ts.length; done += d; issues += n;
    art.querySelector('.tally').textContent = n ? \`\${d}/\${ts.length} · \${n} issue\${n > 1 ? 's' : ''}\` : \`\${d}/\${ts.length}\`;
  });
  const bar = document.getElementById('tallies');
  if (bar) bar.textContent = \`\${done}/\${total} tested · \${total - done} untested · \${issues} with issues\`;
}
document.addEventListener('input', e => {
  const t = e.target.closest('li');
  if (!t) return;
  save(t); refresh();
});
function report() {
  const out = [], skipped = [];
  let total = 0, done = 0, issues = 0;
  document.querySelectorAll('article').forEach(art => {
    const rows = [];
    let d = 0, n = 0;
    [...art.querySelectorAll('li')].forEach(t => {
      total++;
      const checked = box(t).checked, txt = note(t).value.trim();
      if (checked) { d++; done++; }
      if (txt) { n++; issues++; }
      if (!checked && !txt) return;
      rows.push(\`- [\${checked ? 'x' : ' '}] \${t.dataset.tid} \${t.querySelector('label').textContent.replace(/^\\S+\\s*/, '')}\`);
      if (txt) rows.push(\`      ⚠ \${t.dataset.tid}: \${txt}\`);
    });
    const fid = art.dataset.fid;
    const tally = art.querySelectorAll('li').length;
    if (!rows.length) { skipped.push(fid); return; }
    out.push(\`## \${fid} · \${d}/\${tally} tested\${n ? \`, \${n} issue\${n > 1 ? 's' : ''}\` : ''}\`, ...rows, '');
  });
  const top = [\`# Test pass, build \${BUILD}\`, '', \`\${done}/\${total} tasks tested · \${total - done} untested · \${issues} with issues\`];
  if (skipped.length) top.push(\`Not opened at all: \${skipped.join(', ')}\`);
  top.push('');
  return top.concat(out.length ? out : ['Nothing ticked yet.']).join('\\n');
}
async function toClipboard(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
}
const said = document.getElementById('said');
function say(msg) {
  if (!said) return;
  said.textContent = msg;
  said.classList.add('on');
  setTimeout(() => said.classList.remove('on'), 2400);
}
document.getElementById('copy')?.addEventListener('click', async () => {
  await toClipboard(report()); say('Report copied');
});

// Progress as JSON, and the refusal that gives the build stamp its value.
function progress() {
  const kept = {};
  tasks().forEach(t => {
    const c = box(t).checked, n = note(t).value.trim();
    if (c || n) kept[t.dataset.tid] = [c ? 1 : 0, n];
  });
  return JSON.stringify({ build: BUILD, tasks: kept });
}
function restore(text) {
  let data;
  try { data = JSON.parse(text); } catch { return 'That is not progress JSON.'; }
  // The build check is the whole value of stamping the build. A stamp nobody
  // checks is decoration (conducks-visuals §6).
  if (!data || data.build !== BUILD) {
    return 'That progress was made against build ' + ((data && data.build) || '?') + ', and this page is ' + BUILD + '. Refused.';
  }
  tasks().forEach(t => {
    const got = data.tasks && data.tasks[t.dataset.tid];
    box(t).checked = !!(got && got[0]);
    note(t).value = (got && got[1]) || '';
    save(t);
  });
  refresh();
  return 'Restored.';
}

// **A file, because clearing browser data is one click and an hour of work.**
//
// Everything above lives in localStorage, which the browser treats as
// disposable: clearing site data, a private window closing, or a wiped profile
// all take it. Fine for a five minute check, wrong for a pass that takes an
// hour. The handle cannot go in localStorage — it is not JSON — so it goes in
// IndexedDB, the only place a handle survives a reload.
const FS_OK = typeof window.showSaveFilePicker === 'function';
const DB = 'testing-progress', STORE = 'handles';
function idb() {
  return new Promise((ok, no) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error);
  });
}
async function keepHandle(h) {
  const db = await idb();
  await new Promise(ok => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(h, BUILD);
    tx.oncomplete = ok;
  });
}
async function heldHandle() {
  try {
    const db = await idb();
    return await new Promise(ok => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(BUILD);
      req.onsuccess = () => ok(req.result || null);
      req.onerror = () => ok(null);
    });
  } catch { return null; }
}
let handle = null;
// Debounced. A tick is a keystroke away from the next one, and opening the
// same file twice in a row is how it ends up half written.
let pending = null;
function writeSoon() {
  if (!handle) return;
  clearTimeout(pending);
  pending = setTimeout(async () => {
    try {
      const w = await handle.createWritable();
      await w.write(progress());
      await w.close();
    } catch { say('Could not write the file. It is still saved in this browser.'); handle = null; }
  }, 400);
}
async function connect(existing) {
  handle = existing || await window.showSaveFilePicker({
    suggestedName: 'testing-' + BUILD + '.json',
    types: [{ description: 'Testing progress', accept: { 'application/json': ['.json'] } }],
  });
  await keepHandle(handle);
  document.getElementById('link').hidden = true;
  document.getElementById('relink').hidden = true;
  writeSoon();
  say('This file now updates as you tick');
}
// One path per browser, never both. A browser that can keep a file up to date
// needs no Save and no Load — the file IS the save. A browser that cannot gets
// the manual pair and never sees a button it could not honour.
if (!FS_OK) {
  document.getElementById('download').hidden = false;
  document.getElementById('upload').hidden = false;
} else {
  document.getElementById('link').hidden = false;
  document.getElementById('link').addEventListener('click', () => connect().catch(() => {}));
  document.getElementById('relink').addEventListener('click', async () => {
    const held = await heldHandle();
    if (!held) return connect().catch(() => {});
    // Reconnecting needs a click. A browser will not hand back write access to
    // a file from a previous visit without one, and that is the right rule.
    const ok = await held.requestPermission({ mode: 'readwrite' });
    if (ok !== 'granted') { say('Not allowed to write that file'); return; }
    const text = await (await held.getFile()).text();
    if (text.trim()) say(restore(text));
    connect(held).catch(() => {});
  });
  heldHandle().then(async held => {
    if (!held) return;
    const state = await held.queryPermission({ mode: 'readwrite' });
    if (state === 'granted') {
      const text = await (await held.getFile()).text();
      if (text.trim()) restore(text);
      connect(held).catch(() => {});
    } else {
      document.getElementById('link').hidden = true;
      document.getElementById('relink').hidden = false;
    }
  }).catch(() => {});
}
document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([progress()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'testing-' + BUILD + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  say('Saved to your downloads');
});
const fileEl = document.getElementById('file');
document.getElementById('upload').addEventListener('click', () => fileEl.click());
fileEl.addEventListener('change', async () => {
  const f = fileEl.files && fileEl.files[0];
  if (!f) return;
  say(restore(await f.text()));
  fileEl.value = '';
});
document.getElementById('clear')?.addEventListener('click', e => {
  e.preventDefault();
  if (!confirm('Clear every tick and note on this page?')) return;
  Object.keys(localStorage).filter(k => k.startsWith(KEY)).forEach(k => localStorage.removeItem(k));
  load(); refresh();
});
load(); refresh();
`;
}

/**
 * Renders the parsed source to the published HTML page. `system.css` is a shared file this repo
 * may not edit locally, so the markup below deliberately uses only the classes it already defines
 * (`.wrap`, `.sub`, `.meta`, `.back`, `footer.readlog`) rather than inventing page-specific ones —
 * see the gap this leaves, named in the phase report: a `.testingpage` class family (tally badges,
 * an "issue" highlight) would need adding to `system.css` in every repo that shares it at once
 * (`conducks-visuals` §0), which is outside what this agent may touch.
 *
 * @param {string} md
 * @returns {string}
 */
export function renderTesting(md) {
  const parsed = parseTesting(md);
  // **The build a tester is testing, not a hash of this file.**
  //
  // It was the source's own hash, which voids ticks when the TASK LIST changes
  // and keeps them when the BINARY does — backwards, and exactly what
  // `conducks-visuals` §6 refuses: a tick carried across a build looks like
  // proof and is not. A source hash is automatic and answers the wrong
  // question.
  //
  // It is not derived from the repository either, however tempting. Baking
  // `git rev-parse HEAD` into a generated page makes it change on every commit,
  // so the drift gate — whose whole job is "the data changed and the page did
  // not" — would fire for a reason unrelated to what it checks, and a gate that
  // cries wolf is one people switch off (§0 records that exact mistake).
  //
  // So it is AUTHORED: a `Build:` line the person running the pass sets to
  // whatever they are testing. A human has to bump it, which is the same
  // discipline the page had before, and now the value is visible in the source
  // and reviewable in a diff. Falling back to the source hash when it is absent
  // keeps an unstamped page working rather than failing shut.
  const build = parsed.build ?? createHash('sha256').update(md).digest('hex').slice(0, 7);
  const body = parsed.sections.map(sec => `<h2>${esc(sec.title)}</h2>
${sec.blurb ? `<p class="sub">${esc(sec.blurb)}</p>` : ''}
${sec.features.map(renderFeature).join('\n')}`).join('\n');

  return `<!doctype html>
<meta charset="utf-8">
<title>${esc(REPO)} — testing</title>
<link rel="stylesheet" href="system.css">
<div class="wrap">
<div class="meta"><b>DERIVED</b> — rendered from <code>testing.md</code> beside this file. An edit
made here is discarded by the next render; edit the .md.</div>
<a class="back" href="index.html">&larr; back to the architecture</a>
<h1>${esc(parsed.title)}</h1>
<p class="sub">Build <code>${build}</code>${parsed.build ? '' : ' — <b>unstamped</b>, so this is a hash of the task list rather than the build you are testing. Add a <code>Build:</code> line to testing.md'}.
Progress is kept in this browser only and keyed to that value, so it is refused the moment it changes —
a tick carried across a build looks like proof and is not.</p>
${body}
<div class="tallies" id="tallies">…</div>
<div class="actions">
  <button type="button" class="go" id="copy">Copy report</button>
  <button type="button" id="link" hidden>Keep a file up to date</button>
  <button type="button" id="relink" hidden>Reconnect file</button>
  <button type="button" id="download" hidden>Save to file</button>
  <button type="button" id="upload" hidden>Load from file</button>
  <input type="file" id="file" accept="application/json,.json" hidden>
  <span class="said" id="said">Copied</span>
  <a href="#" class="wipe" id="clear">Clear all ticks</a>
</div>
<footer class="readlog">${esc(parsed.provenance ?? 'Provenance: authored')}</footer>
</div>
<script>${clientScript(build)}</script>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = 'docs/visuals/testing.md';
  // A testing SOURCE belongs to the repository it describes, not to the one
  // that owns the parser (ADR 0154, amended). So this renderer ships to every
  // repo and most of them have no testing.md — that is the normal case, not a
  // failure, and throwing here would break `npm run visuals` everywhere the
  // page does not exist.
  if (!existsSync(src)) {
    console.log('no docs/visuals/testing.md in this repository — nothing to render');
    process.exit(0);
  }
  const md = readFileSync(src, 'utf8');
  writeFileSync('docs/visuals/testing.html', renderTesting(md));
  const { sections } = parseTesting(md);
  const features = sections.reduce((n, s) => n + s.features.length, 0);
  const tasks = sections.reduce((n, s) => n + s.features.reduce((m, f) => m + f.tasks.length, 0), 0);
  console.log(`rendered testing.html — ${sections.length} sections, ${features} features, ${tasks} tasks`);
}
