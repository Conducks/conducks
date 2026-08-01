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
