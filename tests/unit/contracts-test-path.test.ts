import { describe, it, expect } from '@jest/globals';
import { isTestPath } from "@/contracts/index.js";
describe('isTestPath', () => {
  it.each([
    'src/tests/core/test_hands.py', 'a/__tests__/x.ts', 'tests/core/test_hands.py',
    'src/foo.test.ts', 'src/foo.spec.tsx', 'pkg/thing_test.go', 'lib/mod_test.rs',
    'app/model_spec.rb', 'ui/WidgetTests.swift', 'spec/models/user.rb',
    // Rust: `#[cfg(test)] mod tests;` lives in tests.rs (or test.rs) beside or below its module.
    'crates/core_lib/src/util/tests.rs', 'src/test.rs',
    // ...or in `<module>_tests.rs`, named by `#[cfg(test)] #[path = "tree_tests.rs"] mod tests;`.
    'crates/cli/src/commands/tree_tests.rs',
  ])('%s is a test', p => expect(isTestPath(p)).toBe(true));
  it.each([
    'src/testing/harness.ts', 'src/latest.ts', 'src/contest.py', 'src/protest/api.go',
    'src/core/service/hands.py', 'src/attestation.ts',
    // Only the WHOLE name `tests.rs`: a module that merely ends in "tests" is source.
    'src/contests.rs', 'src/latests.rs', 'src/tests_util.rs',
    // Go compiles only `_test.go` as a test; `_tests.go` is ordinary source.
    'pkg/handler_tests.go',
  ])('%s is NOT a test', p => expect(isTestPath(p)).toBe(false));
  it('null/empty is not a test', () => { expect(isTestPath(null)).toBe(false); expect(isTestPath('')).toBe(false); });
});
