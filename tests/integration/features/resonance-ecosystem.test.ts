import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `resonance` measured graph SHAPE — density, average kinetic energy, node-kind mix — and then
 * printed a verdict about KINSHIP: any score over 0.7 was labelled
 * "Strong Architectural Resonance (Same Ecosystem)."
 *
 * MEASURED across the three subjects: the scraper (pure Python + Playwright) against sofie
 * (TypeScript + Electron + React) scored 70% "Same Ecosystem"; against the orchestrator (TypeScript
 * + Next.js) 80% "Same Ecosystem". They share no file extension and not one dependency. The number
 * was a true fact about shape; the sentence was a claim the analyzer had no input capable of
 * supporting — two projects of similar size score high whatever they are written in.
 *
 * The stack is now measured (languages present + third-party packages imported, the latter read
 * from the same dependency-origin stamp `supply-chain` reports from) and reported as its own line,
 * and the summary states shape and stack as two separate findings.
 */
describe('resonance separates structural shape from stack kinship', () => {
  let pythonRepo: string;
  let tsRepo: string;
  let tsSibling: string;

  beforeAll(() => {
    ensureBuild();

    pythonRepo = mkGitRepo('resonance-python');
    writeFile(pythonRepo, 'pyproject.toml', `
[project]
name = "pysubject"
dependencies = ["playwright>=1.40.0"]
`);
    writeFile(pythonRepo, 'src/engine.py', `
import asyncio
from playwright.async_api import async_playwright

class Engine:
    async def run(self):
        async with async_playwright() as p:
            return await p.chromium.launch()

    def helper(self, xs):
        return [x for x in xs if x]
`);
    commit(pythonRepo, 'init');
    runCli(['analyze', '--yes'], { cwd: pythonRepo });

    tsRepo = mkGitRepo('resonance-ts');
    writeFile(tsRepo, 'package.json', JSON.stringify({ name: 'ts', dependencies: { zod: '^3.0.0' } }, null, 2));
    writeFile(tsRepo, 'src/engine.ts', `
import { z } from 'zod';
export class Engine {
  run(): unknown { return z.string(); }
  helper(xs: unknown[]): unknown[] { return xs.filter(Boolean); }
}
`);
    commit(tsRepo, 'init');
    runCli(['analyze', '--yes'], { cwd: tsRepo });

    tsSibling = mkGitRepo('resonance-ts-sibling');
    writeFile(tsSibling, 'package.json', JSON.stringify({ name: 'ts2', dependencies: { zod: '^3.0.0' } }, null, 2));
    writeFile(tsSibling, 'src/service.ts', `
import { z } from 'zod';
export class Service {
  start(): unknown { return z.number(); }
  helper(xs: unknown[]): unknown[] { return xs.filter(Boolean); }
}
`);
    commit(tsSibling, 'init');
    runCli(['analyze', '--yes'], { cwd: tsSibling });
  }, 300000);

  afterAll(() => { rmRepo(pythonRepo); rmRepo(tsRepo); rmRepo(tsSibling); });

  it('never claims a shared ecosystem between a Python and a TypeScript project', () => {
    const out = JSON.parse(runCli(['resonance', tsRepo, '--json'], { cwd: pythonRepo }).stdout);
    expect(String(out.summary).toLowerCase()).not.toContain('same ecosystem');
    expect(out.sharedPackages).not.toContain('zod');
    expect(out.metrics.ecosystem).toBeLessThan(50);
  }, 180000);

  it('scores stack overlap higher between two projects on the same stack', () => {
    const crossStack = JSON.parse(runCli(['resonance', tsRepo, '--json'], { cwd: pythonRepo }).stdout);
    const sameStack = JSON.parse(runCli(['resonance', tsSibling, '--json'], { cwd: tsRepo }).stdout);
    expect(sameStack.metrics.ecosystem).toBeGreaterThan(crossStack.metrics.ecosystem);
    expect(sameStack.sharedPackages).toContain('zod');
  }, 180000);

  it('still reports the structural score, which was never the wrong part', () => {
    const out = JSON.parse(runCli(['resonance', tsRepo, '--json'], { cwd: pythonRepo }).stdout);
    expect(typeof out.similarity).toBe('number');
    expect(out.metrics.density).not.toBeNull();
  }, 180000);
});
