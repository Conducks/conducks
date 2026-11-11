import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A Go MODULE: `import "example.com/gofx/internal/store"` names a package by the module path in
 * go.mod, and a package is every .go file in its directory.
 *
 * MEASURED on this exact fixture before the fix: the import resolved to nothing (the resolver never
 * read go.mod), so store.go read as a file nothing imports and all six of its unexported symbols were
 * questions instead of verdicts, `double` and `one` among them — both live.
 *
 * Checked with the Go toolchain: `go vet ./...` and `go test ./...` pass. Go's compiler reports no
 * unused functions; staticcheck's U1000 (the usual authority) reports exactly `unusedMethod` and
 * `helperUnused`. Everything else is called, passed as a value (`Map(xs, double)`), stored in a
 * map (`"one": one`), assigned in `init`, satisfied through an interface (`Save`), taken as a
 * method value (`d.Count`), or run by the runtime (`init`, `main`).
 */
describe('a Go module: module-path imports, packages, values (go)', () => {
  let repo: string;
  let findings: Array<{ type: string; symbol: string; file: string }>;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('go-module');
    writeFile(repo, 'go.mod', 'module example.com/gofx\n\ngo 1.22\n');
    writeFile(repo, 'internal/store/store.go', `package store

import "fmt"

// Saver is satisfied by *Disk; nothing calls Save by name on *Disk.
type Saver interface{ Save(k string) error }

type Disk struct{ Base }

type Base struct{ n int }

func (b Base) Count() int { return b.n }

func NewDisk() *Disk { return &Disk{} }

func (d *Disk) Save(k string) error { return d.write(k) }

func (d *Disk) write(k string) error { fmt.Println(k); return nil }

func (d *Disk) unusedMethod() {}

// Satisfies the STANDARD LIBRARY's json.Marshaler, an interface this project never declares; only
// json.Marshal calls it. (Not String(): the builtin type "string" already spares that name.)
func (d *Disk) MarshalJSON() ([]byte, error) { return []byte("{}"), nil }

// An UNEXPORTED interface, satisfied by an unexported method and used only through the interface.
type closer interface{ close() }

func (d *Disk) close() {}

func Shut(d *Disk) { var c closer = d; c.close() }

func Map[T any](xs []T, f func(T) T) []T {
	out := make([]T, 0, len(xs))
	for _, x := range xs { out = append(out, f(x)) }
	return out
}

func double(x int) int { return x * 2 }

func Doubled(xs []int) []int { return Map(xs, double) }

func helperUnused() int { return 1 }

var registry = map[string]func() int{"one": one}

func one() int { return 1 }

func Lookup(k string) int { return registry[k]() }

func init() { registry["two"] = two }

func two() int { return 2 }

func Seven() int { return helperB() }

// Used only as a VALUE from another package: []func(int) int{store.Triple}.
func Triple(x int) int { return x * 3 }

// An unexported method used only as a method VALUE passed on: Apply(d.inc).
func (d *Disk) inc(x int) int { return x + 1 }

func Apply(f func(int) int) int { return f(1) }

func Bump(d *Disk) int { return Apply(d.inc) }

// Called as store.Nine() from a package that has its own package-level var named nine.
func Nine() int { return 9 }

// Defined TWICE, once per build constraint; whichever the call binds to, both are live.
func Platform() string { return platName() }
`);
    // A SECOND FILE of package store: `Seven` in store.go calls `helperB` here with no import.
    writeFile(repo, 'internal/store/extra.go', `package store

func helperB() int { return 7 }

// A FIELD named like store.Nine, ignoring case (fzf: LightRenderer.ttyin vs tui.TtyIn).
type holder struct{ nine int }

var held = holder{nine: 1}

func Held() int { return held.nine }
`);
    // Another package with its own `helperB`, which nothing calls: dead (U1000). It is only
    // reportable if store.go's call binds to ITS sibling; a dangling call would spare every helperB.
    writeFile(repo, 'internal/other/other.go', `package other

func helperB() int { return 8 }

func Eight() int { return 8 }
`);
    // A SIBLING file of main.go declaring a package-level name equal, ignoring case, to store.Nine.
    writeFile(repo, 'cmd/app/vars.go', `package main

var nine = 0
`);
    writeFile(repo, 'internal/store/plat_linux.go', `//go:build linux

package store

func platName() string { return "linux" }
`);
    writeFile(repo, 'internal/store/plat_other.go', `//go:build !linux

package store

func platName() string { return "other" }
`);
    writeFile(repo, 'internal/store/store_test.go', `package store

import "testing"

func TestDoubled(t *testing.T) {
	if Doubled([]int{1})[0] != 2 { t.Fatal("x") }
}
`);
    writeFile(repo, 'cmd/app/main.go', `package main

import (
	"encoding/json"
	"fmt"
	"os"

	"example.com/gofx/internal/other"
	"example.com/gofx/internal/store"
)

func run(s store.Saver) error { return s.Save("k") }

func main() {
	d := store.NewDisk()
	if err := run(d); err != nil {
		os.Exit(1)
	}
	fmt.Println(store.Doubled([]int{2}), store.Lookup("one"))
	store.Shut(d)
	fmt.Println(store.Seven(), other.Eight())
	fns := []func(int) int{store.Triple}
	fmt.Println(fns[0](2), store.Bump(d), store.Platform())
	fmt.Println(store.Nine(), nine, store.Held())
	b, _ := json.Marshal(d)
	fmt.Println(string(b))
	count := d.Count
	_ = count
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    const { stdout } = runCli(['prune', '--json'], { cwd: repo });
    findings = JSON.parse(stdout);
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('flags exactly what staticcheck U1000 flags, as verdicts', () => {
    const names = ['Saver', 'Disk', 'Base', 'Count', 'NewDisk', 'Save', 'write', 'unusedMethod', 'Map',
      'double', 'Doubled', 'helperUnused', 'registry', 'one', 'Lookup', 'init', 'two', 'run', 'main', 'close', 'Shut', 'MarshalJSON'];
    const verdict = Object.fromEntries(names.map(n => [n, findings.find(f => f.symbol === n)?.type ?? null]));
    expect(verdict).toEqual({
      Saver: null, Disk: null, Base: null, Count: null, NewDisk: null, Save: null, write: null,
      unusedMethod: 'ORPHAN', Map: null, double: null, Doubled: null, helperUnused: 'ORPHAN',
      registry: null, one: null, Lookup: null, init: null, two: null, run: null, main: null,
      close: null, Shut: null, MarshalJSON: null,
    });
  });

  it('a qualified function value, a method value and build-tagged twins are all live', () => {
    // MEASURED on fzf v0.56.3 against go/types: `algo.PrefixMatch` stored in a table,
    // `t.dumpStatus` passed on, and `compareRanks` / `TtyIn` defined once per build constraint
    // were all reported dead; and `ttyin, err := tui.TtyIn()` bound the call to a sibling file's package-level `var ttyin`.
    const flagged = findings.filter(f => ['Triple', 'inc', 'platName', 'Nine'].includes(f.symbol))
      .map(f => `${f.type} ${f.symbol} ${f.file.split('/').pop()}`);
    expect(flagged).toEqual([]);
  });

  it('a package sees its own files: the sibling helperB is used, the other package\'s is dead', () => {
    const helperB = findings.filter(f => f.symbol === 'helperB').map(f => `${f.type} ${f.file.split('/').slice(-2).join('/')}`);
    expect(helperB).toEqual(['ORPHAN other/other.go']);
  });

  it('a call through the package name reaches the declaration: impact finds main', () => {
    const { stdout } = runCli(['impact', 'Doubled', 'upstream', '--json'], { cwd: repo });
    const ids = (JSON.parse(stdout).affectedNodes as Array<{ id: string }>).map(n => n.id.toLowerCase());
    expect(ids.some(id => id.includes('cmd/app/main.go'))).toBe(true);
  });
});
