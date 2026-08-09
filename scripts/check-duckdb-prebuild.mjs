// Conducks — preinstall DuckDB prebuild check (todo56)
//
// `duckdb` installs through `node-pre-gyp install --fallback-to-build`: it downloads a binary built
// for THIS Node's ABI, and if none exists it compiles DuckDB from source. That fallback is silent,
// takes 10+ minutes, and needs a C++ toolchain — on a machine without one it fails after those ten
// minutes, having said nothing about why.
//
// Measured 2026-08-09 against `npm.duckdb.org` for duckdb 1.4.4:
//
//   Node 20 (ABI 115), 22 (127), 24 (137) — darwin-arm64 and linux-x64 — HTTP 200, installs in seconds
//   Node 25 (ABI 141)                     — HTTP 404, compiles from source
//
// So the install is fine on the versions people actually run, and silently awful on whatever Node
// major shipped most recently. That is not a one-off: `node-pre-gyp` builds are ABI-specific, so this
// recurs at EVERY Node major until the dependency moves to a NAPI package (todo56 carries that).
//
// This runs as `preinstall`, which npm executes BEFORE fetching dependencies — the only moment where
// saying so can still save someone the ten minutes.
//
// It never fails the install (exit 0 always), matching ADR 0027's rule for the tree-sitter binding:
// an install that hard-requires a C++ toolchain is the thing we are avoiding, not the thing we
// enforce. Compiling is a legitimate choice; being surprised by it is not.

/** Node ABIs with a published DuckDB prebuild. Verified by HEAD against the node-pre-gyp host. */
export const PREBUILT_ABIS = new Set(['108', '115', '127', '137']);

/** @param {string} abi @param {string} nodeVersion */
export function prebuildWarning(abi, nodeVersion) {
  if (PREBUILT_ABIS.has(abi)) return null;
  return [
    `[conducks] heads up: Node ${nodeVersion} (ABI ${abi}) has no prebuilt DuckDB binary.`,
    '',
    '  npm will COMPILE DuckDB from source instead. That takes roughly 10-15 minutes and needs a',
    '  C++ toolchain (Xcode Command Line Tools on macOS, build-essential on Linux). Without one it',
    '  will fail — after those ten minutes.',
    '',
    '  For an install that takes seconds, use an LTS Node: 20, 22 or 24.',
    '    nvm install 24 && nvm use 24',
    '',
    '  Continuing. If you meant to compile, nothing is wrong.',
  ].join('\n');
}

// Only speak when actually run as a script, so importing this in a test stays silent.
if (process.argv[1] && process.argv[1].endsWith('check-duckdb-prebuild.mjs')) {
  const warning = prebuildWarning(process.versions.modules, process.versions.node);
  if (warning) console.error(warning);
}
