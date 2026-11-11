#!/usr/bin/env node
// One release = one version, written in the same place everywhere. This fails when any copy disagrees,
// so a publish cannot go out with a stale lockfile, changelog, build or website number.
// Usage: node scripts/check-release.mjs [--website <path-to-website-repo>]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf-8');
const pkg = JSON.parse(read('package.json'));
const v = pkg.version;
const problems = [];
const expect = (what, got) => { if (got !== v) problems.push(`${what} is ${got ?? 'missing'}, package.json says ${v}`); };

if (!/^\d+\.\d+\.\d+$/.test(v)) problems.push(`package.json version "${v}" is not plain MAJOR.MINOR.PATCH (no -dev or -rc suffix on a release)`);
// npm 11 silently drops a bin path written "./x" at publish, leaving a package with no command.
for (const [name, target] of Object.entries(pkg.bin ?? {})) {
  if (target.startsWith('./')) problems.push(`bin "${name}" is "${target}"; write it without the leading ./`);
  if (!fs.existsSync(path.join(root, target))) problems.push(`bin "${name}" points at ${target}, which is not built`);
}
const lock = JSON.parse(read('package-lock.json'));
expect('package-lock.json version', lock.version);
expect('package-lock.json packages[""] version', lock.packages?.['']?.version);

const log = read('CHANGELOG.md');
const top = log.match(/^## \[(\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})/m);
expect('newest CHANGELOG heading', top?.[1]);
if (!top) problems.push('CHANGELOG.md has no "## [x.y.z] — YYYY-MM-DD" heading');
const unreleased = log.split(/^## \[/m).find(s => s.startsWith('Unreleased]'))?.replace(/^Unreleased\]\s*/, '').trim();
if (unreleased) problems.push('CHANGELOG.md [Unreleased] still has entries; move them under the new version');

try {
  const built = JSON.parse(read('build/package.json')).version;
  expect('build/package.json (rebuild with npm run build)', built);
  const cli = execFileSync('node', [path.join(root, 'build/src/interfaces/cli/index.js'), '--version'], { encoding: 'utf-8' }).trim();
  expect('`conducks --version`', cli);
} catch (e) { problems.push(`build is missing or has no --version: ${String(e.message).split('\n')[0]}`); }

const w = process.argv.indexOf('--website');
if (w > 0) {
  const site = path.resolve(process.argv[w + 1] ?? '');
  const hits = [['src/app/features/page.tsx', /v: "([\d.]+)", l: "Current version"/], ['src/app/docs/page.tsx', /<td>Version<\/td><td[^>]*>([\d.]+)</]];
  for (const [f, re] of hits) expect(`website ${f}`, fs.readFileSync(path.join(site, f), 'utf-8').match(re)?.[1]);
}

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf-8' }).trim();
if (git('status', '--porcelain', '--untracked-files=no')) problems.push('uncommitted changes in tracked files; commit before publishing');
const tag = `v${v}`;
if (git('tag', '--list', tag) === tag && git('rev-list', '-n1', tag) !== git('rev-parse', 'HEAD')) problems.push(`tag ${tag} exists and points at a different commit`);
try { const live = execFileSync('npm', ['view', `${pkg.name}@${v}`, 'version'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); if (live) problems.push(`${pkg.name}@${v} is already on npm; npm refuses a second publish of the same number`); } catch { /* 404 = not published yet, as wanted */ }

if (problems.length) { console.error(`release check FAILED for ${v}:\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log(`release check OK: ${pkg.name}@${v} (changelog ${top[2]}, tag ${tag} to be created after publish)`);
