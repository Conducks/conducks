/**
 * Conducks — Global Built-ins Atmosphere
 * 
 * Defines the standard set of ambient symbols for various languages.
 * This ensures that common symbols (e.g. Node's 'process', Python's 'os')
 * are correctly anchored to a GLOBAL namespace instead of being reported as orphans.
 */

export const GLOBAL_ATMOSPHERE: Record<string, string[]> = {
  typescript: [
    'process', 'console', 'require', 'module', 'exports', '__filename', '__dirname',
    'import', 'export', 'Set', 'Map', 'Promise', 'Error', 'JSON', 'Math', 'Date',
    'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp', 'Function',
    'global', 'globalThis', 'window', 'document', 'navigator', 'location', 'fetch',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'
  ],
  javascript: [
    'process', 'console', 'require', 'module', 'exports', '__filename', '__dirname',
    'import', 'export', 'Set', 'Map', 'Promise', 'Error', 'JSON', 'Math', 'Date',
    'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp', 'Function',
    'global', 'globalThis', 'window', 'document', 'navigator', 'location', 'fetch',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'
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
