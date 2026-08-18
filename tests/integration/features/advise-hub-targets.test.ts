import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * "Monolithic Hub: N distinct files depend on this symbol. Consider splitting." is only advice if the
 * symbol can be split. The rule was generated from fan-in alone, with no notion of what it pointed at.
 *
 * MEASURED. On the sofie subject the loudest findings were `src/engine/types.ts::ToolDefinition`
 * (62 files), `::Message` (25) and `::LLMResponse` — every one an INTERFACE, which exists to be
 * referenced from everywhere; splitting one would only duplicate the contract. On the orchestrator
 * the top finding was `base_interfaces.ts::OnConflict.APPEND` — an ENUM MEMBER with 27 dependants.
 *
 * A second round found the same defect in two more disguises:
 *   - PYTHON DATA CARRIERS. Python has no `interface`, so `@dataclass` records and `class X(str, Enum)`
 *     are kinded `struct` beside real classes. The scraper's four loudest findings were `JobConfig`
 *     (21 files), `ExtractionResult` (12), `LevelOutputType` (11) and `FeatureSet` (11).
 *   - THINGS WITH NO SOURCE HERE. `global::str`, `global::os`, and on the orchestrator
 *     `next/server::nextresponse` and `next/link::default` — enormous fan-in, nothing to divide.
 *     Visible only once the list above became short enough to read.
 *
 * The two languages get separate fixtures on purpose: the threshold is `max(medianDegree * 5, 10)`,
 * so adding modules of one language moves the bar for the other — measured, a shared repo made this
 * suite report no hubs at all.
 */

/** The symbol each `[HUB]` finding points at. */
const hubTargetsOf = (repo: string): string[] => {
  const out = runCli(['advise'], { cwd: repo, allowFail: true }).combined.split('\n');
  const targets: string[] = [];
  out.forEach((line, i) => {
    if (line.includes('[HUB]')) {
      const next = out[i + 1] ?? '';
      targets.push(next.replace(/\[[0-9;]*m/g, '').replace(/^\s*└─\s*/, '').trim());
    }
  });
  return targets;
};

describe('hub advice names symbols that can be split — TypeScript', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('advise-hub-ts');

    writeFile(repo, 'src/types.ts', `
/** A shared contract: referenced everywhere BY DESIGN. */
export interface ToolDefinition { name: string; run(): void }
export type ToolName = string;
export enum OnConflict { APPEND = 'append', REPLACE = 'replace' }
`);
    writeFile(repo, 'src/logger.ts', `
/** A real function hub: every module calls it. */
export function createLogger(name: string): { log: (m: string) => void } {
  return { log: (m: string) => void m };
}
`);
    for (let i = 0; i < 16; i++) {
      writeFile(repo, `src/mod${i}.ts`, `
import type { ToolDefinition, ToolName } from './types.js';
import { OnConflict } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('mod${i}');
export function work${i}(t: ToolDefinition, n: ToolName): string {
  log.log(n);
  return t.name + OnConflict.APPEND;
}
`);
    }
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('does not tell you to split an interface, a type alias or an enum member', () => {
    const targets = hubTargetsOf(repo).join('\n').toLowerCase();
    expect(targets).not.toContain('tooldefinition');
    expect(targets).not.toContain('toolname');
    expect(targets).not.toContain('onconflict.append');
  }, 180000);

  it('does not name a symbol with no source in this repository', () => {
    const targets = hubTargetsOf(repo).join('\n').toLowerCase();
    expect(targets).not.toMatch(/global::/);
    expect(targets).not.toMatch(/external:\/\//);
  }, 180000);

  it('still names a function hub, which is the finding worth having', () => {
    // The counter-test: suppressing every wide-fan-in symbol would pass the cases above and leave the
    // rule reporting nothing at all.
    expect(hubTargetsOf(repo).join('\n').toLowerCase()).toContain('createlogger');
  }, 180000);
});

describe('hub advice names symbols that can be split — Python', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('advise-hub-py');

    writeFile(repo, 'src/models.py', [
      'from dataclasses import dataclass',
      'from enum import Enum',
      '',
      '@dataclass',
      'class PyRecord:',
      '    value: int = 0',
      '',
      'class PyStatus(str, Enum):',
      '    OK = "ok"',
      '',
      'class PyBase:',
      '    def run(self):',
      '        return 1',
      '',
    ].join('\n'));

    for (let i = 0; i < 16; i++) {
      writeFile(repo, `src/py_mod${i}.py`, [
        'from models import PyRecord, PyStatus, PyBase',
        '',
        `class Impl${i}(PyBase):`,
        '    def work(self, r: PyRecord) -> str:',
        '        return PyStatus.OK.value + str(r.value)',
        '',
      ].join('\n'));
    }
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('does not tell you to split a @dataclass record or an Enum', () => {
    const targets = hubTargetsOf(repo).join('\n').toLowerCase();
    expect(targets).not.toContain('pyrecord');
    expect(targets).not.toContain('pystatus');
  }, 180000);

  it('still names a behavioural base class, which IS splittable', () => {
    // The counter-test. Excluding every Python class would pass the case above and destroy the
    // command's only real Python finding — on the scraper subject that is `BaseSpecialist`,
    // `BaseExtractor` and `BaseLevel`, all still correctly reported.
    expect(hubTargetsOf(repo).join('\n').toLowerCase()).toContain('pybase');
  }, 180000);
});
