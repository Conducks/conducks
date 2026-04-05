import { DuckDbPersistence } from '../../src/lib/core/persistence/persistence.js';
import path from 'node:path';

/**
 * Conducks — Structural Connectivity Diagnostic 🧬
 */
async function verify() {
  const persistence = new DuckDbPersistence();
  const db = await persistence.getRawConnection();
  if (!db) {
    console.error("Failed to establish raw structural connection.");
    return;
  }
  
  const pulseRows: any[] = await new Promise((res) => 
    db.all("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1", (err: any, rows: any[]) => res(rows || []))
  );
  const latestPulseId = pulseRows[0]?.id;
  
  console.log(`\n--- 🧬 Structural Resurrection Diagnostic (${latestPulseId}) ---`);

  // 1. Verify Shadow Elimination (FederatedLinker)
  const linkerNodes: any[] = await new Promise((res) => {
    db.all(`
      SELECT id, file, canonicalKind FROM nodes 
      WHERE pulseId = ? AND name = 'FederatedLinker'
    `, [latestPulseId], (err: any, rows: any[]) => res(rows || []));
  });

  console.log(`\n[Discovery] Found ${linkerNodes.length} nodes for 'FederatedLinker':`);
  linkerNodes.forEach(n => console.log(`  - [${n.canonicalKind}] ${n.id}`));

  if (linkerNodes.length === 1) {
    console.log('✅ PASS: Shadow symbols eliminated (Identity Isolation).');
  } else {
    console.warn('⚠️  FAIL: Shadow symbols still exist.');
  }

  // 2. Verify Functional Connectivity (Blast Radius)
  const targetId = linkerNodes.find(n => n.file.includes('linker-federated.ts'))?.id;
  if (targetId) {
    const edges: any[] = await new Promise((res) => {
      db.all(`
        SELECT sourceId, type FROM edges 
        WHERE targetId = ? AND pulseId = ?
        AND type IN ('CALLS', 'IMPORTS', 'CONSTRUCTS', 'TYPE_REFERENCE')
      `, [targetId, latestPulseId], (err: any, rows: any[]) => res(rows || []));
    });

    console.log(`\n[Connectivity] Found ${edges.length} incoming functional edges for the origin:`);
    edges.forEach(e => {
        const file = e.sourceId.split('::')[0].split('/').pop();
        console.log(`  <- [${e.type}] from ${file}`);
    });

    const uniqueSources = new Set(edges.map(e => e.sourceId.split('::')[0])).size;
    if (uniqueSources > 1) {
      console.log(`✅ PASS: Functional connectivity preserved across ${uniqueSources} files.`);
    } else {
      console.warn('⚠️  FAIL: Connection loss detected (Islet formation).');
    }
  }

  await persistence.close();
}

verify().catch(console.error);
