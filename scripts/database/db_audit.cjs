const duckdb = require('duckdb');
const path = require('node:path');

async function runAudit() {
  const dbPath = path.resolve(".conducks/conducks-synapse.db");
  const db = new duckdb.Database(dbPath);
  const con = db.connect();

  console.log("--- 🛡️ Conducks Database Structural Audit 🛡️ ---");

  const query = (sql) => new Promise((res, rej) => con.all(sql, (err, result) => err ? rej(err) : res(result)));
  
  try {
    // 1. Core Counts & Latest Pulse
    const lastPulse = await query("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1");
    if (!lastPulse.length) throw new Error("No pulses found.");
    
    const counts = await query(`
        SELECT 
            (SELECT count(*) FROM nodes WHERE pulseId = '${lastPulse[0].id}') as nodes, 
            (SELECT count(*) FROM edges WHERE pulseId = '${lastPulse[0].id}') as edges, 
            (SELECT count(*) FROM pulses) as pulses
    `);
    console.log(`[Counts] Nodes: ${counts[0].nodes}, Edges: ${counts[0].edges}, Pulses: ${counts[0].pulses} (LATEST)`);

    // 2. Dangling Edges (Integrity)
    const dangling = await query(`
        SELECT * FROM edges 
        WHERE pulseId = '${lastPulse[0].id}'
        AND (sourceId NOT IN (SELECT id FROM nodes WHERE pulseId = '${lastPulse[0].id}') 
             OR targetId NOT IN (SELECT id FROM nodes WHERE pulseId = '${lastPulse[0].id}'))
        LIMIT 10
    `);
    console.log(`[Integrity] Dangling Edges: ${dangling.length > 0 ? "❌ FAIL (" + dangling.length + "+)" : "✅ PASS"}`);
    if (dangling.length > 0) console.log("Example:", dangling[0]);

    // 3. Parsing Failures (Quality)
    const failedParsing = await query("SELECT * FROM nodes WHERE name = 'Unknown' OR name = 'unknown' OR name IS NULL LIMIT 10");
    console.log(`[Quality] Parsing Artifacts: ${failedParsing.length > 0 ? "❌ FAIL (" + failedParsing.length + "+)" : "✅ PASS"}`);
    if (failedParsing.length > 0) console.log("Example:", failedParsing[0].id);

    // 4. Orphan Symbols (Strictly Structural)
    const orphans = await query(`
        SELECT * FROM nodes 
        WHERE pulseId = '${lastPulse[0].id}'
        AND kind NOT IN ('file', 'package', 'dependency', 'NAMESPACE') 
        AND id NOT IN (SELECT sourceId FROM edges WHERE pulseId = '${lastPulse[0].id}') 
        AND id NOT IN (SELECT targetId FROM edges WHERE pulseId = '${lastPulse[0].id}') 
        LIMIT 10
    `);
    console.log(`[Topology] Orphan Symbols: ${orphans.length > 0 ? "⚠️  WARN (" + orphans.length + "+)" : "✅ PASS"}`);
    if (orphans.length > 0) console.log("Example Orphan:", orphans[0].id);

    // 5. Schema Staleness (Pulse Drift)
    const pulseId = lastPulse[0].id;
    const drift = await query(`SELECT count(*) as count FROM edges WHERE pulseId != '${pulseId}'`);
    console.log(`[Temporal] Stale Edges (Drift): ${drift[0].count > 0 ? "⚠️  STALE (" + drift[0].count + ")" : "✅ PASS"}`);

    // 6. Relationship Distribution
    const dist = await query("SELECT type, count(*) as count FROM edges GROUP BY type ORDER BY count DESC");
    console.log("[Distribution] Edge types:");
    dist.forEach(d => console.log(`   - ${d.type}: ${d.count}`));

  } catch (err) {
    console.error("Audit Error:", err);
  } finally {
    db.close();
  }
}

runAudit();
