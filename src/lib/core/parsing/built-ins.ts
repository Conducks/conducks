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
