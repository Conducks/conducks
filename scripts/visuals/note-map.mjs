// The canvas→note map, DERIVED — never hand-curated.
//
// A block's hovers cite files; files live in module directories; module directories have notes.
// Deriving the map from those citations is what keeps it honest: a hand-written pairing of 25
// blocks to 90+ notes would be guesswork the day it is written and a lie the day a block moves.
// A block that cites no noted module simply gets no links — absence is the correct answer.
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const NOTES_ROOT = 'docs/visuals/modules';
const CODE_ROOTS = ['src', 'electron', 'renderer', 'tests', 'scripts'];
const ANCHOR_RE = /([\w.@/-]+\.(?:ts|tsx|js|mjs|cjs|py|swift|css|html|json))(?=[\s:,)]|$)/g;

function* walk(dir) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** All note module paths ('services/voice', 'plugins/tools/mail', …), longest first. */
function noteModules() {
  const out = [];
  for (const f of walk(NOTES_ROOT)) {
    if (!f.endsWith('.md')) continue;
    out.push(relative(NOTES_ROOT, f).slice(0, -3));
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Resolve an author's abbreviation to exactly one tracked file — ambiguity yields nothing. */
function resolver() {
  const files = [];
  for (const root of CODE_ROOTS) for (const f of walk(root)) files.push(f);
  return (abbrev) => {
    const matches = files.filter(f => f === abbrev || f.endsWith('/' + abbrev));
    return matches.length === 1 ? matches[0] : null;
  };
}

/**
 * containerId → sorted note module paths its nodes' citations land in.
 * Notes match by LONGEST directory prefix, so a file in services/memory/ maps to
 * services/memory.md (or a deeper note if one exists), never to a parent by accident.
 */
export function deriveNoteMap(bands) {
  const notes = noteModules();
  const resolve = resolver();
  const map = new Map();
  for (const band of bands) {
    for (const c of band.containers) {
      const hit = new Set();
      for (const node of c.nodes) {
        ANCHOR_RE.lastIndex = 0;
        let m;
        while ((m = ANCHOR_RE.exec(String(node.hov ?? ''))) !== null) {
          const resolved = resolve(m[1]);
          if (!resolved || !resolved.startsWith('src/')) continue;
          const mod = resolved.slice('src/'.length);
          const note = notes.find(n => mod === n || mod.startsWith(n + '/'));
          if (note) hit.add(note);
        }
      }
      if (hit.size > 0) map.set(c.id, [...hit].sort());
    }
  }
  return map;
}
