/**
 * Conducks — Java Import Resolver 🏺 🟦
 *
 * Maps a Java import to the file that declares what it names. The import query hands over the dotted
 * name only — `import static` and a trailing `.*` are not part of it — so one name can be:
 *
 *   com.acme.util.Strings          a class                 → …/com/acme/util/Strings.java
 *   com.acme.util.Maths.square     a member (static import) → …/com/acme/util/Maths.java
 *   com.acme.Outer.Inner           a nested class          → …/com/acme/Outer.java
 *   com.acme.model                 a package (wildcard)    → a file of …/com/acme/model/
 *
 * So the whole name is tried as a class first, then with trailing segments dropped (a member, a
 * nested type), and last as a package directory. MEASURED before (Java oracle, 2026-11-12): the
 * static and the wildcard import both went unresolved and were written as external boundaries, so
 * `square(3)` and `new Point(…)` bound to nothing and `Maths` was reported dead.
 *
 * The package path must be the file's whole trailing directory chain, not segments found anywhere in
 * order — `com.acme.util.Maths` must not pick `…/org/acme/util/Maths.java`. A package of the file's
 * own project wins over a same-named one elsewhere in the tree.
 */
export class JavaResolver {
  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    const name = rawPath.replace(/^import\s+/, '').replace(/^static\s+/, '').replace(/;/g, '').replace(/\.\*$/, '').trim();
    const segments = name.split('.').filter(Boolean);
    if (segments.length === 0) return undefined;
    const java = allFiles.filter(p => p.toLowerCase().endsWith('.java')).map(p => ({ p, n: p.replace(/\\/g, '/') }));
    const prefer = (hits: typeof java): string | undefined => {
      if (hits.length <= 1) return hits[0]?.p;
      const own = projectPrefix(currentFile);
      return (hits.find(h => projectPrefix(h.n) === own) ?? hits[0]).p;
    };

    // A class, or a member / nested type of one: the longest prefix that names a file wins.
    for (let k = segments.length; k >= 1; k--) {
      const suffix = `/${segments.slice(0, k).join('/')}.java`;
      const hits = java.filter(f => f.n.endsWith(suffix));
      if (hits.length) return prefer(hits);
    }
    // A package (wildcard import): a file directly inside that directory.
    const dir = `/${segments.join('/')}/`;
    return prefer(java.filter(f => {
      const i = f.n.lastIndexOf('/');
      return f.n.slice(0, i + 1).endsWith(dir);
    }));
  }
}

/** The part of a path before its Java source root (`…/src/main/java/`), which names the project. */
function projectPrefix(file: string): string {
  const n = file.replace(/\\/g, '/');
  const m = /^(.*?\/)src\/[^/]+\/java\//.exec(n);
  return m ? m[1] : n.slice(0, n.lastIndexOf('/') + 1);
}
