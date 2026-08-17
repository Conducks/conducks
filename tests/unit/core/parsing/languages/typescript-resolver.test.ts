import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TypeScriptResolver } from '@/lib/core/parsing/index.js';
import { anchorChronicle, chronicle } from '@/lib/core/git/index.js';

/**
 * Every TypeScript import in every project goes through here, and it sat at 34% branch coverage.
 *
 * The earlier pack suite asked one question per language — does a real specifier find its file. This
 * asks the questions that are specific to TypeScript and that no other pack has: the `.js` specifier
 * that names a `.ts` file, index resolution, case-insensitive matching on a case-insensitive
 * filesystem, and the extension ORDER, which decides whether a declaration file or its implementation
 * wins.
 *
 * The failure direction is the quiet one. A resolver that returns undefined leaves an edge dangling,
 * which reads downstream as "nothing imports this" — the same sentence a genuinely unused file
 * produces. Nothing distinguishes them without coming back here.
 */
const r = new TypeScriptResolver();
const resolve = (spec: string, from: string, files: string[]) => r.resolve(spec, from, files);

describe('TypeScript ESM writes .js for a .ts file', () => {
  it('resolves a dot-slash .js specifier onto the .ts source', () => {
    // The single most common specifier shape in a modern TypeScript codebase. Without the strip,
    // every relative import in the project silently fails to bind.
    expect(resolve('./util.js', '/p/src/a.ts', ['/p/src/util.ts'])).toBe('/p/src/util.ts');
  });

  it('resolves the same specifier when the file really is .js', () => {
    expect(resolve('./util.js', '/p/src/a.ts', ['/p/src/util.js'])).toBe('/p/src/util.js');
  });

  it('resolves a specifier written with no extension at all', () => {
    expect(resolve('./util', '/p/src/a.ts', ['/p/src/util.ts'])).toBe('/p/src/util.ts');
  });

  it('resolves .tsx, which a React project writes constantly', () => {
    expect(resolve('./Button.js', '/p/src/a.tsx', ['/p/src/Button.tsx'])).toBe('/p/src/Button.tsx');
  });
});

describe('index resolution — a directory names its own entry', () => {
  it('resolves a directory to its index', () => {
    expect(resolve('./feature', '/p/src/a.ts', ['/p/src/feature/index.ts'])).toBe('/p/src/feature/index.ts');
  });

  it('prefers a FILE over a directory of the same name', () => {
    // `./feature` with both `feature.ts` and `feature/index.ts` present is the ambiguous case, and
    // Node resolves the file. Picking the directory would bind every barrel import to the wrong node.
    const files = ['/p/src/feature.ts', '/p/src/feature/index.ts'];
    expect(resolve('./feature', '/p/src/a.ts', files)).toBe('/p/src/feature.ts');
  });
});

describe('extension ORDER decides which file wins', () => {
  it('prefers a declaration file over the .js beside it', () => {
    // `.d.ts` is first in the list. A package shipping both `x.d.ts` and `x.js` should bind to the
    // types, because that is what the importing TypeScript file actually sees.
    const files = ['/p/src/lib.js', '/p/src/lib.d.ts'];
    expect(resolve('./lib', '/p/src/a.ts', files)).toBe('/p/src/lib.d.ts');
  });

  it('prefers .ts over .js', () => {
    const files = ['/p/src/lib.js', '/p/src/lib.ts'];
    expect(resolve('./lib', '/p/src/a.ts', files)).toBe('/p/src/lib.ts');
  });
});

describe('case', () => {
  it('matches a path whose case differs, because APFS treats them as one file', () => {
    // CONDUCKS-4 at the resolver. On a case-insensitive filesystem `./Util` and `./util` open the
    // same file, and refusing the match splits one symbol across two nodes.
    expect(resolve('./Util.js', '/p/src/a.ts', ['/p/src/util.ts'])).toBe('/p/src/util.ts');
  });

  it('returns the file’s OWN spelling, not the specifier’s', () => {
    // The id is built from what comes back. Returning the specifier's casing would mint a node the
    // graph is not keyed by — the same defect ADR 0130 records for `resolveSymbol`.
    expect(resolve('./UTIL.js', '/p/src/a.ts', ['/p/src/util.ts'])).toBe('/p/src/util.ts');
  });
});

describe('what it refuses', () => {
  it('answers undefined for a relative specifier naming nothing', () => {
    // Undefined is an ANSWER. The edge dangles and something else decides whether that is external
    // or broken — this must not guess.
    expect(resolve('./nowhere.js', '/p/src/a.ts', ['/p/src/util.ts'])).toBeUndefined();
  });

  it('answers undefined for a bare package that is not installed', () => {
    expect(resolve('some-uninstalled-pkg', '/p/src/a.ts', ['/p/src/util.ts'])).toBeUndefined();
  });

  it('does not walk out of the project for a parent specifier that names nothing', () => {
    expect(resolve('../../../../etc/passwd', '/p/src/a.ts', ['/p/src/util.ts'])).toBeUndefined();
  });

  it('strips the quotes a tree-sitter string node carries', () => {
    // The capture includes its delimiters. Without the strip every specifier misses by two characters.
    expect(resolve('"./util.js"', '/p/src/a.ts', ['/p/src/util.ts'])).toBe('/p/src/util.ts');
    expect(resolve("'./util.js'", '/p/src/a.ts', ['/p/src/util.ts'])).toBe('/p/src/util.ts');
  });
});

describe('a parent-relative specifier', () => {
  it('resolves ../ against the importing file’s directory', () => {
    expect(resolve('../shared/util.js', '/p/src/feature/a.ts', ['/p/src/shared/util.ts']))
      .toBe('/p/src/shared/util.ts');
  });
});

/**
 * The two blocks the cases above never reach — and the fifteen of them alone measured 12.2% branch
 * on this file, which is why these exist.
 *
 * `resolve()` answers in three steps, and the first two BOTH read the real filesystem. Step 1 climbs
 * for the nearest `tsconfig.json` and applies its `paths` aliases; step 2 reads
 * `node_modules/<pkg>/package.json` and honours `types`, `exports` and `main`. A test that hands the
 * resolver invented paths never enters either one — `findNearestTsconfig` finds nothing, and the
 * package branch returns undefined at the first `existsSync`. Every case above did exactly that.
 *
 * So these build a project on disk. It is the only way to score the code that decides what `@/lib/x`
 * means, which is how nearly every import in THIS repository is written.
 *
 * Both blocks are anchored to `chronicle.getProjectDir()`: the tsconfig climb refuses to walk above
 * it, and package resolution joins `node_modules` onto it. The anchor is process-global, so each
 * case re-anchors and the suite restores the original afterwards — leaving it moved would make every
 * later test in the same worker read a temp directory that no longer exists.
 */
describe('tsconfig path aliases — the block that decides what `@/lib/x` means', () => {
  let root = '';
  const original = chronicle.getProjectDir();

  const project = (tsconfig: unknown, files: string[]) => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-tsres-')));
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify(tsconfig));
    const abs = files.map(f => path.join(root, f));
    for (const f of abs) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, '');
    }
    anchorChronicle(root);
    return abs;
  };

  afterEach(() => {
    anchorChronicle(original);
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = '';
  });

  it('maps a wildcard alias onto the file it names', () => {
    const files = project(
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
      ['src/lib/thing.ts', 'src/app.ts']
    );

    expect(new TypeScriptResolver().resolve('@/lib/thing', path.join(root, 'src/app.ts'), files))
      .toBe(path.join(root, 'src/lib/thing.ts'));
  });

  it('maps an alias written with the ESM `.js` extension onto the `.ts` source', () => {
    // How every internal import in this repository is spelled — `@/lib/core/x/index.js`. The alias
    // block has its OWN extension strip, separate from the relative one, and only `.js`/`.jsx` are
    // stripped there. Without it the mapped path is `src/lib/thing.js`, which no file matches, and
    // every aliased import in the project resolves to nothing.
    const files = project(
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
      ['src/lib/thing.ts', 'src/app.ts']
    );

    expect(new TypeScriptResolver().resolve('@/lib/thing.js', path.join(root, 'src/app.ts'), files))
      .toBe(path.join(root, 'src/lib/thing.ts'));
  });

  it('resolves an alias onto a DIRECTORY through its index file', () => {
    // The door spelling — `@/lib/core/graph` meaning `graph/index.ts`. The alias block tries the
    // file first and the directory second; dropping the second half breaks every door import while
    // leaving every leaf import working, which is the failure that looks like a partial graph.
    const files = project(
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
      ['src/lib/graph/index.ts', 'src/app.ts']
    );

    expect(new TypeScriptResolver().resolve('@/lib/graph', path.join(root, 'src/app.ts'), files))
      .toBe(path.join(root, 'src/lib/graph/index.ts'));
  });

  it('honours an EXACT (non-wildcard) alias, and only for the exact specifier', () => {
    // `{"paths": {"config": ["src/config.ts"]}}` — no star on either side. The two spellings take
    // different arms of the same `if`, and a resolver handling only the wildcard form silently
    // ignores every exact alias in the file.
    const files = project(
      { compilerOptions: { baseUrl: '.', paths: { config: ['src/config.ts'] } } },
      ['src/config.ts', 'src/app.ts']
    );
    const from = path.join(root, 'src/app.ts');

    expect(new TypeScriptResolver().resolve('config', from, files)).toBe(path.join(root, 'src/config.ts'));
    // The counter-test: an exact alias must not behave like a prefix. `config/extra` is a DIFFERENT
    // module, and answering `src/config.ts` for it would bind two imports to one node.
    expect(new TypeScriptResolver().resolve('config/extra', from, files)).toBeUndefined();
  });

  it('resolves the alias against `baseUrl`, not against the tsconfig directory', () => {
    // `baseUrl: "./src"` with `paths: {"@/*": ["*"]}` — the same layout, expressed the other way
    // round. Ignoring baseUrl resolves `@/lib/thing` to `<root>/lib/thing`, which does not exist.
    const files = project(
      { compilerOptions: { baseUrl: './src', paths: { '@/*': ['*'] } } },
      ['src/lib/thing.ts', 'src/app.ts']
    );

    expect(new TypeScriptResolver().resolve('@/lib/thing', path.join(root, 'src/app.ts'), files))
      .toBe(path.join(root, 'src/lib/thing.ts'));
  });

  it('falls through to the NEXT alias entry when the first names nothing', () => {
    // `paths` entries are an ordered list of candidates, not one choice. A resolver returning after
    // the first miss loses every monorepo layout, where `["src/*", "generated/*"]` is the norm.
    const files = project(
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['nowhere/*', 'src/*'] } } },
      ['src/lib/thing.ts', 'src/app.ts']
    );

    expect(new TypeScriptResolver().resolve('@/lib/thing', path.join(root, 'src/app.ts'), files))
      .toBe(path.join(root, 'src/lib/thing.ts'));
  });

  it('reads a tsconfig containing comments, which is legal JSONC and not legal JSON', () => {
    // `tsconfig.json` is JSONC by specification and TypeScript's own generated one ships comments.
    // `JSON.parse` throws on it, and the catch swallows the throw — so the whole alias block is
    // skipped in silence and every aliased import in that project resolves to undefined. There is no
    // error anywhere; the graph is simply missing its internal edges.
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-tsres-')));
    fs.writeFileSync(path.join(root, 'tsconfig.json'),
      '{\n  // the source root\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } }\n}');
    const files = ['src/lib/thing.ts', 'src/app.ts'].map(f => path.join(root, f));
    for (const f of files) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ''); }
    anchorChronicle(root);

    expect(new TypeScriptResolver().resolve('@/lib/thing', path.join(root, 'src/app.ts'), files))
      .toBe(path.join(root, 'src/lib/thing.ts'));
  });

  it('finds the NEAREST tsconfig, so a package in a monorepo gets its own aliases', () => {
    // Two tsconfigs, and they disagree on purpose: the inner one maps `@/*` to its own `lib`, the
    // outer to a shared directory. Reading the outer one from an inner file binds a package's
    // internal imports to another package's files — a wrong edge, not a missing one.
    const files = project(
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['shared/*'] } } },
      ['shared/thing.ts', 'pkg/lib/thing.ts', 'pkg/app.ts']
    );
    fs.writeFileSync(path.join(root, 'pkg/tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['lib/*'] } } }));

    expect(new TypeScriptResolver().resolve('@/thing', path.join(root, 'pkg/app.ts'), files))
      .toBe(path.join(root, 'pkg/lib/thing.ts'));
  });

  it('refuses an alias whose target does not exist rather than guessing a neighbour', () => {
    const files = project(
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
      ['src/lib/thing.ts', 'src/app.ts']
    );

    expect(new TypeScriptResolver().resolve('@/lib/absent', path.join(root, 'src/app.ts'), files))
      .toBeUndefined();
  });
});

describe('package resolution — a bare specifier reaching into node_modules', () => {
  let root = '';
  const original = chronicle.getProjectDir();

  /** A package on disk. Returns the absolute paths of the files it contains. */
  const pkg = (name: string, manifest: unknown, files: string[]) => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-tspkg-')));
    const dir = path.join(root, 'node_modules', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
    const abs = files.map(f => path.join(dir, f));
    for (const f of abs) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, '');
    }
    anchorChronicle(root);
    return abs;
  };

  afterEach(() => {
    anchorChronicle(original);
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = '';
  });

  it('prefers the `types` field, because the declaration file is what the imports are written against', () => {
    // `types` is read before `exports` and before `main` on purpose. Both are present here and they
    // point at different files, so the case scores the ORDER and not merely that one of them works.
    const files = pkg('lib', { types: 'dist/index.d.ts', main: 'dist/index.js' },
      ['dist/index.d.ts', 'dist/index.js']);

    expect(new TypeScriptResolver().resolve('lib', '/anywhere/app.ts', files))
      .toBe(path.join(root, 'node_modules/lib/dist/index.d.ts'));
  });

  it('honours a conditional `exports` map, taking the `import` condition', () => {
    // The modern manifest shape. `import` outranks `require`, and the two name different files here
    // so taking the wrong one is visible. No `types`, no `main` — `exports` is the only answer.
    const files = pkg('lib', { exports: { '.': { require: './cjs/index.js', import: './esm/index.js' } } },
      ['cjs/index.js', 'esm/index.js']);

    expect(new TypeScriptResolver().resolve('lib', '/anywhere/app.ts', files))
      .toBe(path.join(root, 'node_modules/lib/esm/index.js'));
  });

  it('resolves a SUBPATH export', () => {
    // `pkg/sub` is a separate `exports` key, not a path under the root entry.
    const files = pkg('lib', { exports: { '.': './index.js', './sub': './lib/sub.js' } },
      ['index.js', 'lib/sub.js']);

    expect(new TypeScriptResolver().resolve('lib/sub', '/anywhere/app.ts', files))
      .toBe(path.join(root, 'node_modules/lib/lib/sub.js'));
  });

  it('answers the package ROOT for an unlisted subpath — the limitation, recorded not fixed', () => {
    // Found by writing the counter-test, which expected undefined and got the root entry instead.
    //
    // The last line of `resolvePackageImport` tries `<pkgDir>/index` unconditionally, after every
    // manifest field has declined. It never asks whether a SUBPATH was requested, so `lib/private`
    // — a path the manifest deliberately does not export — resolves to `lib/index.js`. That is a
    // WRONG edge rather than a missing one: two different imports collapse onto one node, and
    // `impact` then reports the package root as a dependent of anything importing any private path.
    //
    // Not fixed here (ADR 0150 rule 16 — cleaning is not fixing), and the blast radius is small
    // because `tryFile` at this point matches against the raw `allFiles` array, which holds workspace
    // files; an ordinary `node_modules` dependency is not in it, so the fallback finds nothing and
    // the answer is undefined anyway. It bites only where a package is vendored INSIDE the analysed
    // tree. Pinned so the behaviour is visible and a fix has a test to turn red.
    const files = pkg('lib', { exports: { '.': './index.js', './sub': './lib/sub.js' } },
      ['index.js', 'lib/sub.js', 'lib/private.js']);

    expect(new TypeScriptResolver().resolve('lib/private', '/anywhere/app.ts', files))
      .toBe(path.join(root, 'node_modules/lib/index.js'));
  });

  it('reads a SCOPED package name as two segments, not as a package and a subpath', () => {
    // `@scope/pkg` splits on `/` like any specifier, so the naive read is package `@scope`, subpath
    // `pkg` — which looks for `node_modules/@scope/package.json` and finds nothing. Every scoped
    // dependency, which is most of them, would resolve to undefined.
    const files = pkg('@scope/pkg', { main: './index.js' }, ['index.js']);

    expect(new TypeScriptResolver().resolve('@scope/pkg', '/anywhere/app.ts', files))
      .toBe(path.join(root, 'node_modules/@scope/pkg/index.js'));
  });

  it('falls back to `main`, then to a bare `index`, when the manifest says less', () => {
    const withMain = pkg('lib', { main: './dist/entry.js' }, ['dist/entry.js']);
    expect(new TypeScriptResolver().resolve('lib', '/anywhere/app.ts', withMain))
      .toBe(path.join(root, 'node_modules/lib/dist/entry.js'));

    // An empty manifest — no types, no exports, no main. Node's own last resort is `index`, and a
    // resolver stopping before it misses every package written before `main` was conventional.
    const bare = pkg('lib', {}, ['index.js']);
    expect(new TypeScriptResolver().resolve('lib', '/anywhere/app.ts', bare))
      .toBe(path.join(root, 'node_modules/lib/index.js'));
  });

  it('answers undefined for a package that is not installed', () => {
    // Not an error — an uninstalled or built-in package is a normal fact about a project, and the
    // caller distinguishes "no edge" from "wrong edge" only if this stays undefined.
    const files = pkg('lib', { main: './index.js' }, ['index.js']);

    expect(new TypeScriptResolver().resolve('not-installed', '/anywhere/app.ts', files)).toBeUndefined();
  });
});
