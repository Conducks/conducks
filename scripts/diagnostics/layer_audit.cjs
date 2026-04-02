const duckdb = require('duckdb');
const path = require('node:path');

async function runLayerAudit() {
  const dbPath = path.resolve(".conducks/conducks-synapse.db");
  console.log(`🔍 Auditing Database at: ${dbPath}\n`);
  
  const db = new duckdb.Database(dbPath);
  const con = db.connect();

  const query = (sql) => new Promise((res, rej) => con.all(sql, (err, result) => err ? rej(err) : res(result)));
  
  try {
    // 1. Get Latest Pulse
    const pulses = await query("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1");
    if (!pulses.length) {
      console.log("❌ No pulses found in database.");
      return;
    }
    const latestPulseId = pulses[0].id;
    console.log(`📡 Latest Pulse: ${latestPulseId}\n`);

    // 2. Define Layers to Audit
    const layers = [
      { name: 'ECOSYSTEM', kind: 'ECOSYSTEM' },
      { name: 'NAMESPACE', kind: 'NAMESPACE' },
      { name: 'UNIT', kind: 'UNIT' },
      { name: 'INFRA', kind: 'INFRA' },
      { name: 'STRUCTURE', kind: 'STRUCTURE' },
      { name: 'BEHAVIOR', kind: 'BEHAVIOR' },
      { name: 'ATOM', kind: 'ATOM' },
      { name: 'DATA', kind: 'DATA' }
    ];

    console.log("--- 📊 Layer Distribution & Integrity ---");
    console.log(`${"LAYER".padEnd(15)} | ${"TOTAL".padEnd(8)} | ${"ORPHANS".padEnd(8)} | ${"STATUS"}`);
    console.log("-".repeat(50));

    for (const layer of layers) {
      // Total nodes in this layer for latest pulse
      const totalRes = await query(`
        SELECT count(*) as count 
        FROM nodes 
        WHERE pulseId = '${latestPulseId}' AND canonicalKind = '${layer.kind}'
      `);
      const total = totalRes[0].count;

      // Orphan nodes in this layer (no incoming/outgoing edges in latest pulse)
      // Note: We exclude 'UNIT' and 'NAMESPACE' from "orphans" if they are just files/folders (usually they have incoming edges from parent units or packages)
      // but let's check general connectivity.
      const orphanRes = await query(`
        SELECT count(*) as count 
        FROM nodes n
        WHERE n.pulseId = '${latestPulseId}' 
        AND n.canonicalKind = '${layer.kind}'
        AND n.id NOT IN (SELECT sourceId FROM edges WHERE pulseId = '${latestPulseId}')
        AND n.id NOT IN (SELECT targetId FROM edges WHERE pulseId = '${latestPulseId}')
      `);
      const orphans = orphanRes[0].count;

      let status = "✅ OK";
      if (total === 0) status = "⚪ EMPTY";
      else if (orphans > 0) status = `⚠️  ${orphans} ORPHANS`;

      console.log(`${layer.name.padEnd(15)} | ${total.toString().padEnd(8)} | ${orphans.toString().padEnd(8)} | ${status}`);
    }

    // 3. Specific Check for "Infrastructure" and "Atoms" as requested
    console.log("\n--- 🕵️ Specific Deep-Dive ---");
    
    // Check if INFRA nodes exist at all in the whole DB
    const globalInfra = await query("SELECT count(*) as count FROM nodes WHERE canonicalKind = 'INFRA'");
    console.log(`Global INFRA nodes (any pulse): ${globalInfra[0].count}`);

    // Check if ATOM nodes exist at all in the whole DB
    const globalAtoms = await query("SELECT count(*) as count FROM nodes WHERE canonicalKind = 'ATOM'");
    console.log(`Global ATOM nodes (any pulse): ${globalAtoms[0].count}`);

    // Sample Orphans for STRUCTURE and ECOSYSTEM
    const structureOrphans = await query(`
        SELECT id, name FROM nodes 
        WHERE pulseId = '${latestPulseId}' AND canonicalKind = 'STRUCTURE'
        AND id NOT IN (SELECT sourceId FROM edges WHERE pulseId = '${latestPulseId}')
        AND id NOT IN (SELECT targetId FROM edges WHERE pulseId = '${latestPulseId}')
        LIMIT 5
    `);
    if (structureOrphans.length > 0) {
        console.log("\nSample STRUCTURE Orphans:");
        structureOrphans.forEach(o => console.log(` - ${o.name} (${o.id})`));
    }

    const ecosystemOrphans = await query(`
        SELECT id, name FROM nodes 
        WHERE pulseId = '${latestPulseId}' AND canonicalKind = 'ECOSYSTEM'
        AND id NOT IN (SELECT sourceId FROM edges WHERE pulseId = '${latestPulseId}')
        AND id NOT IN (SELECT targetId FROM edges WHERE pulseId = '${latestPulseId}')
        LIMIT 5
    `);
    if (ecosystemOrphans.length > 0) {
        console.log("\nSample ECOSYSTEM Orphans:");
        ecosystemOrphans.forEach(o => console.log(` - ${o.name} (${o.id})`));
    }

  } catch (err) {
    console.error("Audit Error:", err);
  } finally {
    db.close();
  }
}

runLayerAudit();
