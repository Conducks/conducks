/**
 * Conducks — Boundary Origin Classifier (System 2, ADR 0012) 🏺
 *
 * Every reference that leaves the repo lands on a BOUNDARY: an import/call whose target is not an
 * in-graph node. System 2's premise is that "edge classification, not node count, tells architecture
 * health" — so a boundary reference is only useful once we know its ORIGIN:
 *
 *   - internal    — resolves inside the repo (relative/aliased path). Not a boundary at all.
 *   - stdlib      — the language/runtime standard library (Node core, `node:` prefix). Trusted,
 *                   unversioned, not a supply-chain surface.
 *   - dependency  — a third-party package (npm/pip/…). Versioned, IS the supply-chain surface.
 *
 * This module is a pure function over the raw specifier string — no graph, no IO — so it is trivially
 * testable and reusable by any pass that wants to tag an edge or a boundary node.
 */

export type BoundaryOrigin = 'internal' | 'stdlib' | 'dependency';

/** Whether a specifier is this project\'s, the standard library\'s, or a dependency\'s — plus which package. */
export interface BoundaryClassification {
  origin: BoundaryOrigin;
  /** For a dependency, the package name (`@scope/name` or `name`); null otherwise. */
  package: string | null;
}

// Node.js core modules (the ones a repo actually imports). `node:`-prefixed forms are stdlib by rule.
const NODE_STDLIB = new Set<string>([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto',
  'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty',
  'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

/**
 * Classify a raw import/require specifier by origin.
 *
 * @param specifier  the raw module string, e.g. `path`, `node:fs`, `@scope/pkg/sub`, `./util`, `@/lib/x`
 * @param internalAliases  alias prefixes the repo maps to itself (e.g. `@/`, `~/`). Treated as internal.
 */
/**
 * Python's standard library — the modules a `.py` file imports without declaring anything.
 *
 * Without this every one of them read as a third-party DEPENDENCY. MEASURED on the scraper subject:
 * `logging` (80 importers), `typing` (79), `asyncio` (50), `pathlib` (48), `json` (45) and a dozen
 * more were listed under "Dependencies by blast radius" and annotated as undeclared — inflating a
 * 5-dependency project to a claimed 91 and making the command unusable for the question it exists to
 * answer. The `stdlib` bucket it should have filled held 2 entries.
 */
const PYTHON_STDLIB = new Set<string>([
  'abc', 'argparse', 'array', 'ast', 'asyncio', 'base64', 'binascii', 'bisect', 'builtins', 'bz2',
  'calendar', 'cmath', 'collections', 'colorsys', 'concurrent', 'configparser', 'contextlib', 'copy',
  'csv', 'ctypes', 'dataclasses', 'datetime', 'decimal', 'difflib', 'dis', 'email', 'enum', 'errno',
  'faulthandler', 'filecmp', 'fileinput', 'fnmatch', 'fractions', 'ftplib', 'functools', 'gc',
  'getpass', 'gettext', 'glob', 'graphlib', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http',
  'imaplib', 'importlib', 'inspect', 'io', 'ipaddress', 'itertools', 'json', 'keyword', 'linecache',
  'locale', 'logging', 'lzma', 'mailbox', 'math', 'mimetypes', 'mmap', 'multiprocessing', 'netrc',
  'numbers', 'operator', 'os', 'pathlib', 'pickle', 'pkgutil', 'platform', 'plistlib', 'pprint',
  'profile', 'pstats', 'pty', 'queue', 'quopri', 'random', 're', 'readline', 'reprlib', 'resource',
  'sched', 'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil', 'signal', 'site', 'smtplib',
  'socket', 'socketserver', 'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct',
  'subprocess', 'symtable', 'sys', 'sysconfig', 'tarfile', 'tempfile', 'termios', 'textwrap',
  'threading', 'time', 'timeit', 'token', 'tokenize', 'tomllib', 'trace', 'traceback', 'tracemalloc',
  'tty', 'types', 'typing', 'unicodedata', 'unittest', 'urllib', 'uuid', 'venv', 'warnings', 'wave',
  'weakref', 'webbrowser', 'wsgiref', 'xml', 'xmlrpc', 'zipfile', 'zipimport', 'zlib', 'zoneinfo',
  '__future__',
]);

/** File extensions whose imports are read against Python's vocabulary rather than Node's. */
function isPythonFile(filePath?: string): boolean {
  return /\.pyi?$/i.test(String(filePath ?? ''));
}

export function classifyOrigin(
  specifier: string,
  internalAliases: string[] = ['@/', '~/'],
  workspacePackages?: ReadonlySet<string>,
  opts?: {
    /** The file the import is written in — decides which standard library applies. */
    filePath?: string;
    /**
     * True when this specifier resolves to a file inside the repository.
     *
     * Python's absolute-import style (`from foundation.base_interfaces import X`) is a BARE
     * specifier that names first-party code, and no amount of string inspection can tell it from a
     * package name. The importer already resolves it against the discovered file list; passing the
     * answer in is a READ of that, not a second guess. MEASURED on the scraper subject:
     * `foundation.base_interfaces` (15 importers), `core.mapper.mapper_runner`,
     * `core.browser.adaptive_manager` and others were reported as third-party dependencies of the
     * project that declares them.
     */
    resolvesInRepo?: boolean;
  },
): BoundaryClassification {
  const spec = (specifier || '').trim().replace(/^['"]|['"]$/g, '');

  // Relative or absolute path, or a repo alias → internal (not a boundary).
  if (spec.startsWith('.') || spec.startsWith('/') || internalAliases.some(a => spec.startsWith(a))) {
    return { origin: 'internal', package: null };
  }

  // A WORKSPACE package is a bare specifier with source in this tree — `@repo/adapters` resolving
  // to `packages/adapters`. It is not a supply-chain surface and must not be tagged as one, or the
  // dependency report counts a project's own modules as third-party risk (ADR 0108).
  if (workspacePackages?.size) {
    const seg = spec.split('/');
    const name = (spec.startsWith('@') && seg.length >= 2 ? `${seg[0]}/${seg[1]}` : seg[0]).toLowerCase();
    if (workspacePackages.has(name)) return { origin: 'internal', package: null };
  }

  // RESOLVED INSIDE THE REPO — the strongest evidence available, and the only thing that separates
  // Python's first-party absolute imports from package names.
  if (opts?.resolvesInRepo) return { origin: 'internal', package: null };

  // `node:`-prefixed, or a bare Node core module → stdlib.
  if (spec.startsWith('node:')) return { origin: 'stdlib', package: null };
  const head = spec.split('/')[0];

  if (isPythonFile(opts?.filePath)) {
    // Python dots the package path: `urllib.parse` and `os.path` are the stdlib's own submodules.
    const pyHead = spec.split('.')[0];
    if (PYTHON_STDLIB.has(pyHead)) return { origin: 'stdlib', package: null };
    return { origin: 'dependency', package: pyHead || spec };
  }

  if (NODE_STDLIB.has(head)) return { origin: 'stdlib', package: null };

  // Everything else is a third-party dependency. Package = `@scope/name` or the first path segment.
  const pkg = spec.startsWith('@')
    ? spec.split('/').slice(0, 2).join('/')
    : head;
  return { origin: 'dependency', package: pkg || spec };
}
