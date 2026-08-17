import { describe, it, expect } from '@jest/globals';
import {
  CProvider, CPPProvider, CSharpProvider, GoProvider, JavaProvider,
  PHPProvider, RubyProvider, RustProvider, SwiftProvider,
} from '@/lib/core/parsing/index.js';

/**
 * Nine language packs turning a specifier into a file — the one rule a pack cannot share (rule 10).
 *
 * Every one of these resolvers had ZERO statement coverage across the whole suite while being wired
 * into its provider and called on every import in that language. Nine of the thirteen packs also
 * have no oracle, so nothing measured them from the other direction either. That combination is the
 * largest untested surface left in core, and it is the surface that decides whether a cross-file
 * edge exists at all: a resolver returning undefined produces a graph where nothing imports
 * anything, and `impact`, `trace` and `dead-code` all read that as a true answer about the code.
 *
 * Driven through the PROVIDER rather than the resolver class, because `resolveImport` is the wiring
 * a pack is used by. Three packs were caught by exactly this kind of gap before (todo29), where the
 * resolver was right and the provider never called it.
 *
 * Each language gets a HIT, a MISS, and — where the implementation earns one — a case pinning a
 * limitation rather than pretending it is not there. The misses matter as much as the hits: a
 * resolver that returned the first file in the list for everything would pass every hit case here.
 */
type Pack = {
  lang: string;
  provider: { resolveImport(raw: string, from: string, all: string[]): string | undefined };
  /** [specifier, importing file, project files, expected] */
  hit: [string, string, string[], string];
  miss: [string, string, string[]];
};

const PACKS: Pack[] = [
  {
    lang: 'c', provider: new CProvider(),
    hit: ['"utils.h"', '/p/src/main.c', ['/p/src/utils.h', '/p/src/other.h'], '/p/src/utils.h'],
    miss: ['"nowhere.h"', '/p/src/main.c', ['/p/src/utils.h']],
  },
  {
    lang: 'cpp', provider: new CPPProvider(),
    // Angle brackets, not quotes — the system-header spelling, stripped by the same rule.
    hit: ['<engine.hpp>', '/p/src/main.cpp', ['/p/src/engine.hpp'], '/p/src/engine.hpp'],
    miss: ['<vector>', '/p/src/main.cpp', ['/p/src/engine.hpp']],
  },
  {
    lang: 'csharp', provider: new CSharpProvider(),
    // `using Acme.Models;` — dots become path separators.
    hit: ['using Acme.Models;', '/p/Program.cs', ['/p/Acme/Models/User.cs'], '/p/Acme/Models/User.cs'],
    miss: ['using System.Text;', '/p/Program.cs', ['/p/Acme/Models/User.cs']],
  },
  {
    lang: 'go', provider: new GoProvider(),
    // A module path resolved by walking UP from the importing file until the package appears.
    hit: ['"app/store"', '/p/cmd/main.go', ['/p/app/store/db.go'], '/p/app/store/db.go'],
    miss: ['"github.com/외부/pkg"', '/p/cmd/main.go', ['/p/app/store/db.go']],
  },
  {
    lang: 'java', provider: new JavaProvider(),
    hit: ['com.example.MyClass', '/p/src/Main.java', ['/p/src/com/example/MyClass.java'], '/p/src/com/example/MyClass.java'],
    miss: ['com.example.Missing', '/p/src/Main.java', ['/p/src/com/example/MyClass.java']],
  },
  {
    lang: 'php', provider: new PHPProvider(),
    // Namespace separators are backslashes; they become path separators.
    hit: ['use Acme\\Models;', '/p/index.php', ['/p/src/Acme/Models/User.php'], '/p/src/Acme/Models/User.php'],
    miss: ['use Vendor\\Absent;', '/p/index.php', ['/p/src/Acme/Models/User.php']],
  },
  {
    lang: 'ruby', provider: new RubyProvider(),
    hit: ["'lib/thing'", '/p/app.rb', ['/p/lib/thing.rb'], '/p/lib/thing.rb'],
    miss: ["'lib/absent'", '/p/app.rb', ['/p/lib/thing.rb']],
  },
  {
    lang: 'rust', provider: new RustProvider(),
    // `crate::` is stripped and `::` becomes `/`; both `.rs` and `mod.rs` are tried.
    hit: ['crate::store::db', '/p/src/main.rs', ['/p/src/store/db.rs'], '/p/src/store/db.rs'],
    miss: ['crate::store::absent', '/p/src/main.rs', ['/p/src/store/db.rs']],
  },
  {
    lang: 'swift', provider: new SwiftProvider(),
    hit: ['import Acme', '/p/App.swift', ['/p/Sources/Acme/User.swift'], '/p/Sources/Acme/User.swift'],
    miss: ['import Foundation', '/p/App.swift', ['/p/Sources/Acme/User.swift']],
  },
];

describe('each language pack resolves a specifier it owns', () => {
  for (const p of PACKS) {
    it(`${p.lang}: finds the file a real specifier names`, () => {
      const [spec, from, all, expected] = p.hit;
      expect(p.provider.resolveImport(spec, from, all)).toBe(expected);
    });

    it(`${p.lang}: answers undefined for a specifier naming nothing here`, () => {
      // Undefined is an ANSWER — an external package, or a typo. Returning a plausible file instead
      // is the failure that cannot be seen downstream, because a wrong edge and a right edge look
      // identical in every command that reads the graph.
      const [spec, from, all] = p.miss;
      expect(p.provider.resolveImport(spec, from, all)).toBeUndefined();
    });
  }
});

describe('rust tries both module spellings', () => {
  it('resolves a directory module through mod.rs', () => {
    // `crate::store` may be `store.rs` OR `store/mod.rs`. Only the second is present here, so a
    // resolver checking one spelling would miss every directory module in the project.
    const rust = new RustProvider();
    expect(rust.resolveImport('crate::store', '/p/src/main.rs', ['/p/src/store/mod.rs']))
      .toBe('/p/src/store/mod.rs');
  });
});

describe('go ignores what a Go build ignores', () => {
  it('never resolves onto a _test.go file', () => {
    // A test file is not the package's importable surface. Binding to one would make every
    // dependency of a tested package point at its tests.
    const go = new GoProvider();
    expect(go.resolveImport('"app/store"', '/p/cmd/main.go', ['/p/app/store/db_test.go']))
      .toBeUndefined();
  });

  it('never resolves into vendor/, even when proximity reaches it', () => {
    // The importing file is INSIDE vendor, so walking up from it lands squarely on
    // `/p/vendor/app/store` — the vendor filter is then the only thing that can refuse the match.
    //
    // The first version of this case imported from `/p/cmd/main.go`, where proximity never reaches
    // `/p/vendor/...` at all. It passed, and it passed with the vendor filter deleted: it was
    // asserting the proximity walk while claiming to assert the filter. Mutation is what said so.
    const go = new GoProvider();
    expect(go.resolveImport('"app/store"', '/p/vendor/cmd/main.go', ['/p/vendor/app/store/db.go']))
      .toBeUndefined();
  });
});

describe('the substring packs are LOOSE, and this is the limitation not a claim of correctness', () => {
  it('csharp, php and swift match on `includes`, so a longer path wins by accident', () => {
    // Recorded rather than fixed (ADR 0150 rule 16). These three resolve by asking whether the file
    // path CONTAINS the cleaned specifier, so `using Acme.Models` also matches
    // `/p/ThirdParty/Acme/Models/Vendored.cs` — and whichever file the list happens to hold first
    // is what gets returned. It is order-dependent, which means the graph can change because a
    // directory listing changed.
    //
    // Pinned so the weakness is visible and so a fix has a test to turn green. Asserting the real
    // behaviour is not endorsing it; asserting nothing is what let it stay invisible.
    const cs = new CSharpProvider();
    const answer = cs.resolveImport('using Acme.Models;', '/p/Program.cs', [
      '/p/ThirdParty/Acme/Models/Vendored.cs',
      '/p/Acme/Models/User.cs',
    ]);

    expect(answer).toBe('/p/ThirdParty/Acme/Models/Vendored.cs');
  });
});
