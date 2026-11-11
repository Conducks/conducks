// Command oracle-go is the compiler half of tools/benchmark/oracle-go-dead.mjs.
//
// It type-checks every package of ONE Go module with the standard library's own type checker
// (go/build + go/parser + go/types + go/importer — nothing from golang.org/x, nothing downloaded) and
// prints, as JSON, every package-level declaration together with the evidence that something
// references it. The .mjs file does the scoring; this program only answers "what does the compiler
// see".
//
// THREE TIERS OF EVIDENCE, kept apart because they are not equally strong:
//
//	refs      an identifier the type checker resolved to this object (types.Info.Uses), outside the
//	          object's own declaration. Exact: delete the declaration and that line stops compiling.
//	static    a METHOD the compiler requires because its type is converted to an interface that
//	          names it — an assignment, call argument, return, composite-literal element, channel
//	          send, explicit conversion, type assertion / type switch, or a generic type argument
//	          whose constraint names it. Also exact: delete the method and the conversion stops
//	          compiling ("does not implement").
//	dynamic   a METHOD whose type flows into SOME interface (often `any`, e.g. fmt.Println(x)) and
//	          which satisfies a named interface somewhere in the program (fmt.Stringer, error, …).
//	          Not compiler-proven: the call happens through a runtime type assertion the module
//	          does not contain. Reported, never used to fail the gate.
//
// Test files are type-checked too (in-package _test.go files as part of their package, external
// _test packages separately), so a reference from a test is a reference. Declarations IN test files
// are emitted with test=true and the scorer leaves them out.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"go/ast"
	"go/build"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type def struct {
	Key        string `json:"key"`
	Pkg        string `json:"pkg"`
	PkgName    string `json:"pkgName"`
	File       string `json:"file"`
	Line       int    `json:"line"`
	Col        int    `json:"col"`
	Name       string `json:"name"`
	Recv       string `json:"recv,omitempty"`
	Kind       string `json:"kind"`
	Exported   bool   `json:"exported"`
	Test       bool   `json:"test"`
	Refs       int    `json:"refs"`
	RefsOther  int    `json:"refsOtherFile"`
	RefsNonTst int    `json:"refsNonTest"`
	FirstRef   string `json:"firstRef,omitempty"`
	Static     string `json:"static,omitempty"`
	Dynamic    string `json:"dynamic,omitempty"`
	// the source lines the declaration occupies (its whole GenDecl when ungrouped) — used by the
	// fixture self-check, which deletes a declaration and asks the compiler whether anything broke
	SpanLines [2]int `json:"span"`

	obj        types.Object
	start, end token.Pos
	file       string
}

type pkgUnit struct {
	path  string
	dir   string
	name  string
	files []*ast.File
	xtest []*ast.File
	bp    *build.Package
	pkg   *types.Package
	info  *types.Info
	xpkg  *types.Package
	xinfo *types.Info
	state int // 0 new, 1 checking, 2 done
}

var (
	fset      = token.NewFileSet()
	root      string
	modPath   string
	units     = map[string]*pkgUnit{}
	typeErrs  []string
	skipped   []string
	srcImport types.ImporterFrom
)

type localImporter struct{}

func (localImporter) Import(p string) (*types.Package, error) {
	return localImporter{}.ImportFrom(p, root, 0)
}
func (localImporter) ImportFrom(p, dir string, mode types.ImportMode) (*types.Package, error) {
	if u, ok := units[p]; ok {
		return check(u)
	}
	if p == "unsafe" {
		return types.Unsafe, nil
	}
	return srcImport.ImportFrom(p, dir, mode)
}

func newInfo() *types.Info {
	return &types.Info{
		Types:      map[ast.Expr]types.TypeAndValue{},
		Defs:       map[*ast.Ident]types.Object{},
		Uses:       map[*ast.Ident]types.Object{},
		Selections: map[*ast.SelectorExpr]*types.Selection{},
		Instances:  map[*ast.Ident]types.Instance{},
	}
}

func conf() *types.Config {
	return &types.Config{
		Importer: localImporter{},
		Error: func(err error) {
			if len(typeErrs) < 200 {
				typeErrs = append(typeErrs, err.Error())
			}
		},
	}
}

func check(u *pkgUnit) (*types.Package, error) {
	switch u.state {
	case 2:
		return u.pkg, nil
	case 1:
		return nil, fmt.Errorf("import cycle through %s", u.path)
	}
	u.state = 1
	u.info = newInfo()
	pkg, _ := conf().Check(u.path, fset, u.files, u.info) // errors are collected, not fatal
	u.pkg = pkg
	u.state = 2
	return pkg, nil
}

func readModulePath() string {
	b, err := os.ReadFile(filepath.Join(root, "go.mod"))
	if err != nil {
		fail("no go.mod at " + root)
	}
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) >= 2 && f[0] == "module" {
			return strings.Trim(f[1], `"`)
		}
	}
	fail("go.mod has no module line")
	return ""
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "oracle-go: "+msg)
	os.Exit(2)
}

func parseAll(dir string, names []string) []*ast.File {
	var out []*ast.File
	for _, n := range names {
		f, err := parser.ParseFile(fset, filepath.Join(dir, n), nil, parser.ParseComments)
		if err != nil {
			typeErrs = append(typeErrs, err.Error())
			continue
		}
		out = append(out, f)
	}
	return out
}

func discover() {
	filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil || !d.IsDir() {
			return nil
		}
		name := d.Name()
		if p != root {
			// The go tool's own rules: vendor/, testdata/, and dot/underscore directories are not
			// packages of this module; a nested go.mod is a different module.
			if name == "vendor" || name == "testdata" || name == "node_modules" ||
				strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
				return filepath.SkipDir
			}
			if _, err := os.Stat(filepath.Join(p, "go.mod")); err == nil {
				skipped = append(skipped, rel(p)+" (nested module)")
				return filepath.SkipDir
			}
		}
		bp, err := build.Default.ImportDir(p, 0)
		if err != nil {
			var noGo *build.NoGoError
			if errors.As(err, &noGo) {
				return nil
			}
			if bp == nil || bp.Name == "" {
				skipped = append(skipped, rel(p)+": "+err.Error())
				return nil
			}
		}
		ip := modPath
		if r := rel(p); r != "." {
			ip = modPath + "/" + filepath.ToSlash(r)
		}
		u := &pkgUnit{path: ip, dir: p, name: bp.Name, bp: bp}
		u.files = parseAll(p, append(append([]string{}, bp.GoFiles...), bp.TestGoFiles...))
		u.xtest = parseAll(p, bp.XTestGoFiles)
		if len(bp.CgoFiles) > 0 {
			skipped = append(skipped, rel(p)+": cgo files not read: "+strings.Join(bp.CgoFiles, ","))
		}
		units[ip] = u
		return nil
	})
}

func rel(p string) string {
	r, err := filepath.Rel(root, p)
	if err != nil {
		return p
	}
	return filepath.ToSlash(r)
}

func origin(o types.Object) types.Object {
	switch x := o.(type) {
	case *types.Func:
		return x.Origin()
	case *types.Var:
		return x.Origin()
	}
	return o
}

func recvName(fd *ast.FuncDecl) string {
	if fd.Recv == nil || len(fd.Recv.List) == 0 {
		return ""
	}
	t := fd.Recv.List[0].Type
	for {
		switch x := t.(type) {
		case *ast.StarExpr:
			t = x.X
			continue
		case *ast.IndexExpr:
			t = x.X
			continue
		case *ast.IndexListExpr:
			t = x.X
			continue
		case *ast.ParenExpr:
			t = x.X
			continue
		case *ast.Ident:
			return x.Name
		}
		return ""
	}
}

var (
	defs       = map[types.Object]*def{}
	recvIdents = map[*ast.Ident]bool{} // receiver type names: part of the method, not a use of the type
)

func collectDefs(u *pkgUnit, files []*ast.File, info *types.Info) {
	for _, f := range files {
		fname := fset.Position(f.Pos()).Filename
		isTest := strings.HasSuffix(fname, "_test.go")
		add := func(id *ast.Ident, kind, recv string, start, end token.Pos, span ast.Node) {
			if id == nil || id.Name == "_" {
				return
			}
			obj := info.Defs[id]
			if obj == nil {
				return
			}
			pos := fset.Position(id.Pos())
			d := &def{
				Key: fmt.Sprintf("%s:%d:%d:%s", rel(fname), pos.Line, pos.Column, id.Name),
				Pkg: u.path, PkgName: u.name, File: rel(fname), Line: pos.Line, Col: pos.Column,
				Name: id.Name, Recv: recv, Kind: kind, Exported: id.IsExported(), Test: isTest,
				obj: obj, start: start, end: end, file: fname,
				SpanLines: [2]int{fset.Position(span.Pos()).Line, fset.Position(span.End()).Line},
			}
			defs[obj] = d
		}
		for _, decl := range f.Decls {
			switch x := decl.(type) {
			case *ast.FuncDecl:
				if x.Recv != nil {
					r := recvName(x)
					// mark the receiver's type identifier so it is not counted as a use of the type
					ast.Inspect(x.Recv, func(n ast.Node) bool {
						if id, ok := n.(*ast.Ident); ok && id.Name == r {
							recvIdents[id] = true
						}
						return true
					})
					add(x.Name, "method", r, x.Pos(), x.End(), x)
				} else {
					add(x.Name, "func", "", x.Pos(), x.End(), x)
				}
			case *ast.GenDecl:
				for _, spec := range x.Specs {
					var span ast.Node = spec
					if !x.Lparen.IsValid() {
						span = x
					}
					switch s := spec.(type) {
					case *ast.TypeSpec:
						add(s.Name, "type", "", s.Pos(), s.End(), span)
					case *ast.ValueSpec:
						kind := "var"
						if x.Tok == token.CONST {
							kind = "const"
						}
						for _, n := range s.Names {
							add(n, kind, "", s.Pos(), s.End(), span)
						}
					}
				}
			}
		}
	}
}

func countUses(info *types.Info) {
	for id, obj := range info.Uses {
		if recvIdents[id] {
			continue
		}
		d := defs[origin(obj)]
		if d == nil {
			continue
		}
		pos := fset.Position(id.Pos())
		if pos.Filename == d.file && id.Pos() >= d.start && id.Pos() < d.end {
			continue // inside its own declaration: recursion, not a caller
		}
		d.Refs++
		if pos.Filename != d.file {
			d.RefsOther++
		}
		if !strings.HasSuffix(pos.Filename, "_test.go") {
			d.RefsNonTst++
		}
		at := fmt.Sprintf("%s:%d", rel(pos.Filename), pos.Line)
		if d.FirstRef == "" || at < d.FirstRef {
			d.FirstRef = at
		}
	}
}

// ---- interface tiers -------------------------------------------------------------------------

type conversion struct {
	src, dst types.Type
	pos      token.Pos
}

var conversions []conversion

func isIface(t types.Type) (*types.Interface, bool) {
	if t == nil {
		return nil, false
	}
	if _, ok := types.Unalias(t).(*types.TypeParam); ok {
		return nil, false
	}
	it, ok := t.Underlying().(*types.Interface)
	return it, ok
}

func record(src, dst types.Type, pos token.Pos) {
	if src == nil || dst == nil {
		return
	}
	if _, ok := isIface(dst); !ok {
		return
	}
	if _, ok := isIface(src); ok {
		return
	}
	if b, ok := src.(*types.Basic); ok && b.Kind() == types.UntypedNil {
		return
	}
	conversions = append(conversions, conversion{src, dst, pos})
}

func tupleOrOne(info *types.Info, exprs []ast.Expr, n int) []types.Type {
	if len(exprs) == n {
		out := make([]types.Type, n)
		for i, e := range exprs {
			out[i] = info.TypeOf(e)
		}
		return out
	}
	if len(exprs) == 1 {
		if tup, ok := info.TypeOf(exprs[0]).(*types.Tuple); ok && tup.Len() == n {
			out := make([]types.Type, n)
			for i := 0; i < n; i++ {
				out[i] = tup.At(i).Type()
			}
			return out
		}
	}
	return nil
}

func walkConversions(files []*ast.File, info *types.Info) {
	for _, f := range files {
		var stack []ast.Node
		ast.Inspect(f, func(n ast.Node) bool {
			if n == nil {
				stack = stack[:len(stack)-1]
				return true
			}
			stack = append(stack, n)
			switch x := n.(type) {
			case *ast.CallExpr:
				ft := info.Types[x.Fun]
				if ft.IsType() && len(x.Args) == 1 { // explicit conversion I(v)
					record(info.TypeOf(x.Args[0]), ft.Type, x.Pos())
					break
				}
				sig, ok := ft.Type.(*types.Signature)
				if !ok && ft.Type != nil {
					sig, _ = ft.Type.Underlying().(*types.Signature)
				}
				if sig == nil {
					break
				}
				params := sig.Params()
				srcs := tupleOrOne(info, x.Args, len(x.Args))
				if len(x.Args) == 1 {
					if tup, ok := info.TypeOf(x.Args[0]).(*types.Tuple); ok {
						srcs = make([]types.Type, tup.Len())
						for i := range srcs {
							srcs[i] = tup.At(i).Type()
						}
					}
				}
				for i, s := range srcs {
					var pt types.Type
					switch {
					case sig.Variadic() && i >= params.Len()-1:
						if x.Ellipsis.IsValid() {
							continue
						}
						if sl, ok := params.At(params.Len() - 1).Type().Underlying().(*types.Slice); ok {
							pt = sl.Elem()
						}
					case i < params.Len():
						pt = params.At(i).Type()
					}
					record(s, pt, x.Pos())
				}
			case *ast.AssignStmt:
				if x.Tok != token.ASSIGN {
					break
				}
				srcs := tupleOrOne(info, x.Rhs, len(x.Lhs))
				for i, l := range x.Lhs {
					if srcs != nil {
						record(srcs[i], info.TypeOf(l), x.Pos())
					}
				}
			case *ast.ValueSpec:
				if x.Type == nil {
					break
				}
				dst := info.TypeOf(x.Type)
				srcs := tupleOrOne(info, x.Values, len(x.Names))
				for _, s := range srcs {
					record(s, dst, x.Pos())
				}
			case *ast.ReturnStmt:
				var res *types.Tuple
				for i := len(stack) - 2; i >= 0; i-- {
					// go/types does not record a FuncDecl's FuncType as an expression, so the signature
					// is read from the function's object (a FuncLit's own type is recorded)
					var t types.Type
					switch fn := stack[i].(type) {
					case *ast.FuncDecl:
						if o := info.Defs[fn.Name]; o != nil {
							t = o.Type()
						}
					case *ast.FuncLit:
						t = info.TypeOf(fn)
					default:
						continue
					}
					if sig, ok := t.(*types.Signature); ok {
						res = sig.Results()
					}
					break
				}
				if res == nil {
					break
				}
				srcs := tupleOrOne(info, x.Results, res.Len())
				for i, s := range srcs {
					record(s, res.At(i).Type(), x.Pos())
				}
			case *ast.CompositeLit:
				t := info.TypeOf(x)
				if t == nil {
					break
				}
				u := t.Underlying()
				if p, ok := u.(*types.Pointer); ok {
					u = p.Elem().Underlying()
				}
				for i, el := range x.Elts {
					kv, isKV := el.(*ast.KeyValueExpr)
					switch ct := u.(type) {
					case *types.Struct:
						if isKV {
							if k, ok := kv.Key.(*ast.Ident); ok {
								for j := 0; j < ct.NumFields(); j++ {
									if ct.Field(j).Name() == k.Name {
										record(info.TypeOf(kv.Value), ct.Field(j).Type(), el.Pos())
									}
								}
							}
						} else if i < ct.NumFields() {
							record(info.TypeOf(el), ct.Field(i).Type(), el.Pos())
						}
					case *types.Slice:
						v := el
						if isKV {
							v = kv.Value
						}
						record(info.TypeOf(v), ct.Elem(), el.Pos())
					case *types.Array:
						v := el
						if isKV {
							v = kv.Value
						}
						record(info.TypeOf(v), ct.Elem(), el.Pos())
					case *types.Map:
						if isKV {
							record(info.TypeOf(kv.Key), ct.Key(), el.Pos())
							record(info.TypeOf(kv.Value), ct.Elem(), el.Pos())
						}
					}
				}
			case *ast.SendStmt:
				if ch, ok := info.TypeOf(x.Chan).Underlying().(*types.Chan); ok {
					record(info.TypeOf(x.Value), ch.Elem(), x.Pos())
				}
			case *ast.TypeAssertExpr:
				if x.Type != nil { // v.(T): T must implement v's interface or the assertion is impossible
					record(info.TypeOf(x.Type), info.TypeOf(x.X), x.Pos())
				}
			case *ast.TypeSwitchStmt:
				var xt types.Type
				switch a := x.Assign.(type) {
				case *ast.AssignStmt:
					if ta, ok := a.Rhs[0].(*ast.TypeAssertExpr); ok {
						xt = info.TypeOf(ta.X)
					}
				case *ast.ExprStmt:
					if ta, ok := a.X.(*ast.TypeAssertExpr); ok {
						xt = info.TypeOf(ta.X)
					}
				}
				for _, c := range x.Body.List {
					for _, e := range c.(*ast.CaseClause).List {
						record(info.TypeOf(e), xt, e.Pos())
					}
				}
			}
			return true
		})
	}
	// A generic type argument must satisfy its constraint: methods the constraint names are required.
	for id, inst := range info.Instances {
		var tps *types.TypeParamList
		switch o := info.Uses[id].(type) {
		case *types.Func:
			if sig, ok := o.Type().(*types.Signature); ok {
				tps = sig.TypeParams()
			}
		case *types.TypeName:
			if n, ok := o.Type().(*types.Named); ok {
				tps = n.TypeParams()
			}
		}
		if tps == nil {
			continue
		}
		for i := 0; i < tps.Len() && i < inst.TypeArgs.Len(); i++ {
			record(inst.TypeArgs.At(i), tps.At(i).Constraint(), id.Pos())
		}
	}
}

func markMethod(m types.Object, tier string, why string) {
	d := defs[origin(m)]
	if d == nil {
		return
	}
	if tier == "static" && d.Static == "" {
		d.Static = why
	}
	if tier == "dynamic" && d.Dynamic == "" {
		d.Dynamic = why
	}
}

func ifaceName(t types.Type) string {
	if n, ok := types.Unalias(t).(*types.Named); ok && n.Obj().Pkg() != nil {
		return n.Obj().Pkg().Name() + "." + n.Obj().Name()
	}
	return types.TypeString(t, func(p *types.Package) string { return p.Name() })
}

func resolveInterfaces() {
	// every named, non-generic interface with methods anywhere in the program — the module and
	// everything it imports, transitively
	byMethod := map[string][]*types.Named{}
	seen := map[*types.Package]bool{}
	var visit func(p *types.Package)
	visit = func(p *types.Package) {
		if p == nil || seen[p] {
			return
		}
		seen[p] = true
		sc := p.Scope()
		for _, n := range sc.Names() {
			tn, ok := sc.Lookup(n).(*types.TypeName)
			if !ok || tn.IsAlias() {
				continue
			}
			named, ok := tn.Type().(*types.Named)
			if !ok || named.TypeParams().Len() > 0 {
				continue
			}
			it, ok := named.Underlying().(*types.Interface)
			if !ok {
				continue
			}
			for i := 0; i < it.NumMethods(); i++ {
				byMethod[it.Method(i).Name()] = append(byMethod[it.Method(i).Name()], named)
			}
		}
		for _, q := range p.Imports() {
			visit(q)
		}
	}
	for _, u := range units {
		visit(u.pkg)
		visit(u.xpkg)
	}
	// `error` lives in the universe scope, not in any package
	if errT, ok := types.Universe.Lookup("error").Type().(*types.Named); ok {
		byMethod["Error"] = append(byMethod["Error"], errT)
	}

	for _, c := range conversions {
		at := fset.Position(c.pos)
		where := fmt.Sprintf("%s:%d", rel(at.Filename), at.Line)
		it, _ := isIface(c.dst)
		// STATIC: the methods the target interface names
		for i := 0; i < it.NumMethods(); i++ {
			im := it.Method(i)
			obj, _, _ := types.LookupFieldOrMethod(c.src, true, im.Pkg(), im.Name())
			if obj != nil {
				markMethod(obj, "static", fmt.Sprintf("%s converted to %s at %s", types.TypeString(c.src, func(p *types.Package) string { return p.Name() }), ifaceName(c.dst), where))
			}
		}
		// DYNAMIC: any other method of the value that satisfies some named interface it implements
		ms := types.NewMethodSet(c.src)
		for i := 0; i < ms.Len(); i++ {
			m := ms.At(i).Obj()
			if defs[origin(m)] == nil || defs[origin(m)].Dynamic != "" {
				continue
			}
			for _, cand := range byMethod[m.Name()] {
				ci := cand.Underlying().(*types.Interface)
				if types.Implements(c.src, ci) {
					markMethod(m, "dynamic", fmt.Sprintf("%s flows into %s at %s and implements %s", types.TypeString(c.src, func(p *types.Package) string { return p.Name() }), ifaceName(c.dst), where, ifaceName(cand)))
					break
				}
			}
		}
	}
}

func main() {
	flag.StringVar(&root, "root", ".", "module root")
	// -goos rather than the GOOS environment variable: `GOOS=windows go run .` would build THIS
	// program for windows and then fail to execute it
	goos := flag.String("goos", "", "target GOOS whose build-constrained files are read (default: host)")
	flag.Parse()
	if *goos != "" {
		build.Default.GOOS = *goos
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		fail(err.Error())
	}
	root = abs
	modPath = readModulePath()
	// cgo needs a C compiler to type-check; with it off, the go tool's own pure-Go fallbacks are read
	build.Default.CgoEnabled = false
	build.Default.Dir = root
	srcImport = importer.ForCompiler(fset, "source", nil).(types.ImporterFrom)

	discover()
	paths := make([]string, 0, len(units))
	for p := range units {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	for _, p := range paths {
		check(units[p])
	}
	for _, p := range paths {
		u := units[p]
		if len(u.xtest) > 0 {
			u.xinfo = newInfo()
			u.xpkg, _ = conf().Check(u.path+"_test", fset, u.xtest, u.xinfo)
		}
	}
	for _, p := range paths {
		u := units[p]
		collectDefs(u, u.files, u.info)
		if u.xinfo != nil {
			collectDefs(u, u.xtest, u.xinfo)
		}
	}
	for _, p := range paths {
		u := units[p]
		countUses(u.info)
		walkConversions(u.files, u.info)
		if u.xinfo != nil {
			countUses(u.xinfo)
			walkConversions(u.xtest, u.xinfo)
		}
	}
	resolveInterfaces()

	out := struct {
		GOOS     string   `json:"goos"`
		Module   string   `json:"module"`
		Packages int      `json:"packages"`
		Defs     []*def   `json:"defs"`
		Errors   []string `json:"typeErrors"`
		Skipped  []string `json:"skipped"`
	}{GOOS: build.Default.GOOS, Module: modPath, Packages: len(units), Errors: typeErrs, Skipped: skipped}
	for _, d := range defs {
		out.Defs = append(out.Defs, d)
	}
	sort.Slice(out.Defs, func(i, j int) bool { return out.Defs[i].Key < out.Defs[j].Key })
	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(out); err != nil {
		fail(err.Error())
	}
}
