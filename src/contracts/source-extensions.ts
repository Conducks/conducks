/**
 * Conducks — which file extensions hold source this tool parses 📄
 *
 * ONE list. There were three verbatim copies — `analysis/module-hash.ts` (exported),
 * `analysis/project-monitor.ts` (private) and `evolution/watcher.ts` (as `WATCHED_EXTENSIONS`) — and
 * `diff` was about to add a fourth when it needed to filter untracked files.
 *
 * They were byte-identical at the moment they were merged, which is the ONLY safe moment to merge
 * them: three copies that already disagree require deciding which is right, while three that agree
 * only require deciding they should never diverge. The failure this prevents is the one `density`
 * demonstrated — the same concept computed two ways under one name, answering differently on two
 * surfaces, with nothing to say which was correct.
 *
 * Adding a language means adding it HERE, and every consumer follows. A grammar the parser supports
 * that is missing from this list is invisible to the watcher, the monitor, the module hash and the
 * PR risk engine at once, and each would report its absence as "nothing changed" rather than as
 * "not looked at".
 */
export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java",
  ".cs", ".cpp", ".cc", ".c", ".h", ".hpp", ".php", ".rb", ".swift",
]);
