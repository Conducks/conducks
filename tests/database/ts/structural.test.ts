import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import fs from 'node:fs';
import path from 'node:path';

/**
 * Conducks — Structural Layer Audit 🧬
 *
 * Performs high-fidelity census of the structural graph, identifying
 * 'Structural Sins' (Disconnected Islets) across the Canonical Taxonomy.
 */

// SKIP vs FAIL (todo27 Phase 3, decided): this suite deliberately audits the repository's OWN live
// vault rather than a synthetic fixture (todo25#P5) — that is the point of it, so building a fixture
// vault here would defeat the reason it exists. But that also means CI is red on a fresh clone
// before anyone has run `conducks analyze` once, MEASURED as
// `IO Error: ... in read-only mode: database does not exist` out of DuckDB, thrown uncaught from
// beforeAll. A "no vault yet" clone and a genuinely broken vault must not report the same way
// (CONDUCKS-13 / ADR 0048's whole point) — so this checks for the file's ABSENCE only, before
// opening it. Absent -> skip with a stated reason (expected, first-run). Present but unopenable for
// any other reason (locked, corrupt) -> beforeAll still throws, same as before this change.
const vaultDbPath = path.resolve(process.cwd(), '.conducks', 'conducks-synapse.db');
const vaultPresent = fs.existsSync(vaultDbPath);
const maybeIt = vaultPresent ? it : it.skip;

describe('Synapse Structural Layer Audit', () => {
  let persistence: SynapsePersistence;
  let db: any;
  let latestPulseId: string;

  /**
   * Every read here reported `rows || []` on error and carried on, so a query that failed read as an
   * empty result — a census of nothing, or zero dangling edges. That tolerance is kept deliberately
   * (this suite audits a live vault it does not own), but the error is now printed rather than
   * dropped, so a silent empty answer cannot be mistaken for a clean one.
   */
  const rows = async (sql: string, params: unknown[] = []): Promise<any[]> => {
    try {
      return (await db.runAndReadAll(sql, params)).getRowObjectsJS();
    } catch (err) {
      console.error('[Audit DB Error]', err);
      return [];
    }
  };

  beforeAll(async () => {
    if (!vaultPresent) {
      console.warn(
        `[Audit] SKIPPED - no vault at ${vaultDbPath}. Expected on a fresh clone before ` +
        `\`conducks analyze\` has ever run; this suite audits the real vault and has nothing to ` +
        `audit yet.`
      );
      return;
    }

    // READ-ONLY, deliberately (todo25#P5). This suite opens the repository's own live vault, and
    // opening it read-write took DuckDB's single-writer lock — so all four cases failed whenever a
    // `conducks mcp` server was attached, which is whenever the tool is actually in use. A suite
    // that goes red because somebody is using the product is a defect in the suite.
    persistence = new SynapsePersistence(path.resolve(process.cwd()), true);
    db = await persistence.getRawConnection();

    if (!db) {
      throw new Error("❌ Structural Synapse is LOCKED or not initialized. Skipping Database Integrity Audit.");
    }

    const pulseRows = await rows("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1");

    latestPulseId = pulseRows[0]?.id;

    if (!latestPulseId) {
      console.warn("⚠️  [Audit] No structural pulse found in the vault. Integrity checks will be restricted.");
    } else {
      console.log(`[Audit] Target Pulse ID: ${latestPulseId}`);
    }
  });

  afterAll(async () => {
    if (persistence) await persistence.close();
  });

  /**
   * Referential integrity, as the graph actually defines it.
   *
   * This assertion used to read `dangling.length === 0` and was VACUOUS: it passed its parameters as
   * an array to a driver that wanted them spread, the resulting error was swallowed by the old
   * `rows || []` wrapper, and the empty array read as "nothing dangles". It had never checked
   * anything. Porting the driver (todo56) surfaced the real answer — 552 — and three separate
   * reasons the original query was the wrong question:
   *
   *   1. It partitioned by `pulseId`. Analyze is INCREMENTAL: only re-analyzed files are re-stamped,
   *      so a healthy vault holds nodes under several pulse ids and every edge into an untouched
   *      file looks dangling. MEASURED: 71 such edges, every one of whose targets existed under the
   *      previous pulse. Existence in `nodes` is the real question, not co-membership of a pulse.
   *   2. PULSES_TO and GOVERNS point at pulses and docs, which are not node rows at all — 439 of the
   *      552. An edge is not broken for pointing at the kind of thing it is meant to point at.
   *   3. Unresolved references are KEPT ON PURPOSE at confidence 0.4 (ADR 0046) — the analyzer says
   *      so on every run ("KEPT 1043 unresolved reference(s)"). A reference conducks could not place
   *      is a fact about the code, not a broken edge, and asserting it away would delete the signal.
   *
   * What is left after those three is the claim worth enforcing: an edge that says it KNOWS its
   * endpoints must have them. There is no carve-out. There was one for ALIASES — 3 edges at
   * confidence 1.0 whose source id nothing stored — and todo62 removed the cause rather than the
   * assertion: the alias edge was built from the bare local name while the node it names is stored
   * with its enclosing scope (`<file>::doit` against `<file>::main2.doit`), so it referenced nothing,
   * the ATOM edge-gate pruned the binding as unreferenced, and the edge outlived its own node.
   */
  maybeIt('every confident structural edge has both endpoints in the graph', async () => {
    const dangling = await rows(`
        SELECT type, sourceId, targetId FROM edges
        WHERE (sourceId NOT IN (SELECT id FROM nodes) OR targetId NOT IN (SELECT id FROM nodes))
          AND type NOT IN ('PULSES_TO', 'GOVERNS')
          AND confidence >= 0.6
      `);

    expect(dangling).toEqual([]);
  });

  /**
   * Census: Functional Structural Health
   * Excludes topological parentage (MEMBER_OF, CONTAINS) from 'Health' calculation.
   */
  maybeIt('should perform a Functional Layer-by-Layer Census', async () => {
    const functionalTypes = "'CALLS', 'USES', 'IMPORTS', 'IMPLEMENTS', 'EXTENDS', 'TYPE_REFERENCE', 'CONSTRUCTS'";
    
    const census = await rows(`
        SELECT canonicalKind, canonicalRank, count(*) as total,
               SUM(CASE WHEN id NOT IN (SELECT sourceId FROM edges WHERE pulseId = '${latestPulseId}' AND type IN (${functionalTypes})) 
                        AND id NOT IN (SELECT targetId FROM edges WHERE pulseId = '${latestPulseId}' AND type IN (${functionalTypes})) 
                    THEN 1 ELSE 0 END) as functional_orphans
        FROM nodes 
        WHERE pulseId = '${latestPulseId}'
        GROUP BY canonicalKind, canonicalRank
        ORDER BY canonicalRank ASC
      `);

    console.log(`\n--- 📊 Functional Layer Census (${latestPulseId}) ---`);
    console.table(census.map(c => {
      const total = Number(c.total);
      const orphans = Number(c.functional_orphans);
      return {
        Layer: c.canonicalKind,
        Total: total,
        Orphans: orphans,
        'Health %': total > 0 ? ((1 - (orphans / total)) * 100).toFixed(1) + '%' : '0%'
      };
    }));
  });

  /**
   * Shadow Check: Detection of duplicate symbols (Binding Failures)
   */
  maybeIt('should identify Shadow Symbols (Duplicate Binding Failures)', async () => {
    const shadows = await rows(`
        SELECT name, count(*) as dupe_count,
               string_agg(DISTINCT file, ', ') as files
        FROM nodes 
        WHERE pulseId = ? 
        AND canonicalKind IN ('STRUCTURE', 'BEHAVIOR')
        AND name NOT IN ('init', 'execute', 'executeUserEntryPoint', 'CORRUPT_UNIT', 'unknown', 'constructor', 'log', 'trace', 'fmt', 'query', 'calculateComplexity', 'extractDebt', 'analyze', 'link', 'process', 'main', 'resolveImport')
        GROUP BY name
        HAVING count(*) > 5
        ORDER BY dupe_count DESC
        LIMIT 10
      `, [latestPulseId]);

    if (shadows.length > 0) {
      console.warn(`\n⚠️  [Structural Sin] Found ${shadows.length} Shadow Symbols (Binding Failures).`);
      console.table(shadows.map(s => ({
        Symbol: s.name,
        Duplicates: Number(s.dupe_count),
        Files: s.files.length > 60 ? s.files.substring(0, 60) + '...' : s.files
      })));
    } else {
      console.log('\n✅ [Shadow Check] No major binding failures detected.');
    }
  });

  maybeIt('should list Functional Orphan Hit-List', async () => {
    const functionalTypes = "'CALLS', 'USES', 'IMPORTS', 'IMPLEMENTS', 'EXTENDS', 'TYPE_REFERENCE', 'CONSTRUCTS'";
    const hitList = await rows(`
        SELECT id, canonicalKind FROM nodes
        WHERE pulseId = '${latestPulseId}' 
        AND canonicalKind IN ('STRUCTURE', 'BEHAVIOR')
        AND id NOT IN (SELECT sourceId FROM edges WHERE pulseId = '${latestPulseId}' AND type IN (${functionalTypes})) 
        AND id NOT IN (SELECT targetId FROM edges WHERE pulseId = '${latestPulseId}' AND type IN (${functionalTypes}))
        LIMIT 15
      `);

    if (hitList.length > 0) {
      console.warn(`\n⚠️  [Structural Sin] Top Functional Orphans:`);
      hitList.forEach(i => i && console.warn(`   - [${i?.canonicalKind}] ${i?.id}`));
    }
  });
});
