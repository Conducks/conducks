import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList, IntraLinker } from '@/lib/core/graph/index.js';

/**
 * The DEPENDENCY-INJECTION shape — a call reaching a method through a wiring object.
 *
 * `container.services.lookup()` names no function anywhere. `container` is an object literal, its
 * `services` property aliases a variable, that variable is a `new ServiceRegistry()`, and `lookup`
 * is a method on that class. Four hops, every one of them written literally in the source, and the
 * call processor resolves none of them: it emits the receiver's file and stops.
 *
 * This block is what walks those hops, and it had 36 uncovered statements — the largest untested
 * block left in `linker-intra.ts`. The comments in it name three real measurements (192 dangling
 * edges from one variable on subject-b, 113 from a typed parameter on this repository, 10 more from
 * qualified members) and nothing scored the code they describe.
 *
 * The cost of it being wrong is not a missing edge. Every case here ends in `memberOfType`, which
 * returns a node that MUST already exist (ADR 0070) — so a broken hop makes the call vanish from
 * `impact` and `trace`, and a mis-walked hop binds it to a real method on the WRONG class. The
 * refusals at the bottom are the half that keeps the second one from happening.
 */
const F = '/p/a.ts';

const build = () => {
  const g = new ConducksAdjacencyList();
  g.addNode({ id: `${F}::unit`, label: 'UNIT' as any,
    properties: { name: 'unit', canonicalKind: 'UNIT', filePath: F } as any });
  return g;
};

/** A symbol in the file. `unitId` is what puts it in the linker's name lookup. */
const add = (g: ConducksAdjacencyList, id: string, props: Record<string, unknown> = {}, file = F) =>
  g.addNode({
    id, label: 'BEHAVIOR' as any,
    properties: {
      name: id.slice(id.lastIndexOf('::') + 2), unitId: `${file}::unit`,
      canonicalKind: 'BEHAVIOR', filePath: file, ...props,
    } as any,
  });

const call = (g: ConducksAdjacencyList, target: string, from = `${F}::caller`) => {
  const edge = { id: 'e1', sourceId: from, targetId: target,
    type: 'CALLS' as any, confidence: 0.4, properties: {} as any };
  g.addEdge(edge);
  return () => g.getAllEdges().find(e => e.id === 'e1')!.targetId;
};

const link = (g: ConducksAdjacencyList) => new IntraLinker(() => undefined).resolve(g);

describe('a call through an object literal reaches the method it names', () => {
  it('walks property -> variable -> type -> member', () => {
    const g = build();
    add(g, `${F}::caller`);
    add(g, `${F}::container`, { objectPaths: { services: 'registry' } });
    add(g, `${F}::registry`, { instanceOf: 'serviceregistry' });
    add(g, `${F}::serviceregistry`);
    add(g, `${F}::serviceregistry.lookup`);
    const target = call(g, `${F}::container.services.lookup`);

    link(g);

    expect(target()).toBe(`${F}::serviceregistry.lookup`);
  });

  it('takes the LONGEST recorded path, not the first one that matches', () => {
    // `services` and `services.registry` are both recorded, and they alias DIFFERENT variables. The
    // loop counts down from the whole remainder for exactly this reason. Shortest-first is not a
    // near miss — it binds the call to a real method on the wrong class, which reads as correct in
    // every command downstream.
    const g = build();
    add(g, `${F}::caller`);
    add(g, `${F}::container`, { objectPaths: { services: 'wrongvar', 'services.registry': 'rightvar' } });
    add(g, `${F}::wrongvar`, { instanceOf: 'wrongtype' });
    add(g, `${F}::wrongtype`);
    // The member the SHORT path would land on must exist, or shortest-first merely fails to resolve
    // and the loop reaches the right answer anyway. It did, and the mutation survived: the first
    // version of this case passed with the loop counting UP. A wrong branch that cannot succeed
    // proves nothing about the order.
    add(g, `${F}::wrongtype.registry.lookup`);
    add(g, `${F}::rightvar`, { instanceOf: 'righttype' });
    add(g, `${F}::righttype`);
    add(g, `${F}::righttype.lookup`);
    const target = call(g, `${F}::container.services.registry.lookup`);

    link(g);

    expect(target()).toBe(`${F}::righttype.lookup`);
  });

  it('follows a DELEGATING property, where the recorded alias is itself dotted', () => {
    // `{ audit: governance.status }` — the property does not alias a variable, it aliases another
    // receiver's member. The whole remainder is consumed and nothing is left as the member, which
    // is why the loop starts at `segments.length` rather than one short of it. The comment in the
    // source says this is the dominant DI shape and that reserving a segment made it never match.
    const g = build();
    add(g, `${F}::caller`);
    add(g, `${F}::container`, { objectPaths: { audit: 'governance.status' } });
    add(g, `${F}::governance`, { instanceOf: 'governanceservice' });
    add(g, `${F}::governanceservice`);
    add(g, `${F}::governanceservice.status`);
    const target = call(g, `${F}::container.audit`);

    link(g);

    expect(target()).toBe(`${F}::governanceservice.status`);
  });

  it('reads the paths off a PARAMETER’s declared type', () => {
    // The receiver is not a variable in this file at all — it is an argument, and its type is
    // written in the signature. On this repository that is 113 dangling edges from CLI commands
    // shaped `execute(args, registry: Registry)`.
    const g = build();
    add(g, `${F}::caller`, { paramTypes: { registry: 'registry' } });
    add(g, `${F}::registry`, { objectPaths: { services: 'store' } });
    add(g, `${F}::store`, { instanceOf: 'storetype' });
    add(g, `${F}::storetype`);
    add(g, `${F}::storetype.lookup`);
    const target = call(g, `${F}::registry.services.lookup`);

    link(g);

    expect(target()).toBe(`${F}::storetype.lookup`);
  });

  it('strips array decoration from a declared type before resolving it', () => {
    // `handlers: Registry[]` — the annotation states a SHAPE, and the element type is what owns the
    // paths. Without the strip the lookup asks for a node named `registrytype[]`, which exists
    // nowhere, and every parameter declared as an array silently loses its wiring.
    const g = build();
    add(g, `${F}::caller`, { paramTypes: { regs: 'registrytype[]' } });
    add(g, `${F}::registrytype`, { objectPaths: { services: 'store' } });
    add(g, `${F}::store`, { instanceOf: 'storetype' });
    add(g, `${F}::storetype`);
    add(g, `${F}::storetype.lookup`);
    const target = call(g, `${F}::regs.services.lookup`);

    link(g);

    expect(target()).toBe(`${F}::storetype.lookup`);
  });

  it('follows a `typeof` alias one hop to the variable that owns the paths', () => {
    // `type Registry = typeof registry`. The TYPE resolves and owns no paths; the source states
    // which variable carries the shape. One hop, and only when that variable records paths.
    const g = build();
    add(g, `${F}::caller`, { paramTypes: { reg: 'registrytype' } });
    add(g, `${F}::registrytype`, { typeofTarget: 'registry' });
    add(g, `${F}::registry`, { objectPaths: { services: 'store' } });
    add(g, `${F}::store`, { instanceOf: 'storetype' });
    add(g, `${F}::storetype`);
    add(g, `${F}::storetype.lookup`);
    const target = call(g, `${F}::reg.services.lookup`);

    link(g);

    expect(target()).toBe(`${F}::storetype.lookup`);
  });
});

describe('the paths may be owned by another file, and the alias resolves THERE', () => {
  it('resolves the aliased variable in the file that declared the object, not the calling file', () => {
    // The parameter's type is imported. Its object paths name variables in ITS file, so the alias
    // `store` must be looked up in `/p/b.ts` — the calling file may have no such name, or worse, a
    // different one. `pathsOwner` is what carries that, and with it ignored every cross-file DI call
    // either dangles or binds to a same-named local.
    //
    // Written after the mutation survived: every earlier case had the object and the alias in one
    // file, where `pathsOwner ?? file` and `file` are the same string and the distinction is invisible.
    const B = '/p/b.ts';
    const g = build();
    g.addNode({ id: `${B}::unit`, label: 'UNIT' as any,
      properties: { name: 'unit', canonicalKind: 'UNIT', filePath: B } as any });
    g.addEdge({ id: 'imp', sourceId: `${F}::unit`, targetId: `${B}::unit`,
      type: 'IMPORTS' as any, confidence: 1, properties: {} as any });

    add(g, `${F}::caller`, { paramTypes: { reg: 'registrytype' } });
    add(g, `${B}::registrytype`, { objectPaths: { services: 'store' } }, B);
    add(g, `${B}::store`, { instanceOf: 'storetype' }, B);
    add(g, `${B}::storetype`, {}, B);
    add(g, `${B}::storetype.lookup`, {}, B);
    const target = call(g, `${F}::reg.services.lookup`);

    link(g);

    expect(target()).toBe(`${B}::storetype.lookup`);
  });
});

describe('what it refuses, which is what keeps a wrong edge out', () => {
  it('leaves the call dangling when the type has no such member', () => {
    // ADR 0070. Every hop resolved and the last one does not exist, so the answer is nothing rather
    // than an invented id. A tool that mints the id here reports a method that is not in the code.
    const g = build();
    add(g, `${F}::caller`);
    add(g, `${F}::container`, { objectPaths: { services: 'registry' } });
    add(g, `${F}::registry`, { instanceOf: 'serviceregistry' });
    add(g, `${F}::serviceregistry`);
    add(g, `${F}::serviceregistry.lookup`);
    const target = call(g, `${F}::container.services.absent`);

    link(g);

    expect(target()).toBe(`${F}::container.services.absent`);
  });

  it('leaves a COMPUTED key dangling, because nothing recorded a path for it', () => {
    // `handlers[key]()` is the line between the two shapes (todo30): a property chain is written in
    // the source and a computed one is not. The object records paths for what it wires statically
    // and nothing for the rest, so this must not fall through to some other resolution.
    const g = build();
    add(g, `${F}::caller`);
    add(g, `${F}::handlers`, { objectPaths: { save: 'writer' } });
    add(g, `${F}::writer`, { instanceOf: 'writertype' });
    add(g, `${F}::writertype`);
    add(g, `${F}::writertype.run`);
    const target = call(g, `${F}::handlers.load.run`);

    link(g);

    expect(target()).toBe(`${F}::handlers.load.run`);
  });

  it('leaves a bare alias with NO member dangling — it names nothing to call', () => {
    // `{ svc: registry }` called as `container.svc` — the property aliases a variable and no method
    // was named. Binding it to the variable would turn a value reference into a call edge.
    //
    // The OUTCOME is pinned here; the guard that produces it is NOT scored, and saying so is the
    // point. Deleting `if (!member && !aliased.includes('.')) continue` leaves this test green,
    // because the fall-through then asks `memberOfType` for a member named '' and gets nothing back.
    // The guard is defensive rather than load-bearing, and no case reachable from outside this class
    // can tell the two paths apart. Recorded rather than dressed up as coverage.
    const g = build();
    add(g, `${F}::caller`);
    add(g, `${F}::container`, { objectPaths: { svc: 'registry' } });
    add(g, `${F}::registry`, { instanceOf: 'serviceregistry' });
    add(g, `${F}::serviceregistry`);
    const target = call(g, `${F}::container.svc`);

    link(g);

    expect(target()).toBe(`${F}::container.svc`);
  });

  it('refuses when the aliased variable records no type at all', () => {
    // A getter that computes rather than aliases: the path is recorded, the variable it names has
    // no `instanceOf` and no resolvable call, so there is no class to look a member up on.
    const g = build();
    add(g, `${F}::caller`);
    add(g, `${F}::container`, { objectPaths: { services: 'registry' } });
    add(g, `${F}::registry`);
    add(g, `${F}::serviceregistry.lookup`);
    const target = call(g, `${F}::container.services.lookup`);

    link(g);

    expect(target()).toBe(`${F}::container.services.lookup`);
  });
});
