import { describe, it, expect } from '@jest/globals';
import { DeadCodeAnalyzer } from '@/lib/domain/evolution/dead-code.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';

/**
 * UNUSED_MEMBER — a method of a live type that nothing calls (Java oracle, 2026-11-12).
 *
 * Every guard below was measured against javac before it was written: on gson, 10 false verdicts
 * came from calls the linker bound by NAME to a same-named method elsewhere, and 18 public methods
 * with no caller in the project were gson's API. Each test removes one reason a method is live and
 * checks that the verdict appears, or keeps one and checks that it does not.
 */
type Opts = { visibility?: string | null; decorators?: string[]; kind?: string };
const F = '/r/src/main/java/com/acme';

function graph() {
  const g = new ConducksAdjacencyList();
  const unit = (file: string) => g.addNode({ id: `${file}::unit`, label: 'UNIT', properties: { name: 'unit', filePath: file, canonicalKind: 'UNIT', kind: 'file' } } as never);
  const type = (file: string, name: string, o: Opts = {}) => g.addNode({
    id: `${file}::${name.toLowerCase()}`, label: 'STRUCTURE',
    properties: { name, filePath: file, canonicalKind: 'STRUCTURE', kind: o.kind ?? 'struct', unitId: `${file}::unit`, parentId: `${file}::unit`, dna: { visibility: o.visibility ?? null, decorators: [] } },
  } as never);
  const method = (file: string, owner: string, name: string, o: Opts = {}) => g.addNode({
    id: `${file}::${owner.toLowerCase()}.${name.toLowerCase()}`, label: 'BEHAVIOR',
    properties: { name, filePath: file, canonicalKind: 'BEHAVIOR', kind: 'function', unitId: `${file}::unit`, parentId: `${file}::${owner.toLowerCase()}`, dna: { visibility: o.visibility ?? null, decorators: o.decorators ?? [] } },
  } as never);
  let n = 0;
  const edge = (type: string, from: string, to: string, props: Record<string, unknown> = { resolved: true }, confidence = 1) =>
    g.addEdge({ id: `e${n++}`, sourceId: from, targetId: to, type, confidence, properties: props } as never);
  return { g, unit, type, method, edge };
}

/** App.main constructs Service; Service has the method under test. */
function subject(setup?: (b: ReturnType<typeof graph>) => void, o: Opts = {}, typeOpts: Opts = {}) {
  const b = graph();
  const app = `${F}/App.java`, svc = `${F}/Service.java`;
  b.unit(app); b.unit(svc);
  b.type(app, 'App', { visibility: 'public' }); b.method(app, 'App', 'main', { visibility: 'public' });
  b.type(svc, 'Service', typeOpts);
  b.method(svc, 'Service', 'run');
  b.method(svc, 'Service', 'helper', o);
  b.edge('CONSTRUCTS', `${app}::app.main`, `${svc}::service`);
  b.edge('CALLS', `${app}::app.main`, `${svc}::service.run`);
  setup?.(b);
  return new DeadCodeAnalyzer().analyze(b.g).filter(f => f.type === 'UNUSED_MEMBER').map(f => f.symbol);
}

describe('UNUSED_MEMBER', () => {
  it('reports an uncalled method of a type that is in use', () => {
    expect(subject()).toEqual(['Service.helper']);
  });

  it('a type in use from a file nothing imports still has its members judged (same-package use)', () => {
    // No IMPORTS edge at all in this graph: Java needs none inside a package.
    expect(subject()).toContain('Service.helper');
  });

  it('a called method is not reported', () => {
    expect(subject(b => b.edge('CALLS', `${F}/App.java::app.main`, `${F}/Service.java::service.helper`))).toEqual([]);
  });

  it('a GUESSED call to any method of that name spares it (gson: serializeNulls, deepCopy, toJson)', () => {
    expect(subject(b => {
      b.unit(`${F}/Other.java`); b.type(`${F}/Other.java`, 'Other'); b.method(`${F}/Other.java`, 'Other', 'helper');
      b.edge('CALLS', `${F}/App.java::app.main`, `${F}/Other.java::other.helper`, { resolved: false, original: 'helper' }, 0.85);
    })).not.toContain('Service.helper');
  });

  it('an override of a method a project supertype declares is spared (reached through the base)', () => {
    expect(subject(b => {
      b.unit(`${F}/Base.java`); b.type(`${F}/Base.java`, 'Base'); b.method(`${F}/Base.java`, 'Base', 'helper');
      b.edge('EXTENDS', `${F}/Service.java::service`, `${F}/Base.java::base`);
      b.edge('CALLS', `${F}/App.java::app.main`, `${F}/Base.java::base.helper`);
    })).not.toContain('Service.helper');
  });

  it('a type extending a library type spares its methods (the library may declare them)', () => {
    expect(subject(b => b.edge('EXTENDS', `${F}/Service.java::service`, 'TypeAdapter'))).not.toContain('Service.helper');
  });

  it('a public method of a public type is API, not dead (gson: 18 such methods)', () => {
    expect(subject(undefined, { visibility: 'public' }, { visibility: 'public' })).not.toContain('Service.helper');
    expect(subject(undefined, { visibility: 'protected' }, { visibility: 'public' })).not.toContain('Service.helper');
  });

  it('a public method of a package-private type can only be reached from inside, so it is judged', () => {
    expect(subject(undefined, { visibility: 'public' }, { visibility: null })).toContain('Service.helper');
  });

  it('an annotated method is spared (a framework or the compiler names it)', () => {
    expect(subject(undefined, { decorators: ['@GetMapping("/x")'] })).toEqual([]);
    expect(subject(undefined, { decorators: ['@Override'] })).toEqual([]);
  });

  it('bean accessors and runtime-called names are spared', () => {
    for (const name of ['getName', 'isReady', 'setName', 'toString', 'readObject']) {
      const out = subject(b => b.method(`${F}/Service.java`, 'Service', name));
      expect(out).not.toContain(`Service.${name}`);
    }
  });

  it('a constructor is reached through `new Service()`, which names the type — never reported', () => {
    expect(subject(b => b.method(`${F}/Service.java`, 'Service', 'Service'))).not.toContain('Service.Service');
  });

  it('a member of a type nobody uses is not reported again (the type is the finding)', () => {
    const b = graph();
    const svc = `${F}/Lonely.java`;
    b.unit(svc); b.type(svc, 'Lonely'); b.method(svc, 'Lonely', 'helper');
    const out = new DeadCodeAnalyzer().analyze(b.g);
    expect(out.filter(f => f.type === 'UNUSED_MEMBER')).toEqual([]);
  });

  it('an interface method is a requirement, not judged', () => {
    expect(subject(undefined, {}, { kind: 'interface' })).toEqual([]);
  });

  describe('private fields', () => {
    const withField = (field: Record<string, unknown>, typeDecorators: string[] = [], used = false) => {
      const b = graph();
      const app = `${F}/App.java`, svc = `${F}/Service.java`;
      b.unit(app); b.unit(svc);
      b.type(app, 'App'); b.method(app, 'App', 'main');
      b.type(svc, 'Service'); b.method(svc, 'Service', 'run');
      (b.g.getNode(`${svc}::service`) as any).properties.dna.decorators = typeDecorators;
      b.g.addNode({ id: `${svc}::service.count`, label: 'ATOM', properties: {
        name: field.name ?? 'count', filePath: svc, canonicalKind: 'ATOM', kind: 'field', unitId: `${svc}::unit`, parentId: `${svc}::service`,
        dna: { visibility: 'visibility' in field ? field.visibility : 'private', decorators: field.decorators ?? [] } } } as never);
      b.edge('CONSTRUCTS', `${app}::app.main`, `${svc}::service`);
      b.edge('CALLS', `${app}::app.main`, `${svc}::service.run`);
      if (used) b.edge('ACCESSES', `${svc}::service.run`, `${svc}::service.count`);
      return new DeadCodeAnalyzer().analyze(b.g).filter(f => f.type === 'UNUSED_MEMBER').map(f => f.symbol);
    };

    it('reports a private field nothing reads or writes', () => {
      expect(withField({})).toEqual(['Service.count']);
    });
    it('a field read or written anywhere in its file is used', () => {
      expect(withField({}, [], true)).toEqual([]);
    });
    it('only PRIVATE fields are judged — any other may be used from another file', () => {
      expect(withField({ visibility: null })).toEqual([]);
      expect(withField({ visibility: 'public' })).toEqual([]);
    });
    it('an annotated field is spared, except by the compiler\'s own annotations', () => {
      expect(withField({ decorators: ['@Autowired'] })).toEqual([]);
      expect(withField({ decorators: ['@Deprecated'] })).toEqual(['Service.count']);
    });
    it('every field of an annotated class is spared (JPA, Lombok, serializers reach fields by reflection)', () => {
      expect(withField({}, ['@Entity'])).toEqual([]);
    });
    it('serialVersionUID is read by the JVM', () => {
      expect(withField({ name: 'serialVersionUID' })).toEqual([]);
    });
  });

  it('is judged for Java only — other languages wait for an oracle that scores members', () => {
    const b = graph();
    const app = '/r/app.ts', svc = '/r/service.ts';
    b.unit(app); b.unit(svc);
    b.type(app, 'App'); b.method(app, 'App', 'main');
    b.type(svc, 'Service'); b.method(svc, 'Service', 'helper');
    b.edge('CONSTRUCTS', `${app}::app.main`, `${svc}::service`);
    expect(new DeadCodeAnalyzer().analyze(b.g).filter(f => f.type === 'UNUSED_MEMBER')).toEqual([]);
  });
});
