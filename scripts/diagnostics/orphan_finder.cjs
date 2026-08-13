const path = require('node:path');

async function findOrphans() {
  const dbPath = path.resolve(".conducks/conducks-synapse.db");
  const { openVault } = await import('../../tools/lib/vault.mjs');
  const db = await openVault(dbPath);
  const con = db;
  const query = (sql) => con.all(sql);
  
  try {
    const pulses = await query("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1");
    const latestPulseId = pulses[0].id;
    console.log(`📡 Pulst: ${latestPulseId}\n`);

    const layers = ['STRUCTURE', 'ECOSYSTEM', 'ATOM', 'INFRA'];

    for (const layer of layers) {
      console.log(`\n--- 🕵️ Auditing Layer: ${layer} ---`);
      
      // 1. Total Nodes
      const totalRes = await query(`SELECT count(*) as count FROM nodes WHERE pulseId = '${latestPulseId}' AND canonicalKind = '${layer}'`);
      console.log(`Total Nodes: ${totalRes[0].count}`);

      // 2. Orphans (No Parent Connection)
      // We look for nodes that are NOT targets of 'CONTAINS', 'MEMBER_OF', 'DEFINES', 'ACCESSES' etc from a higher level node.
      // But specifically, they should have NO parent.
      const orphanRes = await query(`
        SELECT n.id, n.name, n.kind 
        FROM nodes n
        LEFT JOIN edges e ON n.id = e.targetId AND e.pulseId = '${latestPulseId}'
        WHERE n.pulseId = '${latestPulseId}' 
        AND n.canonicalKind = '${layer}'
        AND e.sourceId IS NULL
        LIMIT 10
      `);
      
      const orphanCountRes = await query(`
        SELECT count(*) as count
        FROM nodes n
        LEFT JOIN edges e ON n.id = e.targetId AND e.pulseId = '${latestPulseId}'
        WHERE n.pulseId = '${latestPulseId}' 
        AND n.canonicalKind = '${layer}'
        AND e.sourceId IS NULL
      `);

      console.log(`Orphan Nodes (No Incoming Edges): ${orphanCountRes[0].count}`);
      if (orphanRes.length > 0) {
        console.table(orphanRes);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    db.close();
  }
}

findOrphans();
