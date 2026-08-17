import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector, AnalyzeContext, grammars, TypeScriptProvider } from '@/lib/core/parsing/index.js';

/**
 * The reflector's SEMANTIC capture handlers — the 23-branch `else if (cName === ...)` chain inside
 * `reflect()`, of which fourteen were named by no test at all.
 *
 * This is the coverage `reflect()`'s split has been waiting on. That method is 1,217 lines and the
 * handlers mutate shared state — `pendingIface`, `pendingObject`, `pendingInstance` — so extracting
 * them means threading that state through, and a regression would be attributable to nothing in
 * particular. Rule 13 says the tests come first; these are them.
 *
 * Each handler is driven through REAL SOURCE rather than a synthetic match, because the pair-handlers
 * only work if the grammar emits both captures in the order the chain assumes. A hand-built match
 * would prove the branch runs and nothing about whether it ever receives what it expects.
 */
const reflector = new ConducksReflector();

const reflect = async (source: string) => {
  const f = { path: '/r/a.ts', source };
  return await reflector.reflect(f, new TypeScriptProvider() as never, new AnalyzeContext(), [f.path]) as any;
};

const meta = (s: any, name: string) => s.nodes.find((n: any) => n.name === name)?.metadata ?? {};
const aliases = (s: any) => (s.relationships ?? []).filter((e: any) => e.type === 'ALIASES');

beforeAll(async () => { await grammars.loadLanguage('typescript'); }, 120000);

describe('typeof_target — a type that IS the shape of a variable', () => {
  it('records which variable the type points at', async () => {
    // `type Registry = typeof registry`. Without it a parameter typed `Registry` stops at a type
    // node that owns nothing, instead of following through to the variable's object paths (ADR 0094).
    const s = await reflect('const registry = { a: 1 };\nexport type Registry = typeof registry;\n');
    expect(meta(s, 'registry').typeofTarget).toBe('registry');
  }, 60000);
});

describe('instance_name + instance_type — `const x = new Y()` means x IS a Y', () => {
  it('records the type on the variable', async () => {
    // A CONSTRUCTS edge already exists, but its SOURCE is the enclosing scope — at module level it
    // says "this file constructs a Y", not "x is one". A later `x.method()` needs the second fact.
    const s = await reflect('class Y {}\nconst x = new Y();\n');
    expect(meta(s, 'x').instanceOf).toBe('y');
  }, 60000);

  it('takes the LAST segment of a qualified type', async () => {
    const s = await reflect('const x = new lib.Widget();\n');
    expect(meta(s, 'x').instanceOf).toBe('widget');
  }, 60000);

  it('records nothing for a plain assignment', async () => {
    // The counter-test: a pair-handler that fired on any assignment would claim a type for every
    // variable in the file.
    const s = await reflect('const x = 5;\n');
    expect(meta(s, 'x').instanceOf).toBeUndefined();
  }, 60000);
});

describe('instance_call_name + instance_call_target — the factory case', () => {
  it('records WHICH CALL produced the value, because the type is not knowable here', async () => {
    // The callee's return type usually lives in another file this wave may not have parsed. So the
    // call is recorded and `IntraLinker` reads the answer once the whole graph exists.
    const s = await reflect('class Db { static getInstance(): Db { return new Db(); } }\nconst db = Db.getInstance();\n');
    expect(meta(s, 'Db').instanceOfCall).toBe('db.getinstance');
  }, 60000);
});

describe('object_name + object_value — a wiring table is a set of paths', () => {
  it('records each key and the identifier it points at', async () => {
    const s = await reflect('const routes = { home: handler, about: other };\n');
    expect(meta(s, 'routes').objectPaths).toEqual({ home: 'handler', about: 'other' });
  }, 60000);

  it('records a key whose value COMPUTES as wired-but-unresolvable, not as missing', async () => {
    // An empty string is "wired, no identifier" and is what dead-code reads; dropping the key
    // entirely would say the path does not exist, which is a different claim.
    const s = await reflect('const routes = { home: makeHandler() };\n');
    expect(meta(s, 'routes').objectPaths).toHaveProperty('home');
  }, 60000);
});

describe('iface_name + iface_body — an interface names its members and their types', () => {
  it('records the member table', async () => {
    const s = await reflect('export interface Shape { nodes: string[]; meta: Meta }\n');
    expect(meta(s, 'Shape').memberTypes).toEqual({ nodes: 'string[]', meta: 'meta' });
  }, 60000);
});

describe('augments_name — a module augmentation references what it extends', () => {
  it('reads the augmented interface out of the declaration', async () => {
    const s = await reflect('declare module "./other.js" { interface Reg { x: 1 } }\n');
    expect(meta(s, 'Reg').memberTypes).toEqual({ x: '1' });
  }, 60000);
});

describe('default_export_name — and the form it does NOT capture', () => {
  it('aliases `default` to a function declaration', async () => {
    // Recorded as ALIASES because that is what it is — a second name. Deliberately not a reference:
    // ALIASES is absent from dead-code's REFERENCE_EDGES, so a default export nobody imports stays
    // reportable.
    const s = await reflect('export default function main() {}\n');
    expect(aliases(s).map((e: any) => `${e.sourceName}->${e.targetName}`)).toContain('default->main');
  }, 60000);

  it('aliases `default` to a class declaration', async () => {
    const s = await reflect('export default class Widget {}\n');
    expect(aliases(s).map((e: any) => `${e.sourceName}->${e.targetName}`)).toContain('default->widget');
  }, 60000);

  it('captures NOTHING for `export default <identifier>` — a real gap, measured', async () => {
    // The query matches `export default function` and `export default class` only. The commonest
    // form for an arrow or a const — declare it, then `export default name` — emits no ALIASES edge,
    // so a default import of it cannot be rebound to the declaration.
    //
    // Recorded rather than fixed (rule 16): adding the pattern changes what every TypeScript project
    // resolves, which needs its own before/after. This goes red the day it is fixed.
    const s = await reflect('const main = () => {};\nexport default main;\n');
    expect(aliases(s)).toHaveLength(0);
  }, 60000);
});
