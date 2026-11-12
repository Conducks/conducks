import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GovernanceService } from '@/lib/domain/governance/index.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/**
 * A `.conducks/sentinel.yml` whose `rules:` is present but not a list ran the three DEFAULT rules and
 * reported a normal verdict: the user's own rules were dropped with no word (state-machine audit
 * P-07-11). The layer contract in the same file already reports a malformed declaration as a failed
 * check; the rules now do the same. A file with no `rules:` key at all still means "the defaults".
 */
const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

const withSentinel = (body: string): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-sentinel-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.conducks'));
  fs.writeFileSync(path.join(root, '.conducks', 'sentinel.yml'), body);
  return root;
};

const audit = (root: string) => new GovernanceService(new ConducksAdjacencyList(), {} as any, {} as any, {} as any).auditWithRules(root);

describe('sentinel.yml rules', () => {
  it('a rules key that is not a list fails the check instead of silently running the defaults', () => {
    const report = audit(withSentinel('rules: oops\n'));

    expect(report.success).toBe(false);
    expect(report.violations.map(v => v.ruleId)).toContain('sentinel_config');
  });

  it('a file with no rules key still means the default rules, with no complaint', () => {
    const report = audit(withSentinel('layers:\n  - name: core\n    path: src/core\n'));

    expect(report.violations.map(v => v.ruleId)).not.toContain('sentinel_config');
  });
});
