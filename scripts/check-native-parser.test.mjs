// Conducks — self-test for scripts/check-native-parser.mjs (todo27 Phase 1)
//
// Plain Node, not Jest: this repo's jest config only picks up `tests/**/*.test.ts`
// (jest.config.js testMatch), and this agent's file lane does not include creating new files under
// tests/. Run directly: `node scripts/check-native-parser.test.mjs`.
//
// Proves the one thing Phase 1 requires: a warning naming `tree-sitter` fires when the module is
// absent, and nothing fires when it is present — using an injected requireFn so no real
// present/absent tree-sitter install is needed to exercise both branches.
import assert from "node:assert/strict";
import { checkNativeParser } from "./check-native-parser.mjs";

// Binding present: requireFn resolves normally.
{
  const result = checkNativeParser(() => ({ Parser: class {} }));
  assert.equal(result.available, true, "expected available:true when require succeeds");
  assert.equal(result.message, null, "expected no warning when the binding is present");
}

// Binding absent: requireFn throws the same shape of error Node throws for a skipped optional dep.
{
  const result = checkNativeParser(() => {
    throw new Error("Cannot find module 'tree-sitter'");
  });
  assert.equal(result.available, false, "expected available:false when require throws");
  assert.match(result.message, /tree-sitter/, "warning must name tree-sitter");
}

console.log("scripts/check-native-parser.test.mjs: OK (4 assertions, 2 cases)");
