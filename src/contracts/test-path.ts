/**
 * Conducks — Is this file a TEST? 🧪
 *
 * ONE answer, derived from the PATH, because the parse-time flag does not survive the vault.
 *
 * `reflector` computes `isTest` per file and writes it into a node's metadata — and the persisted
 * metadata carries no such key, so `properties.isTest` is `undefined` on every graph loaded from the
 * vault, which is every graph a read command sees. Three consumers trusted it and two were therefore
 * no-ops that looked like working filters: `status` ranked a Python test file as the repository's
 * top structural hotspot while filtering `!isTest`, and `TestAligner` marked test nodes themselves
 * as covered-by-a-test. The third had a path-based fallback of its own, which is the fourth
 * implementation of this predicate in the codebase.
 *
 * A path is always available on a loaded node. So the predicate is path-based, lives here, and every
 * consumer calls it — including the reflector, so the parse-time flag and the read-time answer can
 * never disagree.
 *
 * IN `contracts` BY NECESSITY, and it is the right home anyway: "what counts as a test file" is
 * shared vocabulary, not core logic, and `cli` may import contracts while it may not import core
 * (ADR 0005). The boundary gate caught the first placement — under `core/utils` — the moment two CLI
 * files imported it, which is the gate doing exactly its job.
 *
 * DELIBERATELY BROAD on directories and narrow on names: `/tests/` anywhere in the path is a test
 * tree in every language conducks parses, while a bare `test` prefix is only claimed for a filename
 * (`test_hands.py`), never a directory segment like `testing/` that often holds real source.
 */

const TEST_FILENAME = /^(test_|test\.)|(_test|_spec|\.test|\.spec|tests)\.[cm]?[jt]sx?$|_test\.(go|rs|py)$|_spec\.rb$|tests?\.swift$/;
const TEST_DIR = /(^|\/)(tests?|__tests__|spec|specs)\//;

/** True when this path belongs to a test tree or is itself a test file. */
export function isTestPath(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  const lower = String(filePath).toLowerCase();
  const fileName = lower.split('/').pop() || '';
  return TEST_DIR.test(lower) || TEST_FILENAME.test(fileName);
}

/** The same question asked of a graph node, which may carry its path under either spelling. */
export function isTestNode(n: { properties?: unknown } | null | undefined): boolean {
  const props = n?.properties as Record<string, unknown> | undefined;
  if (props?.isTest === true) return true;   // parse-time flag, when the graph is still in memory
  return isTestPath((props?.filePath as string) ?? undefined);
}
