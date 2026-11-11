import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A Swift package: protocol conformance, functions used as values, and two files of one module.
 *
 * MEASURED on this fixture before the fix: `save` was reported as an unused export (it is the
 * `Saver` requirement, reached through `s.save(...)`), and `double` (`xs.map(double)`), `one`
 * (`["one": one]`) and `twice` (`let f = twice`) as dead.
 *
 * NOT COMPILED: no Swift toolchain on the machine this was written on. By the language's rules the
 * only dead declaration here is `helperUnused`. `unusedMethod` is dead too, but a member of a type
 * is not judged by prune in any language (the type is), so it is not part of the claim.
 */
describe('a Swift package: conformance and values (swift)', () => {
  let repo: string;
  let findings: Array<{ type: string; symbol: string }>;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('swift-module');
    writeFile(repo, 'Package.swift', `// swift-tools-version:5.9
import PackageDescription
let package = Package(name: "swfx", targets: [
  .target(name: "Store"), .executableTarget(name: "App", dependencies: ["Store"])])
`);
    writeFile(repo, 'Sources/Store/Store.swift', `public protocol Saver { func save(_ k: String) -> Bool }

public final class Disk: Saver {
    public init() {}
    public func save(_ k: String) -> Bool { write(k) }
    private func write(_ k: String) -> Bool { !k.isEmpty }
    private func unusedMethod() {}
}

public protocol Named { var label: String { get } }

extension Disk: Named {
    public var label: String { "disk" }
    public func shout() -> String { label.uppercased() }
}

func double(_ x: Int) -> Int { x * 2 }

public func doubled(_ xs: [Int]) -> [Int] { xs.map(double) }

func helperUnused() -> Int { 1 }

let registry: [String: () -> Int] = ["one": one]

func one() -> Int { 1 }

public func lookup(_ k: String) -> Int { registry[k]?() ?? 0 }
`);
    // A second file of the SAME module: it sees Store.swift's internal names with no import.
    writeFile(repo, 'Sources/Store/Extra.swift', `func twice(_ x: Int) -> Int { x + x }

public func applyTwice(_ x: Int) -> Int {
    let f = twice
    return f(x)
}
`);
    writeFile(repo, 'Sources/App/main.swift', `import Store

func run(_ s: Saver) -> Bool { s.save("k") }

let d = Disk()
_ = run(d)
let n: Named = d
print(doubled([2]), lookup("one"), applyTwice(3), n.label)
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    const { stdout } = runCli(['prune', '--json'], { cwd: repo });
    findings = JSON.parse(stdout);
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('reports only helperUnused, and nothing reached through a protocol or used as a value', () => {
    const names = ['Saver', 'Disk', 'save', 'write', 'label', 'double', 'doubled', 'helperUnused',
      'registry', 'one', 'lookup', 'twice', 'applyTwice', 'run'];
    const verdict = Object.fromEntries(names.map(n => [n, findings.find(f => f.symbol === n)?.type ?? null]));
    expect(verdict).toEqual({
      Saver: null, Disk: null, save: null, write: null, label: null, double: null, doubled: null,
      helperUnused: 'ORPHAN', registry: null, one: null, lookup: null, twice: null, applyTwice: null, run: null,
    });
  });
});
