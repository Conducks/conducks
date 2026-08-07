import { describe, it, expect } from '@jest/globals';
import { isTestPath } from "@/contracts/test-path.js";
describe('isTestPath', () => {
  it.each([
    'src/tests/core/test_hands.py', 'a/__tests__/x.ts', 'tests/core/test_hands.py',
    'src/foo.test.ts', 'src/foo.spec.tsx', 'pkg/thing_test.go', 'lib/mod_test.rs',
    'app/model_spec.rb', 'ui/WidgetTests.swift', 'spec/models/user.rb',
  ])('%s is a test', p => expect(isTestPath(p)).toBe(true));
  it.each([
    'src/testing/harness.ts', 'src/latest.ts', 'src/contest.py', 'src/protest/api.go',
    'src/core/service/hands.py', 'src/attestation.ts',
  ])('%s is NOT a test', p => expect(isTestPath(p)).toBe(false));
  it('null/empty is not a test', () => { expect(isTestPath(null)).toBe(false); expect(isTestPath('')).toBe(false); });
});
