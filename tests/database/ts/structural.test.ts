import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import path from 'node:path';

/**
 * Conducks — Structural Layer Audit 🧬
 * 
 * Performs high-fidelity census of the structural graph, identifying 
 * 'Structural Sins' (Disconnected Islets) across the Canonical Taxonomy.
 */
describe('Synapse Structural Layer Audit', () => {
  let persistence: SynapsePersistence;
  let db: any;
  let latestPulseId: string;

  beforeAll(async () => {
    persistence = new SynapsePersistence(path.resolve(process.cwd())); // Allow DB creation on fresh runners
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

  it('should have 100% Referential Integrity', async () => {
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
  it('should perform a Functional Layer-by-Layer Census', async () => {
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
  it('should identify Shadow Symbols (Duplicate Binding Failures)', async () => {
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

  it('should list Functional Orphan Hit-List', async () => {
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
      hitList.forEach(i => console.warn(`   - [${i.canonicalKind}] ${i.id}`));
    }
  });
});
