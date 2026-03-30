import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PythonProvider } from '@/lib/core/parsing/languages/python/index.js';
import { PythonResolver } from '@/lib/core/parsing/languages/python/resolver.js';
import { PythonBindings } from '@/lib/core/parsing/languages/python/bindings.js';

describe('Python Language Suite Unit Tests 💎 🐍', () => {
  describe('PythonResolver (PEP 328 & 451)', () => {
    let resolver: PythonResolver;
    const allFiles = [
      '/root/src/main.py',
      '/root/src/utils/helper.py',
      '/root/src/utils/__init__.py',
      '/root/src/models/user.py',
      '/root/external/lib.py'
    ];

    beforeEach(() => {
      resolver = new PythonResolver();
    });

    it('should resolve absolute imports (import utils.helper)', () => {
      const resolved = resolver.resolve('utils.helper', '/root/src/main.py', allFiles);
      expect(resolved).toBe('/root/src/utils/helper.py');
    });

    it('should prioritize __init__.py for package imports (PEP 451)', () => {
      const resolved = resolver.resolve('utils', '/root/src/main.py', allFiles);
      expect(resolved).toBe('/root/src/utils/__init__.py');
    });

    it('should resolve relative imports (from . import helper)', () => {
      const resolved = resolver.resolve('.helper', '/root/src/utils/__init__.py', allFiles);
      expect(resolved).toBe('/root/src/utils/helper.py');
    });

    it('should resolve parent relative imports (from ..models import user)', () => {
      const resolved = resolver.resolve('..models.user', '/root/src/utils/helper.py', allFiles);
      expect(resolved).toBe('/root/src/models/user.py');
    });

    it('should return undefined for non-existent imports', () => {
      const resolved = resolver.resolve('ghost.module', '/root/src/main.py', allFiles);
      expect(resolved).toBeUndefined();
    });
  });

  describe('PythonBindings', () => {
    let bindings: PythonBindings;

    beforeEach(() => {
      bindings = new PythonBindings();
    });

    it('should extract aliased imports (import numpy as np)', () => {
      // Mocked tree-sitter node
      const mockNode = {
        type: 'import_statement',
        namedChildCount: 1,
        namedChild: () => ({
          type: 'aliased_import',
          childForFieldName: (name: string) => ({
            text: name === 'name' ? 'numpy' : 'np'
          })
        })
      };

      const result = bindings.extract(mockNode as any);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ local: 'np', exported: 'numpy', isModuleAlias: true });
    });

    it('should extract named bindings from imports (from x import A, B as C)', () => {
      const mockNode = {
        type: 'import_from_statement',
        namedChildCount: 3,
        childForFieldName: () => ({ id: 999 }), // module_name
        namedChild: (i: number) => {
          if (i === 0) return { id: 999, type: 'dotted_name', text: 'x' };
          if (i === 1) return { id: 100, type: 'identifier', text: 'A' };
          if (i === 2) return {
            id: 200,
            type: 'aliased_import',
            childForFieldName: (name: string) => ({
              text: name === 'name' ? 'B' : 'C'
            })
          };
          return null;
        }
      };

      const result = bindings.extract(mockNode as any);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ local: 'A', exported: 'A' });
      expect(result[1]).toEqual({ local: 'C', exported: 'B' });
    });
  });

  describe('PythonProvider Integration', () => {
    let provider: PythonProvider;

    beforeEach(() => {
      provider = new PythonProvider();
    });

    it('should identify as python provider', () => {
      expect(provider.langId).toBe('python');
      expect(provider.extensions).toContain('.py');
    });

    it('should use namespace import semantics', () => {
      expect(provider.importSemantics).toBe('namespace');
    });
  });
});
