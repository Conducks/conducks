import { describe, it, expect } from '@jest/globals';
import { cleanDocText, firstLineOf, docFor, attachDocs } from '@/lib/core/parsing/doc-comments.js';

/**
 * ADR 0133 / todo40#P2 — the join that turns a captured comment into a symbol's documentation.
 *
 * The join is BY LINE rather than by tree navigation, because the two conventions sit on opposite
 * sides of the declaration: JSDoc/Go/Rust/Java above it, Python's docstring inside the body. A row
 * comparison covers both without asking each grammar for a different parent walk.
 *
 * Measured before building (todo40#P1): 1,037 JSDoc blocks and 256 KB of prose across `src/`, which
 * is 0.7% of a 34 MB vault — so the storage cost is not the question. Attaching the WRONG paragraph
 * is, which is what the claiming and gap rules below exist to prevent.
 */
describe('doc comment harvest', () => {
  describe('cleanDocText', () => {
    it('strips a JSDoc block back to prose', () => {
      expect(cleanDocText('/**\n * Trims a user-supplied name.\n * Second line.\n */'))
        .toBe('Trims a user-supplied name.\nSecond line.');
    });

    it('strips a python docstring', () => {
      expect(cleanDocText('"""Trims a name."""')).toBe('Trims a name.');
    });

    it('strips a run of line comments', () => {
      expect(cleanDocText('// Trims a name.\n// Really.')).toBe('Trims a name.\nReally.');
    });

    it('strips a hash comment', () => {
      expect(cleanDocText('# Trims a name.')).toBe('Trims a name.');
    });
  });

  describe('firstLineOf', () => {
    it('joins a wrapped opening sentence rather than cutting it', () => {
      // Cutting at the first newline would end mid-clause, which reads as a truncation bug rather
      // than a summary.
      expect(firstLineOf('Trims a user-supplied\nname before storing it.\n\nMore detail here.'))
        .toBe('Trims a user-supplied name before storing it.');
    });

    it('stops at the first blank line', () => {
      expect(firstLineOf('Summary.\n\nBody that should not appear.')).toBe('Summary.');
    });
  });

  describe('docFor', () => {
    const jsdoc = { startLine: 1, endLine: 3, text: '/** Above. */' };

    it('takes the comment directly above a declaration', () => {
      expect(docFor({ lineStart: 4 }, [jsdoc])).toBe(jsdoc);
    });

    it('allows one blank line between comment and declaration', () => {
      expect(docFor({ lineStart: 5 }, [jsdoc])).toBe(jsdoc);
    });

    /**
     * Three lines of distance is a section banner or the previous symbol's trailing note. Attaching
     * a paragraph to the wrong function is worse than attaching none — the reader cannot tell it
     * apart from a correct one.
     */
    it('refuses a comment too far above to be its doc', () => {
      expect(docFor({ lineStart: 7 }, [jsdoc])).toBeNull();
    });

    it('prefers a python docstring inside the body over a banner above it', () => {
      const banner = { startLine: 1, endLine: 1, text: '# ---- section ----' };
      const inner = { startLine: 3, endLine: 3, text: '"""The real doc."""' };
      expect(docFor({ lineStart: 2 }, [banner, inner])).toBe(inner);
    });

    it('returns null when nothing is near', () => {
      expect(docFor({ lineStart: 50 }, [jsdoc])).toBeNull();
    });
  });

  describe('attachDocs', () => {
    /**
     * A comment belongs to ONE symbol. Without claiming, a banner above a class would be handed to
     * the class AND to its first method, and the same paragraph would describe two different things.
     */
    it('gives a comment to exactly one symbol', () => {
      const cls = { lineStart: 4 };
      const method = { lineStart: 5 };
      const docs = attachDocs([cls, method], [{ startLine: 1, endLine: 3, text: '/** The class. */' }]);
      expect(docs.get(cls)).toBe('The class.');
      expect(docs.has(method)).toBe(false);
    });

    it('leaves an undocumented symbol absent rather than blank', () => {
      const fn = { lineStart: 40 };
      expect(attachDocs([fn], [{ startLine: 1, endLine: 2, text: '/** Elsewhere. */' }]).has(fn)).toBe(false);
    });

    it('attaches each of several symbols its own comment', () => {
      const a = { lineStart: 2 };
      const b = { lineStart: 6 };
      const docs = attachDocs([a, b], [
        { startLine: 1, endLine: 1, text: '/** First. */' },
        { startLine: 5, endLine: 5, text: '/** Second. */' },
      ]);
      expect(docs.get(a)).toBe('First.');
      expect(docs.get(b)).toBe('Second.');
    });
  });
});
