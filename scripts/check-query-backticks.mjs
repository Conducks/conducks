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

// Every `<lang>/queries.ts`, PLUS any query file that sits directly in the languages directory.
// `ecmascript-positions.ts` holds the patterns shared by typescript/tsx/javascript in template
// literals of its own, and this loop used to walk directories only — so the one file three grammars
// depend on was the one file this gate could not see.
const files = [
  ...readdirSync(DIR).map(lang => path.join(DIR, lang, 'queries.ts')),
  ...readdirSync(DIR).filter(f => f.endsWith('.ts')).map(f => path.join(DIR, f)),
];

const offences = [];
for (const file of files) {
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { continue; }

  // EVERY template literal in the file, not just the first.
  //
  // This used to take the span from the first `= \`` to the file's LAST backtick and call that the
  // body — correct while every query file held exactly one literal. `ecmascript-positions.ts` holds
  // two (the value positions and the type positions), so that span swallowed the JSDoc between them
  // and reported the prose as an offence. Walking literal by literal is what the rule always meant.
  let cursor = 0;
  while (true) {
    const open = src.indexOf('= `', cursor);
    if (open === -1) break;
    const bodyStart = open + 3;
    // The literal ends at the INTENDED terminator — a backtick followed by `;` — not at the next
    // unescaped backtick.
    //
    // That distinction is the whole point of this gate. A stray backtick IS an unescaped one, so
    // scanning to "the next unescaped backtick" ends the body exactly where the offence begins and
    // reports nothing. The original single-literal version used the file's LAST backtick for this
    // reason; the multi-literal version needs a terminator it can trust, and `\`;` is the shape
    // every one of these declarations ends with. Verified by mutation: injecting a raw backtick is
    // silently accepted by the next-unescaped-backtick rule and caught by this one.
    const close = src.indexOf('`;', bodyStart);
    if (close === -1) break;

    const lineOffset = src.slice(0, bodyStart).split('\n').length;
    src.slice(bodyStart, close).split('\n').forEach((line, i) => {
      // UNESCAPED only — several query files legitimately name a grammar field with an escaped one.
      if (/(^|[^\\])`/.test(line)) {
        offences.push(`${path.relative(process.cwd(), file)}:${lineOffset + i}  ${line.trim()}`);
      }
    });
    cursor = close + 1;
  }
}

if (offences.length > 0) {
  console.error('\n\x1b[31m✖ A BACKTICK INSIDE A QUERY TEMPLATE LITERAL\x1b[0m');
  console.error('  It ends the string. tsc will report something like "TS1005: \',\' expected"');
  console.error('  pointing at query text — that error is a symptom, this is the cause.\n');
  for (const o of offences) console.error(`    ${o}`);
  console.error('\n  Fix: write the comment in plain words, or escape it as \\`.\n');
  process.exit(1);
}
