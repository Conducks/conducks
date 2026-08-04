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

    /**
     * A PARAMETER SHARES ITS FUNCTION'S LINE, and it must not out-claim the function.
     *
     * Measured, not imagined. On the frozen Python subject the AST says 606 functions carry a
     * docstring and conducks attached 198, so two thirds vanished — and the docstrings were being
     * harvested correctly the whole time. Instrumenting the join printed the cause:
     *
     *     [TARGETS] [["logging_setup.py",1],["job_name",7],["setup_logging",7], ...]
     *
     * `job_name` is the parameter of `setup_logging`. Both sit on line 7, the parameter sorted
     * first, and a comment is claimed by at most one symbol — so the parameter took the docstring
     * and the function got nothing. A function with NO parameters kept its doc, which is why the
     * failure looked random instead of total.
     *
     * The same shape eats JSDoc in TypeScript; it is not a Python problem.
     */
    it('gives a shared line to the declaration, not to its parameter', () => {
      const param = { lineStart: 7, rank: 1 };
      const fn = { lineStart: 7, rank: 0 };
      const docs = attachDocs([param, fn], [{ startLine: 8, endLine: 10, text: '"""Sets up a logger."""' }]);
      expect(docs.get(fn)).toBe('Sets up a logger.');
      expect(docs.has(param)).toBe(false);
    });

    /** Rank only breaks a TIE. A nearer declaration still wins over a further, better-ranked one. */
    it('does not let rank override distance', () => {
      const near = { lineStart: 9, rank: 1 };
      const far = { lineStart: 2, rank: 0 };
      const docs = attachDocs([near, far], [{ startLine: 8, endLine: 8, text: '// Belongs to the next line.' }]);
      expect(docs.get(near)).toBe('Belongs to the next line.');
      expect(docs.has(far)).toBe(false);
    });

    /**
     * A SIGNATURE THAT WRAPS PUSHES THE DOCSTRING OUT OF A FIXED WINDOW.
     *
     * Measured on the frozen Python subject: 89 functions carried a docstring more than two lines
     * under their `def`, because the parameter list wrapped or a decorator sat above. A bigger
     * constant is not the fix — it would let a nested function's docstring reach its parent. The
     * bound is the declaration's OWN END, and never past the next declaration.
     */
    it('reaches a docstring under a signature that wraps', () => {
      const fn = { lineStart: 10, lineEnd: 40, rank: 0 };
      const docs = attachDocs([fn], [{ startLine: 14, endLine: 16, text: '"""Resolves the final URL."""' }]);
      expect(docs.get(fn)).toBe('Resolves the final URL.');
    });

    /** The reach stops at the next declaration: an inner function's docstring is not its parent's. */
    it('does not reach past the next declaration into a nested body', () => {
      const outer = { lineStart: 10, lineEnd: 40, rank: 0 };
      const inner = { lineStart: 20, lineEnd: 30, rank: 0 };
      const docs = attachDocs([outer, inner], [{ startLine: 21, endLine: 21, text: '"""Belongs to inner."""' }]);
      expect(docs.get(inner)).toBe('Belongs to inner.');
      expect(docs.has(outer)).toBe(false);
    });

    /**
     * A BANNER IS NOT A DESCRIPTION.
     *
     * `# ------------------------------` above a declaration was being attached as its documentation,
     * and it beat the real docstring whenever the signature wrapped. Seventeen of them, measured. A
     * comment with no letters in it says nothing about the symbol.
     */
    it('refuses a rule of dashes as documentation', () => {
      const fn = { lineStart: 5, rank: 0 };
      expect(attachDocs([fn], [{ startLine: 4, endLine: 4, text: '# ------------------------------' }]).has(fn)).toBe(false);
    });

    /**
     * A MODULE DOCSTRING STARTS ON THE DECLARATION'S OWN LINE.
     *
     * A unit records `lineStart: 1` and its docstring also starts at line 1, so a window of
     * `startLine > decl` excluded every one of them. Measured on the frozen Python subject: 69
     * modules carry a docstring and conducks attached exactly 1.
     */
    it('attaches a docstring that begins on the declaration line', () => {
      const unit = { lineStart: 1, rank: 0 };
      const docs = attachDocs([unit], [{ startLine: 1, endLine: 4, text: '"""The scraper entry point."""' }]);
      expect(docs.get(unit)).toBe('The scraper entry point.');
    });
  });
});
