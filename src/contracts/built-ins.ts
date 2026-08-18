/**
 * Conducks — Global Built-ins Atmosphere
 * 
 * Defines the standard set of ambient symbols for various languages.
 * This ensures that common symbols (e.g. Node's 'process', Python's 'os')
 * are correctly anchored to a GLOBAL namespace instead of being reported as orphans.
 */

const GLOBAL_ATMOSPHERE: Record<string, string[]> = {
  typescript: [
    'process', 'console', 'require', 'module', 'exports', '__filename', '__dirname',
    'import', 'export', 'Set', 'Map', 'Promise', 'Error', 'JSON', 'Math', 'Date',
    'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp', 'Function',
    'global', 'globalThis', 'window', 'document', 'navigator', 'location', 'fetch',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    'encodeURI', 'decodeURI', 'structuredClone', 'queueMicrotask', 'AbortController', 'URL',
    'URLSearchParams', 'TextEncoder', 'TextDecoder', 'Buffer', 'WeakMap', 'WeakSet', 'Symbol',
    'BigInt', 'Proxy', 'Reflect', 'Intl', 'crypto', 'performance', 'atob', 'btoa',
    'setImmediate', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'File', 'FileReader',
    'EventSource', 'WebSocket', 'localStorage', 'sessionStorage', 'alert', 'confirm',
    // TypeScript's own utility and lib types. They are declared by the compiler, not by any project,
    // so a reference to one is a reference OUT of the codebase — the same status `Date` has. Left
    // out, they were the single largest dangling group on this repository: `Record` alone appeared
    // 75 times (ADR 0097).
    'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract',
    'NonNullable', 'ReturnType', 'Parameters', 'ConstructorParameters', 'InstanceType',
    'Awaited', 'ThisType', 'Uppercase', 'Lowercase', 'Capitalize', 'Uncapitalize',
    'ReadonlyArray', 'ReadonlySet', 'ReadonlyMap', 'Iterable', 'IterableIterator', 'Iterator',
    'AsyncIterable', 'AsyncIterableIterator', 'Generator', 'AsyncGenerator', 'PromiseLike',
    'ArrayLike', 'Uint8Array', 'Int32Array', 'Float64Array', 'ArrayBuffer', 'DataView',
    'RegExpExecArray', 'RegExpMatchArray', 'BufferEncoding', 'NodeJS', 'Console', 'Timer',
  ],
  javascript: [
    'process', 'console', 'require', 'module', 'exports', '__filename', '__dirname',
    'import', 'export', 'Set', 'Map', 'Promise', 'Error', 'JSON', 'Math', 'Date',
    'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp', 'Function',
    'global', 'globalThis', 'window', 'document', 'navigator', 'location', 'fetch',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    'encodeURI', 'decodeURI', 'structuredClone', 'queueMicrotask', 'AbortController', 'URL',
    'URLSearchParams', 'TextEncoder', 'TextDecoder', 'Buffer', 'WeakMap', 'WeakSet', 'Symbol',
    'BigInt', 'Proxy', 'Reflect', 'Intl', 'crypto', 'performance', 'atob', 'btoa',
    'setImmediate', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'File', 'FileReader',
    'EventSource', 'WebSocket', 'localStorage', 'sessionStorage', 'alert', 'confirm',
  ],
  python: [
    'os', 'sys', 'path', 're', 'json', 'datetime', 'time', 'math', 'random',
    'print', 'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'all', 'any',
    'sum', 'min', 'max', 'abs', 'round', 'pow', 'int', 'float', 'str', 'list',
    'dict', 'set', 'tuple', 'bool', 'type', 'object', 'None', 'True', 'False',
    'self', 'cls', 'super', 'import', 'from', 'as', 'def', 'class', 'lambda'
  ],
  go: [
    'fmt', 'os', 'io', 'net', 'http', 'sync', 'errors', 'time', 'context', 'bytes', 'json', 'math', 'sort', 'strings', 'strconv', 'reflect', 'runtime', 'testing'
  ],
  rust: [
    'std', 'core', 'alloc', 'panic', 'println', 'print', 'vec', 'string', 'option', 'result', 'box', 'rc', 'arc', 'mutex', 'rwlock', 'thread', 'clone', 'copy', 'debug', 'default', 'hash', 'ord', 'partialord', 'eq', 'partialeq'
  ],
  cpp: [
    'std', 'printf', 'malloc', 'free', 'cout', 'cin', 'vector', 'string', 'map', 'set', 'list', 'deque', 'stack', 'queue', 'algorithm', 'iostream', 'fstream', 'ostream', 'istream', 'memory', 'shared_ptr', 'unique_ptr', 'weak_ptr', 'exception'
  ],
  c: [
    'printf', 'malloc', 'free', 'scanf', 'fopen', 'fclose', 'fread', 'fwrite', 'strlen', 'strcpy', 'strcat', 'strcmp', 'memcpy', 'memset', 'exit', 'NULL', 'size_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t'
  ],
  csharp: [
    'System', 'Microsoft', 'Console', 'String', 'Int32', 'Task', 'IEnumerable', 'List', 'Dictionary', 'Linq', 'Object', 'Boolean', 'DateTime', 'Guid', 'Exception', 'Attribute', 'Type', 'Method'
  ],
  java: [
    'java', 'javax', 'System', 'String', 'ArrayList', 'HashMap', 'Integer', 'Exception', 'RuntimeException', 'Error', 'Thread', 'Runnable', 'Object', 'Class', 'Interface', 'Annotation', 'Collections', 'Arrays', 'Math', 'Boolean'
  ],
  php: [
    'PHP_VERSION', 'PDO', 'DateTime', 'Exception', 'ArrayIterator', 'strlen', 'count', 'isset', 'empty', 'unset', 'die', 'exit', 'echo', 'print', 'var_dump', 'json_encode', 'json_decode', 'array_merge', 'array_filter', 'array_map'
  ],
  ruby: [
    'Kernel', 'Enumerable', 'Object', 'Module', 'String', 'Array', 'Hash', 'puts', 'p', 'print', 'require', 'require_relative', 'include', 'extend', 'prepend', 'attr_accessor', 'attr_reader', 'attr_writer', 'raise', 'begin', 'rescue', 'ensure'
  ],
  swift: [
    'Swift', 'Foundation', 'UIKit', 'AppKit', 'Combine', 'SwiftUI', 'print', 'guard', 'defer', 'fatalError', 'precondition', 'assert', 'map', 'filter', 'compactMap', 'flatMap', 'Result', 'Option', 'Any', 'AnyObject'
  ]
};

/**
 * Returns whether a symbol is a known built-in for the given language.
 */
export function isBuiltIn(symbol: string, langId: string): boolean {
  const globals = GLOBAL_ATMOSPHERE[langId] || [];
  const root = symbol.split('.')[0].toLowerCase();
  return globals.some(g => g.toLowerCase() === root);
}

/**
 * Returns the canonical Global ID for a built-in symbol.
 */
export function getGlobalId(symbol: string): string {
  const root = symbol.split('.')[0].toLowerCase();
  return `GLOBAL::${root}`;
}

/**
 * Methods every JavaScript value already has — the ones a call on a LOCAL value resolves to and no
 * project ever declares. `line.trim()`, `args.includes()`, `results.filter()`.
 *
 * This is the list the guess sweep is supposed to be about (ADR 0096). It used to delete by
 * CONFIDENCE instead, which meant a real project method that failed to resolve — `graph.getAllNodes`,
 * three call sites, node present — was deleted alongside `arr.map`, because low confidence means
 * "the processor did not resolve this", not "this is a built-in".
 *
 * Deliberately CONSERVATIVE. A name that a project might plausibly declare as its own method is left
 * out, so an edge survives as a visible dangler rather than being deleted on a guess. `get`, `set`,
 * `has`, `add`, `delete` and `find` are all absent for exactly that reason — they are Map/Set methods
 * AND extremely common repository and service method names.
 */
const UNIVERSAL_MEMBERS: ReadonlySet<string> = new Set([
  // Array
  'map', 'filter', 'foreach', 'reduce', 'reduceright', 'slice', 'splice', 'push', 'pop', 'shift',
  'unshift', 'concat', 'join', 'reverse', 'flat', 'flatmap', 'fill', 'indexof', 'lastindexof',
  'includes', 'some', 'every', 'sort', 'at',
  // String
  'trim', 'trimstart', 'trimend', 'tolowercase', 'touppercase', 'split', 'replace', 'replaceall',
  'padstart', 'padend', 'startswith', 'endswith', 'substring', 'substr', 'charat', 'charcodeat',
  'repeat', 'normalize', 'localecompare', 'match', 'matchall', 'search',
  // Object / any
  'tostring', 'tofixed', 'toprecision', 'valueof', 'hasownproperty', 'tojson', 'tolocaledatestring',
  'tolocaletimestring', 'toisostring', 'gettime',
  // Promise
  'then', 'catch', 'finally',
  // Function
  'bind', 'call', 'apply',
  // Iteration protocol
  'keys', 'values', 'entries', 'next',
]);

/**
 * The same idea for PYTHON, and it needs its own list because the JavaScript one is WRONG here.
 *
 * `apply` is a Function.prototype method in JavaScript and an ordinary module-level function name in
 * Python — `stealth/consistency.py` declares one and `engine.py` calls it four times. Sweeping the
 * JS list over a `.py` call site deleted those four call edges, and `prune` then reported all four
 * `apply` functions as ORPHAN: a delete verdict on the live anti-detection layer of a scraper.
 * MEASURED on the scraper subject — 4 of its 23 orphan findings came from this one name.
 *
 * Same conservatism as above, applied to what Python projects actually declare: `get`, `add`,
 * `update`, `remove`, `clear`, `copy`, `index`, `count`, `sort`, `read`, `write`, `close`, `run`
 * and `apply` are all absent, because a project method of that name is ordinary.
 */
const PYTHON_UNIVERSAL_MEMBERS: ReadonlySet<string> = new Set([
  // str
  'strip', 'lstrip', 'rstrip', 'lower', 'upper', 'title', 'capitalize', 'casefold',
  'startswith', 'endswith', 'splitlines', 'isdigit', 'isalpha', 'isalnum', 'isspace',
  'zfill', 'ljust', 'rjust', 'encode', 'decode',
  // list / set
  'append', 'extend', 'popitem', 'setdefault',
  // dict
  'items', 'keys', 'values',
]);

/** Language family that decides which universal-member list applies to a call site. */
function memberDialect(filePath?: string): 'python' | 'ecmascript' {
  return /\.pyi?$/i.test(String(filePath ?? '')) ? 'python' : 'ecmascript';
}

/**
 * True when a dotted target is a universal member on a receiver this project does not declare.
 *
 * `filePath` is the file the CALL was written in, not the file of the thing being called — the
 * question is which language's built-in vocabulary the expression belongs to. Omitting it keeps the
 * historical ECMAScript behaviour, which is what every non-Python caller wants.
 */
export function isUniversalMemberCall(symbol: string, filePath?: string): boolean {
  const dot = symbol.lastIndexOf('.');
  if (dot < 1) return false;
  const member = symbol.slice(dot + 1).toLowerCase();
  return memberDialect(filePath) === 'python'
    ? PYTHON_UNIVERSAL_MEMBERS.has(member)
    : UNIVERSAL_MEMBERS.has(member);
}

/**
 * The confidence an edge carries when nothing resolved it.
 *
 * `CallProcessor` stamps it at capture time for a target it could not place, and
 * `sweepUnresolvedGuesses` re-stamps it after linking onto any edge that still dangles — because
 * whether a reference resolved is only knowable once the whole graph exists, and an edge pointing
 * at an id no node has did not resolve, whatever the processor believed (ADR 0104).
 *
 * It sits below the 0.6 line every "is this trustworthy" query uses, which is the whole point: a
 * single number that means "do not rely on this target".
 */
export const UNRESOLVED_CONFIDENCE = 0.4;
