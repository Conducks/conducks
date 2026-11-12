import { ConducksGraph } from "@/lib/core/graph/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { chronicle, anchorChronicle } from "@/lib/core/git/index.js";
import { grammars } from "@/lib/core/parsing/index.js";
import { IgnoreManager } from "@/lib/core/parsing/index.js";
import { logger } from "@/lib/core/utils/index.js";
import { traceMemory } from "@/lib/core/utils/index.js";
import { isNeverAProjectRoot } from "@/lib/core/utils/index.js";
import { FederatedLinker } from "@/lib/core/graph/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fsSync from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conducks — Registry Bootstrapper (Capability Layer)
 * 
 * Handles the heavy lifting of environment discovery, grammar initialization,
 * and structural anchor resolution. This ensures the Registry remains a 
 * pure composition point.
 */
export class RegistryBootstrapper {
  private isGrammarInitialized = false;

  /**
   * Set when `lazy` deferred the graph load; null once the graph is materialised.
   *
   * It takes the persistence to load FROM rather than capturing one, because the connection this
   * decision was made on may be closed by the time anyone needs the graph — the read-only path
   * closes after every load. Resolving it at call time means the loader always uses whatever the
   * registry currently holds, and `load()` reopens a closed vault on its own.
   */
  private pendingLoad: ((p: SynapsePersistence) => Promise<void>) | null = null;

  /**
   * True while a graph load has been deferred and not yet FINISHED.
   *
   * It read `pendingLoad` only, which `ensureGraphLoaded` clears at the START of the load — so for the
   * whole load a caller that did not await got a half-filled graph past the guard meant to stop it
   * (state-machine audit P-01-2).
   */
  public get graphIsDeferred(): boolean { return this.pendingLoad !== null || this.loadInFlight !== null; }

  /**
   * The pulse the in-memory graph was loaded from — null when the vault had none — and whether a load
   * has happened at all. One nullable used to say both, so a graph loaded from a vault with no pulse
   * read as "nothing loaded", and the first `analyze` after an MCP server started was never noticed
   * (state-machine audit round 2, Q-01-2).
   */
  private loadedPulse: string | null = null;
  private graphLoaded = false;

  /** Re-arms the deferred load for the current root. Set by `initialize`, used by `reloadGraph`. */
  private armLoad: (() => void) | null = null;

  /**
   * Whether the vault holds a newer pulse than the one the in-memory graph was loaded from.
   *
   * A long-lived process (the MCP server) loaded the graph once and never again, so after an outside
   * `analyze` its graph tools answered SYMBOL_NOT_FOUND for symbols its SQL tools could see
   * (state-machine audit P-10-3). False while nothing is loaded — there is nothing to be stale.
   */
  public async graphIsStale(persistence: SynapsePersistence): Promise<boolean> {
    if (!this.graphLoaded || this.pendingLoad || this.loadInFlight) return false;
    try {
      const current = await persistence.currentPulse();
      return (current?.id ?? null) !== this.loadedPulse;
    } catch { return false; }
  }

  /** Drop the in-memory graph and defer a fresh load of the current root. */
  public reloadGraph(graph: ConducksGraph): void {
    if (!this.armLoad) return;
    graph.getGraph().clear();
    this.loadedPulse = null;
    this.graphLoaded = false;
    this.armLoad();
  }

  /** The load that is currently running, so a second caller WAITS for it instead of racing past it. */
  private loadInFlight: Promise<void> | null = null;

  /**
   * Materialise the graph if something deferred it. A no-op once loaded, so any number of callers
   * cost one load.
   *
   * CONCURRENCY. This used to clear `pendingLoad` and only then await the load, which is check-then-act:
   * caller A took the pending load and nulled the field, and caller B — arriving while A was still
   * materialising thousands of nodes — saw null, returned immediately believing the graph was ready,
   * and walked an EMPTY one. It did not throw; it answered. Measured over real stdio JSON-RPC with
   * four pipelined `conducks_impact` calls: three came back `SYMBOL_NOT_FOUND` for a symbol that
   * demonstrably exists, because "no node matched" and "no nodes at all" are the same observation to
   * every caller downstream. The comment above claimed "a no-op once loaded" while the code was a
   * no-op once loading had STARTED — the invariant stated was not the one implemented.
   *
   * Now the in-flight promise is memoised and returned, so a concurrent caller awaits the same load.
   * Still exactly one load; the difference is that the second caller waits for it rather than
   * overtaking it.
   */
  public async ensureGraphLoaded(persistence: SynapsePersistence): Promise<void> {
    // A load is already running — join it rather than proceeding on an unloaded graph.
    if (this.loadInFlight) return this.loadInFlight;

    const pending = this.pendingLoad;
    if (!pending) return;
    this.pendingLoad = null;

    // On FAILURE the pending load is restored. Without this a load that threw left `pendingLoad`
    // null forever, so every later caller took the "already loaded" path and answered from an empty
    // graph — the same silent false-negative this fix exists to remove, just reached another way.
    this.loadInFlight = pending(persistence)
      .catch(err => { this.pendingLoad = pending; throw err; })
      .finally(() => { this.loadInFlight = null; });

    return this.loadInFlight;
  }

  /**
   * The nearest ANCESTOR (or self) declaring a workspace with a `conducks.json`, or null.
   *
   * Nearest wins on purpose: a vendored dependency that is itself a monorepo should be able to
   * declare its own workspace and have paths beneath it answer from that, rather than being
   * absorbed by the outer one. That case is untested — ADR 0069 records it as open.
   *
   * The same scope guard the marker walk uses applies here, so a stray `conducks.json` under
   * `/private/tmp` or a home directory cannot claim the tree above it.
   */
  /**
   * Does this `conducks.json` declare a WORKSPACE, or merely exist?
   *
   * It used to be `existsSync`, and that conflated two different files. `conducks.json` is the
   * project's config, and a workspace is only one of the things it can hold — this repository's own
   * declares a visuals generator and nothing else, and the moment it was added every path beneath it
   * started resolving to this root. `tests/fixtures/mock-repo` is a real nested checkout used as an
   * analyze fixture; it stopped anchoring to itself, and a CLI test that asserts a refusal for an
   * unknown symbol began PASSING that symbol against the whole conducks graph instead.
   *
   * ADR 0069's own words are that a declaration is "a statement of intent". Declaring a generator
   * states no intent about topology, so it must not outrank the marker walk. A workspace is declared
   * by `services`, which is what every real declaration in this tree carries.
   *
   * An unreadable or malformed file is NOT treated as a declaration. The failure directions are not
   * symmetric: ignoring it falls through to the marker walk, which is the behaviour that existed
   * before declarations at all, while honouring it would silently move a whole tree's vault on a
   * typo.
   */
  private declaresWorkspace(configPath: string): boolean {
    if (!fsSync.existsSync(configPath)) return false;
    try {
      const parsed = JSON.parse(fsSync.readFileSync(configPath, 'utf-8'));
      return Array.isArray(parsed?.services) && parsed.services.length > 0;
    } catch {
      return false;
    }
  }

  private findDeclaredWorkspace(from: string): string | null {
    let current = from;
    while (current && current !== path.parse(current).root) {
      if (!isNeverAProjectRoot(current) && this.declaresWorkspace(path.join(current, 'conducks.json'))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  /** Memoized per start path — see `discoverRoot`. */
  private rootCache = new Map<string, string>();

  /**
   * Resolves the root conducks anchors to: a declared workspace if there is one, otherwise the
   * nearest inferred project marker.
   *
   * Memoized because it is now asked TWICE per run: the CLI needs the answer before it can create
   * persistence, and `initialize` asks again. Without the cache the "no project marker found"
   * fallback warning — which is the one line a user in the wrong directory must read — printed
   * twice, and a doubled warning reads as two problems (ADR 0116).
   */
  public discoverRoot(startPath: string): string {
    const cached = this.rootCache.get(startPath);
    if (cached !== undefined) return cached;
    const found = this.discoverRootUncached(startPath);
    this.rootCache.set(startPath, found);
    return found;
  }

  private discoverRootUncached(startPath: string): string {
    const searchPaths = [startPath];
    const forbiddenArtifacts = ['build', 'dist', 'out', 'node_modules'];

    // PASS 1 — a DECLARED workspace, searched all the way up before anything is inferred (ADR 0069).
    //
    // This has to be its own walk, not a reordered check inside the one below. The marker walk
    // returns at the FIRST directory carrying any marker, so a service with its own package.json
    // would still win before the workspace above it was ever looked at — which is precisely the bug:
    // `subject-b/app` anchored at `app`, while `subject-b/database`, having no marker of its own,
    // walked up and planted a SECOND vault at the repository root holding 40 nodes. Same repo, two
    // vaults, neither seeing the monorepo.
    //
    // Searching for the declaration separately, and first, is what makes one workspace one vault
    // regardless of which service you happen to point at.
    const declared = this.findDeclaredWorkspace(startPath ? path.resolve(startPath) : process.cwd());
    if (declared) return declared;

    for (const start of searchPaths) {
      let current = start ? path.resolve(start) : process.cwd();
      
      // Safety check: ensure we don't start at root
      if (current === '/' || current === '\\') {
        continue;
      }

      while (current !== path.parse(current).root) {
        const isForbidden = forbiddenArtifacts.includes(path.basename(current));

        // A system, home-level or tooling directory is never a project root, whatever it contains.
        // Checked BEFORE the markers below, because the `.conducks` rule would otherwise let one
        // stray vault in `/private/tmp` claim every tree under it — measured, and it silently
        // analyzed 2,323 unrelated files. The predicate is the scope guard's, not a second copy.
        if (isForbidden || isNeverAProjectRoot(current)) {
          const parent = path.dirname(current);
          if (parent === current) break;
          current = parent;
          continue;
        }

        // 🛡️ [Conducks Priority] Structural Vault FIRST 🏺
        if (fsSync.existsSync(path.join(current, ".conducks"))) return current;

        // 🛡️ [Project Markers] Fallback to Repository markers
        const localMarkers = ['package.json', 'requirements.txt', 'pyproject.toml', 'tsconfig.json', 'go.mod', 'Cargo.toml', 'composer.json'];
        const hasMarker = localMarkers.some(m => fsSync.existsSync(path.join(current, m)));

        if (IgnoreManager.hasConfig(current)) return current;
        if (hasMarker || fsSync.existsSync(path.join(current, ".git"))) return current;

        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    
    // Reached the system root without finding a marker. The fallback stands — refusing here would
    // break a scratch directory, a fresh checkout before its manifest exists, and every test
    // fixture — but it is now SAID OUT LOUD. Silently anchoring to cwd is the shape that once let
    // a stray vault in `/private/tmp` claim 2,323 unrelated files: the analyze looked normal
    // throughout, because nothing on the way in ever named the directory it had chosen.
    const chosen = startPath ? path.resolve(startPath) : process.cwd();
    logger.warn(`🛡️ [Conducks] No project marker found above ${chosen} — no .conducks, .git, package.json, tsconfig.json, go.mod, Cargo.toml, pyproject.toml, requirements.txt or composer.json. Anchoring HERE by fallback. If that is not your project root, pass the path explicitly.`);
    return chosen;
  }

  /**
   * Recursively discovers all sub-projects/repositories within a workspace.
   */
  public discoverProjects(workspaceRoot: string): string[] {
    const projects: string[] = [];
    const forbiddenDirs = ['node_modules', 'build', 'dist', 'out', '.git', 'venv', '__pycache__'];

    const scan = (current: string) => {
      const stats = fsSync.statSync(current);
      if (!stats.isDirectory()) return;

      const items = fsSync.readdirSync(current, { withFileTypes: true });
      let isProject = false;

      // 1. Check for project markers in current dir
      for (const item of items) {
        if (item.name === '.conducks' || item.name === 'package.json' || item.name === '.git' || item.name === 'pyproject.toml') {
          isProject = true;
          break;
        }
      }

      if (isProject) {
        projects.push(path.resolve(current));
        // Note: For now, we continue scanning indoors to find sub-projects/submodules
      }

      for (const item of items) {
        if (item.isDirectory() && !forbiddenDirs.includes(item.name)) {
          try {
            scan(path.join(current, item.name));
          } catch { /* Permission denied or similar */ }
        }
      }
    };

    try {
      scan(workspaceRoot);
    } catch { /* Root access fail */ }

    return projects.length > 0 ? Array.from(new Set(projects)) : [workspaceRoot];
  }

  /**
   * High-fidelity initialization wave.
   */
  /**
   * Where `initialize(readOnly, root)` would anchor, and whether it would re-anchor at all.
   *
   * Separate so a caller that must not re-anchor under work in flight (the MCP server, state-machine
   * audit P-10-1) can ask BEFORE it takes the shared handle away from anyone.
   *
   * Asks the HANDLE where it points, not the chronicle. `chronicle.getProjectDir()` says where the
   * registry is anchored, which is not the same question: the module-level placeholder is
   * `new SynapsePersistence(":memory:", true)`, so a `:memory:` handle under a chronicle already
   * anchored to a real repo answered "root unchanged" and was reused (todo52).
   */
  public anchorDecision(persistence: SynapsePersistence, readOnly: boolean, root?: string): { effectiveRoot: string; rootChanged: boolean; modeChanged: boolean } {
    const baseRoot = root || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const effectiveRoot = (baseRoot === ":memory:") ? baseRoot : this.discoverRoot(baseRoot);
    const handleRoot = (persistence as any).anchoredAt;
    const rootChanged = chronicle.getProjectDir() !== effectiveRoot
      || (typeof handleRoot === 'string' && handleRoot !== effectiveRoot);
    const modeChanged = (persistence as any).readOnly !== readOnly;
    return { effectiveRoot, rootChanged, modeChanged };
  }

  public async initialize(
    options: { readOnly: boolean; root?: string; lazy?: boolean },
    context: {
      graph: ConducksGraph;
      persistence: SynapsePersistence;
      ignoreManager: IgnoreManager;
      /**
       * The federation linker FOR the root being anchored. It was a linker built at module load for
       * `process.cwd()`, so a command run from a subdirectory hydrated neighbours from
       * `<cwd>/.conducks/links.json` instead of the project's (state-machine audit P-01-5, P-05-4).
       */
      federationFor: (root: string) => FederatedLinker;
      updatePersistence: (p: SynapsePersistence) => void;
      updateIgnoreManager: (i: IgnoreManager) => void;
    }
  ): Promise<void> {
    traceMemory('bootstrapper entry (modules loaded)');
    const { readOnly, root, lazy } = options;
    const { graph, persistence, ignoreManager, federationFor, updatePersistence, updateIgnoreManager } = context;

    if (!this.isGrammarInitialized) {
      logger.boot(`🛡️ [Conducks Bootstrapper] Initializing Native Grammar Engine...`);
      await grammars.init();
      await grammars.loadLanguage('python');
      await grammars.loadLanguage('typescript');
      await grammars.loadLanguage('go');
      await grammars.loadLanguage('rust');
      await grammars.loadLanguage('java');
      await grammars.loadLanguage('csharp');
      await grammars.loadLanguage('cpp');
      await grammars.loadLanguage('php');
      await grammars.loadLanguage('javascript');
      await grammars.loadLanguage('ruby');
      await grammars.loadLanguage('swift');
      await grammars.loadLanguage('c');
      this.isGrammarInitialized = true;
      logger.boot(`🛡️ [Conducks Bootstrapper] Native Grammar Engine Ready.`);
      traceMemory('after 12 grammars loaded');
    }

    const { effectiveRoot, rootChanged, modeChanged } = this.anchorDecision(context.persistence, readOnly, root);
    
    // The log sink never BRINGS A VAULT INTO BEING. `setLogFile` mkdirs its parent, so anchoring it
    // here created a `.conducks/` in whatever directory the run started from — and a run that then
    // failed to find a vault left one behind that reads as a project next time. A write session
    // creates the directory itself moments later, so the only case skipped is the very first
    // `analyze` in a fresh tree, which has nothing to log about the previous one anyway (ADR 0116).
    if (effectiveRoot !== ":memory:") {
      const vaultDir = path.join(effectiveRoot, '.conducks');
      if (!readOnly || fsSync.existsSync(vaultDir)) {
        logger.setLogFile(path.join(vaultDir, 'mcp.log'));
      }
    }

    logger.boot(`🛡️ [Conducks Bootstrapper] Anchoring structural synapse at: ${effectiveRoot}`);
    const isCurrentlyConnected = persistence.isConnected();
    // Ask the HANDLE where it points, not the chronicle. `chronicle.getProjectDir()` says where the
    // registry is anchored, which is not the same question: the module-level placeholder is
    // `new SynapsePersistence(":memory:", true)`, so a `:memory:` handle under a chronicle already
    // anchored to a real repo answered "root unchanged" and was reused — measured as
    // `[No Vault] :memory: has no .conducks/` from a tool call against an analyzed repo (todo52).
    // The old `!isCurrentlyConnected` term hid this: the placeholder is disconnected, so it was
    // replaced for the wrong reason and the wrong question was never noticed.
    // (`anchorDecision` below asks the HANDLE where it points, for the reason given there.)

    // Same root, same mode: there is NOTHING to do, connected or not.
    //
    // `isCurrentlyConnected` used to be part of this test, which sent every post-`releaseAnchor()`
    // call down the re-init path. That did two harmful things: it swapped the handle (the race
    // ADR 0146 serialised against), and it fell through to the tail, which calls
    // `graph.getGraph().markDeferred()` — re-deferring an ALREADY MATERIALISED graph on every single
    // call and re-arming `pendingLoad`. After the first boot, `!rootChanged && !modeChanged` can only
    // mean "already set up", because a fresh process starts on the `:memory:` placeholder and so
    // always sees `rootChanged` once (todo52).
    if (!rootChanged && !modeChanged) return;

    // Built FIRST, before anything is closed, cleared or swapped: it reads `.conducksignore` and THROWS
    // on one it cannot read. Built where it used to be — after the handle, the chronicle and the
    // federation linker had moved and the graph was cleared — that throw left a half-switched registry
    // whose graph was empty and not deferred (state-machine audit round 2, Q-01-8).
    const newIgnoreManager = new IgnoreManager(effectiveRoot);

    // A CLOSED handle is not a reason to build a new one — only a changed root or mode is.
    //
    // `releaseAnchor()` closes the vault at the end of every tool call, deliberately, so the user can
    // run CLI commands against the same DuckDB file. With `!isCurrentlyConnected` in this condition,
    // the NEXT call found a disconnected handle and swapped it: `updatePersistence(new
    // SynapsePersistence(...))` on EVERY call, in the steady state, with nothing changed but our own
    // close. Measured in `persistence-handle-owner.test.ts` — one swap per call, zero from the anchor.
    //
    // That swap is precisely the hazard ADR 0146 serialised every tool call to avoid ("no ref-count
    // makes an object swap atomic"), so the queue was paying ~8x to defend against a race this line
    // was manufacturing. `anchor.ts` already stated the right policy — "Disconnection is NOT a re-init
    // trigger — the lazy connection reopens on next query" — and `SynapsePersistence.query()` does
    // reopen via `ensureVaultOpen()`. The bootstrapper simply disagreed with it (todo52).
    // A previous root's deferred load must never survive into this one. Nulled HERE rather than at
    // the top of this method: the top runs on every call, and a call that changes nothing used to
    // clobber an armed `pendingLoad` and then re-arm it further down. Once the re-anchor path stops
    // running for an unchanged anchor, that re-arm is gone — so clearing it unconditionally would
    // leave the graph deferred forever and every tool would answer SYMBOL_NOT_FOUND against an
    // empty graph. Measured exactly that way while removing the queue (todo52).
    // A load ALREADY RUNNING for the old root is waited out, not raced: it holds the old handle and
    // would otherwise keep adding the old root's nodes to the graph cleared below for the new one
    // (state-machine audit P-01-10).
    if (this.loadInFlight) await this.loadInFlight.catch(() => { /* its caller reports it */ });
    // Nulled AFTER that wait, not before it: a load that FAILS restores its own closure into
    // `pendingLoad` on the way out, and that is the OLD root's load. Nulled first, it came back, and
    // the eager path below never re-arms — so the new root read as deferred for good and its next load
    // ran the old root's closure (state-machine audit round 2, Q-01-1).
    this.pendingLoad = null;
    if (isCurrentlyConnected) await persistence.close();

    // Cleared on a MODE change too. Only a root change cleared it, and the load below adds the
    // vault's rows on top of whatever the graph holds — so a node deleted by a write session in the
    // same process survived a read-only → write switch as a ghost (state-machine audit P-01-14).
    graph.getGraph().clear();
    this.loadedPulse = null;
    this.graphLoaded = false;

    const newPersistence = new SynapsePersistence(effectiveRoot, readOnly);
    updatePersistence(newPersistence);
    anchorChronicle(effectiveRoot);
    const federation = federationFor(effectiveRoot);
    updateIgnoreManager(newIgnoreManager);

    // Round 2 (state-machine re-audit): the pulse is read BEFORE the rows, so a pulse an outside
    // `analyze` commits mid-load is newer than the one recorded and reads as stale; read after, it was
    // recorded as loaded while the graph held the older rows (Q-01-3). Every load starts from an empty
    // graph, and one that fails part-way leaves it EMPTY and DEFERRED: it used to stay half-filled and
    // marked materialised while the bootstrapper called it deferred, and the retry loaded on top (Q-01-4).
    const load = async (current: SynapsePersistence) => {
      let pulse: string | null = null;
      try { pulse = (await current.currentPulse())?.id ?? null; } catch { pulse = null; }
      const g = graph.getGraph();
      g.clear();
      try {
        await current.load(g);
        g.markMaterialised();
        await federation.hydrate(g);
      } catch (err) {
        g.clear();
        g.markDeferred();
        throw err;
      }
      this.loadedPulse = pulse;
      this.graphLoaded = true;
    };
    this.armLoad = () => {
      graph.getGraph().markDeferred();
      this.pendingLoad = load;
    };

    // Materialising the graph costs ~165 MB and 146 ms for 2,381 nodes and 12,590 edges, and a
    // read-only caller frequently never walks it. `lazy` defers that to the first caller who
    // does — which is what the flag always promised: it was destructured here and never read, so
    // every read-only process paid a full load to answer questions that touched no node.
    if (lazy) {
      // Mark the GRAPH, not just the registry accessor. Services capture `graph.getGraph()` at
      // construction and hold it directly, so the accessor guard never runs for them and a
      // deferred graph reads as an empty one (todo21#P5).
      this.armLoad();
      return;
    }

    try {
      await load(newPersistence);
      logger.boot(`🛡️ [Conducks Bootstrapper] Structural graph loaded (${graph.getGraph().stats.nodeCount} nodes).`);
    } catch (err: any) {
      console.error(`🛡️ [Conducks Bootstrapper] Structural load failed: ${err.message}`);
      // Deferred and re-armed, so the next walk retries the load instead of reading an empty graph.
      this.armLoad();
    } finally {
      if (readOnly) await newPersistence.close();
    }
    // (A second, "default load" branch followed here. Every path above returns or reaches this
    // point only on a re-anchor — the guard before it returns when nothing changed — so it could
    // never run, and it described a load on the unchanged-anchor path that does not exist:
    // state-machine audit P-01-6. Removed.)
  }
}
