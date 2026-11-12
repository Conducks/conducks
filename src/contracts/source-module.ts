/**
 * Conducks — which files form ONE MODULE by location. 🏺
 *
 * In most languages a file is the unit of import. In two it is not:
 *
 *   - Go: a package IS a directory. Every .go file in it sees the others with no import, and
 *     `import "example.com/m/internal/store"` names all of them.
 *   - Swift: a module is an SPM target, every .swift file under `Sources/<Target>/` (or
 *     `Tests/<Target>/`), subfolders included; outside that layout, the directory.
 *
 * The linker needs this to make a module's files visible to each other and to an importer; the
 * dead-code analyzer needs it to know that importing one file of a module reaches every file of it.
 * Two copies would drift, which is why it lives here, beside `test-path`.
 *
 * Returns null for every other language: there the file is the module.
 */
export function moduleKeyOf(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const file = String(filePath).toLowerCase();
  if (file.endsWith('.go')) return `go:${file.slice(0, file.lastIndexOf('/'))}`;
  if (file.endsWith('.swift')) {
    const target = /^(.*\/(?:sources|tests)\/[^/]+)\//.exec(file);
    return `swift:${target ? target[1] : file.slice(0, file.lastIndexOf('/'))}`;
  }
  if (file.endsWith('.java')) {
    // A Java PACKAGE is the module: its classes see each other with no import. Keyed on the project
    // and the package path below the source root, so `src/main/java/com/acme` and `src/test/java/com/
    // acme` are one package (Maven's convention), and the same package name in another project is not.
    const dir = file.slice(0, file.lastIndexOf('/'));
    const root = /^(.*?\/)src\/[^/]+\/java\/(.*)$/.exec(dir + '/');
    return root ? `java:${root[1]}|${root[2].replace(/\/$/, '')}` : `java:${dir}`;
  }
  return null;
}
