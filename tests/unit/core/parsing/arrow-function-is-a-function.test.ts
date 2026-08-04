import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

/**
 * A FUNCTION BOUND TO A NAME IS STILL A FUNCTION.
 *
 * `export const Button: React.FC = (props) => {...}` is how most of a React or Next.js codebase
 * declares its functions, and conducks recorded every one of them as `ATOM` — a variable. Measured on
 * the frozen subjects: 123 PascalCase atoms in orchestrator's `.tsx` files and 22 in sofie's, against
 * 128 BEHAVIOR nodes across all 198 of orchestrator's `.tsx` files.
 *
 * That is not a labelling detail. `impact`, `prune`, `coverage` and `flows` all select on BEHAVIOR, so
 * a React codebase was largely invisible to the commands this project leads with.
 *
 * The evidence is in the source, not in a heuristic: the grammar captures a parameter list for a
 * declarator whose value is an arrow function, and captures nothing for a plain variable. A
 * declaration that carries parameters is a function in any language.
 */
describe('a function bound to a name', () => {
  const reflector = new ConducksReflector();
  const provider = new TypeScriptProvider();

  const reflect = async (source: string) => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/a.ts', source };
    return reflector.reflect(file, provider as never, context, [file.path]);
  };

  const nodeNamed = (spectrum: any, name: string) =>
    spectrum.nodes.find((n: any) => n.name === name);

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  it('records an arrow function assigned to a const as a function', async () => {
    const spectrum = await reflect(`
export const Button = (label: string) => {
  return label.trim();
};
`);
    expect(nodeNamed(spectrum, 'Button')?.canonicalKind).toBe('BEHAVIOR');
  });

  it('records a plain value as a variable, not a function', async () => {
    const spectrum = await reflect(`
export const LIMIT = 42;
`);
    expect(nodeNamed(spectrum, 'LIMIT')?.canonicalKind).toBe('ATOM');
  });

  /** A component with no parameters is still a component — the parameter LIST is what counts. */
  it('records a zero-parameter arrow function as a function', async () => {
    const spectrum = await reflect(`
export const Spinner = () => null;
`);
    expect(nodeNamed(spectrum, 'Spinner')?.canonicalKind).toBe('BEHAVIOR');
  });

  /** An object literal is data even when its properties hold functions. */
  it('records an object literal as a variable', async () => {
    const spectrum = await reflect(`
export const handlers = { onClick: () => {} };
`);
    expect(nodeNamed(spectrum, 'handlers')?.canonicalKind).toBe('ATOM');
  });
});
