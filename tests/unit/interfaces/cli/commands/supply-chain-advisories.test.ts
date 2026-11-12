import { describe, it, expect } from '@jest/globals';
import { SupplyChainCommand } from '@/interfaces/cli/commands/supply-chain.js';

/**
 * Advisories joined onto the supply-chain surface (todo09#P3).
 *
 * The join is the point. `npm audit` alone lists what is vulnerable; this says how much of YOUR code
 * stands behind each one — a high-severity advisory in a package with one importer is a different
 * morning from the same advisory in a package with 139.
 *
 * The parse is tested directly because the failure that matters is silent: an unparseable or absent
 * report must read as UNKNOWN, never as clean.
 */
const parse = (raw: string) =>
  (new SupplyChainCommand() as unknown as { parseAudit: (r: string, m: Map<string, unknown>) => Map<string, { severity: string; count: number }> })
    .parseAudit(raw, new Map());

describe('parsing an npm audit report', () => {
  it('extracts severity per package', () => {
    const got = parse(JSON.stringify({
      vulnerabilities: {
        lodash: { severity: 'high', via: [{ source: 1 }, { source: 2 }] },
        minimist: { severity: 'low', via: ['lodash'] },
      },
    }));
    expect(got.get('lodash')).toEqual({ severity: 'high', count: 2 });
    expect(got.get('minimist')).toEqual({ severity: 'low', count: 1 });
  });

  /** A malformed report is NO report — never a clean one. */
  it('returns nothing for unparseable output rather than reporting clean', () => {
    expect(parse('not json').size).toBe(0);
  });

  it('handles a report with no vulnerabilities key', () => {
    expect(parse(JSON.stringify({ auditReportVersion: 2 })).size).toBe(0);
  });

  it('records a package whose `via` is entirely transitive strings', () => {
    const got = parse(JSON.stringify({ vulnerabilities: { a: { severity: 'moderate', via: ['b', 'c'] } } }));
    expect(got.get('a')).toEqual({ severity: 'moderate', count: 1 });
  });

  it('defaults an absent severity to unknown rather than dropping the package', () => {
    const got = parse(JSON.stringify({ vulnerabilities: { mystery: { via: [{}] } } }));
    expect(got.get('mystery')?.severity).toBe('unknown');
  });
});

/**
 * State-machine audit P-09-1, MEASURED: in a project with no lockfile `npm audit --json` prints
 * `{"error":{"code":"ENOLOCK",…}}` and exits 0. `readAdvisories` took any exit-0 output, or any
 * stdout starting with `{`, as a report — `available: true` with zero advisories — so the command
 * printed "No advisory affects an imported package" for an audit that never ran.
 */
describe('reading advisories: only a real report counts as checked', () => {
  const read = (dir: string) =>
    (new SupplyChainCommand() as unknown as { readAdvisories: (d: string) => { available: boolean } }).readAdvisories(dir);

  const isReport = (raw: string) =>
    (new SupplyChainCommand() as unknown as { isAuditReport: (r: string) => boolean }).isAuditReport(raw);

  it('a clean report is a report; an error object or non-JSON is not', () => {
    expect(isReport(JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }))).toBe(true);
    expect(isReport(JSON.stringify({ error: { code: 'ENOLOCK' } }))).toBe(false);
    expect(isReport('npm ERR! something')).toBe(false);
  });

  it('a project with no lockfile is UNKNOWN, not clean', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-nolock-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
      expect(read(dir).available).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 90000);
});
