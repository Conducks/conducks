/**
 * todo56 — the preinstall check that stops a silent 15-minute DuckDB compile.
 *
 * `duckdb` installs via `node-pre-gyp install --fallback-to-build`. Measured against
 * `npm.duckdb.org` for duckdb 1.4.4 on 2026-08-09: Node 20/22/24 (ABI 115/127/137) return HTTP 200
 * for both darwin-arm64 and linux-x64, and Node 25 (ABI 141) returns 404 — so the newest Node major
 * compiles DuckDB from source, needs a C++ toolchain, and says nothing for ten minutes first.
 *
 * The check warns and never fails, the same rule ADR 0027 set for the tree-sitter binding: an
 * install that hard-requires a toolchain is the thing being avoided, not enforced.
 */
import { describe, it, expect } from '@jest/globals';
import { prebuildWarning, PREBUILT_ABIS } from '../../../scripts/check-duckdb-prebuild.mjs';

describe('DuckDB prebuild check — todo56', () => {
  it('says nothing on a Node whose ABI has a prebuilt binary', () => {
    for (const abi of ['115', '127', '137']) {
      expect(prebuildWarning(abi, '22.0.0')).toBeNull();
    }
  });

  it('warns on an ABI with no prebuild, naming the cost and the way out', () => {
    const warning = prebuildWarning('141', '25.8.1') as string;
    expect(warning).toContain('25.8.1');
    expect(warning).toContain('ABI 141');
    expect(warning).toMatch(/compile/i);
    expect(warning).toMatch(/toolchain/i);
    expect(warning).toMatch(/20, 22 or 24/);
  });

  it('warns on a FUTURE Node too — this recurs at every major, it is not a Node 25 special case', () => {
    expect(prebuildWarning('145', '26.0.0')).not.toBeNull();
  });

  it('lists the ABIs as data, so adding a verified prebuild is a one-line change', () => {
    expect(PREBUILT_ABIS.has('137')).toBe(true);
    expect(PREBUILT_ABIS.has('141')).toBe(false);
  });
});
