import { describe, it, expect } from '@jest/globals';
import { PythonExtractor } from '@/lib/core/parsing/languages/python/extractor.js';

describe('PythonExtractor Unit Tests', () => {
  const extractor = new PythonExtractor();

  const mockNode = (type: string, children: any[] = [], text = ''): any => ({
    type,
    text,
    childCount: children.length,
    child: (i: number) => children[i]
  });

  describe('getVisibility', () => {
    it('returns private for dunder-like private names', () => {
      expect(extractor.getVisibility('__secret')).toBe('private');
    });

    it('returns protected for underscore-prefixed names and magic methods', () => {
      expect(extractor.getVisibility('_internal')).toBe('protected');
      expect(extractor.getVisibility('__init__')).toBe('protected');
    });

    it('returns public for regular names', () => {
      expect(extractor.getVisibility('value')).toBe('public');
    });
  });

  describe('extractFields', () => {
    it('extracts identifier fields from assignment nodes', () => {
      const node = {
        type: 'assignment',
        childForFieldName: (name: string) => (name === 'left' ? { type: 'identifier', text: '__field' } : null)
      };

      expect(extractor.extractFields(node)).toEqual([
        { name: '__field', visibility: 'private' }
      ]);
    });

    it('returns no fields for non-assignment or non-identifier left side', () => {
      const nonAssignment = { type: 'class_definition', childForFieldName: () => null };
      const nonIdentifier = {
        type: 'assignment',
        childForFieldName: () => ({ type: 'attribute', text: 'self.x' })
      };

      expect(extractor.extractFields(nonAssignment)).toEqual([]);
      expect(extractor.extractFields(nonIdentifier)).toEqual([]);
    });
  });

  describe('calculateComplexity', () => {
    it('counts branch nodes recursively with a base complexity of 1', () => {
      const tree = mockNode('module', [
        mockNode('if_statement'),
        mockNode('while_statement', [
          mockNode('identifier'),
          mockNode('conditional_expression')
        ]),
        mockNode('assignment')
      ]);

      expect(extractor.calculateComplexity(tree)).toBe(4);
    });
  });

  describe('extractDebt', () => {
    it('extracts known debt markers from text', () => {
      const node = { text: '# TODO: clean\n# HACK: temp\n# XXX' };
      expect(extractor.extractDebt(node)).toEqual(['TODO', 'HACK', 'XXX']);
    });

    it('returns empty list when no markers are present', () => {
      expect(extractor.extractDebt({ text: 'normal comments only' })).toEqual([]);
    });
  });
});
