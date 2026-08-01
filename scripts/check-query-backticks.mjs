#!/usr/bin/env node
/**
 * Conducks — refuse a backtick inside a language query, BEFORE tsc gets a chance to be cryptic.
 *
 * Every `languages/<lang>/queries.ts` holds its tree-sitter patterns in a template literal, so one
 * unescaped backtick — the natural way to write `encapsed_string` or a snippet in a `;;` comment —
 * ends the string. What tsc then reports is `TS1005: ',' expected` pointing at query text, which
 * says nothing about backticks. It has cost a debugging round FIVE times.
 *
 * The suite already catches this (tests/unit/core/parsing/backticks-in-queries.test.ts) and names
 * the line exactly. The gap was never detection — it was ORDER: `tsc` runs first, fails first, and
 * the useful message never gets a chance to print. So this runs before the compiler.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/core/parsing/languages');

const offences = [];
for (const lang of readdirSync(DIR)) {
  const file = path.join(DIR, lang, 'queries.ts');
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { continue; }

  const open = src.indexOf('= `');
  if (open === -1) continue;
  // Everything between the opening backtick and the file's LAST one is the literal's body.
  const body = src.slice(open + 3, src.lastIndexOf('`'));
  body.split('\n').forEach((line, i) => {
    // UNESCAPED only — several query files legitimately name a grammar field with an escaped one.
    if (/(^|[^\\])`/.test(line)) {
      offences.push(`${path.relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`);
    }
  });
}

if (offences.length > 0) {
  console.error('\n\x1b[31m✖ A BACKTICK INSIDE A QUERY TEMPLATE LITERAL\x1b[0m');
  console.error('  It ends the string. tsc will report something like "TS1005: \',\' expected"');
  console.error('  pointing at query text — that error is a symptom, this is the cause.\n');
  for (const o of offences) console.error(`    ${o}`);
  console.error('\n  Fix: write the comment in plain words, or escape it as \\`.\n');
  process.exit(1);
}
