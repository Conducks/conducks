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
  return null;
}
