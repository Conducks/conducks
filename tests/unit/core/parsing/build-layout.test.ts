import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveThroughBuildLayout, buildMappings } from '@/lib/core/parsing/build-layout.js';

/**
 * A specifier that only resolves through the BUILD layout (todo66, ADR 0153).
 *
 * `electron/main/index.ts` imports `'../engine/executor/prompt-loader.js'`. `electron/engine/` does
 * not exist — the file is `src/engine/executor/prompt-loader.ts`. The import is written against
 * where the two halves LAND, and both halves are declared: `tsconfig.json` says `src → dist`, and
 * the bundler config says `electron/main → dist/main`. Composed, `dist/main/../engine/…` is
 * `dist/engine/…`, which is what `src/engine/…` compiles to.
 *
 * This was deferred for twelve days on a stated risk, and the risk is the reason half the cases here
 * are REFUSALS. A wrong mapping binds a symbol to the wrong file and makes `prune` confidently
 * silent about real dead code (ADR 0070) — worse than the six false verdicts it removes. So the
 * rule is: only declared facts, and undefined whenever anything is missing or ambiguous.
 */
let root = '';

const project = (files: Record<string, string>) => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-layout-')));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
};

/** The map the resolver hands in: lowercased path → the file's own spelling. */
const index = (...rel: string[]) => {
  const m = new Map<string, string>();
  for (const r of rel) {
    const full = path.join(root, r);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '');
    m.set(full.toLowerCase(), full);
  }
  return m;
};

const TSCONFIG = JSON.stringify({ compilerOptions: { rootDir: './src', outDir: './dist' } });
const VITE = `
export default defineConfig({
  main: { build: { lib: { entry: 'electron/main/index.ts' }, outDir: 'dist/main' } },
  preload: { build: { lib: { entry: 'electron/preload/index.ts' }, outDir: 'dist/preload' } },
});
`;

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('the declared mappings are read from the project’s own config', () => {
  it('reads tsconfig rootDir/outDir and each bundler entry/outDir pair', () => {
    project({ 'tsconfig.json': TSCONFIG, 'electron.vite.config.ts': VITE });

    const mappings = buildMappings(root);
    const pairs = mappings.map(m => [path.relative(root, m.sourceDir), path.relative(root, m.outDir)]);

    expect(pairs).toEqual(expect.arrayContaining([
      ['src', 'dist'],
      [path.join('electron', 'main'), path.join('dist', 'main')],
      [path.join('electron', 'preload'), path.join('dist', 'preload')],
    ]));
  });

  it('reads NOTHING from a tsconfig that declares outDir without rootDir', () => {
    // `outDir` alone says where output goes and nothing about what maps onto it. Defaulting the
    // source to the project root would map every file in the repository into `dist`.
    project({ 'tsconfig.json': JSON.stringify({ compilerOptions: { outDir: './dist' } }) });

    expect(buildMappings(root)).toEqual([]);
  });

  it('a rootDir-less tsconfig resolves NOTHING, not the repository root', () => {
    // The mutation worth killing treats a missing `rootDir` as `.`, which is a plausible-looking
    // default and silently makes every path in the project a source path. Asserting the empty
    // mapping list alone did not catch it: `path.resolve` throws on undefined and the catch turned
    // the wrong behaviour into the right answer for the wrong reason.
    project({
      'tsconfig.json': JSON.stringify({ compilerOptions: { outDir: './dist' } }),
      'electron.vite.config.ts': VITE,
    });
    const files = index('engine/x.ts', 'electron/main/index.ts');

    expect(resolveThroughBuildLayout('../engine/x.js', path.join(root, 'electron/main/index.ts'), root, files))
      .toBeUndefined();
  });

  it('reads a tsconfig containing comments, which is legal JSONC', () => {
    project({ 'tsconfig.json': '{\n  // the source root\n  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" }\n}' });

    expect(buildMappings(root)).toHaveLength(1);
  });
});

describe('a specifier that only makes sense in the build layout', () => {
  it('resolves across the two configs, back to the source file', () => {
    project({ 'tsconfig.json': TSCONFIG, 'electron.vite.config.ts': VITE });
    const files = index('src/engine/executor/prompt-loader.ts', 'electron/main/index.ts');

    const answer = resolveThroughBuildLayout(
      '../engine/executor/prompt-loader.js',
      path.join(root, 'electron/main/index.ts'),
      root,
      files,
    );

    expect(answer).toBe(path.join(root, 'src/engine/executor/prompt-loader.ts'));
  });

  it('keeps the importing file’s own subdirectory, so a deeper file climbs from deeper', () => {
    // `electron/main/ipc/memory.ts` writes `../../services/…`, one level more than `index.ts` writes.
    // The first implementation collapsed every file to `outDir` — a bundled graph does end up in one
    // file — and it resolved `index.ts` while missing this one. Both specifiers are consistent with a
    // structure-preserving emit and only one is consistent with a collapse, so the SOURCES say which
    // model they were written against. Found by measurement, not by reading the bundler's docs.
    project({ 'tsconfig.json': TSCONFIG, 'electron.vite.config.ts': VITE });
    const files = index('src/services/memory/scoring.ts', 'electron/main/ipc/memory.ts');

    const answer = resolveThroughBuildLayout(
      '../../services/memory/scoring.js',
      path.join(root, 'electron/main/ipc/memory.ts'),
      root,
      files,
    );

    expect(answer).toBe(path.join(root, 'src/services/memory/scoring.ts'));
  });

  it('resolves a directory specifier through its index file', () => {
    project({ 'tsconfig.json': TSCONFIG, 'electron.vite.config.ts': VITE });
    const files = index('src/plugins/tools/index.ts', 'electron/main/index.ts');

    const answer = resolveThroughBuildLayout(
      '../plugins/tools/index.js',
      path.join(root, 'electron/main/index.ts'),
      root,
      files,
    );

    expect(answer).toBe(path.join(root, 'src/plugins/tools/index.ts'));
  });
});

describe('what it refuses, which is the reason this was deferred four times', () => {
  it('answers nothing when the project declares no build layout at all', () => {
    // The old behaviour, preserved exactly. Most projects are this, and inventing a mapping for them
    // would be strictly worse than the unresolved specifier they have today.
    project({ 'package.json': '{}' });
    const files = index('src/engine/x.ts', 'electron/main/index.ts');

    expect(resolveThroughBuildLayout('../engine/x.js', path.join(root, 'electron/main/index.ts'), root, files))
      .toBeUndefined();
  });

  it('answers nothing for a specifier that does NOT climb', () => {
    // `./x` lands inside the same emitted folder, so ordinary resolution already answered it — or
    // already refused for a real reason. Reaching into the build layout here could only overturn a
    // correct refusal.
    //
    // `src/main/ipc/handler.ts` exists on purpose: without the climb guard `./ipc/handler.js` lands
    // at `dist/main/ipc/handler.js`, which `dist` owns, and it would resolve to that file. A case
    // where the wrong path finds nothing anyway proves nothing about the guard.
    project({ 'tsconfig.json': TSCONFIG, 'electron.vite.config.ts': VITE });
    const files = index('src/main/ipc/handler.ts', 'electron/main/index.ts');

    expect(resolveThroughBuildLayout('./ipc/handler.js', path.join(root, 'electron/main/index.ts'), root, files))
      .toBeUndefined();
  });

  it('answers nothing when the importing file is outside every declared source directory', () => {
    project({ 'tsconfig.json': TSCONFIG, 'electron.vite.config.ts': VITE });
    const files = index('src/engine/x.ts', 'scripts/tool.ts');

    expect(resolveThroughBuildLayout('../engine/x.js', path.join(root, 'scripts/tool.ts'), root, files))
      .toBeUndefined();
  });

  it('answers nothing when the landing spot is in no declared output directory', () => {
    // `../../..` climbs clean out of `dist` entirely. Nothing declares what lives there, so there is
    // no source file to name and guessing at one is the wrong-edge failure.
    project({ 'tsconfig.json': TSCONFIG, 'electron.vite.config.ts': VITE });
    const files = index('src/engine/x.ts', 'electron/main/index.ts');

    expect(resolveThroughBuildLayout('../../../engine/x.js', path.join(root, 'electron/main/index.ts'), root, files))
      .toBeUndefined();
  });

  it('answers nothing when the mapped source file does not exist', () => {
    // Every hop resolved and the file is simply not there. ADR 0070 — the answer is nothing, not an
    // invented path, because a fabricated target reads exactly like a real one downstream.
    project({ 'tsconfig.json': TSCONFIG, 'electron.vite.config.ts': VITE });
    const files = index('src/engine/other.ts', 'electron/main/index.ts');

    expect(resolveThroughBuildLayout('../engine/absent.js', path.join(root, 'electron/main/index.ts'), root, files))
      .toBeUndefined();
  });

  it('answers nothing when TWO declared outputs both own the landing spot', () => {
    // `electron/preload/index.ts` importing `../main/x.js` lands at `dist/main/x.js`, and two
    // declarations claim that path: the bundler emits `electron/main/**` there, and tsc emits
    // `src/**` into `dist/**`. So it could have come from `electron/main/x.ts` or `src/main/x.ts`,
    // both of which exist here, and nothing in either config breaks the tie.
    //
    // Picking the first would be a coin flip dressed as an answer — and a wrong pick binds a symbol
    // to the wrong file, which is the confident-wrong-edge this whole module refuses (ADR 0070).
    project({ 'tsconfig.json': TSCONFIG, 'electron.vite.config.ts': VITE });
    const files = index('electron/main/x.ts', 'src/main/x.ts', 'electron/preload/index.ts');

    expect(resolveThroughBuildLayout('../main/x.js', path.join(root, 'electron/preload/index.ts'), root, files))
      .toBeUndefined();
  });

  it('answers nothing when the specifier stays inside its OWN output directory', () => {
    // `electron/main/ipc/x.ts` importing `../other.js` lands back in `dist/main`, which is the
    // mapping it came from. That is an ordinary intra-bundle import; ordinary resolution owns it,
    // and it refused for a reason this must not overturn.
    //
    // Declared with the bundler config ALONE. With a tsconfig present too, `dist/main/other.js` sits
    // in two output directories and the ambiguity guard refuses it — so the case passed with the
    // same-mapping guard deleted, and was testing the wrong rule. One mapping leaves only this rule
    // standing.
    project({ 'electron.vite.config.ts': VITE });
    const files = index('electron/main/other.ts', 'electron/main/ipc/x.ts');

    expect(resolveThroughBuildLayout('../other.js', path.join(root, 'electron/main/ipc/x.ts'), root, files))
      .toBeUndefined();
  });
});
