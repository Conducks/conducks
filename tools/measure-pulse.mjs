#!/usr/bin/env node
/**
 * Measure what one `conducks analyze` actually costs: wall time, CPU, peak memory, graph size.
 *
 * Exists because the previous harness lived in a scratch directory and reported `peak_cpu=0%` on
 * every run — it sampled `$!`, the subshell, instead of the node process. An instrument that
 * silently reads zero is worse than no instrument, so this one REFUSES to report a number it could
 * not measure rather than printing a plausible default.
 *
 * It spawns the real CLI as a subprocess rather than importing the engine, because in-process
 * timing cannot see what a user pays: process start, grammar loading, and the vault write all
 * happen outside any function you could call. Peak memory comes from the kernel via `/usr/bin/time`
 * (`-l` on macOS, `-v` on GNU), not from sampling `ps` — sampling misses peaks between reads, and
 * the peak is the number that decides whether a machine swaps.
 *
 * CPU is reported as CORES USED (user+sys divided by wall), which is the honest form. A "200% CPU"
 * figure reads like parallelism; `2.0 cores` next to an unchanged wall time reads like what it is.
 *
 *   node tools/measure-pulse.mjs                      # this repo, 3 runs
 *   node tools/measure-pulse.mjs --runs 5 --project ../other-repo
 *   node tools/measure-pulse.mjs --label before       # tag the output for an A/B
 *
 * Every run starts from a COLD vault by default (`--keep-vault` to opt out), because a warm pulse
 * is gated by the file-hash check and measures almost nothing.
 */
import { spawn } from 'node:child_process';
import { openVault } from './lib/vault.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'build/src/interfaces/cli/index.js');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const runs = Number(arg('runs', 3));
const project = path.resolve(arg('project', REPO));
const label = arg('label', path.basename(project));
const keepVault = process.argv.includes('--keep-vault');

if (!fs.existsSync(CLI)) {
  console.error(`no build at ${CLI} — run \`npm run build\` first`);
  process.exit(2);
}

/** `/usr/bin/time` differs by platform, and guessing wrong yields a silent zero. */
const timeFlag = process.platform === 'darwin' ? '-l' : '-v';

function parseUsage(stderr) {
  // macOS: "  0.12 real  0.20 user  0.02 sys" then "  249511936  maximum resident set size"
  // GNU:   "Maximum resident set size (kbytes): 243664" + "Elapsed (wall clock) time ..."
  const mac = stderr.match(/([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/);
  const macRss = stderr.match(/(\d+)\s+maximum resident set size/);
  if (mac && macRss) {
    return { wall: +mac[1], cpu: +mac[2] + +mac[3], peakBytes: +macRss[1] };
  }
  const gnuRss = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
  const gnuUser = stderr.match(/User time \(seconds\):\s*([\d.]+)/);
  const gnuSys = stderr.match(/System time \(seconds\):\s*([\d.]+)/);
  const gnuWall = stderr.match(/Elapsed \(wall clock\) time.*?:\s*(?:(\d+):)?([\d.]+)/);
  if (gnuRss && gnuUser && gnuSys && gnuWall) {
    return {
      wall: (+(gnuWall[1] ?? 0)) * 60 + +gnuWall[2],
      cpu: +gnuUser[1] + +gnuSys[1],
      peakBytes: +gnuRss[1] * 1024,
    };
  }
  return null;   // caller refuses to invent a number
}

const vaultCounts = async (root) => {
  const file = path.join(root, '.conducks', 'conducks-synapse.db');
  if (!fs.existsSync(file)) return null;
  // null on ANY failure, as before: a missing or locked vault means "no counts to report", which
  // this harness prints as a blank rather than failing the run.
  let db = null;
  try {
    db = await openVault(file);
    const rows = await db.all('SELECT (SELECT count(*) FROM nodes) n, (SELECT count(*) FROM edges) e');
    return { nodes: Number(rows[0].n), edges: Number(rows[0].e) };
  } catch {
    return null;
  } finally {
    db?.close();
  }
};

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function once() {
  if (!keepVault) fs.rmSync(path.join(project, '.conducks'), { recursive: true, force: true });
  const child = spawn('/usr/bin/time', [timeFlag, process.execPath, CLI, 'analyze', '--force', '--yes'],
    { cwd: project, env: process.env });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.resume();
  const code = await new Promise(r => child.on('close', r));
  const usage = parseUsage(stderr);
  if (!usage) {
    // The failure mode this tool exists to prevent: reporting a confident zero.
    console.error(`could not parse resource usage from /usr/bin/time ${timeFlag}. Raw tail:`);
    console.error(stderr.split('\n').slice(-12).join('\n'));
    process.exit(3);
  }
  return { ...usage, code, graph: await vaultCounts(project) };
}

console.log(`measuring \`analyze --force\` on ${project}`);
console.log(`${runs} run(s), ${keepVault ? 'warm' : 'cold'} vault, peak RSS from the kernel\n`);

const results = [];
for (let i = 1; i <= runs; i++) {
  const r = await once();
  results.push(r);
  const g = r.graph ? `${r.graph.nodes} nodes / ${r.graph.edges} edges` : 'NO VAULT';
  console.log(
    `  run ${i}  ${r.wall.toFixed(1)}s  ${(r.cpu / r.wall).toFixed(1)} cores  ` +
    `${(r.peakBytes / 1048576).toFixed(0)} MB peak  ${g}` +
    (r.code === 0 ? '' : `  [31mEXIT ${r.code}[0m`));
}

const failed = results.filter(r => r.code !== 0).length;
const graphs = new Set(results.filter(r => r.graph).map(r => `${r.graph.nodes}/${r.graph.edges}`));

console.log(`\n${label}: ${median(results.map(r => r.wall)).toFixed(1)}s median  ` +
  `${(median(results.map(r => r.peakBytes)) / 1048576).toFixed(0)} MB peak median  ` +
  `${median(results.map(r => r.cpu / r.wall)).toFixed(1)} cores`);

// A spread this wide means the machine was busy; a number quoted from it is not reproducible.
const walls = results.map(r => r.wall);
const spread = (Math.max(...walls) - Math.min(...walls)) / median(walls);
if (runs > 1 && spread > 0.15) {
  console.log(`[33m  warning: wall time varied ${(spread * 100).toFixed(0)}% across runs — ` +
    `quiet the machine before quoting this[0m`);
}
if (graphs.size > 1) {
  console.log(`[33m  warning: runs produced DIFFERENT graphs (${[...graphs].join(', ')}) — ` +
    `that is a correctness bug, not a measurement one[0m`);
}
if (failed) {
  console.log(`[31m  ${failed}/${runs} run(s) exited non-zero — the timings above measure a FAILURE[0m`);
  process.exit(1);
}
