// Conducks — postbuild alias-resolution gate (ADR 0062, todo27 Phase 2)
//
// MEASURED (todo27): building while `tree-sitter` was missing left 16 files in `build/` carrying an
// unresolved `@/` import. `tsc` had failed partway (a broken type resolution somewhere in the
// dependency chain), so the `&& tsc-alias` step in the `build` script never ran on those files — but
// the shell chain still produced a `build/` directory, because SOME files transpiled fine before the
// failure. A partial build and a complete one look identical from the outside: both are a `build/`
// folder that exists. Every integration test then died on
// `Cannot find package '@/registry' imported from build/src/interfaces/cli/index.js`, which names
// the symptom (a package that does not exist) and not the cause (a build that did not finish).
//
// This walks `build/` for any `.js` file whose import/require/export specifier still starts with
// `@/` — the alias `tsc-alias` is responsible for rewriting to a relative path — and fails loudly,
// naming every offending file, rather than leaving a build/ that looks done and is not.
import fs from "node:fs";
import path from "node:path";

const ALIAS_SPECIFIER = /(?:from\s*|require\(\s*)['"]@\/[^'"]*['"]/;

/** @returns {string[]} absolute paths of .js files under buildDir still carrying a bare `@/` import. */
export function findUnresolvedAliasImports(buildDir) {
  const offenders = [];
  if (!fs.existsSync(buildDir)) return offenders;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".js")) {
        const content = fs.readFileSync(full, "utf8");
        if (ALIAS_SPECIFIER.test(content)) offenders.push(full);
      }
    }
  };
  walk(buildDir);
  return offenders;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Scoped to build/src — the code that actually RUNS. The failure this gate exists to catch was
  // `Cannot find package '@/registry' imported from build/src/interfaces/cli/index.js`, i.e. the
  // shipped CLI, and jest ignores build/ entirely (`modulePathIgnorePatterns`), so build/tests is
  // never executed from there.
  //
  // It also removes a false positive that blocked a legitimate build: a test that embeds FIXTURE
  // SOURCE in a template literal — `source: \`import { x } from '@/core/y'\`` — reads to a regex
  // exactly like a real unrewritten import, because a regex cannot tell code from a string
  // containing code. Narrowing the directory is the honest fix; trying to parse JS here is not.
  const buildDir = path.resolve(process.cwd(), "build", "src");
  const offenders = findUnresolvedAliasImports(buildDir);

  if (offenders.length > 0) {
    console.error(
      `[postbuild] ${offenders.length} file(s) in build/ still carry an unresolved '@/' import ` +
        `- the build is partial, not complete:`
    );
    for (const f of offenders) console.error(`  ${path.relative(process.cwd(), f)}`);
    console.error(
      "This usually means tsc failed partway (e.g. a broken dependency) and tsc-alias never ran " +
        "on the rest. Fix the tsc error and rebuild - do not ship this build/."
    );
    process.exit(1);
  }

  console.log(`[postbuild] build/ clean - no unresolved '@/' imports`);
  process.exit(0);
}
