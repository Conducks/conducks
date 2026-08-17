import { describe, it, expect } from '@jest/globals';
import { GVREngine } from '@/lib/domain/evolution/index.js';

/**
 * The one line `conducks rename` rewrites a source line with. It was at 37% coverage, and it is the
 * only place in this codebase that EDITS A USER'S SOURCE.
 *
 * A rename that is too eager does not fail — it succeeds, writes, and leaves a codebase that no
 * longer compiles or, worse, one that compiles with a changed string. The dangerous direction is
 * silent: renaming inside a quoted string changes a database column, an API path or a log message,
 * and the compiler has nothing to say about it.
 *
 * So the cases here are mostly about what it must NOT touch. `replaceInCode` is a hand-written
 * scanner rather than a regex precisely because a regex cannot tell code from a string, and every
 * state it tracks — in-quote, in-line-comment, in-block-comment, mid-identifier — is a case below.
 */
const rn = (line: string) => GVREngine.replaceInCode(line, 'oldName', 'newName');

describe('what it renames', () => {
  it('a bare identifier', () => {
    expect(rn('const x = oldName;')).toBe('const x = newName;');
  });

  it('a member, because renaming a method is the common case', () => {
    expect(rn('obj.oldName();')).toBe('obj.newName();');
  });

  it('every occurrence on the line', () => {
    expect(rn('oldName(oldName);')).toBe('newName(newName);');
  });
});

describe('what it must NOT touch — the silent direction', () => {
  it('a double-quoted string', () => {
    // Renaming here changes a column name, a route or a log message, and nothing complains.
    expect(rn('log("oldName");')).toBe('log("newName");'.replace('newName', 'oldName'));
  });

  it('a single-quoted string', () => {
    expect(rn("const s = 'oldName';")).toBe("const s = 'oldName';");
  });

  it('a template literal', () => {
    expect(rn('const s = `oldName`;')).toBe('const s = `oldName`;');
  });

  it('a line comment', () => {
    expect(rn('doThing(); // oldName stays')).toBe('doThing(); // oldName stays');
  });

  it('a block comment that closes on the same line', () => {
    expect(rn('a(); /* oldName */ oldName;')).toBe('a(); /* oldName */ newName;');
  });

  it('a block comment that does NOT close on this line', () => {
    // The scanner cannot see the next line, so an unterminated block takes the rest of this one.
    // Renaming past it would edit prose in a doc comment.
    expect(rn('a(); /* oldName and more')).toBe('a(); /* oldName and more');
  });

  it('an ESCAPED quote does not end the string early', () => {
    // Without the escape rule the scanner leaves the string at `\"` and renames the rest of the
    // literal as if it were code.
    expect(rn('const s = "a \\" oldName";')).toBe('const s = "a \\" oldName";');
  });

  it('a LONGER identifier that merely contains the name', () => {
    // The substring trap. `oldNameSuffix` and `prefixOldName` are different symbols, and a rename
    // that mangles them produces code that does not compile — loud, but only after the fact.
    expect(rn('oldNameSuffix; prefixoldName; oldName_;'))
      .toBe('oldNameSuffix; prefixoldName; oldName_;');
  });

  it('a string that follows real code on the same line', () => {
    // Both states in one line, in that order — the case a scanner with a sticky flag gets wrong.
    expect(rn('oldName("oldName");')).toBe('newName("oldName");');
  });

  it('code that follows a closed string on the same line', () => {
    expect(rn('f("oldName", oldName);')).toBe('f("oldName", newName);');
  });
});

describe('lines with nothing to do', () => {
  it('returns an unrelated line unchanged, character for character', () => {
    const line = '  const total = items.reduce((a, b) => a + b, 0); // sums';
    expect(rn(line)).toBe(line);
  });

  it('handles an empty line', () => {
    expect(rn('')).toBe('');
  });
});
