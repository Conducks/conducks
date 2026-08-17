// The architecture as DATA. Positions are never written here — ELK computes them.
//
// An edge may carry {prio:n}. A cycle has to be broken somewhere, and priority is what decides
// where: negative marks the edge that IS the loop-back, positive marks a call that must point down.
// A node's `hov` is the anchor text `conducks visuals-lint` verifies against the working tree.

// Container id -> page basename, for any container that does not follow `c_x` -> `x.html`. Lives
// HERE, with the data, because render.mjs and detail.mjs both derive filenames and a private copy in
// either one drifts.
export const PAGE = {};
export const pageFor = id => (PAGE[id] ?? id.replace(/^c_/, '')) + '.html';

const n = (id,t,s,hov,o={}) => ({ id, t, s, hov, ...o });

// ── Band 1 — how a codebase becomes a graph ──────────────────────────────────
//
// The `analyze` path, which is the only path that WRITES. Every other command reads what this band
// produced, so a defect here reaches all 35 of them.
//
// Drawn in the order the pulse actually runs, and each container is one core feature behind its own
// door (ADR 0150). The doors are why this picture can be drawn at all: before them, parsing alone
// was entered at 24 separate files and no boundary existed to put a box around.
export const BAND1 = {
  id:'band1', title:'HOW A CODEBASE BECOMES A GRAPH',
  sub:'the analyze pulse — the only path that writes',
  containers:[
    { id:'c_git', title:'DISCOVERY', sub:'core/git — which files exist, asked of git itself',
      nodes:[
        n('anchor','Anchor on a root','one directory for the whole process',
          'src/lib/core/git/chronicle-interface.ts::anchorChronicle — the door hands out `chronicle` as ReadOnlyChronicle, the class minus its one mutator, so none of the two dozen files holding it can re-anchor mid-run',
          {cls:'n-ok'}),
        n('disc','Ask every repository','not just the anchor’s own',
          'src/lib/core/git/chronicle-interface.ts::discoverFiles — `ls-files` in a root does not descend into a nested checkout. Measured on this repo: a private copy saw 575 source files, this sees 578, and the three were a nested fixture (ADR 0069)',
          {cls:'n-hi'}),
        n('quote','Non-ASCII names survive','core.quotePath=false, per invocation',
          'src/lib/core/git/chronicle-interface.ts — git quotes any path with a non-ASCII byte, so a Turkish filename came back as a 52-character escaped literal that opened nothing. Passed per-invocation because conducks must not write to a repo it is only reading',
          {cls:'n-warn'}),
        n('fsfall','No repository? Scan the tree','the case ADR 0035 supports',
          'src/lib/core/git/chronicle-interface.ts::discoverFiles — the fallback walk accepts a file by extension OR exact filename, because Rakefile and Dockerfile have no extension to match on'),
      ],
      edges:[['anchor','disc'],['disc','quote'],['disc','fsfall','git said nothing']]},

    { id:'c_parsing', title:'PARSING', sub:'core/parsing — 13 language packs and one reflector',
      nodes:[
        n('gate','Has this file changed?','a content hash, not a timestamp',
          'src/lib/core/persistence/file-hash-gate.ts::FileHashGate — a mtime changes on checkout and says nothing about content',
          {shape:'dia'}),
        n('order','Order by dependency','so a definition is parsed before its user',
          'src/lib/core/parsing/pipeline.ts::topologicalSort — a cycle has no valid order, and the two wrong answers are to drop those files or loop forever. They are appended as a final tier instead'),
        n('refl','The reflector','tree-sitter match in, nodes and edges out',
          'src/lib/core/parsing/reflector.ts::reflect — 1,696 lines, the single most consequential file here: a defect reaches all 35 commands',
          {cls:'n-hi'}),
        n('tags','A capture declares a kind','isFunction, isStruct, isBinding…',
          'src/lib/core/parsing/capture-tags.ts::DEFINITION_CAPTURES — one case per tag is pinned, in a language MEASURED to emit it. isClass is emitted by ONE of the thirteen grammars, so a TypeScript case would have tested isStruct and passed'),
        n('her','Inheritance is an EDGE','and it produced none in three languages',
          'src/lib/core/parsing/languages/php/queries.ts — @heritage must be co-captured with @name in the SAME pattern or the reflector resolves no definition node and drops it silently. PHP had no heritage pattern at all until 2026-08-17',
          {cls:'n-warn'}),
        n('spec','Each pack resolves its own imports','the one rule a pack cannot share',
          'src/lib/core/parsing/languages/typescript/resolver.ts::TypeScriptResolver — TS ESM writes a .js specifier for a .ts file, so both forms are tried or every relative import fails to bind'),
        n('noora','Nine packs have no oracle','their queries are unmeasured',
          'src/lib/core/parsing/languages/swift/queries.ts — only typescript, tsx, javascript and python are checked against an external tool. The rest are known to PARSE and not known to capture the right things',
          {cls:'n-no'}),
      ],
      edges:[['gate','order','changed'],['order','refl'],['refl','tags'],['tags','her'],
             ['refl','spec'],['spec','noora','for nine of thirteen']]},

    { id:'c_graph', title:'THE GRAPH', sub:'core/graph — nodes, edges, and binding names to them',
      nodes:[
        n('add','Every id is lowercased','APFS calls two spellings one file',
          'src/lib/core/graph/adjacency-list.ts::addNode — treating them as two splits one symbol into two nodes, and every count then reports it twice (CONDUCKS-4)',
          {cls:'n-ok'}),
        n('skel','A stored node is a SKELETON','getNode and getNodesMap differ',
          'src/lib/core/graph/adjacency-list.ts::addNode — a field not named in the skeleton is harvested correctly, carried through the worker correctly, and dropped at this boundary. `doc` and `instanceOf` each cost a debugging session before they were added',
          {cls:'n-warn'}),
        n('kind','A capture becomes a rung','BEHAVIOR, STRUCTURE, ATOM…',
          'src/contracts/taxonomy.ts::mapToCanonical — a declared rung nothing emits is not a reservation, it is a row that makes the table wrong (ADR 0100)'),
        n('intra','Bind the bare names','once every file is known',
          'src/lib/core/graph/linker-intra.ts::IntraLinker — during streaming induction a call to a symbol in a later batch is stored with a bare target. This runs after the whole graph exists',
          {cls:'n-hi'}),
        n('port','It REFUSES to guess alone','the resolver is injected',
          'src/lib/core/graph/linker-intra.ts::ResolveSpecifier — core/graph may not import core/parsing’s door without closing a cycle (rule 5b), so domain supplies the implementation. A default resolving nothing would be indistinguishable from a specifier that names nothing',
          {cls:'n-ok'}),
        n('fam','Never bind across languages','the most confident wrong answer',
          'src/lib/core/graph/import-resolver.ts::sameFamily — a single-candidate match across languages cannot be told from a correct one downstream. It fails OPEN on an unknown extension, so a new language is not silently refused'),
      ],
      edges:[['add','skel'],['add','kind'],['kind','intra'],['intra','port'],['port','fam']]},

    { id:'c_persistence', title:'THE VAULT', sub:'core/persistence — DuckDB, and one writer',
      nodes:[
        n('save','save() writes NO structure','and the call succeeds',
          'src/lib/core/persistence/persistence.ts::SynapsePersistence — it writes metadata and the pulses row. Nodes and edges go through saveNodes and saveEdges, so the watcher’s "persisting structural delta" was a no-op for as long as that line existed',
          {cls:'n-warn'}),
        n('nodes','saveNodes is what stores them','batched, inside the pulse transaction',
          'src/lib/core/persistence/persistence.ts::saveNodes'),
        n('purge','Purge a unit, not just its children','or reconcile churns forever',
          'src/lib/core/persistence/persistence.ts::purgeUnits — matching on unitId alone left every unit row behind, and analyze then found the same units "no longer discoverable" on EVERY pulse'),
        n('fresh','What changed since last time','the shared answer, not a second one',
          'src/lib/core/persistence/freshness.ts::classifyFreshness — this classification used to live inline in the monitor and the watcher had no way to ask for it, so a watcher started after edits was blind to every one of them'),
      ],
      edges:[['save','nodes','structure goes here instead',{prio:10}],['nodes','purge'],['purge','fresh']]},
  ],
  crossEdges:[
    ['disc','gate','the file list'],
    ['fsfall','gate'],
    ['refl','add','a spectrum of nodes and edges'],
    ['her','add'],
    ['fam','nodes','resolved targets'],
    ['fresh','gate','next pulse skips what did not change',{prio:-10}],
  ],
};

export const BANDS = [BAND1];

// Bands are chapters of ONE drawing, and edges between them may point backwards — that is what makes
// the picture a cycle rather than a stack. There is one band today, so this list is empty; it is
// declared rather than omitted because the next band's first edge belongs here and nowhere else.
export const BAND_LINKS = [];
