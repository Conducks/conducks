import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { GrammarRegistry } from '@/lib/core/parsing/grammar-registry.js';

/**
 * `loadLanguage` checked "loaded or unavailable" and only set "loaded" after an `await import(...)`,
 * so two callers asking for the same grammar at once both passed the check and both induced it —
 * attaching node-type info twice (state-machine audit round 2, Q-03-4). The in-flight load is now
 * shared.
 */
afterEach(() => { jest.restoreAllMocks(); });

describe('loadLanguage is single-flight', () => {
  it('two concurrent loads of one grammar induce it once', async () => {
    const registry: any = GrammarRegistry.getInstance();
    // A grammar this file is the first to ask for, so neither call finds it already loaded.
    registry.languages.delete('ruby');
    registry.unavailableLanguages.delete('ruby');
    const attach = jest.spyOn(registry, 'attachNodeTypeInfo');
    await Promise.all([registry.loadLanguage('ruby'), registry.loadLanguage('ruby')]);
    expect(registry.getLanguage('ruby')).toBeDefined();
    expect(attach).toHaveBeenCalledTimes(1);
  });
});
