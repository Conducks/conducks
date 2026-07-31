import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
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

    const pulseRows: any[] = await new Promise((res) =>
      db.all("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1", (err: any, rows: any[]) => {
        if (err) console.error('[Audit DB Error]', err);
        res(rows || []);
      })
    );

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

  maybeIt('should have 100% Referential Integrity', async () => {
    const dangling: any[] = await new Promise((res) => {
      db.all(`
        SELECT * FROM edges 
        WHERE pulseId = ? 
        AND (sourceId NOT IN (SELECT id FROM nodes WHERE pulseId = ?) 
             OR targetId NOT IN (SELECT id FROM nodes WHERE pulseId = ?))
      `, [latestPulseId, latestPulseId, latestPulseId], (err: any, rows: any[]) => res(rows || []));
    });
    expect(dangling.length).toBe(0);
  });

  /**
   * Census: Functional Structural Health
   * Excludes topological parentage (MEMBER_OF, CONTAINS) from 'Health' calculation.
   */
  maybeIt('should perform a Functional Layer-by-Layer Census', async () => {
    const functionalTypes = "'CALLS', 'USES', 'IMPORTS', 'IMPLEMENTS', 'EXTENDS', 'TYPE_REFERENCE', 'CONSTRUCTS'";
    
    const census: any[] = await new Promise((res) => {
      db.all(`
        SELECT canonicalKind, canonicalRank, count(*) as total,
               SUM(CASE WHEN id NOT IN (SELECT sourceId FROM edges WHERE pulseId = '${latestPulseId}' AND type IN (${functionalTypes})) 
                        AND id NOT IN (SELECT targetId FROM edges WHERE pulseId = '${latestPulseId}' AND type IN (${functionalTypes})) 
                    THEN 1 ELSE 0 END) as functional_orphans
        FROM nodes 
        WHERE pulseId = '${latestPulseId}'
        GROUP BY canonicalKind, canonicalRank
        ORDER BY canonicalRank ASC
      `, (err: any, rows: any[]) => {
        if (err) console.error('[Census Error]', err);
        res(rows || []);
      });
    });

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
    const shadows: any[] = await new Promise((res) => {
      db.all(`
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
      `, [latestPulseId], (err: any, rows: any[]) => res(rows || []));
    });

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
    const hitList: any[] = await new Promise((res) => {
      db.all(`
        SELECT id, canonicalKind FROM nodes 
        WHERE pulseId = '${latestPulseId}' 
        AND canonicalKind IN ('STRUCTURE', 'BEHAVIOR')
        AND id NOT IN (SELECT sourceId FROM edges WHERE pulseId = '${latestPulseId}' AND type IN (${functionalTypes})) 
        AND id NOT IN (SELECT targetId FROM edges WHERE pulseId = '${latestPulseId}' AND type IN (${functionalTypes}))
        LIMIT 15
      `, (errSnapshot: any, rowsSnapshot: any[]) => res(rowsSnapshot || []));
    });

    if (hitList.length > 0) {
      console.warn(`\n⚠️  [Structural Sin] Top Functional Orphans:`);
      hitList.forEach(i => i && console.warn(`   - [${i?.canonicalKind}] ${i?.id}`));
    }
  });
});
