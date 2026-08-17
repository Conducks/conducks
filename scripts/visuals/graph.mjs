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

// ── Band 2 — how a question is answered ──────────────────────────────────────
//
// Everything Band 1 wrote is read here, by two surfaces over ONE composition root. The band exists
// because the interesting facts are not in either surface: they are in what the registry refuses,
// and in the choice between answering from SQL and materialising the graph.
//
// Read at `45a65be`. This band crosses `domain`, `interfaces` and `registry`, none of which has had
// the structural pass core got — so it draws the PATH, which was read, and does not claim the layers
// behind it are clean.
export const BAND2 = {
  id:'band2', title:'HOW A QUESTION IS ANSWERED',
  sub:'two surfaces, one registry, and the choice between SQL and a 165 MB walk',
  containers:[
    { id:'c_cli', title:'THE CLI', sub:'interfaces/cli — 42 commands behind one dispatcher',
      nodes:[
        n('argv','A command word','conducks <id> [args]',
          'src/interfaces/cli/index.ts::main — 42 commands, each a ConducksCommand found by id'),
        n('iface','One contract per command','id, description, usage, execute',
          'src/interfaces/cli/command.ts::ConducksCommand — `link` was imported and never instantiated, so the command answered "Unknown command" while FederatedLinker underneath worked fine. The import satisfied the compiler and no test drove the surface',
          {cls:'n-warn'}),
        n('help','--help is answered CENTRALLY','before the command runs',
          'src/interfaces/cli/index.ts::main — every arg parser skips unknown flags, so `query --help` fell through as an empty query, which is read as `*` and printed the whole inventory. Handled in the dispatcher because the defect was per command and the fix should not be written 39 times (ADR 0111)',
          {cls:'n-ok'}),
        n('quiet','A read command says nothing else','narration is off unless asked',
          'src/lib/core/utils/logger.ts::setProcessQuiet — five boot lines used to precede every answer. Quiet is process-wide but the SETTER is not a method, so the reach is visible at the call site (ADR 0080)'),
      ],
      edges:[['argv','iface'],['argv','help','asked for usage'],['argv','quiet']]},

    { id:'c_mcp', title:'THE MCP SURFACE', sub:'interfaces/tools — the same answers, over stdio',
      nodes:[
        n('anch','Anchor to the caller’s project','not to wherever the server booted',
          'src/interfaces/tools/shared/anchor.ts::ensureAnchor — a globally installed server boots detached, so the whole surface was unusable for any project but one until the anchor was re-resolved per call',
          {cls:'n-hi'}),
        n('hold','Take a hold on the vault','closed when the LAST holder releases',
          'src/registry/index.ts::acquireVault — three independent closers ran in a single tool call and whichever finished first hung up the handle; the others got `Database was already closed` (ADR 0146)',
          {cls:'n-ok'}),
        n('stdio','stdout is the protocol','so every log goes to stderr',
          'src/interfaces/tools/tools/synapse.ts — a stray stdout write is not a log here, it is a malformed JSON-RPC frame'),
      ],
      edges:[['anch','hold'],['hold','stdio']]},

    { id:'c_reg', title:'THE REGISTRY', sub:'src/registry — composition, and the guard that made a silent failure loud',
      nodes:[
        n('one','One wiring point','both surfaces get the same object',
          'src/registry/index.ts — the CLI may not import core (ADR 0005), so composition carries every edge the interfaces need'),
        n('defer','The graph load is DEFERRED','165 MB and 146 ms a reader may not need',
          'src/lib/core/bootstrap/registry-bootstrapper.ts — a read-only caller frequently walks no node at all',
          {shape:'dia'}),
        n('guard','A deferred graph would read as EMPTY','so asking for it THROWS instead',
          'src/registry/index.ts — four of six MCP tools broke this way and three broke silently: zero nodes, zero flows, symbol-not-found, no error anywhere. The getter turns forgetting into a loud failure at the call site rather than a wrong answer downstream (CONDUCKS-13)',
          {cls:'n-ok'}),
        n('ro','A read handle REFUSES a write','it does not drop it quietly',
          'src/lib/core/persistence/persistence.ts::run — a silent no-op here would be the same defect as `save()` writing no structure: a call that succeeds and stores nothing'),
      ],
      edges:[['one','defer'],['defer','guard','something walks the graph'],['one','ro']]},

    { id:'c_answer', title:'THE ANSWER', sub:'SQL or a walk — the choice is the design',
      nodes:[
        n('sql','Ask the vault','no graph load at all',
          'src/lib/core/persistence/persistence.ts::query — this is why the load is deferred, and a command that answers from SQL must NOT materialise the graph'),
        n('filt','A typed filter, never a string','field and operator from fixed allowlists',
          'src/lib/domain/analysis/filter-builder.ts::buildFilterQuery — values are always bound with `?`, so an operator of "; DELETE" fails the allowlist check rather than reaching a query string',
          {cls:'n-ok'}),
        n('walk','Or walk the graph','impact, trace, flows',
          'src/lib/core/graph/algorithms/traversal.ts::traverseUpstream — bounded by maxDepth AND a visited set: the first stops the walk, the second is what keeps the ANSWER right when two paths reach one node'),
        n('gov','Or ask governance','audit, arch, drift, status',
          'src/lib/domain/governance/index.ts'),
        n('stale','And say when it is BEHIND','the answer describes the last pulse',
          'src/interfaces/cli/shared/stale-warning.ts::warnIfStale — an answer about a tree nobody has checked out is worse than no answer, because it looks like one',
          {cls:'n-hi'}),
        n('swept','Every layer is behind a door now','twenty of them, and the gate bites for each',
          'tests/architecture/feature-doors.test.ts — this block said "no structural pass yet" for domain, interfaces and registry until 2026-08-17. It stopped being true when they were swept, and a sentence that has gone false while its anchor still resolves is the one failure no gate here can catch (conducks-visuals §13)',
          {cls:'n-ok'}),
      ],
      edges:[['sql','filt'],['sql','stale'],['walk','stale'],['gov','stale'],['gov','swept']]},
  ],
  crossEdges:[
    ['iface','one'],['quiet','one'],
    ['stdio','one'],['anch','one'],
    ['guard','walk','materialised first'],
    ['one','sql'],['one','gov'],
  ],
};

// ── Band 3 — how it keeps up, and how it crosses a repository ────────────────
//
// Two paths that both re-enter Band 1 rather than following it, which is why they are one band: the
// watcher re-pulses a single file mid-way through the write path, and federation reaches into
// ANOTHER project's vault. Neither starts at the top.
//
// Read at `10bc5da` — watcher.ts, watcher-liveness.ts, project-registry.ts, linker-federated.ts and
// project-monitor.ts, opened for this band.
export const BAND3 = {
  id:'band3', title:'HOW IT KEEPS UP, AND HOW IT CROSSES A REPOSITORY',
  sub:'the watcher re-enters the write path; federation reaches into a neighbour',
  containers:[
    { id:'c_watch', title:'THE WATCHER', sub:'domain/evolution — one file at a time, on save',
      nodes:[
        n('ready','Wait for the BASELINE','before announcing, and before reconciling',
          'src/lib/domain/evolution/watcher.ts::whenReady — a reconcile finishing before the watcher is genuinely watching leaves a window where a new file is neither reported as an event nor caught by the sweep (todo55)',
          {cls:'n-ok'}),
        n('recon','Sweep once at startup','what changed while nothing was watching',
          'src/lib/domain/evolution/watcher.ts::reconcileOnStart'),
        n('univ','A re-pulse needs the WHOLE file list','or every specifier dangles',
          'src/lib/domain/evolution/watcher.ts::ConducksWatcher — an import resolves against candidate paths, so re-pulsing one file alone gives the resolver nothing to match and the file loses its edges on every save. The list is read from the graph\'s own UNIT nodes rather than the disk, because a filesystem walk per keystroke is not free',
          {cls:'n-hi'}),
        n('rebind','Then bind the bare names again','the step analyze runs and this path did not',
          'src/lib/domain/evolution/watcher.ts::ConducksWatcher — invisible while a live pulse only ADDED, because the previously resolved edge survived and masked the dangling new one. The moment a re-pulse REPLACES a file\'s edges it shows: measured, `impact` fell from one caller to none after editing the calling file',
          {cls:'n-warn'}),
        n('beat','A heartbeat, and a pid','so a DEAD watcher is not read as no watcher',
          'src/lib/domain/evolution/watcher-liveness.ts::writeWatcherMarker — both signals are needed: a pid alone is fooled by a machine that recycles pids, a heartbeat alone cannot tell a clean exit from a hang',
          {shape:'dia'}),
      ],
      edges:[['ready','recon','baseline established'],['recon','univ'],['univ','rebind'],['ready','beat']]},

    { id:'c_fed', title:'FEDERATION', sub:'domain/federation — many projects, one machine',
      nodes:[
        n('roster','A list of project roots','plain JSON, hand-editable on purpose',
          'src/lib/domain/federation/project-registry.ts::ProjectRegistry — without it every project is an island and nothing can answer "which of my repos has fallen behind its code". A corrupt or missing file degrades to "no projects" rather than an error, because nothing depends on it',
          {cls:'n-ok'}),
        n('mon','Report on every one of them','per root, not per process',
          'src/lib/domain/analysis/project-monitor.ts::report — it used to spawn its own git and see only the anchor repository; it asks the git feature per root now, which is what made a nested checkout visible'),
        n('neigh','Read a NEIGHBOUR\'s vault','another project\'s graph, read-only',
          'src/lib/core/graph/linker-federated.ts::FederatedLinker'),
        n('inject','The opener is INJECTED, and refuses','no silent default',
          'src/lib/core/graph/linker-federated.ts::OpenNeighbourVault — importing persistence here became a real ESM cycle the moment the graph door existed, measured by a test that failed on the partially initialised module. It was optional first, and an optional no-op made a whole neighbour workspace read as empty',
          {cls:'n-ok'}),
        n('third','The third cycle of this exact shape','registry↔watcher · chronicle↔resolver · this',
          'src/lib/core/graph/linker-federated.ts::FederatedLinker — a door is itself a dependency edge, so importing one pulls in everything it re-exports. Each time it compiled fine and one unrelated test failed',
          {cls:'n-warn'}),
      ],
      edges:[['roster','mon'],['roster','neigh'],['neigh','inject'],['inject','third']]},
  ],
  crossEdges:[
    ['beat','mon','a dead watcher is an incident, not a setting'],
  ],
};

export const BANDS = [BAND1, BAND2, BAND3];

// Bands are chapters of ONE drawing, and edges between them may point backwards — that is what makes
// the picture a CYCLE rather than a stack. Both of these do: Band 2 reads what Band 1 wrote, and the
// staleness check reads Band 1's own freshness engine to decide whether to say so.
export const BAND_LINKS = [
  ['nodes','sql','every answer reads what the pulse wrote'],
  ['fresh','stale','the same freshness engine both surfaces use'],
  ['argv','anchor','analyze is a command like any other',{prio:10}],
  // Band 3 does not follow Band 1 — it re-enters it. The watcher rejoins the write path at the
  // reflector, skipping discovery entirely, and that is the whole reason it needs the file list
  // handed to it. Marked as the loop-back so ELK does not hoist the watcher above the pulse.
  ['univ','refl','one file, mid-pulse',{prio:-10}],
  ['recon','fresh','what changed while nothing watched'],
  ['argv','ready','conducks watch'],
  ['mon','stale','and reports it per project'],
];
