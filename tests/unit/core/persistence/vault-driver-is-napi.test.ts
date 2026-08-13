/**
 * ADR 0149: the vault driver is NAPI, so a Node major cannot break the install.
 *
 * This is the check that fails if that decision is reverted, and it is deliberately a check on the
 * MANIFEST rather than on behaviour. The persistence suite passes against either driver — the port
 * lived behind `query`/`run`/`ensureVaultOpen` precisely so it would — so no functional test can tell
 * the two apart. What the decision actually claims is a property of what gets INSTALLED: an ABI-bound
 * native dependency compiles from source on every Node major that has no prebuilt binary, which is
 * how `npm i -g conducks` came to run past ten minutes on Node 25.
 *
 * The honest full test packs a tarball and installs it into a clean prefix (todo56#P2, measured at
 * 38-47s across macOS, linux-arm64, linux-arm64-musl and linux-x64). That needs a network and ~45s,
 * so it stays a manual pre-release step and this guards the reversal.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };

describe('the vault driver stays NAPI (ADR 0149)', () => {
  it('depends on @duckdb/node-api', () => {
    expect(Object.keys(pkg.dependencies ?? {})).toContain('@duckdb/node-api');
  });

  it('does not depend on the ABI-bound `duckdb` package', () => {
    const declared = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ];
    // `duckdb` installs through node-pre-gyp --fallback-to-build: no prebuild for this Node's ABI
    // means compiling DuckDB from source, ~10-15 minutes, needing a C++ toolchain the user may not
    // have. Measured: Node 20/22/24 have prebuilds, Node 25 (ABI 141) does not.
    expect(declared).not.toContain('duckdb');
  });

  it('no source file imports the old driver', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) {
          const source = fs.readFileSync(full, 'utf8');
          if (/(?:from|require\()\s*['"]duckdb['"]/.test(source)) offenders.push(full);
        }
      }
    };
    walk(path.resolve(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});
