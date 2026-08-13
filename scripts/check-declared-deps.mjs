// Conducks — postbuild declared-dependency gate (todo56)
//
// MEASURED (todo56): dropping the `duckdb` dependency for `@duckdb/node-api` broke `conducks` for
// everybody installing it, and nothing in the repo noticed. `minimatch` and `chalk` are imported by
// the shipped code but were never declared in package.json — they had been arriving TRANSITIVELY,
// minimatch through `duckdb` -> node-pre-gyp -> glob. Removing that one dependency took them with
// it. In the repo the tests stayed green, because the repo's own `node_modules` still had both
// through devDependencies; only a real install from the packed tarball failed, with
// `Cannot find package 'minimatch' imported from .../build/src/lib/core/parsing/ignore-manager.js`.
//
// That is the shape of the bug worth gating: an import that works everywhere the authors look and
// nowhere the users install. A transitive package is not a promise — it disappears the moment the
// dependency that carried it changes its own tree, which is nobody's fault and nobody's warning.
//
// Scans `build/src` — the code that ships — plus `tools/` and `scripts/`, which do not ship but run
// against this repository's own vault and have no test coverage at all. Optional dependencies count
// as declared: `tree-sitter` is deliberately absent wherever there is no C++ toolchain (ADR 0027)
// and the code handles that, so requiring it here would fail a build that is working as designed.
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

// Matched in STATEMENT position only, and that precision is the whole design. A pattern that just
// looks for `from "x"` anywhere reads prose as code: this file's first draft reported `stable`,
// `mod`, `clean` and `disconnected` as missing packages, all four of them words inside comments
// ("a script could not tell it from \"stable\"", `// export * from 'mod'`). A static import always
// begins its line; a dynamic one always sits inside `import(` or `require(`. Nothing else counts.
const PATTERNS = [
  /^\s*(?:import|export)\b[^\n]*?\bfrom\s*['"]([^'"\n]+)['"]/gm,   // import x from "p" / export … from "p"
  /^\s*import\s*['"]([^'"\n]+)['"]/gm,                             // side-effect import "p"
  /\bimport\(\s*['"]([^'"\n]+)['"]/g,                              // a dynamic import
  /\brequire\(\s*['"]([^'"\n]+)['"]/g,                             // require, incl. this.require
];

/**
 * True when the match sits in a line comment or a block-comment body.
 *
 * The static patterns above are anchored to the start of a line, which excludes comments on its own.
 * The dynamic two cannot be — a dynamic import legitimately appears mid-expression — so they match
 * prose as readily as code. This file's own comments were the first false positive it reported.
 */
function inComment(content, index) {
  const lineStart = content.lastIndexOf("\n", index) + 1;
  const before = content.slice(lineStart, index);
  return before.includes("//") || /^\s*\*/.test(before);
}

/**
 * Imported at runtime but deliberately NOT declared, with the reason. Anything here is a claim that
 * has to keep being true, so it is a list of exceptions, not a place to silence the gate.
 */
const ALLOWED = new Map([
  // Loaded only inside the native-parser fallback in grammar-registry, guarded by try/catch, and
  // owned by `tree-sitter` itself — so it is present exactly when the code path that reaches it is,
  // and absent harmlessly otherwise. Declaring it would claim conducks needs it, which it does not:
  // ADR 0027 makes the native binding optional to INSTALL, and this loader is reached only when it
  // is present. (Without it there is no parse path at all — ADR 0089 — which is a run-time refusal,
  // not an install-time dependency.)
  ["node-gyp-build", "ships with the optional tree-sitter binding; reached only behind try/catch"],
]);

/** `@scope/pkg/sub` -> `@scope/pkg`, `pkg/sub` -> `pkg`, or null when it is not a package at all. */
function packageOf(specifier) {
  // `@/foo` is this repo's path ALIAS, not a scoped package — a scope is `@name/pkg`. Left to
  // check-build-aliases.mjs, which exists for exactly that specifier and reports it properly;
  // treating it as a package here reported a missing dependency named `@`.
  if (specifier.startsWith("@/")) return null;
  const match = specifier.match(/^(@[^/]+\/[^/]+|[^/]+)/);
  return match ? match[1] : null;
}

/** Every extension a runnable script uses here — `.mjs` and `.cjs` count, and missing them is how
 *  the first version of this gate read clean over 26 broken files. */
const SCANNED_EXTENSIONS = [".js", ".mjs", ".cjs"];

/**
 * @param {string} buildDir directory of .js/.mjs/.cjs to scan
 * @param {{dependencies?: Record<string,string>, optionalDependencies?: Record<string,string>}} pkg
 * @param {{excluded?: string[], allowDev?: boolean}} [opts] directories to skip; whether
 *        devDependencies count as declared (repo tooling only, never shipped code)
 * @returns {Array<{package: string, file: string}>} one entry per undeclared package, first use named
 */
export function findUndeclaredImports(buildDir, pkg, { excluded = [], allowDev = false } = {}) {
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    // devDependencies count ONLY for repo tooling, never for shipped code. `doc-truth.mjs` imports
    // `typescript` legitimately — it reads the compiler API to derive doc truth and never ships. In
    // build/ the same import would be a broken publish, which is the distinction this flag draws.
    ...(allowDev ? Object.keys(pkg.devDependencies ?? {}) : []),
  ]);
  const builtin = new Set(builtinModules);
  const undeclared = new Map();
  if (!fs.existsSync(buildDir)) return [];

  const isExcluded = (full) =>
    excluded.some(prefix => path.resolve(process.cwd(), prefix) === full);

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || isExcluded(full)) continue;
        walk(full);
      } else if (SCANNED_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
        const content = fs.readFileSync(full, "utf8");
        for (const pattern of PATTERNS) {
          for (const match of content.matchAll(pattern)) {
            if (inComment(content, match.index)) continue;
            const specifier = match[1];
            if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) continue;
            const name = packageOf(specifier);
            if (!name || declared.has(name) || builtin.has(name) || ALLOWED.has(name) || undeclared.has(name)) continue;
            undeclared.set(name, full);
          }
        }
      }
    }
  };
  walk(buildDir);

  return [...undeclared].map(([name, file]) => ({ package: name, file }));
}

// Scanned in addition to build/. These do not ship, but they run against this repository's own
// vault and NONE of them is covered by a test — they are what you reach for while debugging, so they
// fail at the worst possible moment. MEASURED (todo56): the first version of this gate scanned only
// `build/src` and reported clean while 26 files under `tools/` and `scripts/` still imported the
// dependency that had just been removed, including `npm run benchmark`. A gate that checks less than
// the thing it is guarding reads as a pass.
const ALSO_SCANNED = ["tools", "scripts"];

// `tools/upstream-duckdb-repro/` is a bug report ABOUT `duckdb` and imports it on purpose; porting
// it would change what it reproduces. It is run by hand after `npm i --no-save duckdb`.
const EXCLUDED = ["tools/upstream-duckdb-repro"];

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const missing = [
    ...findUndeclaredImports(path.resolve(root, "build", "src"), pkg),
    ...ALSO_SCANNED.flatMap(dir =>
      findUndeclaredImports(path.resolve(root, dir), pkg, { excluded: EXCLUDED, allowDev: true })),
  ];

  if (missing.length > 0) {
    console.error(
      `[postbuild] ${missing.length} package(s) are imported but not declared in package.json:`
    );
    for (const m of missing) {
      console.error(`  ${m.package}  (first used in ${path.relative(root, m.file)})`);
    }
    console.error(
      "They resolve here only because something else pulled them in. A published install has no " +
        "such luck - add them to dependencies, or stop importing them."
    );
    process.exit(1);
  }

  console.log(`[postbuild] build/, tools/, scripts/ clean - every imported package is declared`);
  process.exit(0);
}
