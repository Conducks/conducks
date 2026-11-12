import { describe, it, expect } from '@jest/globals';
import { JavaResolver } from '@/lib/core/parsing/languages/java/resolver.js';
import { moduleKeyOf } from '@/contracts/index.js';

/**
 * Java imports and packages (Java oracle, 2026-11-12).
 *
 * MEASURED before the fix on the oracle fixture: `import static com.acme.util.Maths.square` and
 * `import com.acme.model.*` were both written as external boundaries (DEPENDS_ON ecosystem::…), so
 * `square(3)` and `new Point(...)` resolved to nothing and `Maths` was called dead; and a class used
 * from its own package — which Java needs no import for — read as a file nothing imports.
 */
const R = '/r/src/main/java/com/acme';
const FILES = [
  `${R}/App.java`, `${R}/Service.java`, `${R}/Outer.java`,
  `${R}/util/Maths.java`, `${R}/util/Strings.java`,
  `${R}/model/Owner.java`, `${R}/model/Point.java`,
  '/r/src/test/java/com/acme/AppTest.java',
  '/other/src/main/java/org/acme/util/Maths.java',
];
const resolve = (spec: string) => new JavaResolver().resolve(spec, `${R}/App.java`, FILES);

describe('Java import resolution', () => {
  it('a class import resolves to the class file', () => {
    expect(resolve('com.acme.util.Strings')).toBe(`${R}/util/Strings.java`);
  });

  it('a static import of a member resolves to the class that declares it', () => {
    expect(resolve('com.acme.util.Maths.square')).toBe(`${R}/util/Maths.java`);
  });

  it('a nested-class import resolves to the file of its top-level class', () => {
    expect(resolve('com.acme.Outer.Inner')).toBe(`${R}/Outer.java`);
  });

  it('a wildcard (package) import resolves to a file of that package', () => {
    expect([`${R}/model/Owner.java`, `${R}/model/Point.java`]).toContain(resolve('com.acme.model'));
  });

  it('matches the whole package path, not segments scattered through the path', () => {
    // org.acme.util.Maths exists only under /other; com.acme... must not pick it, nor the reverse.
    expect(resolve('org.acme.util.Maths')).toBe('/other/src/main/java/org/acme/util/Maths.java');
    expect(resolve('com.nothere.Maths')).toBeUndefined();
  });

  it('an external import resolves to nothing', () => {
    expect(resolve('java.util.List')).toBeUndefined();
  });
});

describe('a Java package is one module', () => {
  it('files of one package share a key, main and test sources alike', () => {
    expect(moduleKeyOf(`${R}/App.java`)).toBe(moduleKeyOf(`${R}/Service.java`));
    expect(moduleKeyOf(`${R}/App.java`)).toBe(moduleKeyOf('/r/src/test/java/com/acme/AppTest.java'));
  });

  it('a sub-package is another module', () => {
    expect(moduleKeyOf(`${R}/App.java`)).not.toBe(moduleKeyOf(`${R}/util/Maths.java`));
  });

  it('the same package name in another project is another module', () => {
    expect(moduleKeyOf(`${R}/util/Maths.java`)).not.toBe(moduleKeyOf('/other/src/main/java/org/acme/util/Maths.java'));
  });
});
