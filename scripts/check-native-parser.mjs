// Conducks — postinstall native-parser check (ADR 0062, todo27 Phase 1)
//
// `tree-sitter` (the native runtime, not the 13 grammar packages) is an `optionalDependency`
// (ADR 0027) so `npm install` succeeds on a machine with no C++ toolchain instead of aborting.
// That is correct — but success is silent either way: whether the binding compiled or npm quietly
// skipped it, the install log reads the same, and `npm install` exits 0 in both cases. Without the
// binding, EVERY language degrades at once to the Gnosis regex extractor (MEASURED, todo27: the PHP
// suite went from 8 expected symbols to 1). `conducks doctor` already reports this correctly, but
// nobody runs `doctor` on a fresh clone before hitting the degraded result — this check gives the
// same fact a voice at install time, the one moment before anyone has acted on the missing signal.
//
// Deliberately never fails the install (exit 0 always) — that would reopen exactly what ADR 0027
// fixed: an install that hard-requires a C++ toolchain. This only makes the silent case loud.
import { createRequire } from "node:module";

/**
 * @param {(id: string) => unknown} requireFn - injected so this is testable without needing a real
 *   absent/present `tree-sitter` module on disk. Defaults to a real CJS require of this file's own
 *   location, which is how the postinstall run below actually resolves it.
 */
export function checkNativeParser(requireFn = createRequire(import.meta.url)) {
  try {
    requireFn("tree-sitter");
    return { available: true, message: null };
  } catch {
    const message = [
      "[conducks] warning: the native tree-sitter binding did not install.",
      "  Every language will parse through the Gnosis regex fallback instead — it still runs, at",
      "  lower fidelity (see `conducks doctor` for what that costs on this project).",
      "  Usually means no C++ toolchain was present during install. Install one",
      "  (macOS: xcode-select --install · Debian: apt install build-essential · Windows: VS Build",
      "  Tools) and reinstall conducks to compile the native binding.",
    ].join("\n");
    return { available: false, message };
  }
}

// Run only when invoked directly (the postinstall script), never on import — the test file imports
// `checkNativeParser` without wanting this side effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkNativeParser();
  if (!result.available) {
    console.warn(result.message);
  }
  process.exit(0);
}
